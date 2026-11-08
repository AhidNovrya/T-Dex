import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {readFile,writeFile,mkdir,unlink} from 'node:fs/promises';
import {resolve,join,extname} from 'node:path';
import {Readable} from 'node:stream';
import {createAPI} from './api.mjs';
const root=resolve(import.meta.dirname,'..'),dataRoot=process.env.DATA_DIR||join(root,'.data');
await mkdir(join(dataRoot,'photos'),{recursive:true});
const sqlite=new DatabaseSync(join(dataRoot,'tdex.sqlite'));
sqlite.exec(await readFile(join(root,'drizzle/0000_pilot.sql'),'utf8').then(s=>s.replaceAll('--> statement-breakpoint','').replaceAll('CREATE TABLE ','CREATE TABLE IF NOT EXISTS ')));
const DB={prepare(sql){return {bind(...args){return {async first(){return sqlite.prepare(sql).get(...args)||null;},async run(){const r=sqlite.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}};}};}};}};
const BUCKET={async put(key,bytes){await writeFile(join(dataRoot,'photos',key.split('/').at(-1)),bytes);},async get(key){try{return {body:await readFile(join(dataRoot,'photos',key.split('/').at(-1)))}}catch{return null;}},async delete(key){await unlink(join(dataRoot,'photos',key.split('/').at(-1))).catch(()=>{});}};
const api=createAPI(JSON.parse(await readFile(join(root,'peta_telkom.geojson'),'utf8')));
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.woff2':'font/woff2','.ttf':'font/ttf','.geojson':'application/geo+json'};
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,`http://${req.headers.host}`);let response;
  if(url.pathname.startsWith('/api/')){
   const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>6*1024*1024){res.writeHead(413,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Ukuran permintaan terlalu besar.'}));return;}chunks.push(chunk);}
   const headers=new Headers(req.headers);headers.set('x-local-ip',req.socket.remoteAddress);
   const request=new Request(url,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
   response=await api(request,{DB,BUCKET,ADMIN_USERNAME:process.env.ADMIN_USERNAME,ADMIN_PASSWORD_HASH:process.env.ADMIN_PASSWORD_HASH});
  }else{
   const path=decodeURIComponent(url.pathname),file=path==='/'?'index.html':path.slice(1);
   if(!['index.html','app.js','campus-data.js','styles.css','peta_telkom.geojson'].includes(file)&&!/^assets\/[a-zA-Z0-9_./-]+$/.test(file))throw Error('Not found');
   const absolute=resolve(root,file);if(!absolute.startsWith(root+'/')||file.includes('..'))throw Error('Not found');
   response=new Response(await readFile(absolute),{headers:{'Content-Type':mime[extname(file)]||'application/octet-stream'}});
  }
  response.headers.set('X-Content-Type-Options','nosniff');response.headers.set('Referrer-Policy','strict-origin-when-cross-origin');
  res.writeHead(response.status,Object.fromEntries(response.headers));if(response.body)Readable.fromWeb(response.body).pipe(res);else res.end();
 }catch{res.writeHead(404);res.end('Tidak ditemukan.');}
});
const port=Number(process.env.PORT??3000);
if(!Number.isInteger(port)||port<0||port>65535){
 console.error('PORT tidak valid. Gunakan angka 1–65535 pada .env.');
 sqlite.close();
 process.exitCode=1;
}else{
 server.on('error',error=>{
  console.error(error.code==='EADDRINUSE'
   ? `Port ${port} sedang dipakai. Ubah PORT di .env, misalnya PORT=3001, lalu jalankan lagi.`
   : `Server lokal gagal dimulai: ${error.message}`);
  sqlite.close();process.exitCode=1;
 });
 server.listen(port,'127.0.0.1',()=>console.log(`T-Dex ready: http://localhost:${server.address().port}`));
 const shutdown=()=>{server.close(()=>{sqlite.close();});server.closeAllConnections();};
 process.once('SIGINT',shutdown);process.once('SIGTERM',shutdown);
}
