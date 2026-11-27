# Manajemen proses — Produksi

Tab **Manajemen proses** di `/produksi` mengelompokkan tiga kebutuhan:

1. **Batas operasional** — form bersama dengan halaman Alat, bersumber dari `GET /limits` dan `GET /limits/schema`. Pengguna dengan izin `constraint.edit` pada sesi backend yang sesuai dapat menyimpan melalui `PUT /limits`. Batas berlaku global untuk perencanaan; tidak mengubah spesifikasi satu alat, tanggal tertentu, atau jadwal yang sudah dibuat.
2. **Alat & rute** — pilihan alat, spesifikasi, dan rute yang memiliki ID alat yang sama dari `GET /master/topology`. Nilai nol dipertahankan, nilai kosong ditulis “Belum tersedia”. Tautan ke katalog/status alat serta Kondisi Pabrik tersedia sesuai akses halaman.
3. **Lini & kompatibilitas** — dedikasi lini, tangki sumber, kecepatan kemasan, dan kelayakan SKU dari `GET /master/lines`, memakai komponen yang sama dengan halaman Alat.

OpenAPI backend yang diperiksa pada 28 November 2026 WIB hanya menyediakan GET untuk master aset, koneksi, topologi, dan lini. Karena itu spesifikasi kapasitas/kecepatan per alat, rute, dan dedikasi lini tidak diberi tombol simpan yang seolah berfungsi. Penyuntingan parameter tersebut memerlukan endpoint backend dan aturan izin/validasi tambahan.

Form batas operasional membaca ulang izin dan nilai terbaru sebelum menyimpan, sehingga bidang lain tidak tertimpa nilai cache. Sesudah penyimpanan, nilai yang diubah dibaca kembali dan dibandingkan. Kegagalan mempertahankan isian pengguna dan menampilkan pesan; keberhasilan hanya ditampilkan setelah verifikasi cocok. Mode demo menggunakan pengaturan simulasi lokal dan tidak menampilkan konfigurasi master sebagai data backend.

## Verifikasi

- `npm run typecheck`, `npm run lint`, `npm test` (204 tes), `npm run build`.
- `node tests/process-management-browser.mjs`: penyimpanan PUT dengan API tiruan, batas angka dari schema, mempertahankan nilai backend lain yang berubah, kegagalan penyimpanan, pencabutan izin setelah form terbuka, mode hanya baca, pemilihan alat/rute, nilai nol, kosong/gagal/retry, keyboard dan lebar 320/768/1024/1440 px. `BASE_URL` dan `PLAYWRIGHT_CHROMIUM_EXECUTABLE` dapat disesuaikan.
- Pengecekan browser API langsung hanya GET; tidak mengubah batas operasional aktif.
