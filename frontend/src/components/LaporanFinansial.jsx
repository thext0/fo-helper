// [START: LaporanFinansialModule]
import { useState, useEffect, useMemo } from 'react';
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import * as XLSX from 'xlsx';
import { useDialog } from './DialogProvider';
import CustomDateTimePicker from './CustomDateTimePicker';

const toTitleCase = (str) => {
  if (!str) return '';
  return str.toLowerCase().replace(/\b\w/g, s => s.toUpperCase());
};

export default function LaporanFinansial() {
  const { alert, toast } = useDialog();

  const [loading, setLoading] = useState(true);
  const [finData, setFinData] = useState([]);
  const [rolloverHour, setRolloverHour] = useState(12);

  const [reportPeriod, setReportPeriod] = useState('harian'); 
  const [customDate, setCustomDate] = useState({ 
    start: format(new Date(), 'yyyy-MM-dd'), 
    end: format(new Date(), 'yyyy-MM-dd') 
  });

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const res = await fetch('http://localhost:5000/api/data');
        if (!res.ok) throw new Error("Gagal mengambil data");
        const data = await res.json();
        
        const s = data.settings || {};
        const rHour = parseInt((s.rolloverTime || '12:00').split(':')[0], 10);
        setRolloverHour(rHour);

        const guests = data.guests || [];
        const attachGuestData = (tx) => {
          const g = guests.find(g => g.guestId === tx.guestId) || guests.find(g => (g.nama || '').toLowerCase() === (tx.nama || '').toLowerCase()) || {};
          let jk = tx.jenisKelamin;
          if (!jk || jk === '-' || jk === '') jk = g.jenisKelamin;
          if (!jk || jk === '-' || jk === '') jk = 'Tidak Diisi';
          return { ...tx, jenisKelamin: jk };
        };

        const allTx = [
          ...(data.dailyTransactions || []).map(tx => attachGuestData({ ...tx, type: 'harian' })), 
          ...(data.activeKost || []).map(k => attachGuestData({ ...k, type: 'kos' }))
        ];
        setFinData(allTx);
      } catch (error) {
        console.error(error);
        alert("Gagal memuat data dari server.", "Error Jaringan");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { filteredFinData, finStats } = useMemo(() => {
    if (finData.length === 0) {
      return { filteredFinData: [], finStats: { netto: 0, kamar: 0, ekstra: 0, diskon: 0, count: 0 } };
    }

    const now = new Date();
    let startDate, endDate;

    if (reportPeriod === 'harian') {
      startDate = startOfDay(now);
      endDate = endOfDay(now);
    } else if (reportPeriod === 'mingguan') {
      startDate = startOfWeek(now, { weekStartsOn: 1 }); 
      endDate = endOfWeek(now, { weekStartsOn: 1 });
    } else if (reportPeriod === 'bulanan') {
      startDate = startOfMonth(now);
      endDate = endOfMonth(now);
    } else if (reportPeriod === 'kustom') {
      startDate = customDate.start ? startOfDay(new Date(customDate.start)) : startOfDay(now);
      endDate = customDate.end ? endOfDay(new Date(customDate.end)) : endOfDay(now);
    }

    const filtered = finData.filter(tx => {
      if (tx.isVoid) return false;
      const txDate = new Date(tx.waktuInput);
      return txDate >= startDate && txDate <= endDate;
    });

    let sumNetto = 0, sumKamar = 0, sumEkstra = 0, sumDiskon = 0;
    filtered.forEach(tx => {
      const k = tx.pembayaran?.jumlahKamar || 0;
      const e = (tx.pembayaran?.tambahan || []).reduce((s, i) => s + i.jumlah, 0);
      const d = tx.pembayaran?.diskon || 0;
      sumKamar += k;
      sumEkstra += e;
      sumDiskon += d;
      sumNetto += (k + e - d);
    });

    return {
      filteredFinData: filtered,
      finStats: { netto: sumNetto, kamar: sumKamar, ekstra: sumEkstra, diskon: sumDiskon, count: filtered.length }
    };
  }, [finData, reportPeriod, customDate]);

  const handleExportExcel = async () => { 
    const sortedData = [...filteredFinData].sort((a, b) => new Date(b.waktuInput) - new Date(a.waktuInput));
    const padHour = String(rolloverHour).padStart(2, '0');
    
    if(sortedData.length === 0) {
      await alert("Tidak ada transaksi pada rentang periode yang dipilih untuk diekspor.", "Data Kosong");
      return;
    }

    const rows = sortedData.map(tx => {
      const isVoid = tx.isVoid === true;
      const total = isVoid ? 0 : (tx.pembayaran?.jumlahKamar || 0) + (tx.pembayaran?.tambahan || []).reduce((s, i) => s + i.jumlah, 0) - (tx.pembayaran?.diskon || 0);
      
      let wMasuk, wKeluar;
      if (tx.type === 'harian') { wMasuk = new Date(tx.checkIn); wKeluar = new Date(tx.checkOut); } 
      else { wMasuk = new Date(tx.periodeStart); wKeluar = new Date((tx.periodeEnd || format(new Date(), 'yyyy-MM-dd')) + `T${padHour}:00:00`); }
      
      let bCash = 0, bQRIS = 0, bTransfer = 0;
      if (!isVoid) {
        if (tx.pembayaran?.detailMetodeKamar?.length > 0) {
          tx.pembayaran.detailMetodeKamar.forEach(m => { const met = m.metode.toLowerCase(); if (met.includes('cash')) bCash += m.nominal; else if (met.includes('qris')) bQRIS += m.nominal; else if (met.includes('transfer')) bTransfer += m.nominal; });
        } else {
          const met = (tx.pembayaran?.metodeKamar || '').toLowerCase(); if (met.includes('cash')) bCash += total; else if (met.includes('qris')) bQRIS += total; else if (met.includes('transfer')) bTransfer += total;
        }
      }

      return {
        'ID Transaksi': tx.id, 
        'Status Data': isVoid ? 'BATAL (VOID)' : 'Valid',
        'Tipe': tx.tipeInap ? toTitleCase(tx.tipeInap) : (tx.type === 'kos' ? 'Kos' : 'Harian'), 
        'Nama Tamu': tx.nama, 
        'Jenis Kelamin': (tx.jenisKelamin && tx.jenisKelamin !== '-') ? tx.jenisKelamin : 'Tidak Diisi', 
        'No. Kamar': tx.noKamar || tx.roomNumber, 
        'Tanggal Input Sistem': format(new Date(tx.waktuInput), 'yyyy-MM-dd HH:mm'),
        'Tanggal Check In': !isNaN(wMasuk) ? format(wMasuk, 'yyyy-MM-dd') : '-', 
        'Jam Check In': !isNaN(wMasuk) ? format(wMasuk, 'HH:mm') : '-', 
        'Tanggal Check Out': !isNaN(wKeluar) ? format(wKeluar, 'yyyy-MM-dd') : '-', 
        'Jam Check Out': !isNaN(wKeluar) ? format(wKeluar, 'HH:mm') : '-', 
        'Diskon (Rp)': isVoid ? 0 : (tx.pembayaran?.diskon || 0),
        'Total Tagihan Netto (Rp)': total, 
        'Cash (Rp)': bCash || '', 
        'QRIS (Rp)': bQRIS || '', 
        'Transfer (Rp)': bTransfer || '', 
        'Nominal Deposit (Rp)': isVoid ? 0 : (tx.pembayaran?.jumlahDeposit || ''), 
        'Status Deposit': isVoid ? 'Dikembalikan (Void)' : (tx.statusDeposit === 'Sudah Refund' ? 'Sudah Dikembalikan' : (tx.statusDeposit || 'Belum Refund')),
        'Metode Refund Deposit': isVoid ? '-' : (tx.depositRefundMethod || (tx.statusDeposit === 'Sudah Refund' ? 'Cash (Legacy)' : '-')),
        'Alasan Deposit Hangus / Void': isVoid ? tx.voidReason : (tx.depositHangusReason || '-')
      };
    });
    
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const objectMaxLength = [];
    if (rows.length > 0) {
      const keys = Object.keys(rows[0]);
      for (let i = 0; i < keys.length; i++) { let maxLen = keys[i].length; for (let j = 0; j < rows.length; j++) { const val = rows[j][keys[i]]; if (val && val.toString().length > maxLen) maxLen = val.toString().length; } objectMaxLength.push({ wch: maxLen + 2 }); } worksheet['!cols'] = objectMaxLength;
    }
    const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, worksheet, "Rekap Penjualan"); 
    
    let fileName = `Laporan_Keuangan_${toTitleCase(reportPeriod)}`;
    if(reportPeriod === 'kustom') fileName += `_${customDate.start}_to_${customDate.end}`;
    
    XLSX.writeFile(workbook, `${fileName}.xlsx`);
    toast("Laporan Excel berhasil diunduh!", "success");
  };

  if (loading) return <div className="text-center p-10 text-gray-500 italic">Memuat data analitik...</div>;

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div className="bg-white p-4 rounded-md shadow-sm border border-gray-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-800">📈 Dasbor Analitik Keuangan</h2>
          <p className="text-sm text-gray-500">Pantau performa penjualan dan ekspor laporan kasir.</p>
        </div>
      </div>

      <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-6">
        
        {/* FILTER SECTION */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-gray-100 pb-5">
          <div className="flex bg-gray-100 p-1.5 rounded-lg w-full md:w-auto">
            {['harian', 'mingguan', 'bulanan', 'kustom'].map(p => (
              <button 
                key={p} 
                onClick={() => setReportPeriod(p)} 
                className={`flex-1 md:flex-none px-6 py-2 text-sm font-bold rounded-md capitalize transition-colors ${reportPeriod === p ? 'bg-purple-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'}`}
              >
                {p}
              </button>
            ))}
          </div>
          
          {reportPeriod === 'kustom' && (
            <div className="flex flex-wrap items-center gap-3 animate-fade-in w-full md:w-auto">
              <div className="w-full sm:w-48">
                <CustomDateTimePicker value={customDate.start} onChange={(val) => setCustomDate({...customDate, start: val})} />
              </div>
              <span className="text-gray-400 font-bold hidden sm:block">-</span>
              <div className="w-full sm:w-48">
                <CustomDateTimePicker value={customDate.end} onChange={(val) => setCustomDate({...customDate, end: val})} alignRight={true} />
              </div>
            </div>
          )}
        </div>

        {/* DASHBOARD CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-3 bg-gradient-to-br from-purple-700 to-purple-900 p-8 rounded-2xl shadow-lg text-white text-center border border-purple-800">
             <p className="text-sm font-bold text-purple-200 uppercase tracking-widest mb-3">Total Pendapatan Bersih (Netto)</p>
             <h4 className="text-6xl font-black mb-3 tracking-tight">Rp {finStats.netto.toLocaleString('id-ID')}</h4>
             <p className="text-sm text-purple-300 font-medium">Berdasarkan {finStats.count} transaksi valid pada rentang waktu ini (Void dikecualikan).</p>
          </div>

          <div className="bg-gray-50 p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col justify-center items-center relative overflow-hidden">
             <div className="absolute top-0 left-0 w-full h-1.5 bg-blue-500"></div>
             <p className="text-xs font-bold text-gray-500 uppercase mb-2">Penjualan Kamar Kotor</p>
             <h4 className="text-3xl font-black text-gray-800">Rp {finStats.kamar.toLocaleString('id-ID')}</h4>
          </div>
          <div className="bg-gray-50 p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col justify-center items-center relative overflow-hidden">
             <div className="absolute top-0 left-0 w-full h-1.5 bg-orange-500"></div>
             <p className="text-xs font-bold text-gray-500 uppercase mb-2">Tagihan Tambahan Kotor</p>
             <h4 className="text-3xl font-black text-orange-600">Rp {finStats.ekstra.toLocaleString('id-ID')}</h4>
          </div>
          <div className="bg-gray-50 p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col justify-center items-center relative overflow-hidden">
             <div className="absolute top-0 left-0 w-full h-1.5 bg-red-500"></div>
             <p className="text-xs font-bold text-gray-500 uppercase mb-2">Total Potongan Diskon</p>
             <h4 className="text-3xl font-black text-red-600">- Rp {finStats.diskon.toLocaleString('id-ID')}</h4>
          </div>
        </div>

        <div className="pt-6 mt-6 border-t border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-4">
           <p className="text-sm text-gray-500 text-center sm:text-left">Laporan Excel akan memuat <strong>{finStats.count} data transaksi</strong><br/>yang sesuai dengan filter periode aktif.</p>
           <button onClick={handleExportExcel} className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white font-extrabold px-8 py-4 rounded-xl shadow-md transition-transform active:scale-[0.98] flex items-center justify-center gap-3">
             <span className="text-2xl">📊</span> UNDUH EXCEL (.XLSX)
           </button>
        </div>

      </div>
    </div>
  );
}
// [END: LaporanFinansialModule]