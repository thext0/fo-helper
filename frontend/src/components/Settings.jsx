import { useState, useEffect } from 'react';

export default function Settings({ onClose }) {
  const [activeTab, setActiveTab] = useState('finansial');
  const [isSaving, setIsSaving] = useState(false);
  const [dataAwal, setDataAwal] = useState(null);

// REVISI OTA: Menggunakan Array Objek untuk UI dinamis
  const [otaListUI, setOtaListUI] = useState([]);
  const [deposit, setDeposit] = useState(0);
  const [weekendDays, setWeekendDays] = useState([5, 6, 0]); // 0=Minggu, 1=Senin, ..., 6=Sabtu
  // HELPER: Terjemahkan angka hari ke teks untuk label dinamis
  const namaHariSingkat = { 1: 'Sen', 2: 'Sel', 3: 'Rab', 4: 'Kam', 5: 'Jum', 6: 'Sab', 0: 'Min' };
  const labelWeekend = weekendDays.length > 0 ? weekendDays.map(d => namaHariSingkat[d]).join(', ') : '-';
  const labelWeekday = [1, 2, 3, 4, 5, 6, 0].filter(d => !weekendDays.includes(d)).map(d => namaHariSingkat[d]).join(', ');
  const [harga, setHarga] = useState({
    harianWeekday: { 'double-bed': 0, 'twin-bed': 0, 'single-bed': 0 },
    harianWeekend: { 'double-bed': 0, 'twin-bed': 0, 'single-bed': 0 },
    transitWeekday: { 'double-bed': 0, 'twin-bed': 0, 'single-bed': 0 },
    transitWeekend: { 'double-bed': 0, 'twin-bed': 0, 'single-bed': 0 },
    kos: { 'double-bed': 0, 'twin-bed': 0, 'single-bed': 0 }
  });

  // STATE BARU: Manajemen Lantai & Kamar Visual
  const [floors, setFloors] = useState([]);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch('http://localhost:5000/api/data');
        const db = await res.json();
        setDataAwal(db);
        
const s = db.settings || {};
        // REVISI OTA: Konversi dari array DB ke format UI
        setOtaListUI((s.otaList || []).map(ota => ({ id: Math.random().toString(), nama: ota })));
        setDeposit(s.depositDefault || 0);
        setWeekendDays(s.weekendDays !== undefined ? s.weekendDays : [5, 6, 0]);
        setHarga({
          harianWeekday: s.prices?.harianWeekday || s.prices?.harian || { 'double-bed': 0, 'twin-bed': 0, 'single-bed': 0 },
          harianWeekend: s.prices?.harianWeekend || s.prices?.harian || { 'double-bed': 0, 'twin-bed': 0, 'single-bed': 0 },
          transitWeekday: s.prices?.transitWeekday || s.prices?.transit || { 'double-bed': 0, 'twin-bed': 0, 'single-bed': 0 },
          transitWeekend: s.prices?.transitWeekend || s.prices?.transit || { 'double-bed': 0, 'twin-bed': 0, 'single-bed': 0 },
          kos: s.prices?.kos || { 'double-bed': 0, 'twin-bed': 0, 'single-bed': 0 }
        });

        // Migrasi atau Load Data Lantai
        if (s.floors && s.floors.length > 0) {
          setFloors(s.floors);
        } else if (s.rooms) {
          // Fallback jika database masih pakai format lama (koma)
          const migratedKamar = [];
          Object.keys(s.rooms).forEach(tipe => {
            s.rooms[tipe].forEach(no => migratedKamar.push({ id: Math.random().toString(), no, tipe }));
          });
          setFloors([{ id: 'fl-1', nama: 'Lantai 1', kamar: migratedKamar }]);
        } else {
          setFloors([]);
        }
      } catch (err) { console.error(err); }
    };
    fetchSettings();
  }, []);

  const handleHargaChange = (kategori, tipe, value) => {
    setHarga(prev => ({ ...prev, [kategori]: { ...prev[kategori], [tipe]: Number(value) } }));
  };

  // LOGIKA BUILDER LANTAI & KAMAR
  const addFloor = () => setFloors([...floors, { id: Date.now().toString(), nama: `Lantai ${floors.length + 1}`, kamar: [] }]);
  const updateFloorName = (id, nama) => setFloors(floors.map(f => f.id === id ? { ...f, nama } : f));
  const removeFloor = (id) => setFloors(floors.filter(f => f.id !== id));

  const addRoom = (floorId) => setFloors(floors.map(f => f.id === floorId ? { ...f, kamar: [...f.kamar, { id: Date.now().toString(), no: '', tipe: 'double-bed' }] } : f));
  const updateRoom = (floorId, roomId, field, value) => setFloors(floors.map(f => f.id === floorId ? { ...f, kamar: f.kamar.map(k => k.id === roomId ? { ...k, [field]: value } : k) } : f));
  const removeRoom = (floorId, roomId) => setFloors(floors.map(f => f.id === floorId ? { ...f, kamar: f.kamar.filter(k => k.id !== roomId) } : f));

  const handleSimpan = async () => {
    setIsSaving(true);
    try {
      // REVISI OTA: Mengambil teks nama OTA dari list UI
      const otaList = otaListUI.map(item => item.nama.trim()).filter(Boolean);
      
      // Hitung otomatis data format lama untuk kompatibilitas Dashboard
      const roomsArray = { 'double-bed': [], 'twin-bed': [], 'single-bed': [] };
      let totalDouble = 0, totalTwin = 0, totalSingle = 0;
      
      floors.forEach(f => {
        f.kamar.forEach(k => {
          if (k.no.trim() !== '') {
            roomsArray[k.tipe].push(k.no.trim());
            if (k.tipe === 'double-bed') totalDouble++;
            if (k.tipe === 'twin-bed') totalTwin++;
            if (k.tipe === 'single-bed') totalSingle++;
          }
        });
      });

      const totalRoomsCalc = { 'double-bed': totalDouble, 'twin-bed': totalTwin, 'single-bed': totalSingle };

      const newSettings = { otaList, depositDefault: Number(deposit), prices: harga, weekendDays, floors, rooms: roomsArray, totalRooms: totalRoomsCalc };
      const updatedDb = { ...dataAwal, settings: newSettings };
      
      const postRes = await fetch('http://localhost:5000/api/data/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updatedDb) });
      const resData = await postRes.json();
      if (resData.success) {
        alert('Pengaturan berhasil disimpan! Halaman akan dimuat ulang agar data sinkron.');
        window.location.reload();
      } else { alert('Gagal menyimpan pengaturan.'); }
    } catch (err) { console.error(err); alert('Terjadi kesalahan jaringan.'); } finally { setIsSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[95vh]">
        
        <div className="p-5 bg-gray-800 text-white flex justify-between items-center shrink-0">
          <div><h2 className="text-xl font-bold">⚙️ Pengaturan Sistem</h2><p className="text-xs text-gray-300">Manajemen Finansial & Inventaris Properti</p></div>
          <button onClick={onClose} className="text-gray-400 hover:text-white font-bold text-2xl transition-colors">&times;</button>
        </div>

        <div className="flex border-b border-gray-200 shrink-0 bg-gray-50">
          <button onClick={() => setActiveTab('finansial')} className={`flex-1 py-3 text-sm font-bold transition-colors ${activeTab === 'finansial' ? 'text-blue-700 border-b-2 border-blue-700 bg-white' : 'text-gray-500 hover:bg-gray-100'}`}>💰 Finansial & Front Office</button>
          <button onClick={() => setActiveTab('inventaris')} className={`flex-1 py-3 text-sm font-bold transition-colors ${activeTab === 'inventaris' ? 'text-blue-700 border-b-2 border-blue-700 bg-white' : 'text-gray-500 hover:bg-gray-100'}`}>🏨 Inventaris Properti (Kamar)</button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-6 bg-gray-50">
          {activeTab === 'finansial' && (
            <div className="space-y-6 animate-fade-in">
              
              {/* UI PENENTUAN HARI WEEKEND */}
              <div className="bg-white p-4 rounded-md border border-gray-200 shadow-sm">
                <h3 className="font-bold text-gray-800 mb-2">Penentuan Hari Weekend (Harga Berlaku)</h3>
                <p className="text-xs text-gray-500 mb-3">Centang hari apa saja yang sistem anggap sebagai "Weekend". Sisanya otomatis menjadi "Weekday".</p>
                <div className="flex flex-wrap gap-3">
                  {[
                    { id: 1, label: 'Senin' }, { id: 2, label: 'Selasa' }, { id: 3, label: 'Rabu' },
                    { id: 4, label: 'Kamis' }, { id: 5, label: 'Jumat' }, { id: 6, label: 'Sabtu' }, { id: 0, label: 'Minggu' }
                  ].map((hari) => (
                    <label key={hari.id} className={`flex items-center gap-2 px-3 py-2 border rounded cursor-pointer text-sm font-bold transition-colors ${weekendDays.includes(hari.id) ? 'bg-orange-100 border-orange-400 text-orange-800' : 'bg-gray-50 border-gray-300 text-gray-500 hover:bg-gray-100'}`}>
                      <input 
                        type="checkbox" 
                        className="hidden"
                        checked={weekendDays.includes(hari.id)}
                        onChange={(e) => {
                          if (e.target.checked) setWeekendDays([...weekendDays, hari.id]);
                          else setWeekendDays(weekendDays.filter(d => d !== hari.id));
                        }} 
                      />
                      {hari.label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="bg-white p-4 rounded-md border border-gray-200 shadow-sm">
                <h3 className="font-bold text-blue-900 mb-4 border-b border-gray-100 pb-2">Standar Harga Sewa (Rp)</h3>
                
                <div className="space-y-6">
                  {/* Blok Harian */}
                  <div className="bg-gray-50 p-4 rounded border border-gray-200">
                    <h4 className="text-sm font-bold text-gray-700 uppercase mb-3">🛎️ Tarif Harian (Per Malam)</h4>
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-2 border-r border-gray-200 pr-4">
                        <span className="text-xs font-bold text-blue-700 bg-blue-100 px-2 py-1 rounded">Weekday ({labelWeekday})</span>
                        <div><label className="text-xs text-gray-600 block mt-2">Double Bed</label><input type="number" value={harga.harianWeekday['double-bed']} onChange={(e) => handleHargaChange('harianWeekday', 'double-bed', e.target.value)} className="w-full border border-gray-300 p-1.5 rounded text-sm"/></div>
                        <div><label className="text-xs text-gray-600 block">Twin Bed</label><input type="number" value={harga.harianWeekday['twin-bed']} onChange={(e) => handleHargaChange('harianWeekday', 'twin-bed', e.target.value)} className="w-full border border-gray-300 p-1.5 rounded text-sm"/></div>
                        <div><label className="text-xs text-gray-600 block">Single Bed</label><input type="number" value={harga.harianWeekday['single-bed']} onChange={(e) => handleHargaChange('harianWeekday', 'single-bed', e.target.value)} className="w-full border border-gray-300 p-1.5 rounded text-sm"/></div>
                      </div>
                      <div className="space-y-2">
                        <span className="text-xs font-bold text-orange-700 bg-orange-100 px-2 py-1 rounded">Weekend ({labelWeekend})</span>
                        <div><label className="text-xs text-gray-600 block mt-2">Double Bed</label><input type="number" value={harga.harianWeekend['double-bed']} onChange={(e) => handleHargaChange('harianWeekend', 'double-bed', e.target.value)} className="w-full border border-gray-300 p-1.5 rounded text-sm"/></div>
                        <div><label className="text-xs text-gray-600 block">Twin Bed</label><input type="number" value={harga.harianWeekend['twin-bed']} onChange={(e) => handleHargaChange('harianWeekend', 'twin-bed', e.target.value)} className="w-full border border-gray-300 p-1.5 rounded text-sm"/></div>
                        <div><label className="text-xs text-gray-600 block">Single Bed</label><input type="number" value={harga.harianWeekend['single-bed']} onChange={(e) => handleHargaChange('harianWeekend', 'single-bed', e.target.value)} className="w-full border border-gray-300 p-1.5 rounded text-sm"/></div>
                      </div>
                    </div>
                  </div>

                  {/* Blok Transit */}
                  <div className="bg-gray-50 p-4 rounded border border-gray-200">
                    <h4 className="text-sm font-bold text-gray-700 uppercase mb-3">⏳ Tarif Transit (6 Jam)</h4>
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-2 border-r border-gray-200 pr-4">
                        <span className="text-xs font-bold text-blue-700 bg-blue-100 px-2 py-1 rounded">Weekday ({labelWeekday})</span>
                        <div><label className="text-xs text-gray-600 block mt-2">Double Bed</label><input type="number" value={harga.transitWeekday['double-bed']} onChange={(e) => handleHargaChange('transitWeekday', 'double-bed', e.target.value)} className="w-full border border-gray-300 p-1.5 rounded text-sm"/></div>
                        <div><label className="text-xs text-gray-600 block">Twin Bed</label><input type="number" value={harga.transitWeekday['twin-bed']} onChange={(e) => handleHargaChange('transitWeekday', 'twin-bed', e.target.value)} className="w-full border border-gray-300 p-1.5 rounded text-sm"/></div>
                        <div><label className="text-xs text-gray-600 block">Single Bed</label><input type="number" value={harga.transitWeekday['single-bed']} onChange={(e) => handleHargaChange('transitWeekday', 'single-bed', e.target.value)} className="w-full border border-gray-300 p-1.5 rounded text-sm"/></div>
                      </div>
                      <div className="space-y-2">
                        <span className="text-xs font-bold text-orange-700 bg-orange-100 px-2 py-1 rounded">Weekend ({labelWeekend})</span>
                        <div><label className="text-xs text-gray-600 block mt-2">Double Bed</label><input type="number" value={harga.transitWeekend['double-bed']} onChange={(e) => handleHargaChange('transitWeekend', 'double-bed', e.target.value)} className="w-full border border-gray-300 p-1.5 rounded text-sm"/></div>
                        <div><label className="text-xs text-gray-600 block">Twin Bed</label><input type="number" value={harga.transitWeekend['twin-bed']} onChange={(e) => handleHargaChange('transitWeekend', 'twin-bed', e.target.value)} className="w-full border border-gray-300 p-1.5 rounded text-sm"/></div>
                        <div><label className="text-xs text-gray-600 block">Single Bed</label><input type="number" value={harga.transitWeekend['single-bed']} onChange={(e) => handleHargaChange('transitWeekend', 'single-bed', e.target.value)} className="w-full border border-gray-300 p-1.5 rounded text-sm"/></div>
                      </div>
                    </div>
                  </div>

                  {/* Blok Kos */}
                  <div className="bg-gray-50 p-4 rounded border border-gray-200">
                    <h4 className="text-sm font-bold text-gray-700 uppercase mb-3">🏠 Tarif Kos (Bulanan)</h4>
                    <div className="grid grid-cols-3 gap-4">
                      <div><label className="text-xs text-gray-600 block">Double Bed</label><input type="number" value={harga.kos['double-bed']} onChange={(e) => handleHargaChange('kos', 'double-bed', e.target.value)} className="w-full border border-gray-300 p-1.5 rounded text-sm"/></div>
                      <div><label className="text-xs text-gray-600 block">Twin Bed</label><input type="number" value={harga.kos['twin-bed']} onChange={(e) => handleHargaChange('kos', 'twin-bed', e.target.value)} className="w-full border border-gray-300 p-1.5 rounded text-sm"/></div>
                      <div><label className="text-xs text-gray-600 block">Single Bed</label><input type="number" value={harga.kos['single-bed']} onChange={(e) => handleHargaChange('kos', 'single-bed', e.target.value)} className="w-full border border-gray-300 p-1.5 rounded text-sm"/></div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* REVISI OTA: UI List Dinamis */}
                <div className="bg-white p-4 rounded-md border border-gray-200 shadow-sm flex flex-col max-h-64">
                  <div className="flex justify-between items-center mb-2">
                    <div>
                      <h3 className="font-bold text-gray-800 mb-1">Daftar Partner OTA</h3>
                      <p className="text-xs text-gray-500">Aplikasi asal tamu *booking*.</p>
                    </div>
                    <button onClick={() => setOtaListUI([...otaListUI, { id: Date.now().toString(), nama: '' }])} className="text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 py-1.5 rounded font-bold transition-colors">+ Tambah OTA</button>
                  </div>
                  <div className="overflow-y-auto pr-1 space-y-2 flex-1 mt-2">
                    {otaListUI.length === 0 ? (
                      <div className="text-center text-xs text-gray-400 italic py-4 border border-dashed rounded">Daftar OTA kosong.</div>
                    ) : (
                      otaListUI.map(ota => (
                        <div key={ota.id} className="flex gap-2">
                          <input type="text" value={ota.nama} onChange={(e) => setOtaListUI(otaListUI.map(o => o.id === ota.id ? { ...o, nama: e.target.value } : o))} placeholder="Cth: Traveloka" className="w-full border border-gray-300 rounded p-1.5 text-sm outline-none focus:ring-1 focus:ring-blue-500" />
                          <button onClick={() => setOtaListUI(otaListUI.filter(o => o.id !== ota.id))} className="bg-red-100 text-red-600 px-2.5 rounded font-bold hover:bg-red-200">&times;</button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
                <div className="bg-white p-4 rounded-md border border-gray-200 shadow-sm"><h3 className="font-bold text-gray-800 mb-1">Standar Uang Deposit</h3><p className="text-xs text-gray-500 mb-3">Nilai default deposit untuk setiap transaksi.</p><div className="flex items-center gap-2"><span className="font-bold text-gray-500">Rp</span><input type="number" value={deposit} onChange={(e) => setDeposit(e.target.value)} className="w-full border border-gray-300 p-2 rounded text-lg font-bold text-gray-800 outline-none focus:ring-2 focus:ring-blue-500"/></div></div>
              </div>
            </div>
          )}

          {activeTab === 'inventaris' && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex justify-between items-center bg-blue-600 text-white p-4 rounded-md shadow-sm">
                <div><h3 className="font-bold text-lg">Manajemen Denah Kamar</h3><p className="text-xs text-blue-100">Susun kamar berdasarkan lantai. Kapasitas Total akan dikalkulasi otomatis.</p></div>
                <button onClick={addFloor} className="bg-white text-blue-700 px-4 py-2 rounded-md font-bold text-sm shadow-sm hover:bg-blue-50">+ Tambah Lantai</button>
              </div>

              {floors.length === 0 ? (
                <div className="text-center p-10 bg-white border border-dashed border-gray-300 rounded-md"><p className="text-gray-500 italic">Belum ada data lantai. Klik Tambah Lantai untuk memulai.</p></div>
              ) : (
                floors.map((floor) => (
                  <div key={floor.id} className="bg-white p-4 rounded-md border border-gray-200 shadow-sm">
                    <div className="flex justify-between items-center mb-4 border-b pb-2">
                      <input type="text" value={floor.nama} onChange={(e) => updateFloorName(floor.id, e.target.value)} className="font-bold text-lg text-gray-800 border-b border-dashed border-gray-400 outline-none focus:border-blue-500 bg-transparent px-1" placeholder="Nama Lantai/Blok" />
                      <div className="flex gap-2">
                        <button onClick={() => addRoom(floor.id)} className="text-xs bg-blue-100 text-blue-700 px-3 py-1 rounded font-bold hover:bg-blue-200">+ Kamar</button>
                        <button onClick={() => removeFloor(floor.id)} className="text-xs bg-red-100 text-red-600 px-3 py-1 rounded font-bold hover:bg-red-200">Hapus Lantai</button>
                      </div>
                    </div>
                    
                    {floor.kamar.length === 0 ? (
                      <p className="text-xs text-gray-400 italic text-center py-2">Belum ada kamar di lantai ini.</p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                        {floor.kamar.map((kamar) => (
                          <div key={kamar.id} className="flex gap-2 items-center bg-gray-50 p-2 rounded border border-gray-200">
                            <input type="text" placeholder="No. Kamar" value={kamar.no} onChange={(e) => updateRoom(floor.id, kamar.id, 'no', e.target.value)} className="w-1/3 border border-gray-300 rounded p-1 text-sm font-bold text-center outline-none focus:ring-1 focus:ring-blue-500" />
                            <select value={kamar.tipe} onChange={(e) => updateRoom(floor.id, kamar.id, 'tipe', e.target.value)} className="w-1/2 border border-gray-300 rounded p-1 text-xs outline-none focus:ring-1 focus:ring-blue-500">
                              <option value="double-bed">Double</option>
                              <option value="twin-bed">Twin</option>
                              <option value="single-bed">Single</option>
                            </select>
                            <button onClick={() => removeRoom(floor.id, kamar.id)} className="w-6 h-6 flex items-center justify-center bg-gray-200 text-red-500 rounded hover:bg-red-100 font-bold">&times;</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div className="p-4 bg-white border-t border-gray-200 flex justify-end gap-3 shrink-0">
          <button onClick={onClose} className="px-5 py-2.5 bg-gray-100 border border-gray-300 text-gray-700 rounded-md font-bold text-sm transition-colors hover:bg-gray-200">Tutup Batal</button>
          <button onClick={handleSimpan} disabled={isSaving} className={`px-6 py-2.5 text-white rounded-md font-bold text-sm shadow-md transition-colors ${isSaving ? 'bg-blue-400' : 'bg-blue-600 hover:bg-blue-700'}`}>
            {isSaving ? 'Menyimpan...' : '💾 Simpan Pengaturan'}
          </button>
        </div>

      </div>
    </div>
  );
}