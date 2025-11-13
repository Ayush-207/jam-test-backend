const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// In-memory storage for room states
const rooms = new Map();

// Get room state
app.get('/rooms/:id/state', (req, res) => {
  const roomId = req.params.id.toUpperCase();
  const roomState = rooms.get(roomId);
  
  if (!roomState) {
    return res.json({
      trackUri: null,
      positionMs: 0,
      isPlaying: false,
      timestamp: Date.now()
    });
  }
  
  res.json(roomState);
});

// Update room state
app.post('/rooms/:id/state', (req, res) => {
  const roomId = req.params.id.toUpperCase();
  const { trackUri, positionMs, isPlaying, timestamp } = req.body;
  
  rooms.set(roomId, {
    trackUri,
    positionMs,
    isPlaying,
    timestamp: timestamp || Date.now()
  });
  
  res.json({ success: true, roomId });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', rooms: rooms.size });
});

// Clean up old rooms (optional - run periodically)
setInterval(() => {
  const now = Date.now();
  const ONE_HOUR = 60 * 60 * 1000;
  
  for (const [roomId, state] of rooms.entries()) {
    if (now - state.timestamp > ONE_HOUR) {
      rooms.delete(roomId);
      console.log(`Cleaned up room: ${roomId}`);
    }
  }
}, 10 * 60 * 1000); // Every 10 minutes

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Jam Rooms server running on port ${PORT}`);
});