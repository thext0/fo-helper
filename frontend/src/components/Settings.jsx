// [START: SettingsModule]
import { useState, useEffect } from 'react';

export default function Settings({ onClose }) {
  // [START: StateManagement]
  const [activeTab, setActiveTab] = useState('finansial');
  const [isSaving, setIsSaving] = useState(false);
  const [dataAwal, setDataAwal] = useState(null);

  // Finansial & OTA
  const [otaListUI, setOtaListUI] = useState([]);
  const [deposit, setDeposit] = useState(0);
  const [weekendDays, setWeekendDays] = useState([5, 6, 0]); 
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

  // Inventaris
  const [floors, setFloors] = useState([]);

  // Rate Management
  const [rateManagement, setRateManagement] = useState({
    channels: {},
    calendarRules: { specialDates: [], dateRanges: [] }
  });

  // Operasional & Master Ekstra
  const [rolloverTime, setRolloverTime] = useState('12:00');
  const [masterExtraUI, setMasterExtraUI] = useState([]);
  // [END: StateManagement]

  // [START: Effects]
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch('http://localhost:5000/api/data');
        const db = await res.json();
        setDataAwal(db);
        
        const s = db.settings || {};
        
        // Load Finansial
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

        // Load Rate Management
        setRateManagement(s.rateManagement || {
          channels: {},
          calendarRules: { specialDates: [], dateRanges: [] }
        });

        // Load Inventaris (Migrasi otomatis jika data lama)
        if (s.floors && s.floors.length > 0) {
          setFloors(s.floors);
        } else if (s.rooms) {
          const migratedKamar = [];
          Object.keys(s.rooms).forEach(tipe => {
            s.rooms[tipe].forEach(no => migratedKamar.push({ id: Math.random().toString(), no, tipe }));
          });
          setFloors([{ id: 'fl-1', nama: 'Lantai 1', kamar: migratedKamar }]);
        } else {
          setFloors([]);
        }

        // Load Operasional & Master Ekstra
        setRolloverTime(s.rolloverTime || '12:00');
        setMasterExtraUI((s.masterExtraCharges || []).map(ext => ({ id: Math.random().toString(), nama: ext.nama, harga: ext.harga })));

      } catch (err) { console.error(err); }
    };
    fetchSettings();
  }, []);
  // [END: Effects]

  // [START: Handlers]
  const handleHargaChange = (kategori, tipe, value) => {
    setHarga(prev => ({ ...prev, [kategori]: { ...prev[kategori], [tipe]: Number(value) } }));
  };

  const addFloor = () => setFloors([...floors, { id: Date.now().toString(), nama: `Lantai ${floors.length + 1}`, kamar: [] }]);
  const updateFloorName = (id, nama) => setFloors(floors.map(f => f.id === id ? { ...f, nama } : f));
  const removeFloor = (id) => setFloors(floors.filter(f => f.id !== id));

  const addRoom = (floorId) => setFloors(floors.map(f => f.id === floorId ? { ...f, kamar: [...f.kamar, { id: Date.now().toString(), no: '', tipe: 'double-bed' }] } : f));
  const updateRoom = (floorId, roomId, field, value) => setFloors(floors.map(f => f.id === floorId ? { ...f, kamar: f.kamar.map(k => k.id === roomId ? { ...k, [field]: value } : k) } : f));
  const removeRoom = (floorId, roomId) => setFloors(floors.map(f => f.id === floorId ? { ...f, kamar: f.kamar.filter(k => k.id !== roomId) } : f));

  const handleSimpan = async () => {
    setIsSaving(true);
    try {
      const otaList = otaListUI.map(item => item.nama.trim()).filter(Boolean);
      const masterExtraCharges = masterExtraUI.map(item => ({ nama: item.nama.trim(), harga: Number(item.harga) })).filter(item => item.nama !== '');
      
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

      const newSettings = { 
        otaList, 
        depositDefault: Number(deposit), 
        prices: harga, 
        weekendDays, 
        floors, 
        rooms: roomsArray, 
        totalRooms: totalRoomsCalc, 
        rateManagement,
        rolloverTime,
        masterExtraCharges
      };
      
      const updatedDb = { ...dataAwal, settings: newSettings };
      
      const postRes = await fetch('http://localhost:5000/api/data/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updatedDb) });
      const resData = await postRes.json();
      if (resData.success) {
        alert('Pengaturan berhasil disimpan! Halaman akan dimuat ulang agar data sinkron.');
        window.location.reload();
      } else { alert('Gagal menyimpan pengaturan.'); }
    } catch (err) { console.error(err); alert('Terjadi kesalahan jaringan.'); } finally { setIsSaving(false); }
  };
  // [END: Handlers]

  // [START: Render]
  return (
    <div className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[95vh]">
        
        <div className="p-5 bg-gray-800 text-white flex justify-between items-center shrink-0">
          <div><h2 className="text-xl font-bold">⚙️ Pengaturan Sistem</h2><p className="text-xs text-gray-300">Manajemen Finansial, Inventaris & Operasional</p></div>
          <button onClick={onClose} className="text-gray-400 hover:text-white font-bold text-2xl transition-colors">&times;</button>
        </div>

        {/* TAB NAVIGATION */}
        <div className="flex border-b border-gray-200 shrink-0 bg-gray-50 overflow-x-auto hide-scrollbar">
          <button onClick={() => setActiveTab('finansial')} className={`flex-1 py-3 text-sm font-bold whitespace-nowrap px-4 transition-colors ${activeTab === 'finansial' ? 'text-blue-700 border-b-2 border-blue-700 bg-white' : 'text-gray-500 hover:bg-gray-100'}`}>💰 Finansial Dasar</button>
          <button onClick={() => setActiveTab('inventaris')} className={`flex-1 py-3 text-sm font-bold whitespace-nowrap px-4 transition-colors ${activeTab === 'inventaris' ? 'text-blue-700 border-b-2 border-blue-700 bg-white' : 'text-gray-500 hover:bg-gray-100'}`}>🏨 Denah Kamar</button>
          <button onClick={() => setActiveTab('rate_management')} className={`flex-1 py-3 text-sm font-bold whitespace-nowrap px-4 transition-colors ${activeTab === 'rate_management' ? 'text-blue-700 border-b-2 border-blue-700 bg-white' : 'text-gray-500 hover:bg-gray-100'}`}>📅 Rate Management</button>
          <button onClick={() => setActiveTab('operasional')} className={`flex-1 py-3 text-sm font-bold whitespace-nowrap px-4 transition-colors ${activeTab === 'operasional' ? 'text-blue-700 border-b-2 border-blue-700 bg-white' : 'text-gray-500 hover:bg-gray-100'}`}>⚙️ Operasional & Ekstra</button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-6 bg-gray-50">
          
          {/* TAB 1: FINANSIAL */}
          {activeTab === 'finansial' && (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-white p-4 rounded-md border border-gray-200 shadow-sm">
                <h3 className="font-bold text-gray-800 mb-2">Penentuan Hari Weekend (Harga Berlaku)</h3>
                <p className="text-xs text-gray-500 mb-3">Centang hari apa saja yang sistem anggap sebagai "Weekend". Sisanya otomatis menjadi "Weekday".</p>
                <div className="flex flex-wrap gap-3">
                  {[
                    { id: 1, label: 'Senin' }, { id: 2, label: 'Selasa' }, { id: 3, label: 'Rabu' },
                    { id: 4, label: 'Kamis' }, { id: 5, label: 'Jumat' }, { id: 6, label: 'Sabtu' }, { id: 0, label: 'Minggu' }
                  ].map((hari) => (
                    <label key={hari.id} className={`flex items-center gap-2 px-3 py-2 border rounded cursor-pointer text-sm font-bold transition-colors ${weekendDays.includes(hari.id) ? 'bg-orange-100 border-orange-400 text-orange-800' : 'bg-gray-50 border-gray-300 text-gray-500 hover:bg-gray-100'}`}>
                      <input type="checkbox" className="hidden" checked={weekendDays.includes(hari.id)} onChange={(e) => { if (e.target.checked) setWeekendDays([...weekendDays, hari.id]); else setWeekendDays(weekendDays.filter(d => d !== hari.id)); }} />
                      {hari.label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="bg-white p-4 rounded-md border border-gray-200 shadow-sm">
                <h3 className="font-bold text-blue-900 mb-4 border-b border-gray-100 pb-2">Standar Harga Sewa (Rp)</h3>
                <div className="space-y-6">
                  {/* Harian */}
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

                  {/* Transit */}
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

                  {/* Kos */}
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
                <div className="bg-white p-4 rounded-md border border-gray-200 shadow-sm flex flex-col max-h-64">
                  <div className="flex justify-between items-center mb-2">
                    <div><h3 className="font-bold text-gray-800 mb-1">Daftar Partner OTA</h3><p className="text-xs text-gray-500">Aplikasi asal tamu *booking*.</p></div>
                    <button onClick={() => setOtaListUI([...otaListUI, { id: Date.now().toString(), nama: '' }])} className="text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 py-1.5 rounded font-bold transition-colors">+ Tambah OTA</button>
                  </div>
                  <div className="overflow-y-auto pr-1 space-y-2 flex-1 mt-2">
                    {otaListUI.length === 0 ? (<div className="text-center text-xs text-gray-400 italic py-4 border border-dashed rounded">Daftar OTA kosong.</div>) : (
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

          {/* TAB 2: INVENTARIS */}
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
                    {floor.kamar.length === 0 ? (<p className="text-xs text-gray-400 italic text-center py-2">Belum ada kamar di lantai ini.</p>) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                        {floor.kamar.map((kamar) => (
                          <div key={kamar.id} className="flex gap-2 items-center bg-gray-50 p-2 rounded border border-gray-200">
                            <input type="text" placeholder="No. Kamar" value={kamar.no} onChange={(e) => updateRoom(floor.id, kamar.id, 'no', e.target.value)} className="w-1/3 border border-gray-300 rounded p-1 text-sm font-bold text-center outline-none focus:ring-1 focus:ring-blue-500" />
                            <select value={kamar.tipe} onChange={(e) => updateRoom(floor.id, kamar.id, 'tipe', e.target.value)} className="w-1/2 border border-gray-300 rounded p-1 text-xs outline-none focus:ring-1 focus:ring-blue-500">
                              <option value="double-bed">Double</option><option value="twin-bed">Twin</option><option value="single-bed">Single</option>
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

          {/* TAB 3: RATE MANAGEMENT */}
          {activeTab === 'rate_management' && (
            <div className="space-y-8 animate-fade-in pb-8">
              <div className="flex items-center gap-2 border-b border-gray-200 pb-3">
                <h3 className="font-bold text-gray-800 text-lg">Rate Management System</h3>
                <div className="relative group cursor-pointer flex items-center">
                  <span className="flex items-center justify-center w-5 h-5 bg-blue-100 text-blue-600 rounded-full text-xs font-bold hover:bg-blue-200 transition-colors shadow-sm">?</span>
                  <div className="absolute top-full mt-2 left-0 hidden group-hover:block w-72 p-4 bg-gray-800 text-white text-xs rounded-xl shadow-2xl z-50 pointer-events-none border border-gray-700">
                    <p className="font-bold text-blue-300 mb-1">Fungsi Tab Ini</p><p className="mb-3 text-gray-300">Menentukan aturan harga khusus yang akan menimpa harga standar secara otomatis berdasarkan tanggal atau asal booking tamu.</p>
                    <p className="font-bold text-blue-300 mb-1">Hierarki Prioritas Override</p>
                    <ol className="list-decimal pl-4 space-y-1 text-gray-300"><li><strong className="text-white">Harga Khusus OTA</strong> (Tertinggi)</li><li><strong className="text-white">Tanggal Merah Tahunan</strong></li><li><strong className="text-white">Musim Liburan Tahunan</strong></li><li><strong className="text-white">Harga Dasar</strong> (Biasa/Akhir Pekan)</li></ol>
                  </div>
                </div>
              </div>

              {/* Special Dates */}
              <div>
                <div className="flex justify-between items-center mb-3">
                  <div><h4 className="font-bold text-gray-800">1. Tanggal Merah Tahunan</h4><p className="text-xs text-gray-500">Harga khusus untuk satu tanggal spesifik yang berulang setiap tahun.</p></div>
                  <button onClick={() => setRateManagement(prev => ({...prev, calendarRules: {...prev.calendarRules, specialDates: [...prev.calendarRules.specialDates, { id: Date.now().toString(), date: '01-01', name: '', rates: { 'double-bed': 0, 'twin-bed': 0, 'single-bed': 0 } }]}}))} className="text-xs bg-red-50 text-red-600 border border-red-200 px-3 py-1.5 rounded font-bold hover:bg-red-100 transition-colors">+ Tambah Tanggal</button>
                </div>
                {rateManagement.calendarRules.specialDates.length === 0 ? (<div className="bg-gray-50 border border-dashed border-gray-300 rounded-lg p-6 text-center text-sm text-gray-400 italic">Belum ada aturan tanggal merah.</div>) : (
                  <div className="space-y-4">
                    {rateManagement.calendarRules.specialDates.map((sd, i) => (
                      <div key={sd.id} className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm flex flex-col md:flex-row gap-4 items-start">
                        <div className="w-full md:w-1/3 space-y-3">
                          <div><label className="block text-xs font-bold text-gray-600 mb-1">Nama Momen</label><input type="text" value={sd.name} onChange={(e) => { const newSd = [...rateManagement.calendarRules.specialDates]; newSd[i].name = e.target.value; setRateManagement({...rateManagement, calendarRules: {...rateManagement.calendarRules, specialDates: newSd}}); }} className="w-full border border-gray-300 p-2 rounded text-sm outline-none focus:border-blue-500 bg-gray-50" placeholder="Cth: Tahun Baru" /></div>
                          <div className="flex gap-2">
                            <div className="w-1/2"><label className="block text-xs font-bold text-gray-600 mb-1">Tanggal</label><input type="number" min="1" max="31" value={sd.date ? parseInt(sd.date.split('-')[1]) : 1} onChange={(e) => { const day = e.target.value.padStart(2, '0'); const month = sd.date ? sd.date.split('-')[0] : '01'; const newSd = [...rateManagement.calendarRules.specialDates]; newSd[i].date = `${month}-${day}`; setRateManagement({...rateManagement, calendarRules: {...rateManagement.calendarRules, specialDates: newSd}}); }} className="w-full border border-gray-300 p-2 rounded text-sm text-center outline-none focus:border-blue-500 bg-gray-50" /></div>
                            <div className="w-1/2"><label className="block text-xs font-bold text-gray-600 mb-1">Bulan</label><select value={sd.date ? sd.date.split('-')[0] : '01'} onChange={(e) => { const month = e.target.value; const day = sd.date ? sd.date.split('-')[1] : '01'; const newSd = [...rateManagement.calendarRules.specialDates]; newSd[i].date = `${month}-${day}`; setRateManagement({...rateManagement, calendarRules: {...rateManagement.calendarRules, specialDates: newSd}}); }} className="w-full border border-gray-300 p-2 rounded text-sm outline-none focus:border-blue-500 bg-gray-50"><option value="01">Jan</option><option value="02">Feb</option><option value="03">Mar</option><option value="04">Apr</option><option value="05">Mei</option><option value="06">Jun</option><option value="07">Jul</option><option value="08">Ags</option><option value="09">Sep</option><option value="10">Okt</option><option value="11">Nov</option><option value="12">Des</option></select></div>
                          </div>
                        </div>
                        <div className="w-full md:w-2/3 bg-red-50 p-3 rounded border border-red-100 flex-1">
                          <label className="block text-xs font-bold text-red-800 mb-2 border-b border-red-200 pb-1">Tarif Override (Rp)</label>
                          <div className="grid grid-cols-3 gap-3">
                            <div><label className="block text-xs font-medium text-gray-600 mb-1">Double</label><input type="number" value={sd.rates?.['double-bed'] || 0} onChange={(e) => { const newSd = [...rateManagement.calendarRules.specialDates]; newSd[i].rates['double-bed'] = Number(e.target.value); setRateManagement({...rateManagement, calendarRules: {...rateManagement.calendarRules, specialDates: newSd}}); }} className="w-full border border-gray-300 p-2 rounded text-sm outline-none focus:border-red-500" /></div>
                            <div><label className="block text-xs font-medium text-gray-600 mb-1">Twin</label><input type="number" value={sd.rates?.['twin-bed'] || 0} onChange={(e) => { const newSd = [...rateManagement.calendarRules.specialDates]; newSd[i].rates['twin-bed'] = Number(e.target.value); setRateManagement({...rateManagement, calendarRules: {...rateManagement.calendarRules, specialDates: newSd}}); }} className="w-full border border-gray-300 p-2 rounded text-sm outline-none focus:border-red-500" /></div>
                            <div><label className="block text-xs font-medium text-gray-600 mb-1">Single</label><input type="number" value={sd.rates?.['single-bed'] || 0} onChange={(e) => { const newSd = [...rateManagement.calendarRules.specialDates]; newSd[i].rates['single-bed'] = Number(e.target.value); setRateManagement({...rateManagement, calendarRules: {...rateManagement.calendarRules, specialDates: newSd}}); }} className="w-full border border-gray-300 p-2 rounded text-sm outline-none focus:border-red-500" /></div>
                          </div>
                        </div>
                        <button onClick={() => setRateManagement(prev => ({...prev, calendarRules: {...prev.calendarRules, specialDates: prev.calendarRules.specialDates.filter(item => item.id !== sd.id)}}))} className="text-gray-400 hover:text-red-600 hover:bg-red-50 p-2 rounded transition-colors self-start mt-1" title="Hapus Aturan">✖</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Date Ranges */}
              <div>
                <div className="flex justify-between items-center mb-3">
                  <div><h4 className="font-bold text-gray-800">2. Musim Liburan Tahunan</h4><p className="text-xs text-gray-500">Harga khusus untuk rentang tanggal tertentu yang berulang setiap tahun.</p></div>
                  <button onClick={() => setRateManagement(prev => ({...prev, calendarRules: {...prev.calendarRules, dateRanges: [...prev.calendarRules.dateRanges, { id: Date.now().toString(), startDate: '01-01', endDate: '01-01', name: '', rates: { 'double-bed': 0, 'twin-bed': 0, 'single-bed': 0 } }]}}))} className="text-xs bg-orange-50 text-orange-600 border border-orange-200 px-3 py-1.5 rounded font-bold hover:bg-orange-100 transition-colors">+ Tambah Musim</button>
                </div>
                {rateManagement.calendarRules.dateRanges.length === 0 ? (<div className="bg-gray-50 border border-dashed border-gray-300 rounded-lg p-6 text-center text-sm text-gray-400 italic">Belum ada aturan musim liburan.</div>) : (
                  <div className="space-y-4">
                    {rateManagement.calendarRules.dateRanges.map((dr, i) => (
                      <div key={dr.id} className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm flex flex-col md:flex-row gap-4 items-start">
                        <div className="w-full md:w-5/12 space-y-3">
                          <div><label className="block text-xs font-bold text-gray-600 mb-1">Nama Musim</label><input type="text" value={dr.name} onChange={(e) => { const newDr = [...rateManagement.calendarRules.dateRanges]; newDr[i].name = e.target.value; setRateManagement({...rateManagement, calendarRules: {...rateManagement.calendarRules, dateRanges: newDr}}); }} className="w-full border border-gray-300 p-2 rounded text-sm outline-none focus:border-blue-500 bg-gray-50" placeholder="Cth: Liburan Lebaran" /></div>
                          <div className="flex gap-4">
                            <div className="w-1/2 flex gap-1"><div className="w-1/2"><label className="block text-[10px] font-bold text-gray-500 mb-1">Mulai Tgl</label><input type="number" min="1" max="31" value={dr.startDate ? parseInt(dr.startDate.split('-')[1]) : 1} onChange={(e) => { const day = e.target.value.padStart(2, '0'); const month = dr.startDate ? dr.startDate.split('-')[0] : '01'; const newDr = [...rateManagement.calendarRules.dateRanges]; newDr[i].startDate = `${month}-${day}`; setRateManagement({...rateManagement, calendarRules: {...rateManagement.calendarRules, dateRanges: newDr}}); }} className="w-full border border-gray-300 p-1.5 rounded text-sm text-center outline-none focus:border-blue-500 bg-gray-50" /></div><div className="w-1/2"><label className="block text-[10px] font-bold text-gray-500 mb-1">Bln</label><select value={dr.startDate ? dr.startDate.split('-')[0] : '01'} onChange={(e) => { const month = e.target.value; const day = dr.startDate ? dr.startDate.split('-')[1] : '01'; const newDr = [...rateManagement.calendarRules.dateRanges]; newDr[i].startDate = `${month}-${day}`; setRateManagement({...rateManagement, calendarRules: {...rateManagement.calendarRules, dateRanges: newDr}}); }} className="w-full border border-gray-300 p-1.5 rounded text-sm outline-none focus:border-blue-500 bg-gray-50"><option value="01">Jan</option><option value="02">Feb</option><option value="03">Mar</option><option value="04">Apr</option><option value="05">Mei</option><option value="06">Jun</option><option value="07">Jul</option><option value="08">Ags</option><option value="09">Sep</option><option value="10">Okt</option><option value="11">Nov</option><option value="12">Des</option></select></div></div>
                            <div className="w-1/2 flex gap-1"><div className="w-1/2"><label className="block text-[10px] font-bold text-gray-500 mb-1">Akhir Tgl</label><input type="number" min="1" max="31" value={dr.endDate ? parseInt(dr.endDate.split('-')[1]) : 1} onChange={(e) => { const day = e.target.value.padStart(2, '0'); const month = dr.endDate ? dr.endDate.split('-')[0] : '01'; const newDr = [...rateManagement.calendarRules.dateRanges]; newDr[i].endDate = `${month}-${day}`; setRateManagement({...rateManagement, calendarRules: {...rateManagement.calendarRules, dateRanges: newDr}}); }} className="w-full border border-gray-300 p-1.5 rounded text-sm text-center outline-none focus:border-blue-500 bg-gray-50" /></div><div className="w-1/2"><label className="block text-[10px] font-bold text-gray-500 mb-1">Bln</label><select value={dr.endDate ? dr.endDate.split('-')[0] : '01'} onChange={(e) => { const month = e.target.value; const day = dr.endDate ? dr.endDate.split('-')[1] : '01'; const newDr = [...rateManagement.calendarRules.dateRanges]; newDr[i].endDate = `${month}-${day}`; setRateManagement({...rateManagement, calendarRules: {...rateManagement.calendarRules, dateRanges: newDr}}); }} className="w-full border border-gray-300 p-1.5 rounded text-sm outline-none focus:border-blue-500 bg-gray-50"><option value="01">Jan</option><option value="02">Feb</option><option value="03">Mar</option><option value="04">Apr</option><option value="05">Mei</option><option value="06">Jun</option><option value="07">Jul</option><option value="08">Ags</option><option value="09">Sep</option><option value="10">Okt</option><option value="11">Nov</option><option value="12">Des</option></select></div></div>
                          </div>
                        </div>
                        <div className="w-full md:w-7/12 bg-orange-50 p-3 rounded border border-orange-100 flex-1">
                          <label className="block text-xs font-bold text-orange-800 mb-2 border-b border-orange-200 pb-1">Tarif Override (Rp)</label>
                          <div className="grid grid-cols-3 gap-3">
                            <div><label className="block text-xs font-medium text-gray-600 mb-1">Double</label><input type="number" value={dr.rates?.['double-bed'] || 0} onChange={(e) => { const newDr = [...rateManagement.calendarRules.dateRanges]; newDr[i].rates['double-bed'] = Number(e.target.value); setRateManagement({...rateManagement, calendarRules: {...rateManagement.calendarRules, dateRanges: newDr}}); }} className="w-full border border-gray-300 p-2 rounded text-sm outline-none focus:border-orange-500" /></div>
                            <div><label className="block text-xs font-medium text-gray-600 mb-1">Twin</label><input type="number" value={dr.rates?.['twin-bed'] || 0} onChange={(e) => { const newDr = [...rateManagement.calendarRules.dateRanges]; newDr[i].rates['twin-bed'] = Number(e.target.value); setRateManagement({...rateManagement, calendarRules: {...rateManagement.calendarRules, dateRanges: newDr}}); }} className="w-full border border-gray-300 p-2 rounded text-sm outline-none focus:border-orange-500" /></div>
                            <div><label className="block text-xs font-medium text-gray-600 mb-1">Single</label><input type="number" value={dr.rates?.['single-bed'] || 0} onChange={(e) => { const newDr = [...rateManagement.calendarRules.dateRanges]; newDr[i].rates['single-bed'] = Number(e.target.value); setRateManagement({...rateManagement, calendarRules: {...rateManagement.calendarRules, dateRanges: newDr}}); }} className="w-full border border-gray-300 p-2 rounded text-sm outline-none focus:border-orange-500" /></div>
                          </div>
                        </div>
                        <button onClick={() => setRateManagement(prev => ({...prev, calendarRules: {...prev.calendarRules, dateRanges: prev.calendarRules.dateRanges.filter(item => item.id !== dr.id)}}))} className="text-gray-400 hover:text-red-600 hover:bg-red-50 p-2 rounded transition-colors self-start mt-1" title="Hapus Aturan">✖</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Channel Rates */}
              <div>
                <h4 className="font-bold text-gray-800 mb-1">3. Channel Rates (Harga Khusus OTA)</h4>
                <p className="text-xs text-gray-500 mb-4">Setel harga khusus untuk platform Online Travel Agent. Daftar OTA dikelola di tab Finansial Dasar.</p>
                {otaListUI.length === 0 ? (<div className="bg-gray-50 border border-dashed border-gray-300 rounded-lg p-6 text-center text-sm text-gray-400 italic">Tambahkan OTA di tab Finansial Dasar terlebih dahulu.</div>) : (
                  <div className="space-y-4">
                    {otaListUI.filter(o => o.nama.trim() !== '').map((ota) => {
                      const channelName = ota.nama.trim();
                      const chData = rateManagement.channels[channelName] || { isActive: true, baseRates: { weekday: {'double-bed':0, 'twin-bed':0, 'single-bed':0}, weekend: {'double-bed':0, 'twin-bed':0, 'single-bed':0} } };
                      const updateChannelRate = (type, bed, val) => { setRateManagement(prev => ({ ...prev, channels: { ...prev.channels, [channelName]: { ...chData, isActive: true, baseRates: { ...chData.baseRates, [type]: { ...chData.baseRates[type], [bed]: Number(val) } } } } })); };

                      return (
                        <div key={ota.id} className="bg-white p-4 rounded-lg border border-blue-200 shadow-sm transition-colors">
                          <div className="flex items-center gap-3 mb-3 pb-2 border-b border-gray-100"><h5 className="font-bold text-sm text-blue-800">Harga OTA: {channelName}</h5></div>
                          <div className="flex flex-col md:flex-row gap-4">
                            <div className="w-full md:w-1/2 bg-blue-50 p-3 rounded border border-blue-100">
                              <label className="block text-xs font-bold text-blue-800 mb-2 border-b border-blue-200 pb-1">Weekday (Hari Biasa)</label>
                              <div className="grid grid-cols-3 gap-2">
                                <div><label className="block text-[10px] font-medium text-gray-500 mb-1">Double</label><input type="number" value={chData.baseRates.weekday['double-bed']} onChange={(e) => updateChannelRate('weekday', 'double-bed', e.target.value)} className="w-full border border-gray-300 p-1.5 rounded text-xs outline-none focus:border-blue-500" /></div>
                                <div><label className="block text-[10px] font-medium text-gray-500 mb-1">Twin</label><input type="number" value={chData.baseRates.weekday['twin-bed']} onChange={(e) => updateChannelRate('weekday', 'twin-bed', e.target.value)} className="w-full border border-gray-300 p-1.5 rounded text-xs outline-none focus:border-blue-500" /></div>
                                <div><label className="block text-[10px] font-medium text-gray-500 mb-1">Single</label><input type="number" value={chData.baseRates.weekday['single-bed']} onChange={(e) => updateChannelRate('weekday', 'single-bed', e.target.value)} className="w-full border border-gray-300 p-1.5 rounded text-xs outline-none focus:border-blue-500" /></div>
                              </div>
                            </div>
                            <div className="w-full md:w-1/2 bg-orange-50 p-3 rounded border border-orange-100">
                              <label className="block text-xs font-bold text-orange-800 mb-2 border-b border-orange-200 pb-1">Weekend (Akhir Pekan)</label>
                              <div className="grid grid-cols-3 gap-2">
                                <div><label className="block text-[10px] font-medium text-gray-500 mb-1">Double</label><input type="number" value={chData.baseRates.weekend['double-bed']} onChange={(e) => updateChannelRate('weekend', 'double-bed', e.target.value)} className="w-full border border-gray-300 p-1.5 rounded text-xs outline-none focus:border-orange-500" /></div>
                                <div><label className="block text-[10px] font-medium text-gray-500 mb-1">Twin</label><input type="number" value={chData.baseRates.weekend['twin-bed']} onChange={(e) => updateChannelRate('weekend', 'twin-bed', e.target.value)} className="w-full border border-gray-300 p-1.5 rounded text-xs outline-none focus:border-orange-500" /></div>
                                <div><label className="block text-[10px] font-medium text-gray-500 mb-1">Single</label><input type="number" value={chData.baseRates.weekend['single-bed']} onChange={(e) => updateChannelRate('weekend', 'single-bed', e.target.value)} className="w-full border border-gray-300 p-1.5 rounded text-xs outline-none focus:border-orange-500" /></div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>
          )}

          {/* TAB 4: OPERASIONAL & EKSTRA (TAB BARU) */}
          {activeTab === 'operasional' && (
            <div className="space-y-6 animate-fade-in pb-8">
              
              <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col md:flex-row gap-6 items-center">
                <div className="flex-1">
                  <h3 className="font-bold text-gray-800 flex items-center gap-2 mb-1"><span>🕒</span> Rollover Time (Batas Check-Out)</h3>
                  <p className="text-xs text-gray-500 leading-relaxed">Waktu standar di mana sistem menganggap tamu sudah harus *check-out*, dan hari inap baru dihitung. Biasanya pukul 12:00 siang. Ini akan mempengaruhi kalkulasi durasi inap dan indikator UI peringatan telat *check-out*.</p>
                </div>
                <div className="w-full md:w-48 shrink-0">
                  <input type="time" value={rolloverTime} onChange={(e) => setRolloverTime(e.target.value)} className="w-full text-center border-2 border-blue-400 text-blue-800 p-3 rounded-lg font-black text-xl outline-none focus:ring-4 focus:ring-blue-100 transition-all" />
                </div>
              </div>

              <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                <div className="flex justify-between items-center mb-4 border-b border-gray-100 pb-3">
                  <div>
                    <h3 className="font-bold text-gray-800 flex items-center gap-2 mb-1"><span>🛒</span> Master Data Extra Charges</h3>
                    <p className="text-xs text-gray-500">Buat *template* nama dan harga tagihan tambahan agar kasir tidak perlu mengetik berulang kali di form Check-In.</p>
                  </div>
                  <button onClick={() => setMasterExtraUI([...masterExtraUI, { id: Date.now().toString(), nama: '', harga: 0 }])} className="text-xs bg-orange-100 hover:bg-orange-200 text-orange-700 px-4 py-2 rounded-lg font-bold transition-colors shadow-sm whitespace-nowrap">+ Tambah Item</button>
                </div>

                <div className="space-y-3 max-h-80 overflow-y-auto pr-2">
                  {masterExtraUI.length === 0 ? (
                    <div className="text-center text-sm text-gray-400 italic py-8 border border-dashed border-gray-200 rounded-lg bg-gray-50">Belum ada template tagihan tambahan. Klik tombol tambah di atas.</div>
                  ) : (
                    masterExtraUI.map((item) => (
                      <div key={item.id} className="flex flex-col sm:flex-row gap-3 items-center bg-gray-50 p-3 rounded-lg border border-gray-200 hover:border-orange-300 transition-colors">
                        <div className="w-full sm:w-1/2">
                          <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1 ml-1">Nama Item Tambahan</label>
                          <input type="text" value={item.nama} onChange={(e) => setMasterExtraUI(masterExtraUI.map(ext => ext.id === item.id ? { ...ext, nama: e.target.value } : ext))} placeholder="Cth: Extra Bed / Denda Telat / Minuman" className="w-full border border-gray-300 rounded-md p-2 text-sm outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500" />
                        </div>
                        <div className="w-full sm:w-1/3">
                          <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1 ml-1">Harga Default (Rp)</label>
                          <input type="number" value={item.harga} onChange={(e) => setMasterExtraUI(masterExtraUI.map(ext => ext.id === item.id ? { ...ext, harga: Number(e.target.value) } : ext))} className="w-full border border-gray-300 rounded-md p-2 text-sm font-bold text-gray-700 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500" />
                        </div>
                        <div className="w-full sm:w-auto mt-4 sm:mt-0 flex justify-end">
                          <button onClick={() => setMasterExtraUI(masterExtraUI.filter(ext => ext.id !== item.id))} className="bg-red-100 text-red-600 w-10 h-10 flex items-center justify-center rounded-lg font-bold hover:bg-red-200 transition-colors" title="Hapus Item">&times;</button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

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
// [END: SettingsModule]