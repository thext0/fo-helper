import { useState, useEffect } from 'react';
import { isWithinInterval, parseISO } from 'date-fns';

export default function DashboardKamar() {
  const [loading, setLoading] = useState(true);
  const [ketersediaan, setKetersediaan] = useState({
    'double-bed': { total: 0, terisi: 0, sisa: 0 },
    'twin-bed': { total: 0, terisi: 0, sisa: 0 },
    'single-bed': { total: 0, terisi: 0, sisa: 0 }
  });

  useEffect(() => {
    const hitungKetersediaanKamar = async () => {
      try {
        const response = await fetch('http://localhost:5000/api/data');
        if (!response.ok) throw new Error("Gagal terhubung ke server");
        const data = await response.json();

        const settings = data.settings || {};
        const totalRooms = settings.totalRooms || { 'double-bed': 0, 'twin-bed': 0, 'single-bed': 0 };
        const dailyTransactions = data.dailyTransactions || [];
        const activeKost = data.activeKost || [];
        const sekarang = new Date();
        const terisiCount = { 'double-bed': 0, 'twin-bed': 0, 'single-bed': 0 };

        dailyTransactions.forEach(tx => {
          if (tx.checkIn && tx.checkOut && tx.tipeKamar) {
            const start = parseISO(tx.checkIn);
            const end = parseISO(tx.checkOut);
            if (isWithinInterval(sekarang, { start, end })) {
              if (terisiCount[tx.tipeKamar] !== undefined) terisiCount[tx.tipeKamar]++;
            }
          }
        });

        activeKost.forEach(kos => {
          if (kos.periodeStart && kos.periodeEnd && kos.roomType) {
            const start = new Date(kos.periodeStart); start.setHours(12, 0, 0, 0);
            const end = new Date(kos.periodeEnd); end.setHours(12, 0, 0, 0);
            if (isWithinInterval(sekarang, { start, end })) {
              if (terisiCount[kos.roomType] !== undefined) terisiCount[kos.roomType]++;
            }
          }
        });

        setKetersediaan({
          'double-bed': { total: totalRooms['double-bed'], terisi: terisiCount['double-bed'], sisa: Math.max(0, totalRooms['double-bed'] - terisiCount['double-bed']) },
          'twin-bed': { total: totalRooms['twin-bed'], terisi: terisiCount['twin-bed'], sisa: Math.max(0, totalRooms['twin-bed'] - terisiCount['twin-bed']) },
          'single-bed': { total: totalRooms['single-bed'], terisi: terisiCount['single-bed'], sisa: Math.max(0, totalRooms['single-bed'] - terisiCount['single-bed']) }
        });

      } catch (error) {
        console.error("Gagal menghitung ketersediaan kamar:", error);
      } finally {
        setLoading(false);
      }
    };

    hitungKetersediaanKamar();
    const interval = setInterval(hitungKetersediaanKamar, 10000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <div className="text-sm text-gray-500 italic">Menghitung okupansi kamar...</div>;

  const totalSisa = ketersediaan['double-bed'].sisa + ketersediaan['twin-bed'].sisa + ketersediaan['single-bed'].sisa;

  return (
    <div className="mb-6 space-y-4">
      {/* BANNER TOTAL SISA KAMAR */}
      <div className="bg-blue-800 text-white p-4 rounded-md shadow-md flex items-center justify-between border border-blue-900">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-widest text-blue-200">Total Sisa Kamar Available</h2>
        </div>
        <div className="text-4xl font-black">
          {totalSisa} <span className="text-lg font-medium text-blue-200">Kamar</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-md shadow-sm border border-gray-200 flex flex-col justify-between">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Kamar Double Bed</span>
            <div className="text-3xl font-black text-gray-800 mt-1">{ketersediaan['double-bed'].sisa} <span className="text-sm font-normal text-gray-400">Tersedia</span></div>
          </div>
          <div className="text-xs text-gray-500 mt-3 border-t pt-2 border-gray-100">Total Fisik: <b>{ketersediaan['double-bed'].total}</b> | Terisi: <span className="text-red-500 font-semibold">{ketersediaan['double-bed'].terisi}</span></div>
        </div>
        <div className="bg-white p-4 rounded-md shadow-sm border border-gray-200 flex flex-col justify-between">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Kamar Twin Bed</span>
            <div className="text-3xl font-black text-gray-800 mt-1">{ketersediaan['twin-bed'].sisa} <span className="text-sm font-normal text-gray-400">Tersedia</span></div>
          </div>
          <div className="text-xs text-gray-500 mt-3 border-t pt-2 border-gray-100">Total Fisik: <b>{ketersediaan['twin-bed'].total}</b> | Terisi: <span className="text-red-500 font-semibold">{ketersediaan['twin-bed'].terisi}</span></div>
        </div>
        <div className="bg-white p-4 rounded-md shadow-sm border border-gray-200 flex flex-col justify-between">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Kamar Single Bed</span>
            <div className="text-3xl font-black text-gray-800 mt-1">{ketersediaan['single-bed'].sisa} <span className="text-sm font-normal text-gray-400">Tersedia</span></div>
          </div>
          <div className="text-xs text-gray-500 mt-3 border-t pt-2 border-gray-100">Total Fisik: <b>{ketersediaan['single-bed'].total}</b> | Terisi: <span className="text-red-500 font-semibold">{ketersediaan['single-bed'].terisi}</span></div>
        </div>
      </div>
    </div>
  );
}