import { useState, useEffect } from 'react';
import { addDays, addHours, addMonths, format, subDays, isSameDay } from 'date-fns';
import { DAFTAR_KOTA_INDONESIA } from '../data/kotaIndonesia';

const roomTypeLabels = {
  'double-bed': 'Standard 2 Orang Double Bed',
  'twin-bed': 'Standard 2 Orang Twin Bed',
  'single-bed': 'Standard 1 Orang Single Bed'
};

const toTitleCase = (str) => str.toLowerCase().replace(/\b\w/g, s => s.toUpperCase());

// HELPER: Fungsi pintar kalkulasi waktu keluar
const hitungWaktuKeluar = (tglStr, tipe, durasiMalam = 1) => {
  if (!tglStr) return '';
  const dateMasuk = new Date(tglStr);
  let dateKeluar;
  if (tipe === 'harian') {
    if (dateMasuk.getHours() < 12) { 
      dateKeluar = new Date(dateMasuk); 
      dateKeluar = addDays(dateKeluar, durasiMalam - 1);
      dateKeluar.setHours(12, 0, 0, 0); 
    } 
    else { 
      dateKeluar = addDays(dateMasuk, durasiMalam); 
      dateKeluar.setHours(12, 0, 0, 0); 
    }
  } else if (tipe === 'transit') {
    dateKeluar = addHours(dateMasuk, 6);
  } else if (tipe === 'kos') {
    let actualStart = new Date(dateMasuk);
    if (dateMasuk.getHours() < 12) actualStart = subDays(actualStart, 1);
    dateKeluar = addMonths(actualStart, 1);
  }
  return format(dateKeluar, "yyyy-MM-dd'T'HH:mm");
};

export default function FormCheckIn() {
  const [tipeInap, setTipeInap] = useState('harian'); 

  // Inisialisasi State Tanpa Warning
  const initSekarang = new Date();
  const initWaktuMasuk = format(initSekarang, "yyyy-MM-dd'T'HH:mm");
  
  const [nama, setNama] = useState('');
  const [jenisKelamin, setJenisKelamin] = useState(''); // STATE JENIS KELAMIN
  const [waktuMasuk, setWaktuMasuk] = useState(initWaktuMasuk);
  const [waktuKeluar, setWaktuKeluar] = useState(hitungWaktuKeluar(initWaktuMasuk, 'harian')); 
  const [durasiMalam, setDurasiMalam] = useState(1);
  const [tipeKamar, setTipeKamar] = useState('double-bed');
  const [noKamar, setNoKamar] = useState('');
  
  const [pernahCI, setPernahCI] = useState(false);
  const [bookingBy, setBookingBy] = useState('Walk-in');
  const [tamuDari, setTamuDari] = useState(''); 
  const [info, setInfo] = useState('Lewat Depan Hotel');
  
  const [detailMetodeKamar, setDetailMetodeKamar] = useState(() => [{ id: Date.now(), metode: 'Cash', nominal: 0 }]);
  const [metodeDeposit, setMetodeDeposit] = useState('Cash');
  const [tambahanList, setTambahanList] = useState([]);

  const [databaseTamu, setDatabaseTamu] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const [isCityModalOpen, setIsCityModalOpen] = useState(false);
  const [citySearch, setCitySearch] = useState('');
  const [cityPage, setCityPage] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  
  const [otaList, setOtaList] = useState([]);
  const [depositDefault, setDepositDefault] = useState(0);
  
  const [hargaDinamis, setHargaDinamis] = useState({ 
    harianWeekday: {}, harianWeekend: {}, 
    transitWeekday: {}, transitWeekend: {}, 
    kos: {} 
  });
  const [weekendDays, setWeekendDays] = useState([5, 6, 0]);

  const [floors, setFloors] = useState([]);
  const [occupiedRooms, setOccupiedRooms] = useState([]);
  const [isRoomModalOpen, setIsRoomModalOpen] = useState(false);

  const [previewText, setPreviewText] = useState('Memuat laporan in-house terbaru...');
  const [refreshPreviewTrigger, setRefreshPreviewTrigger] = useState(0);

  // LOAD SETTINGS
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch('http://localhost:5000/api/data');
        if (res.ok) {
          const data = await res.json();
          const s = data.settings || {};
          setOtaList((s.otaList || []).map(ota => typeof ota === 'string' ? ota : ota.nama)); 
          setDepositDefault(s.depositDefault || 0);
          
          setHargaDinamis({ 
            harianWeekday: s.prices?.harianWeekday || s.prices?.harian || { 'double-bed': 0, 'twin-bed': 0, 'single-bed': 0 },
            harianWeekend: s.prices?.harianWeekend || s.prices?.harian || { 'double-bed': 0, 'twin-bed': 0, 'single-bed': 0 },
            transitWeekday: s.prices?.transitWeekday || s.prices?.transit || { 'double-bed': 0, 'twin-bed': 0, 'single-bed': 0 },
            transitWeekend: s.prices?.transitWeekend || s.prices?.transit || { 'double-bed': 0, 'twin-bed': 0, 'single-bed': 0 },
            kos: s.prices?.kos || { 'double-bed': 0, 'twin-bed': 0, 'single-bed': 0 }
          });
          setWeekendDays(s.weekendDays !== undefined ? s.weekendDays : [5, 6, 0]);
          setFloors(s.floors || []);

          // SMART SEARCH CRM
          const allTx = [...(data.dailyTransactions || []), ...(data.activeKost || [])];
          const uniqueGuests = [];
          const map = new Map();
          allTx.forEach(tx => {
            const key = (tx.nama || '').toLowerCase().trim();
            if (key && !map.has(key)) {
              map.set(key, true);
              uniqueGuests.push({ nama: tx.nama, tamuDari: tx.tamuDari || tx.alamatKantor || '' });
            }
          });
          setDatabaseTamu(uniqueGuests);
        }
      } catch (error) { console.error("Gagal memuat pengaturan:", error); } finally { setIsLoadingSettings(false); }
    };
    fetchSettings();
  }, []);

  // PERAKIT PREVIEW LAPORAN
  useEffect(() => {
    const buildPreview = async () => {
      try {
        const res = await fetch('http://localhost:5000/api/data');
        if (!res.ok) throw new Error("Gagal ambil data preview");
        const db = await res.json();
        
        const settings = db.settings || {};
        const totalRooms = settings.totalRooms || { 'double-bed': 0, 'twin-bed': 0, 'single-bed': 0 };
        const sekarang = new Date();
        const occ = []; 
        const terisiCount = { 'double-bed': 0, 'twin-bed': 0, 'single-bed': 0 };

        const tamuHarianAktif = (db.dailyTransactions || []).filter(tx => {
          if (!tx.checkIn || !tx.checkOut) return false;
          const ci = new Date(tx.checkIn); const co = new Date(tx.checkOut);
          if (sekarang <= co) { terisiCount[tx.tipeKamar] = (terisiCount[tx.tipeKamar] || 0) + 1; occ.push(tx.noKamar.toString().trim()); }
          return (sekarang >= ci && sekarang <= co) || (sekarang > co && isSameDay(co, sekarang));
        });

        const tamuKosAktif = (db.activeKost || []).filter(kos => {
          if (!kos.periodeStart || !kos.periodeEnd) return false;
          const start = new Date(kos.periodeStart); start.setHours(12,0,0,0);
          const end = new Date(kos.periodeEnd); end.setHours(12,0,0,0);
          if (sekarang <= end) { terisiCount[kos.roomType] = (terisiCount[kos.roomType] || 0) + 1; occ.push(kos.roomNumber.toString().trim()); }
          return (sekarang >= start && sekarang <= end) || (sekarang > end && isSameDay(end, sekarang));
        });

        setOccupiedRooms(occ);

        const sisaDouble = Math.max(0, totalRooms['double-bed'] - (terisiCount['double-bed'] || 0));
        const sisaTwin = Math.max(0, totalRooms['twin-bed'] - (terisiCount['twin-bed'] || 0));
        const sisaSingle = Math.max(0, totalRooms['single-bed'] - (terisiCount['single-bed'] || 0));
        const totalSisa = sisaDouble + sisaTwin + sisaSingle;

        const namaHari = new Intl.DateTimeFormat('id-ID', { weekday: 'long' }).format(sekarang);
        const tanggalLengkap = format(sekarang, 'dd/MM/yyyy');

        let teks = `INFO BOOKING *Greenhaus Inn*\n\nHari ${namaHari}\n\nTanggal ${tanggalLengkap}\n\nBooking ${tamuHarianAktif.length} Kamar\n\n\n\n`;

        tamuHarianAktif.forEach((tx, i) => {
          const ciDate = new Date(tx.checkIn); const coDate = new Date(tx.checkOut);
          const isSudahCO = sekarang > coDate;
          let formattedCi = (tx.tipeInap === 'transit') ? format(ciDate, 'dd/MM/yy HH:mm') : format((ciDate.getHours() < 13 ? subDays(ciDate, 1) : ciDate), 'dd/MM/yy');
          const formattedCo = tx.tipeInap === 'transit' ? format(coDate, 'dd/MM/yy HH:mm') : format(coDate, 'dd/MM/yy');
          const hrgDep = (tx.pembayaran?.jumlahDeposit || 0).toLocaleString('id-ID');
          
          let teksBayarKamar = (tx.pembayaran?.detailMetodeKamar && tx.pembayaran.detailMetodeKamar.length > 0) 
            ? tx.pembayaran.detailMetodeKamar.map(m => `${m.metode} Rp ${Number(m.nominal).toLocaleString('id-ID')} (Kamar)`).join(' + ')
            : `${tx.pembayaran?.metodeKamar || '-'} Rp ${(tx.pembayaran?.jumlahKamar || 0).toLocaleString('id-ID')} (Kamar)`;

          let teksTambahan = '';
          if (tx.pembayaran?.tambahan && tx.pembayaran.tambahan.length > 0) tx.pembayaran.tambahan.forEach(t => { teksTambahan += ` + ${t.metode} Rp ${t.jumlah.toLocaleString('id-ID')} (${t.nama})`; });

          teks += `${i + 1}. Nama Tamu : ${tx.nama}\nBooking By : ${tx.bookingBy}\nCheck-In : ${formattedCi}\nCheck-Out : ${formattedCo}\nRoom Type : ${roomTypeLabels[tx.tipeKamar] || tx.tipeKamar} #${tx.noKamar}\nPembayaran : ${teksBayarKamar} + ${tx.pembayaran?.metodeDeposit} Rp ${hrgDep} (Deposit)${teksTambahan}\nTamu dari : ${tx.tamuDari || '-'}\nInfo : *${isSudahCO ? `${tx.info || '-'} - Sudah C/O, Kamar Ready` : (tx.info || '-')}*\n\n\n\n`;
        });

        teks += `Sisa Kamar : ${totalSisa} Kamar\n\n\n\nStandard Double Bed : ${sisaDouble}\nStandard Twin Bed : ${sisaTwin}\nStandard Single Bed : ${sisaSingle}\n\n\n\n-----\n\n\n\nKost :\n`;

        tamuKosAktif.forEach((kos, i) => {
          const num = (i + 1).toString().padStart(2, '0');
          const start = format(new Date(kos.periodeStart), 'dd/MM/yyyy'); const end = format(new Date(kos.periodeEnd), 'dd/MM/yyyy');
          const hrgDep = (kos.pembayaran?.jumlahDeposit || 0).toLocaleString('id-ID');

          const endDateTime = new Date(kos.periodeEnd); endDateTime.setHours(12,0,0,0);
          
          let teksBayarKamar = (kos.pembayaran?.detailMetodeKamar && kos.pembayaran.detailMetodeKamar.length > 0) 
            ? kos.pembayaran.detailMetodeKamar.map(m => `${m.metode} Rp ${Number(m.nominal).toLocaleString('id-ID')} (Kamar)`).join(' + ')
            : `${kos.pembayaran?.metodeKamar || '-'} Rp ${(kos.pembayaran?.jumlahKamar || 0).toLocaleString('id-ID')} (Kamar)`;

          let teksTambahan = '';
          if (kos.pembayaran?.tambahan && kos.pembayaran.tambahan.length > 0) kos.pembayaran.tambahan.forEach(t => { teksTambahan += ` + ${t.metode} Rp ${t.jumlah.toLocaleString('id-ID')} (${t.nama})`; });

          teks += `${num}. Nama : ${kos.nama}\nPeriode : ${start} - ${end}\nRoom Type : ${roomTypeLabels[kos.roomType] || kos.roomType} #${kos.roomNumber}\nPembayaran : ${teksBayarKamar} + ${kos.pembayaran?.metodeDeposit} Rp ${hrgDep} (Deposit)${teksTambahan}${sekarang > endDateTime ? `\nInfo : *Sudah C/O, Kamar Ready*` : ''}\n\n`;
        });

        setPreviewText(teks.trim());
      } catch (err) { console.error(err); setPreviewText("Gagal merakit laporan."); }
    };
    buildPreview();
  }, [refreshPreviewTrigger]);

  // LOGIKA DYNAMIC PRICING
  let totalTagihanKamar = 0;
  let isTransitWeekend = false;
  let rincianMalam = { weekday: 0, weekend: 0 }; 
  let rincianTarifHarian = []; 

  if (tipeInap === 'kos') {
    totalTagihanKamar = hargaDinamis.kos?.[tipeKamar] || 0;
  } 
  else if (tipeInap === 'transit') {
    let effectiveDate = new Date(waktuMasuk || new Date());
    if (effectiveDate.getHours() < 12) effectiveDate = subDays(effectiveDate, 1);
    isTransitWeekend = weekendDays.includes(effectiveDate.getDay());
    totalTagihanKamar = isTransitWeekend ? (hargaDinamis.transitWeekend?.[tipeKamar] || 0) : (hargaDinamis.transitWeekday?.[tipeKamar] || 0);
  } 
  else if (tipeInap === 'harian') {
    let baseDate = new Date(waktuMasuk || new Date());
    if (baseDate.getHours() < 12) baseDate = subDays(baseDate, 1);
    
    const tarifWd = hargaDinamis.harianWeekday?.[tipeKamar] || 0;
    const tarifWe = hargaDinamis.harianWeekend?.[tipeKamar] || 0;

    for (let i = 0; i < durasiMalam; i++) {
      const nightDate = addDays(baseDate, i);
      if (weekendDays.includes(nightDate.getDay())) {
        totalTagihanKamar += tarifWe;
        rincianMalam.weekend += 1;
        rincianTarifHarian.push({ tanggal: nightDate.toISOString(), jenis: 'Weekend', harga: tarifWe });
      } else {
        totalTagihanKamar += tarifWd;
        rincianMalam.weekday += 1;
        rincianTarifHarian.push({ tanggal: nightDate.toISOString(), jenis: 'Weekday', harga: tarifWd });
      }
    }
  }

  // STATE TRACKER
  const [prevTotalTagihan, setPrevTotalTagihan] = useState(totalTagihanKamar);
  if (totalTagihanKamar !== prevTotalTagihan) {
    setPrevTotalTagihan(totalTagihanKamar);
    if (detailMetodeKamar.length === 1 && detailMetodeKamar[0].nominal !== totalTagihanKamar) {
      setDetailMetodeKamar(prev => [{ ...prev[0], nominal: totalTagihanKamar }]);
    }
  }

  // HANDLERS CERDAS
  const handleTipeInapChange = (tipe) => {
    setTipeInap(tipe);
    setWaktuKeluar(hitungWaktuKeluar(waktuMasuk, tipe, durasiMalam));
  };

  const handleWaktuMasukChange = (val) => {
    setWaktuMasuk(val);
    setWaktuKeluar(hitungWaktuKeluar(val, tipeInap, durasiMalam));
  };

  const handleDurasiMalamChange = (e) => {
    const malam = parseInt(e.target.value) || 1;
    setDurasiMalam(malam);
    setWaktuKeluar(hitungWaktuKeluar(waktuMasuk, tipeInap, malam));
  };

  const setKeWaktuSekarang = () => {
    const nowStr = format(new Date(), "yyyy-MM-dd'T'HH:mm");
    setWaktuMasuk(nowStr);
    setWaktuKeluar(hitungWaktuKeluar(nowStr, tipeInap, durasiMalam));
  };

  const updateInfoText = (statusPernahCI, sumberBooking) => {
    if (statusPernahCI) setInfo('Pernah C/I');
    else if (sumberBooking === 'Walk-in' || sumberBooking === 'WA') setInfo('Lewat Depan Hotel');
    else if (otaList.includes(sumberBooking)) setInfo(sumberBooking);
  };
  
  const handleBookingByChange = (e) => {
    const nilaiBaru = e.target.value; setBookingBy(nilaiBaru);
    if (nilaiBaru === 'Walk-in' || nilaiBaru === 'WA') setDetailMetodeKamar([{ id: Date.now(), metode: 'Cash', nominal: totalTagihanKamar }]); 
    else if (otaList.includes(nilaiBaru)) setDetailMetodeKamar([{ id: Date.now(), metode: nilaiBaru, nominal: totalTagihanKamar }]);
    updateInfoText(pernahCI, nilaiBaru);
  };

  const handleSelectRoom = (kamarNo, kamarTipe) => { setNoKamar(kamarNo); setTipeKamar(kamarTipe); setIsRoomModalOpen(false); };
  const handleSelectCity = (kota) => { setTamuDari(kota); setIsCityModalOpen(false); setCitySearch(''); setCityPage(1); };

  const tambahBiaya = () => setTambahanList([...tambahanList, { id: Date.now(), nama: '', metode: 'Transfer', jumlah: 0 }]);
  const updateBiaya = (id, field, value) => setTambahanList(tambahanList.map(item => item.id === id ? { ...item, [field]: value } : item));
  const hapusBiaya = (id) => setTambahanList(tambahanList.filter(item => item.id !== id));

  const totalBayarKamar = detailMetodeKamar.reduce((sum, item) => sum + (Number(item.nominal) || 0), 0);
  const selisihBayar = totalTagihanKamar - totalBayarKamar;

  const handleSimpan = async () => {
    if (!nama || !waktuMasuk || !noKamar) return alert("Mohon lengkapi Nama Tamu, Nomor Kamar, dan Waktu Masuk terlebih dahulu.");
    
    if (totalBayarKamar !== totalTagihanKamar) {
      return alert(`❌ Validasi Pembayaran Gagal!\n\nTotal Tagihan: Rp ${totalTagihanKamar.toLocaleString('id-ID')}\nTotal Dibayar: Rp ${totalBayarKamar.toLocaleString('id-ID')}\n\nNominal yang diinput tidak sesuai! (Selisih: Rp ${selisihBayar.toLocaleString('id-ID')})`);
    }

    const nomorKamarBersih = noKamar.trim();
    const waktuCI = new Date(waktuMasuk);
    const waktuCO = new Date(waktuKeluar);
    
    if (waktuCO <= waktuCI) return alert("LOGIKA BENTROK: Waktu Keluar tidak boleh mendahului waktu Masuk!");
    if (waktuCI > new Date()) return alert("LOGIKA BENTROK: Waktu Masuk tidak boleh berada di masa depan atau melebihi waktu komputer saat ini!");

    setIsSaving(true);
    try {
      const getRes = await fetch('http://localhost:5000/api/data');
      if (!getRes.ok) throw new Error("Gagal koneksi server");
      const dbData = await getRes.json();

      const adaTamuHarianBentrok = (dbData.dailyTransactions || []).some(tx => {
        if (tx.noKamar.toString().trim() === nomorKamarBersih) {
          const start = new Date(tx.checkIn); const end = new Date(tx.checkOut);
          return waktuCI >= start && waktuCI <= end;
        }
        return false;
      });
      
      const adaTamuKosBentrok = (dbData.activeKost || []).some(kos => {
        if (kos.roomNumber.toString().trim() === nomorKamarBersih) {
          const start = new Date(kos.periodeStart); start.setHours(12, 0, 0, 0);
          const end = new Date(kos.periodeEnd); end.setHours(12, 0, 0, 0);
          return waktuCI >= start && waktuCI <= end;
        }
        return false;
      });

      if (adaTamuHarianBentrok || adaTamuKosBentrok) {
        setIsSaving(false); return alert(`PEMBERITAHUAN: Kamar #${nomorKamarBersih} TIDAK TERSEDIA. Masih ada Tamu Aktif di dalam rentang waktu tersebut!`);
      }

      const gabunganMetode = detailMetodeKamar.map(m => m.metode).filter((v, i, a) => a.indexOf(v) === i).join(' & ');

      if (tipeInap === 'harian' || tipeInap === 'transit') {
        const transaksiBaru = {
          id: `TX-${Date.now()}`, waktuInput: new Date().toISOString(), 
          nama, pernahCI, bookingBy, tamuDari, noKamar: nomorKamarBersih, 
          checkIn: waktuMasuk, checkOut: waktuKeluar, tipeInap, tipeKamar, info,
          noTelp: '', profesi: '', nik: '', tanggalLahir: '', jenisKelamin: jenisKelamin || '-', alamatLengkap: '', statusDeposit: 'Belum Refund',
          pembayaran: { metodeKamar: gabunganMetode, detailMetodeKamar, jumlahKamar: totalTagihanKamar, metodeDeposit, jumlahDeposit: depositDefault, tambahan: tambahanList.filter(t => t.nama && t.jumlah > 0), rincianTarifHarian }
        };
        if (!dbData.dailyTransactions) dbData.dailyTransactions = [];
        dbData.dailyTransactions.push(transaksiBaru);
      }
      else if (tipeInap === 'kos') {
        let actualStart = new Date(waktuMasuk);
        if (actualStart.getHours() < 12) actualStart = subDays(actualStart, 1);
        
        const transaksiBaru = { 
          id: `KOS-${Date.now()}`, waktuInput: new Date().toISOString(), 
          nama, roomType: tipeKamar, roomNumber: nomorKamarBersih, waktuMasuk, 
          periodeStart: format(actualStart, 'yyyy-MM-dd'), periodeEnd: format(waktuKeluar, 'yyyy-MM-dd'), 
          tamuDari,
          noTelp: '', profesi: '', alamatKantor: '', nik: '', tanggalLahir: '', jenisKelamin: jenisKelamin || '-', alamatLengkap: '', statusDeposit: 'Belum Refund',
          pembayaran: { metodeKamar: gabunganMetode, detailMetodeKamar, jumlahKamar: totalTagihanKamar, metodeDeposit, jumlahDeposit: depositDefault, tambahan: tambahanList.filter(t => t.nama && t.jumlah > 0) } 
        };
        if (!dbData.activeKost) dbData.activeKost = [];
        dbData.activeKost.push(transaksiBaru);
      }

      const postRes = await fetch('http://localhost:5000/api/data/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dbData) });
      const result = await postRes.json();
      
      if (result.success) {
        alert("Penerimaan Tamu Berhasil!");
        setNama(''); setJenisKelamin(''); setNoKamar(''); setTambahanList([]);
        setDetailMetodeKamar([{ id: Date.now(), metode: 'Cash', nominal: 0 }]); 
        setRefreshPreviewTrigger(prev => prev + 1); 
      } else { alert("Gagal menyimpan: " + result.error); }
    } catch (error) { console.error(error); alert("Terjadi kesalahan jaringan."); } finally { setIsSaving(false); }
  };

  const copyToClipboard = () => { navigator.clipboard.writeText(previewText); alert("Teks laporan berhasil disalin!"); };

  const filteredCities = DAFTAR_KOTA_INDONESIA.filter(kota => kota.toLowerCase().includes(citySearch.toLowerCase()));
  const totalCityPages = Math.ceil(filteredCities.length / 20) || 1; 
  const paginatedCities = filteredCities.slice((cityPage - 1) * 20, cityPage * 20);

  if (isLoadingSettings) return <div className="text-center p-10">Memuat pengaturan...</div>;

  return (
    <div className="space-y-8 animate-fade-in pb-10">
      
      {/* TOGGLE TIPE INAP RAKSASA */}
      <div className="bg-gray-100 p-2 rounded-xl flex gap-2 w-full mx-auto border border-gray-200">
        <button onClick={() => handleTipeInapChange('harian')} className={`flex-1 py-3 rounded-lg font-extrabold text-sm sm:text-base transition-all duration-300 shadow-sm ${tipeInap === 'harian' ? 'bg-green-600 text-white shadow-green-900/30' : 'bg-transparent text-gray-500 hover:bg-white'}`}>🛎️ Sewa Harian</button>
        <button onClick={() => handleTipeInapChange('transit')} className={`flex-1 py-3 rounded-lg font-extrabold text-sm sm:text-base transition-all duration-300 shadow-sm ${tipeInap === 'transit' ? 'bg-purple-600 text-white shadow-purple-900/30' : 'bg-transparent text-gray-500 hover:bg-white'}`}>⏳ Transit (6 Jam)</button>
        <button onClick={() => handleTipeInapChange('kos')} className={`flex-1 py-3 rounded-lg font-extrabold text-sm sm:text-base transition-all duration-300 shadow-sm ${tipeInap === 'kos' ? 'bg-orange-600 text-white shadow-orange-900/30' : 'bg-transparent text-gray-500 hover:bg-white'}`}>🏠 Kos Bulanan</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* ROW 1: Nama & Jenis Kelamin dalam satu blok grid */}
        <div className="relative">
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Nama Tamu</label>
              <input 
                type="text" 
                value={nama} 
                onChange={(e) => { 
                  setNama(toTitleCase(e.target.value)); 
                  setShowSuggestions(true);
                  if (!e.target.value) { setPernahCI(false); updateInfoText(false, bookingBy); }
                }} 
                onFocus={() => setShowSuggestions(true)}
                className="w-full border border-gray-300 rounded-md p-2 outline-none focus:ring-2 focus:ring-green-500 transition-shadow" 
                placeholder="Ketik nama tamu..." 
              />
            </div>
            <div className="col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Kelamin</label>
              <select 
                value={jenisKelamin} 
                onChange={(e) => setJenisKelamin(e.target.value)} 
                className="w-full bg-white border border-gray-300 rounded-md p-2 outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="" disabled hidden>- Pilih -</option>
                <option value="Laki-laki">Laki-laki ♂️</option>
                <option value="Perempuan">Perempuan ♀️</option>
                <option value="Lain-lain">Lain-lain ⚪</option>
              </select>
            </div>
          </div>
          
          <div className="mt-1.5 h-5">
            {pernahCI && <span className="inline-block bg-green-100 text-green-800 text-[10px] font-extrabold px-2 py-0.5 rounded uppercase tracking-wider shadow-sm">✅ Tamu Langganan (Pernah C/I)</span>}
          </div>

          {showSuggestions && nama.length >= 2 && (
            <div className="absolute z-40 w-full mt-1 bg-white border border-green-200 rounded-lg shadow-xl max-h-48 overflow-y-auto">
              {databaseTamu.filter(g => g.nama.toLowerCase().includes(nama.toLowerCase())).length === 0 ? (
                <div className="p-3 text-xs text-gray-500 italic text-center">Tamu baru belum ada di database.</div>
              ) : (
                databaseTamu.filter(g => g.nama.toLowerCase().includes(nama.toLowerCase())).map((g, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className="w-full text-left px-4 py-2 text-sm border-b border-gray-50 hover:bg-green-50 focus:bg-green-100 outline-none transition-colors"
                    onClick={() => {
                      setNama(g.nama);
                      if (g.tamuDari) setTamuDari(g.tamuDari);
                      setPernahCI(true);
                      updateInfoText(true, bookingBy);
                      setShowSuggestions(false);
                    }}
                  >
                    <div className="font-bold text-gray-800">{g.nama}</div>
                    {g.tamuDari && <div className="text-[10px] text-gray-500 font-medium">📍 {g.tamuDari}</div>}
                  </button>
                ))
              )}
            </div>
          )}
          {showSuggestions && <div className="fixed inset-0 z-30" onClick={() => setShowSuggestions(false)}></div>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nomor Kamar</label>
          <button type="button" onClick={() => setIsRoomModalOpen(true)} className={`w-full text-left border rounded-md p-2 shadow-sm font-bold flex justify-between items-center transition-colors ${noKamar ? 'bg-green-50 border-green-300 text-green-800' : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'}`}>
            <span>{noKamar ? `Kamar ${noKamar} (${tipeKamar.split('-')[0].toUpperCase()})` : '-- Buka Denah Kamar --'}</span><span className="text-lg">🛏️</span>
          </button>
          <p className="text-[10px] text-gray-500 mt-1">Tipe Kamar otomatis tersetel dari denah.</p>
        </div>

        <div>
          <div className="flex justify-between items-end mb-1"><label className="block text-sm font-medium text-gray-700">Waktu Masuk (Check-In)</label><button type="button" onClick={setKeWaktuSekarang} className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded font-medium hover:bg-gray-300 transition-colors">⏱️ Set Waktu Saat Ini</button></div>
          <input type="datetime-local" value={waktuMasuk} onChange={(e) => handleWaktuMasukChange(e.target.value)} className="w-full border border-gray-300 rounded-md p-2 outline-none focus:ring-2 focus:ring-green-500" />
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Waktu Keluar</label>
            {tipeInap === 'kos' ? (
              <input type="date" value={waktuKeluar.split('T')[0]} readOnly className="w-full border border-gray-300 rounded-md p-2 bg-gray-100 cursor-not-allowed" />
            ) : (
              <input type="datetime-local" value={waktuKeluar} onChange={(e) => setWaktuKeluar(e.target.value)} className="w-full border border-gray-300 rounded-md p-2 outline-none focus:ring-2 focus:ring-green-500" />
            )}
          </div>
          {tipeInap === 'harian' && (
            <div className="w-24 shrink-0">
              <label className="block text-sm font-medium text-gray-700 mb-1">Malam</label>
              <input type="number" min="1" value={durasiMalam} onChange={handleDurasiMalamChange} className="w-full border border-gray-300 rounded-md p-2 outline-none focus:ring-2 focus:ring-green-500 font-bold text-center" />
            </div>
          )}
        </div>

        {tipeInap !== 'kos' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sumber Booking</label>
            <select value={bookingBy} onChange={handleBookingByChange} className="w-full border border-gray-300 rounded-md p-2 outline-none focus:ring-2 focus:ring-green-500">
              <option value="Walk-in">Walk-in / Datang Langsung</option><option value="WA">WhatsApp</option>
              {otaList.map(ota => (<option key={ota} value={ota}>OTA - {ota}</option>))}
            </select>
          </div>
        )}
        
        <div className={tipeInap === 'kos' ? "md:col-span-2" : ""}>
          <label className="block text-sm font-medium text-gray-700 mb-1">Kota Asal (Tamu Dari)</label>
          <input type="text" value={tamuDari} readOnly onClick={() => setIsCityModalOpen(true)} className="w-full border border-gray-300 rounded-md p-2 bg-gray-50 cursor-pointer hover:bg-gray-100 outline-none focus:ring-2 focus:ring-green-500" placeholder="Pilih kota..." />
        </div>

        {tipeInap !== 'kos' && (
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Informasi Referensi Hotel</label>
            <input type="text" value={info} onChange={(e) => setInfo(e.target.value)} className="w-full border border-gray-300 rounded-md p-2 outline-none focus:ring-2 focus:ring-green-500" />
          </div>
        )}
      </div>

      <div className="bg-green-50/50 p-5 rounded-xl border border-green-200">
        <h3 className="font-bold text-green-900 mb-4 flex items-center gap-2"><span>💳</span> Konfigurasi Pembayaran Dasar</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          <div className="bg-white p-4 rounded-lg border border-green-100 shadow-sm flex flex-col">
            <div className="flex justify-between items-end mb-3 border-b border-gray-100 pb-2">
               <div>
                 <span className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase mb-0.5">
                   Total Tagihan Akomodasi
                   {tipeInap === 'transit' && (
                     <span className={`px-1.5 py-0.5 rounded text-[10px] text-white shadow-sm ${isTransitWeekend ? 'bg-orange-500' : 'bg-blue-500'}`}>
                       {isTransitWeekend ? 'Tarif Weekend' : 'Tarif Weekday'}
                     </span>
                   )}
                   {tipeInap === 'harian' && (
                     <span className={`px-1.5 py-0.5 rounded text-[10px] text-white shadow-sm ${rincianMalam.weekend > 0 && rincianMalam.weekday > 0 ? 'bg-purple-600' : (rincianMalam.weekend > 0 ? 'bg-orange-500' : 'bg-blue-500')}`}>
                       {rincianMalam.weekday > 0 && rincianMalam.weekend > 0 
                         ? `Campuran (${rincianMalam.weekday} WD, ${rincianMalam.weekend} WE)` 
                         : rincianMalam.weekend > 0 ? 'Full Weekend' : 'Full Weekday'}
                     </span>
                   )}
                 </span>
                 <span className="text-lg font-black text-green-700">Rp {totalTagihanKamar.toLocaleString('id-ID')}</span>
               </div>
               <button onClick={() => setDetailMetodeKamar([...detailMetodeKamar, { id: Date.now(), metode: 'Transfer', nominal: selisihBayar > 0 ? selisihBayar : 0 }])} className="text-[10px] bg-green-100 hover:bg-green-200 text-green-800 px-2 py-1 rounded font-bold shadow-sm">+ Tambah Metode</button>
            </div>
            
            <div className="space-y-2 mb-3 max-h-36 overflow-y-auto pr-1">
              {detailMetodeKamar.map((item) => (
                <div key={item.id} className="flex gap-2 items-center bg-gray-50 p-2 rounded border border-gray-100">
                  <select value={item.metode} onChange={(e) => setDetailMetodeKamar(detailMetodeKamar.map(m => m.id === item.id ? { ...m, metode: e.target.value } : m))} className="w-1/2 border border-gray-200 rounded p-1.5 text-sm outline-none focus:ring-1 focus:ring-green-500 bg-white">
                    <option value="Cash">Cash</option><option value="Transfer">Transfer</option><option value="QRIS">QRIS</option><option value="Debit/Kredit">Debit/Kredit</option>{tipeInap !== 'kos' && otaList.includes(bookingBy) && <option value={bookingBy}>{bookingBy}</option>}
                  </select>
                  <input type="number" value={item.nominal === 0 ? '' : item.nominal} onChange={(e) => setDetailMetodeKamar(detailMetodeKamar.map(m => m.id === item.id ? { ...m, nominal: Number(e.target.value) } : m))} placeholder="Nominal" className="w-1/2 border border-gray-200 rounded p-1.5 text-sm outline-none focus:ring-1 focus:ring-green-500 bg-white" />
                  {detailMetodeKamar.length > 1 && (
                    <button onClick={() => setDetailMetodeKamar(detailMetodeKamar.filter(m => m.id !== item.id))} className="text-red-500 font-bold hover:text-red-700 bg-red-50 w-7 h-7 flex items-center justify-center rounded">&times;</button>
                  )}
                </div>
              ))}
            </div>

            <div className={`text-xs font-bold text-right pt-2 border-t border-dashed border-gray-200 ${selisihBayar === 0 ? 'text-green-600' : 'text-red-500'}`}>
               {selisihBayar === 0 ? '✅ Nominal Pas' : (selisihBayar > 0 ? `⚠️ Kurang bayar Rp ${selisihBayar.toLocaleString('id-ID')}` : `⚠️ Kelebihan Rp ${Math.abs(selisihBayar).toLocaleString('id-ID')}`)}
            </div>
          </div>

          <div className="bg-white p-4 rounded-lg border border-green-100 shadow-sm flex flex-col justify-between">
             <div className="mb-3 border-b border-gray-100 pb-2">
                 <span className="block text-xs font-bold text-gray-500 uppercase mb-0.5">Titipan Deposit Jaminan</span>
                 <span className="text-lg font-black text-gray-800">Rp {depositDefault.toLocaleString('id-ID')}</span>
             </div>
             <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Bayar Deposit Via</label>
                <select value={metodeDeposit} onChange={(e) => setMetodeDeposit(e.target.value)} className="w-full border border-gray-300 rounded p-2 text-sm outline-none focus:ring-1 focus:ring-green-500">
                  <option value="Cash">Cash</option><option value="Transfer">Transfer</option><option value="QRIS">QRIS</option>
                </select>
             </div>
          </div>

        </div>
      </div>

      <div className="bg-orange-50/50 p-5 rounded-xl border border-orange-200">
        <div className="flex justify-between items-center mb-4"><h3 className="font-bold text-orange-900 flex items-center gap-2"><span>🛒</span> Tagihan Tambahan (Opsional)</h3><button onClick={tambahBiaya} className="text-xs bg-orange-600 text-white px-3 py-1.5 rounded-full font-bold hover:bg-orange-700 shadow-sm">+ Tambah Tagihan</button></div>
        {tambahanList.length === 0 ? (<p className="text-sm text-orange-700/60 italic bg-white p-4 rounded-lg border border-dashed border-orange-200 text-center">Belum ada biaya extra bed, parkir, dll.</p>) : (<div className="space-y-3">{tambahanList.map((item) => (<div key={item.id} className="flex gap-2 items-end bg-white p-3 rounded-lg border border-orange-100 shadow-sm"><div className="w-1/3"><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Nama Item</label><input type="text" value={item.nama} onChange={(e) => updateBiaya(item.id, 'nama', toTitleCase(e.target.value))} className="w-full border rounded p-2 text-sm outline-none focus:ring-1 focus:ring-orange-500" placeholder="Extra Bed" /></div><div className="w-1/4"><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Via</label><select value={item.metode} onChange={(e) => updateBiaya(item.id, 'metode', e.target.value)} className="w-full border rounded p-2 text-sm outline-none focus:ring-1 focus:ring-orange-500"><option value="Cash">Cash</option><option value="Transfer">Transfer</option><option value="QRIS">QRIS</option></select></div><div className="w-1/3"><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Nominal (Rp)</label><input type="number" value={item.jumlah} onChange={(e) => updateBiaya(item.id, 'jumlah', Number(e.target.value))} className="w-full border rounded p-2 text-sm outline-none focus:ring-1 focus:ring-orange-500" /></div><button onClick={() => hapusBiaya(item.id)} className="text-red-500 hover:text-red-700 font-bold p-1 text-2xl leading-none">&times;</button></div>))}</div>)}
      </div>

      <button onClick={handleSimpan} disabled={isSaving} className={`w-full py-4 rounded-xl text-white font-extrabold text-lg shadow-lg transition-all transform ${isSaving ? 'bg-gray-400 scale-100' : 'bg-[#1a4b1a] hover:bg-green-900 hover:scale-[1.01] active:scale-100'}`}>
        {isSaving ? 'MEMPROSES...' : '📥 PROSES CHECK-IN TAMU'}
      </button>

      <div className="mt-8 pt-8 border-t border-gray-200">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-4">
          <div><h3 className="font-bold text-gray-800 text-lg">📱 Laporan Shift WhatsApp</h3><p className="text-xs text-gray-500">Salin laporan gabungan Harian dan Kos ke grup operasional.</p></div>
          <div className="flex gap-2 w-full md:w-auto"><button onClick={() => setRefreshPreviewTrigger(p => p + 1)} className="flex-1 bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-bold shadow-sm hover:bg-gray-50">🔄 Muat Ulang</button><button onClick={copyToClipboard} className="flex-1 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm">📋 Salin Teks</button></div>
        </div>
        <textarea readOnly value={previewText} className="w-full h-[600px] border border-gray-200 rounded-xl p-5 bg-gray-50/50 text-sm font-mono text-gray-700 resize-y outline-none focus:ring-2 focus:ring-[#1a4b1a] shadow-inner" />
      </div>

      {isCityModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[80vh]">
            <div className="p-5 bg-[#1a4b1a] text-white flex justify-between items-center"><h3 className="font-bold text-lg">Pilih Kota Asal</h3><button onClick={() => setIsCityModalOpen(false)} className="text-white/70 hover:text-white font-bold text-2xl">&times;</button></div>
            <div className="p-4 border-b"><input type="text" placeholder="Ketik nama kota..." value={citySearch} onChange={(e) => { setCitySearch(e.target.value); setCityPage(1); }} className="w-full border border-gray-300 rounded-lg p-3 outline-none focus:ring-2 focus:ring-green-600"/></div>
            <div className="overflow-y-auto p-2 flex-1">{paginatedCities.length > 0 ? (<div className="grid grid-cols-1 gap-1">{paginatedCities.map((kota, idx) => (<button key={idx} onClick={() => handleSelectCity(kota)} className="text-left w-full p-3 hover:bg-green-50 rounded-lg transition-colors font-medium text-gray-700">{kota}</button>))}</div>) : <p className="text-center text-gray-500 py-10">Kota tidak ditemukan.</p>}</div>
            <div className="p-4 border-t bg-gray-50 flex justify-between items-center"><button disabled={cityPage === 1} onClick={() => setCityPage(p => p - 1)} className={`px-4 py-2 rounded-lg text-sm font-bold ${cityPage === 1 ? 'bg-gray-200 text-gray-400' : 'bg-green-100 text-green-800'}`}>Kiri</button><span className="text-sm font-bold text-gray-500">Hal {cityPage} / {totalCityPages}</span><button disabled={cityPage === totalCityPages} onClick={() => setCityPage(p => p + 1)} className={`px-4 py-2 rounded-lg text-sm font-bold ${cityPage === totalCityPages ? 'bg-gray-200 text-gray-400' : 'bg-green-100 text-green-800'}`}>Kanan</button></div>
          </div>
        </div>
      )}

      {isRoomModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-5 bg-[#1a4b1a] text-white flex justify-between items-center shrink-0">
              <div><h3 className="font-bold text-xl">🛏️ Denah Kamar Greenhaus</h3><p className="text-xs text-green-200 mt-1">Kamar merah sedang dipakai tamu lain.</p></div>
              <button onClick={() => setIsRoomModalOpen(false)} className="text-white/70 hover:text-white font-bold text-3xl transition-colors">&times;</button>
            </div>
            <div className="overflow-y-auto p-6 flex-1 space-y-6 bg-gray-50/50">
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
                          return (
                            <button key={k.id} disabled={isOccupied} onClick={() => handleSelectRoom(k.no.trim(), k.tipe)} className={`p-4 rounded-xl border-2 flex flex-col items-center justify-center transition-all ${isOccupied ? 'bg-red-50 border-red-200 text-red-400 cursor-not-allowed opacity-80' : 'bg-white border-green-300 text-green-700 hover:bg-green-50 hover:border-green-600 hover:scale-105 shadow-sm cursor-pointer'}`}>
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
    </div>
  );
}