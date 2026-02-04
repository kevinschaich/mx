import { HIDReader } from './lib/hid-reader.js';
import { readFileSync, existsSync } from 'fs';

console.log('🔌 MX Dialpad CLI Monitor\n');

// Find device
const devices = HIDReader.findMXDialpad();
if (!devices.length) {
  console.error('❌ MX Dialpad not found! Run "npm run list" to see devices');
  process.exit(1);
}

console.log(`Found ${devices.length} MX Dialpad interface(s)\n`);
const device = devices.find(d => d.usagePage === 0xff43) || devices[0];
console.log(`🎯 Connecting to: ${device.product}\n`);

const reader = new HIDReader();

reader.on('connected', () => {
  console.log('✅ Connected!\n');
  console.log('⏳ Listening for input...\n');
});

reader.on('data', report => {
  console.log('─'.repeat(60));
  console.log(`🔔 Report #${report.count} at ${new Date(report.timestamp).toLocaleTimeString()}`);
  console.log(`   Raw: ${report.hex}`);
  
  if (report.events.length) {
    console.log('\n   🎯 Events:');
    report.events.forEach(e => {
      if (e.type === 'button') {
        console.log(`      🔘 ${e.name} ${e.action.toUpperCase()}`);
      } else if (e.type === 'scroll') {
        console.log(`      🔄 ${e.name} ${e.direction.toUpperCase()} by ${e.amount}`);
      }
    });
  }
  console.log('');
});

reader.on('error', err => console.error('❌ Error:', err.message));
reader.on('disconnected', () => {
  console.log('❌ Device disconnected');
  process.exit(0);
});

if (!reader.connect(device.path)) {
  console.error('❌ Failed to connect');
  process.exit(1);
}

process.on('SIGINT', () => {
  console.log('\n👋 Closing...');
  reader.disconnect();
  process.exit(0);
});

console.log('Press Ctrl+C to exit\n');
