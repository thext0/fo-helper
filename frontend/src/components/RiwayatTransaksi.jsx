// [START: RiwayatTransaksiModule]
import { useState, useEffect, useMemo } from 'react';
import { format, startOfDay, endOfDay } from 'date-fns';
import { useDialog } from './DialogProvider';
import CustomDateTimePicker from './CustomDateTimePicker';
import { useAppData } from '../context/DataProvider';

const formatRp = (angka) => Number(angka || 0).toLocaleString('id-ID');
const toTitleCase = (str) => str ? str.toLowerCase().replace(/\b\w/g, s => s.toUpperCase()) : '';

export default function RiwayatTransaksi() {
  const { prompt, toast, alert } = useDialog();
  const { data: dbData, loading: isDbLoading, refreshData } = useAppData();

  const { rolloverHour, transactions } = useMemo(() => {
    if (!dbData) return { rolloverHour: 12, transactions: [] };
    const s = dbData.settings || {};
    const rHour = parseInt((s.rolloverTime || '12:00').split(':')[0], 10);
    const guests = dbData.guests || [];
    
    const attachGuestData = (tx) => {
      const g = guests.find(g => g.guestId === tx.guestId) || guests.find(g => (g.nama || '').toLowerCase() === (tx.nama || '').toLowerCase()) || {};
      return { ...tx, jenisKelamin: tx.jenisKelamin && tx.jenisKelamin !== '-' ? tx.jenisKelamin : (g.jenisKelamin || 'Tidak Diisi') };
    };

    const allTx = [
      ...(dbData.dailyTransactions || []).map(tx => attachGuestData({ ...tx, type: 'harian' })), 
      ...(dbData.activeKost || []).map(k => attachGuestData({ ...k, type: 'kos' }))
    ];

    return { rolloverHour: rHour, transactions: allTx };
  }, [dbData]);

  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState({ start: '', end: '' });
  const [statusFilter, setStatusFilter] = useState('Semua');
  const [printData, setPrintData] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const handleAfterPrint = () => setPrintData(null);
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, []);

  const prosesUndoCheckout = async (txData) => {
    const pic = await prompt(`Silakan masukkan Nama Petugas (PIC) untuk Log Audit:`, `Batalkan Check-Out tamu ${txData.nama}?`);
    if (!pic) return;

    setIsSaving(true);
    try {
      const currentDb = JSON.parse(JSON.stringify(dbData)); let isUpdated = false;
      const cleanInfo = (infoStr) => infoStr ? infoStr.split(' | [Deposit')[0] : '';
      const undoLog = `[Undo C/O by ${pic} pada ${format(new Date(), 'dd/MM/yy HH:mm')}]`;

      const updateDB = (arr, isKos) => {
        const idx = arr.findIndex(t => t.id === txData.id);
        if (idx !== -1) {
          if(!isKos) {
             let origCO = new Date(txData.checkIn);
             origCO.setDate(origCO.getDate() + (txData.pembayaran?.rincianTarifHarian?.length || 1));
             origCO.setHours(rolloverHour, 0, 0, 0);
             arr[idx].checkOut = format(origCO, "yyyy-MM-dd'T'HH:mm");
          }
          arr[idx].statusDeposit = 'Belum Refund'; arr[idx].depositRefundMethod = ''; arr[idx].depositHangusReason = '';
          arr[idx].info = cleanInfo(txData.info) ? `${cleanInfo(txData.info)} | ${undoLog}` : undoLog;
          isUpdated = true;
        }
      };

      if (txData.type === 'harian') updateDB(currentDb.dailyTransactions, false); else updateDB(currentDb.activeKost, true);

      if (isUpdated) {
         await fetch('http://localhost:5000/api/data/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(currentDb) });
         refreshData(); toast("Tamu kembali In-House.", "success");
      }
    } catch(err) { 
      console.error(err); 
      await alert("Error jaringan.", "Error"); 
    } finally { setIsSaving(false); }
  };

  const padHour = String(rolloverHour).padStart(2, '0');

  const filteredTx = transactions.filter(tx => {
    const matchName = (tx.nama || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchRoom = (tx.noKamar || tx.roomNumber || '').toString().includes(searchTerm);
    
    let dateMatch = true;
    if (dateFilter.start && dateFilter.end) { 
      const txDate = tx.type === 'harian' ? new Date(tx.checkIn) : new Date(tx.periodeStart); 
      dateMatch = !isNaN(txDate) && txDate >= startOfDay(new Date(dateFilter.start)) && txDate <= endOfDay(new Date(dateFilter.end));
    }
    
    let statusMatch = true;
    
    // BUG FIX ABSOLUT: Status filter murni dari statusDeposit
    const isSelesai = tx.statusDeposit !== 'Belum Refund';
    
    if (statusFilter === 'Dibatalkan') statusMatch = tx.isVoid === true;
    else if (statusFilter === 'Selesai') statusMatch = !tx.isVoid && isSelesai;
    else if (statusFilter === 'Semua') statusMatch = true;
    
    return (matchName || matchRoom) && dateMatch && statusMatch;
  });

  const sortedTx = [...filteredTx].sort((a, b) => {
    const tA = (a.type === 'harian' ? new Date(a.checkIn) : new Date(a.periodeStart)).getTime();
    const tB = (b.type === 'harian' ? new Date(b.checkIn) : new Date(b.periodeStart)).getTime();
    return tB - tA; // Default sorting by time descending
  });

  if (isDbLoading) return <div className="text-center p-10 text-gray-500">Memuat log riwayat...</div>;

  return (
    <>
      <div className={`space-y-6 animate-fade-in print:hidden ${printData ? 'hidden' : 'block'}`}>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div><h2 className="text-2xl font-bold text-gray-800">📖 Log Riwayat Transaksi</h2><p className="text-sm text-gray-500 mt-1">Pemantauan historis murni tanpa tombol manajemen aktif.</p></div>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col md:flex-row gap-4 items-center">
          <input type="text" placeholder="Cari nama / kamar..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500" />
          <div className="flex items-center gap-2 w-full md:w-auto">
            <div className="w-full md:w-36"><CustomDateTimePicker value={dateFilter.start} onChange={(val) => setDateFilter({...dateFilter, start: val})} /></div>
            <span className="text-gray-400">-</span>
            <div className="w-full md:w-36"><CustomDateTimePicker value={dateFilter.end} onChange={(val) => setDateFilter({...dateFilter, end: val})} alignRight={true} /></div>
            {(dateFilter.start || dateFilter.end) && <button onClick={() => setDateFilter({start:'', end:''})} className="bg-gray-200 text-gray-600 p-2 rounded-lg text-sm hover:bg-gray-300 transition-colors">&times;</button>}
          </div>
          <div className="w-full md:w-48">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500 font-medium">
              <option value="Semua">Semua Status</option>
              <option value="Selesai">Selesai (Check-Out)</option>
              <option value="Dibatalkan">Dibatalkan (Void)</option>
            </select>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="p-3 font-bold text-sm text-gray-700">Tamu & Kamar</th>
                  <th className="p-3 font-bold text-sm text-gray-700">Waktu (IN - OUT)</th>
                  <th className="p-3 font-bold text-sm text-gray-700 text-center">Status</th>
                  <th className="p-3 font-bold text-sm text-gray-700 text-center">Aksi Historis</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sortedTx.length === 0 ? (<tr><td colSpan="4" className="p-8 text-center text-gray-500 italic">Data riwayat kosong.</td></tr>) : (
                  sortedTx.map(tx => {
                    const noKamar = tx.type === 'harian' ? tx.noKamar : tx.roomNumber;
                    const wMasuk = tx.type === 'harian' ? new Date(tx.checkIn) : new Date(tx.periodeStart);
                    const wKeluar = tx.type === 'harian' ? new Date(tx.checkOut) : new Date(tx.periodeEnd + `T${padHour}:00:00`);
                    
                    // BUG FIX ABSOLUT: Status diikat murni dari deposit
                    const isAktif = (new Date() <= wKeluar) && (tx.statusDeposit === 'Belum Refund');
                    const isOverstay = (new Date() > wKeluar) && (tx.statusDeposit === 'Belum Refund');
                    
                    const canUndo = !tx.isVoid && !isAktif && !isOverstay && tx.statusDeposit !== 'Belum Refund' && (((new Date() - wKeluar) / 36e5) <= 24);

                    return (
                      <tr key={tx.id} className="hover:bg-gray-50 transition-colors">
                        <td className="p-4">
                          <div className="font-bold text-gray-800">{tx.nama}</div>
                          <div className="text-xs text-gray-500 mt-1 flex items-center gap-2">
                             <span>Kamar #{noKamar}</span>
                             <span className="text-gray-300">|</span>
                             <span className="font-mono text-blue-600 font-medium" title="ID Transaksi">{tx.id}</span>
                          </div>
                        </td>
                        <td className="p-4"><div className="text-sm text-gray-600">IN: {isNaN(wMasuk)?'-':format(wMasuk, 'dd MMM yy')}</div><div className="text-sm text-gray-600">OUT: {isNaN(wKeluar)?'-':format(wKeluar, 'dd MMM yy')}</div></td>
                        <td className="p-4 text-center">
                          {tx.isVoid ? (
                            <span className="text-[10px] font-bold text-red-700 bg-red-100 px-2 py-1 rounded">VOID</span>
                          ) : isAktif ? (
                            <span className="text-[10px] font-bold text-green-700 bg-green-100 px-2 py-1 rounded">IN-HOUSE</span>
                          ) : isOverstay ? (
                            <span className="text-[10px] font-bold text-orange-700 bg-orange-100 px-2 py-1 rounded">DEPOSIT TERTAHAN</span>
                          ) : (
                            <span className="text-[10px] font-bold text-gray-600 bg-gray-100 px-2 py-1 rounded border border-gray-200">SELESAI (C/O)</span>
                          )}
                        </td>
                        <td className="p-4 text-center">
                          <div className="flex justify-center gap-2">
                            
                            <div className="relative group flex justify-center">
                              <button onClick={() => setPrintData(tx)} className="bg-gray-800 hover:bg-black text-white px-3 py-2 rounded shadow-sm text-sm transition-colors">🖨️️</button>
                              <div className="absolute bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 hidden group-hover:block w-32 bg-gray-900 text-white text-[10px] p-2 rounded shadow-lg z-50 pointer-events-none transition-all">
                                Cetak ulang kuitansi.
                                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                              </div>
                            </div>

                            {canUndo && (
                              <div className="relative group flex justify-center">
                                <button onClick={() => prosesUndoCheckout(tx)} disabled={isSaving} className="bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-2 rounded shadow-sm text-sm font-bold transition-colors">↩️ Undo</button>
                                <div className="absolute bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 hidden group-hover:block w-40 bg-gray-900 text-white text-[10px] p-2 rounded shadow-lg z-50 pointer-events-none transition-all">
                                  Batalkan Check-Out (Berlaku 24 jam).
                                  <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                                </div>
                              </div>
                            )}

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
      </div>
      
      {/* [START: PrintPreview] */}
      {printData && (
        <div className="fixed inset-0 z-[9999] bg-gray-800 overflow-y-auto print:!static print:!block text-black print-wrapper">
          
          {printData.isVoid && (
            <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none opacity-20 print:fixed print:inset-0">
              <h1 className="text-9xl font-black text-red-600 rotate-[-45deg] tracking-widest border-8 border-red-600 p-8 rounded-3xl">VOID</h1>
            </div>
          )}

          <div className="bg-gray-900 text-white w-full mx-auto max-w-[210mm] p-4 flex justify-between items-center print:hidden shrink-0 shadow-lg mt-10 rounded-t-xl">
            <div>
              <h2 className="font-bold text-lg">Preview Struk Kuitansi</h2>
              <p className="text-xs text-gray-400">Pilih margin "Narrow". Ukuran kertas dari driver EPSON akan mendominasi.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setPrintData(null)} className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded font-bold transition-colors cursor-pointer">Tutup Preview</button>
              <button onClick={() => window.print()} className="bg-green-600 hover:bg-green-500 px-5 py-2 rounded font-bold flex items-center gap-2 shadow-md transition-colors cursor-pointer"><span>🖨️</span> Cetak Sekarang</button>
            </div>
          </div>
          
          <div className="flex-1 overflow-auto flex justify-center py-8 print:!static print:!block print:!p-0 print:!m-0 print:!overflow-visible print:!h-auto print:!w-full">
            <div className="bg-white w-full max-w-[195mm] min-h-[138mm] mx-auto p-6 shadow-2xl mb-10 print:!max-w-[195mm] print:!w-[195mm] print:!shadow-none print:!m-0 print:!p-0 print:!min-h-0 print:!h-auto flex flex-col font-sans text-sm print:text-[10px] relative receipt-box">
              <div className="border-b border-black pb-1 mb-3 print:mb-2 flex justify-between items-end"><div className="flex-shrink-0"><img src="/logo.png" alt="Greenhaus Inn" className="h-28 print:h-14 w-auto object-contain mix-blend-multiply" /></div><div className="text-right"><p className="text-sm print:text-[9px] font-medium text-gray-800 print:text-black leading-tight">Jl. Dinoyo No.86, Keputran, Surabaya</p><p className="text-sm print:text-[11px] font-extrabold uppercase mt-0.5 tracking-wide text-gray-900 print:text-black leading-tight">Tanda Terima Pembayaran</p></div></div>
              <div className="flex justify-between mb-6 print:mb-2">
                <div><table className="text-sm print:text-[10px]"><tbody>
                  <tr><td className="pr-4 font-bold text-gray-600 print:text-black">No. Transaksi</td><td>: {printData.id}</td></tr>
                  <tr><td className="pr-4 font-bold text-gray-600 print:text-black">Tipe Inap</td><td>: {toTitleCase(printData.tipeInap || 'kos')}</td></tr>
                  <tr><td className="pr-4 font-bold text-gray-600 print:text-black">Waktu Masuk</td><td>: {(() => { const isHarian = printData.tipeInap === 'harian' || printData.tipeInap === 'transit' || printData.type === 'harian'; const dateVal = isHarian ? printData.checkIn : printData.periodeStart; const d = new Date(dateVal); return isNaN(d) ? '-' : format(d, 'dd/MM/yyyy HH:mm'); })()}</td></tr>
                  <tr><td className="pr-4 font-bold text-gray-600 print:text-black">Waktu Keluar</td><td>: {(() => { const isHarian = printData.tipeInap === 'harian' || printData.tipeInap === 'transit' || printData.type === 'harian'; const dateVal = isHarian ? printData.checkOut : (printData.periodeEnd ? printData.periodeEnd + 'T12:00:00' : null); const d = new Date(dateVal); return isNaN(d) ? '-' : format(d, 'dd/MM/yyyy HH:mm'); })()}</td></tr>
                </tbody></table></div>
                <div>
                  <table className="text-sm print:text-[10px]">
                    <tbody>
                      <tr><td className="pr-4 font-bold text-gray-600 print:text-black">Nama Tamu</td><td className="font-bold">: {toTitleCase(printData.nama)}</td></tr>
                      <tr><td className="pr-4 font-bold text-gray-600 print:text-black">Kamar</td><td className="font-bold">: #{printData.noKamar || printData.roomNumber}</td></tr>
                      {printData.info && printData.info.includes('[Pindah') && (
                        <tr><td className="pr-4 font-bold text-gray-600 print:text-black align-top">Catatan Kamar</td><td className="font-bold text-[9px] italic text-orange-600 print:text-black">: {printData.info.split(' | ').find(i => i.includes('[Pindah'))}</td></tr>
                      )}
                      <tr><td className="pr-4 font-bold text-gray-600 print:text-black">Waktu Cetak</td><td>: {format(new Date(), 'dd/MM/yyyy HH:mm')}</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="mb-4 print:mb-2 flex-1">
                <h3 className="font-bold mb-2 print:mb-1 uppercase border-b border-gray-300 print:border-black inline-block text-sm print:text-[10px]">I. Rincian Biaya Sewa (Non-Refundable)</h3>
                <table className="w-full text-sm print:text-[10px] mb-4 print:mb-1 border print:border-black">
                  <thead className="bg-[#1a4b1a] text-white print:bg-white print:text-black print:border-b-2 print:border-black"><tr><th className="p-2 print:px-1 print:py-0.5 text-left print:border-black print:border-b">Deskripsi Transaksi</th><th className="p-2 print:px-1 print:py-0.5 text-right w-32 print:border-black print:border-b">Nominal (Rp)</th></tr></thead>
                  <tbody>
                    {printData.pembayaran?.rincianTarifHarian && printData.pembayaran.rincianTarifHarian.length > 0 ? ( printData.pembayaran.rincianTarifHarian.map((malam, idx) => ( <tr key={`mlm-${idx}`} className="border-b border-gray-100 print:border-black"><td className="p-2 print:px-1 print:py-0.5 print:border-black">Sewa Kamar #{printData.noKamar || printData.roomNumber} (Malam {idx + 1}) - {!isNaN(new Date(malam.tanggal)) ? format(new Date(malam.tanggal), 'dd/MM/yy') : '-'} <span className="text-[9px] uppercase">({malam.jenis})</span></td><td className="p-2 print:px-1 print:py-0.5 text-right print:border-black">{formatRp(malam.harga)}</td></tr>)) ) : ( <tr className="border-b border-gray-100 print:border-black"><td className="p-2 print:px-1 print:py-0.5 print:border-black">Sewa Kamar #{printData.noKamar || printData.roomNumber}</td><td className="p-2 print:px-1 print:py-0.5 text-right print:border-black">{formatRp(printData.pembayaran?.jumlahKamar)}</td></tr> )}
                    {printData.pembayaran?.tambahan && printData.pembayaran.tambahan.map((t, idx) => {
                      const labelQty = t.qty > 1 ? `${t.qty}x ` : '';
                      return (
                        <tr key={`tambahan-${idx}`} className="border-b border-gray-100 print:border-black">
                          <td className="p-2 print:px-1 print:py-0.5 print:border-black">Tambahan: {labelQty}{t.nama} <span className="text-[10px] print:text-[8px] uppercase font-bold text-gray-600 print:text-gray-800">({t.metode || '-'})</span></td>
                          <td className="p-2 print:px-1 print:py-0.5 text-right print:border-black">{formatRp((t.jumlah || 0) * (t.qty || 1))}</td>
                        </tr>
                      );
                    })}
                    
                    {printData.pembayaran?.diskon > 0 && (
                      <tr className="bg-red-50 text-red-700 font-bold print:bg-white print:text-black">
                        <td className="p-2 print:px-1 print:py-0.5 text-right print:border-black">POTONGAN DISKON (-):</td>
                        <td className="p-2 print:px-1 print:py-0.5 text-right print:border-black">- {formatRp(printData.pembayaran.diskon)}</td>
                      </tr>
                    )}
                    
                    <tr className="bg-gray-50 font-bold print:bg-white print:border-t-2 print:border-black">
                      <td className="p-2 print:px-1 print:py-0.5 text-right text-[#1a4b1a] print:text-black print:border-black">TOTAL TAGIHAN NETTO:</td>
                      <td className="p-2 print:px-1 print:py-0.5 text-right text-[#1a4b1a] print:text-black print:border-black">
                        {formatRp((printData.pembayaran?.jumlahKamar || 0) + (printData.pembayaran?.tambahan || []).reduce((sum, item) => sum + ((item.jumlah || 0) * (item.qty || 1)), 0) - (printData.pembayaran?.diskon || 0))}
                      </td>
                    </tr>
                    {(() => { 
                      const summary = {}; 
                      if (printData.pembayaran?.detailMetodeKamar?.length > 0) { 
                        printData.pembayaran.detailMetodeKamar.forEach(m => { const met = m.metode || 'Cash'; summary[met] = (summary[met] || 0) + (Number(m.nominal) || 0); }); 
                      } else { 
                        const met = printData.pembayaran?.metodeKamar || '-'; summary[met] = (summary[met] || 0) + (Number(printData.pembayaran?.jumlahKamar) || 0) - (printData.pembayaran?.diskon || 0); 
                      } 
                      if (printData.pembayaran?.tambahan && printData.pembayaran.tambahan.length > 0) { 
                        printData.pembayaran.tambahan.forEach(t => { const met = t.metode || 'Cash'; summary[met] = (summary[met] || 0) + ((Number(t.jumlah) || 0) * (t.qty || 1)); }); 
                      } 
                      return Object.entries(summary).map(([metode, nominal], idx) => ( <tr key={`bayar-${idx}`} className="print:bg-white border-t border-gray-100 border-dashed print:border-black text-gray-700"><td className="p-2 print:px-1 print:py-0.5 text-right print:text-black print:border-black text-xs print:text-[9px]">Dibayar via <span className="font-bold uppercase">{metode}</span>:</td><td className="p-2 print:px-1 print:py-0.5 text-right print:text-black print:border-black font-bold text-xs print:text-[9px]">{formatRp(nominal)}</td></tr> )); 
                    })()}
                  </tbody>
                </table>
                <h3 className="font-bold mb-2 print:mb-1 uppercase border-b border-gray-300 print:border-black inline-block text-sm print:text-[10px]">II. Titipan Deposit (Refundable)</h3>
                <table className="w-full text-sm print:text-[10px] border print:border-black">
                  <thead className="bg-[#1a4b1a] text-white print:bg-white print:text-black print:border-b-2 print:border-black"><tr><th className="p-2 print:px-1 print:py-0.5 text-left print:border-black print:border-b">Keterangan</th><th className="p-2 print:px-1 print:py-0.5 text-right w-32 print:border-black print:border-b">Nominal (Rp)</th></tr></thead>
                  <tbody>
                    <tr className="border-b border-gray-100 print:border-black"><td className="p-2 print:px-1 print:py-0.5 print:border-black">Uang Jaminan Kamar (Dititipkan via {printData.pembayaran?.metodeDeposit || '-'})</td><td className="p-2 print:px-1 print:py-0.5 text-right print:border-black">{formatRp(printData.pembayaran?.jumlahDeposit)}</td></tr>
                    <tr className="print:bg-white print:border-t-2 print:border-black"><td className="p-2 print:px-1 print:py-0.5 text-left text-gray-600 print:text-black print:border-black italic text-[10px] print:text-[8px]">Uang Jaminan akan dikembalikan saat Check-Out apabila tidak ada kerusakan/kehilangan aset kamar.</td><td className="p-2 print:px-1 print:py-0.5 text-right font-bold text-[#1a4b1a] print:text-black print:border-black">{formatRp(printData.pembayaran?.jumlahDeposit)}</td></tr>
                  </tbody>
                </table>
              </div>
              
              <div className="mt-4 print:mt-1 flex justify-between text-sm print:text-[9px]">
                <div className="text-center w-40 flex flex-col justify-between h-[25mm] print:h-[18mm]">
                  <p className="text-gray-500 print:text-black">Tamu,</p>
                  <p className="font-bold border-b border-gray-400 print:border-black pb-1 uppercase mt-auto">{printData.nama}</p>
                </div>
                <div className="text-center w-40 flex flex-col justify-between h-[25mm] print:h-[18mm]">
                  <p className="text-gray-500 print:text-black">Resepsionis,</p>
                  <p className="font-bold border-b border-gray-400 print:border-black pb-1 uppercase mt-auto">FO Greenhaus</p>
                </div>
              </div>

            </div>
          </div>
          
          <style>{`
            .no-spinners {
              -moz-appearance: textfield;
            }
            .no-spinners::-webkit-outer-spin-button,
            .no-spinners::-webkit-inner-spin-button {
              -webkit-appearance: none;
              margin: 0;
            }
            
            @media print { 
              @page { size: portrait; margin: 2mm 5mm; } 
              html, body, #root, .print-wrapper, .print-wrapper * { 
                background: #ffffff !important; 
                background-color: #ffffff !important; 
                color: #000000 !important;
                box-shadow: none !important;
                text-shadow: none !important;
                border-color: #000000 !important;
              }
              html, body, #root { 
                height: auto !important; 
                min-height: auto !important;
                width: 100% !important; 
                overflow: visible !important; 
                position: static !important;
                margin: 0 !important; 
                padding: 0 !important; 
                display: block !important; 
              }
              .print-wrapper {
                position: static !important;
                display: block !important;
                width: 100% !important;
                height: auto !important;
                overflow: visible !important;
              }
              .receipt-box { 
                margin: 0 !important;
                padding: 0 !important;
                width: 100% !important;
                max-w: 100% !important;
              }
              .print-wrapper .text-red-600, .print-wrapper .border-red-600 {
                color: #000000 !important;
                border-color: #000000 !important;
              }
            }
          `}</style>
        </div>
      )}
      {/* [END: PrintPreview] */}
    </>
  );
}
// [END: RiwayatTransaksiModule]