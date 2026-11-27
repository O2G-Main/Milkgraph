# Verifikasi penyelarasan tipografi dan aksi detail

Acuan: halaman Master Produk (`components/produk/produk.module.css`).

## Perubahan

- Onest untuk teks dan kontrol; JetBrains Mono tetap untuk ID/kode.
- Isi dan header tabel 16px; header berbobot 600; ID/aksi tabel 15px.
- Isi/subjudul 14px, label 13px, badge 12px.
- Aksi detail memakai pill secondary putih bertepi netral, teks 15px/550, tinggi minimum 46px; padding 22px atau 18px pada mobile.
- Cue Lihat detail pada Penjadwalan tetap span di dalam satu tombol baris; tidak menambahkan tombol bersarang.
- Pengaturan tetap berada di Alat. Tidak memindahkan fungsi ke Produksi.
- Memperbaiki wrapping badge tangki, permission panjang, filter keputusan, dan event rencana. Aksi detail berlabel tidak lagi memakai slot ikon absolut pada kartu tabel mobile.
- `.table-wrap` menjadi containing block (`position: relative`), sehingga label aksesibel `.sr-only` tidak melebar keluar scroller pada tablet.
- Label canvas/3D/Gantt yang memang kompak dan hierarki judul/metrik dipertahankan.

## Hasil eksekusi akhir

- Unit tests: 196 lulus, 0 gagal.
- `pnpm run lint`: lulus.
- `pnpm run typecheck`: lulus.
- Production build mode demo: lulus; 36 halaman/aset statis tergenerasi. Next.js sempat menghentikan build untuk peringatan keamanan; percobaan ulang berhasil dan tetap memberikan peringatan tersebut. Dependensi tidak diubah.
- `git diff --check`: lulus.
- Browser mode demo: 28 route × 5 viewport (320, 390, 768, 1440, 1600px) = 140 pemeriksaan lulus, tanpa overflow dokumen maupun runtime error.
- Browser API live GET-only: 25 route × 5 viewport = 125 pemeriksaan lulus, tanpa overflow dokumen maupun runtime error. Meliputi pembandingan computed style cue mingguan terhadap Master Produk dan pengujian interaksi detail dengan data live.
- Dashboard Manager mode demo: 5 viewport lulus, tanpa runtime error.
- Login: 5 viewport lulus.
- UI mode API dengan fixture sintetis yang dinyatakan eksplisit: Master Produk, Penjadwalan, dan Alat × 5 viewport = 15 pemeriksaan lulus. Meliputi pembandingan computed style cue mingguan terhadap tombol acuan, Enter membuka detail harian, tidak ada nested button, Escape menutup modal, serta Pengaturan tetap di Alat.

## Batas verifikasi

Backend sempat membalas HTTP 502, lalu pulih dan merespons 200 dengan header role yang benar; setelah itu 125 pemeriksaan API live di atas berhasil.

Tiga route hanya diverifikasi penuh melalui mode demo, bukan sebagai tampilan berdata pada API live: `/receiving` dan `/constraint` memerlukan POST kalkulasi yang sengaja diblokir pada QA GET-only; `/pasokan` menampilkan “Tidak ada data pasokan dan permintaan tersedia.” Pengujian tambahan Pasokan gagal menunggu heading pada kelima viewport karena keadaan kosong ini; tidak dihitung sebagai keberhasilan tampilan berdata. Tidak mengubah logika halaman atau mengarang data agar tes lulus.

Fixture UI hanya membuktikan style/interaksi komponen dengan data uji, bukan angka atau keberhasilan backend produksi. Mode demo dan hasil fixture tidak boleh dilaporkan sebagai verifikasi live API.

Tidak ada commit, push, upgrade dependensi, atau mutasi operasional backend.

## Artefak lokal

Runner: `tests/typography-browser.mjs`.

- `/home/lain/.hermes/cache/scratch/milkgraph-typography-verified-demo/report.json`
- `/home/lain/.hermes/cache/scratch/milkgraph-typography-verified-api/report.json`
- `/home/lain/.hermes/cache/scratch/milkgraph-typography-manager/report.json`
- `/home/lain/.hermes/cache/scratch/milkgraph-typography-detail-fixtures/report.json`
- `/home/lain/.hermes/cache/scratch/milkgraph-typography-pasokan-api/report.json` (pemeriksaan terhambat data kosong; bukan hasil lulus)

Screenshot tersimpan bersama masing-masing report. Direktori scratch dapat dibersihkan otomatis setelah tidak digunakan; ringkasan ini adalah catatan permanen di repo.
