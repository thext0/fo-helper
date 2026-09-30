// [START: BackendServerModule]
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json({ limit: '50mb' })); // Limit diperbesar untuk antisipasi data besar

// Penyesuaian direktori ke dalam folder 'data'
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'database.json');
const DB_TMP_FILE = path.join(DATA_DIR, 'database.tmp.json');
const BACKUP_DIR = DATA_DIR; 

// Pastikan folder data eksis sebelum server mencoba membaca/menulis
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// 1. IN-MEMORY CACHE
let memoryDb = null;

// 2. ASYNCHRONOUS WRITE QUEUE STATE
let isWriting = false;
let writePending = false;

// 3. BACKUP DEBOUNCE STATE
let backupTimeout = null;

// [START: Database Initialization]
async function loadDatabase() {
    try {
        const data = await fs.promises.readFile(DB_FILE, 'utf8');
        memoryDb = JSON.parse(data);
        console.log('✅ Database berhasil dimuat ke Memory Cache.');
    } catch (err) {
        if (err.code === 'ENOENT') {
            console.log('⚠️ File database tidak ditemukan di folder data/. Membuat database awal...');
            memoryDb = { 
                settings: {}, 
                guests: [], 
                dailyTransactions: [], 
                activeKost: [] 
            };
            await flushToDisk();
        } else {
            console.error('❌ Gagal memuat database:', err);
            process.exit(1);
        }
    }
}
// [END: Database Initialization]

// [START: Asynchronous Atomic Write]
async function flushToDisk() {
    if (isWriting) {
        writePending = true;
        return;
    }

    isWriting = true;
    writePending = false;

    try {
        const dataString = JSON.stringify(memoryDb, null, 2);
        
        await fs.promises.writeFile(DB_TMP_FILE, dataString, 'utf8');
        await fs.promises.rename(DB_TMP_FILE, DB_FILE);
        
        console.log(`💾 Data tersimpan ke disk (${new Date().toLocaleTimeString()})`);
    } catch (err) {
        console.error('❌ Gagal sinkronisasi ke disk:', err);
    } finally {
        isWriting = false;
        if (writePending) {
            flushToDisk();
        }
    }
}
// [END: Asynchronous Atomic Write]

// [START: Debounced Backup]
function scheduleBackup() {
    if (backupTimeout) {
        clearTimeout(backupTimeout);
    }

    backupTimeout = setTimeout(async () => {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupFile = path.join(BACKUP_DIR, `database-backup-${timestamp}.json`);
            
            await fs.promises.copyFile(DB_FILE, backupFile);
            console.log(`📦 Backup berhasil dibuat: ${backupFile}`);

            const files = await fs.promises.readdir(BACKUP_DIR);
            const backupFiles = files
                .filter(f => f.startsWith('database-backup-') && f.endsWith('.json'))
                .sort(); 

            if (backupFiles.length > 3) {
                const filesToDelete = backupFiles.slice(0, backupFiles.length - 3);
                for (const file of filesToDelete) {
                    await fs.promises.unlink(path.join(BACKUP_DIR, file));
                    console.log(`🗑️ Backup lama dihapus: ${file}`);
                }
            }
        } catch (error) {
            console.error('❌ Proses backup gagal:', error);
        }
    }, 30000); 
}
// [END: Debounced Backup]

// [START: API Endpoints]
app.get('/api/data', (req, res) => {
    if (!memoryDb) {
        return res.status(503).json({ error: 'Server sedang memuat database, coba lagi sebentar.' });
    }
    res.json(memoryDb);
});

app.post('/api/data/save', (req, res) => {
    try {
        if (!req.body || typeof req.body !== 'object') {
            return res.status(400).json({ success: false, error: 'Format data tidak valid' });
        }

        memoryDb = req.body;
        flushToDisk();
        scheduleBackup();

        res.json({ success: true, message: 'Data masuk ke antrean penyimpanan' });
    } catch (error) {
        console.error('API Save Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});
// [END: API Endpoints]

loadDatabase().then(() => {
    app.listen(PORT, () => {
        console.log(`🚀 FO Helper Backend berjalan di http://localhost:${PORT}`);
    });
});
// [END: BackendServerModule]