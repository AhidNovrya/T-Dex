import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {createAPI} from '../server/api.mjs';
import {hashPassword} from '../server/security.mjs';
const db=new DatabaseSync(':memory:');
const DB={prepare(sql){return {bind(...args){return {async first(){return db.prepare(sql).get(...args)||null;},async run(){const r=db.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}};}};}};}};
const files=new Map(),BUCKET={async put(k,v){files.set(k,v);},async get(k){return files.has(k)?{body:files.get(k)}:null;},async delete(k){files.delete(k);}};
let api,env,cookie;
async function call(path,body,{auth=false,origin='https://tdex.test',ip='test',headers={}}={}){
 const req=new Request('https://tdex.test'+path,{method:body?'POST':'GET',headers:{'X-TDex-Request':'1','cf-connecting-ip':ip,origin,...(auth?{cookie}:{}),...(!(body instanceof FormData)?{'Content-Type':'application/json'}:{}),...headers},...(body?{body:body instanceof FormData?body:JSON.stringify(body)}:{})});
 const response=await api(req,env);const data=await response.clone().json().catch(()=>null);return {response,data};
}
before(async()=>{db.exec(await readFile('drizzle/0000_pilot.sql','utf8'));api=createAPI(JSON.parse(await readFile('peta_telkom.geojson','utf8')));env={DB,BUCKET,ADMIN_USERNAME:'petugas',ADMIN_PASSWORD_HASH:await hashPassword('test-password-unique')};});
after(()=>db.close());
test('pilot inventory uses real geometry and makes no unsupported verification claims',async()=>{
 const {data}=await call('/api/campus');assert.equal(data.buildings.length,4);assert.equal(data.routes.length,0);assert.equal(data.buildings[0].verifiedAt,null);assert.equal(data.buildings[0].facilities[0].availability,'reported');assert.equal(data.buildings[2].name,'Asrama Putra Gedung 1');assert.ok(data.buildings.every(b=>b.position.every(Number.isFinite)));
});
test('staff endpoints and photo evidence require server sessions',async()=>{assert.equal((await call('/api/admin')).response.status,401);assert.equal((await call('/api/photos/anything')).response.status,401);});
test('login rejects invalid credentials; issues secure HttpOnly cookie for valid credentials',async()=>{
 assert.equal((await call('/api/login',{username:'petugas',password:'incorrect'})).response.status,401);
 const {response}=await call('/api/login',{username:'petugas',password:'test-password-unique'});assert.equal(response.status,200);const c=response.headers.get('set-cookie');assert.match(c,/HttpOnly/);assert.match(c,/Secure/);assert.match(c,/SameSite=Strict/);cookie=c.split(';')[0];
});
test('cross-origin mutations and missing CSRF header are rejected',async()=>{
 assert.equal((await call('/api/logout',{}, {auth:true,origin:'https://evil.example'})).response.status,403);
 assert.equal((await call('/api/logout',{}, {auth:true,headers:{'X-TDex-Request':''}})).response.status,403);
});
function form({description='Ramp tertutup kendaraan.',buildingId='tult',file,filename='evidence.png'}={}){const f=new FormData();f.set('buildingId',buildingId);f.set('description',description);f.set('photo',file||new Blob([Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64'))],{type:'image/png'}),filename);return f;}
let firstReport;
test('reports validate required fields, real image type, size and pilot location',async()=>{
 for(const invalid of [form({description:''}),form({buildingId:'outside'}),form({file:new Blob(['not a png'],{type:'image/png'})}),form({file:new Blob([new Uint8Array(5*1024*1024+1)],{type:'image/png'})})])assert.equal((await call('/api/reports',invalid,{ip:crypto.randomUUID()})).response.status,400);
});
test('valid reports persist as pending, keep public conditions unchanged, and hide evidence from public JSON',async()=>{
 const before=(await call('/api/campus')).data;
 const {response,data}=await call('/api/reports',form());assert.equal(response.status,201);firstReport=data.id;assert.equal(data.status,'pending');const after=(await call('/api/campus')).data;assert.deepEqual(before.buildings,after.buildings);assert.ok(!JSON.stringify(after).includes('Ramp tertutup kendaraan'));
 const admin=(await call('/api/admin',null,{auth:true})).data;assert.equal(admin.reports[0].id,data.id);assert.equal((await call(admin.reports[0].photoUrl,null,{auth:true})).response.status,200);
});
test('approval requires target and updates report, condition and audit atomically, preserving verification date',async()=>{
 const s=(await call('/api/admin',null,{auth:true})).data;
 const decision={reportId:firstReport,decision:'approved',condition:'blocked',version:s.version};
 assert.equal((await call('/api/admin/decision',decision,{auth:true})).response.status,400);
 assert.equal((await call('/api/admin/decision',{...decision,targetId:'gku-lift'},{auth:true})).response.status,400);
 assert.equal((await call('/api/admin/decision',{...decision,targetId:'tult-ramp'},{auth:true})).response.status,200);
 const next=(await call('/api/admin',null,{auth:true})).data;assert.equal(next.reports[0].status,'approved');assert.equal(next.reports[0].decidedBy,'petugas');assert.equal(next.buildings[0].facilities[0].condition,'blocked');assert.equal(next.buildings[0].verifiedAt,null);assert.equal(next.history[0].before,'unknown');assert.equal(next.history[0].after,'blocked');
 assert.equal((await call('/api/admin/decision',{...decision,targetId:'tult-ramp'},{auth:true})).response.status,409);
});
test('rejection requires reason and never changes public target conditions',async()=>{
 const created=(await call('/api/reports',form())).data;
 const s=(await call('/api/admin',null,{auth:true})).data;
 const decision={reportId:created.id,decision:'rejected',version:s.version};
 assert.equal((await call('/api/admin/decision',decision,{auth:true})).response.status,400);
 assert.equal((await call('/api/admin/decision',{...decision,reason:'Lokasi pada foto berbeda.'},{auth:true})).response.status,200);
 const next=(await call('/api/admin',null,{auth:true})).data;assert.deepEqual(next.buildings,s.buildings);assert.equal(next.reports[0].rejectionReason,'Lokasi pada foto berbeda.');
});
let mainRoute,alternative;
test('survey editing validates dates, geometry, directional pairs and alternative route matching',async()=>{
 let s=(await call('/api/admin',null,{auth:true})).data;
 const template={name:'Jalur utama',from:'tult',to:'gku',surveyedAt:'2026-11-08',steps:['Keluar melalui akses yang diperiksa.','Ikuti jalur hasil survei hingga pintu tujuan.'],geometry:[[-6.9689,107.6281],[-6.9729,107.6296]],facilityIds:[],status:'clear'};
 assert.equal((await call('/api/admin/route',{...template,version:s.version,to:'tult'},{auth:true})).response.status,400);
 assert.equal((await call('/api/admin/route',{...template,version:s.version,geometry:[[0,0],[1,1]]},{auth:true})).response.status,400);
 mainRoute=(await call('/api/admin/route',{...template,version:s.version},{auth:true})).data.id;
 s=(await call('/api/admin',null,{auth:true})).data;
 alternative=(await call('/api/admin/route',{...template,name:'Alternatif terverifikasi',version:s.version},{auth:true})).data.id;
 s=(await call('/api/admin',null,{auth:true})).data;
 assert.equal((await call('/api/admin/route',{...template,id:mainRoute,status:'blocked',alternativeId:alternative,version:s.version},{auth:true})).response.status,200);
 const routes=(await call('/api/campus')).data.routes;assert.equal(routes.find(r=>r.id===mainRoute).effectiveStatus,'blocked');assert.equal(routes.find(r=>r.id===mainRoute).alternativeId,alternative);assert.equal(routes.filter(r=>r.from==='gku'&&r.to==='tult').length,0);
});
test('facility inspection and blocked dependencies affect route status without changing survey dates',async()=>{
 let s=(await call('/api/admin',null,{auth:true})).data;const b=s.buildings[0];b.facilities[0]={...b.facilities[0],availability:'yes',condition:'clear',verifiedAt:'2026-11-08'};
 assert.equal((await call('/api/admin/building',{...b,version:s.version},{auth:true})).response.status,200);
 s=(await call('/api/admin',null,{auth:true})).data;const route=s.routes.find(r=>r.id===alternative);assert.equal((await call('/api/admin/route',{...route,facilityIds:['tult-ramp'],version:s.version},{auth:true})).response.status,200);
 s=(await call('/api/admin',null,{auth:true})).data;const updated=s.buildings[0];updated.facilities[0].condition='blocked';assert.equal((await call('/api/admin/building',{...updated,version:s.version},{auth:true})).response.status,200);
 const publicRoute=(await call('/api/campus')).data.routes.find(r=>r.id===alternative);assert.equal(publicRoute.effectiveStatus,'blocked');assert.equal(publicRoute.surveyedAt,'2026-11-08');
});
test('stale updates are rejected and logout revokes staff access',async()=>{
 const s=(await call('/api/admin',null,{auth:true})).data;assert.equal((await call('/api/admin/building',{...s.buildings[0],version:s.version-1},{auth:true})).response.status,409);
 assert.equal((await call('/api/logout',{}, {auth:true})).response.status,200);assert.equal((await call('/api/admin',null,{auth:true})).response.status,401);
});
test('login rate limit blocks repeated attempts',async()=>{let r;for(let i=0;i<9;i++)r=await call('/api/login',{username:'x',password:'wrong'},{ip:'rate-test'});assert.equal(r.response.status,429);});
