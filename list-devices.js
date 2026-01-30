import HID from 'node-hid';

console.log('🔍 Scanning for HID devices...\n');

const devices = HID.devices();

console.log(`Found ${devices.length} HID devices:\n`);

devices.forEach((device, index) => {
  console.log(`[${index}] ${device.product || 'Unknown Device'}`);
  console.log(`    Vendor ID:  0x${device.vendorId.toString(16).padStart(4, '0')}`);
  console.log(`    Product ID: 0x${device.productId.toString(16).padStart(4, '0')}`);
  console.log(`    Path: ${device.path}`);
  if (device.serialNumber) {
    console.log(`    Serial: ${device.serialNumber}`);
  }
  if (device.manufacturer) {
    console.log(`    Manufacturer: ${device.manufacturer}`);
  }
  console.log(`    Usage: ${device.usage}, Usage Page: ${device.usagePage}`);
  console.log('');
});

// Find MX Dialpad specifically
const dialpad = devices.find(d => 
  d.product?.includes('MX Dialpad') || 
  (d.vendorId === 0x046d && d.productId === 0xbc00)
);

if (dialpad) {
  console.log('🎯 Found MX Dialpad!');
  console.log('Path:', dialpad.path);
  console.log('\nTo connect, run: npm start');
} else {
  console.log('⚠️  MX Dialpad not found');
}
