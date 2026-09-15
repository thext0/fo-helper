// [START: DialogProviderModule]
import { createContext, useContext, useState, useCallback, useRef } from 'react';

const DialogContext = createContext();

// eslint-disable-next-line react-refresh/only-export-components
export const useDialog = () => {
  return useContext(DialogContext);
};

export default function DialogProvider({ children }) {
  const [dialogs, setDialogs] = useState([]);
  const [toasts, setToasts] = useState([]);
  let dialogIdCounter = useRef(0);
  let toastIdCounter = useRef(0);

  // === Fungsi Pemanggil (Dipanggil dari Komponen Lain) ===
  const alert = useCallback((message, title = 'Perhatian') => {
    return new Promise((resolve) => {
      const id = dialogIdCounter.current++;
      setDialogs(prev => [...prev, { id, type: 'alert', title, message, resolve }]);
    });
  }, []);

  const confirm = useCallback((message, title = 'Konfirmasi Tindakan') => {
    return new Promise((resolve) => {
      const id = dialogIdCounter.current++;
      setDialogs(prev => [...prev, { id, type: 'confirm', title, message, resolve }]);
    });
  }, []);

  const prompt = useCallback((message, title = 'Input Diperlukan', defaultValue = '') => {
    return new Promise((resolve) => {
      const id = dialogIdCounter.current++;
      setDialogs(prev => [...prev, { id, type: 'prompt', title, message, defaultValue, resolve }]);
    });
  }, []);

  const toast = useCallback((message, type = 'success') => {
    const id = toastIdCounter.current++;
    setToasts(prev => [...prev, { id, message, type }]);
    // Hilang otomatis setelah 3 detik
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  }, []);

  // === Fungsi Penutup Modal ===
  const closeDialog = (id, result) => {
    setDialogs(prev => {
      const dialog = prev.find(d => d.id === id);
      if (dialog) dialog.resolve(result); // Kembalikan nilai (true/false/string)
      return prev.filter(d => d.id !== id);
    });
  };

  // [START: Render]
  return (
    <DialogContext.Provider value={{ alert, confirm, prompt, toast }}>
      {children}

      {/* Kontainer Global untuk Modal Dialog */}
      {dialogs.length > 0 && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 print:hidden">
          {dialogs.map((d, index) => {
            // Hanya merender dialog teratas (terakhir dipanggil) jika menumpuk
            if (index !== dialogs.length - 1) return null;
            return <DialogBox key={d.id} dialog={d} onClose={closeDialog} />;
          })}
        </div>
      )}

      {/* Kontainer Global untuk Toast (Pojok Kanan Bawah) */}
      <div className="fixed bottom-5 right-5 z-[10001] flex flex-col gap-2 pointer-events-none print:hidden">
        {toasts.map(t => (
          <div key={t.id} className={`px-4 py-3 rounded-lg shadow-lg font-bold text-sm animate-fade-in flex items-center gap-2 transform transition-all pointer-events-auto ${t.type === 'error' ? 'bg-red-600 text-white' : t.type === 'warning' ? 'bg-orange-500 text-white' : 'bg-green-600 text-white'}`}>
            <span>{t.type === 'error' ? '❌' : t.type === 'warning' ? '⚠️' : '✅'}</span>
            {t.message}
          </div>
        ))}
      </div>

    </DialogContext.Provider>
  );
  // [END: Render]
}

// Sub-komponen untuk merender kotak dialog individu
function DialogBox({ dialog, onClose }) {
  const [inputValue, setInputValue] = useState(dialog.defaultValue || '');

  // Render berdasarkan tipe dialog
  return (
    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-fade-in scale-100 transform transition-transform">
      <div className={`p-4 text-white flex items-center justify-between ${dialog.type === 'alert' ? 'bg-blue-600' : dialog.type === 'confirm' ? 'bg-orange-500' : 'bg-purple-600'}`}>
        <h3 className="font-bold text-lg">{dialog.title}</h3>
      </div>
      
      <div className="p-6 bg-gray-50">
        <p className="text-gray-700 whitespace-pre-line leading-relaxed">{dialog.message}</p>
        
        {dialog.type === 'prompt' && (
          <input 
            type="text" 
            autoFocus
            value={inputValue} 
            onChange={(e) => setInputValue(e.target.value)} 
            onKeyDown={(e) => { if (e.key === 'Enter') onClose(dialog.id, inputValue) }}
            className="w-full mt-4 border-2 border-purple-300 rounded-lg p-3 outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 font-bold text-gray-800" 
            placeholder="Ketik di sini..."
          />
        )}
      </div>

      <div className="p-4 bg-white border-t border-gray-100 flex justify-end gap-3">
        {(dialog.type === 'confirm' || dialog.type === 'prompt') && (
          <button onClick={() => onClose(dialog.id, dialog.type === 'prompt' ? null : false)} className="px-5 py-2 bg-gray-100 text-gray-700 hover:bg-gray-200 font-bold rounded-xl transition-colors">
            Batal
          </button>
        )}
        <button 
          autoFocus={dialog.type !== 'prompt'}
          onClick={() => onClose(dialog.id, dialog.type === 'prompt' ? inputValue : true)} 
          className={`px-6 py-2 text-white font-black rounded-xl shadow-md transition-transform active:scale-95 ${dialog.type === 'alert' ? 'bg-blue-600 hover:bg-blue-700' : dialog.type === 'confirm' ? 'bg-orange-500 hover:bg-orange-600' : 'bg-purple-600 hover:bg-purple-700'}`}
        >
          {dialog.type === 'alert' ? 'OK, Mengerti' : dialog.type === 'confirm' ? 'Ya, Lanjutkan' : 'Kirim'}
        </button>
      </div>
    </div>
  );
}
// [END: DialogProviderModule]