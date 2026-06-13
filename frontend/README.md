# FO HELPER - DEVELOPMENT & ARCHITECTURE LOG

**Last Updated:** Sistem FO Helper (React Frontend + Express/JSON Backend)  
**Environment:** Localhost (Offline/LAN) - React Vite, Node.js, date-fns, Tailwind CSS

---

## 1. SYSTEM ARCHITECTURE & CORE LOGIC
* **Backend:** Express.js (`server.js`) berjalan di port 5000. Data disimpan murni di lokal: `/data/database.json`.
* **Auto-Backup:** Sistem backend memiliki fungsi Auto-Backup yang menduplikasi file JSON saat `POST /api/data/save` dipanggil, dengan aturan rotasi maksimal 3 file (backup tertua otomatis dihapus).
* **Frontend:** React SPA (Single Page Application).
* **Aturan Operasional Baku (The 12:00 Rule):**
    * Pergantian hari operasional (tutup buku / rollover tanggal) selalu terjadi pada pukul 12:00 siang.
    * Semua transaksi (Check-in atau kalkulasi harga) yang terjadi antara pukul 00:00 hingga 11:59 pagi akan dihitung sebagai bagian dari tanggal hari sebelumnya.
* **Komponen Utama:** `App.jsx`, `FormCheckIn.jsx`, `RiwayatTransaksi.jsx`, `DatabasePelanggan.jsx`, `DashboardKamar.jsx`, dan `Settings.jsx`.

---

## 2. COMPLETED FEATURES & LOGIC (DONE)
* ✅ **Sistem Keamanan Data & Validasi:** Anti Double-Booking, Time Paradox Blocker, Proteksi Deposit.
* ✅ **Denah Kamar Visual:** Pengaturan lantai dan status indikator "Aktif" secara real-time.
* ✅ **Smart Check-Out & Kalkulasi Waktu:** C/O Instan Kos real-time, kompensasi kuota malam, dan Edit Time-Lock.
* ✅ **Dynamic Pricing (Weekday vs Weekend):** Sistem penentuan harga berdasar hari kalender dengan kemampuan looping mandiri per-malam.
* ✅ **CRM / Database Pelanggan Terpadu:** Grouping data tamu, historis inap, dan Smart Search Autocomplete.
* ✅ **Multi-Payment (Akomodasi):** Pembayaran split-payment dengan validasi ketat.
* ✅ **Dashboard Laporan & WA Generator:** Rekap kasir EOD dan teks laporan otomatis.
* ✅ **A5 Print Layout & Rincian Struk Per-Malam:** Kuitansi dioptimasi untuk EPSON LX-310. Tabel biaya sewa otomatis me-looping rincian harga per malam secara transparan, dan metode bayar dirapikan menjadi baris pelunasan di bagian bawah.
* ✅ **Advanced Analytics & Export:** Dasbor Rekap Pendapatan (Bulan/Tahun), perhitungan auto-fit kolom, dan tombol Export otomatis ke file asli .xlsx yang memisahkan kolom waktu Check-In/Out serta deposit jaminan.
* ✅ **Visibilitas Jenis Kelamin:** Mengakomodasi dan menampilkan parameter jenis kelamin (Laki-laki, Perempuan, Lain-lain) pelanggan di antarmuka tabel, form check-in, dan form kelola biodata pelanggan.
* ✅ **Sistem Sorting Tabel Terpadu:** Pengurutan tabel interaktif (Ascending/Descending) pada Riwayat Transaksi berdasarkan Nama, Gender, Tipe Inap, Waktu Masuk, dan Status, dilengkapi dengan logika *Secondary Sort* (Tie-Breaker) otomatis berdasarkan waktu kedatangan terbaru.

---

## 3. TO-DO LIST & PLANNED FEATURES (WAITLIST / ROADMAP)

### ⚡ PRIORITAS 1: Advanced Dynamic Pricing (CURRENT FOCUS)
* Harga Spesial Tanggal Merah/Libur Nasional.
* Harga Khusus berdasarkan jalur pemesanan (OTA vs Walk-in).

### 🎯 PRIORITAS 2: Operasional Master Data & Kustomisasi
* **Master Data Tagihan Tambahan:** Memindahkan input manual Extra Bed/Laundry ke menu Settings agar bisa dipilih otomatis lewat dropdown.
* **Standarisasi Profesi CRM:** Membuat opsi data khusus/baku untuk profesi tamu.
* **Pengaturan Jam Khusus:** Setting Jam Rollover 12 Siang menjadi dinamis dan Setting Jam Reset Laporan WA.

### 🎯 PRIORITAS 3: Flow Ralat Keuangan & Promosi
* **Sistem Void Transaksi via Email:** Mengganti opsi "Hapus" (Hard Delete) menjadi pembatalan transaksi (Void) yang membutuhkan input PIN keamanan otomatis yang dikirimkan ke email Gmail atasan/owner.
* **Proteksi Extend Inap:** Mewajibkan input metode pembayaran baru saat tamu merubah/menambah malam inap (ralat waktu) agar laporan penerimaan uang kasir tidak bocor.
* **Sistem Diskon:** Fitur potongan harga (Nominal/Persen) di form Check-in.

### 🎯 PRIORITAS 4: UI/UX & Manajemen Internal
* Toggle Dark Mode / Light Mode untuk antarmuka pengguna. *(Status: Ditunda sementara untuk menjaga stabilitas UI)*.
* Tab Manajemen HR/Karyawan di halaman database.

---

## 🚀 ULTIMATE VISION (Future Tech)
* **Integrasi Scanner Hardware:** Fitur memindai KTP fisik lewat printer/scanner untuk diterjemahkan oleh OCR (Optical Character Recognition) dan mengisi input box biodata tamu secara instan tanpa ketik manual.