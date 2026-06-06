const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const DB_PATH = path.join(__dirname, 'data', 'database.json');
const BACKUP_DIR = path.join(__dirname, 'backups');

// Pastikan folder data dan backups ada
if (!fs.existsSync(path.join(__dirname, 'data'))) fs.mkdirSync(path.join(__dirname, 'data'));
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR);

// Fungsi Logika Rotasi Backup (Maksimal 3 File)
function runAutoBackup() {
    try {
        if (!fs.existsSync(DB_PATH)) return;

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFileName = `backup_${timestamp}.json`;
        const backupFilePath = path.join(BACKUP_DIR, backupFileName);
        
        fs.copyFileSync(DB_PATH, backupFilePath);
        console.log(`[Backup] Berhasil membuat backup: ${backupFileName}`);

        const files = fs.readdirSync(BACKUP_DIR)
                        .filter(file => file.startsWith('backup_') && file.endsWith('.json'))
                        .map(file => ({
                            name: file,
                            time: fs.statSync(path.join(BACKUP_DIR, file)).mtime.getTime()
                        }))
                        .sort((a, b) => a.time - b.time);

        while (files.length > 3) {
            const oldestFile = files.shift();
            fs.unlinkSync(path.join(BACKUP_DIR, oldestFile.name));
            console.log(`[Backup Rotasi] Menghapus backup terlama: ${oldestFile.name}`);
        }
    } catch (error) {
        console.error('[Backup Error]', error);
    }
}

// API Endpoint untuk mengambil data
app.get('/api/data', (req, res) => {
    if (!fs.existsSync(DB_PATH)) {
        // Jika file belum ada, buat template kosong awal
        const initialData = { settings: { totalRooms: { "double-bed": 20, "twin-bed": 5, "single-bed": 5 }, prices: { harian: {}, transit: {}, kos: {} }, depositDefault: 50000 }, dailyTransactions: [], activeKost: [] };
        fs.writeFileSync(DB_PATH, JSON.stringify(initialData, null, 2));
    }
    const data = fs.readFileSync(DB_PATH, 'utf8');
    res.json(JSON.parse(data));
});

// API Endpoint untuk menyimpan data (Auto Save dari Frontend + Trigger Backup)
app.post('/api/data/save', (req, res) => {
    try {
        const newData = req.body;
        
        fs.writeFileSync(DB_PATH, JSON.stringify(newData, null, 2), 'utf8');
        runAutoBackup();

        res.json({ success: true, message: 'Data berhasil disimpan dan dibackup.' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

const PORT = 5000;
app.listen(PORT, () => {
    console.log(`Server FO Helper berjalan di http://localhost:${PORT}`);
});