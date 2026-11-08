import {seed} from './seed.mjs';
import {digest,random,verifyPassword,imageType} from './security.mjs';
const statusCodes=['clear','blocked','unknown'];
const json=(data,status=200,headers={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store',...headers}});
const fail=(status,message,field)=>{throw Object.assign(new Error(message),{status,field});};
const text=(v,max=2000)=>typeof v==='string'?v.trim().slice(0,max):'';
const validDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v&&v<=new Date().toISOString().slice(0,10);
function checkPoint(p){return Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&p[0]>=-6.99&&p[0]<=-6.95&&p[1]>=107.61&&p[1]<=107.65;}
export function routeStatus(route,state){
 const dependencies=route.facilityIds.map(id=>state.buildings.flatMap(b=>b.facilities).find(f=>f.id===id));
 if(route.status==='blocked'||dependencies.some(f=>f?.condition==='blocked'))return 'blocked';
 if(route.status!=='clear'||!route.surveyedAt||dependencies.some(f=>!f||f.condition!=='clear'||f.availability!=='yes'||!f.verifiedAt))return 'unknown';
 return 'clear';
}
export function createAPI(geojson){
 async function load(env){
  await env.DB.prepare('INSERT OR IGNORE INTO app_state (id,version,data) VALUES (?,0,?)').bind('pilot',JSON.stringify(seed(geojson))).run();
  const row=await env.DB.prepare('SELECT version,data FROM app_state WHERE id=?').bind('pilot').first();
  return {version:row.version,state:JSON.parse(row.data)};
 }
 async function save(env,snapshot){
  const r=await env.DB.prepare('UPDATE app_state SET data=?,version=version+1 WHERE id=? AND version=?').bind(JSON.stringify(snapshot.state),'pilot',snapshot.version).run();
  if(!r.meta.changes)fail(409,'Data berubah sejak dibuka. Muat ulang sebelum menyimpan.');
 }
 async function limit(env,req,action,max){
  const ip=req.headers.get('cf-connecting-ip')||req.headers.get('x-local-ip')||'unknown';
  const now=Date.now(),window=action==='login'?900000:3600000,id=await digest(`${action}:${ip}:${Math.floor(now/window)}`);
  const row=await env.DB.prepare('INSERT INTO rate_limits (id,count,expires) VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1 RETURNING count').bind(id,now+window).first();
  if(row.count>max)fail(429,'Terlalu banyak percobaan. Silakan coba lagi nanti.');
  await env.DB.prepare('DELETE FROM rate_limits WHERE expires<?').bind(now).run();
 }
 async function session(env,req){
  const token=req.headers.get('cookie')?.match(/(?:^|;\s*)tdex_session=([a-f0-9]{64})(?:;|$)/)?.[1];
  if(!token)return null;
  return await env.DB.prepare('SELECT username FROM sessions WHERE token=? AND expires>?').bind(await digest(token),Date.now()).first();
 }
 async function body(req){try{return await req.json();}catch{fail(400,'Data permintaan tidak valid.');}}
 function publicData(snapshot){return {version:snapshot.version,buildings:snapshot.state.buildings,routes:snapshot.state.routes.map(r=>({...r,effectiveStatus:routeStatus(r,snapshot.state)}))};}
 return async function api(req,env){
  const url=new URL(req.url),path=url.pathname,method=req.method;
  try{
   if(Number(req.headers.get('content-length')||0)>6*1024*1024)fail(413,'Ukuran permintaan terlalu besar.');
   if(!['GET','HEAD'].includes(method)){
    const origin=req.headers.get('origin');if(origin&&origin!==url.origin)fail(403,'Asal permintaan tidak diizinkan.');
    if(req.headers.get('x-tdex-request')!=='1')fail(403,'Permintaan tidak valid.');
    if(req.body){const reader=req.body.getReader(),parts=[];let size=0;while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>6*1024*1024){await reader.cancel();fail(413,'Ukuran permintaan terlalu besar.');}parts.push(value);}const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}req=new Request(req,{body:bytes});}
   }
   if(path==='/api/campus'&&method==='GET')return json(publicData(await load(env)));
   if(path==='/api/session'&&method==='GET')return json({user:await session(env,req),configured:!!env.ADMIN_PASSWORD_HASH});
   if(path==='/api/login'&&method==='POST'){
    await limit(env,req,'login',8);const b=await body(req);
    if(!env.ADMIN_PASSWORD_HASH)fail(503,'Akun petugas belum diaktifkan. Hubungi pengelola T-Dex.');
    if(!b.username||!b.password)fail(400,'Nama pengguna dan kata sandi wajib diisi.');
    const ok=await verifyPassword(String(b.password).slice(0,256),env.ADMIN_PASSWORD_HASH);
    if(b.username!==env.ADMIN_USERNAME||!ok)fail(401,'Nama pengguna atau kata sandi salah.');
    const token=random();await env.DB.prepare('DELETE FROM sessions WHERE expires<?').bind(Date.now()).run();
    await env.DB.prepare('INSERT INTO sessions (token,username,expires) VALUES (?,?,?)').bind(await digest(token),env.ADMIN_USERNAME,Date.now()+28800000).run();
    return json({user:{username:env.ADMIN_USERNAME}},200,{'Set-Cookie':`tdex_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${url.protocol==='https:'?'; Secure':''}`});
   }
   if(path==='/api/logout'&&method==='POST'){
    const token=req.headers.get('cookie')?.match(/tdex_session=([a-f0-9]{64})/)?.[1];
    if(token)await env.DB.prepare('DELETE FROM sessions WHERE token=?').bind(await digest(token)).run();
    return json({ok:true},200,{'Set-Cookie':'tdex_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});
   }
   if(path==='/api/reports'&&method==='POST'){
    await limit(env,req,'report',10);
    let form;try{form=await req.formData();}catch{fail(400,'Form laporan tidak valid.');}
    const buildingId=text(form.get('buildingId'),80),description=text(form.get('description'),2000),photo=form.get('photo');
    const snapshot=await load(env),building=snapshot.state.buildings.find(b=>b.id===buildingId);
    if(!building)fail(400,'Pilih lokasi dalam area pilot.','buildingId');
    if(!description)fail(400,'Deskripsi hambatan wajib diisi.','description');
    if(!photo||typeof photo==='string'||photo.size===0)fail(400,'Tambahkan satu foto hambatan.','photo');
    if(photo.size>5*1024*1024)fail(400,'Foto maksimal 5 MB.','photo');
    const bytes=new Uint8Array(await photo.arrayBuffer()),type=imageType(bytes);
    if(!type||photo.type!==type)fail(400,'Foto harus berupa file JPEG atau PNG yang valid.','photo');
    const id=crypto.randomUUID(),key=`reports/${id}`;
    await env.BUCKET.put(key,bytes,{httpMetadata:{contentType:type}});
    snapshot.state.reports.unshift({id,buildingId,description,photoKey:key,photoType:type,status:'pending',createdAt:new Date().toISOString(),decidedAt:null,decidedBy:null,rejectionReason:null});
    try{await save(env,snapshot);}catch(e){await env.BUCKET.delete(key);throw e;}
    return json({id,status:'pending',message:'Laporan diterima. Menunggu verifikasi petugas.'},201);
   }
   const user=await session(env,req);if(!user)fail(401,'Sesi berakhir. Silakan masuk sebagai petugas.');
   if(path==='/api/admin'&&method==='GET'){
    const s=await load(env);return json({...publicData(s),reports:s.state.reports.map(({photoKey,...r})=>({...r,photoUrl:`/api/photos/${r.id}`})),history:s.state.history,user});
   }
   if(path.startsWith('/api/photos/')&&method==='GET'){
    const {state}=await load(env),report=state.reports.find(r=>r.id===path.split('/').pop());if(!report)fail(404,'Foto tidak ditemukan.');
    const object=await env.BUCKET.get(report.photoKey);if(!object)fail(404,'Foto tidak ditemukan.');
    return new Response(object.body,{headers:{'Content-Type':report.photoType,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'"}});
   }
   if(path==='/api/admin/decision'&&method==='POST'){
    const b=await body(req),s=await load(env);if(b.version!==s.version)fail(409,'Data berubah sejak dibuka. Muat ulang sebelum memutuskan.');
    const report=s.state.reports.find(r=>r.id===b.reportId);if(!report)fail(404,'Laporan tidak ditemukan.');if(report.status!=='pending')fail(409,'Laporan sudah diputuskan. Muat ulang.');
    if(!['approved','rejected'].includes(b.decision))fail(400,'Keputusan tidak valid.');
    const now=new Date().toISOString();
    if(b.decision==='rejected'){
     if(!text(b.reason))fail(400,'Alasan penolakan wajib diisi.','reason');report.rejectionReason=text(b.reason);
    }else{
     const building=s.state.buildings.find(x=>x.id===report.buildingId);
     const target=building.facilities.find(f=>f.id===b.targetId)||s.state.routes.find(r=>r.id===b.targetId&&(r.from===building.id||r.to===building.id));
     if(!target)fail(400,'Pilih fasilitas atau jalur yang terkait gedung laporan.','targetId');
     if(!statusCodes.includes(b.condition))fail(400,'Kondisi target tidak valid.','condition');
     const prop=target.type?'condition':'status',before=target[prop];target[prop]=b.condition;target.updatedAt=now;
     report.targetId=target.id;
     s.state.history.unshift({id:crypto.randomUUID(),targetId:target.id,before,after:b.condition,at:now,by:user.username,source:report.id});
    }
    report.status=b.decision;report.decidedAt=now;report.decidedBy=user.username;
    await save(env,s);return json({ok:true});
   }
   if(path==='/api/admin/building'&&method==='POST'){
    const b=await body(req),s=await load(env);if(b.version!==s.version)fail(409,'Data berubah. Muat ulang sebelum menyimpan.');
    let target=s.state.buildings.find(x=>x.id===b.id);const isNew=!target;
    if(!text(b.name,120)||!checkPoint(b.position))fail(400,'Nama gedung dan titik dalam area kampus wajib diisi.');
    if(b.verifiedAt&&!validDate(b.verifiedAt))fail(400,'Tanggal verifikasi tidak valid.');
    if(b.photo&&!/^\/assets\/buildings\/[a-z-]+\.webp$/.test(b.photo))fail(400,'Foto gedung tidak valid.');
    if(!Array.isArray(b.facilities)||b.facilities.length!==4)fail(400,'Empat jenis fasilitas wajib dilengkapi.');
    const types=['ramp','lift','toilet','pemandu'];
    if(new Set(b.facilities.map(f=>f.type)).size!==4||b.facilities.some(f=>!types.includes(f.type)))fail(400,'Jenis fasilitas tidak valid.');
    const id=target?.id||crypto.randomUUID();
    const facilities=b.facilities.map(f=>{
     if(!['yes','no','unknown','reported'].includes(f.availability)||!statusCodes.includes(f.condition)||f.verifiedAt&&!validDate(f.verifiedAt))fail(400,'Data fasilitas tidak valid.');
     if(['yes','no'].includes(f.availability)&&!validDate(f.verifiedAt))fail(400,'Tanggal pemeriksaan wajib untuk fasilitas terverifikasi.');
     const old=target?.facilities.find(o=>o.type===f.type),now=new Date().toISOString();
     if(old&&(old.condition!==f.condition||old.availability!==f.availability))s.state.history.unshift({id:crypto.randomUUID(),targetId:old.id,before:`${old.availability}/${old.condition}`,after:`${f.availability}/${f.condition}`,at:now,by:user.username,source:'Pemeriksaan petugas'});
     return {id:old?.id||`${id}-${f.type}`,type:f.type,label:({ramp:'Ramp',lift:'Lift',toilet:'Toilet aksesibel',pemandu:'Jalur pemandu'})[f.type],availability:f.availability,condition:f.condition,verifiedAt:f.verifiedAt||null,location:text(f.location,300),note:text(f.note,500),updatedAt:now};
    });
    const updated={id,name:text(b.name,120),fullName:text(b.fullName,200),category:text(b.category,80),photo:b.photo||'',position:b.position,geoId:target?.geoId||null,history:text(b.history,600),locationNote:text(b.locationNote,400),verifiedAt:b.verifiedAt||null,facilities};
    if(isNew)s.state.buildings.push(updated);else Object.assign(target,updated);
    await save(env,s);return json({ok:true,id});
   }
   if(path==='/api/admin/route'&&method==='POST'){
    const b=await body(req),s=await load(env);if(b.version!==s.version)fail(409,'Data berubah. Muat ulang sebelum menyimpan.');
    if(b.from===b.to||![b.from,b.to].every(id=>s.state.buildings.some(x=>x.id===id)))fail(400,'Asal dan tujuan harus berupa dua gedung berbeda.');
    if(!validDate(b.surveyedAt))fail(400,'Tanggal survei yang valid wajib diisi.');
    if(!Array.isArray(b.steps)||!b.steps.length||b.steps.length>30||b.steps.some(t=>!text(t,500)))fail(400,'Lengkapi langkah jalur.');
    if(!Array.isArray(b.geometry)||b.geometry.length<2||b.geometry.length>200||!b.geometry.every(checkPoint))fail(400,'Garis jalur harus memiliki 2–200 titik dalam kampus.');
    if(!statusCodes.includes(b.status))fail(400,'Status jalur tidak valid.');
    if(!Array.isArray(b.facilityIds)||b.facilityIds.some(id=>!s.state.buildings.some(x=>x.facilities.some(f=>f.id===id))))fail(400,'Relasi fasilitas tidak valid.');
    const target=s.state.routes.find(x=>x.id===b.id),id=target?.id||crypto.randomUUID();
    if(b.alternativeId){const alt=s.state.routes.find(r=>r.id===b.alternativeId);if(!alt||alt.id===id||alt.from!==b.from||alt.to!==b.to||routeStatus(alt,s.state)!=='clear')fail(400,'Alternatif harus dapat dilalui untuk pasangan asal–tujuan yang sama.');}
    const now=new Date().toISOString(),updated={id,name:text(b.name,120)||'Jalur survei',from:b.from,to:b.to,steps:b.steps.map(t=>text(t,500)),geometry:b.geometry,surveyedAt:b.surveyedAt,status:b.status,facilityIds:b.facilityIds,alternativeId:b.alternativeId||null,updatedAt:now};
    s.state.history.unshift({id:crypto.randomUUID(),targetId:id,before:target?.status||'Baru',after:b.status,at:now,by:user.username,source:'Survei jalur'});
    if(target)Object.assign(target,updated);else s.state.routes.push(updated);
    await save(env,s);return json({ok:true,id});
   }
   fail(404,'Halaman tidak ditemukan.');
  }catch(e){if(!e.status)console.error('T-Dex API:',e.message);return json({error:e.status?e.message:'Server belum dapat memproses permintaan. Silakan coba lagi.',field:e.field},e.status||500);}
 };
}
