# Audit pemetaan API MilkGraph terhadap branch deployment

Waktu verifikasi: 2026-11-27T16:22:38+07:00 (WIB).

## Acuan dan batas audit

- Dokumentasi: https://api-milkgraph.hadooyy.my.id/docs
- Kontrak Swagger yang benar-benar diambil: https://api-milkgraph.hadooyy.my.id/openapi.yaml
- OpenAPI 3.0.3; MilkGraph Backend API v3.0.0.
- SHA-256 berkas YAML saat audit: `93cd83baac4cf9635342b9bf743937aed2487cb9bb9c2424dab6089e29b2cec8`.
- Git: checkout lokal `main`, commit `3f5042c2985ee90a83ade78cbd4c264e6cee1f92`, identik dengan `origin/deployment` setelah fetch. Branch tidak dipindahkan dan tidak ada merge tambahan untuk audit.
- Audit tidak membaca `.env`/credential; tidak mengirim POST, PUT, PATCH, atau DELETE ke server. GET dan OPTIONS saja; SSE dibuka terbatas.
- Pembacaan backend memakai header demo `X-Demo-Role: superadmin`. `/meta` mengembalikan `mode: demo`. Ini bukan pembuktian autentikasi live/JWT atau akses seluruh role.
- Inventaris kode menggunakan AST TypeScript pada berkas tracked di `app/`, `components/`, `lib/`; pemanggilan `useResource`, `apiGet`, `apiSend`, `apiUpload`, pembungkus actions, dan `fetch`. Dua penggunaan generic import CSV dihubungkan manual melalui prop `importPath`.
- “Ada referensi” berarti ada call site/adapter statis, bukan klaim fitur lengkap, endpoint berhasil ditulis, atau lolos E2E browser. Branch conditional dan fitur yang sengaja dibatasi tetap dihitung sebagai referensi.

## Ringkasan terukur

- 116 path OpenAPI, 126 operasi: 88 GET, 33 POST, 3 PUT, 1 PATCH, 1 DELETE.
- 91 operasi memiliki referensi kode; 35 belum ditemukan referensinya (termasuk 4 endpoint infrastruktur/dokumentasi).
- Semua 88 operasi GET terdokumentasi dicoba minimal satu varian. 87 memiliki minimal satu respons 200. Endpoint volume-chain menerima 404 untuk ID sampel tanpa transfer; tidak disimpulkan sebagai kerusakan route.
- Uji lewat implementasi `lib/api/client.ts` asli (Node, tanpa Origin browser): 13/13 lulus, termasuk bentuk data dan pemetaan HTTP 404 menjadi `ApiError`.
- `pnpm test`: 129 lulus, 0 gagal. Test lokal bukan pengganti pemeriksaan CORS/browser atau mutasi live.

### Per kelompok (tag pertama, tidak menghitung ganda)

| Kelompok | Operasi | Ada referensi | Belum direferensikan |
| --- | ---: | ---: | ---: |
| System & Docs | 5 | 1 | 4 |
| Production & Batch | 19 | 4 | 15 |
| Master & Graph | 18 | 15 | 3 |
| Supply & Receiving | 18 | 17 | 1 |
| Planning | 20 | 17 | 3 |
| Traceability & Volume | 11 | 10 | 1 |
| Quality | 9 | 9 | 0 |
| Downtime | 8 | 6 | 2 |
| AI Assistant | 4 | 3 | 1 |
| Roles | 14 | 9 | 5 |

## Temuan utama

### 1. Integrasi produksi berbasis batch belum tersambung

Dari 19 operasi kelompok Production & Batch, hanya empat yang direferensikan: `/production/aseptic-tanks`, `/production/fillers`, `/production/changeover-matrix`, dan `/production/unit-states`. Operasi daily, schedule produksi, create batch, batch trace, katalog/status aset, produk, plan produksi, prediksi, rekomendasi, dan output belum memiliki call site.

Halaman `/produksi` masih memakai konstanta `ASSETS` dan `FlowCanvas`, bukan daftar batch/daily dari API (`components/alur/alur.tsx:5-17`). Penjadwalan yang sudah tersambung adalah `/pos` dan `/schedules/latest`, bukan `/production/schedule` (`components/penjadwalan/penjadwalan-api.tsx:31-33`). Ini dua kontrak berbeda, jangan disamakan.

Backend benar-benar mengembalikan data: default `/production/daily` memakai tanggal 2026-11-01 dan 6 baris; `/production/assets` 63 item (73 jika `include_pipes=true`); `/production/plans` 88 item. Prediksi dan rekomendasi kosong saat audit bukan bukti endpoint rusak.

### 2. CORS perlu dikonfirmasi sebelum integrasi browser

GET `/api/v1/meta` tanpa Origin: 200. Dengan Origin `https://milkgraph.hadooyy.my.id` atau `http://localhost:3000`: 403, body `error.code=FORBIDDEN`, `message=Origin tidak diizinkan.` Preflight OPTIONS untuk origin HTTPS tersebut juga 403.

Ini adalah hasil untuk dua Origin yang diuji, bukan klaim bahwa semua origin atau deployment frontend saat ini gagal. Domain frontend/build arguments aktual belum diverifikasi karena audit tidak membaca env/credential. Jika salah satu domain tersebut dipakai frontend, whitelist CORS backend harus dibenahi; kelulusan curl/Node tanpa Origin tidak membuktikan browser bisa mengakses. `next.config.ts:4-12` tidak menyediakan rewrite API ke backend; client memakai URL langsung (`lib/api/client.ts:2-11`).

### 3. Status baca notifikasi masih lokal

Server mengirim `read` dan menyediakan POST `/notifications/{id}/read` serta `/notifications/read-all`. FE belum memanggil keduanya. Tipe Notification belum memuat `read` (`components/shell/app-shell.tsx:37-47`); unread dihitung dari hook lokal dan klik hanya `markRead` (`components/shell/app-shell.tsx:123-136`). Persistensi berada di localStorage per akun (`lib/notif-read.ts:9-34`). Karena itu status server belum menjadi sumber kebenaran lintas browser/perangkat. Mutasi status baca tidak diuji agar tidak mengubah server.

### 4. Tanggal operasi masih hardcoded di beberapa jalur API

`saveTransfer` memakai `SCENARIO_DATE = 2026-10-14`, lalu membentuk `recorded_at` dari tanggal tersebut (`lib/flows.ts:48-68`, `lib/api/contract.ts:60-64`), bukan tanggal operasi yang dipilih atau diterima dari backend. Trace forward memakai 2026-10-13 (`components/trace/trace.tsx:41,106`). Ini risiko ketika fitur dipakai untuk skenario November atau operasi terkini; tidak ada transaksi ditulis untuk mereproduksi dampaknya.

Data server sendiri bercampur menurut dataset/parameter: `/meta` memberi tanggal 27 November 2026, default daily dan jadwal masih 1 November 2026, dan `?date=2026-11-27` pada daily/schedule memberi daftar kosong. Tanggal snapshot, tanggal produksi, dan jam header realtime perlu dibedakan; data kosong untuk tanggal lain jangan diganti angka simulasi.

### 5. CRUD role belum terhubung, memang dibatasi UI

GET `/roles` dan `/permissions` terhubung. POST role, PUT role, dan DELETE role belum ada call site. Ini sengaja ditahan pada `components/role-akses/role-akses-api.tsx:9-19,42-43`, bukan fitur edit yang diklaim berhasil tersimpan. Client umum juga hanya menerima POST/PUT (`lib/api/client.ts:24`), sehingga endpoint PATCH/DELETE baru membutuhkan dukungan metode sebelum dihubungkan.

### 6. Mode live/JWT belum didukung client umum

Dokumen mendefinisikan bearerAuth JWT untuk MODE=live dan demoRole untuk MODE=demo. Client umum/upload hanya mengirim X-Demo-Role, tidak Authorization Bearer (`lib/api/client.ts:5-11,27-33`); SSE sama (`lib/api/events.ts:5`). Backend yang diuji saat ini mode demo. Temuan ini adalah gap kesiapan mode live, bukan kegagalan autentikasi demo yang direproduksi.

### 7. OpenAPI belum cukup ketat/valid untuk code generation otomatis

Validator OpenAPI 3.0 menemukan tiga kesalahan struktur:

- `/production/daily` parameter date: deskripsi berisi koma yang tidak di-quote menjadi properti ilegal `default 2026-11-01)`.
- `/master/rules` GET: properti ilegal `CIP` dan `dan constraint CSV`.
- `/dashboard/executive` GET: properti ilegal `ringkasan PO)` dan `utilisasi mesin`.

Banyak respons memakai `components.responses.OK`, dengan schema `type: object`, padahal runtime berupa array (contoh `/assets`, `/plans`, `/notifications`, `/permissions`, `/master/assets`). Pemeriksaan schema terhadap respons 200 menemukan error pada 32 varian URL: 31 karena object/array, satu endpoint daily karena enam nilai `fulfill_status: null` tidak tercakup enum pada schema. Ini cacat/ketidaklengkapan kontrak, tidak otomatis berarti FE crash: tipe FE untuk sejumlah endpoint tersebut memang sudah array.

34 dari 38 operasi mutasi tidak memiliki requestBody di OpenAPI. Sebagian memang tidak memerlukan body, tetapi payload yang dibutuhkan endpoint seperti create/update role, PO, transfer, dan import CSV belum bisa dipastikan dari schema ini. Audit hanya dapat membandingkan referensi kode, bukan menyatakan semua payload mutasi kompatibel. Lengkapi schema request/response sebelum menghasilkan client/type otomatis.

### 8. Simpan kondisi mesin masih mengubah state lokal dalam mode API

Dialog mesin tetap aktif dalam API_MODE dan submit hanya memanggil `updateMachine` (`components/kondisi-alat/kondisi-alat.tsx:101-117`). Implementasinya hanya memperbarui `operation.machines` melalui state demo (`lib/demo.ts:463-465`), tidak memanggil POST `/production/assets/{id}/status`. Karena itu perubahan tampak di UI tanpa tersimpan di status aset backend. Ini pembuktian aliran kode, bukan transaksi produksi yang diuji. Pencatatan downtime berbeda: sudah memiliki cabang `DowntimeApi` (`components/kondisi-alat/kondisi-alat.tsx:82`) dan tidak ikut dinyatakan lokal.

### 9. Sebagian tampilan API masih mencampurkan fixture/mock

- Trace membaca respons server tetapi detail node, handoff, dan mass balance masih memakai `scenario` lokal (`components/trace/trace-views.tsx:11-13,42-60,67-78`). Node server yang tidak ada di fixture dapat membuat dereference `node.source` gagal; ini risiko dari kode, belum reproduksi browser.
- Riwayat Produksi menggabungkan `OUTPUTS` mock dengan group historis API dan default memilih lot contoh (`components/riwayat/riwayat-produksi.tsx:30,39-51`). Jalur historis server memang ada; masalahnya pencampuran sumber, bukan seluruh halaman tidak memakai API.
- Katalog Master memakai fallback `validationStatus: VALID` dan SKU contoh saat respons belum tersedia, gagal, atau kosong (`components/master-data/master-data.tsx:98-127`). Status tersebut tidak membuktikan backend berhasil divalidasi pada saat itu.
- Upgrade what-if disimpan di `adj` dan UI menyatakan ikut dihitung (`components/rencana/plan-pages.tsx:43-47`), tetapi API check mengirim body `{}` dan `adjusted` dinonaktifkan pada API_MODE (`components/rencana/rencana.tsx:61-68,88-101`). Efek upgrade lokal belum masuk evaluasi server.

### 10. SSE mempunyai bug parser dan pemulihan koneksi

`streamEvents` menormalisasi CRLF per chunk sebelum menambahkan ke buffer (`lib/api/events.ts:13-19`). Probe lokal memakai implementasi asli dengan transport mocked membuktikan: frame LF lengkap menghasilkan satu event `plan.decided` dengan id 17; frame logis sama yang CRLF-nya dipotong antar chunk menghasilkan nol event. Ini reproduksi lokal, bukan klaim backend saat ini mengirim format/chunk tersebut.

Saat stream berakhir dengan EOF normal, helper selesai tanpa exception (`lib/api/events.ts:11-12`), tetapi reconnect hanya dijadwalkan di catch dan `streamController` tidak di-reset (`lib/api/resource.ts:45-63`). Caller juga belum menyimpan/mengirim kembali cursor id. Backend SSE berhasil membuka koneksi 200 saat audit; kelulusan pembukaan koneksi tidak membuktikan ketahanan parser/reconnect.

### 11. Permission server belum menjadi sumber gating frontend

Halaman role membaca registri backend, tetapi tombol dan menu masih memanggil matriks `can`/`canOpen` lokal (`lib/roles.ts:51-89,94-124`; `components/shell/app-shell.tsx:105`). Jika izin server berubah atau role baru ditambahkan, tampilan dapat berbeda dengan otorisasi server. Ini risiko konsistensi UI, bukan pembuktian bypass keamanan: backend tetap harus menolak aksi tanpa izin. Perubahan izin dan login role kustom tidak diuji melalui mutasi.

### 12. Makna error dan provenance asisten belum sepenuhnya dipertahankan UI

Trace mengubah kegagalan request menjadi pilihan `unknown` (`components/trace/trace.tsx:99-124`). Chat mempertahankan pesan khusus 401/403, tetapi status gagal lain dapat beralih ke jawaban simulasi (`components/assistant/assistant-chat.tsx:196-217`). Label/notice simulasi memang ditampilkan; tetap perlu membedakan error validasi/rate-limit/server dari pertanyaan tidak dikenal. Shared client sendiri sudah mempertahankan `code`, `field`, `message`, dan `status`; uji langsung 404 pada audit ini lulus.

Chat menyimpan `source` dari respons server (`components/assistant/assistant-chat.tsx:212`), namun renderer belum menampilkan field tersebut (`:267-271`). Ini gap provenance jika sumber tersedia, bukan pelanggaran field wajib OpenAPI karena schema respons chat masih generik. Audit tidak mengirim POST pertanyaan ke backend.

## Pembacaan hasil HTTP yang tidak 200

- `/production/trace` tanpa batch_id/production_group_id: 422 VALIDATION; dengan salah satu parameter valid: 200. Ini validasi input, bukan route hilang.
- `/trace/forward?rtId=RT-17&date=2026-10-13`: 404 NOT_FOUND; contoh yang dipakai FE, RT-04/tanggal sama: 200.
- `/trace/batches/BATCH-20261101-001/volume-chain`: 404; daftar transfer saat audit kosong. Belum ada data yang membuktikan jalur volume-chain untuk batch ini.
- Tiga probe diagnostik path yang tidak ada di dokumen/kode (`/plans/current/explanation`, `/recommendations`, `/production/assets/AT-01`): 404, tidak dianggap regression.
- SSE `/events`: 200, Content-Type text/event-stream, body awal `: connected`. Koneksi dihentikan setelah 4 detik; pengiriman event sesudah mutasi dan reconnect tidak diuji.

## Prioritas tindak lanjut

1. Konfirmasikan Origin deployment aktual dan whitelist CORS backend.
2. Rapikan OpenAPI yang tidak valid; tambahkan tipe array/object dan schema payload yang belum lengkap.
3. Hubungkan simpan kondisi mesin ke backend atau nonaktifkan tombol API yang belum tersimpan; hilangkan fallback VALID dan pencampuran data mock pada tampilan operasional API.
4. Tentukan apakah halaman Produksi akan menjadi batch/daily atau tetap diagram alat; hubungkan API batch jika itu target produk.
5. Sinkronkan status baca notifikasi ke server dan tambahkan tanggal operasi eksplisit pada transfer/trace; konsistenkan snapshot KPI dan pengurutan lintas hari.
6. Perbaiki buffer CRLF/reconnect SSE dan gunakan permission server untuk gating API, tanpa menggantikan otorisasi server.
7. Lengkapi PATCH/DELETE client, CRUD role, prediksi/rekomendasi/output hanya jika fitur memang dibutuhkan; siapkan JWT sebelum MODE=live.
8. Sesudah implementasi, uji browser dengan Origin asli, lint/typecheck/build, dan mutasi pada data uji yang disetujui. Audit ini tidak melakukan pengujian tulis/E2E tersebut.

## Peta lengkap operasi

Kolom runtime merangkum status semua varian GET yang dicoba tanpa Origin. “Belum diuji tulis” sengaja tidak menjalankan mutasi. Referensi berkas adalah posisi pada commit yang diaudit. Query/payload rinci tersedia pada CSV pendamping; request yang tidak dideskripsikan OpenAPI ditandai kosong, bukan ditebak.

### System & Docs

| Metode | Path | Fungsi | Referensi kode | Runtime GET |
| --- | --- | --- | --- | --- |
| GET | `/healthz` | Liveness check | Belum direferensikan | 200 |
| GET | `/readyz` | Readiness check (PostgreSQL ping) | Belum direferensikan | 200 |
| GET | `/docs` | Swagger UI interaktif OpenAPI 3.0 | Belum direferensikan | 200 |
| GET | `/openapi.yaml` | Spesifikasi OpenAPI 3.0.3 (YAML) | Belum direferensikan | 200 |
| GET | `/api/v1/meta` | Metadata server, waktu WIB, mode & label data | `components/filling/filling.tsx:89`; `components/receiving/receiving.tsx:41`; `components/shell/app-shell.tsx:87`; `components/tangki/tangki.tsx:196`; `components/ui/index.tsx:78` | 200 |

### Production & Batch

| Metode | Path | Fungsi | Referensi kode | Runtime GET |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/production/daily` | Query Produksi harian per tanggal (default tanggal operasional aktif) | Belum direferensikan | 200 |
| GET | `/api/v1/production/schedule` | Query Jadwal Produksi harian terurut (production_date, sequence_no) | Belum direferensikan | 200 |
| POST | `/api/v1/production/batches` | Buat batch produksi harian dengan validasi rules & batch_code_rules | Belum direferensikan | Belum diuji tulis |
| GET | `/api/v1/production/batches/{id}/trace` | Trace batch ke processing_transactions dan filling_transactions | Belum direferensikan | 200 |
| GET | `/api/v1/production/trace` | Trace batch berdasarkan batch_id atau production_group_id | Belum direferensikan | 200, 422 |
| GET | `/api/v1/production/assets` | Daftar Alat dari asset_current_status_view (default 63 aset operasional, tanpa PIPE-01..PIPE-10) | Belum direferensikan | 200 |
| POST | `/api/v1/production/assets/{id}/status` | Catat perubahan status/kondisi alat ke asset_status_events | Belum direferensikan | Belum diuji tulis |
| GET | `/api/v1/production/products` | Master Produk terpisah dari Alat (products, finished_skus, pack_size_codes, variants) | Belum direferensikan | 200 |
| GET | `/api/v1/production/plans` | Rencana produksi mingguan dan hubungannya ke production_batches | Belum direferensikan | 200 |
| GET | `/api/v1/production/predictions` | Hasil prediksi pemenuhan (fulfillment_predictions) | Belum direferensikan | 200 |
| POST | `/api/v1/production/predictions/run` | Jalankan prediksi pemenuhan berbasis fakta & generate recommendations | Belum direferensikan | Belum diuji tulis |
| GET | `/api/v1/production/recommendations` | Daftar rekomendasi terstruktur (recommendations) | Belum direferensikan | 200 |
| PATCH | `/api/v1/production/recommendations/{id}` | Ubah status rekomendasi (draft, accepted, rejected, applied) | Belum direferensikan | Belum diuji tulis |
| GET | `/api/v1/production/outputs` | Daftar output produksi (rantai volume) | Belum direferensikan | 200 |
| POST | `/api/v1/production/outputs` | Catat output produksi baru | Belum direferensikan | Belum diuji tulis |
| GET | `/api/v1/production/aseptic-tanks` | Daftar tangki aseptik (legacy static) | `components/filling/filling.tsx:84`; `components/simulasi/plant-scene.tsx:81`; `components/simulasi/simulasi.tsx:37` | 200 |
| GET | `/api/v1/production/changeover-matrix` | Matriks changeover (legacy static) | `components/filling/filling.tsx:87` | 200 |
| GET | `/api/v1/production/fillers` | Daftar filler (legacy static) | `components/filling/filling.tsx:85`; `components/pasokan/pasokan.tsx:75`; `components/simulasi/plant-scene.tsx:82`; `components/simulasi/simulasi.tsx:38` | 200 |
| GET | `/api/v1/production/unit-states` | Status unit (legacy static) | `components/filling/filling.tsx:86` | 200 |

### Master & Graph

| Metode | Path | Fungsi | Referensi kode | Runtime GET |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/master` | Ringkasan katalog master Greenfields | `components/master-data/master-data.tsx:92` | 200 |
| GET | `/api/v1/master/assets` | Master aset CSV | `components/master-data/master-data.tsx:93` | 200 |
| GET | `/api/v1/master/connections` | Master koneksi antar aset CSV | `components/master-data/master-data.tsx:94` | 200 |
| GET | `/api/v1/master/topology` | Topologi rute pabrik | Belum direferensikan | 200 |
| GET | `/api/v1/master/products` | Master produk CSV | Belum direferensikan | 200 |
| GET | `/api/v1/master/finished-skus` | Master finished SKU CSV | `components/master-data/master-data.tsx:95`; `components/penjadwalan/penjadwalan-api.tsx:33` | 200 |
| GET | `/api/v1/master/lines` | Master dedikasi & kompatibilitas line CSV | `components/kondisi-alat/downtime-api.tsx:36`; `components/master-data/master-data.tsx:96` | 200 |
| GET | `/api/v1/master/rules` | Master aturan changeover | `components/constraint/constraint.tsx:116` | 200 |
| POST | `/api/v1/master/changeover/classify` | Klasifikasi jenis changeover antara dua SKU | `components/master-data/master-data.tsx:159` | Belum diuji tulis |
| GET | `/api/v1/graph` | Graph topologi aset lengkap | `components/graph/context-graph.tsx:172`; `components/trace/evidence-graph.tsx:36` | 200 |
| GET | `/api/v1/graph/subgraph` | Subgraph dari node tertentu | Belum direferensikan | 200 |
| GET | `/api/v1/assets` | Daftar aset skenario (kompatibel dengan tangki.tsx FE) | `components/tangki/tangki.tsx:192` | 200 |
| GET | `/api/v1/assets/cip-log` | Log CIP aset | `components/tangki/tangki.tsx:193` | 200 |
| GET | `/api/v1/assets/cip-policy` | Kebijakan interval CIP tangki | `components/tangki/tangki.tsx:194` | 200 |
| GET | `/api/v1/assets/mid-tanks` | Daftar mid tanks | `components/simulasi/plant-scene.tsx:83`; `components/simulasi/simulasi.tsx:39`; `components/tangki/tangki.tsx:195` | 200 |
| GET | `/api/v1/site/layout` | Layout site pabrik | `components/simulasi/plant-scene.tsx:79`; `components/simulasi/simulasi.tsx:32` | 200 |
| GET | `/api/v1/site/status` | Status operasional site | `components/simulasi/plant-scene.tsx:80`; `components/simulasi/simulasi.tsx:33`; `components/simulasi/simulasi.tsx:34`; `components/simulasi/simulasi.tsx:35` | 200 |
| GET | `/api/v1/site/bottlenecks` | Daftar bottleneck site | `components/beranda/beranda-api.tsx:122`; `components/simulasi/simulasi.tsx:36` | 200 |

### Supply & Receiving

| Metode | Path | Fungsi | Referensi kode | Runtime GET |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/scenario/november` | Snapshot skenario aktif 1 November 2026 lengkap | Belum direferensikan | 200 |
| GET | `/api/v1/scenario/november/tanks` | Snapshot 28 tangki Opening Inventory 1 Nov 2026 06.00 WIB | `lib/api/scenario-nov.ts:28` | 200 |
| GET | `/api/v1/receiving` | Ringkasan penerimaan susu harian | `components/lab/lab.tsx:47`; `components/receiving/receiving.tsx:40` | 200 |
| GET | `/api/v1/sources` | Daftar sumber susu | `components/ui/index.tsx:51` | 200 |
| GET | `/api/v1/sources/{id}` | Detail sumber susu | `components/ui/index.tsx:56` | 200 |
| GET | `/api/v1/supply/farms` | Agregat pasokan per farm dari state kedatangan RT | `components/pasokan/pasokan.tsx:71` | 200 |
| GET | `/api/v1/supply/trend` | Tren pasokan susu | `components/pasokan/pasokan.tsx:73` | 200 |
| GET | `/api/v1/supply/demand-plan` | Rencana kebutuhan susu dari PO aktif | `components/pasokan/pasokan.tsx:72` | 200 |
| GET | `/api/v1/supply/demand-sends` | Riwayat pengiriman demand ke farm | `components/pasokan/pasokan.tsx:74` | 200 |
| POST | `/api/v1/supply/demand/send` | Kirim demand ke farm | `lib/api/actions.ts:12` | Belum diuji tulis |
| GET | `/api/v1/supply/rt-arrivals` | Daftar jadwal kedatangan RT | `components/beranda/beranda-api.tsx:120`; `components/beranda/role-api.tsx:160`; `components/kedatangan/kedatangan.tsx:32` | 200 |
| POST | `/api/v1/supply/rt-arrivals` | Tambah jadwal kedatangan RT | `components/kedatangan/kedatangan.tsx:153` | Belum diuji tulis |
| PUT | `/api/v1/supply/rt-arrivals/{id}` | Perbarui status/ETA kedatangan RT | `components/kedatangan/kedatangan.tsx:154` | Belum diuji tulis |
| POST | `/api/v1/supply/rt-arrivals/import` | Import CSV jadwal kedatangan RT (dry-run & commit) | `components/kedatangan/kedatangan.tsx:112` | Belum diuji tulis |
| GET | `/api/v1/balance/daily` | Neraca volume harian historis Greenfields | `components/transfer/neraca-harian-api.tsx:22`; `components/transfer/neraca-harian-api.tsx:26` | 200 |
| GET | `/api/v1/data-sources` | Status sumber data integrasi | `components/beranda/beranda-api.tsx:123`; `components/beranda/role-api.tsx:51`; `components/sumber-data/sumber-data.tsx:16` | 200 |
| POST | `/api/v1/data-sources/{id}/test` | Uji koneksi sumber data | `components/sumber-data/sumber-data.tsx:77` | Belum diuji tulis |
| POST | `/api/v1/data-sources/{id}/sync` | Sinkronisasi sumber data | `components/sumber-data/sumber-data.tsx:99` | Belum diuji tulis |

### Planning

| Metode | Path | Fungsi | Referensi kode | Runtime GET |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/pos` | Daftar Production Order (demand) | `components/beranda/role-api.tsx:116`; `components/penjadwalan/penjadwalan-api.tsx:31`; `components/radar/radar-jadwal.tsx:26` | 200 |
| POST | `/api/v1/pos` | Buat Production Order baru | `components/penjadwalan/penjadwalan-api.tsx:235` | Belum diuji tulis |
| POST | `/api/v1/pos/import` | Import CSV Production Order (dry-run & commit) | `components/penjadwalan/penjadwalan-api.tsx:109` | Belum diuji tulis |
| GET | `/api/v1/schedules` | Riwayat versi jadwal produksi | Belum direferensikan | 200 |
| GET | `/api/v1/schedules/latest` | Jadwal produksi versi terbaru (untuk Radar Kualitas Jadwal) | `components/beranda/beranda-api.tsx:65`; `components/beranda/beranda-api.tsx:118`; `components/beranda/executive-api.tsx:107`; `components/beranda/role-api.tsx:117`; `components/beranda/role-api.tsx:234`; `components/penjadwalan/penjadwalan-api.tsx:32`; `components/radar/radar-jadwal.tsx:25` | 200 |
| POST | `/api/v1/schedules/generate` | Generate jadwal produksi dari PO aktif | `components/penjadwalan/penjadwalan-api.tsx:56` | Belum diuji tulis |
| POST | `/api/v1/schedules/triggers` | Catat pemicu regenerasi jadwal | `components/penjadwalan/penjadwalan-api.tsx:197` | Belum diuji tulis |
| POST | `/api/v1/schedules/narrate` | Narasi jadwal oleh AI | `components/penjadwalan/penjadwalan-api.tsx:60` | Belum diuji tulis |
| GET | `/api/v1/plans` | Daftar rencana skenario | `components/constraint/constraint.tsx:115`; `components/rencana/rencana-state.tsx:34` | 200 |
| GET | `/api/v1/plans/{id}` | Detail rencana skenario | `components/filling/filling.tsx:88`; `components/tangki/tangki.tsx:197` | 200 |
| POST | `/api/v1/plans/{id}/check` | Cek kelayakan rencana terhadap limits | `components/constraint/constraint.tsx:146`; `components/filling/filling.tsx:96`; `components/receiving/receiving.tsx:48`; `components/rencana/rencana.tsx:64`; `components/tangki/tangki.tsx:204` | Belum diuji tulis |
| POST | `/api/v1/plans/{id}/solve` | Jalankan solver rencana | Belum direferensikan | Belum diuji tulis |
| POST | `/api/v1/plans/{id}/decision` | Simpan keputusan planner atas rencana | `lib/api/actions.ts:6` | Belum diuji tulis |
| GET | `/api/v1/plans/{id}/instructions` | Daftar instruksi kerja untuk rencana | `components/tangki/tangki.tsx:96`; `lib/demo.ts:179` | 200 |
| POST | `/api/v1/instructions/{id}/ack` | Konfirmasi (ack) instruksi kerja | `lib/api/actions.ts:10` | Belum diuji tulis |
| GET | `/api/v1/decisions` | Daftar keputusan rencana | `lib/demo.ts:176` | 200 |
| GET | `/api/v1/limits` | Batas operasional aktif | `lib/demo.ts:180` | 200 |
| PUT | `/api/v1/limits` | Ubah batas operasional | `lib/api/actions.ts:11` | Belum diuji tulis |
| GET | `/api/v1/limits/schema` | Skema parameter limits | `components/constraint/constraint.tsx:114` | 200 |
| GET | `/api/v1/shifts` | Daftar shift operasional | Belum direferensikan | 200 |

### Traceability & Volume

| Metode | Path | Fungsi | Referensi kode | Runtime GET |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/trace/history` | Daftar group trace historis Greenfields | `components/riwayat/riwayat-produksi.tsx:39` | 200 |
| GET | `/api/v1/trace/history/backward` | Trace backward satu production group historis | `components/riwayat/riwayat-produksi.tsx:51` | 200 |
| GET | `/api/v1/trace/transfers` | Daftar catatan transfer volume | `components/beranda/role-api.tsx:161`; `lib/flows.ts:57` | 200 |
| POST | `/api/v1/trace/transfers` | Catat transfer volume baru | `lib/flows.ts:68` | Belum diuji tulis |
| GET | `/api/v1/trace/assets/{ref}/volume` | Saldo volume per aset dari transfer | `lib/api/asset-volume.ts:15` | 200 |
| GET | `/api/v1/trace/batches/{batch_id}/volume-chain` | Rantai volume satu batch | Belum direferensikan | 404 |
| GET | `/api/v1/trace/backward` | Trace backward per lotId | `components/trace/trace.tsx:44`; `components/trace/trace.tsx:103` | 200 |
| GET | `/api/v1/trace/forward` | Trace forward per rtId & date | `components/trace/trace.tsx:41`; `components/trace/trace.tsx:106` | 200, 404 |
| GET | `/api/v1/trace/explain` | Penjelasan state resource pada waktu tertentu | `components/trace/trace.tsx:108` | 200 |
| GET | `/api/v1/trace/handoffs` | Handoffs per lotId | `components/trace/trace.tsx:47` | 200 |
| GET | `/api/v1/lots/locations` | Lokasi banyak lot (maks 100 ids) | `components/hold/hold.tsx:40`; `components/trace/trace.tsx:58` | 200 |

### Quality

| Metode | Path | Fungsi | Referensi kode | Runtime GET |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/holds` | Daftar QA hold lot | `components/beranda/beranda-api.tsx:66`; `components/beranda/beranda-api.tsx:119`; `components/beranda/role-api.tsx:273`; `components/hold/hold.tsx:27`; `components/trace/trace.tsx:46`; `lib/demo.ts:177` | 200 |
| POST | `/api/v1/holds` | Ajukan QA hold lot baru | `lib/api/actions.ts:7` | Belum diuji tulis |
| GET | `/api/v1/holds/summary` | Ringkasan baseline hold | `components/hold/hold.tsx:28`; `components/trace/trace.tsx:45` | 200 |
| POST | `/api/v1/holds/{id}/review` | Review keputusan QA hold | `lib/api/actions.ts:8` | Belum diuji tulis |
| GET | `/api/v1/holds/{id}/genealogy` | Genealogy lot yang di-hold | `components/trace/genealogy.tsx:39` | 200 |
| GET | `/api/v1/quality/active-event` | Event QC aktif | `components/trace/trace.tsx:39` | 200 |
| GET | `/api/v1/lab/results` | Daftar hasil uji lab | `components/beranda/role-api.tsx:202`; `components/beranda/role-api.tsx:272`; `components/lab/lab.tsx:44`; `lib/demo.ts:178` | 200 |
| GET | `/api/v1/lab/summary` | Ringkasan antrean & hasil lab | `components/lab/lab.tsx:45` | 200 |
| POST | `/api/v1/lab/results/{id}/decision` | Keputusan rilis/reject hasil lab | `lib/api/actions.ts:9` | Belum diuji tulis |

### Downtime

| Metode | Path | Fungsi | Referensi kode | Runtime GET |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/downtime-events` | Daftar kejadian downtime alat | `components/beranda/beranda-api.tsx:121`; `components/beranda/executive-api.tsx:129`; `components/beranda/role-api.tsx:233`; `components/kondisi-alat/downtime-api.tsx:35` | 200 |
| POST | `/api/v1/downtime-events` | Catat kejadian downtime baru | `components/kondisi-alat/downtime-api.tsx:132` | Belum diuji tulis |
| GET | `/api/v1/downtime-events/prediction` | Prediksi downtime berikutnya per resource | `components/kondisi-alat/downtime-api.tsx:49` | 200 |
| GET | `/api/v1/maintenance/recommendation` | Rekomendasi jendela maintenance alat | `components/kondisi-alat/downtime-api.tsx:50` | 200 |
| GET | `/api/v1/costs` | Ringkasan biaya produksi & operasional | `components/beranda/role-api.tsx:54` | 200 |
| GET | `/api/v1/costs/items` | Daftar item biaya | Belum direferensikan | 200 |
| POST | `/api/v1/costs/items` | Tambah/ubah item biaya | Belum direferensikan | Belum diuji tulis |
| GET | `/api/v1/dashboard/executive` | Dashboard eksekutif (penerimaan | `components/beranda/beranda-api.tsx:32`; `components/beranda/executive-api.tsx:27`; `components/beranda/executive-api.tsx:49`; `components/beranda/executive-api.tsx:161`; `components/beranda/role-api.tsx:118`; `components/beranda/role-api.tsx:235`; `components/radar/radar-jadwal.tsx:27` | 200 |

### AI Assistant

| Metode | Path | Fungsi | Referensi kode | Runtime GET |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/assistant/templates` | Daftar template pertanyaan asisten | `components/trace/trace.tsx:40` | 200 |
| POST | `/api/v1/assistant/ask` | Tanya asisten berbasis fakta terstruktur | `components/trace/trace.tsx:110` | Belum diuji tulis |
| POST | `/api/v1/assistant/narrate` | Narasi batch oleh LLM | Belum direferensikan | Belum diuji tulis |
| POST | `/api/v1/assistant/chat` | Chat asisten operasional | `components/assistant/assistant-chat.tsx:197` | Belum diuji tulis |

### Roles

| Metode | Path | Fungsi | Referensi kode | Runtime GET |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/session` | Informasi sesi & peran aktif | `components/shell/app-shell.tsx:89`; `lib/demo.ts:175` | 200 |
| POST | `/api/v1/session/role` | Ganti peran demo aktif (MODE=demo) | `lib/api/actions.ts:13` | Belum diuji tulis |
| GET | `/api/v1/roles` | Registri role & hak akses | `components/beranda/role-api.tsx:52`; `components/role-akses/role-akses-api.tsx:18` | 200 |
| POST | `/api/v1/roles` | Tambah role kustom | Belum direferensikan | Belum diuji tulis |
| PUT | `/api/v1/roles/{role_id}` | Ubah role kustom | Belum direferensikan | Belum diuji tulis |
| DELETE | `/api/v1/roles/{role_id}` | Hapus role kustom | Belum direferensikan | Belum diuji tulis |
| GET | `/api/v1/permissions` | Daftar seluruh permission sistem | `components/role-akses/role-akses-api.tsx:19` | 200 |
| GET | `/api/v1/notifications` | Daftar notifikasi operasional & status baca per akun | `components/shell/app-shell.tsx:88` | 200 |
| POST | `/api/v1/notifications/{id}/read` | Tandai satu notifikasi terbaca | Belum direferensikan | Belum diuji tulis |
| POST | `/api/v1/notifications/read-all` | Tandai seluruh notifikasi terbaca | Belum direferensikan | Belum diuji tulis |
| GET | `/api/v1/audit` | Log audit immutable | `components/beranda/role-api.tsx:53`; `components/persetujuan/persetujuan.tsx:32`; `lib/demo.ts:181` | 200 |
| GET | `/api/v1/audit.csv` | Ekspor log audit dalam format CSV | `components/persetujuan/persetujuan.tsx:52` | 200 |
| GET | `/api/v1/events` | Stream SSE real-time domain events | `lib/api/events.ts:5` | 200 |
| POST | `/api/v1/demo/reset` | Reset data demo (butuh permission role.manage) | `lib/api/actions.ts:14` | Belum diuji tulis |

