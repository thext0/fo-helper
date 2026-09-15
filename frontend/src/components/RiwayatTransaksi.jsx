// [START: RiwayatTransaksiModule]
import { useState, useEffect } from 'react';
import { format, differenceInDays, addDays, subDays, addHours, isSameDay, startOfDay, endOfDay } from 'date-fns';
import { useDialog } from './DialogProvider';
import CustomDateTimePicker from './CustomDateTimePicker';

const formatRp = (angka) => {
  return Number(angka || 0).toLocaleString('id-ID');
};

const toTitleCase = (str) => {
  if (!str) return '';
  return str.toLowerCase().replace(/\b\w/g, s => s.toUpperCase());
};

export default function RiwayatTransaksi() {
  const { alert, confirm, prompt, toast } = useDialog();

  const [rolloverHour, setRolloverHour] = useState(12);
  const [transactions, setTransactions] = useState([]);
  const [unresolvedList, setUnresolvedList] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [dateFilter, setDateFilter] = useState({ start: '', end: '' });
  const [statusFilter, setStatusFilter] = useState('Aktif');
  const [sortConfig, setSortConfig] = useState({ key: 'waktuMasuk', direction: 'desc' });
  const [printData, setPrintData] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const [hargaDinamis, setHargaDinamis] = useState({});
  const [weekendDays, setWeekendDays] = useState([5, 6, 0]);
  const [rateManagement, setRateManagement] = useState({});
  const [otaList, setOtaList] = useState([]);

  const [floors, setFloors] = useState([]);
  const [occupiedRooms, setOccupiedRooms] = useState([]);
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

  const [checkoutModal, setCheckoutModal] = useState({ isOpen: false, data: null });
  const [coStatusDeposit, setCoStatusDeposit] = useState('Sudah Dikembalikan');
  const [coMetodeRefund, setCoMetodeRefund] = useState('Cash');
  const [coAlasanHangus, setCoAlasanHangus] = useState('');

  const [voidModal, setVoidModal] = useState({ isOpen: false, data: null });
  const [voidReason, setVoidReason] = useState('');

  const [paymentModal, setPaymentModal] = useState({ isOpen: false, data: null });
  const [payDiskon, setPayDiskon] = useState(0);
  const [payTipeDiskon, setPayTipeDiskon] = useState('nominal');
  const [payDetailMetode, setPayDetailMetode] = useState([]);
  const [payTambahan, setPayTambahan] = useState([]);

  useEffect(() => {
    const handleAfterPrint = () => setPrintData(null);
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, []);

  const fetchData = async () => {
    try {
      const res = await fetch('http://localhost:5000/api/data');
      if (res.ok) {
        const data = await res.json();
        const s = data.settings || {};
        const rHour = parseInt((s.rolloverTime || '12:00').split(':')[0], 10);
        setRolloverHour(rHour);
        
        const guests = data.guests || [];
        const attachGuestData = (tx) => {
          const g = guests.find(g => g.guestId === tx.guestId) || guests.find(g => (g.nama || '').toLowerCase() === (tx.nama || '').toLowerCase()) || {};
          let jk = tx.jenisKelamin;
          if (!jk || jk === '-' || jk === '') jk = g.jenisKelamin;
          if (!jk || jk === '-' || jk === '') jk = 'Tidak Diisi';
          return { ...tx, jenisKelamin: jk };
        };

        const harian = (data.dailyTransactions || []).map(tx => attachGuestData({ ...tx, type: 'harian' }));
        const kos = (data.activeKost || []).map(k => attachGuestData({ ...k, type: 'kos' }));
        const allTx = [...harian, ...kos];
        setTransactions(allTx);
        
        const now = new Date();
        const pending = allTx.filter(tx => {
          if (tx.isVoid || tx.statusDeposit !== 'Belum Refund') return false;
          const wKeluar = tx.type === 'harian' ? new Date(tx.checkOut) : new Date((tx.periodeEnd || format(now, 'yyyy-MM-dd')) + `T${String(rHour).padStart(2,'0')}:00:00`);
          return now > wKeluar;
        });
        setUnresolvedList(pending);

        const occ = [];
        allTx.forEach(tx => {
          if (!tx.isVoid) {
            const ci = tx.type === 'harian' ? new Date(tx.checkIn) : new Date(tx.periodeStart);
            const co = tx.type === 'harian' ? new Date(tx.checkOut) : new Date((tx.periodeEnd || format(now, 'yyyy-MM-dd')) + `T${String(rHour).padStart(2,'0')}:00:00`);
            if ((now >= ci && now <= co) || (now > co && isSameDay(co, now))) {
              occ.push((tx.noKamar || tx.roomNumber).toString().trim());
            }
          }
        });
        setOccupiedRooms(occ);

        setOtaList((s.otaList || []).map(ota => typeof ota === 'string' ? ota : ota.nama));
        setFloors(s.floors || []);
        setHargaDinamis({ 
          harianWeekday: s.prices?.harianWeekday || s.prices?.harian || {},
          harianWeekend: s.prices?.harianWeekend || s.prices?.harian || {},
          transitWeekday: s.prices?.transitWeekday || s.prices?.transit || {},
          transitWeekend: s.prices?.transitWeekend || s.prices?.transit || {},
          kos: s.prices?.kos || {}
        });
        setWeekendDays(s.weekendDays !== undefined ? s.weekendDays : [5, 6, 0]);
        setRateManagement(s.rateManagement || { channels: {}, calendarRules: { specialDates: [], dateRanges: [] } });
      }
    } catch (error) { console.error("Gagal mengambil data:", error); }
  };

  useEffect(() => {
    const timer = setTimeout(() => { fetchData(); }, 0);
    return () => clearTimeout(timer);
   
  }, []);

  const resolvePrice = (targetDate, roomType, bookingChannel) => {
    const targetMD = format(targetDate, 'MM-dd'); 
    const isWeekend = weekendDays.includes(targetDate.getDay());
    let finalPrice = isWeekend ? hargaDinamis.harianWeekend?.[roomType] : hargaDinamis.harianWeekday?.[roomType];
    let rateLabel = isWeekend ? 'Weekend' : 'Weekday';

    if (rateManagement?.calendarRules?.dateRanges) {
       const activeRange = rateManagement.calendarRules.dateRanges.find(r => {
           const start = r.startDate; const end = r.endDate;
           if (!start || !end) return false;
           return (start <= end) ? (targetMD >= start && targetMD <= end) : (targetMD >= start || targetMD <= end);
       });
       if (activeRange && activeRange.rates?.[roomType]) { finalPrice = activeRange.rates[roomType]; rateLabel = `Season: ${activeRange.name}`; }
    }
    if (rateManagement?.calendarRules?.specialDates) {
       const special = rateManagement.calendarRules.specialDates.find(s => s.date === targetMD);
       if (special && special.rates?.[roomType]) { finalPrice = special.rates[roomType]; rateLabel = `Special: ${special.name}`; }
    }
    if (bookingChannel && rateManagement?.channels?.[bookingChannel]?.isActive) {
       const chRates = rateManagement.channels[bookingChannel].baseRates;
       if (chRates) { finalPrice = isWeekend ? chRates.weekend?.[roomType] : chRates.weekday?.[roomType]; rateLabel = `OTA (${bookingChannel})`; }
    }
    return { harga: finalPrice || 0, jenis: rateLabel };
  };

  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };
  const getSortIndicator = (key) => sortConfig.key !== key ? '↕️' : (sortConfig.direction === 'asc' ? '⬆️' : '⬇️');

  const handleOpenCheckout = (tx) => {
    setCheckoutModal({ isOpen: true, data: tx });
    setCoStatusDeposit(tx.statusDeposit === 'Belum Refund' ? 'Sudah Dikembalikan' : (tx.statusDeposit || 'Sudah Dikembalikan'));
    setCoMetodeRefund(tx.pembayaran?.metodeDeposit || 'Cash');
    setCoAlasanHangus('');
  };

  const prosesCheckout = async () => {
    if (coStatusDeposit === 'Deposit Hangus' && !coAlasanHangus) {
      await alert("Mohon isi alasan mengapa deposit dihanguskan (Cth: Denda/Kotor).", "Informasi Tidak Lengkap");
      return;
    }
    setIsSaving(true);
    try {
      const getRes = await fetch('http://localhost:5000/api/data');
      const dbData = await getRes.json();
      const targetId = checkoutModal.data.id;
      
      let isUpdated = false;
      const nowStr = format(new Date(), "yyyy-MM-dd'T'HH:mm");
      const todayStr = format(new Date(), "yyyy-MM-dd");
      const depositInfo = coStatusDeposit === 'Deposit Hangus' ? `[Deposit Hangus: ${coAlasanHangus}]` : `[Deposit Di-Refund via ${coMetodeRefund}]`;

      if (checkoutModal.data.type === 'harian') {
        const index = (dbData.dailyTransactions || []).findIndex(t => t.id === targetId);
        if (index !== -1) {
          dbData.dailyTransactions[index].checkOut = nowStr;
          dbData.dailyTransactions[index].statusDeposit = coStatusDeposit;
          dbData.dailyTransactions[index].depositRefundMethod = coStatusDeposit === 'Sudah Dikembalikan' ? coMetodeRefund : '';
          dbData.dailyTransactions[index].depositHangusReason = coStatusDeposit === 'Deposit Hangus' ? coAlasanHangus : '';
          dbData.dailyTransactions[index].info = dbData.dailyTransactions[index].info ? `${dbData.dailyTransactions[index].info} | ${depositInfo}` : depositInfo;
          isUpdated = true;
        }
      } else {
        const index = (dbData.activeKost || []).findIndex(t => t.id === targetId);
        if (index !== -1) {
          dbData.activeKost[index].periodeEnd = todayStr;
          dbData.activeKost[index].statusDeposit = coStatusDeposit;
          dbData.activeKost[index].depositRefundMethod = coStatusDeposit === 'Sudah Dikembalikan' ? coMetodeRefund : '';
          dbData.activeKost[index].depositHangusReason = coStatusDeposit === 'Deposit Hangus' ? coAlasanHangus : '';
          dbData.activeKost[index].info = dbData.activeKost[index].info ? `${dbData.activeKost[index].info} | ${depositInfo}` : depositInfo;
          isUpdated = true;
        }
      }

      if (isUpdated) {
        await fetch('http://localhost:5000/api/data/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dbData) });
        toast("Tamu berhasil di Check-Out!", "success");
        setCheckoutModal({ isOpen: false, data: null });
        fetchData(); 
      }
    } catch (error) { 
      console.error(error); 
      await alert("Terjadi kesalahan jaringan saat menyimpan data.", "Error"); 
    } finally { setIsSaving(false); }
  };

  const prosesUndoCheckout = async (txData) => {
    const pic = await prompt(`Silakan masukkan Nama Petugas (PIC) untuk Log Audit:`, `Batalkan Check-Out tamu ${txData.nama}?`);
    if (!pic) return;

    setIsSaving(true);
    try {
      const getRes = await fetch('http://localhost:5000/api/data');
      const dbData = await getRes.json();
      let isUpdated = false;

      const cleanInfo = (infoStr) => {
        if(!infoStr) return '';
        return infoStr.split(' | [Deposit')[0];
      };
      
      const undoLog = `[Undo C/O by ${pic} pada ${format(new Date(), 'dd/MM/yy HH:mm')}]`;

      if (txData.type === 'harian') {
        const idx = (dbData.dailyTransactions || []).findIndex(t => t.id === txData.id);
        if (idx !== -1) {
          const durasiMalam = txData.pembayaran?.rincianTarifHarian?.length || 1;
          let baseDate = new Date(txData.checkIn);
          if(baseDate.getHours() < rolloverHour) baseDate = subDays(baseDate, 1);
          
          let origCO = addDays(baseDate, durasiMalam);
          origCO.setHours(rolloverHour, 0, 0, 0);

          dbData.dailyTransactions[idx].checkOut = format(origCO, "yyyy-MM-dd'T'HH:mm");
          dbData.dailyTransactions[idx].statusDeposit = 'Belum Refund';
          dbData.dailyTransactions[idx].depositRefundMethod = '';
          dbData.dailyTransactions[idx].depositHangusReason = '';
          dbData.dailyTransactions[idx].info = cleanInfo(txData.info) ? `${cleanInfo(txData.info)} | ${undoLog}` : undoLog;
          isUpdated = true;
        }
      } else {
        const idx = (dbData.activeKost || []).findIndex(t => t.id === txData.id);
        if (idx !== -1) {
          dbData.activeKost[idx].statusDeposit = 'Belum Refund';
          dbData.activeKost[idx].depositRefundMethod = '';
          dbData.activeKost[idx].depositHangusReason = '';
          dbData.activeKost[idx].info = cleanInfo(txData.info) ? `${cleanInfo(txData.info)} | ${undoLog}` : undoLog;
          isUpdated = true;
        }
      }

      if (isUpdated) {
         await fetch('http://localhost:5000/api/data/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dbData) });
         toast("Tamu kembali berstatus In-House.", "success");
         fetchData();
      }
    } catch(err) { 
      console.error(err); 
      await alert("Terjadi kesalahan jaringan saat memproses permintaan.", "Error"); 
    }
    finally { setIsSaving(false); }
  };

  const handleOpenVoid = (tx) => {
    setVoidModal({ isOpen: true, data: tx });
    setVoidReason('');
  };

  const prosesVoid = async () => {
    if (!voidReason.trim()) {
      await alert("Alasan pembatalan (Void) wajib diisi untuk log audit akuntansi.", "Data Tidak Lengkap");
      return;
    }

    const isConfirmed = await confirm("PERINGATAN: Transaksi yang di-void akan dinolkan pendapatannya dan dibebaskan kamarnya. Tindakan ini permanen. Lanjutkan?", "Konfirmasi Void");
    if (!isConfirmed) return;
    
    setIsSaving(true);
    try {
      const getRes = await fetch('http://localhost:5000/api/data');
      const dbData = await getRes.json();
      const targetId = voidModal.data.id;
      let isUpdated = false;

      if (voidModal.data.type === 'harian') {
        const index = (dbData.dailyTransactions || []).findIndex(t => t.id === targetId);
        if (index !== -1) {
          dbData.dailyTransactions[index].isVoid = true;
          dbData.dailyTransactions[index].voidReason = voidReason;
          dbData.dailyTransactions[index].statusDeposit = 'Sudah Dikembalikan'; 
          isUpdated = true;
        }
      } else {
        const index = (dbData.activeKost || []).findIndex(t => t.id === targetId);
        if (index !== -1) {
          dbData.activeKost[index].isVoid = true;
          dbData.activeKost[index].voidReason = voidReason;
          dbData.activeKost[index].statusDeposit = 'Sudah Dikembalikan';
          isUpdated = true;
        }
      }

      if (isUpdated) {
        await fetch('http://localhost:5000/api/data/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dbData) });
        toast("Transaksi berhasil dibatalkan (VOID).", "success");
        setVoidModal({ isOpen: false, data: null });
        fetchData();
      }
    } catch (error) { 
      console.error(error); 
      await alert("Terjadi kesalahan jaringan saat menyimpan data.", "Error"); 
    } finally { setIsSaving(false); }
  };

  const handleSelectRoomTransfer = async (kamarBaru, tipeBaru) => {
    const txData = transferModal.data;
    const oldRoom = txData.noKamar || txData.roomNumber;
    const oldTipe = txData.type === 'harian' ? txData.tipeKamar : txData.roomType;
    
    let selisihHarga = 0;
    
    if (oldTipe !== tipeBaru) {
      if (txData.type === 'kos') {
        const oldHarga = hargaDinamis.kos?.[oldTipe] || 0;
        const newHarga = hargaDinamis.kos?.[tipeBaru] || 0;
        selisihHarga = newHarga - oldHarga;
      } else if (txData.tipeInap === 'transit') {
        let effectiveDate = new Date(txData.checkIn);
        if (effectiveDate.getHours() < rolloverHour) effectiveDate = subDays(effectiveDate, 1);
        const isTransitWeekend = weekendDays.includes(effectiveDate.getDay());
        const oldHarga = isTransitWeekend ? (hargaDinamis.transitWeekend?.[oldTipe] || 0) : (hargaDinamis.transitWeekday?.[oldTipe] || 0);
        const newHarga = isTransitWeekend ? (hargaDinamis.transitWeekend?.[tipeBaru] || 0) : (hargaDinamis.transitWeekday?.[tipeBaru] || 0);
        
        const ci = new Date(txData.checkIn);
        const co = new Date(txData.checkOut);
        const hours = Math.abs(co - ci) / 36e5;
        const multiplier = Math.max(1, Math.ceil(hours / 6));
        selisihHarga = (newHarga - oldHarga) * multiplier;
      } else if (txData.type === 'harian') {
        let baseDate = new Date();
        if (baseDate.getHours() < rolloverHour) baseDate = subDays(baseDate, 1);
        baseDate.setHours(rolloverHour, 0, 0, 0);

        let checkOutDate = new Date(txData.checkOut);
        let currentDate = new Date(baseDate);
        
        let ciDate = new Date(txData.checkIn);
        if (ciDate.getHours() < rolloverHour) ciDate = subDays(ciDate, 1);
        ciDate.setHours(rolloverHour, 0, 0, 0);
        
        if (currentDate < ciDate) currentDate = new Date(ciDate);

        while (currentDate < checkOutDate) {
          const { harga: oldH } = resolvePrice(currentDate, oldTipe, txData.bookingBy);
          const { harga: newH } = resolvePrice(currentDate, tipeBaru, txData.bookingBy);
          selisihHarga += (newH - oldH);
          currentDate = addDays(currentDate, 1);
        }
      }
    }

    let confirmMsg = `Pindahkan tamu ${txData.nama} dari Kamar #${oldRoom} ke Kamar #${kamarBaru}?`;
    if (selisihHarga > 0) {
        confirmMsg += `\n\n⚠️ PERHATIAN: Tipe kamar baru lebih mahal!\nTagihan tamu akan BERTAMBAH sebesar Rp ${selisihHarga.toLocaleString('id-ID')} untuk sisa masa inap.`;
    } else if (selisihHarga < 0) {
        confirmMsg += `\n\n⚠️ PERHATIAN: Tipe kamar baru lebih murah!\nTagihan tamu akan BERKURANG sebesar Rp ${Math.abs(selisihHarga).toLocaleString('id-ID')} untuk sisa masa inap.`;
    }

    const isConfirmed = await confirm(confirmMsg, "Konfirmasi Pindah Kamar");
    if (!isConfirmed) return;
    
    setIsSaving(true);
    try {
      const getRes = await fetch('http://localhost:5000/api/data');
      const dbData = await getRes.json();
      
      let isUpdated = false;
      let note = `[Pindah dari #${oldRoom} ke #${kamarBaru}]`;
      if (selisihHarga !== 0) {
         note += ` [Koreksi Tarif: ${selisihHarga > 0 ? '+' : ''}${selisihHarga}]`;
      }

      if (txData.type === 'harian') {
        const idx = (dbData.dailyTransactions || []).findIndex(t => t.id === txData.id);
        if (idx !== -1) {
          dbData.dailyTransactions[idx].noKamar = kamarBaru;
          dbData.dailyTransactions[idx].tipeKamar = tipeBaru;
          
          if (selisihHarga !== 0) {
             dbData.dailyTransactions[idx].pembayaran.jumlahKamar += selisihHarga;
             if (dbData.dailyTransactions[idx].pembayaran.rincianTarifHarian) {
                let baseDate = new Date();
                if (baseDate.getHours() < rolloverHour) baseDate = subDays(baseDate, 1);
                baseDate.setHours(rolloverHour, 0, 0, 0);

                dbData.dailyTransactions[idx].pembayaran.rincianTarifHarian.forEach(rt => {
                    const rtDate = new Date(rt.tanggal);
                    if (rtDate >= baseDate) {
                        const { harga: newH } = resolvePrice(rtDate, tipeBaru, txData.bookingBy);
                        rt.harga = newH;
                    }
                });
             }
          }
          
          dbData.dailyTransactions[idx].info = dbData.dailyTransactions[idx].info ? `${dbData.dailyTransactions[idx].info} | ${note}` : note;
          isUpdated = true;
        }
      } else {
        const idx = (dbData.activeKost || []).findIndex(t => t.id === txData.id);
        if (idx !== -1) {
          dbData.activeKost[idx].roomNumber = kamarBaru;
          dbData.activeKost[idx].roomType = tipeBaru;
          if (selisihHarga !== 0) {
             dbData.activeKost[idx].pembayaran.jumlahKamar += selisihHarga;
          }
          dbData.activeKost[idx].info = dbData.activeKost[idx].info ? `${dbData.activeKost[idx].info} | ${note}` : note;
          isUpdated = true;
        }
      }

      if (isUpdated) {
        await fetch('http://localhost:5000/api/data/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dbData) });
        toast("Pindah kamar & harga berhasil disesuaikan.", "success");
        if(selisihHarga !== 0) {
            await alert("Tagihan kamar telah berubah. Pastikan Anda mengklik ikon Kartu (💳) pada transaksi ini untuk menyesuaikan Metode Pembayaran agar selisihnya balance!", "Perhatian Kasir");
        }
        setTransferModal({ isOpen: false, data: null });
        fetchData();
      }
    } catch (error) { 
      console.error(error); 
      await alert("Terjadi kesalahan saat memindahkan kamar.", "Error"); 
    } finally { setIsSaving(false); }
  };

  const handleEditClick = (tx) => {
    setEditModal({ isOpen: true, data: tx });
    setTransitExtendCount(0); 
    
    if (tx.type === 'harian') {
      const ci = new Date(tx.checkIn); const co = new Date(tx.checkOut);
      let diff = differenceInDays(co, ci);
      if (diff === 0 && tx.tipeInap !== 'transit') diff = 1;
      
      setOriginalDurasi(diff);
      setEditDurasiMalam(diff);
      setEditExtendFee(0);
      setEditExtendMethod('Cash');
      
      setEditWaktuKeluar(format(co, "yyyy-MM-dd'T'HH:mm"));
      setEditNoKamar(tx.noKamar);
      setEditStatusDeposit(tx.statusDeposit || 'Belum Refund');
      setEditInfo(tx.info || '');
      setEditJenisKelamin(tx.jenisKelamin === 'Tidak Diisi' ? '' : (tx.jenisKelamin || '')); 
    } else {
      setEditWaktuKeluar(format(new Date(tx.periodeEnd), 'yyyy-MM-dd'));
      setEditNoKamar(tx.roomNumber);
      setEditStatusDeposit(tx.statusDeposit || 'Belum Refund');
      setEditInfo(tx.info || '');
      setEditJenisKelamin(tx.jenisKelamin === 'Tidak Diisi' ? '' : (tx.jenisKelamin || '')); 
    }
  };

  const handleExtendTransit = () => {
    if (!editModal.data) return;
    const newCount = transitExtendCount + 1;
    setTransitExtendCount(newCount);

    const baseCO = new Date(editModal.data.checkOut);
    const newCO = addHours(baseCO, newCount * 6);
    setEditWaktuKeluar(format(newCO, "yyyy-MM-dd'T'HH:mm"));

    let effectiveDate = new Date(editModal.data.checkIn);
    if (effectiveDate.getHours() < rolloverHour) effectiveDate = subDays(effectiveDate, 1);
    const isWeekend = weekendDays.includes(effectiveDate.getDay());
    const basePrice = isWeekend ? (hargaDinamis.transitWeekend?.[editModal.data.tipeKamar] || 0) : (hargaDinamis.transitWeekday?.[editModal.data.tipeKamar] || 0);

    setEditExtendFee(basePrice * newCount);
  };

  const handleUndoTransit = () => {
    setTransitExtendCount(0);
    setEditWaktuKeluar(format(new Date(editModal.data.checkOut), "yyyy-MM-dd'T'HH:mm"));
    setEditExtendFee(0);
  };

  const hitungUlangKeluarHarian = (malam) => {
    if (!editModal.data) return;
    const dateMasuk = new Date(editModal.data.checkIn);
    let dateKeluar = new Date(dateMasuk.getHours() < rolloverHour ? addDays(dateMasuk, malam - 1) : addDays(dateMasuk, malam));
    dateKeluar.setHours(rolloverHour, 0, 0, 0);
    setEditWaktuKeluar(format(dateKeluar, "yyyy-MM-dd'T'HH:mm"));

    if (malam > originalDurasi && editModal.data.type === 'harian') {
      let fee = 0;
      let checkInDate = new Date(editModal.data.checkIn);
      if (checkInDate.getHours() < rolloverHour) checkInDate = subDays(checkInDate, 1);
      
      for (let i = originalDurasi; i < malam; i++) {
        const nightDate = addDays(checkInDate, i);
        const { harga } = resolvePrice(nightDate, editModal.data.tipeKamar, editModal.data.bookingBy);
        fee += harga;
      }
      setEditExtendFee(fee);
    } else { setEditExtendFee(0); }
  };

  const simpanPerubahan = async () => {
    if (!editWaktuKeluar || !editNoKamar) {
      await alert("Mohon lengkapi Waktu Keluar dan Nomor Kamar.", "Validasi Gagal");
      return;
    }
    setIsSaving(true);
    try {
      const getRes = await fetch('http://localhost:5000/api/data');
      const dbData = await getRes.json();
      const targetId = editModal.data.id;
      let isUpdated = false;

      if (editModal.data.type === 'harian') {
        const index = (dbData.dailyTransactions || []).findIndex(t => t.id === targetId);
        if (index !== -1) {
          dbData.dailyTransactions[index].checkOut = editWaktuKeluar;
          dbData.dailyTransactions[index].noKamar = editNoKamar;
          dbData.dailyTransactions[index].statusDeposit = editStatusDeposit;
          dbData.dailyTransactions[index].info = editInfo;
          dbData.dailyTransactions[index].jenisKelamin = editJenisKelamin; 
          
          if ((editDurasiMalam > originalDurasi || transitExtendCount > 0) && editExtendFee > 0) {
            dbData.dailyTransactions[index].pembayaran.jumlahKamar += Number(editExtendFee);
            if (!dbData.dailyTransactions[index].pembayaran.detailMetodeKamar) dbData.dailyTransactions[index].pembayaran.detailMetodeKamar = [];
            
            const methodIndex = dbData.dailyTransactions[index].pembayaran.detailMetodeKamar.findIndex(m => m.metode === editExtendMethod);
            if (methodIndex !== -1) dbData.dailyTransactions[index].pembayaran.detailMetodeKamar[methodIndex].nominal += Number(editExtendFee);
            else dbData.dailyTransactions[index].pembayaran.detailMetodeKamar.push({ id: Date.now(), metode: editExtendMethod, nominal: Number(editExtendFee) });
            
            if (!dbData.dailyTransactions[index].pembayaran.rincianTarifHarian) dbData.dailyTransactions[index].pembayaran.rincianTarifHarian = [];
            
            if (editModal.data.tipeInap === 'transit') {
               for(let i=0; i<transitExtendCount; i++) {
                 dbData.dailyTransactions[index].pembayaran.rincianTarifHarian.push({ 
                   tanggal: new Date().toISOString(), 
                   jenis: 'Extend Transit (+6 Jam)', 
                   harga: Math.round(Number(editExtendFee) / transitExtendCount) 
                 });
               }
            } else {
               let checkInDate = new Date(dbData.dailyTransactions[index].checkIn);
               if (checkInDate.getHours() < rolloverHour) checkInDate = subDays(checkInDate, 1);
               const spreadFee = Math.round(Number(editExtendFee) / (editDurasiMalam - originalDurasi));
               for (let i = originalDurasi; i < editDurasiMalam; i++) {
                 const nightDate = addDays(checkInDate, i);
                 const { jenis } = resolvePrice(nightDate, dbData.dailyTransactions[index].tipeKamar, dbData.dailyTransactions[index].bookingBy);
                 dbData.dailyTransactions[index].pembayaran.rincianTarifHarian.push({ tanggal: nightDate.toISOString(), jenis: jenis || 'Extend', harga: spreadFee });
               }
            }
            dbData.dailyTransactions[index].pembayaran.metodeKamar = dbData.dailyTransactions[index].pembayaran.detailMetodeKamar.map(m => m.metode).filter((v, i, a) => a.indexOf(v) === i).join(' & ');
          }
          isUpdated = true;
        }
      } else {
        const index = (dbData.activeKost || []).findIndex(t => t.id === targetId);
        if (index !== -1) {
          dbData.activeKost[index].periodeEnd = format(new Date(editWaktuKeluar), 'yyyy-MM-dd');
          dbData.activeKost[index].roomNumber = editNoKamar;
          dbData.activeKost[index].statusDeposit = editStatusDeposit;
          dbData.activeKost[index].info = editInfo;
          dbData.activeKost[index].jenisKelamin = editJenisKelamin; 
          isUpdated = true;
        }
      }

      if (isUpdated) {
        await fetch('http://localhost:5000/api/data/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dbData) });
        toast("Perubahan & Tagihan Extend berhasil direkam.", "success");
        setEditModal({ isOpen: false, data: null });
        fetchData();
      }
    } catch (error) { 
      console.error(error); 
      await alert("Terjadi kesalahan jaringan saat menyimpan perubahan.", "Error"); 
    } finally { setIsSaving(false); }
  };

  const handleOpenPayment = (tx) => {
    setPaymentModal({ isOpen: true, data: tx });
    setPayDiskon(tx.pembayaran?.diskon || 0);
    setPayTipeDiskon('nominal');
    
    const netKamar = Math.max(0, (tx.pembayaran?.jumlahKamar || 0) - (tx.pembayaran?.diskon || 0));

    if (tx.pembayaran?.detailMetodeKamar?.length > 0) {
      const sumMetode = tx.pembayaran.detailMetodeKamar.reduce((s, m) => s + Number(m.nominal), 0);
      const totalTambahan = (tx.pembayaran?.tambahan || []).reduce((s, t) => s + t.jumlah, 0);
      
      if (sumMetode > netKamar && totalTambahan > 0) {
         setPayDetailMetode([{ id: Date.now(), metode: tx.pembayaran.detailMetodeKamar[0].metode || 'Cash', nominal: netKamar }]);
      } else {
         setPayDetailMetode(tx.pembayaran.detailMetodeKamar.map(m => ({...m})));
      }
    } else {
      setPayDetailMetode([{ id: Date.now(), metode: tx.pembayaran?.metodeKamar || 'Cash', nominal: netKamar }]);
    }

    if (tx.pembayaran?.tambahan?.length > 0) {
      setPayTambahan(tx.pembayaran.tambahan.map(t => ({...t})));
    } else {
      setPayTambahan([]);
    }
  };

  const payData = paymentModal.data;
  const payGrossRoom = payData?.pembayaran?.jumlahKamar || 0;
  const payGrossTambahan = (payData?.pembayaran?.tambahan || []).reduce((s,i) => s + i.jumlah, 0);
  const payGrossTotal = payGrossRoom + payGrossTambahan;
  
  let payNilaiDiskon = Number(payDiskon) || 0;
  if (payNilaiDiskon < 0) payNilaiDiskon = 0;
  if (payTipeDiskon === 'persen' && payNilaiDiskon > 100) payNilaiDiskon = 100;
  const payNominalDiskon = payTipeDiskon === 'persen' ? Math.round(payGrossRoom * (payNilaiDiskon / 100)) : payNilaiDiskon;
  
  const payNettoKamar = Math.max(0, payGrossRoom - payNominalDiskon);
  const payTotalDibayarKamar = payDetailMetode.reduce((s,m) => s + (Number(m.nominal)||0), 0);
  const paySelisihKamar = payNettoKamar - payTotalDibayarKamar;

  const prosesPayment = async () => {
    if (paySelisihKamar !== 0) {
      await alert(`Nominal pelunasan KAMAR tidak seimbang! (Selisih: Rp ${paySelisihKamar.toLocaleString('id-ID')})`, "Validasi Gagal");
      return;
    }
    
    setIsSaving(true);
    try {
      const getRes = await fetch('http://localhost:5000/api/data');
      const dbData = await getRes.json();
      const targetId = paymentModal.data.id;
      let isUpdated = false;

      const gabunganMetode = payDetailMetode.map(m => m.metode).filter((v, i, a) => a.indexOf(v) === i).join(' & ');

      const updateTx = (tx) => {
        tx.pembayaran.diskon = payNominalDiskon;
        tx.pembayaran.detailMetodeKamar = payDetailMetode;
        tx.pembayaran.metodeKamar = gabunganMetode;
        tx.pembayaran.tambahan = payTambahan;
      };

      if (paymentModal.data.type === 'harian') {
        const index = (dbData.dailyTransactions || []).findIndex(t => t.id === targetId);
        if (index !== -1) { updateTx(dbData.dailyTransactions[index]); isUpdated = true; }
      } else {
        const index = (dbData.activeKost || []).findIndex(t => t.id === targetId);
        if (index !== -1) { updateTx(dbData.activeKost[index]); isUpdated = true; }
      }

      if (isUpdated) {
        await fetch('http://localhost:5000/api/data/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dbData) });
        toast("Koreksi pembayaran berhasil disimpan.", "success");
        setPaymentModal({ isOpen: false, data: null });
        fetchData();
      }
    } catch (error) { 
      console.error(error); 
      await alert("Terjadi kesalahan jaringan saat menyimpan koreksi.", "Error"); 
    } finally { setIsSaving(false); }
  };

  const padHour = String(rolloverHour).padStart(2, '0');

  const filteredTx = transactions.filter(tx => {
    const matchName = (tx.nama || '').toLowerCase().includes((searchTerm || '').toLowerCase());
    const matchRoom = (tx.noKamar || tx.roomNumber || '').toString().includes(searchTerm || '');
    
    let dateMatch = true;
    if (dateFilter.start && dateFilter.end) { 
      const txDate = tx.type === 'harian' ? new Date(tx.checkIn) : new Date(tx.periodeStart); 
      const fStart = startOfDay(new Date(dateFilter.start));
      const fEnd = endOfDay(new Date(dateFilter.end));
      dateMatch = !isNaN(txDate) && txDate >= fStart && txDate <= fEnd;
    }
    
    let statusMatch = true;
    if (statusFilter === 'Dibatalkan') {
      statusMatch = tx.isVoid === true;
    } else if (statusFilter === 'Deposit Tertahan') {
      const now = new Date(); 
      const coDate = tx.type === 'harian' ? new Date(tx.checkOut) : new Date((tx.periodeEnd || format(now, 'yyyy-MM-dd')) + `T${padHour}:00:00`);
      statusMatch = !tx.isVoid && tx.statusDeposit === 'Belum Refund' && !isNaN(coDate) && now > coDate;
    } else {
      if (tx.isVoid) statusMatch = false; 
      else {
        const now = new Date(); 
        const coDate = tx.type === 'harian' ? new Date(tx.checkOut) : new Date((tx.periodeEnd || format(now, 'yyyy-MM-dd')) + `T${padHour}:00:00`);
        if (!isNaN(coDate)) { 
          if (statusFilter === 'Aktif') statusMatch = now <= coDate; 
          else if (statusFilter === 'Selesai') statusMatch = now > coDate; 
        }
      }
    }
    return (matchName || matchRoom) && dateMatch && statusMatch;
  });

  const sortedAndFilteredTx = [...filteredTx].sort((a, b) => {
    const getWaktuMasuk = (tx) => tx.type === 'harian' ? new Date(tx.checkIn).getTime() : new Date(tx.periodeStart).getTime();
    const timeA = getWaktuMasuk(a) || 0; const timeB = getWaktuMasuk(b) || 0;
    let comp = 0;
    if (sortConfig.key === 'nama') comp = (a.nama || '').toLowerCase().localeCompare((b.nama || '').toLowerCase());
    else if (sortConfig.key === 'jenisKelamin') comp = (a.jenisKelamin || '').localeCompare(b.jenisKelamin || '');
    else if (sortConfig.key === 'tipe') { const tA = a.type === 'kos' ? 'kos' : a.tipeInap || ''; const tB = b.type === 'kos' ? 'kos' : b.tipeInap || ''; comp = tA.localeCompare(tB); }
    else if (sortConfig.key === 'status') { const now = new Date().getTime(); const coA = a.type === 'harian' ? new Date(a.checkOut).getTime() : new Date(a.periodeEnd + `T${padHour}:00:00`).getTime(); const coB = b.type === 'harian' ? new Date(b.checkOut).getTime() : new Date(b.periodeEnd + `T${padHour}:00:00`).getTime(); comp = (now <= coB ? 1 : 0) - (now <= coA ? 1 : 0); }
    else if (sortConfig.key === 'waktuMasuk') comp = timeA - timeB;
    if (comp !== 0) return sortConfig.direction === 'asc' ? comp : -comp;
    return timeB - timeA;
  });

  return (
    <>
      <div className={`space-y-6 text-gray-900 transition-colors duration-300 print:hidden ${printData ? 'hidden' : 'block'}`}>
        
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div><h2 className="text-2xl font-bold text-gray-800">Riwayat Transaksi</h2><p className="text-sm text-gray-500 mt-1">Daftar histori inap tamu Harian, Transit, dan Kos.</p></div>
        </div>

        {unresolvedList.length > 0 && (
          <div className="bg-red-50 border-l-4 border-red-600 p-4 rounded-xl shadow-sm mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 animate-pulse">
            <div>
              <h3 className="text-red-800 font-bold text-lg">⚠️ Aksi Diperlukan: Deposit Belum Diurus</h3>
              <p className="text-red-600 text-sm">Ada <strong>{unresolvedList.length} tamu</strong> yang waktu inapnya sudah habis saat aplikasi tertutup, namun status uang depositnya belum dikonfirmasi.</p>
            </div>
            <button onClick={() => handleOpenCheckout(unresolvedList[0])} className="bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-lg font-bold shadow-md shrink-0 flex items-center gap-2"><span>🚪</span> Urus Sekarang</button>
          </div>
        )}

        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col md:flex-row gap-4 items-center">
          <div className="flex-1 w-full"><input type="text" placeholder="Cari nama tamu atau no. kamar..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full bg-transparent border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-green-500" /></div>
          
          <div className="flex items-center gap-2 w-full md:w-auto">
            <div className="w-full md:w-40"><CustomDateTimePicker value={dateFilter.start} onChange={(val) => setDateFilter({...dateFilter, start: val})} /></div>
            <span className="text-gray-400 font-bold">-</span>
            <div className="w-full md:w-40"><CustomDateTimePicker value={dateFilter.end} onChange={(val) => setDateFilter({...dateFilter, end: val})} alignRight={true} /></div>
            {(dateFilter.start || dateFilter.end) && (
               <button onClick={() => setDateFilter({start: '', end: ''})} className="bg-gray-200 text-gray-600 hover:bg-gray-300 p-2 rounded-lg font-bold text-sm" title="Clear Filter Tanggal">&times;</button>
            )}
          </div>
          
          <div className="w-full md:w-48"><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full bg-transparent border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-green-500 font-bold text-gray-700"><option value="Semua">Semua Status</option><option value="Aktif">Tamu Aktif (In-House)</option><option value="Selesai">Sudah Check-Out</option><option value="Deposit Tertahan">⚠️ Deposit Tertahan</option><option value="Dibatalkan">🚫 Void / Batal</option></select></div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="p-3">
                    <div className="flex items-center gap-3">
                      <button onClick={() => requestSort('nama')} className="flex items-center gap-1 font-bold text-sm text-gray-700 hover:text-green-600">Nama Tamu <span className="opacity-70 text-xs">{getSortIndicator('nama')}</span></button>
                      <span className="text-gray-300">|</span>
                      <button onClick={() => requestSort('jenisKelamin')} className="flex items-center gap-1 font-bold text-xs text-gray-500 hover:text-green-600">Gender <span className="opacity-70">{getSortIndicator('jenisKelamin')}</span></button>
                    </div>
                  </th>
                  <th className="p-3"><button onClick={() => requestSort('tipe')} className="flex items-center gap-1 font-bold text-sm text-gray-700 hover:text-green-600">Tipe & Durasi <span className="opacity-70 text-xs">{getSortIndicator('tipe')}</span></button></th>
                  <th className="p-3"><button onClick={() => requestSort('waktuMasuk')} className="flex items-center gap-1 font-bold text-sm text-gray-700 hover:text-green-600">Waktu (Masuk - Keluar) <span className="opacity-70 text-xs">{getSortIndicator('waktuMasuk')}</span></button></th>
                  <th className="p-3"><button onClick={() => requestSort('status')} className="flex items-center gap-1 font-bold text-sm text-gray-700 hover:text-green-600">Status <span className="opacity-70 text-xs">{getSortIndicator('status')}</span></button></th>
                  <th className="p-3 font-bold text-sm text-gray-700 text-center">Aksi Operasional</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sortedAndFilteredTx.length === 0 ? (<tr><td colSpan="5" className="p-8 text-center text-gray-500 italic">Tidak ada data transaksi yang sesuai.</td></tr>) : (
                  sortedAndFilteredTx.map(tx => {
                    const noKamar = tx.type === 'harian' ? tx.noKamar : tx.roomNumber;
                    const wMasuk = tx.type === 'harian' ? new Date(tx.checkIn) : new Date(tx.periodeStart);
                    const wKeluar = tx.type === 'harian' ? new Date(tx.checkOut) : new Date(tx.periodeEnd + `T${padHour}:00:00`);
                    
                    const isAktif = new Date() <= wKeluar;
                    const needsCheckout = !tx.isVoid && (isAktif || tx.statusDeposit === 'Belum Refund');
                    const isCheckedOut = !tx.isVoid && !isAktif && tx.statusDeposit !== 'Belum Refund';
                    
                    let canUndo = false;
                    if (isCheckedOut) {
                      const realCOTime = tx.type === 'harian' ? new Date(tx.checkOut) : new Date(tx.periodeEnd + `T${padHour}:00:00`);
                      const diffInHours = (new Date() - realCOTime) / (1000 * 60 * 60);
                      if (diffInHours <= 24 && diffInHours >= 0) { 
                        canUndo = true;
                      }
                    }
                    
                    return (
                      <tr key={tx.id} className={`transition-colors ${tx.isVoid ? 'bg-red-50/50 opacity-70' : 'hover:bg-green-50/30'}`}>
                        <td className="p-4">
                          <div className={`font-bold ${tx.isVoid ? 'text-red-800 line-through' : 'text-gray-800'}`}>{tx.nama} {tx.jenisKelamin === 'Laki-laki' ? '♂️' : tx.jenisKelamin === 'Perempuan' ? '♀️' : tx.jenisKelamin === 'Lain-lain' ? '⚪' : ''}</div>
                          <div className="text-xs text-gray-500 mt-1">Kamar <span className="font-bold text-green-700">#{noKamar}</span></div>
                        </td>
                        <td className="p-4"><span className={`inline-block px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wider ${tx.type === 'kos' ? 'bg-orange-100 text-orange-800' : tx.tipeInap === 'transit' ? 'bg-purple-100 text-purple-800' : 'bg-green-100 text-green-800'}`}>{tx.type === 'kos' ? 'Kos Bulanan' : tx.tipeInap === 'transit' ? 'Transit' : 'Harian'}</span></td>
                        <td className="p-4"><div className="text-sm text-gray-600"><span className="text-green-600 font-bold">IN:</span> {isNaN(wMasuk) ? '-' : format(wMasuk, tx.tipeInap === 'transit' ? 'dd MMM yy, HH:mm' : 'dd MMM yy')}</div><div className="text-sm text-gray-600 mt-1"><span className="text-red-500 font-bold">OUT:</span> {isNaN(wKeluar) ? '-' : format(wKeluar, tx.tipeInap === 'transit' ? 'dd MMM yy, HH:mm' : 'dd MMM yy')}</div></td>
                        <td className="p-4">
                          {tx.isVoid ? (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-red-700 bg-red-100 px-2 py-1 rounded-full border border-red-300">❌ DIBATALKAN</span>
                          ) : isAktif ? (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded-full border border-green-200"><span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span> In-House</span>
                          ) : tx.statusDeposit === 'Belum Refund' ? (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-red-600 bg-red-50 px-2 py-1 rounded-full border border-red-200 animate-pulse">⚠️ Tahan Deposit</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded-full border border-gray-200">C/O Selesai</span>
                          )}
                        </td>
                        <td className="p-4 text-center">
                          <div className="flex justify-center gap-2">
                            <button onClick={() => setPrintData(tx)} className="bg-gray-800 hover:bg-black text-white p-2 rounded shadow-sm transition-colors text-sm" title="Cetak Struk">🖨️</button>
                            
                            {needsCheckout && (<button onClick={() => handleOpenCheckout(tx)} className={`bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded shadow-sm transition-colors text-sm font-bold flex items-center gap-1 shadow-red-600/30 ${!isAktif ? 'animate-pulse' : ''}`} title="Check-Out Tamu">🚪 C/O</button>)}
                            
                            {canUndo && (<button onClick={() => prosesUndoCheckout(tx)} className="bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-2 rounded shadow-sm transition-colors text-sm font-bold flex items-center gap-1" title="Batalkan Check-Out (Undo)">↩️ Undo C/O</button>)}

                            {!tx.isVoid && needsCheckout && (
                              <button onClick={() => setTransferModal({ isOpen: true, data: tx })} className="bg-orange-500 hover:bg-orange-600 text-white p-2 rounded shadow-sm transition-colors text-sm" title="Pindah Kamar (Room Transfer)">🔄</button>
                            )}

                            {!tx.isVoid && needsCheckout && (
                              <button onClick={() => handleOpenPayment(tx)} className="bg-emerald-600 hover:bg-emerald-700 text-white p-2 rounded shadow-sm transition-colors text-sm" title="Koreksi Data Pembayaran">💳</button>
                            )}

                            {!tx.isVoid && needsCheckout && (<button onClick={() => handleEditClick(tx)} className="bg-blue-600 hover:bg-blue-700 text-white p-2 rounded shadow-sm transition-colors text-sm" title="Edit / Extend">⚙️</button>)}
                            
                            {!tx.isVoid && (<button onClick={() => handleOpenVoid(tx)} className="bg-red-50 hover:bg-red-100 text-red-600 p-2 rounded transition-colors text-sm" title="Batalkan Transaksi (Void)">🚫</button>)}
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

        {/* MODAL KOREKSI PEMBAYARAN */}
        {paymentModal.isOpen && paymentModal.data && (
          <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl overflow-hidden flex flex-col max-h-[85vh]">
              <div className="p-5 bg-emerald-600 text-white flex justify-between items-center shrink-0">
                <div>
                  <h3 className="font-bold text-lg">💳 Koreksi Data Pembayaran</h3>
                  <p className="text-xs text-emerald-200 mt-1">Revisi cara bayar tanpa membatalkan transaksi.</p>
                </div>
                <button onClick={() => setPaymentModal({ isOpen: false, data: null })} className="text-white/70 hover:text-white font-bold text-2xl outline-none">&times;</button>
              </div>
              <div className="overflow-y-auto p-6 flex-1 space-y-4 bg-gray-50/50">

                <div className="bg-emerald-600 text-white p-4 rounded-xl shadow-md text-center">
                  <p className="text-[10px] font-bold uppercase tracking-widest mb-1 opacity-80">Grand Total Tagihan Kotor</p>
                  <h3 className="text-3xl font-black">Rp {payGrossTotal.toLocaleString('id-ID')}</h3>
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
                    <select value={payTipeDiskon} onChange={(e) => { setPayTipeDiskon(e.target.value); setPayDiskon(0); }} className="w-1/3 border border-gray-300 rounded p-2 text-sm outline-none focus:ring-1 focus:ring-emerald-500 font-bold text-gray-700">
                      <option value="nominal">Rp (Diskon)</option>
                      <option value="persen">% (Diskon)</option>
                    </select>
                    <input type="number" min="0" max={payTipeDiskon === 'persen' ? 100 : undefined} value={payDiskon === 0 ? '' : payDiskon} onChange={(e) => setPayDiskon(Number(e.target.value) || 0)} className="w-2/3 border border-gray-300 rounded p-2 text-sm outline-none focus:ring-1 focus:ring-emerald-500 font-bold" placeholder="Revisi Diskon Kamar..." />
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
                        {payDetailMetode.length > 1 && (<button onClick={() => setPayDetailMetode(payDetailMetode.filter(m => m.id !== item.id))} className="text-red-500 font-bold hover:text-red-700 bg-red-50 w-8 h-8 flex items-center justify-center rounded text-xl">&times;</button>)}
                      </div>
                    ))}
                  </div>

                  <div className={`text-xs font-bold text-right pt-2 border-t border-dashed border-gray-200 ${paySelisihKamar === 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {paySelisihKamar === 0 ? '✅ Nominal Pas' : (paySelisihKamar > 0 ? `⚠️ Kurang Rp ${paySelisihKamar.toLocaleString('id-ID')}` : `⚠️ Lebih Rp ${Math.abs(paySelisihKamar).toLocaleString('id-ID')}`)}
                  </div>
                </div>

                {payTambahan.length > 0 && (
                  <div className="bg-orange-50 p-4 rounded-xl border border-orange-200 shadow-sm">
                    <div className="flex justify-between items-center mb-3">
                      <span className="block text-xs font-bold text-orange-800 uppercase">Tagihan Ekstra / Tambahan</span>
                      <span className="text-sm font-black text-orange-800">Rp {payGrossTambahan.toLocaleString('id-ID')}</span>
                    </div>
                    <div className="space-y-2">
                      {payTambahan.map((t) => (
                        <div key={t.id} className="flex gap-2 items-center bg-white p-2 rounded border border-orange-100">
                          <div className="w-1/2 text-sm text-gray-700 truncate" title={t.nama}>{t.nama} <br/><span className="font-bold text-xs text-orange-600">Rp {t.jumlah.toLocaleString('id-ID')}</span></div>
                          <select value={t.metode} onChange={(e) => setPayTambahan(payTambahan.map(item => item.id === t.id ? { ...item, metode: e.target.value } : item))} className="w-1/2 border border-orange-200 rounded p-1.5 text-sm outline-none focus:ring-1 focus:ring-orange-500 bg-orange-50 font-bold text-orange-800">
                            <option value="Cash">Cash</option><option value="Transfer">Transfer</option><option value="QRIS">QRIS</option><option value="Debit/Kredit">Debit/Kredit</option>
                          </select>
                          <button onClick={() => setPayTambahan(payTambahan.filter(item => item.id !== t.id))} className="text-red-500 font-bold hover:bg-red-50 px-2 rounded-md transition-colors h-full flex items-center justify-center text-xl" title="Hapus Tagihan Ekstra ini">&times;</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="p-4 border-t border-gray-200 flex justify-end gap-3 bg-white shrink-0">
                <button onClick={() => setPaymentModal({ isOpen: false, data: null })} className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-bold hover:bg-gray-200 transition-colors">Batal</button>
                <button onClick={prosesPayment} disabled={isSaving} className="px-6 py-2.5 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700 shadow-md transition-colors">{isSaving ? 'Menyimpan...' : 'Simpan Koreksi'}</button>
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
                  <strong>Pilih Kamar Baru:</strong> Kamar berwarna abu-abu adalah kamar yang saat ini ditempati tamu. Kamar merah sedang terisi oleh tamu lain. Klik kamar hijau untuk memindahkan tamu.
                </div>
                {floors.length === 0 ? (
                  <div className="text-center text-gray-500 italic py-10">Belum ada denah kamar. Silakan atur di menu Pengaturan.</div>
                ) : (
                  floors.map((floor) => (
                    <div key={floor.id} className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                      <h4 className="font-extrabold text-gray-800 mb-4 pb-2 border-b-2 border-gray-100">{floor.nama}</h4>
                      {floor.kamar.length === 0 ? (<p className="text-xs text-gray-400 italic">Tidak ada kamar.</p>) : (
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4">
                          {floor.kamar.filter(k => k.no.trim() !== '').map((k) => {
                            const isOccupied = occupiedRooms.includes(k.no.trim());
                            const currentRoomNo = (transferModal.data.noKamar || transferModal.data.roomNumber).toString().trim();
                            const isCurrentRoom = k.no.trim() === currentRoomNo;
                            
                            return (
                              <button 
                                key={k.id} 
                                disabled={isOccupied || isCurrentRoom} 
                                onClick={() => handleSelectRoomTransfer(k.no.trim(), k.tipe)} 
                                className={`p-4 rounded-xl border-2 flex flex-col items-center justify-center transition-all ${isCurrentRoom ? 'bg-gray-100 border-gray-400 text-gray-500 cursor-not-allowed shadow-inner' : isOccupied ? 'bg-red-50 border-red-200 text-red-400 cursor-not-allowed opacity-80' : 'bg-white border-orange-300 text-orange-700 hover:bg-orange-50 hover:border-orange-600 hover:scale-105 shadow-sm cursor-pointer'}`}
                              >
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
                  <strong>Peringatan Audit:</strong> Membatalkan transaksi akan mengosongkan status kamar dan menarik nominal tagihan dari laporan pendapatan (Rp 0). Tindakan ini akan tercatat dalam log audit.
                </div>
                <label className="block text-xs font-bold text-red-700 uppercase mb-2">Alasan Pembatalan (Wajib)</label>
                <textarea rows="3" value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="Contoh: Tamu batal menginap / Kamar bermasalah dan tamu minta refund penuh..." className="w-full border border-red-300 rounded-lg p-3 text-sm outline-none focus:ring-2 focus:ring-red-500" required></textarea>
              </div>
              <div className="p-4 border-t border-gray-200 flex gap-3">
                <button onClick={() => setVoidModal({ isOpen: false, data: null })} className="w-1/3 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200">Tutup</button>
                <button onClick={prosesVoid} disabled={isSaving} className="w-2/3 py-3 bg-red-600 text-white rounded-xl font-black hover:bg-red-700 shadow-md">{isSaving ? 'Memproses...' : 'Ya, Batalkan Transaksi'}</button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL PROSES CHECK-OUT INSTAN */}
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
                      <option value="Cash">Cash</option>
                      <option value="Transfer">Transfer BCA / Bank Lain</option>
                    </select>
                  </div>
                )}

                {coStatusDeposit === 'Deposit Hangus' && (
                  <div className="bg-red-50 p-4 rounded-xl border border-red-200 animate-fade-in">
                    <label className="block text-xs font-bold text-red-700 uppercase mb-2">Alasan Dihanguskan (Wajib)</label>
                    <input type="text" value={coAlasanHangus} onChange={(e) => setCoAlasanHangus(e.target.value)} placeholder="Cth: Telat C/O, Seprai Kotor, dll..." className="w-full border border-red-300 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-red-500" required />
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

        {/* MODAL EDIT & FINANCIAL CORRECTION */}
        {editModal.isOpen && editModal.data && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl overflow-hidden animate-fade-in">
              <div className="p-5 bg-blue-800 text-white flex justify-between items-center">
                <h3 className="font-bold text-lg">⚙️ Ralat Data & Extend Kamar</h3>
                <button onClick={() => setEditModal({ isOpen: false, data: null })} className="text-white/70 hover:text-white font-bold text-2xl outline-none">&times;</button>
              </div>
              
              <div className="p-6 space-y-5 bg-gray-50/50 max-h-[75vh] overflow-y-auto">
                <div className="bg-blue-50 p-3 rounded-lg border border-blue-200 text-xs text-blue-800 shadow-sm">
                  <strong>Info Cerdas:</strong> Fitur Extend telah dilengkapi Kalkulator Otomatis. Tagihan tambahan akan langsung terekam ke dompet kasir dan struk.
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-sm font-bold text-gray-700 mb-1">Nomor Kamar</label><input type="text" value={editNoKamar} disabled className="w-full bg-gray-100 border border-gray-300 rounded-md p-2 outline-none text-gray-500 cursor-not-allowed" title="Gunakan tombol Pindah Kamar (🔄) di tabel untuk mengubah nomor kamar." /></div>
                  <div><label className="block text-sm font-bold text-gray-700 mb-1">Gender</label><select value={editJenisKelamin} onChange={(e) => setEditJenisKelamin(e.target.value)} className="w-full bg-white border border-gray-300 rounded-md p-2 outline-none focus:ring-2 focus:ring-blue-500"><option value="" disabled hidden>- Pilih -</option><option value="Laki-laki">Laki-laki</option><option value="Perempuan">Perempuan</option><option value="Lain-lain">Lain-lain</option></select></div>
                </div>

                <div className="grid grid-cols-4 gap-4 items-start">
                  {editModal.data.tipeInap === 'transit' ? (
                    <div className="col-span-1">
                       <label className="block text-sm font-bold text-gray-700 mb-1">Durasi</label>
                       <div className="flex flex-col gap-1.5">
                         <button type="button" onClick={handleExtendTransit} className="w-full bg-purple-100 hover:bg-purple-200 text-purple-800 font-extrabold py-2 rounded-md text-xs shadow-sm transition-transform active:scale-95">+ 6 Jam</button>
                         {transitExtendCount > 0 && <button type="button" onClick={handleUndoTransit} className="w-full bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold py-1.5 rounded-md text-xs transition-colors">↩ Undo</button>}
                       </div>
                    </div>
                  ) : editModal.data.type === 'harian' && (
                    <div className="col-span-1">
                      <label className="block text-sm font-bold text-gray-700 mb-1">Durasi</label>
                      <input type="number" min="1" value={editDurasiMalam} onChange={(e) => { const v = parseInt(e.target.value) || 1; setEditDurasiMalam(v); hitungUlangKeluarHarian(v); }} className="w-full bg-white border border-gray-300 rounded-md p-2 outline-none focus:ring-2 focus:ring-blue-500 text-center font-bold text-blue-700 h-[42px]" />
                    </div>
                  )}
                  
                  <div className={editModal.data.type === 'kos' ? "col-span-4" : "col-span-3"}>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Waktu Keluar (Check-Out)</label>
                    <CustomDateTimePicker 
                      value={editWaktuKeluar} 
                      onChange={(val) => setEditWaktuKeluar(val)} 
                      includeTime={editModal.data.type !== 'kos'} 
                      readOnly={editModal.data.type === 'kos'}
                    />
                  </div>
                </div>

                {((editModal.data.type === 'harian' && editDurasiMalam > originalDurasi) || (editModal.data.tipeInap === 'transit' && transitExtendCount > 0)) && (
                  <div className="bg-green-50 p-4 rounded-xl border-2 border-green-400 mt-2 shadow-sm animate-fade-in col-span-2">
                    <h4 className="font-black text-green-800 mb-3 uppercase tracking-wide text-sm">💸 Tagihan Extend Kamar ({editModal.data.tipeInap === 'transit' ? `+${transitExtendCount * 6} Jam` : `+${editDurasiMalam - originalDurasi} Malam`})</h4>
                    <div className="flex gap-4">
                      <div className="w-1/2"><label className="block text-xs font-bold text-green-700 mb-1">Nominal (Dihitung Otomatis)</label><input type="number" value={editExtendFee} onChange={(e) => setEditExtendFee(Number(e.target.value))} className="w-full border border-green-400 rounded-md p-2 text-sm outline-none focus:ring-2 focus:ring-green-600 bg-white font-bold text-green-800" /></div>
                      <div className="w-1/2"><label className="block text-xs font-bold text-green-700 mb-1">Pelunasan Via</label><select value={editExtendMethod} onChange={(e) => setEditExtendMethod(e.target.value)} className="w-full border border-green-400 rounded-md p-2 text-sm outline-none focus:ring-2 focus:ring-green-600 bg-white font-bold text-green-800"><option value="Cash">Cash</option><option value="Transfer">Transfer</option><option value="QRIS">QRIS</option><option value="Debit/Kredit">Debit/Kredit</option></select></div>
                    </div>
                    <p className="text-[10px] text-green-600 mt-3 font-medium">Nominal dihitung dari Rate Engine saat ini, namun bisa Anda edit. Jika disimpan, tagihan ini akan dijumlahkan dengan struk lama.</p>
                  </div>
                )}

                <div><label className="block text-sm font-bold text-gray-700 mb-1">Status Deposit Jaminan</label><select value={editStatusDeposit} onChange={(e) => setEditStatusDeposit(e.target.value)} className="w-full bg-white border border-gray-300 rounded-md p-2 outline-none focus:ring-2 focus:ring-blue-500"><option value="Belum Refund">Belum Refund (Di Tangan Kasir)</option><option value="Sudah Dikembalikan">✅ Sudah Dikembalikan ke Tamu</option><option value="Deposit Hangus">❌ Deposit Hangus (Denda/Kotor)</option></select></div>
                <div><label className="block text-sm font-bold text-gray-700 mb-1">Catatan Tambahan (Info)</label><input type="text" value={editInfo} onChange={(e) => setEditInfo(e.target.value)} className="w-full bg-white border border-gray-300 rounded-md p-2 outline-none focus:ring-2 focus:ring-blue-500" placeholder="Opsional..." /></div>
              </div>

              <div className="p-5 border-t border-gray-100 flex justify-end gap-3 bg-white">
                <button onClick={() => setEditModal({ isOpen: false, data: null })} className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-bold hover:bg-gray-200 transition-colors">Batal</button>
                <button onClick={simpanPerubahan} disabled={isSaving} className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 shadow-md transition-colors">{isSaving ? 'Menyimpan...' : 'Simpan Perubahan'}</button>
              </div>
            </div>
          </div>
        )}
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
              <button onClick={() => setPrintData(null)} className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded font-bold transition-colors">Tutup Preview</button>
              <button onClick={() => window.print()} className="bg-green-600 hover:bg-green-500 px-5 py-2 rounded font-bold flex items-center gap-2 shadow-md transition-colors"><span>🖨️</span> Cetak Sekarang</button>
            </div>
          </div>
          
          <div className="flex-1 overflow-auto flex justify-center py-8 print:!static print:!block print:!p-0 print:!m-0 print:!overflow-visible print:!h-auto print:!w-full">
            <div className="bg-white w-full max-w-[195mm] min-h-[138mm] mx-auto p-6 shadow-2xl mb-10 print:!max-w-[195mm] print:!w-[195mm] print:!shadow-none print:!m-0 print:!p-0 print:!min-h-0 print:!h-auto flex flex-col font-sans text-sm print:text-[10px] relative receipt-box">
              <div className="border-b border-black pb-1 mb-3 print:mb-2 flex justify-between items-end"><div className="flex-shrink-0"><img src="/logo.png" alt="Greenhaus Inn" className="h-28 print:h-14 w-auto object-contain mix-blend-multiply" /></div><div className="text-right"><p className="text-sm print:text-[9px] font-medium text-gray-800 print:text-black leading-tight">Jl. Dinoyo No.86, Keputran, Surabaya</p><p className="text-sm print:text-[11px] font-extrabold uppercase mt-0.5 tracking-wide text-gray-900 print:text-black leading-tight">Tanda Terima Pembayaran</p></div></div>
              <div className="flex justify-between mb-6 print:mb-2">
                <div><table className="text-sm print:text-[10px]"><tbody><tr><td className="pr-4 font-bold text-gray-600 print:text-black">No. Transaksi</td><td>: {printData.id}</td></tr><tr><td className="pr-4 font-bold text-gray-600 print:text-black">Tipe Inap</td><td>: {toTitleCase(printData.tipeInap || 'kos')}</td></tr><tr><td className="pr-4 font-bold text-gray-600 print:text-black">Waktu Masuk</td><td>: {(() => { const dateVal = printData.type === 'harian' ? printData.checkIn : printData.periodeStart; const d = new Date(dateVal); return isNaN(d) ? '-' : format(d, 'dd/MM/yyyy HH:mm'); })()}</td></tr><tr><td className="pr-4 font-bold text-gray-600 print:text-black">Waktu Keluar</td><td>: {(() => { const dateVal = printData.type === 'harian' ? printData.checkOut : (printData.periodeEnd ? printData.periodeEnd + 'T12:00:00' : null); const d = new Date(dateVal); return isNaN(d) ? '-' : format(d, 'dd/MM/yyyy HH:mm'); })()}</td></tr></tbody></table></div>
                <div>
                  <table className="text-sm print:text-[10px]">
                    <tbody>
                      <tr><td className="pr-4 font-bold text-gray-600 print:text-black">Nama Tamu</td><td className="font-bold">: {toTitleCase(printData.nama)}</td></tr>
                      <tr><td className="pr-4 font-bold text-gray-600 print:text-black">Kamar</td><td className="font-bold">: #{printData.type === 'harian' ? printData.noKamar : printData.roomNumber}</td></tr>
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
                    {printData.pembayaran?.rincianTarifHarian && printData.pembayaran.rincianTarifHarian.length > 0 ? ( printData.pembayaran.rincianTarifHarian.map((malam, idx) => ( <tr key={`mlm-${idx}`} className="border-b border-gray-100 print:border-black"><td className="p-2 print:px-1 print:py-0.5 print:border-black">Sewa Kamar #{printData.noKamar} (Malam {idx + 1}) - {!isNaN(new Date(malam.tanggal)) ? format(new Date(malam.tanggal), 'dd/MM/yy') : '-'} <span className="text-[9px] uppercase">({malam.jenis})</span></td><td className="p-2 print:px-1 print:py-0.5 text-right print:border-black">{formatRp(malam.harga)}</td></tr>)) ) : ( <tr className="border-b border-gray-100 print:border-black"><td className="p-2 print:px-1 print:py-0.5 print:border-black">Sewa Kamar #{printData.type === 'harian' ? printData.noKamar : printData.roomNumber}</td><td className="p-2 print:px-1 print:py-0.5 text-right print:border-black">{formatRp(printData.pembayaran?.jumlahKamar)}</td></tr> )}
                    {printData.pembayaran?.tambahan && printData.pembayaran.tambahan.map((t, idx) => ( <tr key={`tambahan-${idx}`} className="border-b border-gray-100 print:border-black"><td className="p-2 print:px-1 print:py-0.5 print:border-black">Tambahan: {t.nama} <span className="text-[10px] print:text-[8px] uppercase font-bold text-gray-600 print:text-gray-800">({t.metode || '-'})</span></td><td className="p-2 print:px-1 print:py-0.5 text-right print:border-black">{formatRp(t.jumlah)}</td></tr> ))}
                    
                    {printData.pembayaran?.diskon > 0 && (
                      <tr className="bg-red-50 text-red-700 font-bold print:bg-white print:text-black">
                        <td className="p-2 print:px-1 print:py-0.5 text-right print:border-black">POTONGAN DISKON (-):</td>
                        <td className="p-2 print:px-1 print:py-0.5 text-right print:border-black">- {formatRp(printData.pembayaran.diskon)}</td>
                      </tr>
                    )}
                    
                    <tr className="bg-gray-50 font-bold print:bg-white print:border-t-2 print:border-black"><td className="p-2 print:px-1 print:py-0.5 text-right text-[#1a4b1a] print:text-black print:border-black">TOTAL TAGIHAN NETTO:</td><td className="p-2 print:px-1 print:py-0.5 text-right text-[#1a4b1a] print:text-black print:border-black">{formatRp((printData.pembayaran?.jumlahKamar || 0) + (printData.pembayaran?.tambahan || []).reduce((sum, item) => sum + item.jumlah, 0) - (printData.pembayaran?.diskon || 0))}</td></tr>
                    {(() => { 
                      const summary = {}; 
                      if (printData.pembayaran?.detailMetodeKamar?.length > 0) { 
                        printData.pembayaran.detailMetodeKamar.forEach(m => { const met = m.metode || 'Cash'; summary[met] = (summary[met] || 0) + (Number(m.nominal) || 0); }); 
                      } else { 
                        const met = printData.pembayaran?.metodeKamar || '-'; summary[met] = (summary[met] || 0) + (Number(printData.pembayaran?.jumlahKamar) || 0) - (printData.pembayaran?.diskon || 0); 
                      } 
                      if (printData.pembayaran?.tambahan && printData.pembayaran.tambahan.length > 0) { 
                        printData.pembayaran.tambahan.forEach(t => { const met = t.metode || 'Cash'; summary[met] = (summary[met] || 0) + (Number(t.jumlah) || 0); }); 
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