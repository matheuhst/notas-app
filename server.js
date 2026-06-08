const express = require('express');
const path = require('path');
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

// Database initialization
let db;
const isProduction = process.env.DATABASE_URL;

if (isProduction) {
  // PostgreSQL em produção
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  
  db = {
    all: (query, params, callback) => {
      pool.query(query, params, (err, result) => {
        if (err) return callback(err, null);
        callback(null, result.rows);
      });
    },
    get: (query, params, callback) => {
      pool.query(query, params, (err, result) => {
        if (err) return callback(err, null);
        callback(null, result.rows[0]);
      });
    },
    run: (query, params, callback) => {
      pool.query(query, params, (err, result) => {
        if (err) return callback(err);
        if (typeof callback === 'function') {
          callback.call({ lastID: result.rows[0]?.id }, err);
        }
      });
    }
  };
  
  // Create table PostgreSQL
  pool.query(`
    CREATE TABLE IF NOT EXISTS notes (
      id SERIAL PRIMARY KEY,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT
    )
  `, (err) => {
    if (err) console.error('Erro ao criar tabela PostgreSQL:', err);
    else console.log('Tabela PostgreSQL verificada/criada');
  });
  
  console.log('Usando PostgreSQL');
} else {
  // SQLite em desenvolvimento
  const sqlite3 = require('sqlite3').verbose();
  const dbFile = path.join(__dirname, 'notes.db');
  console.log('Usando SQLite em:', dbFile);
  
  const sqlite_db = new sqlite3.Database(dbFile, (err) => {
    if (err) console.error('Erro ao abrir banco SQLite:', err);
    else console.log('Banco SQLite conectado');
  });
  
  sqlite_db.serialize(() => {
    sqlite_db.run(`CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT
    )`, (err) => {
      if (err) console.error('Erro ao criar tabela SQLite:', err);
      else console.log('Tabela SQLite verificada/criada');
    });
  });
  
  db = {
    all: (query, params, callback) => {
      sqlite_db.all(query, params, callback);
    },
    get: (query, params, callback) => {
      sqlite_db.get(query, params, callback);
    },
    run: (query, params, callback) => {
      sqlite_db.run(query, params, callback);
    }
  };
}

app.get('/api/notes', (req, res) => {
  db.all('SELECT * FROM notes ORDER BY created_at DESC', [], (err, rows) => {
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
  
  if (isProduction) {
    const query = 'INSERT INTO notes (content, created_at) VALUES ($1, $2) RETURNING *';
    db.run(query, [content, created_at], (err) => {
      if (err) {
        console.error('Erro ao inserir nota:', err);
        return res.status(500).json({ error: err.message });
      }
      db.get('SELECT * FROM notes ORDER BY id DESC LIMIT 1', [], (err2, row) => {
        if (err2) {
          console.error('Erro ao buscar nota inserida:', err2);
          return res.status(500).json({ error: err2.message });
        }
        res.status(201).json(row);
      });
    });
  } else {
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
  }
});

app.put('/api/notes/:id', (req, res) => {
  const id = req.params.id;
  const { content } = req.body;
  if (typeof content !== 'string' || content.trim() === '') {
    return res.status(400).json({ error: 'Conteúdo vazio' });
  }
  const updated_at = new Date().toISOString();
  
  if (isProduction) {
    const query = 'UPDATE notes SET content = $1, updated_at = $2 WHERE id = $3';
    db.run(query, [content, updated_at, id], (err) => {
      if (err) {
        console.error('Erro ao atualizar nota:', err);
        return res.status(500).json({ error: err.message });
      }
      db.get('SELECT * FROM notes WHERE id = $1', [id], (err2, row) => {
        if (err2) {
          console.error('Erro ao buscar nota atualizada:', err2);
          return res.status(500).json({ error: err2.message });
        }
        res.json(row);
      });
    });
  } else {
    db.run('UPDATE notes SET content = ?, updated_at = ? WHERE id = ?', [content, updated_at, id], function (err) {
      if (err) {
        console.error('Erro ao atualizar nota:', err);
        return res.status(500).json({ error: err.message });
      }
      db.get('SELECT * FROM notes WHERE id = ?', [id], (err2, row) => {
        if (err2) {
          console.error('Erro ao buscar nota atualizada:', err2);
          return res.status(500).json({ error: err2.message });
        }
        res.json(row);
      });
    });
  }
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
  const selectQuery = isProduction ? 'SELECT content FROM notes WHERE id = $1' : 'SELECT content FROM notes WHERE id = ?';
  const params = isProduction ? [id] : [id];
  db.get(selectQuery, params, (err, row) => {
    if (err) {
      console.error('Erro ao buscar nota para deletar:', err);
      return res.status(500).json({ error: err.message });
    }
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

    if (isProduction) {
      db.run('DELETE FROM notes WHERE id = $1', [id], (err2) => {
        if (err2) {
          console.error('Erro ao deletar nota:', err2);
          return res.status(500).json({ error: err2.message });
        }
        res.json({ success: true });
      });
    } else {
      db.run('DELETE FROM notes WHERE id = ?', [id], function (err2) {
        if (err2) {
          console.error('Erro ao deletar nota:', err2);
          return res.status(500).json({ error: err2.message });
        }
        res.json({ success: true });
      });
    }
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
