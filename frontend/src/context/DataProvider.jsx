// [START: DataProviderModule]
import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const DataContext = createContext();

export function DataProvider({ children }) {
    const [data, setData] = useState(null);
    // Inisialisasi loading langsung true agar tidak perlu dipanggil ganda di awal
    const [loading, setLoading] = useState(true);

    const refreshData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('http://localhost:5000/api/data');
            if (!res.ok) throw new Error("Gagal mengambil snapshot data");
            const dbData = await res.json();
            setData(dbData);
        } catch (error) {
            console.error("DataProvider Error:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        let isMounted = true;
        
        const fetchInitialData = async () => {
            try {
                const res = await fetch('http://localhost:5000/api/data');
                if (!res.ok) throw new Error("Gagal mengambil snapshot data");
                const dbData = await res.json();
                if (isMounted) {
                    setData(dbData);
                    setLoading(false);
                }
            } catch (error) {
                console.error("DataProvider Error:", error);
                if (isMounted) setLoading(false);
            }
        };

        fetchInitialData();

        return () => {
            isMounted = false;
        };
    }, []);

    return (
        <DataContext.Provider value={{ data, loading, refreshData }}>
            {children}
        </DataContext.Provider>
    );
}

// Menonaktifkan peringatan react-refresh karena mengekspor hook bersama provider adalah pola Context standar
// eslint-disable-next-line react-refresh/only-export-components
export function useAppData() {
    return useContext(DataContext);
}
// [END: DataProviderModule]