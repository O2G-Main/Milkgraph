# Kondisi Pabrik

Halaman `/kondisi-pabrik` berada di Operasional, di samping Penjadwalan. Produksi tetap berada di Master.

## Sumber dan batas data

- `GET /production/assets`: katalog dan catatan status terakhir, alasan, sumber, serta waktu observasi. Status bukan telemetri langsung dan tidak menjadi historis saat tanggal jadwal diganti.
- `GET /master/topology`: node, rute konfigurasi, dan ilustrasi alat 2D/3D. Node konfigurasi yang tidak ada dalam katalog operasional tidak dianggap alat dengan status normal.
- `GET /production/schedule?date=YYYY-MM-DD`: penugasan berdasarkan ID `filling_line_id`, `aseptic_tank_id`, `sterilizer_id`. Tidak menyimpulkan alat sedang berjalan, konflik waktu, atau jam mulai/selesai dari urutan jadwal.
- `GET /downtime-events`: lima catatan terbaru dengan `resource_id` sama, lintas tanggal, menyertakan jenis dan sumber.

Tanggal awal adalah hari ini di Asia/Jakarta. Parameter `date` dan `batch` memungkinkan tautan dari detail batch di Penjadwalan. Kembali ke Penjadwalan mempertahankan tanggal. Tanggal kosong tidak mengirim permintaan jadwal tanpa tanggal. Batch yang tidak ditemukan dan ID alat yang tidak cocok ditandai secara eksplisit.

Sorotan mengikuti batch terpilih atau seluruh jadwal hari itu. Label jumlah batch pada kartu selalu menghitung seluruh tanggal, sehingga penggunaan alat oleh batch lain tetap terlihat. Target dalam dialog hanya menjumlahkan baris yang terkait alat tersebut, dengan deduplikasi jadwal yang sama.

Status teks bebas dari backend dipertahankan. Warna hanya diterapkan untuk kosakata siap/berjalan, perawatan/CIP, gangguan/berhenti yang dikenali; nilai lain netral. Waktu catatan selalu menyertakan tahun dan menggunakan WIB. Perhatian operasional adalah irisan penugasan dan status gangguan/perawatan yang dikenali, bukan perhitungan kelayakan atau prediksi baru.

Halaman hanya membaca data. Tidak menulis perubahan jadwal, status alat, atau keputusan produksi. Mode demo tidak menyajikan data buatan sebagai kondisi aktual. Kesalahan sumber dibedakan dari sumber kosong; angka yang belum dapat dipastikan tidak ditampilkan sebagai nol.

## Verifikasi

- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.
- `node tests/factory-monitor-browser.mjs` (dev API di port 3105; `BASE_URL` dapat diganti). Seluruh API diintersep dengan fixture dan operasi selain GET ditolak. Memeriksa tanggal/batch, ID tepat, status kosong/tidak dikenal, downtime, pembaruan status, kegagalan muat, tautan dua arah, dialog melalui keyboard dan pemulihan fokus, 2D/3D/rute, serta lebar 320/768/1024/1440 px.
- Pengujian API langsung hanya GET pada 28 November 2026 WIB: 63 alat, 28 catatan status, 63 node topologi, 6 baris jadwal tanggal 1 November 2026, tanpa catatan downtime. Pemeriksaan browser lolos pada empat lebar tersebut. Angka ini adalah hasil observasi, bukan konstanta aplikasi.

React Flow 12 memerlukan dimensi hasil pengukuran disimpan pada controlled nodes. Diagram mempertahankannya melalui `onNodesChange` agar pemilihan alat tidak menyembunyikan ulang node dan menghilangkan fokus keyboard.
