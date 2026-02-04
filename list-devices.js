import HID from 'node-hid';

const devices = HID.devices();
console.log(`🔍 Found ${devices.length} HID devices:\n`);
devices.forEach((d, i) => console.log(`[${i}] ${d.product || 'Unknown'}\n    VID: 0x${d.vendorId.toString(16).padStart(4, '0')} PID: 0x${d.productId.toString(16).padStart(4, '0')}\n    ${d.path}\n`));

const dialpad = devices.find(d => d.vendorId === 0x046d && d.productId === 0xbc00);
console.log(dialpad ? '🎯 MX Dialpad found! Run "npm start" to connect' : '⚠️  MX Dialpad not found');
