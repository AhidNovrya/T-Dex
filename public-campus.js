// Inventory provenance: PRD, appendix p. 9; geometry and details: supplied GeoJSON.
export function seed(geojson) {
 const refs = [['tult','TULT','Telkom University Landmark Tower','way/1257717375','Gedung akademik'],['gku','GKU','Gedung Kuliah Umum (KU3)','relation/20128195','Gedung perkuliahan'],['asrama','Asrama','Blok Asrama — perlu konfirmasi','way/1293369773','Hunian mahasiswa'],['cacuk','Graha Cacuk','Grha Wiyata Cacuk Sudarijanto-A','way/95529335','Gedung akademik']];
 const labels={ramp:'Ramp',lift:'Lift',toilet:'Toilet aksesibel',pemandu:'Jalur pemandu'};
 const buildings=refs.map(([id,name,fullName,geoId,category])=>{
  const feature=geojson.features.find(f=>f.id===geoId||f.properties?.['@id']===geoId);
  let coords=feature.geometry.coordinates;while(Array.isArray(coords[0]?.[0]))coords=coords.flat();
  const lons=coords.map(c=>c[0]),lats=coords.map(c=>c[1]);
  const p=feature.properties;
  return {id,name,fullName,category,geoId,photo:`/assets/buildings/${id}.webp`,history:'',verifiedAt:null,position:[(Math.min(...lats)+Math.max(...lats))/2,(Math.min(...lons)+Math.max(...lons))/2],locationNote:id==='asrama'?'Titik sementara mengikuti Asrama Putra Gedung 1 pada GeoJSON. Kesesuaian dengan Gedung F di mockup belum dikonfirmasi.':'',facilities:Object.entries(labels).map(([type,label])=>({id:`${id}-${type}`,type,label,availability: (type==='ramp'||type==='lift'&&['gku','tult'].includes(id)||['toilet','pemandu'].includes(type)&&id==='tult')?'reported':'unknown',condition:'unknown',verifiedAt:null,updatedAt:null,location:type==='ramp'?(p.ramp_lokasi||''):type==='lift'?(p.lift_jumlah||p.list_jumlah||''):type==='toilet'?(p.toilet_disabilitas||''):(p.jalur_pemandu||''),note:type==='ramp'?'Inventaris menyebut “ramp (tangga lurus)”. Bentuk dan akses tanpa tangga perlu diperiksa.':''}))};
 });
 return {buildings,routes:[],reports:[],history:[]};
}

// Static previews can read the same inventory without a database or API.
// A real app server declares its API in the HTML it serves.
export async function loadPublicCampus(geojson,{backendAvailable=false,baseURL,fetcher=globalThis.fetch}={}) {
 if(backendAvailable){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),5000);
  try{
   const response=await fetcher(new URL('api/campus',baseURL),{headers:{Accept:'application/json'},signal:controller.signal});
   if(!response.ok||!response.headers.get('content-type')?.includes('application/json'))throw new Error('Backend unavailable');
   const data=await response.json();
   if(!Array.isArray(data.buildings)||!Array.isArray(data.routes))throw new Error('Invalid campus response');
   return {...data,backendAvailable:true};
  }catch{
   // A failed backend must not prevent map search, filters, or area inspection.
  }finally{
   clearTimeout(timeout);
  }
 }
 const initial=seed(geojson);
 return {buildings:initial.buildings,routes:initial.routes,version:0,backendAvailable:false};
}
