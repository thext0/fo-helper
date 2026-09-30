// [START: InHouseFolioModule]
import { useState, useMemo } from 'react';
import { format, differenceInDays, addDays, subDays, addHours } from 'date-fns';
import { useDialog } from './DialogProvider';
import CustomDateTimePicker from './CustomDateTimePicker';
import { useAppData } from '../context/DataProvider';

export default function InHouseFolio() {
  const { alert, confirm, toast } = useDialog();
  const { data: dbData, loading: isDbLoading, refreshData } = useAppData();

  const { rolloverHour, activeTransactions, floors, otaList, hargaDinamis, weekendDays, rateManagement } = useMemo(() => {
    if (!dbData) return { rolloverHour: 12, activeTransactions: [], floors: [], otaList: [], hargaDinamis: {}, weekendDays: [5,6,0], rateManagement: {} };

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
    
    // BUG FIX ABSOLUT: Transaksi In-House murni HANYA yang depositnya 'Belum Refund'
    const activeTx = allTx.filter(tx => !tx.isVoid && tx.statusDeposit === 'Belum Refund');

    return {
      rolloverHour: rHour, activeTransactions: activeTx, floors: s.floors || [],
      otaList: (s.otaList || []).map(ota => typeof ota === 'string' ? ota : ota.nama),
      hargaDinamis: {
        harianWeekday: s.prices?.harianWeekday || s.prices?.harian || {}, harianWeekend: s.prices?.harianWeekend || s.prices?.harian || {},
        transitWeekday: s.prices?.transitWeekday || s.prices?.transit || {}, transitWeekend: s.prices?.transitWeekend || s.prices?.transit || {},
        kos: s.prices?.kos || {}
      },
      weekendDays: s.weekendDays !== undefined ? s.weekendDays : [5, 6, 0],
      rateManagement: s.rateManagement || { channels: {}, calendarRules: { specialDates: [], dateRanges: [] } }
    };
  }, [dbData]);

  const [searchTerm, setSearchTerm] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Modals State
  const [checkoutModal, setCheckoutModal] = useState({ isOpen: false, data: null });
  const [coStatusDeposit, setCoStatusDeposit] = useState('Sudah Dikembalikan');
  const [coMetodeRefund, setCoMetodeRefund] = useState('Cash');
  const [coAlasanHangus, setCoAlasanHangus] = useState('');

  const [transferModal, setTransferModal] = useState({ isOpen: false, data: null });
  
  const [editModal, setEditModal] = useState({ isOpen: false, data: null });
  const [originalDurasi, setOriginalDurasi] = useState(1);
  const [editDurasiMalam, setEditDurasiMalam] = useState(1);
  const [transitExtendCount, setTransitExtendCount] = useState(0);
  const [editWaktuKeluar, setEditWaktuKeluar] = useState('');
  const [editNoKamar, setEditNoKamar] = useState('');
  const [editStatusDeposit, setEditStatusDeposit] = useState('');
  const [editInfo, setEditInfo] = useState('');
  const [editJenisKelamin, setEditJenisKelamin] = useState(''); 
  const [editExtendFee, setEditExtendFee] = useState(0);
  const [editExtendMethod, setEditExtendMethod] = useState('Cash');

  const [paymentModal, setPaymentModal] = useState({ isOpen: false, data: null });
  const [payDiskon, setPayDiskon] = useState(0);
  const [payTipeDiskon, setPayTipeDiskon] = useState('nominal');
  const [payDetailMetode, setPayDetailMetode] = useState([]);
  const [payTambahan, setPayTambahan] = useState([]);

  const [voidModal, setVoidModal] = useState({ isOpen: false, data: null });
  const [voidReason, setVoidReason] = useState('');

  const resolvePrice = (targetDate, roomType, bookingChannel) => {
    const targetMD = format(targetDate, 'MM-dd'); const isWeekend = weekendDays.includes(targetDate.getDay());
    let finalPrice = isWeekend ? hargaDinamis.harianWeekend?.[roomType] : hargaDinamis.harianWeekday?.[roomType];
    
    if (rateManagement?.calendarRules?.dateRanges) {
       const activeRange = rateManagement.calendarRules.dateRanges.find(r => (r.startDate <= r.endDate) ? (targetMD >= r.startDate && targetMD <= r.endDate) : (targetMD >= r.startDate || targetMD <= r.endDate));
       if (activeRange && activeRange.rates?.[roomType]) finalPrice = activeRange.rates[roomType];
    }
    if (rateManagement?.calendarRules?.specialDates) {
       const special = rateManagement.calendarRules.specialDates.find(s => s.date === targetMD);
       if (special && special.rates?.[roomType]) finalPrice = special.rates[roomType];
    }
    if (bookingChannel && rateManagement?.channels?.[bookingChannel]?.isActive) {
       const chRates = rateManagement.channels[bookingChannel].baseRates;
       if (chRates) finalPrice = isWeekend ? chRates.weekend?.[roomType] : chRates.weekday?.[roomType];
    }
    return { harga: finalPrice || 0 };
  };

  const handleOpenCheckout = (tx) => {
    setCheckoutModal({ isOpen: true, data: tx });
    setCoStatusDeposit(tx.statusDeposit === 'Belum Refund' ? 'Sudah Dikembalikan' : (tx.statusDeposit || 'Sudah Dikembalikan'));
    setCoMetodeRefund(tx.pembayaran?.metodeDeposit || 'Cash'); setCoAlasanHangus('');
  };

  const prosesCheckout = async () => {
    if (coStatusDeposit === 'Deposit Hangus' && !coAlasanHangus) { await alert("Isi alasan deposit dihanguskan.", "Validasi"); return; }
    setIsSaving(true);
    try {
      const currentDb = JSON.parse(JSON.stringify(dbData));
      const targetId = checkoutModal.data.id;
      let isUpdated = false;
      const nowStr = format(new Date(), "yyyy-MM-dd'T'HH:mm"); const todayStr = format(new Date(), "yyyy-MM-dd");
      const depositInfo = coStatusDeposit === 'Deposit Hangus' ? `[Deposit Hangus: ${coAlasanHangus}]` : `[Deposit Di-Refund via ${coMetodeRefund}]`;

      const updateDB = (arr, isKos) => {
        const idx = arr.findIndex(t => t.id === targetId);
        if (idx !== -1) {
          if(isKos) arr[idx].periodeEnd = todayStr; else arr[idx].checkOut = nowStr;
          arr[idx].statusDeposit = coStatusDeposit;
          arr[idx].depositRefundMethod = coStatusDeposit === 'Sudah Dikembalikan' ? coMetodeRefund : '';
          arr[idx].depositHangusReason = coStatusDeposit === 'Deposit Hangus' ? coAlasanHangus : '';
          arr[idx].info = arr[idx].info ? `${arr[idx].info} | ${depositInfo}` : depositInfo;
          isUpdated = true;
        }
      };
      if (checkoutModal.data.type === 'harian') updateDB(currentDb.dailyTransactions, false); else updateDB(currentDb.activeKost, true);

      if (isUpdated) {
        await fetch('http://localhost:5000/api/data/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(currentDb) });
        refreshData(); toast("Tamu berhasil di Check-Out!", "success"); setCheckoutModal({ isOpen: false, data: null });
      }
    } catch (error) { console.error(error); await alert("Kesalahan jaringan.", "Error"); } finally { setIsSaving(false); }
  };

  const handleSelectRoomTransfer = async (kamarBaru, tipeBaru) => {
    const txData = transferModal.data; const oldRoom = txData.noKamar || txData.roomNumber; const oldTipe = txData.type === 'harian' ? txData.tipeKamar : txData.roomType;
    let selisihHarga = 0;
    
    if (oldTipe !== tipeBaru) {
      if (txData.type === 'kos') selisihHarga = (hargaDinamis.kos?.[tipeBaru] || 0) - (hargaDinamis.kos?.[oldTipe] || 0);
      else if (txData.tipeInap === 'transit') {
        let effDate = new Date(txData.checkIn); if (effDate.getHours() < rolloverHour) effDate = subDays(effDate, 1);
        const isWe = weekendDays.includes(effDate.getDay());
        const oldH = isWe ? (hargaDinamis.transitWeekend?.[oldTipe] || 0) : (hargaDinamis.transitWeekday?.[oldTipe] || 0);
        const newH = isWe ? (hargaDinamis.transitWeekend?.[tipeBaru] || 0) : (hargaDinamis.transitWeekday?.[tipeBaru] || 0);
        const hours = Math.abs(new Date(txData.checkOut) - new Date(txData.checkIn)) / 36e5;
        selisihHarga = (newH - oldH) * Math.max(1, Math.ceil(hours / 6));
      } else {
        let curr = new Date(); if (curr.getHours() < rolloverHour) curr = subDays(curr, 1); curr.setHours(rolloverHour, 0, 0, 0);
        let ci = new Date(txData.checkIn); if (ci.getHours() < rolloverHour) ci = subDays(ci, 1); ci.setHours(rolloverHour, 0, 0, 0);
        if (curr < ci) curr = new Date(ci);
        while (curr < new Date(txData.checkOut)) {
          selisihHarga += (resolvePrice(curr, tipeBaru, txData.bookingBy).harga - resolvePrice(curr, oldTipe, txData.bookingBy).harga);
          curr = addDays(curr, 1);
        }
      }
    }

    const isConfirmed = await confirm(`Pindahkan ke Kamar #${kamarBaru}?${selisihHarga !== 0 ? `\n\n⚠️ Tagihan akan ${selisihHarga > 0 ? 'BERTAMBAH' : 'BERKURANG'} Rp ${Math.abs(selisihHarga).toLocaleString('id-ID')}` : ''}`, "Konfirmasi Pindah Kamar");
    if (!isConfirmed) return;
    
    setIsSaving(true);
    try {
      const currentDb = JSON.parse(JSON.stringify(dbData)); let isUpdated = false;
      const note = `[Pindah dari #${oldRoom} ke #${kamarBaru}]${selisihHarga !== 0 ? ` [Koreksi: ${selisihHarga > 0 ? '+' : ''}${selisihHarga}]` : ''}`;

      const updateDB = (arr, isKos) => {
        const idx = arr.findIndex(t => t.id === txData.id);
        if (idx !== -1) {
          if (isKos) { arr[idx].roomNumber = kamarBaru; arr[idx].roomType = tipeBaru; } 
          else { arr[idx].noKamar = kamarBaru; arr[idx].tipeKamar = tipeBaru; }
          if (selisihHarga !== 0) {
             arr[idx].pembayaran.jumlahKamar += selisihHarga;
             if (!isKos && arr[idx].pembayaran.rincianTarifHarian) {
                let base = new Date(); if (base.getHours() < rolloverHour) base = subDays(base, 1); base.setHours(rolloverHour, 0, 0, 0);
                arr[idx].pembayaran.rincianTarifHarian.forEach(rt => { if (new Date(rt.tanggal) >= base) rt.harga = resolvePrice(new Date(rt.tanggal), tipeBaru, txData.bookingBy).harga; });
             }
          }
          arr[idx].info = arr[idx].info ? `${arr[idx].info} | ${note}` : note;
          isUpdated = true;
        }
      };
      if (txData.type === 'harian') updateDB(currentDb.dailyTransactions, false); else updateDB(currentDb.activeKost, true);

      if (isUpdated) {
        await fetch('http://localhost:5000/api/data/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(currentDb) });
        refreshData(); toast("Kamar berhasil dipindah.", "success"); setTransferModal({ isOpen: false, data: null });
      }
    } catch (error) { console.error(error); await alert("Error jaringan.", "Error"); } finally { setIsSaving(false); }
  };

  const handleOpenPayment = (tx) => {
    setPaymentModal({ isOpen: true, data: tx }); setPayDiskon(tx.pembayaran?.diskon || 0); setPayTipeDiskon('nominal');
    const netKamar = Math.max(0, (tx.pembayaran?.jumlahKamar || 0) - (tx.pembayaran?.diskon || 0));
    if (tx.pembayaran?.detailMetodeKamar?.length > 0) {
      const sumMetode = tx.pembayaran.detailMetodeKamar.reduce((s, m) => s + Number(m.nominal), 0);
      const totalTambahan = (tx.pembayaran?.tambahan || []).reduce((s, t) => s + ((t.jumlah || 0) * (t.qty || 1)), 0);
      if (sumMetode > netKamar && totalTambahan > 0) setPayDetailMetode([{ id: Date.now(), metode: tx.pembayaran.detailMetodeKamar[0].metode || 'Cash', nominal: netKamar }]);
      else setPayDetailMetode(tx.pembayaran.detailMetodeKamar.map(m => ({...m})));
    } else { setPayDetailMetode([{ id: Date.now(), metode: tx.pembayaran?.metodeKamar || 'Cash', nominal: netKamar }]); }
    setPayTambahan(tx.pembayaran?.tambahan?.length > 0 ? tx.pembayaran.tambahan.map(t => ({...t})) : []);
  };

  const prosesPayment = async () => {
    const payGrossRoom = paymentModal.data?.pembayaran?.jumlahKamar || 0;
    const payNominalDiskon = payTipeDiskon === 'persen' ? Math.round(payGrossRoom * ((Number(payDiskon)>100?100:Number(payDiskon)) / 100)) : Number(payDiskon);
    const payNettoKamar = Math.max(0, payGrossRoom - payNominalDiskon);
    if ((payNettoKamar - payDetailMetode.reduce((s,m) => s + (Number(m.nominal)||0), 0)) !== 0) { await alert("Nominal pelunasan KAMAR tidak balance!", "Validasi"); return; }
    
    setIsSaving(true);
    try {
      const currentDb = JSON.parse(JSON.stringify(dbData)); let isUpdated = false;
      const gabungan = payDetailMetode.map(m => m.metode).filter((v, i, a) => a.indexOf(v) === i).join(' & ');
      const updateTx = (tx) => { tx.pembayaran.diskon = payNominalDiskon; tx.pembayaran.detailMetodeKamar = payDetailMetode; tx.pembayaran.metodeKamar = gabungan; tx.pembayaran.tambahan = payTambahan; };
      
      const idxH = (currentDb.dailyTransactions || []).findIndex(t => t.id === paymentModal.data.id);
      if (idxH !== -1) { updateTx(currentDb.dailyTransactions[idxH]); isUpdated = true; }
      else {
        const idxK = (currentDb.activeKost || []).findIndex(t => t.id === paymentModal.data.id);
        if (idxK !== -1) { updateTx(currentDb.activeKost[idxK]); isUpdated = true; }
      }

      if (isUpdated) {
        await fetch('http://localhost:5000/api/data/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(currentDb) });
        refreshData(); toast("Koreksi berhasil.", "success"); setPaymentModal({ isOpen: false, data: null });
      }
    } catch (error) { console.error(error); await alert("Error jaringan.", "Error"); } finally { setIsSaving(false); }
  };

  const handleEditClick = (tx) => {
    setEditModal({ isOpen: true, data: tx });
    setTransitExtendCount(0); 
    if (tx.type === 'harian') {
      const ci = new Date(tx.checkIn); const co = new Date(tx.checkOut);
      let diff = differenceInDays(co, ci); if (diff === 0 && tx.tipeInap !== 'transit') diff = 1;
      setOriginalDurasi(diff); setEditDurasiMalam(diff); setEditExtendFee(0); setEditExtendMethod('Cash');
      setEditWaktuKeluar(format(co, "yyyy-MM-dd'T'HH:mm")); setEditNoKamar(tx.noKamar); setEditStatusDeposit(tx.statusDeposit || 'Belum Refund'); setEditInfo(tx.info || ''); setEditJenisKelamin(tx.jenisKelamin === 'Tidak Diisi' ? '' : (tx.jenisKelamin || '')); 
    } else {
      setEditWaktuKeluar(format(new Date(tx.periodeEnd), 'yyyy-MM-dd')); setEditNoKamar(tx.roomNumber); setEditStatusDeposit(tx.statusDeposit || 'Belum Refund'); setEditInfo(tx.info || ''); setEditJenisKelamin(tx.jenisKelamin === 'Tidak Diisi' ? '' : (tx.jenisKelamin || '')); 
    }
  };

  const handleExtendTransit = () => {
    if (!editModal.data) return;
    const newCount = transitExtendCount + 1; setTransitExtendCount(newCount);
    const newCO = addHours(new Date(editModal.data.checkOut), newCount * 6);
    setEditWaktuKeluar(format(newCO, "yyyy-MM-dd'T'HH:mm"));
    let effDate = new Date(editModal.data.checkIn); if (effDate.getHours() < rolloverHour) effDate = subDays(effDate, 1);
    const isWe = weekendDays.includes(effDate.getDay());
    setEditExtendFee((isWe ? (hargaDinamis.transitWeekend?.[editModal.data.tipeKamar] || 0) : (hargaDinamis.transitWeekday?.[editModal.data.tipeKamar] || 0)) * newCount);
  };

  const handleUndoTransit = () => {
    setTransitExtendCount(0); setEditWaktuKeluar(format(new Date(editModal.data.checkOut), "yyyy-MM-dd'T'HH:mm")); setEditExtendFee(0);
  };

  const hitungUlangKeluarHarian = (malam) => {
    if (!editModal.data) return;
    const dMasuk = new Date(editModal.data.checkIn);
    let dKeluar = new Date(dMasuk.getHours() < rolloverHour ? addDays(dMasuk, malam - 1) : addDays(dMasuk, malam));
    dKeluar.setHours(rolloverHour, 0, 0, 0); setEditWaktuKeluar(format(dKeluar, "yyyy-MM-dd'T'HH:mm"));

    if (malam > originalDurasi && editModal.data.type === 'harian') {
      let fee = 0; let ciDate = new Date(editModal.data.checkIn); if (ciDate.getHours() < rolloverHour) ciDate = subDays(ciDate, 1);
      for (let i = originalDurasi; i < malam; i++) { fee += resolvePrice(addDays(ciDate, i), editModal.data.tipeKamar, editModal.data.bookingBy).harga; }
      setEditExtendFee(fee);
    } else { setEditExtendFee(0); }
  };

  const simpanPerubahan = async () => {
    if (!editWaktuKeluar || !editNoKamar) { await alert("Lengkapi waktu keluar dan kamar.", "Validasi"); return; }
    setIsSaving(true);
    try {
      const currentDb = JSON.parse(JSON.stringify(dbData));
      const targetId = editModal.data.id; let isUpdated = false;

      if (editModal.data.type === 'harian') {
        const index = (currentDb.dailyTransactions || []).findIndex(t => t.id === targetId);
        if (index !== -1) {
          currentDb.dailyTransactions[index].checkOut = editWaktuKeluar; currentDb.dailyTransactions[index].noKamar = editNoKamar; currentDb.dailyTransactions[index].statusDeposit = editStatusDeposit; currentDb.dailyTransactions[index].info = editInfo; currentDb.dailyTransactions[index].jenisKelamin = editJenisKelamin; 
          
          if ((editDurasiMalam > originalDurasi || transitExtendCount > 0) && editExtendFee > 0) {
            currentDb.dailyTransactions[index].pembayaran.jumlahKamar += Number(editExtendFee);
            if (!currentDb.dailyTransactions[index].pembayaran.detailMetodeKamar) currentDb.dailyTransactions[index].pembayaran.detailMetodeKamar = [];
            const methodIndex = currentDb.dailyTransactions[index].pembayaran.detailMetodeKamar.findIndex(m => m.metode === editExtendMethod);
            if (methodIndex !== -1) currentDb.dailyTransactions[index].pembayaran.detailMetodeKamar[methodIndex].nominal += Number(editExtendFee);
            else currentDb.dailyTransactions[index].pembayaran.detailMetodeKamar.push({ id: Date.now(), metode: editExtendMethod, nominal: Number(editExtendFee) });
            
            if (!currentDb.dailyTransactions[index].pembayaran.rincianTarifHarian) currentDb.dailyTransactions[index].pembayaran.rincianTarifHarian = [];
            if (editModal.data.tipeInap === 'transit') {
               for(let i=0; i<transitExtendCount; i++) currentDb.dailyTransactions[index].pembayaran.rincianTarifHarian.push({ tanggal: new Date().toISOString(), jenis: 'Extend Transit', harga: Math.round(Number(editExtendFee) / transitExtendCount) });
            } else {
               let ciDate = new Date(currentDb.dailyTransactions[index].checkIn); if (ciDate.getHours() < rolloverHour) ciDate = subDays(ciDate, 1);
               const spreadFee = Math.round(Number(editExtendFee) / (editDurasiMalam - originalDurasi));
               for (let i = originalDurasi; i < editDurasiMalam; i++) currentDb.dailyTransactions[index].pembayaran.rincianTarifHarian.push({ tanggal: addDays(ciDate, i).toISOString(), jenis: resolvePrice(addDays(ciDate, i), currentDb.dailyTransactions[index].tipeKamar, currentDb.dailyTransactions[index].bookingBy).jenis || 'Extend', harga: spreadFee });
            }
            currentDb.dailyTransactions[index].pembayaran.metodeKamar = currentDb.dailyTransactions[index].pembayaran.detailMetodeKamar.map(m => m.metode).filter((v, i, a) => a.indexOf(v) === i).join(' & ');
          }
          isUpdated = true;
        }
      } else {
        const index = (currentDb.activeKost || []).findIndex(t => t.id === targetId);
        if (index !== -1) {
          currentDb.activeKost[index].periodeEnd = format(new Date(editWaktuKeluar), 'yyyy-MM-dd'); currentDb.activeKost[index].roomNumber = editNoKamar; currentDb.activeKost[index].statusDeposit = editStatusDeposit; currentDb.activeKost[index].info = editInfo; currentDb.activeKost[index].jenisKelamin = editJenisKelamin; 
          isUpdated = true;
        }
      }

      if (isUpdated) {
        await fetch('http://localhost:5000/api/data/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(currentDb) });
        refreshData(); toast("Perubahan & Extend tersimpan.", "success"); setEditModal({ isOpen: false, data: null });
      }
    } catch (error) { console.error(error); await alert("Error jaringan.", "Error"); } finally { setIsSaving(false); }
  };

  const prosesVoid = async () => {
    if (!voidReason.trim()) { await alert("Alasan wajib diisi.", "Validasi"); return; }
    const isConfirmed = await confirm("Transaksi akan dinolkan dan kamar dibebaskan. Lanjutkan?", "Konfirmasi Void");
    if (!isConfirmed) return;
    
    setIsSaving(true);
    try {
      const currentDb = JSON.parse(JSON.stringify(dbData)); let isUpdated = false;
      const idxH = (currentDb.dailyTransactions || []).findIndex(t => t.id === voidModal.data.id);
      if (idxH !== -1) { currentDb.dailyTransactions[idxH].isVoid = true; currentDb.dailyTransactions[idxH].voidReason = voidReason; currentDb.dailyTransactions[idxH].statusDeposit = 'Sudah Dikembalikan'; isUpdated = true; }
      else {
        const idxK = (currentDb.activeKost || []).findIndex(t => t.id === voidModal.data.id);
        if (idxK !== -1) { currentDb.activeKost[idxK].isVoid = true; currentDb.activeKost[idxK].voidReason = voidReason; currentDb.activeKost[idxK].statusDeposit = 'Sudah Dikembalikan'; isUpdated = true; }
      }
      if (isUpdated) {
        await fetch('http://localhost:5000/api/data/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(currentDb) });
        refreshData(); toast("Transaksi di-VOID.", "success"); setVoidModal({ isOpen: false, data: null });
      }
    } catch (error) { console.error(error); await alert("Error jaringan.", "Error"); } finally { setIsSaving(false); }
  };

  const filteredTx = activeTransactions.filter(tx => {
    const matchName = (tx.nama || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchRoom = (tx.noKamar || tx.roomNumber || '').toString().includes(searchTerm);
    return matchName || matchRoom;
  });

  const padHour = String(rolloverHour).padStart(2, '0');

  if (isDbLoading) return <div className="text-center p-10 font-medium text-gray-500">Memuat In-House Folio dari memori sentral...</div>;

  return (
    <div className="space-y-6 text-gray-900 transition-colors duration-300 animate-fade-in pb-10">
      
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">🛏️ In-House Folio</h2>
          <p className="text-sm text-gray-500 mt-1">Pusat kendali manajemen tamu yang sedang menginap (Aktif).</p>
        </div>
        <div className="w-full md:w-64">
           <input type="text" placeholder="🔍 Cari nama atau kamar..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full bg-white border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500 shadow-sm" />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="p-4 font-bold text-sm text-gray-700">Tamu & Kamar</th>
                <th className="p-4 font-bold text-sm text-gray-700">Waktu (IN - OUT)</th>
                <th className="p-4 font-bold text-sm text-gray-700 text-center">Status Tagihan</th>
                <th className="p-4 font-bold text-sm text-gray-700 text-center">Aksi Kendali (Folio)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredTx.length === 0 ? (<tr><td colSpan="4" className="p-8 text-center text-gray-500 italic">Tidak ada tamu yang sedang menginap.</td></tr>) : (
                filteredTx.map(tx => {
                  const noKamar = tx.type === 'harian' ? tx.noKamar : tx.roomNumber;
                  const wMasuk = tx.type === 'harian' ? new Date(tx.checkIn) : new Date(tx.periodeStart);
                  const wKeluar = tx.type === 'harian' ? new Date(tx.checkOut) : new Date(tx.periodeEnd + `T${padHour}:00:00`);
                  
                  const isOverstay = new Date() > wKeluar;
                  const netKamar = Math.max(0, (tx.pembayaran?.jumlahKamar || 0) - (tx.pembayaran?.diskon || 0));
                  const totalDibayarKamar = tx.pembayaran?.detailMetodeKamar?.length > 0 ? tx.pembayaran.detailMetodeKamar.reduce((s, m) => s + Number(m.nominal), 0) : netKamar;
                  const isUnbalanced = netKamar !== totalDibayarKamar;

                  return (
                    <tr key={tx.id} className="hover:bg-blue-50/30 transition-colors">
                      <td className="p-4">
                        <div className="font-bold text-gray-800 text-base">{tx.nama}</div>
                        <div className="text-xs text-gray-500 mt-1 flex items-center gap-2">
                           <span className="font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded shadow-sm">Kamar #{noKamar}</span>
                           <span className="font-mono text-gray-500 bg-white px-1.5 py-0.5 rounded border border-gray-200" title="ID Transaksi">{tx.id}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="text-sm text-gray-600"><span className="text-green-600 font-bold">IN:</span> {isNaN(wMasuk) ? '-' : format(wMasuk, tx.tipeInap === 'transit' ? 'dd MMM yy, HH:mm' : 'dd MMM yy')}</div>
                        <div className="text-sm text-gray-600 mt-1"><span className="text-red-500 font-bold">OUT:</span> {isNaN(wKeluar) ? '-' : format(wKeluar, tx.tipeInap === 'transit' ? 'dd MMM yy, HH:mm' : 'dd MMM yy')}</div>
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex flex-col items-center gap-1.5">
                          {isOverstay ? (
                            <span className="text-[10px] font-bold text-red-700 bg-red-100 px-2 py-1 rounded shadow-sm border border-red-200 animate-pulse">⏰ WAKTU HABIS (C/O)</span>
                          ) : (
                            <span className="text-[10px] font-bold text-green-700 bg-green-100 px-2 py-1 rounded shadow-sm border border-green-200">✅ IN-HOUSE</span>
                          )}
                          {isUnbalanced && <span className="text-[10px] font-bold text-orange-700 bg-orange-100 px-2 py-1 rounded shadow-sm border border-orange-200" title="Tagihan kamar tidak klop dengan setoran">⚠️ SELISIH BAYAR</span>}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex justify-center gap-2">
                          
                          <div className="relative group flex items-center justify-center">
                            <button onClick={() => handleOpenCheckout(tx)} className={`bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded shadow-sm transition-colors text-sm font-bold flex items-center gap-1 ${isOverstay ? 'animate-pulse shadow-red-600/30' : ''}`}>🚪 C/O</button>
                            <div className="absolute bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 hidden group-hover:block w-40 bg-gray-900 text-white text-[10px] p-2.5 rounded-lg shadow-xl z-50 text-center pointer-events-none transition-all">
                              <span className="font-bold text-red-300 block mb-0.5">Check-Out Tamu</span>
                              Akhiri masa inap dan urus uang jaminan deposit.
                              <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                            </div>
                          </div>

                          <div className="relative group flex items-center justify-center">
                            <button onClick={() => setTransferModal({ isOpen: true, data: tx })} className="bg-orange-500 hover:bg-orange-600 text-white px-3 py-2 rounded shadow-sm transition-colors text-sm font-bold">🔄</button>
                            <div className="absolute bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 hidden group-hover:block w-40 bg-gray-900 text-white text-[10px] p-2.5 rounded-lg shadow-xl z-50 text-center pointer-events-none transition-all">
                              <span className="font-bold text-orange-300 block mb-0.5">Pindah Kamar</span>
                              Pindahkan tamu ke kamar lain beserta penyesuaian harga.
                              <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                            </div>
                          </div>

                          <div className="relative group flex items-center justify-center">
                            <button onClick={() => handleOpenPayment(tx)} className={`${isUnbalanced ? 'bg-orange-600 hover:bg-orange-700 animate-pulse ring-2 ring-orange-400 ring-offset-1' : 'bg-emerald-600 hover:bg-emerald-700'} text-white px-3 py-2 rounded shadow-sm transition-colors text-sm font-bold`}>💳</button>
                            <div className="absolute bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 hidden group-hover:block w-44 bg-gray-900 text-white text-[10px] p-2.5 rounded-lg shadow-xl z-50 text-center pointer-events-none transition-all">
                              <span className="font-bold text-emerald-300 block mb-0.5">Koreksi Pembayaran</span>
                              Ralat metode bayar (Cash/Transfer) atau tambah diskon.
                              <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                            </div>
                          </div>

                          <div className="relative group flex items-center justify-center">
                            <button onClick={() => handleEditClick(tx)} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded shadow-sm transition-colors text-sm font-bold">⚙️</button>
                            <div className="absolute bottom-[calc(100%+8px)] right-0 md:left-1/2 md:-translate-x-1/2 hidden group-hover:block w-44 bg-gray-900 text-white text-[10px] p-2.5 rounded-lg shadow-xl z-50 text-center pointer-events-none transition-all">
                              <span className="font-bold text-blue-300 block mb-0.5">Edit & Extend</span>
                              Perpanjang masa inap (Kalkulasi Otomatis) atau ralat biodata.
                              <div className="absolute top-full right-4 md:left-1/2 md:-translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                            </div>
                          </div>

                          <div className="relative group flex items-center justify-center">
                            <button onClick={() => {setVoidModal({ isOpen: true, data: tx }); setVoidReason('');}} className="bg-gray-100 hover:bg-red-100 text-gray-500 hover:text-red-600 px-3 py-2 rounded shadow-sm transition-colors text-sm font-bold">🚫</button>
                            <div className="absolute bottom-[calc(100%+8px)] right-0 hidden group-hover:block w-40 bg-gray-900 text-white text-[10px] p-2.5 rounded-lg shadow-xl z-50 text-center pointer-events-none transition-all">
                              <span className="font-bold text-red-400 block mb-0.5">Void Transaksi</span>
                              Batalkan transaksi jika tamu membatalkan pesanan.
                              <div className="absolute top-full right-4 border-4 border-transparent border-t-gray-900"></div>
                            </div>
                          </div>

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

      {/* MODAL CHECK-OUT */}
      {checkoutModal.isOpen && checkoutModal.data && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-fade-in border-2 border-red-500">
            <div className="p-5 bg-red-600 text-white flex justify-between items-center">
              <h3 className="font-bold text-lg">🚪 Konfirmasi Check-Out</h3>
              <button onClick={() => setCheckoutModal({ isOpen: false, data: null })} className="text-white/70 hover:text-white font-bold text-2xl outline-none">&times;</button>
            </div>
            <div className="p-6 bg-gray-50 space-y-4">
              <div className="text-center pb-4 border-b border-gray-200">
                <p className="text-gray-500 text-sm">Mengakhiri masa inap tamu:</p>
                <p className="text-xl font-black text-gray-800 uppercase my-1">{checkoutModal.data.nama}</p>
                <p className="text-sm font-bold text-red-600">Kamar #{checkoutModal.data.type === 'harian' ? checkoutModal.data.noKamar : checkoutModal.data.roomNumber}</p>
              </div>
              <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Status Uang Deposit (Rp {checkoutModal.data.pembayaran?.jumlahDeposit?.toLocaleString('id-ID') || 0})</label>
                <select value={coStatusDeposit} onChange={(e) => setCoStatusDeposit(e.target.value)} className="w-full border border-gray-300 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-red-500 font-bold">
                  <option value="Sudah Dikembalikan">✅ Di-Refund ke Tamu (Kamar Aman)</option>
                  <option value="Deposit Hangus">❌ Hangus (Masuk Kas Hotel)</option>
                </select>
              </div>
              {coStatusDeposit === 'Sudah Dikembalikan' && (
                <div className="bg-green-50 p-4 rounded-xl border border-green-200 animate-fade-in">
                  <label className="block text-xs font-bold text-green-700 uppercase mb-2">Dikembalikan Via Metode</label>
                  <select value={coMetodeRefund} onChange={(e) => setCoMetodeRefund(e.target.value)} className="w-full border border-green-300 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-green-500">
                    <option value="Cash">Cash</option><option value="Transfer">Transfer BCA / Bank Lain</option>
                  </select>
                </div>
              )}
              {coStatusDeposit === 'Deposit Hangus' && (
                <div className="bg-red-50 p-4 rounded-xl border border-red-200 animate-fade-in">
                  <label className="block text-xs font-bold text-red-700 uppercase mb-2">Alasan Dihanguskan (Wajib)</label>
                  <input type="text" value={coAlasanHangus} onChange={(e) => setCoAlasanHangus(e.target.value)} placeholder="Cth: Telat C/O, Seprai Kotor..." className="w-full border border-red-300 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-red-500" required />
                </div>
              )}
            </div>
            <div className="p-4 border-t border-gray-200 flex gap-3">
              <button onClick={() => setCheckoutModal({ isOpen: false, data: null })} className="w-1/3 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200">Batal</button>
              <button onClick={prosesCheckout} disabled={isSaving} className="w-2/3 py-3 bg-red-600 text-white rounded-xl font-black hover:bg-red-700 shadow-md flex justify-center items-center gap-2">{isSaving ? 'Memproses...' : 'Selesaikan Check-Out'}</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL PINDAH KAMAR */}
      {transferModal.isOpen && transferModal.data && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-5 bg-orange-600 text-white flex justify-between items-center shrink-0">
              <div>
                <h3 className="font-bold text-xl">🔄 Pindah Kamar: {transferModal.data.nama}</h3>
                <p className="text-xs text-orange-200 mt-1">Kamar saat ini: #{transferModal.data.noKamar || transferModal.data.roomNumber}</p>
              </div>
              <button onClick={() => setTransferModal({ isOpen: false, data: null })} className="text-white/70 hover:text-white font-bold text-3xl transition-colors">&times;</button>
            </div>
            <div className="overflow-y-auto p-6 flex-1 space-y-6 bg-gray-50/50">
              <div className="bg-orange-50 p-4 rounded-xl border border-orange-200 text-sm text-orange-800 shadow-sm mb-2">
                <strong>Pilih Kamar Baru:</strong> Kamar abu-abu adalah kamar tamu saat ini. Kamar merah terisi tamu lain. Klik kamar hijau untuk memindahkan tamu.
              </div>
              {floors.length === 0 ? (<div className="text-center text-gray-500 italic py-10">Belum ada denah kamar.</div>) : (
                floors.map((floor) => (
                  <div key={floor.id} className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                    <h4 className="font-extrabold text-gray-800 mb-4 pb-2 border-b-2 border-gray-100">{floor.nama}</h4>
                    {floor.kamar.length === 0 ? (<p className="text-xs text-gray-400 italic">Tidak ada kamar.</p>) : (
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4">
                        {floor.kamar.filter(k => k.no.trim() !== '').map((k) => {
                          const isOccupied = activeTransactions.some(tx => (tx.noKamar || tx.roomNumber).toString() === k.no.trim());
                          const currentRoomNo = (transferModal.data.noKamar || transferModal.data.roomNumber).toString().trim();
                          const isCurrentRoom = k.no.trim() === currentRoomNo;
                          return (
                            <button key={k.id} disabled={isOccupied || isCurrentRoom} onClick={() => handleSelectRoomTransfer(k.no.trim(), k.tipe)} className={`p-4 rounded-xl border-2 flex flex-col items-center justify-center transition-all ${isCurrentRoom ? 'bg-gray-100 border-gray-400 text-gray-500 cursor-not-allowed shadow-inner' : isOccupied ? 'bg-red-50 border-red-200 text-red-400 cursor-not-allowed opacity-80' : 'bg-white border-orange-300 text-orange-700 hover:bg-orange-50 hover:border-orange-600 hover:scale-105 shadow-sm cursor-pointer'}`}>
                              <span className="text-2xl font-black">{k.no}</span>
                              <span className="text-[10px] font-extrabold uppercase mt-1 tracking-widest opacity-80">{k.tipe.split('-')[0]}</span>
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

      {/* MODAL KOREKSI PEMBAYARAN */}
      {paymentModal.isOpen && paymentModal.data && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-5 bg-emerald-600 text-white flex justify-between items-center shrink-0">
              <div><h3 className="font-bold text-lg">💳 Koreksi Data Pembayaran</h3><p className="text-xs text-emerald-200 mt-1">Revisi cara bayar tanpa membatalkan transaksi.</p></div>
              <button onClick={() => setPaymentModal({ isOpen: false, data: null })} className="text-white/70 hover:text-white font-bold text-2xl outline-none">&times;</button>
            </div>
            <div className="overflow-y-auto p-6 flex-1 space-y-4 bg-gray-50/50">
              
              {(() => {
                const payGrossRoom = paymentModal.data?.pembayaran?.jumlahKamar || 0;
                const payGrossTambahan = payTambahan.reduce((s,i) => s + ((i.jumlah || 0) * (i.qty || 1)), 0);
                const payNominalDiskon = payTipeDiskon === 'persen' ? Math.round(payGrossRoom * ((Number(payDiskon)>100?100:Number(payDiskon)) / 100)) : Number(payDiskon);
                const payNettoKamar = Math.max(0, payGrossRoom - payNominalDiskon);
                const payTotalDibayarKamar = payDetailMetode.reduce((s,m) => s + (Number(m.nominal)||0), 0);
                const paySelisihKamar = payNettoKamar - payTotalDibayarKamar;

                return (
                  <>
                    <div className="bg-emerald-600 text-white p-4 rounded-xl shadow-md text-center">
                      <p className="text-[10px] font-bold uppercase tracking-widest mb-1 opacity-80">Grand Total Tagihan Kotor</p>
                      <h3 className="text-3xl font-black">Rp {(payGrossRoom + payGrossTambahan).toLocaleString('id-ID')}</h3>
                    </div>

                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                      <div className="mb-3 border-b border-gray-100 pb-3 flex justify-between items-center">
                        <div>
                          <span className="block text-xs font-bold text-gray-500 uppercase mb-0.5">Total Harga Kamar (Netto)</span>
                          <span className="text-xl font-black text-gray-800">Rp {payNettoKamar.toLocaleString('id-ID')}</span>
                        </div>
                        {payNominalDiskon > 0 && <span className="text-xs font-bold text-red-500 line-through">Rp {payGrossRoom.toLocaleString('id-ID')}</span>}
                      </div>
                      <div className="flex gap-2 mb-4">
                        <select value={payTipeDiskon} onChange={(e) => { setPayTipeDiskon(e.target.value); setPayDiskon(0); }} className="w-1/3 border border-gray-300 rounded p-2 text-sm outline-none focus:ring-1 focus:ring-emerald-500 font-bold text-gray-700"><option value="nominal">Rp (Diskon)</option><option value="persen">% (Diskon)</option></select>
                        <input type="number" min="0" value={payDiskon === 0 ? '' : payDiskon} onChange={(e) => setPayDiskon(Number(e.target.value) || 0)} className="w-2/3 border border-gray-300 rounded p-2 text-sm outline-none focus:ring-1 focus:ring-emerald-500 font-bold" placeholder="Revisi Diskon..." />
                      </div>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-bold text-gray-500 uppercase">Metode Pelunasan Kamar</span>
                        <button onClick={() => setPayDetailMetode([...payDetailMetode, { id: Date.now(), metode: 'Transfer', nominal: paySelisihKamar > 0 ? paySelisihKamar : 0 }])} className="text-[10px] bg-emerald-100 hover:bg-emerald-200 text-emerald-800 px-2 py-1 rounded font-bold">+ Tambah</button>
                      </div>
                      <div className="space-y-2 mb-2 max-h-32 overflow-y-auto pr-1">
                        {payDetailMetode.map((item) => (
                          <div key={item.id} className="flex gap-2 items-center bg-gray-50 p-2 rounded border border-gray-100">
                            <select value={item.metode} onChange={(e) => setPayDetailMetode(payDetailMetode.map(m => m.id === item.id ? { ...m, metode: e.target.value } : m))} className="w-1/2 border border-gray-200 rounded p-1.5 text-sm outline-none focus:ring-1 focus:ring-emerald-500 bg-white font-bold text-gray-700">
                              <option value="Cash">Cash</option><option value="Transfer">Transfer</option><option value="QRIS">QRIS</option><option value="Debit/Kredit">Debit/Kredit</option>
                              {otaList.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                            <input type="number" value={item.nominal === 0 ? '' : item.nominal} onChange={(e) => setPayDetailMetode(payDetailMetode.map(m => m.id === item.id ? { ...m, nominal: Number(e.target.value) } : m))} placeholder="Nominal" className="w-1/2 border border-gray-200 rounded p-1.5 text-sm outline-none focus:ring-1 focus:ring-emerald-500 bg-white font-bold" />
                            {payDetailMetode.length > 1 && <button onClick={() => setPayDetailMetode(payDetailMetode.filter(m => m.id !== item.id))} className="text-red-500 font-bold hover:text-red-700 bg-red-50 w-8 h-8 flex justify-center items-center rounded">&times;</button>}
                          </div>
                        ))}
                      </div>
                      <div className={`text-xs font-bold text-right pt-2 border-t border-dashed border-gray-200 ${paySelisihKamar === 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {paySelisihKamar === 0 ? '✅ Nominal Pas' : (paySelisihKamar > 0 ? `⚠️ Kurang Rp ${paySelisihKamar.toLocaleString('id-ID')}` : `⚠️ Lebih Rp ${Math.abs(paySelisihKamar).toLocaleString('id-ID')}`)}
                      </div>
                    </div>
                  </>
                );
              })()}

              <div className="bg-orange-50 p-4 rounded-xl border border-orange-200 shadow-sm">
                <div className="flex justify-between items-center mb-3">
                  <span className="block text-xs font-bold text-orange-800 uppercase">Tagihan Ekstra / Tambahan</span>
                  <button onClick={() => setPayTambahan([...payTambahan, { id: Date.now(), nama: 'Item Tambahan', metode: 'Cash', jumlah: 0, qty: 1 }])} className="text-[10px] bg-orange-200 hover:bg-orange-300 text-orange-900 px-2 py-1 rounded font-bold shadow-sm">+ Item Baru</button>
                </div>
                {payTambahan.length === 0 ? <p className="text-xs text-orange-600/60 italic text-center py-2">Tidak ada tagihan ekstra.</p> : (
                  <div className="space-y-2">
                    {payTambahan.map((t) => (
                      <div key={t.id} className="flex gap-2 items-center bg-white p-2 rounded border border-orange-100">
                        <div className="w-1/2 flex flex-col gap-1">
                           <input type="text" value={t.nama} onChange={(e) => setPayTambahan(payTambahan.map(item => item.id === t.id ? { ...item, nama: e.target.value } : item))} className="text-xs font-bold border border-gray-200 p-1 rounded w-full" placeholder="Nama item..." />
                           <div className="flex gap-1 items-center">
                              <span className="text-[10px] text-gray-500 font-bold">Rp</span>
                              <input type="number" value={t.jumlah} onChange={(e) => setPayTambahan(payTambahan.map(item => item.id === t.id ? { ...item, jumlah: Number(e.target.value) } : item))} className="text-xs font-bold text-orange-600 border border-gray-200 p-1 rounded w-full" placeholder="Harga..." />
                              <span className="text-[10px] text-gray-500 font-bold mx-1">x</span>
                              <input type="number" min="1" value={t.qty || 1} onChange={(e) => setPayTambahan(payTambahan.map(item => item.id === t.id ? { ...item, qty: Number(e.target.value) } : item))} className="text-xs font-bold text-center border border-gray-200 p-1 rounded w-10" />
                           </div>
                        </div>
                        <select value={t.metode} onChange={(e) => setPayTambahan(payTambahan.map(item => item.id === t.id ? { ...item, metode: e.target.value } : item))} className="w-1/2 border border-orange-200 rounded p-1.5 text-sm outline-none focus:ring-1 focus:ring-orange-500 bg-orange-50 font-bold text-orange-800">
                          <option value="Cash">Cash</option><option value="Transfer">Transfer</option><option value="QRIS">QRIS</option><option value="Debit/Kredit">Debit/Kredit</option>
                        </select>
                        <button onClick={() => setPayTambahan(payTambahan.filter(item => item.id !== t.id))} className="text-red-500 font-bold hover:bg-red-50 px-2 rounded-md transition-colors h-full flex items-center justify-center text-xl">&times;</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="p-4 border-t border-gray-200 flex justify-end gap-3 bg-white shrink-0">
              <button onClick={() => setPaymentModal({ isOpen: false, data: null })} className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-bold hover:bg-gray-200">Batal</button>
              <button onClick={prosesPayment} disabled={isSaving} className="px-6 py-2.5 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700 shadow-md">{isSaving ? 'Menyimpan...' : 'Simpan Koreksi'}</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL EDIT & EXTEND */}
      {editModal.isOpen && editModal.data && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl overflow-hidden animate-fade-in">
            <div className="p-5 bg-blue-800 text-white flex justify-between items-center">
              <h3 className="font-bold text-lg">⚙️ Ralat Data & Extend Kamar</h3>
              <button onClick={() => setEditModal({ isOpen: false, data: null })} className="text-white/70 hover:text-white font-bold text-2xl outline-none">&times;</button>
            </div>
            <div className="p-6 space-y-5 bg-gray-50/50 max-h-[75vh] overflow-y-auto">
              <div className="bg-blue-50 p-3 rounded-lg border border-blue-200 text-xs text-blue-800 shadow-sm"><strong>Info Cerdas:</strong> Fitur Extend dilengkapi Kalkulator Otomatis. Tagihan tambahan akan langsung terekam ke laporan.</div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-bold text-gray-700 mb-1">Nomor Kamar</label><input type="text" value={editNoKamar} disabled className="w-full bg-gray-100 border border-gray-300 rounded-md p-2 outline-none text-gray-500 cursor-not-allowed" title="Gunakan tombol Pindah Kamar (🔄) di tabel untuk mengubah nomor kamar." /></div>
                <div><label className="block text-sm font-bold text-gray-700 mb-1">Gender</label><select value={editJenisKelamin} onChange={(e) => setEditJenisKelamin(e.target.value)} className="w-full bg-white border border-gray-300 rounded-md p-2 outline-none focus:ring-2 focus:ring-blue-500"><option value="" disabled hidden>- Pilih -</option><option value="Laki-laki">Laki-laki</option><option value="Perempuan">Perempuan</option><option value="Lain-lain">Lain-lain</option></select></div>
              </div>
              <div className="grid grid-cols-4 gap-4 items-start">
                {editModal.data.tipeInap === 'transit' ? (
                  <div className="col-span-1">
                     <label className="block text-sm font-bold text-gray-700 mb-1">Durasi</label>
                     <div className="flex flex-col gap-1.5"><button type="button" onClick={handleExtendTransit} className="w-full bg-purple-100 hover:bg-purple-200 text-purple-800 font-extrabold py-2 rounded-md text-xs shadow-sm">+ 6 Jam</button>{transitExtendCount > 0 && <button type="button" onClick={handleUndoTransit} className="w-full bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold py-1.5 rounded-md text-xs">↩ Undo</button>}</div>
                  </div>
                ) : editModal.data.type === 'harian' && (
                  <div className="col-span-1">
                    <label className="block text-sm font-bold text-gray-700 mb-1">Durasi</label>
                    <input type="number" min="1" value={editDurasiMalam} onChange={(e) => { const v = parseInt(e.target.value) || 1; setEditDurasiMalam(v); hitungUlangKeluarHarian(v); }} className="w-full bg-white border border-gray-300 rounded-md p-2 outline-none focus:ring-2 focus:ring-blue-500 text-center font-bold text-blue-700 h-[42px]" />
                  </div>
                )}
                <div className={editModal.data.type === 'kos' ? "col-span-4" : "col-span-3"}>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Waktu Keluar (Check-Out)</label>
                  <CustomDateTimePicker value={editWaktuKeluar} onChange={(val) => setEditWaktuKeluar(val)} includeTime={editModal.data.type !== 'kos'} readOnly={editModal.data.type === 'kos'} />
                </div>
              </div>

              {((editModal.data.type === 'harian' && editDurasiMalam > originalDurasi) || (editModal.data.tipeInap === 'transit' && transitExtendCount > 0)) && (
                <div className="bg-green-50 p-4 rounded-xl border-2 border-green-400 mt-2 shadow-sm animate-fade-in col-span-2">
                  <h4 className="font-black text-green-800 mb-3 uppercase tracking-wide text-sm">💸 Tagihan Extend Kamar ({editModal.data.tipeInap === 'transit' ? `+${transitExtendCount * 6} Jam` : `+${editDurasiMalam - originalDurasi} Malam`})</h4>
                  <div className="flex gap-4">
                    <div className="w-1/2"><label className="block text-xs font-bold text-green-700 mb-1">Nominal (Dihitung Otomatis)</label><input type="number" value={editExtendFee} onChange={(e) => setEditExtendFee(Number(e.target.value))} className="w-full border border-green-400 rounded-md p-2 text-sm outline-none focus:ring-2 focus:ring-green-600 bg-white font-bold text-green-800" /></div>
                    <div className="w-1/2"><label className="block text-xs font-bold text-green-700 mb-1">Pelunasan Via</label><select value={editExtendMethod} onChange={(e) => setEditExtendMethod(e.target.value)} className="w-full border border-green-400 rounded-md p-2 text-sm outline-none focus:ring-2 focus:ring-green-600 bg-white font-bold text-green-800"><option value="Cash">Cash</option><option value="Transfer">Transfer</option><option value="QRIS">QRIS</option><option value="Debit/Kredit">Debit/Kredit</option></select></div>
                  </div>
                </div>
              )}

              <div><label className="block text-sm font-bold text-gray-700 mb-1">Status Deposit Jaminan</label><select value={editStatusDeposit} onChange={(e) => setEditStatusDeposit(e.target.value)} className="w-full bg-white border border-gray-300 rounded-md p-2 outline-none focus:ring-2 focus:ring-blue-500"><option value="Belum Refund">Belum Refund (Di Tangan Kasir)</option><option value="Sudah Dikembalikan">✅ Sudah Dikembalikan ke Tamu</option><option value="Deposit Hangus">❌ Deposit Hangus (Denda/Kotor)</option></select></div>
              <div><label className="block text-sm font-bold text-gray-700 mb-1">Catatan Tambahan (Info)</label><input type="text" value={editInfo} onChange={(e) => setEditInfo(e.target.value)} className="w-full bg-white border border-gray-300 rounded-md p-2 outline-none focus:ring-2 focus:ring-blue-500" placeholder="Opsional..." /></div>
            </div>
            <div className="p-5 border-t border-gray-100 flex justify-end gap-3 bg-white">
              <button onClick={() => setEditModal({ isOpen: false, data: null })} className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-bold hover:bg-gray-200">Batal</button>
              <button onClick={simpanPerubahan} disabled={isSaving} className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 shadow-md">{isSaving ? 'Menyimpan...' : 'Simpan Perubahan'}</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL PROSES VOID */}
      {voidModal.isOpen && voidModal.data && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-fade-in border-2 border-red-500">
            <div className="p-5 bg-red-600 text-white flex justify-between items-center">
              <h3 className="font-bold text-lg">🚫 Konfirmasi Void Transaksi</h3>
              <button onClick={() => setVoidModal({ isOpen: false, data: null })} className="text-white/70 hover:text-white font-bold text-2xl outline-none">&times;</button>
            </div>
            <div className="p-6 bg-gray-50 space-y-4">
              <div className="bg-red-50 p-4 rounded-xl border border-red-200 text-red-800 text-sm mb-4">
                <strong>Peringatan Audit:</strong> Membatalkan transaksi akan mengosongkan status kamar dan menarik nominal tagihan dari laporan pendapatan (Rp 0).
              </div>
              <label className="block text-xs font-bold text-red-700 uppercase mb-2">Alasan Pembatalan (Wajib)</label>
              <textarea rows="3" value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="Contoh: Tamu batal menginap..." className="w-full border border-red-300 rounded-lg p-3 text-sm outline-none focus:ring-2 focus:ring-red-500" required></textarea>
            </div>
            <div className="p-4 border-t border-gray-200 flex gap-3">
              <button onClick={() => setVoidModal({ isOpen: false, data: null })} className="w-1/3 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200">Tutup</button>
              <button onClick={prosesVoid} disabled={isSaving} className="w-2/3 py-3 bg-red-600 text-white rounded-xl font-black hover:bg-red-700 shadow-md">{isSaving ? 'Memproses...' : 'Batalkan Transaksi'}</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
// [END: InHouseFolioModule]