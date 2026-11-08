import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {posix,win32} from 'node:path';
import {seed,loadPublicCampus} from '../public-campus.js';
import {buildAreas,filterAreas} from '../campus-data.js';
import {resolvePublicFile,enableBackend} from '../server/web-files.mjs';

const geo=JSON.parse(await readFile(new URL('../peta_telkom.geojson',import.meta.url),'utf8'));

test('static previews load inventory and working facility filters without an API',async()=>{
 const data=await loadPublicCampus(geo,{backendAvailable:false,fetcher:()=>{throw new Error('API should not be requested');}});
 assert.equal(data.backendAvailable,false);
 const areas=buildAreas(geo,data.buildings);
 assert.equal(filterAreas(areas,{filters:['lift']}).length,2);
 assert.equal(filterAreas(areas,{group:'gate'}).length,5);
 assert.ok(areas.find(a=>a.id==='tult').photo);
});

test('an available backend preserves live staff decisions and uses the document folder',async()=>{
 const live=seed(geo);live.buildings[0].facilities[0].condition='blocked';
 let requested;
 const data=await loadPublicCampus(geo,{backendAvailable:true,baseURL:'http://localhost:3000/T-Dex/index.html',fetcher:async url=>{
  requested=url.href;return Response.json({...live,version:7});
 }});
 assert.equal(requested,'http://localhost:3000/T-Dex/api/campus');
 assert.equal(data.backendAvailable,true);
 assert.equal(data.version,7);
 assert.equal(data.buildings[0].facilities[0].condition,'blocked');
});

test('API errors and HTML error pages leave public map data usable',async()=>{
 for(const fetcher of [
  async()=>new Response('<html>Not found</html>',{status:404,headers:{'content-type':'text/html'}}),
  async()=>Response.json({error:'Unavailable'},{status:500}),
  async()=>Response.json({buildings:null}),
  async()=>new Response('{invalid',{headers:{'content-type':'application/json'}}),
  async()=>{throw new TypeError('Failed to fetch');},
 ]){
  const data=await loadPublicCampus(geo,{backendAvailable:true,baseURL:'http://localhost:3000/',fetcher});
  assert.equal(data.backendAvailable,false);
  assert.equal(data.buildings.length,4);
  assert.deepEqual(data.routes,[]);
 }
});

test('public asset paths work on Windows drives, UNC paths and POSIX',()=>{
 assert.equal(resolvePublicFile('C:\\Users\\Tester\\T-Dex','/app.js',win32),'C:\\Users\\Tester\\T-Dex\\app.js');
 assert.equal(resolvePublicFile('C:\\Users\\Tester\\T-Dex','/assets/buildings/tult.webp',win32),'C:\\Users\\Tester\\T-Dex\\assets\\buildings\\tult.webp');
 assert.equal(resolvePublicFile('\\\\server\\share\\T-Dex','/index.html',win32),'\\\\server\\share\\T-Dex\\index.html');
 assert.equal(resolvePublicFile('/tmp/T-Dex','/public-campus.js',posix),'/tmp/T-Dex/public-campus.js');
});

test('cross-platform public file handling blocks private files and traversal',()=>{
 for(const [paths,root]of [[posix,'/tmp/T-Dex'],[win32,'C:\\Users\\Tester\\T-Dex']]){
  for(const file of ['/.env','/.data/tdex.sqlite','/server/security.mjs','/assets/../.env','/assets/%2e%2e%2f.env','/assets/../../private.key','/assets/%2e%2e/%2e%2e/private.key','/assets/%5c..%5c.env']){
   assert.throws(()=>resolvePublicFile(root,file,paths),file);
  }
 }
});

test('Node and Worker HTML declare backend support without changing the static source',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 assert.ok(!html.includes('<meta name="tdex-backend"'));
 assert.match(enableBackend(html),/<meta name="tdex-backend" content="available">/);
 assert.ok(html.includes('src="./app.js"'));
 assert.ok(html.includes('href="./styles.css"'));
});
