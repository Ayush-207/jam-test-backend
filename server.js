const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const app = express();

app.use(cors());
app.use(express.json());

// Initialize SQLite Database
const db = new sqlite3.Database('./jamrooms.db', (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('Connected to SQLite database');
    initializeDatabase();
  }
});

function initializeDatabase() {
  // Jam Rooms table
  db.run(`
    CREATE TABLE IF NOT EXISTS jam_rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      admin_id TEXT,
      track_uri TEXT,
      created_by TEXT NOT NULL,
      created_by_name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Mixtapes table
  db.run(`
    CREATE TABLE IF NOT EXISTS mixtapes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      created_by TEXT NOT NULL,
      created_by_name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Mixtape songs table
  db.run(`
    CREATE TABLE IF NOT EXISTS mixtape_songs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mixtape_id INTEGER NOT NULL,
      track_id TEXT NOT NULL,
      track_name TEXT NOT NULL,
      artist_name TEXT NOT NULL,
      album_image TEXT,
      prompt TEXT,
      added_by TEXT NOT NULL,
      added_by_name TEXT NOT NULL,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (mixtape_id) REFERENCES mixtapes(id)
    )
  `);

  // Song likes table
  db.run(`
    CREATE TABLE IF NOT EXISTS song_likes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      song_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(song_id, user_id),
      FOREIGN KEY (song_id) REFERENCES mixtape_songs(id)
    )
  `);
}

// JAM ROOMS ENDPOINTS

// Get all jam rooms
app.get('/jamrooms', (req, res) => {
  db.all('SELECT * FROM jam_rooms ORDER BY created_at DESC', [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});


app.post('/jamrooms', (req, res) => {
  const { title, description, admin_id, createdBy, createdByName } = req.body;
  
  db.run(
    'INSERT INTO jam_rooms (title, description, admin_id, created_by, created_by_name) VALUES (?, ?, ?, ?, ?)',
    [title, description, admin_id, createdBy, createdByName],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ id: this.lastID, title, description, createdBy, createdByName });
    }
  );
});

// Get room state
app.get('/jamrooms/:id/state', (req, res) => {
  const id = req.params.id;
  db.get(`SELECT id, title, admin_id, track_uri FROM jam_rooms WHERE id = ?`, [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'room not found' });
    res.json(row);
  });
});

app.post('/jamrooms/:id/state', (req, res) => {
  const id = req.params.id;
  const { track_uri, admin_id } = req.body;
  const now = Date.now();

  db.get(`SELECT admin_id FROM jam_rooms WHERE id = ?`, [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'room not found' });
  
    db.run(
      `UPDATE jam_rooms SET track_uri = ?, admin_id = ? WHERE id = ?`,
      [track_uri, admin_id || row.admin_id, id],
      function (uerr) {
        if (uerr) return res.status(500).json({ error: uerr.message });
        db.get(`SELECT id, title, admin_id, track_uri FROM jam_rooms WHERE id = ?`, [id], (e, updatedRow) => {
          if (e) return res.status(500).json({ error: e.message });
          res.json(updatedRow);
        });
      }
    );
  });
});

// MIXTAPES ENDPOINTS

// Get all mixtapes with song count
app.get('/mixtapes', (req, res) => {
  const query = `
    SELECT m.*, COUNT(ms.id) as songCount
    FROM mixtapes m
    LEFT JOIN mixtape_songs ms ON m.id = ms.mixtape_id
    GROUP BY m.id
    ORDER BY m.created_at DESC
  `;
  
  db.all(query, [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// Create mixtape
app.post('/mixtapes', (req, res) => {
  const { title, description, createdBy, createdByName } = req.body;
  
  db.run(
    'INSERT INTO mixtapes (title, description, created_by, created_by_name) VALUES (?, ?, ?, ?)',
    [title, description, createdBy, createdByName],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ id: this.lastID, title, description, createdBy, createdByName });
    }
  );
});

// Get mixtape songs with like counts
app.get('/mixtapes/:id/songs', (req, res) => {
  const { id } = req.params;
  
  const query = `
    SELECT ms.*, COUNT(sl.id) as likes
    FROM mixtape_songs ms
    LEFT JOIN song_likes sl ON ms.id = sl.song_id
    WHERE ms.mixtape_id = ?
    GROUP BY ms.id
    ORDER BY ms.added_at DESC
  `;
  
  db.all(query, [id], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// Add song to mixtape
app.post('/mixtapes/:id/songs', (req, res) => {
  const { id } = req.params;
  const { trackId, trackName, artistName, albumImage, prompt, addedBy, addedByName } = req.body;
  
  db.run(
    `INSERT INTO mixtape_songs 
     (mixtape_id, track_id, track_name, artist_name, album_image, prompt, added_by, added_by_name) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, trackId, trackName, artistName, albumImage, prompt, addedBy, addedByName],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ id: this.lastID });
    }
  );
});

// Like a song
app.post('/mixtapes/songs/:songId/like', (req, res) => {
  const { songId } = req.params;
  const { userId } = req.body;
  
  // Check if already liked
  db.get('SELECT * FROM song_likes WHERE song_id = ? AND user_id = ?', [songId, userId], (err, row) => {
    if (row) {
      // Unlike
      db.run('DELETE FROM song_likes WHERE song_id = ? AND user_id = ?', [songId, userId], (err) => {
        if (err) {
          res.status(500).json({ error: err.message });
          return;
        }
        res.json({ liked: false });
      });
    } else {
      // Like
      db.run('INSERT INTO song_likes (song_id, user_id) VALUES (?, ?)', [songId, userId], (err) => {
        if (err) {
          res.status(500).json({ error: err.message });
          return;
        }
        res.json({ liked: true });
      });
    }
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});