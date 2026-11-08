import {readFile,writeFile,mkdir,readdir,stat} from 'node:fs/promises';
import {enableBackend} from '../server/web-files.mjs';
const files=['index.html','styles.css','app.js','campus-data.js','public-campus.js','peta_telkom.geojson'];
async function walk(dir){for(const name of await readdir(dir)){const path=`${dir}/${name}`;if((await stat(path)).isDirectory())await walk(path);else if(!path.endsWith('.png'))files.push(path);}}
await walk('assets');
const types={html:'text/html; charset=utf-8',css:'text/css; charset=utf-8',js:'application/javascript; charset=utf-8',svg:'image/svg+xml',webp:'image/webp',woff2:'font/woff2',ttf:'font/ttf',geojson:'application/geo+json'};
const assets={};for(const file of files){const bytes=file==='index.html'?Buffer.from(enableBackend(await readFile(file,'utf8'))):await readFile(file);assets['/'+file]=[types[file.split('.').at(-1)]||'text/plain',bytes.toString('base64')];}
const api=(await readFile('server/api.mjs','utf8')).replace(/^import .*;\n/gm,'').replace('export function createAPI','function createAPI').replace('export function routeStatus','function routeStatus');
const seed=(await readFile('public-campus.js','utf8')).replaceAll('export ','');
const security=(await readFile('server/security.mjs','utf8')).replaceAll('export ','');
const worker=`${seed}\n${security}\n${api}\nconst assets=${JSON.stringify(assets)};\nconst geojson=${await readFile('peta_telkom.geojson','utf8')};\nconst api=createAPI(geojson);\nexport default {async fetch(req,env){const u=new URL(req.url);if(u.pathname.startsWith('/api/'))return api(req,env);if(!['GET','HEAD'].includes(req.method))return new Response('Method not allowed',{status:405});const item=assets[u.pathname==='/'?'/index.html':u.pathname];if(!item)return new Response('Tidak ditemukan.',{status:404});return new Response(req.method==='HEAD'?null:Uint8Array.from(atob(item[1]),c=>c.charCodeAt(0)),{headers:{'Content-Type':item[0],'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Cache-Control':'public, max-age=300'}});}};`;
await mkdir('dist/server',{recursive:true});await mkdir('dist/.openai',{recursive:true});
const hosting = await readFile('.openai/hosting.json').catch(error=>{
 if(error.code!=='ENOENT')throw error;
 return readFile('.openai/hosting.example.json');
});
await writeFile('dist/server/index.js',worker);await writeFile('dist/.openai/hosting.json',hosting);
console.log(`Built Worker with ${files.length} local assets (${Math.round(worker.length/1024)} KB).`);
