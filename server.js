import express from 'express';
import { Server } from 'socket.io';
import { createServer } from 'http';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { HIDReader } from './lib/hid-reader.js';
import { keyboard, Key } from '@nut-tree-fork/nut-js';

const app = express();
const server = createServer(app);
const io = new Server(server);
const CONFIG = './config.json';

// Load config (friction & sensitivity only)
let config = { friction: 50, sensitivity: 50 };
if (existsSync(CONFIG)) {
  try {
    config = { ...config, ...JSON.parse(readFileSync(CONFIG, 'utf8')) };
    console.log('📝 Config loaded');
  } catch (e) {
    console.error('Failed to load config');
  }
}

const reader = new HIDReader();

// Jog physics state
const jog = { pos: 0, vel: 0, lastInput: 0, interval: null, lastKey: 0 };
const trimMode = { active: false };

// Constants
const THRESHOLD = 0.1;
const MULTIPLIER = 2.5;
const KEY_THRESHOLD = 10;
let friction = config.friction;
let sensitivity = config.sensitivity;

// Keyboard queue
keyboard.config.autoDelayMs = 0;
const keyQueue = [];
let processing = false;

async function processKeys() {
  if (processing || !keyQueue.length) return;
  processing = true;
  
  while (keyQueue.length) {
    const key = keyQueue.shift();
    try {
      if (Array.isArray(key)) {
        for (const k of key) await keyboard.pressKey(k);
        for (let i = key.length - 1; i >= 0; i--) await keyboard.releaseKey(key[i]);
      } else {
        await keyboard.type(key);
      }
    } catch (e) {
      console.error('Key error:', e.message);
    }
  }
  processing = false;
}

// Physics tick
function tick() {
  const now = Date.now();
  
  if (Math.abs(jog.vel) < THRESHOLD) {
    jog.vel = 0;
    clearInterval(jog.interval);
    jog.interval = null;
    return;
  }
  
  if (now - jog.lastInput > 50) {
    const decay = Math.max(0.8, Math.min(0.99, 1 - (0.08 * Math.max(0.1, friction / 50))));
    jog.vel *= decay;
    if (Math.abs(jog.vel) < THRESHOLD) {
      jog.vel = 0;
      clearInterval(jog.interval);
      jog.interval = null;
      return;
    }
  }
  
  jog.pos += jog.vel * (sensitivity / 50);
  
  const delta = jog.pos - jog.lastKey;
  if (Math.abs(delta) >= KEY_THRESHOLD) {
    const num = Math.floor(Math.abs(delta) / KEY_THRESHOLD);
    const dir = delta > 0;
    const key = trimMode.active ? (dir ? Key.Period : Key.Comma) : (dir ? Key.Right : Key.Left);
    
    for (let i = 0; i < num; i++) {
      keyQueue.push(key);
      console.log(`⌨️  ${trimMode.active ? (dir ? '.' : ',') : (dir ? '→' : '←')}`);
      jog.lastKey += dir ? KEY_THRESHOLD : -KEY_THRESHOLD;
    }
    processKeys();
  }
}

function startPhysics() {
  if (!jog.interval) jog.interval = setInterval(tick, 8);
}

// Middleware
app.use(express.json());
app.use(express.static('public'));

// API
app.get('/api/config', (req, res) => res.json(config));

app.post('/api/config', (req, res) => {
  config = req.body;
  if (req.body.friction != null) friction = config.friction = req.body.friction;
  if (req.body.sensitivity != null) sensitivity = config.sensitivity = req.body.sensitivity;
  writeFileSync(CONFIG, JSON.stringify(config, null, 2));
  res.json({ success: true });
});

app.post('/api/physics/friction', (req, res) => {
  friction = config.friction = Math.max(5, Math.min(100, req.body.value));
  writeFileSync(CONFIG, JSON.stringify(config, null, 2));
  res.json({ success: true });
});

app.post('/api/physics/sensitivity', (req, res) => {
  sensitivity = config.sensitivity = Math.max(1, Math.min(100, req.body.value));
  writeFileSync(CONFIG, JSON.stringify(config, null, 2));
  res.json({ success: true });
});

// Socket.IO
io.on('connection', socket => {
  socket.emit('config', config);
  socket.emit('status', { connected: reader.isConnected, reportCount: reader.reportCount });
});

// HID events
reader.on('connected', () => io.emit('status', { connected: true, reportCount: reader.reportCount }));
reader.on('disconnected', () => io.emit('status', { connected: false, reportCount: reader.reportCount }));
reader.on('error', err => io.emit('error', err.message));

reader.on('data', report => {
  io.emit('report', report);
  
  report.events.forEach(e => {
    // Trim mode toggle (BottomLeft button)
    if (e.type === 'button' && e.name === 'BottomLeft') {
      if (e.action === 'press') {
        trimMode.active = true;
        keyQueue.push(Key.T, Key.V);
        processKeys();
      } else if (e.action === 'release') {
        trimMode.active = false;
        keyQueue.push([Key.LeftShift, Key.V], Key.A);
        processKeys();
      }
    }
    
    // Jog physics
    if (e.type === 'scroll' && e.name === 'Jog') {
      jog.lastInput = Date.now();
      const target = e.amount * MULTIPLIER * (e.direction === 'up' ? 1 : -1);
      const accel = Math.min(0.5, 0.2 / Math.max(0.1, friction / 50));
      jog.vel += (target - jog.vel) * accel;
      startPhysics();
    }
  });
});

// Start
server.listen(8080, '127.0.0.1', () => {
  console.log('🚀 Server: http://localhost:8080');
  
  const devices = HIDReader.findMXDialpad();
  if (devices.length) {
    const device = devices.find(d => d.usagePage === 0xff43) || devices[0];
    if (!reader.connect(device.path)) console.log('⚠️  Connection failed');
  }
});

process.on('SIGINT', () => {
  reader.disconnect();
  process.exit(0);
});
