import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {seed} from '../server/seed.mjs';
import {buildAreas, filterAreas, featureKey} from '../campus-data.js';

const geo=JSON.parse(await readFile(new URL('../peta_telkom.geojson',import.meta.url),'utf8'));
const initial=seed(geo).buildings;
const areas=buildAreas(geo,initial);

test('updated GeoJSON exposes all five gates despite their missing OSM IDs',()=>{
 const gates=filterAreas(areas,{group:'gate'});
 assert.deepEqual(gates.map(a=>a.name).sort(),['Gate 1','Gate 2','Gate 3','Gate 4','Gate 5']);
 assert.equal(new Set(areas.map(a=>a.id)).size,areas.length);
 for(const area of gates){const feature=geo.features.find(f=>f.properties?.name===area.name);assert.equal(area.geometry,feature.geometry);assert.equal(area.featureKey,featureKey(feature,999));}
});
test('Asrama group includes every dormitory and excludes shops and canteens with Asrama in their names',()=>{
 const dorms=filterAreas(areas,{group:'asrama'});
 assert.equal(dorms.length,18);
 assert.ok(dorms.some(a=>a.fullName.includes('Gedung 1')));
 assert.ok(dorms.some(a=>a.name==='Asrama Putri Gedung F'));
 assert.ok(dorms.every(a=>!(/kantin|laundry|kompos/i.test(a.name))));
});
test('MSU abbreviation finds the mosque, and parking areas use uniform naming',()=>{
 const results=filterAreas(areas,{query:'MSU'});
 assert.equal(results.length,1);
 assert.equal(results[0].name,'Masjid Syamsul Ulum');
 assert.equal(results[0].group,'ibadah');
 const parkings=filterAreas(areas,{group:'parkir'});
 assert.ok(parkings.every(a=>a.name==='Area parkir'));
});
test('facility filters include the reported inventory without inventing verification dates',()=>{
 for(const [type,expected]of [['ramp',22],['lift',2],['toilet',1],['pemandu',1]]){
  const matches=filterAreas(areas,{filters:[type]});assert.equal(matches.length,expected);
  assert.ok(matches.every(a=>a.facilities.find(f=>f.type===type).verifiedAt===null));
 }
 assert.deepEqual(filterAreas(areas,{filters:['lift','toilet','pemandu']}).map(a=>a.id),['tult']);
 assert.equal(filterAreas(areas,{group:'gate',filters:['lift']}).length,0);
});
test('staff decisions override GeoJSON and exclude unavailable or blocked facilities',()=>{
 const saved=structuredClone(initial),tult=saved.find(b=>b.id==='tult');
 tult.facilities.find(f=>f.type==='lift').condition='blocked';
 tult.facilities.find(f=>f.type==='toilet').availability='no';
 const updated=buildAreas(geo,saved);
 assert.deepEqual(filterAreas(updated,{filters:['lift']}).map(a=>a.id),['gku']);
 assert.equal(filterAreas(updated,{filters:['toilet']}).length,0);
 assert.equal(updated.find(a=>a.id==='tult').facilities.find(f=>f.type==='lift').condition,'blocked');
});
test('new GeoJSON facility tags appear without resetting saved reports or needing a DB reseed',()=>{
 const updated=structuredClone(geo),gate=updated.features.find(f=>f.properties?.name==='Gate 1');
 gate.properties.ramp='yes';
 const result=filterAreas(buildAreas(updated,initial),{group:'gate',filters:['ramp']});
 assert.equal(result.length,1);assert.equal(result[0].name,'Gate 1');
 assert.equal(initial.length,4);
});
