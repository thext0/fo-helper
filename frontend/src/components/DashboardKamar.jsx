// [START: DashboardKamarModule]
import { useState, useEffect, useMemo } from 'react';
import { isWithinInterval, parseISO } from 'date-fns';
import { useAppData } from '../context/DataProvider';

export default function DashboardKamar() {
  const { data, loading } = useAppData();
  
  // Detak waktu lokal: Diupdate setiap 1 menit agar perhitungan okupansi bergeser secara alami
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const ketersediaan = useMemo(() => {
    const defaultKetersediaan = {
      'double-bed': { total: 0, terisi: 0, sisa: 0 },
      'twin-bed': { total: 0, terisi: 0, sisa: 0 },
      'single-bed': { total: 0, terisi: 0, sisa: 0 }
    };

    if (!data) return defaultKetersediaan;

    const settings = data.settings || {};
    const totalRooms = settings.totalRooms || { 'double-bed': 0, 'twin-bed': 0, 'single-bed': 0 };
    const rHour = parseInt((settings.rolloverTime || '12:00').split(':')[0], 10);
    
    const dailyTransactions = data.dailyTransactions || [];
    const activeKost = data.activeKost || [];
    const terisiCount = { 'double-bed': 0, 'twin-bed': 0, 'single-bed': 0 };

    dailyTransactions.forEach(tx => {
      if (tx.checkIn && tx.checkOut && tx.tipeKamar && !tx.isVoid) {
        const start = parseISO(tx.checkIn);
        const end = parseISO(tx.checkOut);
        if (isWithinInterval(now, { start, end })) {
          if (terisiCount[tx.tipeKamar] !== undefined) terisiCount[tx.tipeKamar]++;
        }
      }
    });

    activeKost.forEach(kos => {
      if (kos.periodeStart && kos.periodeEnd && kos.roomType && !kos.isVoid) {
        const start = new Date(kos.periodeStart); start.setHours(rHour, 0, 0, 0);
        const end = new Date(kos.periodeEnd); end.setHours(rHour, 0, 0, 0);
        if (isWithinInterval(now, { start, end })) {
          if (terisiCount[kos.roomType] !== undefined) terisiCount[kos.roomType]++;
        }
      }
    });

    return {
      'double-bed': { total: totalRooms['double-bed'], terisi: terisiCount['double-bed'], sisa: Math.max(0, totalRooms['double-bed'] - terisiCount['double-bed']) },
      'twin-bed': { total: totalRooms['twin-bed'], terisi: terisiCount['twin-bed'], sisa: Math.max(0, totalRooms['twin-bed'] - terisiCount['twin-bed']) },
      'single-bed': { total: totalRooms['single-bed'], terisi: terisiCount['single-bed'], sisa: Math.max(0, totalRooms['single-bed'] - terisiCount['single-bed']) }
    };
  }, [data, now]);

  if (loading) return <div className="text-sm text-gray-500 italic">Menghitung okupansi kamar dari memori...</div>;

  const totalSisa = ketersediaan['double-bed'].sisa + ketersediaan['twin-bed'].sisa + ketersediaan['single-bed'].sisa;

  return (
    <div className="mb-6 animate-fade-in">
      
      {/* BANNER TOTAL SISA KAMAR (Clean Solid Gradient) */}
      <div className="bg-gradient-to-r from-emerald-800 to-emerald-600 text-white p-6 md:p-8 rounded-2xl shadow-md flex items-center justify-between relative overflow-hidden">
        {/* Dekorasi ringan murni CSS (Bukan SVG) */}
        <div className="absolute -right-10 -top-10 w-48 h-48 bg-white opacity-5 rounded-full"></div>
        <div className="absolute right-20 -bottom-10 w-32 h-32 bg-white opacity-5 rounded-full"></div>
        
        <div className="relative z-10">
          <h2 className="text-xs md:text-sm font-bold uppercase tracking-widest text-emerald-100 mb-1">Total Ketersediaan</h2>
          <div className="text-4xl md:text-5xl font-black tracking-tight drop-shadow-sm">
            {totalSisa} <span className="text-xl md:text-2xl font-semibold text-emerald-100/80">Kamar Available</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mt-5">
        {/* KARTU 1: DOUBLE BED */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 border-l-4 border-l-emerald-500 hover:shadow-md transition-shadow flex flex-col justify-between">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Kamar Double Bed</span>
            <div className="text-4xl font-black text-gray-800 mt-2">{ketersediaan['double-bed'].sisa} <span className="text-sm font-bold text-gray-400">Tersedia</span></div>
          </div>
          <div className="text-xs text-gray-500 mt-5 pt-3 border-t border-gray-50 flex justify-between items-center">
            <span className="font-medium">Fisik: <b className="text-gray-700">{ketersediaan['double-bed'].total}</b></span>
            <span className="bg-gray-50 px-2 py-1 rounded">Terisi: <b className="text-emerald-600">{ketersediaan['double-bed'].terisi}</b></span>
          </div>
        </div>
        
        {/* KARTU 2: TWIN BED */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 border-l-4 border-l-blue-500 hover:shadow-md transition-shadow flex flex-col justify-between">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Kamar Twin Bed</span>
            <div className="text-4xl font-black text-gray-800 mt-2">{ketersediaan['twin-bed'].sisa} <span className="text-sm font-bold text-gray-400">Tersedia</span></div>
          </div>
          <div className="text-xs text-gray-500 mt-5 pt-3 border-t border-gray-50 flex justify-between items-center">
            <span className="font-medium">Fisik: <b className="text-gray-700">{ketersediaan['twin-bed'].total}</b></span>
            <span className="bg-gray-50 px-2 py-1 rounded">Terisi: <b className="text-blue-600">{ketersediaan['twin-bed'].terisi}</b></span>
          </div>
        </div>
        
        {/* KARTU 3: SINGLE BED */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 border-l-4 border-l-amber-500 hover:shadow-md transition-shadow flex flex-col justify-between">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Kamar Single Bed</span>
            <div className="text-4xl font-black text-gray-800 mt-2">{ketersediaan['single-bed'].sisa} <span className="text-sm font-bold text-gray-400">Tersedia</span></div>
          </div>
          <div className="text-xs text-gray-500 mt-5 pt-3 border-t border-gray-50 flex justify-between items-center">
            <span className="font-medium">Fisik: <b className="text-gray-700">{ketersediaan['single-bed'].total}</b></span>
            <span className="bg-gray-50 px-2 py-1 rounded">Terisi: <b className="text-amber-600">{ketersediaan['single-bed'].terisi}</b></span>
          </div>
        </div>
      </div>

    </div>
  );
}
// [END: DashboardKamarModule]