import express from 'express';
import { Server } from 'socket.io';
import { createServer } from 'http';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { HIDReader } from './lib/hid-reader.js';

const app = express();
const server = createServer(app);
const io = new Server(server);

const CONFIG_FILE = './config.json';
const PORT = 8080;

// Load or create config
let config = { buttons: {}, scrollWheels: {} };
if (existsSync(CONFIG_FILE)) {
  try {
    config = JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
  } catch (err) {
    console.error('Failed to load config:', err.message);
  }
}

const reader = new HIDReader(config);

// Middleware
app.use(express.json());
app.use(express.static('public'));

// API Routes
app.get('/api/devices', (req, res) => {
  const devices = HIDReader.findMXDialpad();
  res.json(devices.map(d => ({
    path: d.path,
    product: d.product,
    manufacturer: d.manufacturer,
    serialNumber: d.serialNumber,
    usage: d.usage,
    usagePage: d.usagePage
  })));
});

app.get('/api/config', (req, res) => {
  res.json(config);
});

app.post('/api/config', (req, res) => {
  config = req.body;
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  reader.updateConfig(config);
  res.json({ success: true });
});

app.get('/api/status', (req, res) => {
  res.json({
    connected: reader.isConnected,
    reportCount: reader.reportCount
  });
});

app.post('/api/connect', (req, res) => {
  const { path } = req.body;
  const success = reader.connect(path);
  res.json({ success });
});

app.post('/api/disconnect', (req, res) => {
  reader.disconnect();
  res.json({ success: true });
});

// Socket.IO events
io.on('connection', (socket) => {
  console.log('Client connected');
  
  socket.emit('config', config);
  socket.emit('status', {
    connected: reader.isConnected,
    reportCount: reader.reportCount
  });
});

// HID Reader events
reader.on('connected', (info) => {
  console.log('✅ Device connected:', info.path);
  io.emit('status', {
    connected: true,
    reportCount: reader.reportCount
  });
});

reader.on('disconnected', () => {
  console.log('❌ Device disconnected');
  io.emit('status', {
    connected: false,
    reportCount: reader.reportCount
  });
});

reader.on('data', (report) => {
  // Broadcast to all connected clients
  io.emit('report', report);
});

reader.on('error', (err) => {
  console.error('Device error:', err.message);
  io.emit('error', err.message);
});

reader.on('config-updated', (newConfig) => {
  io.emit('config', newConfig);
});

// Start server
server.listen(PORT, '127.0.0.1', () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log(`📊 Ready to connect to MX Dialpad`);
  
  // Auto-connect to the first available device
  const devices = HIDReader.findMXDialpad();
  if (devices.length > 0) {
    // Connect to the vendor-specific interface (Usage Page 0xff43)
    const targetDevice = devices.find(d => d.usagePage === 0xff43) || devices[0];
    console.log(`🔌 Auto-connecting to: ${targetDevice.product} (Usage Page: 0x${targetDevice.usagePage.toString(16)})`);
    reader.connect(targetDevice.path);
  }
});

// Cleanup on exit
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down...');
  reader.disconnect();
  process.exit(0);
});
