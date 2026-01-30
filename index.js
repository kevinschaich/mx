import { HIDReader } from './lib/hid-reader.js';
import { readFileSync, existsSync } from 'fs';

console.log('🔌 MX Dialpad CLI Monitor\n');

// Load config if exists
let config = { buttons: {}, scrollWheels: {} };
if (existsSync('./config.json')) {
  try {
    config = JSON.parse(readFileSync('./config.json', 'utf8'));
    console.log('✅ Loaded configuration from config.json\n');
  } catch (err) {
    console.warn('⚠️  Failed to load config, using defaults\n');
  }
}

// Find MX Dialpad
const devices = HIDReader.findMXDialpad();

if (devices.length === 0) {
  console.error('❌ MX Dialpad not found!');
  console.log('Run "npm run list" to see all available devices');
  process.exit(1);
}

console.log(`Found ${devices.length} MX Dialpad interface(s):\n`);
devices.forEach((d, i) => {
  console.log(`[${i}] ${d.product}`);
  console.log(`    Usage: ${d.usage}, Usage Page: ${d.usagePage}`);
  console.log(`    Path: ${d.path}`);
});

// Connect to the vendor-specific interface
const targetDevice = devices.find(d => d.usagePage === 0xff43) || devices[0];

console.log(`\n🎯 Connecting to: ${targetDevice.product}`);
console.log(`   Path: ${targetDevice.path}`);
console.log(`   Usage Page: 0x${targetDevice.usagePage.toString(16)}\n`);

const reader = new HIDReader(config);

reader.on('connected', () => {
  console.log('✅ Connected successfully!\n');
  console.log('📊 Device Info:');
  console.log(`   Manufacturer: ${targetDevice.manufacturer || 'N/A'}`);
  console.log(`   Product: ${targetDevice.product || 'N/A'}`);
  console.log(`   Serial: ${targetDevice.serialNumber || 'N/A'}`);
  console.log('');
  console.log('⏳ Listening for input reports...\n');
  console.log('💡 TIP: Use the web UI (npm start) to configure button/scroll mappings\n');
});

reader.on('data', (report) => {
  console.log('─'.repeat(80));
  console.log(`🔔 Report #${report.count} at ${new Date(report.timestamp).toLocaleTimeString()}`);
  console.log(`   Raw: ${report.hex}`);
  
  if (report.changes.length > 0) {
    console.log('\n   📊 Changes:');
    report.changes.forEach(ch => {
      console.log(`      Byte[${ch.index}]: ${ch.prev} → ${ch.curr} (${ch.diff > 0 ? '+' : ''}${ch.diff})`);
    });
  }
  
  if (report.events.length > 0) {
    console.log('\n   🎯 Events:');
    report.events.forEach(event => {
      if (event.type === 'button') {
        console.log(`      🔘 ${event.name} ${event.action.toUpperCase()}`);
      } else if (event.type === 'scroll') {
        console.log(`      🔄 ${event.name} ${event.direction.toUpperCase()} by ${event.amount} (pos: ${event.position})`);
      } else if (event.type === 'value') {
        console.log(`      📍 ${event.name}: ${event.prev} → ${event.curr}`);
      }
    });
  }
  
  console.log('');
});

reader.on('error', (err) => {
  console.error('❌ Device error:', err.message);
});

reader.on('disconnected', () => {
  console.log('❌ Device disconnected');
  process.exit(0);
});

// Connect
const success = reader.connect(targetDevice.path);

if (!success) {
  console.error('❌ Failed to connect to device');
  process.exit(1);
}

// Cleanup on exit
process.on('SIGINT', () => {
  console.log('\n\n👋 Closing device...');
  reader.disconnect();
  console.log(`\n📊 Total reports received: ${reader.reportCount}`);
  process.exit(0);
});

console.log('Press Ctrl+C to exit\n');
