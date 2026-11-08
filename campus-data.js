// Public map areas come from GeoJSON; staff-verified records keep precedence.
export const AREA_GROUPS = [
  ['all', 'Semua area'], ['gedung', 'Gedung'], ['gate', 'Gate'],
  ['asrama', 'Asrama'], ['ibadah', 'Tempat ibadah / MSU'], ['parkir', 'Parkir'],
];
const FACILITIES = {ramp:'Ramp', lift:'Lift', toilet:'Toilet aksesibel', pemandu:'Jalur pemandu'};
export function featureKey(feature, index = 0) {
  return feature.id || feature.properties?.['@id'] || `area-${(feature.properties?.name || String(index)).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}
export function areaGroup(properties = {}) {
  if (/^gate\s*\d+/i.test(properties.name || '') || properties.barrier === 'gate') return 'gate';
  if (properties.amenity === 'parking') return 'parkir';
  if (properties.building === 'dormitory') return 'asrama';
  if (properties.amenity === 'place_of_worship' || properties.building === 'mosque') return 'ibadah';
  return 'gedung';
}
function hasValue(value) {
  return value != null && !['', 'no', 'none', '0', 'false', 'tidak ada'].includes(String(value).trim().toLowerCase());
}
export function geoFacilities(properties = {}, id = '') {
  const details = {ramp:properties.ramp_lokasi, lift:properties.lift_jumlah || properties.list_jumlah, toilet:properties.toilet_disabilitas, pemandu:properties.jalur_pemandu};
  const tags = {ramp:properties.ramp, lift:properties.highway === 'elevator' ? 'yes' : undefined, toilet:properties['toilets:wheelchair'], pemandu:properties.tactile_paving};
  return Object.entries(FACILITIES).map(([type, label]) => ({
    id:`${id}-${type}`, type, label,
    availability: tags[type] === 'no' ? 'no' : tags[type] === 'yes' || hasValue(details[type]) ? 'reported' : 'unknown',
    condition:'unknown', verifiedAt:null, updatedAt:null, location:hasValue(details[type]) ? String(details[type]) : '', note:'',
  }));
}
function center(geometry) {
  const points=[];
  const visit=coords=>{if(typeof coords?.[0]==='number')points.push(coords);else if(Array.isArray(coords))coords.forEach(visit);};
  visit(geometry.coordinates);
  if(!points.length)return null;
  return [(Math.min(...points.map(p=>p[1]))+Math.max(...points.map(p=>p[1])))/2, (Math.min(...points.map(p=>p[0]))+Math.max(...points.map(p=>p[0])))/2];
}
export function buildAreas(geojson, buildings = []) {
  const matched = new Set();
  const areas = (geojson.features || []).flatMap((feature, index) => {
    const p=feature.properties || {}, key=featureKey(feature,index), pilot=buildings.find(b=>b.geoId===key), position=center(feature.geometry);
    if(!position || !(p.name || p.building || p.amenity==='parking' || p.barrier==='gate'))return [];
    const group=areaGroup(p), raw=geoFacilities(p,pilot?.id || key);
    if(pilot)matched.add(pilot.id);
    const facilities=raw.map(f=>{
      const saved=pilot?.facilities.find(old=>old.type===f.type);
      if(!saved)return f;
      if(['yes','no'].includes(saved.availability))return saved;
      return {...saved, availability:f.availability==='no'?'no':saved.availability==='reported'||f.availability==='reported'?'reported':'unknown', location:f.location || saved.location};
    });
    return [{...pilot, id:pilot?.id || key, featureKey:key, group, geometry:feature.geometry,
      name:pilot?.name || p.name || (group==='parkir'?'Area parkir':'Gedung tanpa nama'),
      fullName: [pilot?.fullName || p.name || key, p.nama_lain].filter(Boolean).join(' · '),
      category:pilot?.category || AREA_GROUPS.find(([id])=>id===group)?.[1],
      buildingCode:pilot?.buildingCode || p.building_code || '',
      aliases: `${p.name || ''} ${p.nama_lain || ''} ${p.building_code || ''} ${group === 'ibadah' ? 'MSU' : ''}`.trim(),
      position:pilot?.position || position, photo:pilot?.photo || '',
      history: pilot?.history || p.history || '',
      locationNote:pilot?.locationNote || '', verifiedAt:pilot?.verifiedAt || null, facilities, pilot:!!pilot,
    }];
  });
  for(const building of buildings)if(!matched.has(building.id))areas.push({...building,group:'gedung',featureKey:building.geoId || building.id,pilot:true});
  return areas;
}
export function matchesFacilities(area, filters) {
  return [...filters].every(type=>area.facilities.some(f=>f.type===type&&['yes','reported'].includes(f.availability)&&f.condition!=='blocked'));
}
export function filterAreas(areas, {group='all', query='', filters=[]}={}) {
  const q=query.trim().toLocaleLowerCase('id');
  // If query looks like a room/class code (e.g. "KU1.02.13", "TULT.01.A"), extract building prefix before the first dot
  const roomCode=/^([A-Za-z]+\d*)[.]/.exec(query.trim());
  const buildingPrefix=roomCode ? roomCode[1].toLocaleLowerCase('id') : null;
  return areas.filter(area=>{
    if(group!=='all'&&area.group!==group)return false;
    if(!matchesFacilities(area,filters))return false;
    if(!q)return true;
    if(buildingPrefix){
      // Match only if the area's buildingCode (or a token in aliases) is exactly the prefix
      const code=(area.buildingCode||'').toLocaleLowerCase('id');
      if(code)return code===buildingPrefix;
      // Fallback: exact token match in aliases
      return (area.aliases||'').toLocaleLowerCase('id').split(/\s+/).some(tok=>tok===buildingPrefix);
    }
    return `${area.name} ${area.fullName} ${area.aliases || ''}`.toLocaleLowerCase('id').includes(q);
  });
}
