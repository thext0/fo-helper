import { useState, useEffect } from 'react';
import { format, parseISO, addHours } from 'date-fns';
import { DAFTAR_KOTA_INDONESIA } from '../data/kotaIndonesia';

const toTitleCase = (str) => {
  return str.toLowerCase().replace(/\b\w/g, s => s.toUpperCase());
};

export default function History() {
  const [loading, setLoading] = useState(true);
  const [riwayatHarian, setRiwayatHarian] = useState([]);
  const [riwayatKos, setRiwayatKos] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');

  // STATE BARU: Memisahkan Modal Berkas & Ralat
  const [editingBerkas, setEditingBerkas] = useState(null);
  const [editingRalat, setEditingRalat] = useState(null);
  const [targetCO, setTargetCO] = useState(null); // Untuk tombol CO langsung dari tabel
  
  const [editForm, setEditForm] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const [isCityModalOpen, setIsCityModalOpen] = useState(false);
  const [citySearch, setCitySearch] = useState('');
  const [cityPage, setCityPage] = useState(1);

  const [floors, setFloors] = useState([]);
  const [occupiedRooms, setOccupiedRooms] = useState([]);
  const [isRoomModalOpen, setIsRoomModalOpen] = useState(false);

  useEffect(() => {
    const loadHistory = async () => {
      setLoading(true);
      try {
        const res = await fetch('http://localhost:5000/api/data');
        if (!res.ok) throw new Error("Gagal memuat data");
        const data = await res.json();
        
        const sortedHarian = (data.dailyTransactions || []).sort((a, b) => new Date(b.waktuInput) - new Date(a.waktuInput));
        const sortedKos = (data.activeKost || []).sort((a, b) => new Date(b.waktuInput) - new Date(a.waktuInput));

        setRiwayatHarian(sortedHarian);
        setRiwayatKos(sortedKos);

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
    loadHistory();
  }, [refreshTrigger]);

  // LOGIKA STATUS BARU: Menentukan tombol apa saja yang boleh muncul
  const getStatusAndActions = (checkOutDate) => {
    if (!checkOutDate) return { text: 'Unknown', color: 'bg-gray-200 text-gray-700', canRalat: true, canCO: true };
    const sekarang = new Date();
    const co = new Date(checkOutDate);
    
    if (sekarang <= co) return { text: 'Aktif In-House', color: 'bg-green-100 text-green-800 border-green-300 font-bold', canRalat: true, canCO: true };
    
    const batasBisaEdit = addHours(co, 1);
    if (sekarang <= batasBisaEdit) return { text: 'Selesai (Masa Ralat)', color: 'bg-yellow-100 text-yellow-800 border-yellow-300 font-bold', canRalat: true, canCO: false };
    
    return { text: 'Selesai (Terkunci)', color: 'bg-gray-100 text-gray-600 border-gray-300', canRalat: false, canCO: false };
  };

  // BUKA MODAL BERKAS IDENTITAS (Selalu Bisa Diedit)
  const openBerkasModal = (item, type) => {
    setEditingBerkas({ ...item, type }); 
    setEditForm({ ...item }); // Load semua data agar tidak ada yang hilang saat disave
  };

  // BUKA MODAL RALAT INAP (Kamar & Waktu)
  const openRalatModal = (item, type) => {
    setEditingRalat({ ...item, type }); 
    setEditForm({ ...item, tipeKamar: type === 'harian' ? item.tipeKamar : item.roomType }); 
  };

  // SIMPAN PERUBAHAN (Universal untuk Berkas & Ralat)
  const handleSimpanEdit = async (modalType) => {
    setIsSaving(true);
    const currentItem = modalType === 'berkas' ? editingBerkas : editingRalat;
    
    try {
      const res = await fetch('http://localhost:5000/api/data');
      if (!res.ok) throw new Error("Gagal memuat data saat ini");
      const dbData = await res.json();

      if (currentItem.type === 'harian') {
        const index = dbData.dailyTransactions.findIndex(tx => tx.id === currentItem.id);
        if (index !== -1) {
          dbData.dailyTransactions[index] = { ...dbData.dailyTransactions[index], ...editForm };
        }
      } else if (currentItem.type === 'kos') {
        const index = dbData.activeKost.findIndex(kos => kos.id === currentItem.id);
        if (index !== -1) {
          // Khusus kos, pastikan roomType tersimpan jika ada ralat kamar
          dbData.activeKost[index] = { ...dbData.activeKost[index], ...editForm, roomType: editForm.tipeKamar || editForm.roomType };
        }
      }

      const postRes = await fetch('http://localhost:5000/api/data/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dbData) });
      const result = await postRes.json();
      if (result.success) {
        setEditingBerkas(null);
        setEditingRalat(null);
        setRefreshTrigger(prev => prev + 1); 
      } else { alert("Gagal menyimpan data: " + result.error); }
    } catch (error) { console.error(error); alert("Terjadi kesalahan jaringan."); } finally { setIsSaving(false); }
  };

  // EKSEKUSI CHECK-OUT INSTAN DARI TABEL
  const executeCOInstan = async (statusDep) => {
    setIsSaving(true);
    try {
      const res = await fetch('http://localhost:5000/api/data');
      const dbData = await res.json();
      const nowStrHarian = format(new Date(), "yyyy-MM-dd'T'HH:mm");
      const nowStrKos = format(new Date(), "yyyy-MM-dd");

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
      
      if (result.success) {
        setTargetCO(null);
        setRefreshTrigger(prev => prev + 1); 
      } else { alert("Gagal C/O: " + result.error); }
    } catch (error) { console.error(error); alert("Terjadi kesalahan jaringan."); } finally { setIsSaving(false); }
  };

  const filteredCities = DAFTAR_KOTA_INDONESIA.filter(kota => kota.toLowerCase().includes(citySearch.toLowerCase()));
  const totalCityPages = Math.ceil(filteredCities.length / 20) || 1;
  const paginatedCities = filteredCities.slice((cityPage - 1) * 20, cityPage * 20);
  const handleSelectCity = (kota) => { setEditForm({...editForm, tamuDari: kota}); setIsCityModalOpen(false); setCitySearch(''); setCityPage(1); };

  const handleSelectRoom = (kamarNo, kamarTipe) => {
    if (editingRalat.type === 'harian') {
      setEditForm({...editForm, noKamar: kamarNo, tipeKamar: kamarTipe});
    } else {
      setEditForm({...editForm, roomNumber: kamarNo, tipeKamar: kamarTipe});
    }
    setIsRoomModalOpen(false);
  };

  const filteredHarian = riwayatHarian.filter(tx => (tx.nama && tx.nama.toLowerCase().includes(searchTerm.toLowerCase())) || (tx.noKamar && tx.noKamar.toString().toLowerCase().includes(searchTerm.toLowerCase())));
  const filteredKos = riwayatKos.filter(kos => (kos.nama && kos.nama.toLowerCase().includes(searchTerm.toLowerCase())) || (kos.roomNumber && kos.roomNumber.toString().toLowerCase().includes(searchTerm.toLowerCase())));

  if (loading) return <div className="text-center p-10 text-gray-500 italic">Memuat riwayat transaksi...</div>;

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div className="bg-white p-4 rounded-md shadow-sm border border-gray-200 flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-800">👥 Data Tamu & Riwayat Operasional</h2>
          <p className="text-sm text-gray-500">Kelola identitas tamu (Berkas) dan transaksi inap (Ralat) secara terpisah.</p>
        </div>
        <div className="w-full md:w-1/3">
          <input type="text" placeholder="🔍 Cari nama tamu atau no. kamar..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full border border-gray-300 rounded-md p-2 bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none" />
        </div>
      </div>

      {/* TABEL HARIAN */}
      <div className="bg-white rounded-md shadow-sm border border-gray-200 overflow-hidden">
        <div className="bg-blue-50 p-3 border-b border-blue-100"><h3 className="font-bold text-blue-900">🏨 Riwayat Harian & Transit ({filteredHarian.length})</h3></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-600 border-b border-gray-200">
              <tr><th className="p-3 font-semibold w-1/4">Tamu & Kamar</th><th className="p-3 font-semibold">Check-In</th><th className="p-3 font-semibold">Check-Out</th><th className="p-3 font-semibold text-center">Status</th><th className="p-3 font-semibold text-center w-48">Aksi</th></tr>
            </thead>
            <tbody>
              {filteredHarian.length === 0 ? (<tr><td colSpan="5" className="p-4 text-center text-gray-500 italic">Data tidak ditemukan.</td></tr>) : (
                filteredHarian.map((tx) => {
                  const status = getStatusAndActions(tx.checkOut);
                  return (
                    <tr key={tx.id} className="border-b border-gray-100 hover:bg-blue-50/50 transition-colors">
                      <td className="p-3">
                        <div className="font-bold text-gray-800">{tx.nama}</div>
                        <div className="text-xs text-gray-500">#{tx.noKamar} • {tx.bookingBy}</div>
                      </td>
                      <td className="p-3"><div className="font-medium text-gray-700">{tx.checkIn ? format(parseISO(tx.checkIn), 'dd/MM/yyyy') : '-'}</div><div className="text-xs text-gray-500">{tx.checkIn ? format(parseISO(tx.checkIn), 'HH:mm') : '-'}</div></td>
                      <td className="p-3"><div className="font-medium text-gray-700">{tx.checkOut ? format(parseISO(tx.checkOut), 'dd/MM/yyyy') : '-'}</div><div className="text-xs text-gray-500">{tx.checkOut ? format(parseISO(tx.checkOut), 'HH:mm') : '-'}</div></td>
                      <td className="p-3 text-center"><span className={`px-2 py-1 border rounded-md text-[10px] sm:text-xs ${status.color}`}>{status.text}</span></td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1 justify-center">
                          <button onClick={() => openBerkasModal(tx, 'harian')} className="bg-blue-100 hover:bg-blue-200 text-blue-700 px-2 py-1 rounded text-xs font-bold transition-colors">📄 Berkas</button>
                          {status.canRalat && <button onClick={() => openRalatModal(tx, 'harian')} className="bg-orange-100 hover:bg-orange-200 text-orange-700 px-2 py-1 rounded text-xs font-bold transition-colors">⚙️ Ralat</button>}
                          {status.canCO && <button onClick={() => setTargetCO({...tx, type: 'harian'})} className="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded text-xs font-bold transition-colors shadow-sm">🏃 C/O</button>}
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
        <div className="bg-orange-50 p-3 border-b border-orange-100"><h3 className="font-bold text-orange-900">📝 Riwayat Kos & Bulanan ({filteredKos.length})</h3></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-600 border-b border-gray-200">
              <tr><th className="p-3 font-semibold w-1/4">Tamu & Kamar</th><th className="p-3 font-semibold">Mulai Sewa</th><th className="p-3 font-semibold">Batas Sewa</th><th className="p-3 font-semibold text-center">Status</th><th className="p-3 font-semibold text-center w-48">Aksi</th></tr>
            </thead>
            <tbody>
              {filteredKos.length === 0 ? (<tr><td colSpan="5" className="p-4 text-center text-gray-500 italic">Data tidak ditemukan.</td></tr>) : (
                filteredKos.map((kos) => {
                  let checkOutKos = null;
                  if (kos.periodeEnd) { checkOutKos = new Date(kos.periodeEnd); checkOutKos.setHours(12, 0, 0, 0); }
                  const status = getStatusAndActions(checkOutKos);
                  return (
                    <tr key={kos.id} className="border-b border-gray-100 hover:bg-orange-50/50 transition-colors">
                      <td className="p-3">
                        <div className="font-bold text-gray-800">{kos.nama}</div>
                        <div className="text-xs text-gray-500">#{kos.roomNumber}</div>
                      </td>
                      <td className="p-3 text-gray-700">
                        <div className="font-medium">{kos.waktuMasuk ? format(new Date(kos.waktuMasuk), 'dd/MM/yyyy') : (kos.periodeStart ? format(new Date(kos.periodeStart), 'dd/MM/yyyy') : '-')}</div>
                        <div className="text-xs text-gray-500">{kos.waktuMasuk ? format(new Date(kos.waktuMasuk), 'HH:mm') : '-'}</div>
                      </td>
                      <td className="p-3 text-gray-700 font-medium">{kos.periodeEnd ? format(new Date(kos.periodeEnd), 'dd/MM/yyyy') : '-'}</td>
                      <td className="p-3 text-center"><span className={`px-2 py-1 border rounded-md text-[10px] sm:text-xs ${status.color}`}>{status.text}</span></td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1 justify-center">
                          <button onClick={() => openBerkasModal(kos, 'kos')} className="bg-blue-100 hover:bg-blue-200 text-blue-700 px-2 py-1 rounded text-xs font-bold transition-colors">📄 Berkas</button>
                          {status.canRalat && <button onClick={() => openRalatModal(kos, 'kos')} className="bg-orange-100 hover:bg-orange-200 text-orange-700 px-2 py-1 rounded text-xs font-bold transition-colors">⚙️ Ralat</button>}
                          {status.canCO && <button onClick={() => setTargetCO({...kos, type: 'kos'})} className="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded text-xs font-bold transition-colors shadow-sm">🏃 C/O</button>}
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

      {/* POPUP 1: MODAL BERKAS IDENTITAS */}
      {editingBerkas && (
        <div className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 bg-blue-800 text-white flex justify-between items-center shrink-0">
              <h3 className="font-bold">📄 Identitas & Berkas Tamu</h3>
              <button onClick={() => setEditingBerkas(null)} className="text-gray-300 hover:text-white font-bold text-xl">&times;</button>
            </div>
            
            <div className="p-5 overflow-y-auto flex-1 space-y-4 bg-gray-50">
              <div className="bg-white p-4 rounded border border-gray-200 shadow-sm grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Nama Lengkap</label>
                  <input type="text" value={editForm.nama || ''} onChange={(e) => setEditForm({...editForm, nama: toTitleCase(e.target.value)})} className="w-full border border-gray-300 rounded p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"/>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Jenis Kelamin</label>
                  <select value={editForm.jenisKelamin || 'Laki-laki'} onChange={(e) => setEditForm({...editForm, jenisKelamin: e.target.value})} className="w-full border border-gray-300 rounded p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="Laki-laki">Laki-laki</option>
                    <option value="Perempuan">Perempuan</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">NIK KTP</label>
                  <input type="text" value={editForm.nik || ''} onChange={(e) => setEditForm({...editForm, nik: e.target.value.replace(/[^0-9]/g, '')})} placeholder="16 digit" maxLength="16" className="w-full border border-gray-300 rounded p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"/>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Tanggal Lahir</label>
                  <input type="date" value={editForm.tanggalLahir || ''} onChange={(e) => setEditForm({...editForm, tanggalLahir: e.target.value})} className="w-full border border-gray-300 rounded p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"/>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Nomor Telepon (WA)</label>
                  <input type="text" value={editForm.noTelp || ''} onChange={(e) => setEditForm({...editForm, noTelp: e.target.value})} placeholder="0812..." className="w-full border border-gray-300 rounded p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"/>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Profesi</label>
                  <input type="text" value={editForm.profesi || ''} onChange={(e) => setEditForm({...editForm, profesi: toTitleCase(e.target.value)})} className="w-full border border-gray-300 rounded p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"/>
                </div>
                
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">{editingBerkas.type === 'harian' ? 'Kota Asal (KTP)' : 'Alamat Kantor'}</label>
                  {editingBerkas.type === 'harian' ? (
                    <input type="text" value={editForm.tamuDari || ''} readOnly onClick={() => setIsCityModalOpen(true)} className="w-full border border-gray-300 rounded p-2 text-sm bg-gray-100 cursor-pointer" placeholder="Pilih kota..." />
                  ) : (
                    <input type="text" value={editForm.alamatKantor || ''} onChange={(e) => setEditForm({...editForm, alamatKantor: toTitleCase(e.target.value)})} className="w-full border border-gray-300 rounded p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"/>
                  )}
                </div>
                
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Alamat Tempat Tinggal Lengkap</label>
                  <textarea rows="2" value={editForm.alamatLengkap || ''} onChange={(e) => setEditForm({...editForm, alamatLengkap: e.target.value})} className="w-full border border-gray-300 rounded p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" placeholder="Jln. Melati No. 15..."></textarea>
                </div>
              </div>
            </div>

            <div className="p-4 bg-white border-t flex justify-end gap-3 shrink-0">
              <button onClick={() => setEditingBerkas(null)} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded font-bold text-sm border">Batal</button>
              <button onClick={() => handleSimpanEdit('berkas')} disabled={isSaving} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold text-sm">{isSaving ? 'Menyimpan...' : '💾 Simpan Identitas'}</button>
            </div>
          </div>
        </div>
      )}

      {/* POPUP 2: MODAL RALAT INAP & DEPOSIT */}
      {editingRalat && (
        <div className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden flex flex-col">
            <div className="p-4 bg-orange-600 text-white flex justify-between items-center">
              <h3 className="font-bold">⚙️ Ralat Transaksi Inap</h3>
              <button onClick={() => setEditingRalat(null)} className="text-orange-200 hover:text-white font-bold text-xl">&times;</button>
            </div>
            
            <div className="p-5 space-y-5 bg-orange-50/30">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-orange-900 mb-1">Nomor Kamar (Ganti Kamar)</label>
                  <button type="button" onClick={() => setIsRoomModalOpen(true)} className="w-full text-left border border-orange-300 bg-white rounded p-2 text-sm font-bold flex justify-between hover:bg-orange-50">
                    <span className="text-orange-900">Kamar {editingRalat.type === 'harian' ? editForm.noKamar : editForm.roomNumber} ({editForm.tipeKamar?.split('-')[0].toUpperCase()})</span>
                    <span>🔄</span>
                  </button>
                </div>
                
                <div>
                  <label className="block text-xs font-bold text-orange-900 mb-1">Batas Waktu Check-Out / Sewa</label>
                  {editingRalat.type === 'harian' ? (
                    <input type="datetime-local" value={editForm.checkOut || ''} onChange={(e) => setEditForm({...editForm, checkOut: e.target.value})} className="w-full border border-orange-300 rounded p-2 text-sm outline-none focus:ring-2 focus:ring-orange-500"/>
                  ) : (
                    <input type="date" value={editForm.periodeEnd || ''} onChange={(e) => setEditForm({...editForm, periodeEnd: e.target.value})} className="w-full border border-orange-300 rounded p-2 text-sm outline-none focus:ring-2 focus:ring-orange-500"/>
                  )}
                </div>

                <div className="bg-white p-3 rounded border border-orange-200 shadow-sm mt-4">
                  <label className="block text-xs font-bold text-gray-700 mb-2">Status Uang Deposit (Rp {((editForm.pembayaran?.jumlahDeposit) || 0).toLocaleString('id-ID')})</label>
                  <select value={editForm.statusDeposit || 'Belum Refund'} onChange={(e) => setEditForm({...editForm, statusDeposit: e.target.value})} className={`w-full border rounded p-2 text-sm font-bold outline-none focus:ring-2 focus:ring-orange-500 ${editForm.statusDeposit === 'Sudah Refund' ? 'bg-green-100 text-green-800' : editForm.statusDeposit === 'Hangus' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>
                    <option value="Belum Refund">Belum Refund</option>
                    <option value="Sudah Refund">Sudah Refund</option>
                    <option value="Hangus">Hangus (Denda)</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="p-4 bg-white border-t flex justify-end gap-3">
              <button onClick={() => setEditingRalat(null)} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded font-bold text-sm border">Batal</button>
              <button onClick={() => handleSimpanEdit('ralat')} disabled={isSaving} className="px-6 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded font-bold text-sm">{isSaving ? 'Menyimpan...' : '💾 Simpan Ralat'}</button>
            </div>
          </div>
        </div>
      )}

      {/* POPUP 3: VERIFIKASI CO INSTAN */}
      {targetCO && (
        <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-sm overflow-hidden text-center">
             <div className="bg-red-600 p-4">
               <h3 className="font-extrabold text-white text-xl">⚠️ CHECK-OUT INSTAN</h3>
             </div>
             <div className="p-6">
                <p className="text-gray-800 font-bold mb-1">{targetCO.nama}</p>
                <p className="text-sm text-gray-500 mb-6">Kamar #{targetCO.type === 'harian' ? targetCO.noKamar : targetCO.roomNumber} akan diselesaikan detik ini juga. Bagaimana nasib uang depositnya?</p>
                
                <div className="space-y-3">
                   <button onClick={() => executeCOInstan('Sudah Refund')} disabled={isSaving} className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3 rounded shadow-sm border border-green-700 transition-colors">
                     ✅ Deposit Di-Refund
                   </button>
                   <button onClick={() => executeCOInstan('Hangus')} disabled={isSaving} className="w-full bg-gray-800 hover:bg-black text-white font-bold py-3 rounded shadow-sm border border-black transition-colors">
                     🔥 Deposit Hangus / Denda
                   </button>
                   <button onClick={() => executeCOInstan('Belum Refund')} disabled={isSaving} className="w-full bg-yellow-100 hover:bg-yellow-200 text-yellow-800 font-bold py-3 rounded shadow-sm border border-yellow-300 transition-colors">
                     ⏳ Nanti Saja (Belum Refund)
                   </button>
                </div>
                <button onClick={() => setTargetCO(null)} className="w-full mt-6 bg-gray-100 hover:bg-gray-200 text-gray-600 py-2 rounded font-bold transition-colors">Batalkan</button>
             </div>
          </div>
        </div>
      )}

      {/* MODAL KOTA */}
      {isCityModalOpen && (
        <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[80vh]">
            <div className="p-4 bg-blue-600 text-white flex justify-between items-center"><h3 className="font-bold">Pilih Kota Asal</h3><button onClick={() => setIsCityModalOpen(false)} className="text-white font-bold text-xl">&times;</button></div>
            <div className="p-4 border-b"><input type="text" placeholder="Cari kota..." value={citySearch} onChange={(e) => { setCitySearch(e.target.value); setCityPage(1); }} className="w-full border border-gray-300 rounded-md p-2 outline-none focus:ring-2 focus:ring-blue-500"/></div>
            <div className="overflow-y-auto p-4 flex-1">{paginatedCities.length > 0 ? (<div className="grid grid-cols-1 gap-2">{paginatedCities.map((kota, idx) => (<button key={idx} onClick={() => handleSelectCity(kota)} className="text-left w-full p-2 hover:bg-blue-50 rounded-md transition-colors">{kota}</button>))}</div>) : <p className="text-center text-gray-500 py-4">Kota tidak ditemukan.</p>}</div>
            <div className="p-4 border-t bg-gray-50 flex justify-between items-center"><button disabled={cityPage === 1} onClick={() => setCityPage(p => p - 1)} className={`px-3 py-1 rounded-md text-sm ${cityPage === 1 ? 'bg-gray-200 text-gray-400' : 'bg-blue-100 text-blue-700'}`}>Sebelumnya</button><span className="text-sm text-gray-600">Hal {cityPage} dari {totalCityPages}</span><button disabled={cityPage === totalCityPages} onClick={() => setCityPage(p => p + 1)} className={`px-3 py-1 rounded-md text-sm ${cityPage === totalCityPages ? 'bg-gray-200 text-gray-400' : 'bg-blue-100 text-blue-700'}`}>Selanjutnya</button></div>
          </div>
        </div>
      )}

      {/* MODAL KAMAR */}
      {isRoomModalOpen && (
        <div className="fixed inset-0 z-[70] bg-black/70 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-4 bg-gray-800 text-white flex justify-between items-center shrink-0">
              <div><h3 className="font-bold text-lg">🛏️ Pindah Kamar</h3><p className="text-xs text-gray-300">Pilih kamar kosong (Hijau).</p></div>
              <button onClick={() => setIsRoomModalOpen(false)} className="text-gray-400 hover:text-white font-bold text-2xl transition-colors">&times;</button>
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

    </div>
  );
}