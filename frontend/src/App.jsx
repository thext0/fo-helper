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
import RestoranPOS from './components/RestoranPOS';

function AppContent() {
  const [activeTab, setActiveTab] = useState('harian');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Pengelompokan Menu SaaS
  const menuGroups = [
    {
      title: 'FRONT OFFICE',
      items: [
        { id: 'harian', icon: '🛎️', label: 'Front Desk' },
        { id: 'inhouse', icon: '🛏️', label: 'In-House Folio' },
        { id: 'riwayat', icon: '📖', label: 'Log Riwayat' },
      ]
    },
    {
      title: 'OPERASIONAL',
      items: [
        { id: 'housekeeping', icon: '🧹', label: 'Housekeeping' },
        { id: 'restoran', icon: '🍽️', label: 'F&B Restoran' },
        { id: 'pelanggan', icon: '👥', label: 'Data Tamu' },
      ]
    },
    {
      title: 'MANAJEMEN',
      items: [
        { id: 'laporan', icon: '📈', label: 'Keuangan' },
        { id: 'pengaturan', icon: '⚙️', label: 'Pengaturan' },
      ]
    }
  ];

  return (
    <div className="flex h-screen bg-[#f4f7f5] text-gray-800 font-sans selection:bg-green-200 overflow-hidden">
      
      {/* MOBILE TOP BAR (Hanya terlihat di layar kecil) */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-white shadow-sm border-b border-gray-200 z-40 flex items-center justify-between px-4 print:hidden">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="Logo" className="h-10 w-auto mix-blend-multiply" />
          <span className="font-black text-[#1a4b1a] tracking-tight">FO HELPER</span>
        </div>
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="text-2xl p-2 bg-gray-100 rounded-lg text-gray-700">
          {isMobileMenuOpen ? '✖' : '☰'}
        </button>
      </div>

      {/* SIDEBAR NAVIGATION */}
      <aside className={`fixed inset-y-0 left-0 z-30 w-64 bg-white border-r border-gray-200 flex flex-col transition-transform duration-300 ease-in-out md:translate-x-0 md:static print:hidden shadow-xl md:shadow-none ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        
        {/* Sidebar Header / Logo (Desktop) */}
        <div className="h-24 hidden md:flex items-center gap-3 px-6 border-b border-gray-100 shrink-0">
          <img src="/logo.png" alt="Greenhaus Inn Logo" className="h-14 w-auto object-contain mix-blend-multiply" />
          <div className="flex flex-col leading-none">
            <span className="text-[15px] font-black tracking-tight text-[#1a4b1a] uppercase">FO Helper</span>
            <span className="text-[10px] font-bold text-gray-400 tracking-wider">v2.0 Beta</span>
          </div>
        </div>

        {/* Menu Links */}
        <div className="flex-1 overflow-y-auto py-6 px-4 space-y-6 mt-16 md:mt-0">
          {menuGroups.map((group, gIdx) => (
            <div key={gIdx}>
              <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 px-2">{group.title}</h3>
              <div className="space-y-1">
                {group.items.map((tab) => {
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => {
                        setActiveTab(tab.id);
                        setIsMobileMenuOpen(false); // Menutup sidebar mobile langsung pada event klik
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold text-sm transition-all duration-200 ${
                        isActive 
                          ? 'bg-[#1a4b1a] text-white shadow-md shadow-green-900/20' 
                          : 'text-gray-500 hover:bg-green-50 hover:text-[#1a4b1a]'
                      }`}
                    >
                      <span className={`text-lg ${isActive ? '' : 'opacity-70'}`}>{tab.icon}</span>
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* OVERLAY MOBILE */}
      {isMobileMenuOpen && (
        <div onClick={() => setIsMobileMenuOpen(false)} className="fixed inset-0 bg-black/50 z-20 md:hidden print:hidden animate-fade-in"></div>
      )}

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 flex flex-col h-screen overflow-y-auto overflow-x-hidden pt-16 md:pt-0 print:pt-0 print:h-auto print:overflow-visible">
        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full space-y-6 print:p-0 print:m-0 print:space-y-0">
          
          {/* ISOLASI DASHBOARD KAMAR: Hanya render di Front Desk atau In-House */}
          {['harian', 'inhouse'].includes(activeTab) && (
            <div className="transition-all duration-500 ease-in-out print:hidden">
              <DashboardKamar />
            </div>
          )}

          {/* WADAH KONTEN MODUL UTAMA */}
          <div className="bg-white p-6 sm:p-8 rounded-3xl shadow-xl shadow-gray-200/40 border border-gray-100 min-h-[calc(100vh-200px)] transition-all duration-500 print:p-0 print:shadow-none print:border-none print:bg-transparent print:min-h-0">
            {activeTab === 'harian' && <FormCheckIn />}
            {activeTab === 'inhouse' && <InHouseFolio />}
            {activeTab === 'housekeeping' && <Housekeeping />}
            {activeTab === 'restoran' && <RestoranPOS />}
            {activeTab === 'riwayat' && <RiwayatTransaksi />}
            {activeTab === 'pelanggan' && <DatabasePelanggan />}
            {activeTab === 'laporan' && <LaporanFinansial />}
            {activeTab === 'pengaturan' && <Settings />}
          </div>

        </div>
      </main>

    </div>
  );
}

function App() {
  return (
    <DialogProvider>
      <DataProvider>
        <AppContent />
      </DataProvider>
    </DialogProvider>
  );
}

export default App;
// [END: AppRootModule]