import { useState, useEffect } from 'react';
import { format, parseISO, addHours, differenceInCalendarDays } from 'date-fns';

const toTitleCase = (str) => {
  return str.toLowerCase().replace(/\b\w/g, s => s.toUpperCase());
};

// Helper untuk format rupiah
const formatRp = (angka) => {
  return (angka || 0).toLocaleString('id-ID');
};

export default function RiwayatTransaksi() {
  const [loading, setLoading] = useState(true);
  const [riwayatHarian, setRiwayatHarian] = useState([]);
  const [riwayatKos, setRiwayatKos] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');

const [editingRalat, setEditingRalat] = useState(null);
  const [targetCO, setTargetCO] = useState(null);
  const [printData, setPrintData] = useState(null);

  // STATE BARU: Laporan Shift (End of Day)
  const [isRekapOpen, setIsRekapOpen] = useState(false);
  const [rekapDate, setRekapDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  // LOGIKA: Kalkulasi Rekap Hari Ini
  const getRekapData = () => {
    let totalPendapatan = 0; let totalDeposit = 0; let tamuCount = 0;
    const metodePendapatan = {}; const metodeDeposit = {};

    const prosesTransaksi = (tx) => {
      // Membaca transaksi yang diinput pada tanggal yang dipilih
      if (!tx.waktuInput.startsWith(rekapDate)) return;
      tamuCount++;

      // KALKULASI KAMAR (SUPPORT MULTI-PAYMENT)
      if (tx.pembayaran?.detailMetodeKamar && tx.pembayaran.detailMetodeKamar.length > 0) {
        tx.pembayaran.detailMetodeKamar.forEach(m => {
          totalPendapatan += m.nominal;
          metodePendapatan[m.metode] = (metodePendapatan[m.metode] || 0) + m.nominal;
        });
      } else {
        const hrgKamar = tx.pembayaran?.jumlahKamar || 0;
        const bayarKamar = tx.pembayaran?.metodeKamar || 'Lainnya';
        totalPendapatan += hrgKamar;
        metodePendapatan[bayarKamar] = (metodePendapatan[bayarKamar] || 0) + hrgKamar;
      }

      // Kalkulasi Tambahan
      (tx.pembayaran?.tambahan || []).forEach(t => {
        totalPendapatan += t.jumlah;
        metodePendapatan[t.metode] = (metodePendapatan[t.metode] || 0) + t.jumlah;
      });

      // Kalkulasi Deposit
      const hrgDep = tx.pembayaran?.jumlahDeposit || 0;
      const bayarDep = tx.pembayaran?.metodeDeposit || 'Lainnya';
      totalDeposit += hrgDep;
      metodeDeposit[bayarDep] = (metodeDeposit[bayarDep] || 0) + hrgDep;
    };

    riwayatHarian.forEach(prosesTransaksi);
    riwayatKos.forEach(prosesTransaksi);

    return { totalPendapatan, totalDeposit, tamuCount, metodePendapatan, metodeDeposit };
  };
  const rekap = getRekapData();

  const [editForm, setEditForm] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const [floors, setFloors] = useState([]);
  const [occupiedRooms, setOccupiedRooms] = useState([]);
  const [isRoomModalOpen, setIsRoomModalOpen] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const res = await fetch('http://localhost:5000/api/data');
        if (!res.ok) throw new Error("Gagal memuat data");
        const data = await res.json();
        
        setRiwayatHarian((data.dailyTransactions || []).sort((a, b) => new Date(b.waktuInput) - new Date(a.waktuInput)));
        setRiwayatKos((data.activeKost || []).sort((a, b) => new Date(b.waktuInput) - new Date(a.waktuInput)));

        const s = data.settings || {};
        setFloors(s.floors || []);

        const occ = [];
        const sekarang = new Date();
        (data.dailyTransactions || []).forEach(tx => {
          if (tx.checkOut && sekarang <= new Date(tx.checkOut)) occ.push(tx.noKamar.toString().trim());
        });
        (data.activeKost || []).forEach(kos => {
          if (kos.periodeEnd) {
             const end = new Date(kos.periodeEnd); end.setHours(12,0,0,0);
             if (sekarang <= end) occ.push(kos.roomNumber.toString().trim());
          }
        });
        setOccupiedRooms(occ);
      } catch (error) { console.error("Gagal mengambil riwayat:", error); } finally { setLoading(false); }
    };
    loadData();
  }, [refreshTrigger]);

  const getStatusAndActions = (checkOutDate) => {
    if (!checkOutDate) return { text: 'Unknown', color: 'bg-gray-200 text-gray-700', canRalat: true, canCO: true };
    const sekarang = new Date();
    const co = new Date(checkOutDate);
    
    if (sekarang <= co) return { text: 'Aktif In-House', color: 'bg-green-100 text-green-800 border-green-300', canRalat: true, canCO: true };
    
    const batasBisaEdit = addHours(co, 1);
    if (sekarang <= batasBisaEdit) return { text: 'Selesai (Masa Ralat)', color: 'bg-yellow-100 text-yellow-800 border-yellow-300', canRalat: true, canCO: false };
    
    return { text: 'Selesai (Terkunci)', color: 'bg-gray-100 text-gray-600 border-gray-300', canRalat: false, canCO: false };
  };

  const openRalatModal = (item, type) => {
    setEditingRalat({ ...item, type }); 
    setEditForm({ ...item, tipeKamar: type === 'harian' ? item.tipeKamar : item.roomType }); 
  };

  const handleSimpanRalat = async () => {
    setIsSaving(true);
    try {
      const res = await fetch('http://localhost:5000/api/data');
      const dbData = await res.json();

      if (editingRalat.type === 'harian') {
        const index = dbData.dailyTransactions.findIndex(tx => tx.id === editingRalat.id);
        if (index !== -1) dbData.dailyTransactions[index] = { ...dbData.dailyTransactions[index], ...editForm };
      } else {
        const index = dbData.activeKost.findIndex(kos => kos.id === editingRalat.id);
        if (index !== -1) dbData.activeKost[index] = { ...dbData.activeKost[index], ...editForm, roomType: editForm.tipeKamar || editForm.roomType };
      }

      const postRes = await fetch('http://localhost:5000/api/data/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dbData) });
      const result = await postRes.json();
      if (result.success) { setEditingRalat(null); setRefreshTrigger(prev => prev + 1); } 
      else { alert("Gagal menyimpan ralat: " + result.error); }
    } catch (error) { console.error(error); alert("Terjadi kesalahan jaringan."); } finally { setIsSaving(false); }
  };

  const executeCOInstan = async (statusDep) => {
    setIsSaving(true);
    try {
      const res = await fetch('http://localhost:5000/api/data');
      const dbData = await res.json();
      const nowStrHarian = format(new Date(), "yyyy-MM-dd'T'HH:mm");
      // REVISI: Ubah agar C/O Instan Kos juga merekam jam (mendekati gaya Harian) agar bisa dibaca langsung selesai.
      const nowStrKos = format(new Date(), "yyyy-MM-dd'T'HH:mm");

      if (targetCO.type === 'harian') {
        const index = dbData.dailyTransactions.findIndex(tx => tx.id === targetCO.id);
        if (index !== -1) {
          dbData.dailyTransactions[index].checkOut = nowStrHarian;
          dbData.dailyTransactions[index].statusDeposit = statusDep;
        }
      } else {
        const index = dbData.activeKost.findIndex(kos => kos.id === targetCO.id);
        if (index !== -1) {
          dbData.activeKost[index].periodeEnd = nowStrKos;
          dbData.activeKost[index].statusDeposit = statusDep;
        }
      }

      const postRes = await fetch('http://localhost:5000/api/data/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dbData) });
      const result = await postRes.json();
      
      if (result.success) { setTargetCO(null); setRefreshTrigger(prev => prev + 1); } 
      else { alert("Gagal C/O: " + result.error); }
    } catch (error) { console.error(error); alert("Terjadi kesalahan jaringan."); } finally { setIsSaving(false); }
  };

  const handleSelectRoom = (kamarNo, kamarTipe) => {
    if (editingRalat.type === 'harian') setEditForm({...editForm, noKamar: kamarNo, tipeKamar: kamarTipe});
    else setEditForm({...editForm, roomNumber: kamarNo, tipeKamar: kamarTipe});
    setIsRoomModalOpen(false);
  };

  const filteredHarian = riwayatHarian.filter(tx => (tx.nama && tx.nama.toLowerCase().includes(searchTerm.toLowerCase())) || (tx.noKamar && tx.noKamar.toString().toLowerCase().includes(searchTerm.toLowerCase())));
  const filteredKos = riwayatKos.filter(kos => (kos.nama && kos.nama.toLowerCase().includes(searchTerm.toLowerCase())) || (kos.roomNumber && kos.roomNumber.toString().toLowerCase().includes(searchTerm.toLowerCase())));

  // Helper Komputasi Struk
  const getJumlahMalam = (start, end, type) => {
    if (!start || !end) return '1 Malam';
    if (type === 'transit') return '6 Jam';
    if (type === 'kos') return '1 Bulan';
    
    const startDate = new Date(start);
    const endDate = new Date(end);

    let numDays = differenceInCalendarDays(endDate, startDate);

    // Koreksi Early Check-In: Masuk sebelum jam 12 siang memakan kuota malam sebelumnya
    if (type === 'harian' && startDate.getHours() < 12) {
      numDays += 1;
    }

    return numDays > 0 ? `${numDays} Malam` : '1 Malam';
  };

  if (loading) return <div className="text-center p-10 text-gray-500 italic">Memuat riwayat transaksi...</div>;

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      
      {/* BAGIAN UI UTAMA FO (Dihilangkan/Disembunyikan saat sedang Print Layout) */}
      <div className="print:hidden space-y-6">
        <div className="bg-white p-4 rounded-md shadow-sm border border-gray-200 flex flex-col md:flex-row justify-between items-center gap-4">
          <div>
            <h2 className="text-xl font-bold text-gray-800">🏨 Riwayat & Kontrol Transaksi</h2>
            <p className="text-sm text-gray-500">Pusat kontrol Checkout Instan, Ralat Inap, dan Cetak Struk.</p>
          </div>
          <div className="w-full md:w-auto flex gap-3">
            <button onClick={() => setIsRekapOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-bold shadow-sm transition-all active:scale-95 flex items-center gap-2 whitespace-nowrap">
              <span className="text-lg">📊</span> Laporan Shift
            </button>
            <input type="text" placeholder="🔍 Cari nama atau kamar..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full md:w-64 border border-gray-300 rounded-lg p-2.5 bg-gray-50 focus:ring-2 focus:ring-green-500 outline-none" />
          </div>
        </div>

        {/* TABEL HARIAN */}
        <div className="bg-white rounded-md shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-green-50 p-3 border-b border-green-100"><h3 className="font-bold text-green-900">Transaksi Harian & Transit ({filteredHarian.length})</h3></div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 text-gray-600 border-b border-gray-200">
                <tr><th className="p-3 font-semibold w-1/4">Tamu & Kamar</th><th className="p-3 font-semibold">Check-In</th><th className="p-3 font-semibold">Check-Out</th><th className="p-3 font-semibold text-center">Status</th><th className="p-3 font-semibold text-center w-36">Tindakan FO</th></tr>
              </thead>
              <tbody>
                {filteredHarian.length === 0 ? (<tr><td colSpan="5" className="p-4 text-center text-gray-500 italic">Data tidak ditemukan.</td></tr>) : (
                  filteredHarian.map((tx) => {
                    const status = getStatusAndActions(tx.checkOut);
                    return (
                      <tr key={tx.id} className="border-b border-gray-100 hover:bg-green-50/30 transition-colors">
                        <td className="p-3"><div className="font-bold text-gray-800 text-base">{tx.nama}</div><div className="text-sm text-gray-600">Kamar <span className="font-bold text-green-600">#{tx.noKamar}</span></div></td>
                        <td className="p-3"><div className="font-medium text-gray-700">{tx.checkIn ? format(parseISO(tx.checkIn), 'dd/MM/yyyy') : '-'}</div><div className="text-xs text-gray-500">{tx.checkIn ? format(parseISO(tx.checkIn), 'HH:mm') : '-'}</div></td>
                        <td className="p-3"><div className="font-medium text-gray-700">{tx.checkOut ? format(parseISO(tx.checkOut), 'dd/MM/yyyy') : '-'}</div><div className="text-xs text-gray-500">{tx.checkOut ? format(parseISO(tx.checkOut), 'HH:mm') : '-'}</div></td>
                        <td className="p-3 text-center"><span className={`px-2 py-1 border rounded-md text-xs font-bold ${status.color}`}>{status.text}</span></td>
                        <td className="p-3">
                          <div className="flex flex-col gap-2">
                            <button onClick={() => setPrintData({...tx, type: 'harian'})} className="bg-gray-800 hover:bg-black text-white w-full py-1.5 rounded text-sm font-bold shadow-sm transition-colors flex items-center justify-center gap-1"><span>🖨️</span> Cetak Struk</button>
                            {status.canRalat && <button onClick={() => openRalatModal(tx, 'harian')} className="bg-orange-100 hover:bg-orange-200 text-orange-700 w-full py-1.5 rounded text-sm font-bold transition-colors border border-orange-300 flex items-center justify-center gap-1"><span>⚙️</span> Ralat Kamar</button>}
                            {status.canCO && <button onClick={() => setTargetCO({...tx, type: 'harian'})} className="bg-red-500 hover:bg-red-600 text-white w-full py-1.5 rounded text-sm font-bold shadow transition-colors flex items-center justify-center gap-1"><span>🏃</span> C/O Instan</button>}
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* TABEL KOS */}
        <div className="bg-white rounded-md shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-orange-50 p-3 border-b border-orange-100"><h3 className="font-bold text-orange-900">Transaksi Kos & Bulanan ({filteredKos.length})</h3></div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 text-gray-600 border-b border-gray-200">
                <tr><th className="p-3 font-semibold w-1/4">Tamu & Kamar</th><th className="p-3 font-semibold">Mulai Sewa</th><th className="p-3 font-semibold">Batas Sewa (12:00)</th><th className="p-3 font-semibold text-center">Status</th><th className="p-3 font-semibold text-center w-36">Tindakan FO</th></tr>
              </thead>
              <tbody>
                {filteredKos.length === 0 ? (<tr><td colSpan="5" className="p-4 text-center text-gray-500 italic">Data tidak ditemukan.</td></tr>) : (
                  filteredKos.map((kos) => {
                    // REVISI LOGIKA CO INSTAN KOS: Jika string panjang (ada 'T'), dia sudah C/O paksa, baca jamnya langsung. 
                    // Jika string pendek (hanya tgl), dia masih normal, tambahkan jam 12:00.
                    let checkOutKos = null;
                    if (kos.periodeEnd) { 
                      checkOutKos = new Date(kos.periodeEnd); 
                      if (!kos.periodeEnd.includes('T')) { checkOutKos.setHours(12, 0, 0, 0); }
                    }
                    const status = getStatusAndActions(checkOutKos);
                    return (
                      <tr key={kos.id} className="border-b border-gray-100 hover:bg-orange-50/30 transition-colors">
                        <td className="p-3"><div className="font-bold text-gray-800 text-base">{kos.nama}</div><div className="text-sm text-gray-600">Kamar <span className="font-bold text-orange-600">#{kos.roomNumber}</span></div></td>
                        <td className="p-3"><div className="font-medium text-gray-700">{kos.periodeStart ? format(new Date(kos.periodeStart), 'dd/MM/yyyy') : '-'}</div></td>
                        <td className="p-3"><div className="font-medium text-gray-700">{kos.periodeEnd ? format(new Date(kos.periodeEnd), 'dd/MM/yyyy') : '-'}</div></td>
                        <td className="p-3 text-center"><span className={`px-2 py-1 border rounded-md text-xs font-bold ${status.color}`}>{status.text}</span></td>
                        <td className="p-3">
                          <div className="flex flex-col gap-2">
                            <button onClick={() => setPrintData({...kos, type: 'kos'})} className="bg-gray-800 hover:bg-black text-white w-full py-1.5 rounded text-sm font-bold shadow-sm transition-colors flex items-center justify-center gap-1"><span>🖨️</span> Cetak Struk</button>
                            {status.canRalat && <button onClick={() => openRalatModal(kos, 'kos')} className="bg-orange-100 hover:bg-orange-200 text-orange-700 w-full py-1.5 rounded text-sm font-bold transition-colors border border-orange-300 flex items-center justify-center gap-1"><span>⚙️</span> Ralat Kamar</button>}
                            {status.canCO && <button onClick={() => setTargetCO({...kos, type: 'kos'})} className="bg-red-500 hover:bg-red-600 text-white w-full py-1.5 rounded text-sm font-bold shadow transition-colors flex items-center justify-center gap-1"><span>🏃</span> C/O Instan</button>}
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* POPUP: MODAL RALAT INAP & DEPOSIT */}
      {editingRalat && (
        <div className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center p-4 animate-fade-in print:hidden">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
            <div className="p-5 bg-orange-600 text-white flex justify-between items-center">
              <h3 className="font-bold text-lg">⚙️ Ralat Transaksi Inap</h3>
              <button onClick={() => setEditingRalat(null)} className="text-orange-200 hover:text-white font-bold text-2xl">&times;</button>
            </div>
            <div className="p-6 space-y-5 bg-orange-50/30">
              <div>
                <label className="block text-sm font-bold text-orange-900 mb-1">Nomor Kamar (Ganti Kamar)</label>
                <button type="button" onClick={() => setIsRoomModalOpen(true)} className="w-full text-left border border-orange-300 bg-white rounded p-3 text-sm font-bold flex justify-between hover:bg-orange-50 shadow-sm">
                  <span className="text-orange-900">Kamar {editingRalat.type === 'harian' ? editForm.noKamar : editForm.roomNumber} ({editForm.tipeKamar?.split('-')[0].toUpperCase()})</span>
                  <span className="text-lg">🔄</span>
                </button>
              </div>
              <div>
                <label className="block text-sm font-bold text-orange-900 mb-1">Ralat Batas Waktu Check-Out / Sewa</label>
                {editingRalat.type === 'harian' ? (
                  <input type="datetime-local" value={editForm.checkOut || ''} onChange={(e) => setEditForm({...editForm, checkOut: e.target.value})} className="w-full border border-orange-300 rounded p-3 text-sm outline-none focus:ring-2 focus:ring-orange-500 shadow-sm"/>
                ) : (
                  <input type="date" value={editForm.periodeEnd || ''} onChange={(e) => setEditForm({...editForm, periodeEnd: e.target.value})} className="w-full border border-orange-300 rounded p-3 text-sm outline-none focus:ring-2 focus:ring-orange-500 shadow-sm"/>
                )}
              </div>
              <div className="bg-white p-4 rounded border border-orange-200 shadow-sm mt-4">
                <label className="block text-sm font-bold text-gray-700 mb-2">Status Uang Deposit (Rp {((editForm.pembayaran?.jumlahDeposit) || 0).toLocaleString('id-ID')})</label>
                <select value={editForm.statusDeposit || 'Belum Refund'} onChange={(e) => setEditForm({...editForm, statusDeposit: e.target.value})} className={`w-full border rounded p-3 text-sm font-bold outline-none focus:ring-2 focus:ring-orange-500 ${editForm.statusDeposit === 'Sudah Refund' ? 'bg-green-100 text-green-800' : editForm.statusDeposit === 'Hangus' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>
                  {!(new Date() > (editingRalat.type === 'harian' ? new Date(editForm.checkOut) : (() => { const d = new Date(editForm.periodeEnd); d.setHours(12, 0, 0, 0); return d; })())) && (
                    <option value="Belum Refund">Belum Refund</option>
                  )}
                  <option value="Sudah Refund">Sudah Refund</option>
                  <option value="Hangus">Hangus (Denda)</option>
                </select>
              </div>
            </div>
            <div className="p-4 bg-white border-t flex justify-end gap-3">
              <button onClick={() => setEditingRalat(null)} className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 rounded font-bold text-sm border">Batal</button>
              <button onClick={handleSimpanRalat} disabled={isSaving} className="px-6 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded font-bold text-sm shadow-md">{isSaving ? 'Menyimpan...' : '💾 Simpan Ralat'}</button>
            </div>
          </div>
        </div>
      )}

      {/* POPUP: VERIFIKASI CO INSTAN */}
      {targetCO && (
        <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4 animate-fade-in print:hidden">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-sm overflow-hidden text-center">
             <div className="bg-red-600 p-5"><h3 className="font-extrabold text-white text-xl">⚠️ CHECK-OUT INSTAN</h3></div>
             <div className="p-6">
                <p className="text-gray-800 font-bold text-lg mb-1">{targetCO.nama}</p>
                <p className="text-sm text-gray-500 mb-6">Kamar #{targetCO.type === 'harian' ? targetCO.noKamar : targetCO.roomNumber} akan diselesaikan detik ini juga. Bagaimana nasib uang depositnya?</p>
                <div className="space-y-3">
                   <button onClick={() => executeCOInstan('Sudah Refund')} disabled={isSaving} className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3 rounded shadow-sm border border-green-700 transition-colors text-sm">✅ Deposit Di-Refund</button>
                   <button onClick={() => executeCOInstan('Hangus')} disabled={isSaving} className="w-full bg-gray-800 hover:bg-black text-white font-bold py-3 rounded shadow-sm border border-black transition-colors text-sm">🔥 Deposit Hangus / Denda</button>
                   <button onClick={() => executeCOInstan('Belum Refund')} disabled={isSaving} className="w-full bg-yellow-100 hover:bg-yellow-200 text-yellow-800 font-bold py-3 rounded shadow-sm border border-yellow-300 transition-colors text-sm">⏳ Nanti Saja (Belum Refund)</button>
                </div>
                <button onClick={() => setTargetCO(null)} className="w-full mt-6 bg-gray-100 hover:bg-gray-200 text-gray-600 py-3 rounded font-bold transition-colors">Batalkan</button>
             </div>
          </div>
        </div>
      )}

      {/* MODAL KAMAR */}
      {isRoomModalOpen && (
        <div className="fixed inset-0 z-[70] bg-black/70 flex items-center justify-center p-4 animate-fade-in print:hidden">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-5 bg-gray-800 text-white flex justify-between items-center shrink-0">
              <div><h3 className="font-bold text-lg">🛏️ Pindah Kamar</h3><p className="text-xs text-gray-300">Pilih kamar kosong (Hijau).</p></div>
              <button onClick={() => setIsRoomModalOpen(false)} className="text-gray-400 hover:text-white font-bold text-3xl transition-colors">&times;</button>
            </div>
            <div className="overflow-y-auto p-6 flex-1 space-y-6 bg-gray-50">
              {floors.length === 0 ? (
                <div className="text-center text-gray-500 italic py-10">Belum ada denah kamar.</div>
              ) : (
                floors.map((floor) => (
                  <div key={floor.id} className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                    <h4 className="font-bold text-gray-700 mb-3 border-b border-gray-100 pb-2">{floor.nama}</h4>
                    {floor.kamar.length === 0 ? (<p className="text-xs text-gray-400 italic">Tidak ada kamar.</p>) : (
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                        {floor.kamar.filter(k => k.no.trim() !== '').map((k) => {
                          const currentRoom = editingRalat?.type === 'harian' ? editForm.noKamar : editForm.roomNumber;
                          const isOccupied = occupiedRooms.includes(k.no.trim()) && k.no.trim() !== currentRoom;
                          return (
                            <button
                              key={k.id}
                              disabled={isOccupied}
                              onClick={() => handleSelectRoom(k.no.trim(), k.tipe)}
                              className={`p-3 rounded-lg border-2 flex flex-col items-center justify-center transition-all ${
                                k.no.trim() === currentRoom ? 'bg-orange-100 border-orange-500 text-orange-800 shadow-md ring-2 ring-orange-300' 
                                : isOccupied ? 'bg-red-50 border-red-200 text-red-400 cursor-not-allowed opacity-70' 
                                : 'bg-green-50 border-green-400 text-green-700 hover:bg-green-100 hover:scale-105 shadow-sm cursor-pointer'
                              }`}
                            >
                              <span className="text-xl font-black">{k.no}</span>
                              <span className="text-[9px] font-bold uppercase mt-1 tracking-wider">{k.tipe.split('-')[0]}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* POPUP: MODAL LAPORAN SHIFT / END OF DAY */}
      {isRekapOpen && (
        <div className="fixed inset-0 z-[80] bg-black/70 flex items-center justify-center p-4 animate-fade-in print:hidden">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 bg-blue-700 text-white flex justify-between items-center shrink-0">
              <div>
                <h3 className="font-bold text-xl">📊 Laporan Pendapatan Kasir</h3>
                <p className="text-xs text-blue-200">Rekapitulasi total transaksi berdasarkan tanggal Check-In.</p>
              </div>
              <button onClick={() => setIsRekapOpen(false)} className="text-blue-200 hover:text-white font-bold text-3xl transition-colors">&times;</button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 bg-gray-50 space-y-6">
              
              {/* Date Picker Header */}
              <div className="flex flex-col sm:flex-row justify-between items-center bg-white p-4 rounded-xl border border-gray-200 shadow-sm gap-4">
                <span className="font-bold text-gray-700">Pilih Tanggal Laporan :</span>
                <div className="flex gap-2">
                  <button onClick={() => setRekapDate(format(new Date(), 'yyyy-MM-dd'))} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-bold transition-colors">Hari Ini</button>
                  <input type="date" value={rekapDate} onChange={(e) => setRekapDate(e.target.value)} className="border border-blue-300 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 font-bold text-blue-800 bg-blue-50" />
                </div>
              </div>

              {/* Highlight Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm border-l-4 border-l-blue-500">
                  <p className="text-xs font-bold text-gray-500 uppercase">Kamar Terjual</p>
                  <p className="text-2xl font-black text-blue-700 mt-1">{rekap.tamuCount} <span className="text-sm text-gray-500 font-medium">Tamu</span></p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm border-l-4 border-l-green-500">
                  <p className="text-xs font-bold text-gray-500 uppercase">Total Akomodasi (Milik Hotel)</p>
                  <p className="text-2xl font-black text-green-700 mt-1">Rp {formatRp(rekap.totalPendapatan)}</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm border-l-4 border-l-orange-500">
                  <p className="text-xs font-bold text-gray-500 uppercase">Total Deposit (Titipan)</p>
                  <p className="text-2xl font-black text-orange-600 mt-1">Rp {formatRp(rekap.totalDeposit)}</p>
                </div>
              </div>

              {/* Rincian Metode Pembayaran */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Tabel Akomodasi */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                  <div className="bg-green-100 p-3 border-b border-green-200"><h4 className="font-bold text-green-900 text-sm">💰 Metode Pembayaran Akomodasi</h4></div>
                  <div className="p-4 space-y-3">
                    {Object.keys(rekap.metodePendapatan).length === 0 ? <p className="text-sm text-gray-400 italic">Belum ada transaksi.</p> : (
                      Object.entries(rekap.metodePendapatan).map(([metode, jumlah]) => (
                        <div key={metode} className="flex justify-between items-center border-b border-dashed pb-2">
                          <span className="font-bold text-gray-600">{metode}</span>
                          <span className="font-black text-gray-800">Rp {formatRp(jumlah)}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Tabel Deposit */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                  <div className="bg-orange-100 p-3 border-b border-orange-200"><h4 className="font-bold text-orange-900 text-sm">🛡️ Metode Penerimaan Deposit</h4></div>
                  <div className="p-4 space-y-3">
                    {Object.keys(rekap.metodeDeposit).length === 0 ? <p className="text-sm text-gray-400 italic">Belum ada deposit.</p> : (
                      Object.entries(rekap.metodeDeposit).map(([metode, jumlah]) => (
                        <div key={metode} className="flex justify-between items-center border-b border-dashed pb-2">
                          <span className="font-bold text-gray-600">{metode}</span>
                          <span className="font-black text-gray-800">Rp {formatRp(jumlah)}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

              </div>
            </div>

            <div className="p-5 bg-white border-t flex justify-end gap-3 shrink-0">
              {/* Tombol Export (Mati sementara untuk fase selanjutnya) */}
              <button disabled className="bg-gray-100 text-gray-400 px-5 py-2.5 rounded-lg font-bold text-sm cursor-not-allowed">📥 Export Excel (Segera)</button>
            </div>
          </div>
        </div>
      )}

    {/* POPUP PRINT PREVIEW SEKALIGUS KANVAS CETAK (Khusus Print) */}
      {printData && (
        
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-900/80 p-4 print:p-0 print:bg-white print:block print:relative print:z-auto">
          
          {/* Print Style Injector */}
          <style>
            {`
              @media print {
                /* Margin 0 untuk mematikan header/footer browser */
                @page { size: A5 landscape; margin: 0; }
                body { background: white; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                /* Mencegah tabel atau baris terbelah setengah saat pindah ke halaman 2 */
                table { page-break-inside: auto; }
                tr { page-break-inside: avoid; page-break-after: auto; }
                .avoid-break { page-break-inside: avoid; }
              }
            `}
          </style>

          {/* REVISI: Menghapus print:h-[148mm] dan print:overflow-hidden agar BISA ke page 2 jika item > 4 */}
          <div className="bg-white shadow-2xl w-full max-w-[210mm] max-h-[90vh] overflow-y-auto print:max-w-none print:h-auto print:shadow-none print:overflow-visible relative flex flex-col print:block">
            
            <div className="p-4 bg-gray-800 text-white flex justify-between items-center shrink-0 sticky top-0 z-10 print:hidden">
              <div>
                <h3 className="font-bold text-lg">🖨️ Print Preview (A5 Landscape)</h3>
                <p className="text-xs text-gray-300">Pilih "Save as PDF" atau Printer LX-310 pada dialog cetak.</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setPrintData(null)} className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded text-sm font-bold transition-colors">Tutup</button>
                <button onClick={() => window.print()} className="px-5 py-2 bg-green-500 hover:bg-green-400 text-gray-900 rounded text-sm font-extrabold shadow transition-colors flex items-center gap-2">
                  <span>🖨️</span> CETAK SEKARANG
                </button>
              </div>
            </div>

            {/* KANVAS STRUK - Padding print:p-6 (sekitar 1.5cm) sebagai ruang aman dari tepi pinggir mesin dot matrix */}
            <div className="p-6 sm:p-8 print:p-6 text-gray-800 print:text-black font-sans bg-white box-border" id="print-area">
              
              {/* Header - Logo diperkecil (print:h-10) agar hemat ruang atas */}
              <div className="flex justify-between items-start mb-4 border-b pb-4 print:mb-2 print:pb-2 print:border-black avoid-break">
                <div className="flex items-center gap-3">
                  <img src="/logo.png" alt="Logo" className="h-16 w-auto object-contain print:grayscale print:h-10" />
                  <div className="flex flex-col border-l-2 border-green-200 print:border-black pl-3 ml-1">
                    <span className="text-[16px] font-black tracking-tight text-[#1a4b1a] print:text-black uppercase print:text-[14px]">FO Helper</span>
                    <span className="text-[10px] font-bold text-gray-500 print:text-black tracking-wider print:text-[9px]">Jl. Raya Jati No. 123</span>
                    <span className="text-[10px] text-gray-500 print:text-black print:text-[9px]">WA: 0812-3456-7890</span>
                  </div>
                </div>
                <div className="text-right">
                  <h1 className="text-lg font-extrabold text-[#1a4b1a] print:text-black tracking-widest uppercase m-0 leading-tight print:text-[16px]">KUITANSI / RECEIPT</h1>
                  <p className="text-xs mt-1 print:text-black print:text-[10px] print:mt-0">No: <span className="font-bold">{printData.id}</span></p>
                  <p className="text-[10px] text-gray-500 print:text-black print:text-[9px]">Dicetak: {format(new Date(), 'dd/MM/yyyy HH:mm')}</p>
                </div>
              </div>

              {/* Data Grid - print:gap-2 untuk kompresi */}
              <div className="grid grid-cols-2 gap-4 mb-4 border-b pb-4 print:mb-2 print:pb-2 print:gap-2 print:border-black avoid-break">
                <div>
                  <h2 className="text-xs font-bold text-[#1a4b1a] print:text-black uppercase mb-2 print:mb-1 print:text-[10px]">👤 Data Pelanggan</h2>
                  <table className="text-xs print:text-[10px] w-full">
                    <tbody>
                      <tr><td className="text-gray-500 print:text-black w-24 py-0.5 print:py-0">Nama Tamu</td><td className="font-bold print:text-black">: {printData.nama}</td></tr>
                      <tr><td className="text-gray-500 print:text-black py-0.5 print:py-0">Asal / Instansi</td><td className="print:text-black">: {printData.type === 'harian' ? (printData.tamuDari || '-') : (printData.alamatKantor || '-')}</td></tr>
                    </tbody>
                  </table>
                </div>
                <div>
                  <h2 className="text-xs font-bold text-[#1a4b1a] print:text-black uppercase mb-2 print:mb-1 print:text-[10px]">🛏️ Detail Inap</h2>
                  <table className="text-xs print:text-[10px] w-full">
                    <tbody>
                      <tr><td className="text-gray-500 print:text-black w-28 py-0.5 print:py-0">No. & Tipe Kamar</td><td className="print:text-black">: <span className="font-bold text-[#1a4b1a] print:text-black">#{printData.type === 'harian' ? printData.noKamar : printData.roomNumber}</span> ({printData.tipeKamar?.split('-')[0].toUpperCase()})</td></tr>
                      <tr><td className="text-gray-500 print:text-black py-0.5 print:py-0">Jenis Layanan</td><td className="font-bold print:text-black">: Sewa {printData.type === 'harian' ? toTitleCase(printData.tipeInap) : 'Kos Bulanan'}</td></tr>
                      <tr><td className="text-gray-500 print:text-black py-0.5 print:py-0">Durasi & Periode</td><td className="print:text-black">: {getJumlahMalam((printData.checkIn || printData.periodeStart), (printData.checkOut || printData.periodeEnd), printData.tipeInap || 'kos')}</td></tr>
                      <tr><td className="text-gray-500 print:text-black py-0.5 print:py-0"></td><td className="text-[10px] print:text-[9px] print:text-black">  {printData.type === 'harian' ? format(new Date(printData.checkIn), 'dd/MM/yy HH:mm') : format(new Date(printData.periodeStart), 'dd/MM/yy')} s/d {printData.type === 'harian' ? format(new Date(printData.checkOut), 'dd/MM/yy HH:mm') : format(new Date(printData.periodeEnd), 'dd/MM/yy')}</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Tabel Biaya Akomodasi - print:py-0.5 agar item banyak tetap tipis */}
              <div className="mb-4 print:mb-2">
                <h2 className="text-xs font-bold text-[#1a4b1a] print:text-black uppercase mb-1 print:text-[10px]">I. Rincian Biaya Sewa (Non-Refundable)</h2>
                <table className="w-full text-xs print:text-[10px] border border-gray-200 print:border-black">
                  <thead className="bg-[#1a4b1a] text-white print:bg-white print:text-black print:border-b-2 print:border-black">
                    <tr>
                      <th className="p-2 print:py-1 text-left print:border-black print:border-b">Deskripsi Transaksi</th>
                      <th className="p-2 print:py-1 text-center w-24 print:border-black print:border-b">Metode</th>
                      <th className="p-2 print:py-1 text-right w-32 print:border-black print:border-b">Nominal (Rp)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* SUPPORT MULTI-PAYMENT PADA STRUK */}
                    {printData.pembayaran?.detailMetodeKamar && printData.pembayaran.detailMetodeKamar.length > 0 ? (
                      printData.pembayaran.detailMetodeKamar.map((m, idx) => (
                        <tr key={`mk-${idx}`} className="border-b border-gray-100 print:border-black">
                          <td className="p-2 print:py-0.5 print:border-black">Sewa Kamar #{printData.type === 'harian' ? printData.noKamar : printData.roomNumber} {printData.pembayaran.detailMetodeKamar.length > 1 ? `(Split Payment ${idx + 1})` : ''}</td>
                          <td className="p-2 print:py-0.5 text-center print:border-black">{m.metode}</td>
                          <td className="p-2 print:py-0.5 text-right print:border-black">{formatRp(m.nominal)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr className="border-b border-gray-100 print:border-black">
                        <td className="p-2 print:py-0.5 print:border-black">Sewa Kamar #{printData.type === 'harian' ? printData.noKamar : printData.roomNumber}</td>
                        <td className="p-2 print:py-0.5 text-center print:border-black">{printData.pembayaran?.metodeKamar || '-'}</td>
                        <td className="p-2 print:py-0.5 text-right print:border-black">{formatRp(printData.pembayaran?.jumlahKamar)}</td>
                      </tr>
                    )}
                    <tr className="bg-gray-50 font-bold print:bg-white print:border-t-2 print:border-black">
                      <td colSpan="2" className="p-2 print:py-1 text-right text-[#1a4b1a] print:text-black print:border-black">TOTAL BIAYA AKOMODASI (A):</td>
                      <td className="p-2 print:py-1 text-right text-[#1a4b1a] print:text-black print:border-black">
                        {formatRp((printData.pembayaran?.jumlahKamar || 0) + (printData.pembayaran?.tambahan || []).reduce((sum, item) => sum + item.jumlah, 0))}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Tabel Titipan Jaminan - print:py-0.5 */}
              <div className="mb-4 print:mb-2 avoid-break">
                <h2 className="text-xs font-bold text-[#d97a31] print:text-black uppercase mb-1 print:text-[10px]">II. Titipan Jaminan Hunian (Refundable Deposit)</h2>
                <table className="w-full text-xs print:text-[10px] border border-orange-200 print:border-black">
                  <thead className="bg-[#d97a31] text-white print:bg-white print:text-black print:border-b-2 print:border-black">
                    <tr>
                      <th className="p-2 print:py-1 text-left print:border-black print:border-b">Jenis Titipan Keamanan</th>
                      <th className="p-2 print:py-1 text-center w-24 print:border-black print:border-b">Metode</th>
                      <th className="p-2 print:py-1 text-right w-32 print:border-black print:border-b">Nominal (Rp)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-orange-100 print:border-black">
                      <td className="p-2 print:py-0.5 print:border-black">Uang Jaminan Kamar (Fasilitas & Kunci)</td>
                      <td className="p-2 print:py-0.5 text-center print:border-black">{printData.pembayaran?.metodeDeposit || '-'}</td>
                      <td className="p-2 print:py-0.5 text-right print:border-black">{formatRp(printData.pembayaran?.jumlahDeposit)}</td>
                    </tr>
                    <tr className="bg-orange-50 font-bold print:bg-white print:border-t-2 print:border-black">
                      <td colSpan="2" className="p-2 print:py-1 text-right text-[#d97a31] print:text-black print:border-black">TOTAL DEPOSIT (B):</td>
                      <td className="p-2 print:py-1 text-right text-[#d97a31] print:text-black print:border-black">{formatRp(printData.pembayaran?.jumlahDeposit)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Footer / Tanda Tangan - Tetap menggunakan format yang benar (Ttd di atas garis) */}
              <div className="flex justify-between items-end mt-4 print:mt-1 avoid-break">
                <div className="w-1/2">
                  <div className="border border-dashed border-[#d97a31] print:border-black print:border-solid p-1.5 rounded bg-orange-50/50 print:bg-white text-[9px] print:text-[8px] text-gray-600 print:text-black leading-tight">
                    <span className="font-bold">Info Pengembalian Deposit (Total B):</span><br/>
                    Dana akan dikembalikan penuh saat Check-Out apabila tidak ada kerusakan fasilitas kamar & kunci dikembalikan sebelum batas waktu sewa.
                  </div>
                </div>
                <div className="flex w-1/2 justify-around text-center text-xs print:text-[10px]">
                  <div className="flex flex-col items-center">
                    <span className="w-24 border-t border-gray-400 print:border-black mb-1 mt-10 print:mt-8"></span>
                    <span className="print:text-black">Tamu</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="w-24 border-t border-[#1a4b1a] print:border-black mb-1 mt-10 print:mt-8"></span>
                    <span className="font-bold text-[#1a4b1a] print:text-black">Front Office</span>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}