// [START: AppRootModule]
import { useState } from 'react';
import RiwayatTransaksi from './components/RiwayatTransaksi';
import DatabasePelanggan from './components/DatabasePelanggan';
import Settings from './components/Settings';
import DashboardKamar from './components/DashboardKamar';
import FormCheckIn from './components/FormCheckIn';
import LaporanFinansial from './components/LaporanFinansial';
import DialogProvider from './components/DialogProvider';
import { DataProvider } from './context/DataProvider';
import InHouseFolio from './components/InHouseFolio';
import Housekeeping from './components/Housekeeping';

function AppContent() {
  const [activeTab, setActiveTab] = useState('harian');

  return (
    <div className="min-h-screen bg-[#f0f4f1] text-gray-800 font-sans selection:bg-green-200">
      
      {/* TOP NAVBAR */}
      <nav className="bg-white shadow-sm border-b border-gray-100 sticky top-0 z-30 print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            
            <div className="flex items-center gap-3 cursor-default">
              <img 
                src="/logo.png" 
                alt="Greenhaus Inn Logo" 
                className="h-20 w-auto object-contain drop-shadow-sm mix-blend-multiply"
              />
              <div className="hidden sm:flex flex-col leading-none border-l-2 border-green-200 pl-3 ml-1 py-1">
                <span className="text-[14px] font-black tracking-tight text-[#1a4b1a] uppercase">FO Helper</span>
                <span className="text-[10px] font-bold text-gray-500 tracking-wider">Management System</span>
              </div>
            </div>

            <button 
              onClick={() => setActiveTab('pengaturan')} 
              className={`group flex items-center gap-2 border-2 px-5 py-2 rounded-full font-bold transition-all duration-300 shadow-sm active:scale-95 ${activeTab === 'pengaturan' ? 'bg-[#1a4b1a] text-white border-[#1a4b1a]' : 'bg-white border-gray-100 hover:border-[#1a4b1a] text-gray-600 hover:text-[#1a4b1a]'}`}
            >
              <span className="text-xl group-hover:rotate-90 transition-transform duration-500">⚙️</span>
              <span className="hidden sm:inline tracking-wide">Pengaturan</span>
            </button>

          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 print:p-0 print:space-y-0 print:m-0">
        
        {/* Dashboard Kamar */}
        <div className="transition-all duration-500 ease-in-out print:hidden">
          <DashboardKamar />
        </div>

        {/* NAVIGASI TAB */}
        <div className="flex flex-wrap justify-center sm:justify-start gap-3 print:hidden">
          {[
            { id: 'harian', icon: '🛎️', label: 'Penerimaan Tamu' }, 
            { id: 'inhouse', icon: '🛏️', label: 'In-House Folio' },
            { id: 'housekeeping', icon: '🧹', label: 'Housekeeping' },
            { id: 'riwayat', icon: '📖', label: 'Log Riwayat' },
            { id: 'pelanggan', icon: '👥', label: 'Data Pelanggan' },
            { id: 'laporan', icon: '📈', label: 'Laporan Finansial' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-6 py-3 rounded-full font-bold text-sm transition-all duration-300 ease-out border ${
                activeTab === tab.id
                  ? 'bg-[#1a4b1a] text-white border-[#1a4b1a] shadow-lg shadow-green-900/30 -translate-y-1'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-[#1a4b1a]/30 hover:bg-green-50 hover:text-[#1a4b1a] shadow-sm hover:shadow'
              }`}
            >
              <span className="text-lg">{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* WADAH KONTEN UTAMA */}
        <div className="bg-white p-6 sm:p-8 rounded-[2rem] shadow-xl shadow-gray-200/50 border border-gray-100 min-h-[500px] transition-all duration-500 print:p-0 print:shadow-none print:border-none print:bg-transparent print:min-h-0">
          {activeTab === 'harian' && <FormCheckIn />}
          {activeTab === 'inhouse' && <InHouseFolio />}
          {activeTab === 'housekeeping' && <Housekeeping />}
          {activeTab === 'riwayat' && <RiwayatTransaksi />}
          {activeTab === 'pelanggan' && <DatabasePelanggan />}
          {activeTab === 'laporan' && <LaporanFinansial />}
          {activeTab === 'pengaturan' && <Settings />}
        </div>
        
      </main>

    </div>
  );
}

function App() {
  return (
    <DialogProvider>
      {/* BUNGKUS APLIKASI DENGAN DATA PROVIDER GLOBAL */}
      <DataProvider>
        <AppContent />
      </DataProvider>
    </DialogProvider>
  );
}

export default App;
// [END: AppRootModule]