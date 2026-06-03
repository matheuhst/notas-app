const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const multer = require('multer');
const fs = require('fs');

const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// uploads dir (served statically)
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

// multer storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) { cb(null, uploadsDir); },
  filename: function (req, file, cb) {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, unique + ext);
  }
});
const upload = multer({ storage });

const dbFile = path.join(__dirname, 'notes.db');
console.log('Banco de dados em:', dbFile);
const db = new sqlite3.Database(dbFile, (err) => {
  if (err) console.error('Erro ao abrir banco:', err);
  else console.log('Banco de dados conectado');
});

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT
  )`, (err) => {
    if (err) console.error('Erro ao criar tabela:', err);
    else console.log('Tabela de notas verificada/criada');
  });
});

app.get('/api/notes', (req, res) => {
  db.all('SELECT * FROM notes ORDER BY created_at DESC', (err, rows) => {
    if (err) {
      console.error('Erro ao buscar notas:', err);
      return res.status(500).json({ error: err.message });
    }
    console.log('GET /api/notes - retornando', rows.length, 'notas');
    res.json(rows || []);
  });
});

app.post('/api/notes', (req, res) => {
  const { content } = req.body;
  if (typeof content !== 'string' || content.trim() === '') {
    return res.status(400).json({ error: 'Conteúdo vazio' });
  }
  const created_at = new Date().toISOString();
  console.log('POST /api/notes - salvando nova nota');
  db.run('INSERT INTO notes (content, created_at) VALUES (?, ?)', [content, created_at], function (err) {
    if (err) {
      console.error('Erro ao inserir nota:', err);
      return res.status(500).json({ error: err.message });
    }
    console.log('Nota inserida com ID:', this.lastID);
    db.get('SELECT * FROM notes WHERE id = ?', [this.lastID], (err2, row) => {
      if (err2) {
        console.error('Erro ao buscar nota inserida:', err2);
        return res.status(500).json({ error: err2.message });
      }
      res.status(201).json(row);
    });
  });
});

app.put('/api/notes/:id', (req, res) => {
  const id = req.params.id;
  const { content } = req.body;
  if (typeof content !== 'string' || content.trim() === '') {
    return res.status(400).json({ error: 'Conteúdo vazio' });
  }
  const updated_at = new Date().toISOString();
  db.run('UPDATE notes SET content = ?, updated_at = ? WHERE id = ?', [content, updated_at, id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    db.get('SELECT * FROM notes WHERE id = ?', [id], (err2, row) => {
      if (err2) return res.status(500).json({ error: err2.message });
      res.json(row);
    });
  });
});

function getUploadFilesFromContent(content) {
  const urls = [];
  const imgRegex = /<img[^>]+src=["']([^"']+)["']/g;
  let match;
  while ((match = imgRegex.exec(content)) !== null) {
    const url = match[1];
    if (url.startsWith('/uploads/')) {
      urls.push(url);
    }
  }
  return urls;
}

app.delete('/api/notes/:id', (req, res) => {
  const id = req.params.id;
  db.get('SELECT content FROM notes WHERE id = ?', [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Nota não encontrada' });

    const uploads = getUploadFilesFromContent(row.content);
    uploads.forEach((url) => {
      const filePath = path.join(__dirname, 'public', url.replace('/uploads/', 'uploads/'));
      if (fs.existsSync(filePath)) {
        fs.unlink(filePath, (unlinkErr) => {
          if (unlinkErr) console.warn('Não foi possível apagar imagem:', filePath, unlinkErr.message);
        });
      }
    });

    db.run('DELETE FROM notes WHERE id = ?', [id], function (err2) {
      if (err2) return res.status(500).json({ error: err2.message });
      res.json({ success: true });
    });
  });
});

// upload endpoint for images
app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const url = '/uploads/' + req.file.filename;
  res.json({ url });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
