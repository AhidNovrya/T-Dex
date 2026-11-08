import path from 'node:path';

const publicFiles=new Set(['index.html','app.js','campus-data.js','public-campus.js','styles.css','peta_telkom.geojson']);

export function resolvePublicFile(root,pathname,paths=path){
 const decoded=decodeURIComponent(pathname),file=decoded==='/'?'index.html':decoded.replace(/^\//,'');
 if(file.split('/').some(part=>part==='..'||part==='.'))throw new Error('Not found');
 if(!publicFiles.has(file)&&!/^assets\/[a-zA-Z0-9_./-]+$/.test(file))throw new Error('Not found');
 const absolute=paths.resolve(root,file),relative=paths.relative(root,absolute);
 if(relative==='..'||relative.startsWith(`..${paths.sep}`)||paths.isAbsolute(relative))throw new Error('Not found');
 return absolute;
}

export function enableBackend(html){
 return html.replace('</head>','<meta name="tdex-backend" content="available"></head>');
}
