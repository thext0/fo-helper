// [START: RestoranPOSModule]
import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { useDialog } from './DialogProvider';
import { useAppData } from '../context/DataProvider';

const generateTimestamp = () => Date.now();

export default function RestoranPOS() {
  const { alert, toast } = useDialog();
  const { data: dbData, loading: isDbLoading, refreshData } = useAppData();

  const { menuItems, activeRooms } = useMemo(() => {
    if (!dbData) return { menuItems: [], activeRooms: [] };

    const rawMenu = dbData.menuResto || [
      { id: 'M1', nama: 'Nasi Goreng Spesial', kategori: 'Makanan', harga: 35000 },
      { id: 'M2', nama: 'Mie Goreng Seafood', kategori: 'Makanan', harga: 40000 },
      { id: 'B1', nama: 'Es Teh Manis', kategori: 'Minuman', harga: 10000 },
      { id: 'B2', nama: 'Kopi Hitam', kategori: 'Minuman', harga: 15000 },
      { id: 'S1', nama: 'Kentang Goreng', kategori: 'Snack', harga: 20000 }
    ];

    const s = dbData.settings || {};
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

    return { 
      menuItems: rawMenu, 
      activeRooms: activeTx.map(tx => tx.noKamar || tx.roomNumber).sort()
    };
  }, [dbData]);

  const [cart, setCart] = useState([]);
  const [kategoriFilter, setKategoriFilter] = useState('Semua');
  const [isSaving, setIsSaving] = useState(false);
  
  const [checkoutModal, setCheckoutModal] = useState(false);
  const [tipePesanan, setTipePesanan] = useState('Dine-In'); 
  const [metodeBayar, setMetodeBayar] = useState('Cash'); 
  const [targetKamar, setTargetKamar] = useState('');

  const kategoriList = ['Semua', ...new Set(menuItems.map(m => m.kategori))];
  const filteredMenu = kategoriFilter === 'Semua' ? menuItems : menuItems.filter(m => m.kategori === kategoriFilter);
  const totalCart = cart.reduce((sum, item) => sum + (item.harga * item.qty), 0);

  // Evaluasi dinamis apakah input kamar dibutuhkan
  const isTargetKamarRequired = metodeBayar === 'Tagih Kamar' || tipePesanan === 'Room Service';

  const handleAddToCart = (item) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) {
        return prev.map(i => i.id === item.id ? { ...i, qty: i.qty + 1 } : i);
      }
      return [...prev, { ...item, qty: 1 }];
    });
  };

  const handleUpdateQty = (id, delta) => {
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const newQty = item.qty + delta;
        return newQty > 0 ? { ...item, qty: newQty } : null;
      }
      return item;
    }).filter(Boolean));
  };

  const handleProsesPesanan = async () => {
    if (cart.length === 0) return;
    
    if (isTargetKamarRequired && !targetKamar) {
      await alert("Pilih nomor kamar untuk menagihkan pesanan atau tujuan Room Service.", "Validasi");
      return;
    }

    setIsSaving(true);
    try {
      const currentDb = JSON.parse(JSON.stringify(dbData));
      
      if (!currentDb.riwayatResto) currentDb.riwayatResto = [];
      if (!currentDb.menuResto) currentDb.menuResto = menuItems;

      const orderId = `RST-${generateTimestamp()}`;
      const rincianPesanan = cart.map(c => `${c.qty}x ${c.nama}`).join(', ');

      const pesananBaru = {
        id: orderId,
        waktu: new Date().toISOString(),
        tipe: tipePesanan,
        metodeBayar: metodeBayar === 'Tagih Kamar' ? 'Tagih Kamar (Belum Lunas)' : metodeBayar, // Penanda belum lunas di riwayat resto
        kamar: isTargetKamarRequired ? targetKamar : '-',
        items: cart,
        total: totalCart
      };

      currentDb.riwayatResto.push(pesananBaru);

      // Hanya suntik ke billing In-House jika metodenya 'Tagih Kamar'
      if (metodeBayar === 'Tagih Kamar') {
        let txDitemukan = false;
        
        const idxHarian = (currentDb.dailyTransactions || []).findIndex(tx => 
          !tx.isVoid && tx.statusDeposit === 'Belum Refund' && tx.noKamar === targetKamar
        );
        if (idxHarian !== -1) {
          if (!currentDb.dailyTransactions[idxHarian].pembayaran.tambahan) currentDb.dailyTransactions[idxHarian].pembayaran.tambahan = [];
          currentDb.dailyTransactions[idxHarian].pembayaran.tambahan.push({
            id: generateTimestamp(),
            nama: `Resto (${tipePesanan}): ${rincianPesanan}`,
            metode: 'Belum Lunas', // <-- UBAH KE "BELUM LUNAS" AGAR TIDAK DIANGGAP SUDAH DIBAYAR DI FO
            jumlah: totalCart,
            qty: 1
          });
          txDitemukan = true;
        }

        if (!txDitemukan) {
          const idxKos = (currentDb.activeKost || []).findIndex(tx => 
            !tx.isVoid && tx.statusDeposit === 'Belum Refund' && tx.roomNumber === targetKamar
          );
          if (idxKos !== -1) {
            if (!currentDb.activeKost[idxKos].pembayaran.tambahan) currentDb.activeKost[idxKos].pembayaran.tambahan = [];
            currentDb.activeKost[idxKos].pembayaran.tambahan.push({
              id: generateTimestamp(),
              nama: `Resto (${tipePesanan}): ${rincianPesanan}`,
              metode: 'Belum Lunas', // <-- UBAH KE "BELUM LUNAS"
              jumlah: totalCart,
              qty: 1
            });
          }
        }
      }

      const res = await fetch('http://localhost:5000/api/data/save', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify(currentDb) 
      });
      
      const result = await res.json();
      if (result.success) {
        refreshData();
        toast(metodeBayar === 'Tagih Kamar' ? 'Pesanan berhasil ditambahkan ke tagihan kamar (Belum Lunas).' : 'Pesanan lunas tersimpan.', "success");
        setCart([]);
        setCheckoutModal(false);
      } else {
        await alert("Gagal menyimpan pesanan.", "Error Simpan");
      }
    } catch (error) {
      console.error(error);
      await alert("Terjadi kesalahan jaringan.", "Error");
    } finally {
      setIsSaving(false);
    }
  };

  if (isDbLoading) return <div className="text-center p-10 font-medium text-gray-500">Memuat data restoran...</div>;

  return (
    <div className="flex flex-col md:flex-row gap-6 animate-fade-in h-[calc(100vh-140px)]">
      
      <div className="w-full md:w-2/3 flex flex-col bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-5 border-b border-gray-100 bg-gray-50 flex justify-between items-center shrink-0">
          <div>
            <h2 className="text-xl font-bold text-gray-800">🍽️ Restoran POS</h2>
            <p className="text-xs text-gray-500 mt-1">Sistem kasir dan Room Service</p>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 max-w-[50%]">
            {kategoriList.map(kat => (
              <button 
                key={kat} 
                onClick={() => setKategoriFilter(kat)}
                className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${kategoriFilter === kat ? 'bg-orange-600 text-white' : 'bg-gray-200 text-gray-600 hover:bg-orange-100 hover:text-orange-700'}`}
              >
                {kat}
              </button>
            ))}
          </div>
        </div>

        <div className="p-5 flex-1 overflow-y-auto">
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredMenu.map(item => (
              <div 
                key={item.id} 
                onClick={() => handleAddToCart(item)}
                className="border border-gray-200 rounded-xl p-4 flex flex-col justify-between cursor-pointer hover:border-orange-400 hover:shadow-md transition-all group bg-white"
              >
                <div>
                  <span className="text-[9px] font-black uppercase text-orange-500 bg-orange-50 px-2 py-0.5 rounded tracking-widest">{item.kategori}</span>
                  <h3 className="font-bold text-gray-800 mt-2 leading-tight group-hover:text-orange-600 transition-colors">{item.nama}</h3>
                </div>
                <div className="mt-4 font-black text-gray-900">
                  Rp {item.harga.toLocaleString('id-ID')}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="w-full md:w-1/3 bg-gray-900 text-white rounded-xl shadow-xl border border-gray-800 flex flex-col overflow-hidden">
        <div className="p-5 border-b border-gray-800 shrink-0">
          <h2 className="text-lg font-bold flex justify-between items-center">
            <span>🛒 Keranjang</span>
            <span className="text-xs bg-gray-800 px-2 py-1 rounded text-orange-400">{cart.reduce((s,i)=>s+i.qty,0)} Item</span>
          </h2>
        </div>
        
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-500 opacity-60">
              <span className="text-5xl mb-3">🍽️</span>
              <p className="text-sm">Keranjang masih kosong</p>
            </div>
          ) : (
            cart.map(item => (
              <div key={item.id} className="bg-gray-800 rounded-lg p-3 flex justify-between items-center border border-gray-700">
                <div className="flex-1 pr-2">
                  <h4 className="font-bold text-sm text-gray-100">{item.nama}</h4>
                  <p className="text-xs text-orange-400 font-medium mt-0.5">Rp {item.harga.toLocaleString('id-ID')}</p>
                </div>
                <div className="flex items-center gap-3 bg-gray-900 rounded-lg border border-gray-700 p-1">
                  <button onClick={() => handleUpdateQty(item.id, -1)} className="w-6 h-6 flex items-center justify-center bg-gray-700 rounded hover:bg-gray-600 font-bold">&minus;</button>
                  <span className="text-sm font-black w-4 text-center">{item.qty}</span>
                  <button onClick={() => handleUpdateQty(item.id, 1)} className="w-6 h-6 flex items-center justify-center bg-orange-600 rounded hover:bg-orange-500 font-bold">+</button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="p-5 bg-gray-800 border-t border-gray-700 shrink-0">
          <div className="flex justify-between items-end mb-4">
            <span className="text-gray-400 text-sm font-bold uppercase tracking-widest">Total Bayar</span>
            <span className="text-3xl font-black text-white">Rp {totalCart.toLocaleString('id-ID')}</span>
          </div>
          <button 
            disabled={cart.length === 0} 
            onClick={() => { setTipePesanan('Dine-In'); setMetodeBayar('Cash'); setTargetKamar(''); setCheckoutModal(true); }}
            className={`w-full py-3.5 rounded-xl font-black text-lg transition-colors shadow-lg ${cart.length === 0 ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-orange-600 hover:bg-orange-500 text-white'}`}
          >
            Proses Pesanan
          </button>
        </div>
      </div>

      {checkoutModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden text-gray-800">
            <div className="p-5 bg-orange-600 text-white flex justify-between items-center">
              <h3 className="font-bold text-lg">💳 Pembayaran Pesanan</h3>
              <button onClick={() => setCheckoutModal(false)} className="text-white/70 hover:text-white font-bold text-2xl">&times;</button>
            </div>
            
            <div className="p-6 space-y-5 bg-gray-50">
              
              <div className="bg-orange-50 text-orange-800 p-4 rounded-xl text-center border border-orange-200 shadow-inner">
                 <p className="text-xs font-bold uppercase tracking-widest opacity-80 mb-1">Tagihan Restoran</p>
                 <h2 className="text-3xl font-black">Rp {totalCart.toLocaleString('id-ID')}</h2>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Tipe Pesanan</label>
                  <select value={tipePesanan} onChange={(e) => setTipePesanan(e.target.value)} className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-orange-500 font-bold text-sm bg-white">
                    <option value="Dine-In">Makan di Tempat</option>
                    <option value="Room Service">Room Service (Antar Kamar)</option>
                    <option value="Takeaway">Bungkus / Takeaway</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Metode Bayar</label>
                  <select value={metodeBayar} onChange={(e) => setMetodeBayar(e.target.value)} className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-orange-500 font-bold text-sm bg-white">
                    <option value="Cash">Tunai (Cash)</option>
                    <option value="QRIS">QRIS / e-Wallet</option>
                    <option value="Tagih Kamar">Tagih ke Kamar</option>
                  </select>
                </div>
              </div>

              {isTargetKamarRequired && (
                <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl animate-fade-in shadow-sm">
                  <label className="block text-xs font-bold text-blue-800 uppercase mb-2">Pilih Kamar Tujuan (In-House)</label>
                  {activeRooms.length === 0 ? (
                    <p className="text-sm text-red-600 font-bold">⚠️ Tidak ada tamu aktif saat ini.</p>
                  ) : (
                    <select value={targetKamar} onChange={(e) => setTargetKamar(e.target.value)} className="w-full border border-blue-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500 font-bold text-sm bg-white text-blue-900">
                      <option value="" disabled hidden>- Pilih Kamar -</option>
                      {activeRooms.map(rm => <option key={rm} value={rm}>Kamar #{rm}</option>)}
                    </select>
                  )}
                  {metodeBayar === 'Tagih Kamar' && (
                     <p className="text-[10px] text-blue-600 mt-2 font-medium">Tagihan akan masuk ke rincian "Tambahan" di menu In-House Folio dengan label <strong className="text-red-600 uppercase">Belum Lunas</strong>.</p>
                  )}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-gray-200 flex justify-end gap-3 bg-white">
              <button onClick={() => setCheckoutModal(false)} className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-bold hover:bg-gray-200">Batal</button>
              <button onClick={handleProsesPesanan} disabled={isSaving} className="px-6 py-2.5 bg-orange-600 text-white rounded-lg font-bold shadow-md hover:bg-orange-700 transition-colors">
                {isSaving ? 'Memproses...' : (metodeBayar === 'Tagih Kamar' ? 'Kirim Tagihan' : 'Selesaikan Pembayaran')}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
// [END: RestoranPOSModule]