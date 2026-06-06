import { useState, useEffect } from 'react';
import { DAFTAR_KOTA_INDONESIA } from '../data/kotaIndonesia';

const toTitleCase = (str) => str.toLowerCase().replace(/\b\w/g, s => s.toUpperCase());

export default function DatabasePelanggan() {
  const [loading, setLoading] = useState(true);
  const [semuaPelanggan, setSemuaPelanggan] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');

  const [editingBerkas, setEditingBerkas] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const [isCityModalOpen, setIsCityModalOpen] = useState(false);
  const [citySearch, setCitySearch] = useState('');
  const [cityPage, setCityPage] = useState(1);

useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const res = await fetch('http://localhost:5000/api/data');
        if (!res.ok) throw new Error("Gagal memuat data");
        const data = await res.json();
        
        // 1. Ambil semua data mentah dan urutkan dari yang terbaru
        const rawData = [
          ...(data.dailyTransactions || []).map(tx => ({ ...tx, dbType: 'harian' })),
          ...(data.activeKost || []).map(kos => ({ ...kos, dbType: 'kos' }))
        ].sort((a, b) => new Date(b.waktuInput) - new Date(a.waktuInput));

        // 2. Grouping berdasarkan Nama (Case Insensitive)
        const groupedData = [];
        const map = new Map();

        rawData.forEach(item => {
          const key = (item.nama || '').toLowerCase().trim();
          if (!key) return;

          if (!map.has(key)) {
            // Jika nama belum ada, buat entri baru dengan riwayat
            map.set(key, {
              ...item,
              totalKunjungan: 1,
              riwayatInap: [item]
            });
            groupedData.push(map.get(key));
          } else {
            // Jika nama sudah ada, tambahkan ke riwayat dan update total
            const existing = map.get(key);
            existing.totalKunjungan += 1;
            existing.riwayatInap.push(item);
            
            // Auto-fill kontak/NIK jika transaksi lama kosong tapi transaksi baru ada
            if (!existing.noTelp && item.noTelp) existing.noTelp = item.noTelp;
            if (!existing.nik && item.nik) existing.nik = item.nik;
            if (!existing.alamatLengkap && item.alamatLengkap) existing.alamatLengkap = item.alamatLengkap;
          }
        });

        setSemuaPelanggan(groupedData);
      } catch (error) { console.error("Gagal mengambil data pelanggan:", error); } finally { setLoading(false); }
    };
    loadData();
  }, [refreshTrigger]);

  const openBerkasModal = (item) => {
    setEditingBerkas(item); 
    setEditForm({ ...item }); 
  };

  const handleSimpanBerkas = async () => {
    setIsSaving(true);
    try {
      const res = await fetch('http://localhost:5000/api/data');
      const dbData = await res.json();

      if (editingBerkas.dbType === 'harian') {
        const index = dbData.dailyTransactions.findIndex(tx => tx.id === editingBerkas.id);
        if (index !== -1) dbData.dailyTransactions[index] = { ...dbData.dailyTransactions[index], ...editForm };
      } else {
        const index = dbData.activeKost.findIndex(kos => kos.id === editingBerkas.id);
        if (index !== -1) dbData.activeKost[index] = { ...dbData.activeKost[index], ...editForm };
      }

      const postRes = await fetch('http://localhost:5000/api/data/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dbData) });
      const result = await postRes.json();
      if (result.success) { setEditingBerkas(null); setRefreshTrigger(prev => prev + 1); } 
      else { alert("Gagal menyimpan berkas: " + result.error); }
    } catch (error) { console.error(error); alert("Terjadi kesalahan jaringan."); } finally { setIsSaving(false); }
  };

  const filteredPelanggan = semuaPelanggan.filter(p => 
    (p.nama && p.nama.toLowerCase().includes(searchTerm.toLowerCase())) || 
    (p.noTelp && p.noTelp.includes(searchTerm)) ||
    (p.nik && p.nik.includes(searchTerm))
  );

  const filteredCities = DAFTAR_KOTA_INDONESIA.filter(kota => kota.toLowerCase().includes(citySearch.toLowerCase()));
  const totalCityPages = Math.ceil(filteredCities.length / 20) || 1;
  const paginatedCities = filteredCities.slice((cityPage - 1) * 20, cityPage * 20);
  const handleSelectCity = (kota) => { setEditForm({...editForm, tamuDari: kota}); setIsCityModalOpen(false); setCitySearch(''); setCityPage(1); };

  if (loading) return <div className="text-center p-10 text-gray-500 italic">Memuat database pelanggan...</div>;

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div className="bg-white p-4 rounded-md shadow-sm border border-gray-200 flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-800">👥 Database Pelanggan Terpadu</h2>
          <p className="text-sm text-gray-500">Buku Register Tamu: Identitas Pribadi, KTP, dan Kontak.</p>
        </div>
        <div className="w-full md:w-1/3">
          <input type="text" placeholder="🔍 Cari Nama, NIK, atau No. Telepon..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full border border-gray-300 rounded-md p-3 bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none" />
        </div>
      </div>

      <div className="bg-white rounded-md shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-100 text-gray-700 border-b border-gray-300">
              <tr>
                <th className="p-4 font-bold w-1/3">Nama Lengkap & Tipe</th>
                <th className="p-4 font-bold">Kontak Terhubung</th>
                <th className="p-4 font-bold">Identitas KTP & Domisili</th>
                <th className="p-4 font-bold text-center w-36">Pengaturan</th>
              </tr>
            </thead>
            <tbody>
              {filteredPelanggan.length === 0 ? (<tr><td colSpan="4" className="p-8 text-center text-gray-500 italic">Tidak ada data pelanggan yang cocok.</td></tr>) : (
                filteredPelanggan.map((p) => (
                  <tr key={p.id} className="border-b border-gray-100 hover:bg-blue-50/30 transition-colors">
                    <td className="p-4">
                      <div className="font-bold text-gray-900 text-base">{p.nama}</div>
                      <div className="mt-1 flex flex-wrap gap-2">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${p.dbType === 'harian' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                          {p.dbType === 'harian' ? 'Tamu Harian' : 'Penghuni Kos'}
                        </span>
                        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-purple-100 text-purple-700 shadow-sm border border-purple-200">
                          {p.totalKunjungan} Kunjungan
                        </span>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <span>📱</span> <span className="font-medium text-gray-800">{p.noTelp || <span className="text-gray-400 italic">Kosong</span>}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="font-mono text-xs text-gray-600 mb-1">NIK: <span className="font-bold text-gray-800">{p.nik || '-'}</span></div>
                      <div className="text-xs text-gray-500 truncate max-w-[200px]">
                        📍 {p.tamuDari || 'Kota Asal Kosong'}
                      </div>
                      {p.dbType === 'kos' && (
                        <div className="text-[10px] text-gray-400 truncate max-w-[200px] mt-0.5">
                          🏢 {p.alamatKantor || 'Instansi Kosong'}
                        </div>
                      )}
                    </td>
                    <td className="p-4 text-center">
                      <button onClick={() => openBerkasModal(p)} className="bg-blue-600 hover:bg-blue-700 text-white w-full py-2 rounded text-sm font-bold shadow-sm transition-colors">
                        📄 Kelola Biodata
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* POPUP: MODAL BERKAS IDENTITAS */}
      {editingBerkas && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 bg-blue-800 text-white flex justify-between items-center shrink-0">
              <div>
                <h3 className="font-bold text-lg">📄 Form Register Tamu</h3>
                <p className="text-xs text-blue-200">Lengkapi data untuk keperluan administrasi dan keamanan.</p>
              </div>
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
                  <select value={editForm.jenisKelamin || 'Laki-laki'} onChange={(e) => setEditForm({...editForm, jenisKelamin: e.target.value})} className="w-full border border-gray-300 rounded p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 shadow-sm">
                    <option value="Laki-laki">Laki-laki</option>
                    <option value="Perempuan">Perempuan</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">NIK KTP (16 Digit)</label>
                  <input type="text" value={editForm.nik || ''} onChange={(e) => setEditForm({...editForm, nik: e.target.value.replace(/[^0-9]/g, '')})} placeholder="357..." maxLength="16" className="w-full border border-gray-300 rounded p-2 text-sm font-mono outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"/>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Tanggal Lahir</label>
                  <input type="date" value={editForm.tanggalLahir || ''} onChange={(e) => setEditForm({...editForm, tanggalLahir: e.target.value})} className="w-full border border-gray-300 rounded p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"/>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Nomor WhatsApp Aktif</label>
                  <input type="text" value={editForm.noTelp || ''} onChange={(e) => setEditForm({...editForm, noTelp: e.target.value})} placeholder="0812..." className="w-full border border-gray-300 rounded p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"/>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Profesi / Pekerjaan</label>
                  <input type="text" value={editForm.profesi || ''} onChange={(e) => setEditForm({...editForm, profesi: toTitleCase(e.target.value)})} className="w-full border border-gray-300 rounded p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"/>
                </div>
                
                <div className={editingBerkas.dbType === 'harian' ? "sm:col-span-2 pt-2 border-t border-gray-100" : "sm:col-span-1 pt-2 border-t border-gray-100"}>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Kota Asal (Pilih dari Daftar)</label>
                  <input type="text" value={editForm.tamuDari || ''} readOnly onClick={() => setIsCityModalOpen(true)} className="w-full border border-gray-300 rounded p-2 text-sm bg-blue-50 cursor-pointer font-medium text-blue-800 shadow-sm" placeholder="Klik untuk memilih kota..." />
                </div>
                
                {editingBerkas.dbType === 'kos' && (
                  <div className="sm:col-span-1 pt-2 border-t border-gray-100">
                    <label className="block text-xs font-bold text-gray-700 mb-1">Alamat Kantor / Instansi</label>
                    <input type="text" value={editForm.alamatKantor || ''} onChange={(e) => setEditForm({...editForm, alamatKantor: toTitleCase(e.target.value)})} className="w-full border border-gray-300 rounded p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 shadow-sm" placeholder="Contoh: PT. Bintang / ITS"/>
                  </div>
                )}
                
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-gray-700 mb-1">Alamat Domisili / Tempat Tinggal Lengkap</label>
                  <textarea rows="3" value={editForm.alamatLengkap || ''} onChange={(e) => setEditForm({...editForm, alamatLengkap: e.target.value})} className="w-full border border-gray-300 rounded p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 shadow-sm" placeholder="Contoh: Perum. Anggrek Blok B No. 12, RT 01/RW 02..."></textarea>
                  
                  {/* SECTION: RIWAYAT KUNJUNGAN */}
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
                          } else {
                            teksTanggal = strMulai;
                          }
                        }

                        return (
                          <div key={riwayat.id || idx} className="bg-gray-50 p-3 rounded-lg border border-gray-200 shadow-sm flex justify-between items-center text-xs">
                            <div className="flex flex-col gap-1">
                              <span className="font-bold text-gray-700">
                                {isKos ? 'Kos Bulanan' : 'Harian / Transit'} <span className="text-blue-600">#{riwayat.noKamar || riwayat.roomNumber}</span>
                              </span>
                              <span className="text-gray-500">ID: {riwayat.id}</span>
                            </div>
                            <div className="text-right flex flex-col gap-1">
                              <span className="font-bold text-gray-800">{teksTanggal}</span>
                              <span className="text-[10px] text-gray-400 font-medium">
                                {riwayat.pembayaran?.jumlahKamar ? `Rp ${riwayat.pembayaran.jumlahKamar.toLocaleString('id-ID')}` : '-'}
                              </span>
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

      {/* MODAL KOTA (DIPANGGIL DARI DALAM MODAL BERKAS) */}
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