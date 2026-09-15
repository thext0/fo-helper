// [START: CustomDateTimePickerModule]
import { useState, useRef, useEffect } from 'react';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, isSameMonth, isSameDay, addDays, isValid } from 'date-fns';

const HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

export default function CustomDateTimePicker({ value, onChange, includeTime = false, readOnly = false, alignRight = false }) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(value ? new Date(value) : new Date());
  const wrapperRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const renderCells = () => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);

    const rows = [];
    let days = [];
    let day = startDate;

    while (day <= endDate) {
      for (let i = 0; i < 7; i++) {
        const formattedDate = format(day, "d");
        const cloneDay = day;
        const isSelected = value && isSameDay(day, new Date(value));

        days.push(
          <div
            key={day}
            onClick={() => {
              if (readOnly) return;
              const newDate = new Date(cloneDay);
              if (includeTime && value) {
                const prev = new Date(value);
                newDate.setHours(prev.getHours());
                newDate.setMinutes(prev.getMinutes());
              }
              onChange(format(newDate, includeTime ? "yyyy-MM-dd'T'HH:mm" : "yyyy-MM-dd"));
              if (!includeTime) setIsOpen(false); 
            }}
            className={`p-2 w-10 h-10 flex items-center justify-center text-sm rounded-full cursor-pointer transition-all duration-200 ${
              isSelected ? 'bg-green-600 text-white font-bold shadow-md scale-110' :
              !isSameMonth(day, monthStart) ? 'text-gray-300 hover:bg-gray-100' :
              'text-gray-800 hover:bg-green-100 hover:text-green-800'
            }`}
          >
            {formattedDate}
          </div>
        );
        day = addDays(day, 1);
      }
      rows.push(<div className="flex justify-between w-full" key={day}>{days}</div>);
      days = [];
    }
    return <div className="space-y-1 mb-1">{rows}</div>; // Tambahan mb-1 agar ada napas di bawah
  };

  const handleTimeChange = (type, val) => {
    if (!value) return;
    const d = new Date(value);
    if (type === 'h') d.setHours(val);
    if (type === 'm') d.setMinutes(val);
    onChange(format(d, "yyyy-MM-dd'T'HH:mm"));
  };

  const displayValue = () => {
    if (!value) return includeTime ? 'Pilih Tanggal & Jam...' : 'Pilih Tanggal...';
    const d = new Date(value);
    return isValid(d) ? format(d, includeTime ? 'dd MMM yyyy, HH:mm' : 'dd MMM yyyy') : '';
  };

  return (
    <div ref={wrapperRef} className="relative w-full">
      <div
        onClick={() => !readOnly && setIsOpen(!isOpen)}
        // REVISI UI: Padding diperbesar, flex-shrink-0 pada ikon, dan truncate pada teks
        className={`w-full border rounded-lg px-3 py-2.5 flex justify-between items-center text-sm transition-all ${readOnly ? 'bg-gray-100 border-gray-300 text-gray-500 cursor-not-allowed' : 'bg-white border-gray-300 hover:border-green-500 hover:shadow-sm cursor-pointer focus:ring-2 focus:ring-green-500'}`}
      >
        <span className="font-bold text-gray-700 truncate pr-2">{displayValue()}</span>
        <span className="text-gray-400 text-base flex-shrink-0">📅</span>
      </div>

      {isOpen && !readOnly && (
        // REVISI UI: Padding pop-up diperbesar menjadi p-5 dan rounded-2xl
        <div className={`absolute z-[9999] mt-2 bg-white border border-gray-200 rounded-2xl shadow-2xl p-5 w-[330px] transform transition-all animate-fade-in ${alignRight ? 'right-0 origin-top-right' : 'left-0 origin-top-left'}`}>
          
          <div className="flex justify-between items-center mb-5 bg-green-50 p-2 rounded-xl">
            <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="w-8 h-8 rounded-md hover:bg-green-200 flex items-center justify-center font-bold text-green-700 transition-colors">&lt;</button>
            <div className="font-extrabold text-green-900 text-sm tracking-wide">
              {BULAN[currentMonth.getMonth()]} {currentMonth.getFullYear()}
            </div>
            <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="w-8 h-8 rounded-md hover:bg-green-200 flex items-center justify-center font-bold text-green-700 transition-colors">&gt;</button>
          </div>

          <div className="flex justify-between w-full mb-3">
            {HARI.map(h => <div key={h} className="w-10 text-center text-[10px] font-extrabold text-gray-400 uppercase tracking-widest">{h}</div>)}
          </div>

          {renderCells()}

          {includeTime && value && (
            <div className="mt-5 pt-4 border-t border-gray-100 flex items-center justify-between">
              <span className="text-xs font-extrabold text-gray-500 uppercase tracking-wider">Jam (HH:mm)</span>
              <div className="flex items-center gap-1 bg-gray-50 p-1.5 rounded-lg border border-gray-200">
                <select value={format(new Date(value), 'HH')} onChange={(e) => handleTimeChange('h', e.target.value)} className="bg-transparent text-sm font-black text-green-800 outline-none cursor-pointer">
                  {Array.from({length: 24}, (_, i) => i.toString().padStart(2, '0')).map(h => <option key={h} value={h}>{h}</option>)}
                </select>
                <span className="font-bold text-gray-400">:</span>
                <select value={format(new Date(value), 'mm')} onChange={(e) => handleTimeChange('m', e.target.value)} className="bg-transparent text-sm font-black text-green-800 outline-none cursor-pointer">
                  {Array.from({length: 60}, (_, i) => i.toString().padStart(2, '0')).map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
// [END: CustomDateTimePickerModule]