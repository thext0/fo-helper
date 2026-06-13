import { useState, useEffect } from 'react';
import { format, differenceInDays, addDays } from 'date-fns';
import * as XLSX from 'xlsx';

const formatRp = (angka) => {
  return Number(angka || 0).toLocaleString('id-ID');
};

const toTitleCase = (str) => {
  if (!str) return '';
  return str.toLowerCase().replace(/\b\w/g, s => s.toUpperCase());
};

export default function RiwayatTransaksi() {
  const [transactions, setTransactions] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('Semua');

  // STATE UNTUK SORTING TABEL (Default: Waktu Masuk, Terbaru ke Terlama)
  const [sortConfig, setSortConfig] = useState({ key: 'waktuMasuk', direction: 'desc' });

  // PRINT STATE
  const [printData, setPrintData] = useState(null);
  
  // EDIT/RALAT STATE
  const [editModal, setEditModal] = useState({ isOpen: false, data: null });
  const [editDurasiMalam, setEditDurasiMalam] = useState(1);
  const [editWaktuKeluar, setEditWaktuKeluar] = useState('');
  const [editNoKamar, setEditNoKamar] = useState('');
  const [editStatusDeposit, setEditStatusDeposit] = useState('');
  const [editInfo, setEditInfo] = useState('');
  const [editJenisKelamin, setEditJenisKelamin] = useState(''); 
  const [isSaving, setIsSaving] = useState(false);

  // DASHBOARD FINANSIAL STATE
  const [isFinancialModalOpen, setIsFinancialModalOpen] = useState(false);
  const [finData, setFinData] = useState([]);
  const [pendapatanBulanIni, setPendapatanBulanIni] = useState(0);

  // Load Data
  const fetchData = async () => {
    try {
      const res = await fetch('http://localhost:5000/api/data');
      if (res.ok) {
        const data = await res.json();
        const harian = (data.dailyTransactions || []).map(tx => ({ ...tx, type: 'harian' }));
        const kos = (data.activeKost || []).map(k => ({ ...k, type: 'kos' }));
        
        const allTx = [...harian, ...kos];
        setTransactions(allTx);
      }
    } catch (error) {
      console.error("Gagal mengambil data transaksi:", error);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchData();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  // LOGIKA SORTING (Pengurutan Dinamis + Secondary Sort Cerdas)
  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getSortIndicator = (key) => {
    if (sortConfig.key !== key) return '↕️';
    return sortConfig.direction === 'asc' ? '⬆️' : '⬇️';
  };

  // LOGIKA DASHBOARD FINANSIAL
  const openFinancialModal = async () => {
    try {
      const res = await fetch('http://localhost:5000/api/data');
      if (!res.ok) throw new Error("Gagal mengambil data");
      const data = await res.json();
      
      const harian = (data.dailyTransactions || []).map(tx => ({ ...tx, type: 'harian' }));
      const kos = (data.activeKost || []).map(k => ({ ...k, type: 'kos' }));
      const allTx = [...harian, ...kos];
      
      setFinData(allTx);
      
      const currentMonth = new Date().getMonth();
      const currentYear = new Date().getFullYear();
      
      const total = allTx.filter(tx => {
        const txDate = new Date(tx.waktuInput);
        return txDate.getMonth() === currentMonth && txDate.getFullYear() === currentYear;
      }).reduce((sum, tx) => {
        const sewa = tx.pembayaran?.jumlahKamar || 0;
        const tambahan = (tx.pembayaran?.tambahan || []).reduce((acc, curr) => acc + (curr.jumlah || 0), 0);
        return sum + sewa + tambahan;
      }, 0);
      
      setPendapatanBulanIni(total);
      setIsFinancialModalOpen(true);
    } catch (err) {
      console.error("Error Dasbor Finansial:", err);
      alert("Gagal memuat data keuangan.");
    }
  };

  const handleExportExcel = () => {
    // Export data diurutkan dari yang terbaru
    const sortedData = [...finData].sort((a, b) => new Date(b.waktuInput) - new Date(a.waktuInput));

    const rows = sortedData.map(tx => {
      const total = (tx.pembayaran?.jumlahKamar || 0) + (tx.pembayaran?.tambahan || []).reduce((sum, item) => sum + item.jumlah, 0);
      
      let wMasuk, wKeluar;
      if (tx.type === 'harian') {
        wMasuk = new Date(tx.checkIn);
        wKeluar = new Date(tx.checkOut);
      } else {
        wMasuk = new Date(tx.periodeStart);
        wKeluar = new Date((tx.periodeEnd || format(new Date(), 'yyyy-MM-dd')) + 'T12:00:00');
      }

      const isValidMasuk = !isNaN(wMasuk);
      const isValidKeluar = !isNaN(wKeluar);

      const tglMasuk = isValidMasuk ? format(wMasuk, 'yyyy-MM-dd') : '-';
      const jamMasuk = isValidMasuk ? format(wMasuk, 'HH:mm') : '-';
      const tglKeluar = isValidKeluar ? format(wKeluar, 'yyyy-MM-dd') : '-';
      const jamKeluar = isValidKeluar ? format(wKeluar, 'HH:mm') : '-';

      let bayarCash = 0;
      let bayarQRIS = 0;
      let bayarTransfer = 0;

      if (tx.pembayaran?.detailMetodeKamar?.length > 0) {
        tx.pembayaran.detailMetodeKamar.forEach(m => {
          const met = m.metode.toLowerCase();
          if (met.includes('cash')) bayarCash += m.nominal;
          else if (met.includes('qris')) bayarQRIS += m.nominal;
          else if (met.includes('transfer')) bayarTransfer += m.nominal;
        });
      } else {
        const met = (tx.pembayaran?.metodeKamar || '').toLowerCase();
        if (met.includes('cash')) bayarCash += total;
        else if (met.includes('qris')) bayarQRIS += total;
        else if (met.includes('transfer')) bayarTransfer += total;
      }

      const depositNominal = tx.pembayaran?.jumlahDeposit || 0;
      const depositMetode = tx.pembayaran?.metodeDeposit || '-';

      return {
        'ID Transaksi': tx.id,
        'Tipe': tx.tipeInap ? toTitleCase(tx.tipeInap) : (tx.type === 'kos' ? 'Kos' : 'Harian'),
        'Nama Tamu': tx.nama,
        'Jenis Kelamin': tx.jenisKelamin || '-',
        'No. Kamar': tx.noKamar || tx.roomNumber,
        'Tanggal Check In': tglMasuk,
        'Jam Check In': jamMasuk,
        'Tanggal Check Out': tglKeluar,
        'Jam Check Out': jamKeluar,
        'Total Tagihan (Rp)': total,
        'Cash (Rp)': bayarCash > 0 ? bayarCash : '',
        'QRIS (Rp)': bayarQRIS > 0 ? bayarQRIS : '',
        'Transfer (Rp)': bayarTransfer > 0 ? bayarTransfer : '',
        'Deposit (Rp)': depositNominal > 0 ? depositNominal : '',
        'Metode Deposit': depositNominal > 0 ? depositMetode : '-'
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);

    const objectMaxLength = [];
    if (rows.length > 0) {
      const keys = Object.keys(rows[0]);
      for (let i = 0; i < keys.length; i++) {
        let maxLen = keys[i].length; 
        for (let j = 0; j < rows.length; j++) {
          const val = rows[j][keys[i]];
          if (val !== null && val !== undefined) {
            const valLen = val.toString().length;
            if (valLen > maxLen) {
              maxLen = valLen; 
            }
          }
        }
        objectMaxLength.push({ wch: maxLen + 2 });
      }
      worksheet['!cols'] = objectMaxLength;
    }

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Rekap Pendapatan");
    
    XLSX.writeFile(workbook, `Laporan_Keuangan_Greenhaus_${format(new Date(), 'yyyyMMdd')}.xlsx`);
  };

  // HANDLERS EDIT & PRINT
  const handlePrint = (tx) => {
    setPrintData(tx);
    setTimeout(() => {
      window.print();
    }, 500);
  };

  const closePrint = () => {
    setPrintData(null);
  };

  const handleEditClick = (tx) => {
    setEditModal({ isOpen: true, data: tx });
    
    if (tx.type === 'harian') {
      const ci = new Date(tx.checkIn);
      const co = new Date(tx.checkOut);
      let diff = differenceInDays(co, ci);
      if (diff === 0 && tx.tipeInap !== 'transit') diff = 1;
      setEditDurasiMalam(diff);
      setEditWaktuKeluar(format(co, "yyyy-MM-dd'T'HH:mm"));
      setEditNoKamar(tx.noKamar);
      setEditStatusDeposit(tx.statusDeposit || 'Belum Refund');
      setEditInfo(tx.info || '');
      setEditJenisKelamin(tx.jenisKelamin || ''); 
    } else {
      setEditWaktuKeluar(format(new Date(tx.periodeEnd), 'yyyy-MM-dd'));
      setEditNoKamar(tx.roomNumber);
      setEditStatusDeposit(tx.statusDeposit || 'Belum Refund');
      setEditInfo(tx.info || '');
      setEditJenisKelamin(tx.jenisKelamin || ''); 
    }
  };

  const hitungUlangKeluarHarian = (malam) => {
    if (!editModal.data) return;
    const dateMasuk = new Date(editModal.data.checkIn);
    let dateKeluar;
    if (dateMasuk.getHours() < 12) {
      dateKeluar = addDays(dateMasuk, malam - 1);
    } else {
      dateKeluar = addDays(dateMasuk, malam);
    }
    dateKeluar.setHours(12, 0, 0, 0);
    setEditWaktuKeluar(format(dateKeluar, "yyyy-MM-dd'T'HH:mm"));
  };

  const handleCheckoutInstan = () => {
    if (editModal.data?.type === 'harian') {
      setEditWaktuKeluar(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
    } else if (editModal.data?.type === 'kos') {
      setEditWaktuKeluar(format(new Date(), 'yyyy-MM-dd'));
    }
  };

  const simpanPerubahan = async () => {
    if (!editWaktuKeluar || !editNoKamar) return alert("Mohon lengkapi Waktu Keluar dan Nomor Kamar.");
    
    setIsSaving(true);
    try {
      const getRes = await fetch('http://localhost:5000/api/data');
      const dbData = await getRes.json();
      const targetId = editModal.data.id;

      let isUpdated = false;

      if (editModal.data.type === 'harian') {
        const index = (dbData.dailyTransactions || []).findIndex(t => t.id === targetId);
        if (index !== -1) {
          dbData.dailyTransactions[index].checkOut = editWaktuKeluar;
          dbData.dailyTransactions[index].noKamar = editNoKamar;
          dbData.dailyTransactions[index].statusDeposit = editStatusDeposit;
          dbData.dailyTransactions[index].info = editInfo;
          dbData.dailyTransactions[index].jenisKelamin = editJenisKelamin; 
          isUpdated = true;
        }
      } else if (editModal.data.type === 'kos') {
        const index = (dbData.activeKost || []).findIndex(t => t.id === targetId);
        if (index !== -1) {
          dbData.activeKost[index].periodeEnd = format(new Date(editWaktuKeluar), 'yyyy-MM-dd');
          dbData.activeKost[index].roomNumber = editNoKamar;
          dbData.activeKost[index].statusDeposit = editStatusDeposit;
          dbData.activeKost[index].info = editInfo;
          dbData.activeKost[index].jenisKelamin = editJenisKelamin; 
          isUpdated = true;
        }
      }

      if (!isUpdated) throw new Error("Data transaksi tidak ditemukan di database.");

      const postRes = await fetch('http://localhost:5000/api/data/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dbData)
      });
      
      const result = await postRes.json();
      if (result.success) {
        alert("Perubahan berhasil disimpan.");
        setEditModal({ isOpen: false, data: null });
        fetchData();
      } else {
        alert("Gagal menyimpan: " + result.error);
      }
    } catch (error) {
      console.error(error);
      alert("Terjadi kesalahan jaringan.");
    } finally {
      setIsSaving(false);
    }
  };

  const hapusTransaksi = async (id, type) => {
    if (!window.confirm("Yakin ingin menghapus transaksi ini? Tindakan ini tidak bisa dibatalkan dan akan mempengaruhi laporan kasir.")) return;
    
    try {
      const getRes = await fetch('http://localhost:5000/api/data');
      const dbData = await getRes.json();
      
      if (type === 'harian') {
        dbData.dailyTransactions = dbData.dailyTransactions.filter(t => t.id !== id);
      } else {
        dbData.activeKost = dbData.activeKost.filter(t => t.id !== id);
      }

      const postRes = await fetch('http://localhost:5000/api/data/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dbData)
      });
      
      if (postRes.ok) {
        fetchData();
      }
    } catch (error) {
      console.error("Error Hapus Transaksi:", error);
      alert("Gagal menghapus data.");
    }
  };

  // FILTERING DASAR (Pencarian & Tab Status)
  const filteredTx = transactions.filter(tx => {
    const safeNama = tx.nama || '';
    const matchName = safeNama.toLowerCase().includes((searchTerm || '').toLowerCase());
    const matchRoom = (tx.noKamar || tx.roomNumber || '').toString().includes(searchTerm || '');
    const searchMatch = matchName || matchRoom;

    let dateMatch = true;
    if (dateFilter) {
      try {
        const txDate = tx.type === 'harian' ? new Date(tx.checkIn) : new Date(tx.periodeStart);
        if (!isNaN(txDate)) {
          dateMatch = format(txDate, 'yyyy-MM-dd') === dateFilter;
        } else {
          dateMatch = false;
        }
      } catch (e) {
        console.error("Error Date Filter:", e);
        dateMatch = false;
      }
    }

    let statusMatch = true;
    try {
      const now = new Date();
      let coDate;
      if (tx.type === 'harian') {
        coDate = new Date(tx.checkOut);
      } else {
        coDate = new Date((tx.periodeEnd || format(now, 'yyyy-MM-dd')) + 'T12:00:00');
      }

      if (!isNaN(coDate)) {
        if (statusFilter === 'Aktif') statusMatch = now <= coDate;
        else if (statusFilter === 'Selesai') statusMatch = now > coDate;
      }
    } catch (e) {
      console.error("Error Status Filter:", e);
      statusMatch = true;
    }

    return searchMatch && dateMatch && statusMatch;
  });

  // SORTING ENGINE DENGAN TIE-BREAKER (Secondary Sort)
  const sortedAndFilteredTx = [...filteredTx].sort((a, b) => {
    // Helper fungsi untuk mendapatkan waktu Check-In yang absolut
    const getWaktuMasuk = (tx) => tx.type === 'harian' ? new Date(tx.checkIn).getTime() : new Date(tx.periodeStart).getTime();
    const timeA = getWaktuMasuk(a) || 0;
    const timeB = getWaktuMasuk(b) || 0;

    let primaryComparison = 0;

    // Evaluasi Primary Sort
    if (sortConfig.key === 'nama') {
      const nameA = (a.nama || '').toLowerCase();
      const nameB = (b.nama || '').toLowerCase();
      if (nameA < nameB) primaryComparison = -1;
      if (nameA > nameB) primaryComparison = 1;
    } else if (sortConfig.key === 'jenisKelamin') {
      const jkA = a.jenisKelamin || '';
      const jkB = b.jenisKelamin || '';
      if (jkA < jkB) primaryComparison = -1;
      if (jkA > jkB) primaryComparison = 1;
    } else if (sortConfig.key === 'tipe') {
      const typeA = a.type === 'kos' ? 'kos' : a.tipeInap || '';
      const typeB = b.type === 'kos' ? 'kos' : b.tipeInap || '';
      if (typeA < typeB) primaryComparison = -1;
      if (typeA > typeB) primaryComparison = 1;
    } else if (sortConfig.key === 'status') {
      const now = new Date().getTime();
      const getWaktuKeluar = (tx) => tx.type === 'harian' ? new Date(tx.checkOut).getTime() : new Date(tx.periodeEnd + 'T12:00:00').getTime();
      const isAktifA = now <= getWaktuKeluar(a) ? 1 : 0;
      const isAktifB = now <= getWaktuKeluar(b) ? 1 : 0;
      primaryComparison = isAktifB - isAktifA; // Aktif (1) di atas Selesai (0)
    } else if (sortConfig.key === 'waktuMasuk') {
      primaryComparison = timeA - timeB;
    }

    // Jika hasil Primary Sort tidak seri, kembalikan arahnya
    if (primaryComparison !== 0) {
      return sortConfig.direction === 'asc' ? primaryComparison : -primaryComparison;
    }

    // SECONDARY SORT (Tie-Breaker): Jika nilainya kembar, selalu urutkan dari yang paling BARU masuk (Descending Time)
    return timeB - timeA;
  });

  return (
    <div className="space-y-6 text-gray-900 transition-colors duration-300">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Riwayat Transaksi</h2>
          <p className="text-sm text-gray-500 mt-1">Daftar histori inap tamu Harian, Transit, dan Kos.</p>
        </div>
        
        <button onClick={openFinancialModal} className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-2.5 rounded-lg font-bold shadow-md transition-colors flex items-center gap-2">
          <span>📈</span> Laporan Finansial
        </button>
      </div>

      {/* FILTER BAR */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col md:flex-row gap-4">
        <div className="flex-1">
          <input 
            type="text" 
            placeholder="Cari nama tamu atau no. kamar..." 
            value={searchTerm} 
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-transparent border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>
        <div className="w-full md:w-48">
          <input 
            type="date" 
            value={dateFilter} 
            onChange={(e) => setDateFilter(e.target.value)}
            className="w-full bg-transparent border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>
        <div className="w-full md:w-48">
          <select 
            value={statusFilter} 
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full bg-transparent border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="Semua">Semua Status</option>
            <option value="Aktif">Tamu Aktif (In-House)</option>
            <option value="Selesai">Sudah Check-Out</option>
          </select>
        </div>
      </div>

      {/* TABEL DATA */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {/* HEADER 1: Tamu & Gender */}
                <th className="p-3">
                  <div className="flex items-center gap-3">
                    <button onClick={() => requestSort('nama')} className="flex items-center gap-1 font-bold text-sm text-gray-700 hover:text-green-600 transition-colors">
                      Nama Tamu <span className="opacity-70 text-xs">{getSortIndicator('nama')}</span>
                    </button>
                    <span className="text-gray-300">|</span>
                    <button onClick={() => requestSort('jenisKelamin')} className="flex items-center gap-1 font-bold text-xs text-gray-500 hover:text-green-600 transition-colors">
                      Gender <span className="opacity-70">{getSortIndicator('jenisKelamin')}</span>
                    </button>
                  </div>
                </th>
                
                {/* HEADER 2: Tipe */}
                <th className="p-3">
                  <button onClick={() => requestSort('tipe')} className="flex items-center gap-1 font-bold text-sm text-gray-700 hover:text-green-600 transition-colors">
                    Tipe & Durasi <span className="opacity-70 text-xs">{getSortIndicator('tipe')}</span>
                  </button>
                </th>

                {/* HEADER 3: Waktu Masuk */}
                <th className="p-3">
                  <button onClick={() => requestSort('waktuMasuk')} className="flex items-center gap-1 font-bold text-sm text-gray-700 hover:text-green-600 transition-colors">
                    Waktu (Masuk - Keluar) <span className="opacity-70 text-xs">{getSortIndicator('waktuMasuk')}</span>
                  </button>
                </th>

                {/* HEADER 4: Status */}
                <th className="p-3">
                  <button onClick={() => requestSort('status')} className="flex items-center gap-1 font-bold text-sm text-gray-700 hover:text-green-600 transition-colors">
                    Status <span className="opacity-70 text-xs">{getSortIndicator('status')}</span>
                  </button>
                </th>

                <th className="p-3 font-bold text-sm text-gray-700 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sortedAndFilteredTx.length === 0 ? (
                <tr>
                  <td colSpan="5" className="p-8 text-center text-gray-500 italic">Tidak ada data transaksi yang sesuai.</td>
                </tr>
              ) : (
                sortedAndFilteredTx.map(tx => {
                  const noKamar = tx.type === 'harian' ? tx.noKamar : tx.roomNumber;
                  const wMasuk = tx.type === 'harian' ? new Date(tx.checkIn) : new Date(tx.periodeStart);
                  const wKeluar = tx.type === 'harian' ? new Date(tx.checkOut) : new Date(tx.periodeEnd + 'T12:00:00');
                  
                  const now = new Date();
                  const isAktif = now <= wKeluar;
                  
                  return (
                    <tr key={tx.id} className="hover:bg-green-50/30 transition-colors">
                      <td className="p-4">
                        <div className="font-bold text-gray-800">
                          {tx.nama} {tx.jenisKelamin === 'Laki-laki' ? '♂️' : tx.jenisKelamin === 'Perempuan' ? '♀️' : tx.jenisKelamin === 'Lain-lain' ? '⚪' : ''}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">Kamar <span className="font-bold text-green-700">#{noKamar}</span></div>
                      </td>
                      <td className="p-4">
                        <span className={`inline-block px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wider ${tx.type === 'kos' ? 'bg-orange-100 text-orange-800' : tx.tipeInap === 'transit' ? 'bg-purple-100 text-purple-800' : 'bg-green-100 text-green-800'}`}>
                          {tx.type === 'kos' ? 'Kos Bulanan' : tx.tipeInap === 'transit' ? 'Transit' : 'Harian'}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="text-sm text-gray-600">
                          <span className="text-green-600 font-bold">IN:</span> {isNaN(wMasuk) ? '-' : format(wMasuk, tx.tipeInap === 'transit' ? 'dd MMM yy, HH:mm' : 'dd MMM yy')}
                        </div>
                        <div className="text-sm text-gray-600 mt-1">
                          <span className="text-red-500 font-bold">OUT:</span> {isNaN(wKeluar) ? '-' : format(wKeluar, tx.tipeInap === 'transit' ? 'dd MMM yy, HH:mm' : 'dd MMM yy')}
                        </div>
                      </td>
                      <td className="p-4">
                        {isAktif ? (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded-full border border-green-200">
                            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span> In-House
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded-full border border-gray-200">
                            C/O Selesai
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex justify-center gap-2">
                          <button onClick={() => handlePrint(tx)} className="bg-gray-800 hover:bg-black text-white p-2 rounded shadow-sm transition-colors text-sm" title="Cetak Struk">🖨️</button>
                          <button onClick={() => handleEditClick(tx)} className="bg-blue-600 hover:bg-blue-700 text-white p-2 rounded shadow-sm transition-colors text-sm" title="Ralat Transaksi">⚙️</button>
                          <button onClick={() => hapusTransaksi(tx.id, tx.type)} className="bg-red-50 hover:bg-red-100 text-red-600 p-2 rounded transition-colors text-sm" title="Hapus Data">🗑️</button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL EDIT / RALAT TRANSAKSI */}
      {editModal.isOpen && editModal.data && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-fade-in">
            <div className="p-5 bg-[#1a4b1a] text-white flex justify-between items-center">
              <h3 className="font-bold text-lg">⚙️ Ralat Data Transaksi</h3>
              <button onClick={() => setEditModal({ isOpen: false, data: null })} className="text-white/70 hover:text-white font-bold text-2xl outline-none">&times;</button>
            </div>
            
            <div className="p-6 space-y-5 bg-gray-50/50">
              <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-200 text-xs text-yellow-800 mb-4 shadow-sm">
                <strong>Perhatian:</strong> Perubahan di sini akan menimpa data yang sudah ada. Fitur ralat tagihan belum tersedia, sehingga menambah hari inap di sini belum mewajibkan pelunasan uang muka baru.
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Nomor Kamar</label>
                  <input type="text" value={editNoKamar} onChange={(e) => setEditNoKamar(e.target.value)} className="w-full bg-transparent border border-gray-300 rounded-md p-2 outline-none focus:ring-2 focus:ring-green-500" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Jenis Kelamin</label>
                  <select value={editJenisKelamin} onChange={(e) => setEditJenisKelamin(e.target.value)} className="w-full bg-white border border-gray-300 rounded-md p-2 outline-none focus:ring-2 focus:ring-green-500">
                    <option value="" disabled hidden>- Pilih -</option>
                    <option value="Laki-laki">Laki-laki ♂️</option>
                    <option value="Perempuan">Perempuan ♀️</option>
                    <option value="Lain-lain">Lain-lain ⚪</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-4">
                {editModal.data.type === 'harian' && editModal.data.tipeInap !== 'transit' && (
                  <div className="w-24">
                    <label className="block text-sm font-bold text-gray-700 mb-1">Durasi</label>
                    <input type="number" min="1" value={editDurasiMalam} onChange={(e) => { const v = parseInt(e.target.value) || 1; setEditDurasiMalam(v); hitungUlangKeluarHarian(v); }} className="w-full bg-transparent border border-gray-300 rounded-md p-2 outline-none focus:ring-2 focus:ring-green-500 text-center" />
                  </div>
                )}
                <div className="flex-1">
                  <div className="flex justify-between items-end mb-1">
                    <label className="block text-sm font-bold text-gray-700">Waktu Keluar (Check-Out)</label>
                    <button onClick={handleCheckoutInstan} className="text-[10px] bg-red-100 text-red-700 px-2 py-1 rounded font-bold hover:bg-red-200">C/O Instan Sekarang</button>
                  </div>
                  {editModal.data.type === 'kos' ? (
                    <input type="date" value={editWaktuKeluar} onChange={(e) => setEditWaktuKeluar(e.target.value)} className="w-full bg-transparent border border-gray-300 rounded-md p-2 outline-none focus:ring-2 focus:ring-green-500" />
                  ) : (
                    <input type="datetime-local" value={editWaktuKeluar} onChange={(e) => setEditWaktuKeluar(e.target.value)} className="w-full bg-transparent border border-gray-300 rounded-md p-2 outline-none focus:ring-2 focus:ring-green-500" />
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Status Deposit Jaminan</label>
                <select value={editStatusDeposit} onChange={(e) => setEditStatusDeposit(e.target.value)} className="w-full bg-white border border-gray-300 rounded-md p-2 outline-none focus:ring-2 focus:ring-green-500">
                  <option value="Belum Refund">Belum Refund (Di Tangan Kasir)</option>
                  <option value="Sudah Dikembalikan">✅ Sudah Dikembalikan ke Tamu</option>
                  <option value="Deposit Hangus">❌ Deposit Hangus (Denda/Kotor)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Catatan Tambahan (Info)</label>
                <input type="text" value={editInfo} onChange={(e) => setEditInfo(e.target.value)} className="w-full bg-transparent border border-gray-300 rounded-md p-2 outline-none focus:ring-2 focus:ring-green-500" placeholder="Opsional..." />
              </div>
            </div>

            <div className="p-5 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setEditModal({ isOpen: false, data: null })} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-bold hover:bg-gray-200">Batal</button>
              <button onClick={simpanPerubahan} disabled={isSaving} className="px-6 py-2 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 shadow-sm disabled:opacity-50">
                {isSaving ? 'Menyimpan...' : 'Simpan Perubahan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DASBOR FINANSIAL & EXPORT */}
      {isFinancialModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-fade-in">
            <div className="p-5 bg-purple-700 text-white flex justify-between items-center">
              <h3 className="font-bold text-lg">📈 Dasbor Analitik Keuangan</h3>
              <button onClick={() => setIsFinancialModalOpen(false)} className="text-white/70 hover:text-white font-bold text-2xl outline-none">&times;</button>
            </div>
            <div className="p-6 space-y-6">
              
              <div className="bg-purple-50 p-6 rounded-xl border border-purple-100 text-center shadow-inner">
                <p className="text-sm font-bold text-purple-600 uppercase mb-2">Pendapatan Terakumulasi Bulan Ini</p>
                <h4 className="text-4xl font-black text-purple-900">Rp {pendapatanBulanIni.toLocaleString('id-ID')}</h4>
                <p className="text-xs text-purple-500 mt-3 font-medium">Termasuk biaya tambahan. Tidak mencakup uang muka deposit aktif.</p>
              </div>
              
              <div className="border-t border-gray-100 pt-4">
                <p className="text-sm text-gray-600 mb-3 text-center">Ekspor seluruh data transaksi ke dalam format Excel (.xlsx) untuk audit dan rekap akuntansi.</p>
                <button onClick={handleExportExcel} className="w-full bg-green-600 hover:bg-green-700 text-white font-extrabold py-3.5 rounded-xl shadow-lg transition-transform active:scale-[0.98] flex items-center justify-center gap-2">
                  <span className="text-xl">📊</span> DOWNLOAD LAPORAN EXCEL (.XLSX)
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* PRINT AREA A5 LANDSCAPE OPTIMIZED */}
      {printData && (
        <div className="fixed inset-0 z-[100] bg-white text-black print:block overflow-hidden flex flex-col">
          <div className="bg-gray-800 text-white p-4 flex justify-between items-center print:hidden shrink-0">
            <div>
              <h2 className="font-bold">Preview Struk Kuitansi</h2>
              <p className="text-xs text-gray-400">Gunakan kertas A5 Landscape. Pastikan opsi "Headers and Footers" dimatikan di setelan printer browser.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={closePrint} className="bg-gray-600 hover:bg-gray-500 px-4 py-2 rounded font-bold">Batal (Tutup)</button>
              <button onClick={() => window.print()} className="bg-green-600 hover:bg-green-500 px-4 py-2 rounded font-bold flex items-center gap-2"><span>🖨️</span> Cetak Sekarang</button>
            </div>
          </div>

          <div className="flex-1 overflow-auto bg-gray-100 print:bg-white print:overflow-visible flex justify-center p-4 print:p-0">
            <div className="bg-white w-full max-w-[210mm] print:w-auto min-h-[148mm] print:min-h-0 print:h-auto shadow-2xl print:shadow-none mx-auto text-black p-6 print:p-0 flex flex-col font-sans text-sm print:text-xs">
              
              <div className="border-b-2 border-black pb-4 print:pb-2 mb-4 print:mb-2 text-center">
                <h1 className="text-2xl print:text-xl font-black uppercase tracking-wider">Greenhaus Inn</h1>
                <p className="text-sm print:text-[10px]">Jl. Ketintang Baru III No.36, Surabaya</p>
                <p className="text-sm print:text-[10px]">Tanda Terima Pembayaran Akomodasi</p>
              </div>

              <div className="flex justify-between mb-6 print:mb-4">
                <div>
                  <table className="text-sm print:text-[11px]">
                    <tbody>
                      <tr><td className="pr-4 font-bold text-gray-600 print:text-black">No. Transaksi</td><td>: {printData.id}</td></tr>
                      <tr><td className="pr-4 font-bold text-gray-600 print:text-black">Tipe Inap</td><td>: {toTitleCase(printData.tipeInap || 'kos')}</td></tr>
                      <tr><td className="pr-4 font-bold text-gray-600 print:text-black">Waktu Masuk</td><td>: {format(new Date(printData.type === 'harian' ? printData.checkIn : printData.periodeStart), 'dd/MM/yyyy HH:mm')}</td></tr>
                    </tbody>
                  </table>
                </div>
                <div>
                  <table className="text-sm print:text-[11px]">
                    <tbody>
                      <tr><td className="pr-4 font-bold text-gray-600 print:text-black">Nama Tamu</td><td className="font-bold">: {toTitleCase(printData.nama)}</td></tr>
                      <tr><td className="pr-4 font-bold text-gray-600 print:text-black">Kamar</td><td className="font-bold">: #{printData.type === 'harian' ? printData.noKamar : printData.roomNumber}</td></tr>
                      <tr><td className="pr-4 font-bold text-gray-600 print:text-black">Waktu Cetak</td><td>: {format(new Date(), 'dd/MM/yyyy HH:mm')}</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mb-4 print:mb-2 flex-1">
                <h3 className="font-bold mb-2 print:mb-1 uppercase border-b border-gray-300 print:border-black inline-block text-sm print:text-xs">I. Rincian Biaya Sewa (Non-Refundable)</h3>
                <table className="w-full text-sm print:text-[11px] mb-4 print:mb-2 border print:border-black">
                  <thead className="bg-[#1a4b1a] text-white print:bg-white print:text-black print:border-b-2 print:border-black">
                    <tr>
                      <th className="p-2 print:py-1 text-left print:border-black print:border-b">Deskripsi Transaksi</th>
                      <th className="p-2 print:py-1 text-right w-32 print:border-black print:border-b">Nominal (Rp)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {printData.pembayaran?.rincianTarifHarian && printData.pembayaran.rincianTarifHarian.length > 0 ? (
                      printData.pembayaran.rincianTarifHarian.map((malam, idx) => (
                        <tr key={`mlm-${idx}`} className="border-b border-gray-100 print:border-black">
                          <td className="p-2 print:py-0.5 print:border-black">
                            Sewa Kamar #{printData.noKamar} (Malam {idx + 1}) - {format(new Date(malam.tanggal), 'dd/MM/yy')} <span className="text-[9px] uppercase">({malam.jenis})</span>
                          </td>
                          <td className="p-2 print:py-0.5 text-right print:border-black">{formatRp(malam.harga)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr className="border-b border-gray-100 print:border-black">
                        <td className="p-2 print:py-0.5 print:border-black">Sewa Kamar #{printData.type === 'harian' ? printData.noKamar : printData.roomNumber}</td>
                        <td className="p-2 print:py-0.5 text-right print:border-black">{formatRp(printData.pembayaran?.jumlahKamar)}</td>
                      </tr>
                    )}
                    
                    {printData.pembayaran?.tambahan && printData.pembayaran.tambahan.map((t, idx) => (
                      <tr key={idx} className="border-b border-gray-100 print:border-black">
                        <td className="p-2 print:py-0.5 print:border-black">Tambahan: {t.nama}</td>
                        <td className="p-2 print:py-0.5 text-right print:border-black">{formatRp(t.jumlah)}</td>
                      </tr>
                    ))}

                    <tr className="bg-gray-50 font-bold print:bg-white print:border-t-2 print:border-black">
                      <td className="p-2 print:py-1 text-right text-[#1a4b1a] print:text-black print:border-black">TOTAL BIAYA AKOMODASI (A):</td>
                      <td className="p-2 print:py-1 text-right text-[#1a4b1a] print:text-black print:border-black">
                        {formatRp((printData.pembayaran?.jumlahKamar || 0) + (printData.pembayaran?.tambahan || []).reduce((sum, item) => sum + item.jumlah, 0))}
                      </td>
                    </tr>
                    
                    {printData.pembayaran?.detailMetodeKamar?.length > 0 ? (
                      printData.pembayaran.detailMetodeKamar.map((m, idx) => (
                        <tr key={`bayar-${idx}`} className="print:bg-white border-t border-gray-100 border-dashed print:border-black text-gray-700">
                          <td className="p-2 print:py-1 text-right print:text-black print:border-black text-xs print:text-[10px]">
                            Dibayar via <span className="font-bold uppercase">{m.metode}</span>:
                          </td>
                          <td className="p-2 print:py-1 text-right print:text-black print:border-black font-bold text-xs print:text-[10px]">
                            {formatRp(m.nominal)}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr className="print:bg-white border-t border-gray-100 border-dashed print:border-black text-gray-700">
                        <td className="p-2 print:py-1 text-right print:text-black print:border-black text-xs print:text-[10px]">
                          Dibayar via <span className="font-bold uppercase">{printData.pembayaran?.metodeKamar || '-'}</span>:
                        </td>
                        <td className="p-2 print:py-1 text-right print:text-black print:border-black font-bold text-xs print:text-[10px]">
                          {formatRp(printData.pembayaran?.jumlahKamar)}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>

                <h3 className="font-bold mb-2 print:mb-1 uppercase border-b border-gray-300 print:border-black inline-block text-sm print:text-xs">II. Titipan Deposit (Refundable)</h3>
                <table className="w-full text-sm print:text-[11px] border print:border-black">
                  <thead className="bg-[#1a4b1a] text-white print:bg-white print:text-black print:border-b-2 print:border-black">
                    <tr><th className="p-2 print:py-1 text-left print:border-black print:border-b">Keterangan</th><th className="p-2 print:py-1 text-right w-32 print:border-black print:border-b">Nominal (Rp)</th></tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-gray-100 print:border-black">
                      <td className="p-2 print:py-0.5 print:border-black">Uang Jaminan Kamar (Dititipkan via {printData.pembayaran?.metodeDeposit || '-'})</td>
                      <td className="p-2 print:py-0.5 text-right print:border-black">{formatRp(printData.pembayaran?.jumlahDeposit)}</td>
                    </tr>
                    <tr className="print:bg-white print:border-t-2 print:border-black">
                      <td className="p-2 print:py-1 text-left text-gray-600 print:text-black print:border-black italic text-[10px] print:text-[9px]">Uang Jaminan akan dikembalikan saat Check-Out apabila tidak ada kerusakan/kehilangan aset kamar.</td>
                      <td className="p-2 print:py-1 text-right font-bold text-[#1a4b1a] print:text-black print:border-black">{formatRp(printData.pembayaran?.jumlahDeposit)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="mt-8 print:mt-4 flex justify-between items-end text-sm print:text-[10px]">
                <div className="text-center w-40">
                  <p className="mb-12 print:mb-8 text-gray-500 print:text-black">Tamu,</p>
                  <p className="font-bold border-b border-gray-400 print:border-black pb-1 uppercase">{printData.nama}</p>
                </div>
                <div className="text-center w-40">
                  <p className="mb-12 print:mb-8 text-gray-500 print:text-black">Resepsionis,</p>
                  <p className="font-bold border-b border-gray-400 print:border-black pb-1 uppercase">FO Greenhaus</p>
                </div>
              </div>
            </div>
          </div>

          <style>{`
            @media print {
              @page { size: A5 landscape; margin: 0; }
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background-color: white; }
              html, body { width: 210mm; height: 148mm; }
            }
          `}</style>
        </div>
      )}
    </div>
  );
}