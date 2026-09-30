// [START: DatabasePelangganModule]
import { useState, useMemo } from 'react';
import { DAFTAR_KOTA_INDONESIA } from '../data/kotaIndonesia';
import { useDialog } from './DialogProvider';
import CustomDateTimePicker from './CustomDateTimePicker';
import { useAppData } from '../context/DataProvider'; // <-- IMPORT CONTEXT

const toTitleCase = (str) => str.toLowerCase().replace(/\b\w/g, s => s.toUpperCase());

export default function DatabasePelanggan() {
  const { alert, toast } = useDialog();
  const { data: dbData, loading: isDbLoading, refreshData } = useAppData(); // <-- GUNAKAN MEMORI GLOBAL

  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'waktuDibuat', direction: 'desc' });

  const [editingBerkas, setEditingBerkas] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editTipeId, setEditTipeId] = useState('KTP');
  const [editNomorId, setEditNomorId] = useState('');
  
  const [isSaving, setIsSaving] = useState(false);

  const [isCityModalOpen, setIsCityModalOpen] = useState(false);
  const [citySearch, setCitySearch] = useState('');
  const [cityPage, setCityPage] = useState(1);

  // [START: Memory Derived States]
  // Menggunakan useMemo agar perhitungan riwayat super cepat dan tidak memicu render ulang (Tahap 5 & 7 Performa)
  const semuaPelanggan = useMemo(() => {
    if (!dbData) return [];
    
    let guests = dbData.guests || [];
    const rawData = [
      ...(dbData.dailyTransactions || []).map(tx => ({ ...tx, dbType: 'harian' })),
      ...(dbData.activeKost || []).map(kos => ({ ...kos, dbType: 'kos' }))
    ].sort((a, b) => new Date(b.waktuInput) - new Date(a.waktuInput));

    // Mapping riwayat transaksi ke setiap tamu
    const guestsWithHistory = guests.map(g => {
        const riwayat = rawData.filter(tx => tx.guestId === g.guestId || (tx.nama || '').toLowerCase().trim() === (g.nama || '').toLowerCase().trim());
        return { ...g, totalKunjungan: riwayat.length, riwayatInap: riwayat };
    });

    return guestsWithHistory;
  }, [dbData]);
  // [END: Memory Derived States]

  const openBerkasModal = (item) => {
    setEditingBerkas(item); 
    setEditForm({ ...item }); 
    setEditTipeId(item.nik ? 'KTP' : (item.tipeIdLain || 'KTP'));
    setEditNomorId(item.nik || item.nomorIdLain || '');
  };

  const handleSimpanBerkas = async () => {
    // TAMBAHAN: Validasi panjang nomor telepon di Edit Form
    if (editForm.noTelp && (editForm.noTelp.length < 8 && editForm.noTelp.length > 0 || editForm.noTelp.length > 15)) {
      await alert("Nomor telepon harus berisi antara 8 hingga 15 angka.", "Validasi Gagal");
      return;
    }
    
    setIsSaving(true);
    try {
      // Duplikasi memori global untuk dimutasi
      const currentDb = JSON.parse(JSON.stringify(dbData));

      let finalDataToSave = { ...editForm };
      if (editTipeId === 'KTP') {
          finalDataToSave.nik = editNomorId;
          finalDataToSave.tipeIdLain = '';
          finalDataToSave.nomorIdLain = '';
      } else {
          finalDataToSave.nik = '';
          finalDataToSave.tipeIdLain = editTipeId;
          finalDataToSave.nomorIdLain = editNomorId;
      }

      const index = (currentDb.guests || []).findIndex(g => g.guestId === editingBerkas.guestId);
      if (index !== -1) {
          currentDb.guests[index] = { ...currentDb.guests[index], ...finalDataToSave };
      } else {
          if(!currentDb.guests) currentDb.guests = [];
          currentDb.guests.push({...finalDataToSave});
      }

      const postRes = await fetch('http://localhost:5000/api/data/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(currentDb) });
      const result = await postRes.json();
      
      if (result.success) { 
        refreshData(); // Sinkronkan memori global pasca simpan
        setEditingBerkas(null); 
        toast("Biodata berhasil diperbarui!", "success");
      } 
      else { await alert("Gagal menyimpan berkas: " + result.error, "Error"); }
    } catch (error) { 
      console.error(error); 
      await alert("Terjadi kesalahan jaringan.", "Error"); 
    } finally { setIsSaving(false); }
  };

  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };
  const getSortIndicator = (key) => sortConfig.key !== key ? '↕️' : (sortConfig.direction === 'asc' ? '⬆️' : '⬇️');

  const filteredPelanggan = semuaPelanggan.filter(p => 
    (p.nama && p.nama.toLowerCase().includes(searchTerm.toLowerCase())) || 
    (p.noTelp && p.noTelp.includes(searchTerm)) ||
    (p.nik && p.nik.includes(searchTerm)) ||
    (p.nomorIdLain && p.nomorIdLain.includes(searchTerm))
  );

  const sortedPelanggan = [...filteredPelanggan].sort((a, b) => {
    let valA, valB;
    switch(sortConfig.key) {
        case 'nama': 
            valA = (a.nama || '').toLowerCase(); 
            valB = (b.nama || '').toLowerCase(); 
            break;
        case 'kunjungan': 
            valA = a.totalKunjungan || 0; 
            valB = b.totalKunjungan || 0; 
            break;
        default: {
            const dateA = a.riwayatInap?.length > 0 ? new Date(a.riwayatInap[0].waktuInput).getTime() : new Date(a.waktuDibuat).getTime();
            const dateB = b.riwayatInap?.length > 0 ? new Date(b.riwayatInap[0].waktuInput).getTime() : new Date(b.waktuDibuat).getTime();
            valA = dateA; 
            valB = dateB; 
            break;
        }
    }
    if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
    if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  const filteredCities = DAFTAR_KOTA_INDONESIA.filter(kota => kota.toLowerCase().includes(citySearch.toLowerCase()));
  const totalCityPages = Math.ceil(filteredCities.length / 20) || 1;
  const paginatedCities = filteredCities.slice((cityPage - 1) * 20, cityPage * 20);
  const handleSelectCity = (kota) => { setEditForm({...editForm, tamuDari: kota}); setIsCityModalOpen(false); setCitySearch(''); setCityPage(1); };

  if (isDbLoading) return <div className="text-center p-10 font-medium text-gray-500">Memuat database pelanggan dari memori sentral...</div>;

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div className="bg-white p-4 rounded-md shadow-sm border border-gray-200 flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-800">👥 Database Pelanggan Terpadu</h2>
          <p className="text-sm text-gray-500">Buku Register Tamu: Identitas Pribadi, ID Resmi, dan Kontak.</p>
        </div>
        <div className="w-full md:w-1/3">
          <input type="text" placeholder="🔍 Cari Nama, ID, atau No. Telepon..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full border border-gray-300 rounded-md p-3 bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none" />
        </div>
      </div>

      <div className="bg-white rounded-md shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-100 text-gray-700 border-b border-gray-300">
              <tr>
                <th className="p-4 font-bold w-1/3 hover:text-blue-600 cursor-pointer transition-colors" onClick={() => requestSort('nama')}>
                   Nama Lengkap <span className="text-xs ml-1 opacity-60">{getSortIndicator('nama')}</span>
                </th>
                <th className="p-4 font-bold">Kontak Terhubung</th>
                <th className="p-4 font-bold hover:text-blue-600 cursor-pointer transition-colors" onClick={() => requestSort('waktuDibuat')}>
                   Identitas & Kedatangan <span className="text-xs ml-1 opacity-60">{getSortIndicator('waktuDibuat')}</span>
                </th>
                <th className="p-4 font-bold text-center w-36 hover:text-blue-600 cursor-pointer transition-colors" onClick={() => requestSort('kunjungan')}>
                   Kunjungan <span className="text-xs ml-1 opacity-60">{getSortIndicator('kunjungan')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedPelanggan.length === 0 ? (<tr><td colSpan="4" className="p-8 text-center text-gray-500 italic">Tidak ada data pelanggan yang cocok.</td></tr>) : (
                sortedPelanggan.map((p) => {
                  const idType = p.nik ? 'KTP' : (p.tipeIdLain || 'ID');
                  const idNum = p.nik || p.nomorIdLain || '-';

                  return (
                  <tr key={p.guestId} className="border-b border-gray-100 hover:bg-blue-50/30 transition-colors">
                    <td className="p-4">
                      <div className="font-bold text-gray-900 text-base">
                        {p.nama} {p.jenisKelamin && p.jenisKelamin.toLowerCase().includes('laki') ? '♂️' : p.jenisKelamin && p.jenisKelamin.toLowerCase().includes('perempuan') ? '♀️' : p.jenisKelamin && p.jenisKelamin.toLowerCase().includes('lain') ? '⚪' : <span className="text-[10px] text-red-400 italic font-normal ml-1">(Gender Kosong)</span>}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-2">
                        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-800 shadow-sm">ID: {p.guestId}</span>
                      </div>
                    </td>
                    <td className="p-4"><div className="flex items-center gap-2 mb-1"><span>📱</span> <span className="font-medium text-gray-800">{p.noTelp || <span className="text-gray-400 italic">Kosong</span>}</span></div></td>
                    <td className="p-4">
                      <div className="font-mono text-xs text-gray-600 mb-1 font-bold">{idType}: <span className="text-gray-800">{idNum}</span></div>
                      <div className="text-xs text-gray-500 truncate max-w-[200px]">📍 {p.tamuDari || 'Kota Asal Kosong'}</div>
                      {p.alamatKantor && (<div className="text-[10px] text-gray-400 truncate max-w-[200px] mt-0.5">🏢 {p.alamatKantor}</div>)}
                    </td>
                    <td className="p-4 text-center space-y-2">
                      <span className="inline-block px-3 py-1 rounded text-xs font-bold uppercase tracking-wider bg-purple-100 text-purple-700 shadow-sm border border-purple-200 block w-full">{p.totalKunjungan} Kali</span>
                      <button onClick={() => openBerkasModal(p)} className="bg-blue-600 hover:bg-blue-700 text-white w-full py-2 rounded text-xs font-bold shadow-sm transition-colors">📄 Kelola Biodata</button>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editingBerkas && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 bg-blue-800 text-white flex justify-between items-center shrink-0">
              <div><h3 className="font-bold text-lg">📄 Form Register Tamu</h3><p className="text-xs text-blue-200">Lengkapi data untuk keperluan administrasi dan keamanan.</p></div>
              <button onClick={() => setEditingBerkas(null)} className="text-blue-300 hover:text-white font-bold text-2xl transition-colors">&times;</button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 bg-gray-50">
              <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-bold text-gray-700 mb-1">Nama Lengkap Sesuai KTP</label>
                  <input type="text" value={editForm.nama || ''} onChange={(e) => setEditForm({...editForm, nama: toTitleCase(e.target.value)})} className="w-full border border-gray-300 rounded p-2 text-base outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"/>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Jenis Kelamin</label>
                  <select value={editForm.jenisKelamin || ''} onChange={(e) => setEditForm({...editForm, jenisKelamin: e.target.value})} className="w-full border border-gray-300 rounded p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 shadow-sm">
                    <option value="" disabled hidden>- Pilih -</option><option value="Laki-laki">Laki-laki ♂️</option><option value="Perempuan">Perempuan ♀️</option><option value="Lain-lain">Lain-lain ⚪</option>
                  </select>
                </div>
                
                <div className="flex flex-col">
                   <label className="block text-xs font-bold text-gray-700 mb-1">Identitas Resmi</label>
                   <div className="flex gap-1 h-[36px]">
                     <select value={editTipeId} onChange={(e) => setEditTipeId(e.target.value)} className="w-1/3 bg-gray-50 border border-gray-300 rounded-l p-1 text-xs font-bold outline-none focus:border-blue-500">
                       <option value="KTP">KTP</option><option value="SIM">SIM</option><option value="PASPOR">Paspor</option>
                     </select>
                     <input type="text" value={editNomorId} onChange={(e) => setEditNomorId(e.target.value)} placeholder="Nomor ID..." className="w-2/3 border border-gray-300 rounded-r p-2 text-sm font-mono outline-none focus:ring-1 focus:ring-blue-500 shadow-sm" />
                   </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Tanggal Lahir</label>
                  <CustomDateTimePicker value={editForm.tanggalLahir || ''} onChange={(val) => setEditForm({...editForm, tanggalLahir: val})} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Nomor WhatsApp Aktif</label>
                  <input type="text" value={editForm.noTelp || ''} onChange={(e) => setEditForm({...editForm, noTelp: e.target.value.replace(/[^0-9+]/g, '')})} placeholder="0812..." className="w-full border border-gray-300 rounded p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"/>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Profesi / Pekerjaan</label>
                  <input type="text" value={editForm.profesi || ''} onChange={(e) => setEditForm({...editForm, profesi: toTitleCase(e.target.value)})} className="w-full border border-gray-300 rounded p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"/>
                </div>
                
                <div className="sm:col-span-1 pt-2 border-t border-gray-100">
                  <label className="block text-xs font-bold text-gray-700 mb-1">Kota Asal (Pilih dari Daftar)</label>
                  <input type="text" value={editForm.tamuDari || ''} readOnly onClick={() => setIsCityModalOpen(true)} className="w-full border border-gray-300 rounded p-2 text-sm bg-blue-50 cursor-pointer font-medium text-blue-800 shadow-sm" placeholder="Klik untuk memilih kota..." />
                </div>
                <div className="sm:col-span-1 pt-2 border-t border-gray-100">
                  <label className="block text-xs font-bold text-gray-700 mb-1">Alamat Kantor / Instansi</label>
                  <input type="text" value={editForm.alamatKantor || ''} onChange={(e) => setEditForm({...editForm, alamatKantor: toTitleCase(e.target.value)})} className="w-full border border-gray-300 rounded p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 shadow-sm" placeholder="Contoh: PT. Bintang / ITS"/>
                </div>
                
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-gray-700 mb-1">Alamat Domisili / Tempat Tinggal Lengkap</label>
                  <textarea rows="3" value={editForm.alamatLengkap || ''} onChange={(e) => setEditForm({...editForm, alamatLengkap: e.target.value})} className="w-full border border-gray-300 rounded p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 shadow-sm" placeholder="Contoh: Perum. Anggrek Blok B No. 12, RT 01/RW 02..."></textarea>
                  
                  <div className="sm:col-span-2 pt-4 mt-2 border-t border-gray-200">
                    <label className="block text-sm font-bold text-gray-800 mb-3">📅 Rekam Jejak Kunjungan ({editingBerkas.totalKunjungan} Kali)</label>
                    <div className="max-h-40 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                      {editingBerkas.riwayatInap?.map((riwayat, idx) => {
                        const tglMulai = riwayat.checkIn || riwayat.periodeStart || riwayat.waktuInput;
                        const tglSelesai = riwayat.checkOut || riwayat.periodeEnd;
                        const isKos = riwayat.dbType === 'kos' || riwayat.tipeInap === 'kos';
                        
                        let teksTanggal = '-';
                        if (tglMulai) {
                          const formatStr = (tgl) => new Date(tgl).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: '2-digit' });
                          const strMulai = formatStr(tglMulai);
                          if (tglSelesai) {
                            const isAktif = new Date(tglSelesai) > new Date();
                            teksTanggal = isAktif ? `${strMulai} s/d Sekarang` : `${strMulai} - ${formatStr(tglSelesai)}`;
                          } else { teksTanggal = strMulai; }
                        }

                        return (
                          <div key={riwayat.id || idx} className="bg-gray-50 p-3 rounded-lg border border-gray-200 shadow-sm flex justify-between items-center text-xs">
                            <div className="flex flex-col gap-1">
                              <span className="font-bold text-gray-700">{isKos ? 'Kos Bulanan' : 'Harian / Transit'} <span className="text-blue-600">#{riwayat.noKamar || riwayat.roomNumber}</span></span>
                              <span className="text-gray-500">ID: {riwayat.id}</span>
                            </div>
                            <div className="text-right flex flex-col gap-1">
                              <span className="font-bold text-gray-800">{teksTanggal}</span>
                              <span className="text-[10px] text-gray-400 font-medium">{riwayat.pembayaran?.jumlahKamar ? `Rp ${riwayat.pembayaran.jumlahKamar.toLocaleString('id-ID')}` : '-'}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 bg-white border-t border-gray-200 flex justify-end gap-3 shrink-0">
              <button onClick={() => setEditingBerkas(null)} className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 rounded-md font-bold text-sm border border-gray-300 transition-colors">Tutup Batal</button>
              <button onClick={handleSimpanBerkas} disabled={isSaving} className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-bold text-sm shadow-md transition-colors">{isSaving ? 'Menyimpan...' : '💾 Simpan Biodata'}</button>
            </div>
          </div>
        </div>
      )}

      {isCityModalOpen && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[80vh]">
            <div className="p-4 bg-blue-600 text-white flex justify-between items-center"><h3 className="font-bold">Pilih Kota Asal</h3><button onClick={() => setIsCityModalOpen(false)} className="text-white font-bold text-xl">&times;</button></div>
            <div className="p-4 border-b"><input type="text" placeholder="Cari kota..." value={citySearch} onChange={(e) => { setCitySearch(e.target.value); setCityPage(1); }} className="w-full border border-gray-300 rounded-md p-2 outline-none focus:ring-2 focus:ring-blue-500"/></div>
            <div className="overflow-y-auto p-4 flex-1">{paginatedCities.length > 0 ? (<div className="grid grid-cols-1 gap-2">{paginatedCities.map((kota, idx) => (<button key={idx} onClick={() => handleSelectCity(kota)} className="text-left w-full p-2 hover:bg-blue-50 rounded-md transition-colors">{kota}</button>))}</div>) : <p className="text-center text-gray-500 py-4">Kota tidak ditemukan.</p>}</div>
            <div className="p-4 border-t bg-gray-50 flex justify-between items-center"><button disabled={cityPage === 1} onClick={() => setCityPage(p => p - 1)} className={`px-3 py-1 rounded-md text-sm ${cityPage === 1 ? 'bg-gray-200 text-gray-400' : 'bg-blue-100 text-blue-700'}`}>Sebelumnya</button><span className="text-sm text-gray-600">Hal {cityPage} dari {totalCityPages}</span><button disabled={cityPage === totalCityPages} onClick={() => setCityPage(p => p + 1)} className={`px-3 py-1 rounded-md text-sm ${cityPage === totalCityPages ? 'bg-gray-200 text-gray-400' : 'bg-blue-100 text-blue-700'}`}>Selanjutnya</button></div>
          </div>
        </div>
      )}

    </div>
  );
}
// [END: DatabasePelangganModule]