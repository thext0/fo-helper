// [START: HousekeepingModule]
import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { useDialog } from './DialogProvider';
import { useAppData } from '../context/DataProvider';

const generateTimestamp = () => Date.now();

export default function Housekeeping() {
  const { alert, toast, prompt } = useDialog();
  const { data: dbData, loading: isDbLoading, refreshData } = useAppData();

  const { floors, roomStatuses, activeRooms } = useMemo(() => {
    if (!dbData) return { floors: [], roomStatuses: {}, activeRooms: [] };

    const s = dbData.settings || {};
    const statuses = dbData.roomStatuses || {};
    
    const rHour = parseInt((s.rolloverTime || '12:00').split(':')[0], 10);
    const now = new Date();
    
    const activeTx = [
      ...(dbData.dailyTransactions || []).map(tx => ({ ...tx, type: 'harian' })), 
      ...(dbData.activeKost || []).map(k => ({ ...k, type: 'kos' }))
    ].filter(tx => {
      if (tx.isVoid) return false;
      const coDate = tx.type === 'harian' ? new Date(tx.checkOut) : new Date((tx.periodeEnd || format(now, 'yyyy-MM-dd')) + `T${String(rHour).padStart(2,'0')}:00:00`);
      return (now <= coDate) || (tx.statusDeposit === 'Belum Refund');
    });

    const occupied = activeTx.map(tx => (tx.noKamar || tx.roomNumber).toString().trim());

    return { floors: s.floors || [], roomStatuses: statuses, activeRooms: occupied };
  }, [dbData]);

  const [filter, setFilter] = useState('Semua');
  const [isSaving, setIsSaving] = useState(false);
  const [modal, setModal] = useState({ isOpen: false, roomNo: '', targetStatus: 'Bersih', note: '' });

  const getStatusInfo = (roomNo) => {
    return roomStatuses[roomNo] || { status: 'Bersih', note: '', updatedAt: null };
  };

  const handleOpenModal = (roomNo) => {
    const info = getStatusInfo(roomNo);
    setModal({ isOpen: true, roomNo, targetStatus: info.status, note: info.note || '' });
  };

  const handleSimpanStatus = async () => {
    const dbStatus = getStatusInfo(modal.roomNo).status;
    let finalNote = modal.note;
    let logPayload = null;

    // LOGIKA AUDIT TRAIL PIC (Lapis 1: Cleaner & Lapis 2: Checker)
    // BUG FIX: Menggunakan string 'Dibersihkan' secara konsisten
    if (modal.targetStatus === 'Dibersihkan' && dbStatus !== 'Dibersihkan') {
      const jenisPembersihan = dbStatus === 'Minta Dibersihkan' ? 'MUR' : 'Rutin';
      const picName = await prompt(`Masukkan nama Petugas (Cleaner) untuk pembersihan ${jenisPembersihan}:`, "Log Mulai Pembersihan");
      
      if (!picName) return; 
      
      const timeStr = format(new Date(), 'dd/MM/yy HH:mm');
      const actionLog = `[Dibersihkan (${jenisPembersihan}) oleh: ${picName.trim()} pada ${timeStr}]`;
      
      logPayload = { 
        id: generateTimestamp(), 
        kamar: modal.roomNo, 
        aksi: `Mulai Membersihkan (${jenisPembersihan})`, 
        petugas: picName.trim(), 
        waktu: new Date().toISOString() 
      };

      finalNote = finalNote ? `${finalNote} | ${actionLog}` : actionLog;
    } 
    else if (modal.targetStatus === 'Bersih' && dbStatus !== 'Bersih') {
      const checkerName = await prompt("Masukkan nama Penanggung Jawab (Checker) yang memverifikasi:", "Log Verifikasi Kamar");
      if (!checkerName) return;

      logPayload = { 
        id: generateTimestamp(), 
        kamar: modal.roomNo, 
        aksi: 'Verifikasi Selesai/Bersih', 
        petugas: checkerName.trim(), 
        waktu: new Date().toISOString() 
      };
    }

    setIsSaving(true);
    try {
      const currentDb = JSON.parse(JSON.stringify(dbData));
      if (!currentDb.roomStatuses) currentDb.roomStatuses = {};

      if (modal.targetStatus === 'Bersih') {
        finalNote = ''; 
      }

      currentDb.roomStatuses[modal.roomNo] = {
        status: modal.targetStatus,
        note: finalNote,
        updatedAt: new Date().toISOString()
      };

      const res = await fetch('http://localhost:5000/api/data/save', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify(currentDb) 
      });
      
      const result = await res.json();
      if (result.success) {
        
        if (logPayload) {
          try {
            await fetch('http://localhost:5000/api/hk-logs/save', {
               method: 'POST',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify(logPayload)
            });
          } catch (logErr) {
            console.warn("Peringatan: Gagal menyimpan log HK ke file terpisah", logErr);
          }
        }

        refreshData();
        toast(`Status Kamar #${modal.roomNo} menjadi ${modal.targetStatus === 'Dibersihkan' ? 'Sedang Dibersihkan' : modal.targetStatus}.`, "success");
        setModal({ isOpen: false, roomNo: '', targetStatus: 'Bersih', note: '' });
      } else {
        await alert("Gagal menyimpan data status.", "Error Simpan");
      }
    } catch (error) {
      console.error(error);
      await alert("Terjadi kesalahan jaringan.", "Error");
    } finally {
      setIsSaving(false);
    }
  };

  const stats = { Total: 0, Bersih: 0, Kotor: 0, Dibersihkan: 0, 'Minta Dibersihkan': 0, Rusak: 0, 'In-House': activeRooms.length };

  floors.forEach(f => {
    f.kamar.forEach(k => {
      if (k.no.trim() !== '') {
        stats.Total++;
        const st = getStatusInfo(k.no.trim()).status;
        if (stats[st] !== undefined) stats[st]++;
        else stats.Bersih++; 
      }
    });
  });

  const getStatusColor = (status) => {
    switch(status) {
      case 'Kotor': return { bg: 'bg-red-50', border: 'border-red-300', text: 'text-red-800' };
      case 'Dibersihkan': return { bg: 'bg-yellow-50', border: 'border-yellow-400', text: 'text-yellow-800' };
      case 'Minta Dibersihkan': return { bg: 'bg-purple-50', border: 'border-purple-300', text: 'text-purple-800' };
      case 'Rusak': return { bg: 'bg-gray-100', border: 'border-gray-400', text: 'text-gray-700' };
      default: return { bg: 'bg-green-50', border: 'border-green-300', text: 'text-green-800' };
    }
  };

  const getStatusIcon = (status) => {
    switch(status) {
      case 'Kotor': return '🧹';
      case 'Dibersihkan': return '⏳';
      case 'Minta Dibersihkan': return '🔔';
      case 'Rusak': return '⚠️';
      default: return '✨';
    }
  };

  if (isDbLoading) return <div className="text-center p-10 font-medium text-gray-500">Memuat status kebersihan kamar...</div>;

  const dbStatus = modal.isOpen ? getStatusInfo(modal.roomNo).status : '';
  const isOccupied = modal.isOpen ? activeRooms.includes(modal.roomNo) : false;

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-2">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">🧹 Housekeeping Dashboard</h2>
          <p className="text-sm text-gray-500 mt-1">Pemantauan status fisik dan kebersihan kamar secara real-time.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <div onClick={() => setFilter('Semua')} className={`p-3 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${filter === 'Semua' ? 'bg-gray-800 text-white shadow-md border-gray-800' : 'bg-white text-gray-600 hover:bg-gray-50 border-gray-200'}`}>
          <div className="text-[10px] sm:text-xs font-bold uppercase tracking-wider mb-1">Semua Kamar</div>
          <div className="text-2xl sm:text-3xl font-black">{stats.Total}</div>
        </div>

        <div onClick={() => setFilter('In-House')} className={`p-3 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${filter === 'In-House' ? 'bg-blue-600 text-white shadow-md border-blue-600' : 'bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100'}`}>
          <div className="text-[10px] sm:text-xs font-bold uppercase tracking-wider mb-1 flex justify-between">In-House <span>🛏️</span></div>
          <div className="text-2xl sm:text-3xl font-black">{stats['In-House']}</div>
        </div>

        <div onClick={() => setFilter('Bersih')} className={`p-3 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${filter === 'Bersih' ? 'bg-green-600 text-white shadow-md border-green-600' : 'bg-green-50 text-green-800 border-green-200 hover:bg-green-100'}`}>
          <div className="text-[10px] sm:text-xs font-bold uppercase tracking-wider mb-1 flex justify-between">Bersih <span>✨</span></div>
          <div className="text-2xl sm:text-3xl font-black">{stats.Bersih}</div>
        </div>
        
        <div onClick={() => setFilter('Kotor')} className={`p-3 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${filter === 'Kotor' ? 'bg-red-600 text-white shadow-md border-red-600' : 'bg-red-50 text-red-800 border-red-200 hover:bg-red-100'}`}>
          <div className="text-[10px] sm:text-xs font-bold uppercase tracking-wider mb-1 flex justify-between">Kotor <span>🧹</span></div>
          <div className="text-2xl sm:text-3xl font-black">{stats.Kotor}</div>
        </div>
        
        <div onClick={() => setFilter('Minta Dibersihkan')} className={`p-3 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${filter === 'Minta Dibersihkan' ? 'bg-purple-600 text-white shadow-md border-purple-600' : 'bg-purple-50 text-purple-800 border-purple-200 hover:bg-purple-100'}`}>
          <div className="text-[10px] sm:text-xs font-bold uppercase tracking-wider mb-1 flex justify-between">Minta MUR <span>🔔</span></div>
          <div className="text-2xl sm:text-3xl font-black">{stats['Minta Dibersihkan']}</div>
        </div>
        
        <div onClick={() => setFilter('Dibersihkan')} className={`p-3 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${filter === 'Dibersihkan' ? 'bg-yellow-500 text-white shadow-md border-yellow-500' : 'bg-yellow-50 text-yellow-800 border-yellow-200 hover:bg-yellow-100'}`}>
          <div className="text-[10px] sm:text-xs font-bold uppercase tracking-wider mb-1 flex justify-between">Dibersihkan <span>⏳</span></div>
          <div className="text-2xl sm:text-3xl font-black">{stats.Dibersihkan}</div>
        </div>
        
        <div onClick={() => setFilter('Rusak')} className={`p-3 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${filter === 'Rusak' ? 'bg-gray-600 text-white shadow-md border-gray-600' : 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200'}`}>
          <div className="text-[10px] sm:text-xs font-bold uppercase tracking-wider mb-1 flex justify-between">OOO / Rusak <span>⚠️️</span></div>
          <div className="text-2xl sm:text-3xl font-black">{stats.Rusak}</div>
        </div>
      </div>

      <div className="space-y-6">
        {floors.length === 0 ? (
           <div className="text-center p-10 bg-white border border-dashed border-gray-300 rounded-xl"><p className="text-gray-500 italic">Denah kamar belum diatur di menu Pengaturan.</p></div>
        ) : (
          floors.map(floor => {
            const visibleRooms = floor.kamar.filter(k => k.no.trim() !== '').filter(k => {
              if (filter === 'Semua') return true;
              if (filter === 'In-House') return activeRooms.includes(k.no.trim());
              return getStatusInfo(k.no.trim()).status === filter;
            });

            if (visibleRooms.length === 0) return null;

            return (
              <div key={floor.id} className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                <h4 className="font-extrabold text-gray-800 mb-4 pb-2 border-b-2 border-gray-100 flex items-center gap-2">📍 {floor.nama}</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-5">
                  {visibleRooms.map(kamar => {
                    const roomNo = kamar.no.trim();
                    const info = getStatusInfo(roomNo);
                    const occupied = activeRooms.includes(roomNo);
                    const colors = getStatusColor(info.status);
                    
                    return (
                      <div 
                        key={kamar.id} 
                        onClick={() => handleOpenModal(roomNo)}
                        className={`relative rounded-xl flex flex-col items-center justify-center cursor-pointer transition-transform hover:scale-105 group overflow-hidden ${colors.bg} ${colors.text} ${occupied ? 'border-[3px] border-blue-500 shadow-md pt-8 pb-3 px-3' : `border-2 ${colors.border} shadow-sm pt-5 pb-3 px-3`}`}
                      >
                        {occupied && (
                           <div className="absolute top-0 left-0 right-0 bg-blue-500 text-white text-[10px] font-black py-1 text-center tracking-widest uppercase flex items-center justify-center gap-1">
                             <span className="text-[9px]">🛏️</span> IN-HOUSE
                           </div>
                        )}
                        
                        <span className="text-3xl mb-1 drop-shadow-sm opacity-80 z-10">{getStatusIcon(info.status)}</span>
                        <span className="text-2xl font-black tracking-tight z-10">{roomNo}</span>
                        <span className="text-[10px] font-extrabold uppercase mt-1 tracking-widest opacity-80 bg-white/70 px-2 py-0.5 rounded shadow-sm z-10">{info.status === 'Dibersihkan' ? 'SDG DIBERSIHKAN' : info.status}</span>
                        
                        {info.note && (
                          <div className="absolute bottom-[calc(100%+5px)] left-1/2 -translate-x-1/2 hidden group-hover:block w-36 bg-gray-800 text-white text-[10px] p-2.5 rounded-lg shadow-xl z-50 text-center pointer-events-none">
                            <span className="font-bold text-gray-300 block border-b border-gray-600 pb-1 mb-1">Catatan HK</span>
                            {info.note}
                            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800"></div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

      {modal.isOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden flex flex-col">
            <div className="p-4 bg-gray-800 text-white flex justify-between items-center">
              <h3 className="font-bold">Ubah Status Kamar #{modal.roomNo}</h3>
              <button onClick={() => setModal({ isOpen: false, roomNo: '', targetStatus: 'Bersih', note: '' })} className="text-white/70 hover:text-white font-bold text-xl">&times;</button>
            </div>
            
            <div className="p-6 space-y-5 bg-gray-50">
              
              <div className="bg-white border border-gray-200 p-3 rounded-lg flex items-center justify-between shadow-sm">
                 <span className="text-xs font-bold text-gray-500 uppercase">Status Saat Ini:</span>
                 <span className={`text-xs font-bold px-2 py-1 rounded border ${getStatusColor(dbStatus).bg} ${getStatusColor(dbStatus).text} ${getStatusColor(dbStatus).border}`}>
                   {getStatusIcon(dbStatus)} {dbStatus === 'Dibersihkan' ? 'Sedang Dibersihkan' : dbStatus}
                 </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase mb-2">Pilih Aksi Selanjutnya</label>
                <div className="grid grid-cols-2 gap-2">
                  
                  {(dbStatus === 'Dibersihkan' || dbStatus === 'Kotor' || dbStatus === 'Rusak') && (
                    <button onClick={() => setModal({...modal, targetStatus: 'Bersih'})} className={`py-2 px-3 rounded-lg text-sm font-bold border-2 transition-colors ${modal.targetStatus === 'Bersih' ? 'bg-green-100 border-green-500 text-green-800' : 'bg-white border-gray-200 text-gray-500 hover:border-green-300'}`}>✨ Tandai Bersih</button>
                  )}

                  {(dbStatus === 'Bersih' || dbStatus === 'Rusak') && (
                    <>
                      <button onClick={() => setModal({...modal, targetStatus: 'Kotor'})} className={`py-2 px-3 rounded-lg text-sm font-bold border-2 transition-colors ${modal.targetStatus === 'Kotor' ? 'bg-red-100 border-red-500 text-red-800' : 'bg-white border-gray-200 text-gray-500 hover:border-red-300'}`}>🧹 Kotor</button>
                      {isOccupied && (
                        <button onClick={() => setModal({...modal, targetStatus: 'Minta Dibersihkan'})} className={`py-2 px-3 rounded-lg text-[11px] leading-tight font-bold border-2 transition-colors ${modal.targetStatus === 'Minta Dibersihkan' ? 'bg-purple-100 border-purple-500 text-purple-800' : 'bg-white border-gray-200 text-gray-500 hover:border-purple-300'}`}>🔔 Minta Dibersihkan <br/>(Make Up Room)</button>
                      )}
                    </>
                  )}

                  {(dbStatus === 'Kotor' || dbStatus === 'Minta Dibersihkan' || dbStatus === 'Rusak') && (
                    <button onClick={() => setModal({...modal, targetStatus: 'Dibersihkan'})} className={`py-2 px-3 rounded-lg text-sm font-bold border-2 transition-colors ${modal.targetStatus === 'Dibersihkan' ? 'bg-yellow-100 border-yellow-500 text-yellow-800' : 'bg-white border-gray-200 text-gray-500 hover:border-yellow-300'}`}>⏳ Sedang Dibersihkan</button>
                  )}

                  {dbStatus !== 'Rusak' && (
                    <button onClick={() => setModal({...modal, targetStatus: 'Rusak'})} className={`py-2 px-3 rounded-lg text-sm font-bold border-2 transition-colors ${modal.targetStatus === 'Rusak' ? 'bg-gray-200 border-gray-500 text-gray-800' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-400'}`}>⚠️️ Rusak (OOO)</button>
                  )}

                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase mb-2">Catatan Kerusakan / Keterangan</label>
                <textarea 
                  rows="3" 
                  value={modal.note} 
                  onChange={(e) => setModal({...modal, note: e.target.value})} 
                  placeholder="Opsional. Catatan otomatis terhapus saat diverifikasi Bersih." 
                  className="w-full border border-gray-300 rounded-lg p-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                />
              </div>
            </div>

            <div className="p-4 border-t border-gray-200 flex justify-end gap-3 bg-white">
              <button onClick={() => setModal({ isOpen: false, roomNo: '', targetStatus: 'Bersih', note: '' })} className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-bold hover:bg-gray-200">Batal</button>
              <button onClick={handleSimpanStatus} disabled={isSaving || modal.targetStatus === dbStatus} className={`px-6 py-2.5 text-white rounded-lg font-bold shadow-md transition-colors ${(isSaving || modal.targetStatus === dbStatus) ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}>
                {isSaving ? 'Menyimpan...' : 'Perbarui Status'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
// [END: HousekeepingModule]
