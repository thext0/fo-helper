# Changelog

## [0.1.2] - 2026-10-01

Penyelesaian alur operasional Front Office V1 dengan modul Housekeeping, In-House Folio, dan peningkatan performa penyimpanan.

### Perubahan utama

- Menambahkan dashboard Housekeeping untuk memantau status kamar, menjalankan transisi status sesuai SOP, mencatat PIC pembersihan, dan menyimpan catatan kamar.
- Menambahkan halaman In-House Folio untuk mengelola tamu aktif, termasuk check-out, pindah kamar, perpanjangan, dan koreksi pembayaran.
- Memisahkan transaksi aktif dari riwayat pasif serta memperjelas ID transaksi dan status check-out agar kunjungan lama tidak keliru ditandai In-House.
- Menambahkan DataProvider global agar komponen berbagi data aplikasi dan mengurangi pengambilan database berulang.
- Meningkatkan backend dengan cache memory, antrean penulisan asinkron dan atomik, serta backup debounce dengan rotasi maksimal tiga file.
- Menyempurnakan pengamanan PIN Pengaturan, data kontak pelanggan, kuantitas tagihan ekstra, dan validasi keseimbangan pembayaran.
- Memperbaiki reset seluruh state form check-in setelah penyimpanan berhasil.

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
