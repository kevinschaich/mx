import express from 'express';
import { Server } from 'socket.io';
import { createServer } from 'http';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { HIDReader } from './lib/hid-reader.js';
import { keyboard, Key } from '@nut-tree-fork/nut-js';

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

// Physics state for Jog wheel (matching HTML logic exactly)
const jogState = {
  position: 0,
  velocity: 0,
  lastInputTime: 0,
  animationInterval: null,
  lastKeyPosition: 0
};

// Physics constants (matching HTML)
const VELOCITY_THRESHOLD = 0.1;
const TARGET_MULTIPLIER = 2.5;
let globalFriction = 50;
let globalSensitivity = 50;
const KEY_THRESHOLD = 10; // Send key every 10 position units

// Optimize keyboard for speed - set config once
keyboard.config.autoDelayMs = 0; // No delay between press/release

// Non-blocking keyboard queue to prevent blocking the physics loop
const keyQueue = [];
let isProcessingKeys = false;

async function processKeyQueue() {
  if (isProcessingKeys || keyQueue.length === 0) return;
  
  isProcessingKeys = true;
  while (keyQueue.length > 0) {
    const key = keyQueue.shift();
    try {
      await keyboard.type(key);
    } catch (err) {
      console.error('Key error:', err.message);
    }
  }
  isProcessingKeys = false;
}

// Physics tick function (matching HTML animateJogWheel)
function jogPhysicsTick() {
  const now = Date.now();
  const timeSinceInput = now - jogState.lastInputTime;
  
  // Stop if velocity is too small
  if (Math.abs(jogState.velocity) < VELOCITY_THRESHOLD) {
    jogState.velocity = 0;
    if (jogState.animationInterval) {
      clearInterval(jogState.animationInterval);
      jogState.animationInterval = null;
    }
    return;
  }
  
  // Apply friction if no recent input
  if (timeSinceInput > 50) {
    const frictionFactor = Math.max(0.1, globalFriction / 50);
    const baseDecayRate = 0.92;
    const decayRate = Math.max(0.8, Math.min(0.99, 1 - ((1 - baseDecayRate) * frictionFactor)));
    jogState.velocity *= decayRate;
    
    // Check again if velocity dropped below threshold
    if (Math.abs(jogState.velocity) < VELOCITY_THRESHOLD) {
      jogState.velocity = 0;
      if (jogState.animationInterval) {
        clearInterval(jogState.animationInterval);
        jogState.animationInterval = null;
      }
      return;
    }
  }
  
  // Update position based on velocity with sensitivity scaling
  const scaledVelocity = jogState.velocity * (globalSensitivity / 50);
  jogState.position += scaledVelocity;
  
  // Send keyboard events based on position changes (non-blocking)
  const positionDelta = jogState.position - jogState.lastKeyPosition;
  if (Math.abs(positionDelta) >= KEY_THRESHOLD) {
    const numKeys = Math.floor(Math.abs(positionDelta) / KEY_THRESHOLD);
    const direction = positionDelta > 0 ? 'right' : 'left';
    const key = direction === 'right' ? Key.Right : Key.Left;
    const symbol = direction === 'right' ? '→' : '←';
    
    // Queue keys instead of sending synchronously
    for (let i = 0; i < numKeys; i++) {
      keyQueue.push(key);
      console.log(`⌨️  ${symbol}`);
      jogState.lastKeyPosition += (direction === 'right' ? KEY_THRESHOLD : -KEY_THRESHOLD);
    }
    
    // Trigger async processing
    processKeyQueue();
  }
}

// Start physics animation with higher tick rate for lower latency
function startJogPhysics() {
  if (jogState.animationInterval) return;
  jogState.animationInterval = setInterval(jogPhysicsTick, 8); // 125 FPS for lower latency
}

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

app.post('/api/physics/friction', (req, res) => {
  const { value } = req.body;
  if (value !== undefined) {
    globalFriction = Math.max(5, Math.min(100, value));
    console.log(`🎛️  Friction: ${globalFriction}`);
    res.json({ success: true, friction: globalFriction });
  } else {
    res.status(400).json({ error: 'Missing value' });
  }
});

app.post('/api/physics/sensitivity', (req, res) => {
  const { value } = req.body;
  if (value !== undefined) {
    globalSensitivity = Math.max(1, Math.min(100, value));
    console.log(`🎛️  Sensitivity: ${globalSensitivity}`);
    res.json({ success: true, sensitivity: globalSensitivity });
  } else {
    res.status(400).json({ error: 'Missing value' });
  }
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
  
  // Handle scroll events with physics (matching HTML updateJogWheel logic)
  report.events.forEach((event) => {
    if (event.type === 'scroll' && (event.name === 'Jog' || event.byte === 7)) {
      // Record input time
      jogState.lastInputTime = Date.now();
      
      // Calculate target velocity based on input (matching HTML)
      const inputSpeed = event.amount;
      const direction = event.direction === 'up' ? 1 : -1;
      const targetVelocity = inputSpeed * TARGET_MULTIPLIER * direction;
      
      // Calculate acceleration with friction (matching HTML)
      const frictionFactor = Math.max(0.1, globalFriction / 50);
      const accelerationRate = Math.min(0.5, 0.2 / frictionFactor);
      
      // Apply acceleration toward target
      const velocityDiff = targetVelocity - jogState.velocity;
      jogState.velocity += velocityDiff * accelerationRate;
      
      // Start physics animation if not already running
      startJogPhysics();
    }
  });
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
  console.log(`💡 NOTE: Only one program can connect to the device at a time`);
  console.log(`   If the CLI (npm run cli) is running, stop it first!`);
  
  // Auto-connect to the first available device
  const devices = HIDReader.findMXDialpad();
  if (devices.length > 0) {
    // Connect to the vendor-specific interface (Usage Page 0xff43)
    const targetDevice = devices.find(d => d.usagePage === 0xff43) || devices[0];
    console.log(`🔌 Auto-connecting to: ${targetDevice.product} (Usage Page: 0x${targetDevice.usagePage.toString(16)})`);
    const success = reader.connect(targetDevice.path);
    if (!success) {
      console.log(`⚠️  Connection failed - device may be in use by another program (check if CLI is running)`);
    }
  }
});

// Cleanup on exit
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down...');
  reader.disconnect();
  process.exit(0);
});
