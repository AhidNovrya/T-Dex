const enc = new TextEncoder();
export const hex = bytes => Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');
export const random = () => hex(crypto.getRandomValues(new Uint8Array(32)));
export async function digest(value){return hex(await crypto.subtle.digest('SHA-256',enc.encode(value)));}
export async function hashPassword(password,salt=random().slice(0,32)){
 const key=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);
 const result=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:enc.encode(salt),iterations:100000},key,256);
 return `pbkdf2$100000$${salt}$${hex(result)}`;
}
export async function verifyPassword(password,hash){
 if(!/^pbkdf2\$100000\$[a-f0-9]{32}\$[a-f0-9]{64}$/.test(hash||''))return false;
 const expected=await hashPassword(password,hash.split('$')[2]);
 let diff=0;for(let i=0;i<expected.length;i++)diff|=expected.charCodeAt(i)^hash.charCodeAt(i);return diff===0;
}
export function imageType(bytes){
 if(bytes.length>24&&[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)){
  const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),w=v.getUint32(16),h=v.getUint32(20);
  return w>0&&h>0&&w*h<=40000000?'image/png':null;
 }
 if(bytes.length>4&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255&&bytes.at(-2)===255&&bytes.at(-1)===217)return 'image/jpeg';
 return null;
}
