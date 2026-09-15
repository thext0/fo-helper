# Changelog

## [0.1.1] - 2026-09-15

Peningkatan UI/UX dan perapihan arsitektur halaman operasional FO Helper.

### Perubahan utama

- Menambahkan `CustomDateTimePicker` untuk menggantikan input kalender bawaan browser pada form check-in, database pelanggan, riwayat transaksi, dan laporan finansial.
- Memperbaiki posisi dan tampilan pop-up kalender agar tidak terpotong di tepi halaman atau modal.
- Mengubah Pengaturan dan Laporan Finansial dari modal menjadi tab halaman penuh agar ruang kerja lebih luas dan navigasi lebih nyaman.
- Memisahkan dashboard analitik finansial ke komponen `LaporanFinansial` untuk mengurangi beban render pada riwayat transaksi.
- Menambahkan dialog terpusat untuk alur konfirmasi dan peringatan di antarmuka.
- Menyempurnakan integrasi form dan tampilan data pelanggan serta transaksi agar konsisten dengan komponen UI baru.

## [0.1.0] - 2026-09-13

Rilis awal FO Helper sebagai sistem operasional front office hotel berbasis React dan Express.

### Perubahan utama

- Menambahkan dashboard kamar dengan status kamar dan pengaturan lantai secara real-time.
- Menambahkan alur check-in, check-out, perpanjangan inap, kalkulasi durasi, deposit, dan harga dinamis weekday/weekend.
- Menambahkan validasi anti double-booking, time paradox, dan perlindungan deposit.
- Menambahkan database pelanggan terpadu dengan pencarian, riwayat inap, dan informasi jenis kelamin.
- Menambahkan riwayat transaksi dengan sorting, dashboard finansial, filter periode, dan ekspor laporan Excel.
- Menambahkan dukungan pembayaran split-payment serta rincian biaya per malam.
- Menambahkan laporan dan generator teks WhatsApp untuk rekap kasir.
- Menambahkan layout cetak kuitansi A5 untuk printer Epson LX-310.
- Menambahkan backend Express dengan penyimpanan JSON lokal dan rotasi tiga backup otomatis.
- Memperbaiki latar abu-abu dan backdrop gelap pada hasil cetak kuitansi.
