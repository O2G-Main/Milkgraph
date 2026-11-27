# Verifikasi Image #1 terhadap dokumentasi API dan origin/deployment

Waktu: 27 November 2026, sekitar 16.30 WIB.
Sumber requirement: gambar pengguna berjudul “Menu Produk” dan “Menu Rencana”.
Dokumentasi: https://api-milkgraph.hadooyy.my.id/docs (kontrak /openapi.yaml).
Domain frontend yang tertulis pada gambar: https://milkgraph.web.id/master-data.

## Acuan branch dan metode

- Remote sudah di-fetch. Acuan pemeriksaan kode adalah origin/deployment = 3f5042c2985ee90a83ade78cbd4c264e6cee1f92.
- Checkout sekarang deployment = 76910d86e95bb7920cfaee2cd597ee90ce571398, tertinggal 48 commit dari origin/deployment; berbeda dari checkout sesi audit sebelumnya. Tidak melakukan checkout, pull, reset, atau merge.
- Kode acuan dibaca memakai git show origin/deployment:<file>, bukan menganggap file checkout sama dengan remote.
- OpenAPI diunduh ulang. Tetap 116 path/126 operasi. Definisi operasi dan schema sama dengan mapping sebelumnya; bagian servers berubah dengan penambahan URL relatif `/` sebagai server pertama. Entri absolut api-aquaseq.hadooyy.my.id masih ada, berbeda dari host yang diminta; semua probe di audit ini sengaja menuju api-milkgraph.hadooyy.my.id.
- Melakukan 18 request GET relevan memakai X-Demo-Role: superadmin, seluruhnya 200. Tidak menjalankan POST/PUT/PATCH/DELETE; dukungan tulis dinilai dari kontrak, bukan transaksi server.
- Ini verifikasi dukungan API dan implementasi statis branch remote, bukan klaim semua interaksi sudah lolos E2E browser. Pengelompokan menu adalah tanggung jawab frontend, bukan endpoint API.

## 1. Membuat menu master untuk produk

Status API: tersedia untuk katalog baca.

- GET /api/v1/production/products: katalog ternormalisasi; 8 produk, 5 kode ukuran kemasan, 22 relasi produk-kemasan, 16 relasi produk-pasar, 44 finished SKU.
- GET /api/v1/master/products: data CSV master, terdiri dari products, packSizes, marketVariants.
- GET /api/v1/master/finished-skus: 44 finished SKU.

Set sku_id dan finished_sku_id konsisten antara katalog master dan katalog produksi dalam respons yang diambil. Untuk layar master produk, katalog ternormalisasi menyediakan relasi eksplisit; jangan memisahkan menjadi seed/fixture berbeda yang bisa menyimpang.

Status frontend: belum ada menu master produk tersendiri. lib/nav.ts:18 masih menaruh Master Alat pada /master-data. components/master-data/master-data.tsx:92-96 mengambil ringkasan, aset, koneksi, finished SKU, dan lini; bukan katalog produk lengkap dari /production/products atau /master/products.

Batasan: gambar meminta membuat menu, tidak secara eksplisit meminta CRUD produk. Katalog baca bisa dibuat dengan endpoint yang ada. Jika dimaksudkan tambah/ubah/hapus produk, dokumentasi belum memiliki endpoint mutasi katalog /master/products, /master/finished-skus, atau /production/products. Jangan menyatakan CRUD siap.

## 2. Isi /master-data dipindahkan ke jenis/menu masing-masing

Status API: sumber data terpisah sudah tersedia; reorganisasi UI bisa memakai API yang ada tanpa memindahkan/merename route backend.

Pemetaan yang sesuai contoh pada gambar:

| Informasi saat ini | Penempatan yang sesuai domain | API |
| --- | --- | --- |
| Produk, ukuran kemasan, pasar, finished SKU | Master Produk | GET /production/products, /master/products, /master/finished-skus |
| Aset dan rute pabrik | Produksi / Alat dan alur produksi | GET /master/assets, /master/connections, /master/topology, /production/assets |
| Dedikasi dan kompatibilitas lini | Konfigurasi Produksi / lini | GET /master/lines |
| Aturan changeover, CIP, constraint | Aturan Produksi / input evaluasi Rencana | GET /master/rules; klasifikasi tersedia sebagai POST /master/changeover/classify, belum diuji tulis |
| Ringkasan dan integritas dataset | Informasi sumber/administrasi, bukan dicampur dengan katalog produk | GET /master |

Semua path pada tabel berawalan /api/v1. Penempatan selain contoh aset/rute merupakan usulan berdasarkan domain, bukan rincian tambahan yang secara eksplisit diwajibkan gambar.

Bukti respons: /master/topology berisi 63 nodes dan 118 edges; /master/lines berisi 10 dedikasi, 58 kompatibilitas produk, 116 kompatibilitas finished SKU. /master/rules berisi 4 aturan changeover, 5 aturan CIP, 21 constraint, dan 7 definisi satuan.

Status frontend: belum dipisah sesuai poin ini. /master-data masih menampung data beberapa domain. Halaman produksi dan FlowCanvas masih memakai ASSETS/LINKS lokal (components/alur/alur.tsx:5-17; components/alur/flow-canvas.tsx:9,50), belum mengambil topologi Greenfields sebagai sumber diagram.

## 3. Kondisi Alat menjadi Alat; daftar alat Greenfields dan kondisi sebagai status

Status API: daftar alat serta kontrak perubahan status tersedia.

- GET /api/v1/production/assets: 63 aset, dengan current_status, current_status_reason, current_status_source, current_status_observed_at.
- GET /api/v1/production/assets?include_pipes=true: 73 item termasuk pipa/junction.
- GET /api/v1/master/assets: konfigurasi 63 aset (kapasitas, flow, speed, CIP, dan sebagainya).
- POST /api/v1/production/assets/{id}/status: kontrak body membutuhkan status; tersedia status_reason dan source. Kontrak memberi contoh Maintenance, tidak menetapkan enum baku status.
- GET /api/v1/downtime-events: histori downtime tersedia, saat audit kosong. Kondisi/status dan downtime jangan dianggap satu resource yang sama.

Set asset_id dari master, katalog produksi, dan topology sama pada respons yang diuji. Jadwal produksi juga merujuk filling_line_id, aseptic_tank_id, sterilizer_id yang ada dalam katalog aset.

Penting: 35 dari 63 aset mempunyai current_status null saat audit. Tampilkan belum ada status/tercatat, bukan mengarang default Jalan. Nilai N/A atau placeholder numerik pada konfigurasi juga tidak boleh otomatis diubah menjadi nol.

Status frontend: belum sesuai gambar. Label masih Kondisi Alat (lib/nav.ts:18). Daftar mengambil ASSETS lokal (components/kondisi-alat/kondisi-alat.tsx:8), dan submit dialog memanggil updateMachine lokal (:112; lib/demo.ts:463-465), bukan POST status aset backend. Mengubah label saja belum memenuhi kebutuhan ini.

## 4. Flow Rencana menyesuaikan alur Produksi

Status API: bahan penghubung tersedia, tetapi alur what-if belum otomatis terintegrasi.

Sumber identitas/alur bersama:
- GET /api/v1/master/topology: aset dan koneksi kanonis.
- GET /api/v1/master/lines: kompatibilitas produk/finished SKU dan sumber tangki per lini.
- GET /api/v1/master/rules: constraint, CIP, changeover.
- GET /api/v1/production/plans: 88 rencana/proposal mingguan beserta finished_sku_id; 12 baris memiliki batch_id saat audit, sisanya belum terkait batch.
- GET /api/v1/production/schedule: 6 baris urutan produksi pada default tanggal 1 November 2026, dengan ID batch dan alat.
- GET /api/v1/production/predictions dan /production/recommendations: 200, tetapi daftar kosong saat audit.
- POST /production/predictions/run dan PATCH /production/recommendations/{id}: kontrak tersedia; tidak dijalankan. RecommendationRow mendefinisikan upgrade_kapasitas, naikkan_speed, pindahkan_alat, geser_jadwal serta target_asset_id, expected_gain, reason_facts.

Jangan menyamakan /production/plans dengan /plans: yang pertama proposal produksi berbasis SKU/batch, yang kedua rencana skenario before/after. Tidak cukup mengganti URL tanpa adapter model dan pemetaan identitas.

Status frontend: belum memenuhi keterkaitan penuh yang diminta gambar. PlanFlow menggunakan ASSETS, LINKS, STAGES lokal (components/rencana/plan-flow.tsx:16,126,141). Pemeriksaan API Rencana mengirim body kosong ke /plans/{id}/check dan penghitungan adjustment lokal hanya aktif di luar API_MODE (components/rencana/rencana.tsx:61-68,88-92). Perubahan alur/topologi produksi belum otomatis menjadi input pemeriksaan what-if.

Rekomendasi integrasi: satu model aset/topologi untuk Produksi dan Rencana, memakai asset_id yang sama, diikuti adapter proposal/batch/SKU dan kontrak evaluasi adjustment yang eksplisit. Relasi proposal-batch yang null dan prediksi/rekomendasi kosong harus ditangani sebagai data belum tersedia, bukan diisi fixture simulasi.

## Pemeriksaan Origin yang benar dari gambar

- GET /api/v1/meta dengan Origin: https://milkgraph.web.id menghasilkan 200 dan Access-Control-Allow-Origin: https://milkgraph.web.id.
- OPTIONS pada /api/v1/production/assets/AT-01/status untuk POST dengan x-demo-role,content-type menghasilkan 204 dan allow-origin yang sesuai.
- Jadi domain pada gambar lolos pemeriksaan CORS ini. Penolakan CORS pada audit sebelumnya berlaku untuk milkgraph.hadooyy.my.id dan localhost:3000, bukan domain milkgraph.web.id. Hasil tersebut tidak boleh digeneralisasi menjadi frontend pada gambar pasti terblokir.
- Preflight yang lulus bukan bukti operasi POST tersimpan; tidak ada perubahan status alat dilakukan.

## Kesimpulan

Keempat poin didukung sebagian besar sumber data baca dan beberapa kontrak mutasi yang sudah tersedia. Namun keempatnya belum terwujud sebagai susunan menu dan alur terintegrasi pada origin/deployment yang diperiksa. Gap backend yang jelas adalah mutasi katalog produk jika CRUD memang diinginkan; gap integrasi utama adalah sumber topologi bersama, simpan status alat, pembagian konten master, serta penerusan adjustment Rencana ke backend.

Audit ini menambahkan laporan saja. Tidak mengubah kode aplikasi atau data backend, tidak menguji mutasi, dan tidak menganggap hasil test dari checkout sesi sebelumnya berlaku pada checkout deployment yang kini berbeda.
