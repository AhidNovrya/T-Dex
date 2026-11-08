import {hashPassword,random} from '../server/security.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {fileURLToPath} from 'node:url';

const envPath=fileURLToPath(new URL('../.env',import.meta.url));
const args=process.argv.slice(2),reset=args.includes('--reset');
const requestedUsername=args.find(arg=>!arg.startsWith('--'));
let env=await readFile(envPath,'utf8').catch(error=>{
 if(error.code!=='ENOENT')throw error;
 return 'PORT=3000\n';
});
const existing=parseEnv(env);
const configured=existing.ADMIN_USERNAME&&/^pbkdf2\$100000\$[a-f0-9]{32}\$[a-f0-9]{64}$/.test(existing.ADMIN_PASSWORD_HASH||'');
if(configured&&!reset){
 console.log(`Akun petugas lokal sudah siap: ${existing.ADMIN_USERNAME}.\nUntuk membuat kata sandi baru: npm run setup:reset`);
}else{
 const username=requestedUsername||existing.ADMIN_USERNAME||'petugas';
 if(!/^[A-Za-z0-9_.-]{3,64}$/.test(username)){
  console.error('Nama pengguna harus 3–64 karakter: huruf, angka, titik, garis bawah, atau tanda hubung.');
  process.exitCode=1;
 }else{
  const password=random().slice(0,20),hash=await hashPassword(password);
  env=env.replace(/^ADMIN_USERNAME=.*\r?\n?/gm,'').replace(/^ADMIN_PASSWORD_HASH=.*\r?\n?/gm,'');
  await writeFile(envPath,`${env.trim()}\nADMIN_USERNAME=${username}\nADMIN_PASSWORD_HASH=${hash}\n`,{mode:0o600});
  console.log(`Akun lokal siap.\nNama pengguna: ${username}\nKata sandi: ${password}\nSimpan kata sandi ini; kata sandi hanya ditampilkan saat dibuat.\nMulai ulang server setelah konfigurasi berubah.`);
 }
}
