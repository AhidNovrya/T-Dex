# T-Dex

Peta aksesibilitas kampus Telkom University, dibangun berdasarkan PRD T-Dex, aset proyek Stitch **T-Dex Directions Panel**, indeks Leaflet awal, dan `peta_telkom.geojson`.

## Jalankan lokal

Gunakan **Node.js 24 atau lebih baru** beserta npm. File `.nvmrc` memilih Node.js 24 jika menggunakan nvm. Proyek memakai HTML/CSS/JavaScript, server Node.js, dan SQLite bawaan Node; tidak memerlukan instalasi PHP, MySQL, atau dependency npm tambahan.

```bash
git clone https://github.com/AhidNovrya/T-Dex.git
cd T-Dex
npm run local
```

Buka **http://localhost:3000**. Pada pemakaian pertama, perintah tersebut membuat `.env`, menampilkan nama pengguna dan kata sandi petugas yang unik, lalu menyalakan server. Simpan kata sandi saat ditampilkan. Hash disimpan dalam `.env` yang diabaikan Git. Database serta direktori foto dibuat otomatis. Halaman publik, peta, laporan, dan panel petugas berjalan melalui server lokal ini tanpa konfigurasi hosting atau API key Stitch.

Pemakaian berikutnya cukup `npm run local` atau `npm run dev`; akun yang sudah ada tetap dipertahankan. Hentikan server dengan **Ctrl+C**. Untuk mengganti kata sandi lokal secara sengaja:

```bash
npm run setup:reset
```

Mulai ulang server setelah reset. Untuk menentukan nama pengguna saat membuat atau mereset akun, tambahkan `-- nama.pengguna` pada perintah setup. Jika port 3000 sudah terpakai, ubah `PORT=3001` pada `.env`, lalu buka http://localhost:3001. Buka aplikasi melalui URL server, bukan dengan klik dua kali `index.html`.

Peta, filter fasilitas, pencarian, daftar area, dan panel informasi juga dapat dibuka melalui VS Code Live Server atau server statis, termasuk saat folder proyek berada dalam subfolder URL. Mode ini menampilkan inventaris GeoJSON dan memberi petunjuk menjalankan server aplikasi. Pengiriman laporan, login, dan pengelolaan petugas membutuhkan `npm run local` dan database; mode statis tidak menyimpan laporan atau menampilkan keberhasilan palsu.

Jika memperbarui clone lama, jalankan `git pull`, hentikan server lama dengan Ctrl+C, kemudian jalankan lagi `npm run local` dan muat ulang browser. Jika sebelumnya memakai Live Server, pindah ke URL yang ditampilkan oleh perintah `npm run local` untuk mengakses fitur petugas.

Database SQLite dan bukti foto lokal tersimpan dalam `.data/`, di luar aset publik. Cadangkan direktori ini untuk mempertahankan laporan. Akun lokal dan akun deployment memiliki konfigurasi terpisah.

## Fitur

- Peta Leaflet dengan 84 fitur GeoJSON terbaru, termasuk 5 gate, MSU, dan parkiran MSU; 82 area dapat dipilih melalui peta, pencarian, atau Daftar area.
- Kelompok area Gedung, Gate, Asrama (18 blok), Tempat Ibadah, dan Parkir. Memilih kelompok menandai seluruh poligonnya dengan animasi fade; memilih satu lokasi hanya menandai lokasi itu. Animasi dapat dijeda dan mengikuti preferensi reduced motion.
- Filter Ramp, Lift, Toilet aksesibel, dan Jalur pemandu memakai fasilitas tercatat, termasuk inventaris Dilaporkan. Fasilitas yang tidak tersedia atau terhalang dikecualikan. Beberapa filter digabung dengan aturan harus memenuhi semua pilihan.
- Panel gedung kanan / lembar bawah pada HP: foto asli, fasilitas, status pemeriksaan, serta tanggal verifikasi jika tersedia.
- Petunjuk arah berdasarkan **jalur survei tersimpan**, bukan perhitungan rute otomatis. Jalur balik harus dicatat tersendiri. Alternatif diperiksa untuk pasangan arah yang sama.
- Pelaporan publik dengan lokasi, deskripsi, dan satu JPEG/PNG maksimal 5 MB; validasi klien dan server. Bukti hanya dapat dibaca dengan sesi petugas.
- Login petugas, cookie HttpOnly/SameSite, hash PBKDF2, pembatasan percobaan login dan laporan.
- Persetujuan dengan target fasilitas/jalur dan kondisi baru; penolakan wajib beralasan. Status, kondisi, identitas petugas, waktu, dan riwayat disimpan atomik dengan pemeriksaan versi.
- Editor gedung, fasilitas, jalur, tanggal survei, relasi fasilitas, alternatif dan pemulihan kondisi. Riwayat internal perubahan kondisi.

## Data awal dan batasnya

Inventaris awal tidak memiliki tanggal audit atau geometri jalur survei. Fasilitas berstatus **Dilaporkan**, dengan kondisi **Belum diverifikasi**. Filter kini menampilkan inventaris tercatat tanpa mensyaratkan tanggal verifikasi. Status Dilaporkan tidak diubah menjadi terverifikasi. Data dan keputusan petugas tetap diutamakan jika sudah diperbarui. Status tidak tersedia berbeda dari belum diketahui.

Panduan jalur dan pelaporan petugas tetap mencakup empat gedung pilot; gate dan area tambahan dapat ditelusuri di peta serta daftar.

Penamaan Asrama pada PRD (Gedung F) berbeda dari data aksesibilitas GeoJSON (Asrama Putra Gedung 1). Titik sementara mengikuti fitur GeoJSON tersebut dan ditandai perlu konfirmasi. Petugas dapat memperbarui nama serta titik dari hasil pemeriksaan. Istilah “ramp (tangga lurus)” juga perlu diperiksa sebelum ditetapkan akses tanpa tangga.

Tidak ada tanggal verifikasi, sejarah gedung, klaim WCAG tersertifikasi, kecepatan perjalanan, atau jalur aksesibel yang direkayasa dari mockup. Data contoh dalam tes hanya memakai database sementara dan tidak mengisi data publik.

## Struktur

- `index.html`, `styles.css`, `app.js`: antarmuka HTML/CSS/JavaScript tanpa framework.
- `campus-data.js`: indeks area GeoJSON, pengelompokan, dan penggabungan fasilitas dengan data petugas tanpa mereset database.
- `public-campus.js`: inventaris awal bersama dan pemuatan peta saat API tidak tersedia.
- `server/api.mjs`: API bersama untuk Node lokal dan Cloudflare Worker.
- `server/local.mjs`: server lokal SQLite dan berkas foto privat.
- `server/web-files.mjs`: pemetaan file publik lintas Windows/Linux dan deklarasi backend pada HTML.
- `server/seed.mjs`: pemetaan inventaris pilot ke geometri asli.
- `drizzle/`: migrasi skema D1/SQLite, tanpa seed fiktif.
- `assets/`: foto dan denah WebP yang dipakai aplikasi; Leaflet, Inter, dan lisensinya dilayani lokal.
- `.env.example`: contoh konfigurasi lokal tanpa kata sandi atau hash.
- `.openai/hosting.example.json`: template binding hosting tanpa identitas proyek pribadi.

Stack Node.js/SQLite digunakan karena runtime yang tersedia dan agar dapat diterapkan sebagai Worker dengan D1/R2. Proposal PHP/MySQL di PRD bukan stack runtime implementasi ini.

## Pengujian dan deployment

```bash
npm test
npm run build
```

Build menghasilkan `dist/server/index.js`, sebuah Worker ESM mandiri dengan aset lokal. Build memakai `.openai/hosting.json` jika tersedia, atau template `.openai/hosting.example.json` pada clone baru. Deployment Sites memakai binding D1 `DB` dan R2 `BUCKET`; migrasi dikemas dari `drizzle/`. Untuk deployment ke proyek sendiri, salin template menjadi `.openai/hosting.json` dan tambahkan `project_id` hasil registrasi proyek. Konfigurasi pribadi ini diabaikan Git. Atur `ADMIN_USERNAME` dan `ADMIN_PASSWORD_HASH` sebagai runtime secrets; jangan masukkan kata sandi atau API key Stitch ke kode, manifest, atau bundle klien.

Peta dasar berasal dari OpenStreetMap dan memerlukan jaringan. Jika tile tidak tersedia, denah GeoJSON, pin, daftar, dan panduan teks tetap tersedia. Leaflet dan font disimpan lokal. Produk pilot tidak memakai GPS langsung atau navigasi dalam gedung.

## Isi repository GitHub

Repository berisi source frontend/backend, skrip, tes, migrasi database, GeoJSON, template konfigurasi, serta aset runtime dan lisensinya. File lokal tetap tersimpan di komputer tetapi dikecualikan dari Git:

- Kredensial `.env`, database dan foto laporan `.data/`, serta direktori kredensial pribadi.
- Identitas hosting `.openai/hosting.json`, pengaturan agen/editor, dan sesi browser.
- Hasil build `dist/`, screenshot `output/`, log, dan arsip kompresi.
- Dokumen PRD, arsip desain `design/`, catatan QA internal, metadata unduhan Windows, dan PNG asli yang sudah memiliki versi WebP.

Periksa daftar sebelum menambahkan file:

```bash
git status --short
git add --dry-run .
```

Remote repository adalah `origin` dan branch pengembangan saat ini `main`. Setelah memeriksa daftar source, siapkan commit dan push:

```bash
git add .
git diff --cached --stat
git commit -m "feat: add T-Dex campus map and local runtime"
git push origin main
```

Repositori ini membutuhkan backend Node.js untuk API dan SQLite. GitHub menyimpan source; GitHub Pages saja tidak menjalankan backend tersebut. Gunakan perintah lokal di atas atau hosting yang mendukung backend aplikasi.

Pengecualian `.gitignore` berlaku untuk file yang belum dilacak. Jika kredensial pernah masuk commit, mengabaikannya saja tidak menghapusnya dari riwayat Git.
