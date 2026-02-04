import HID from 'node-hid';
import { EventEmitter } from 'events';

// Hardcoded MX Dialpad mappings
const BUTTONS = {
  '1:8': 'TopLeft',      // Back
  '1:16': 'TopRight',    // Forward
  '1:32': 'BottomLeft',  // Left
  '1:64': 'BottomRight'  // Right
};

const WHEELS = {
  '6': 'Scroll',
  '7': 'Jog'
};

export class HIDReader extends EventEmitter {
  constructor() {
    super();
    this.device = null;
    this.prev = null;
    this.scrollPos = {};
    this.reportCount = 0;
    this.isConnected = false;
  }

  static findMXDialpad() {
    return HID.devices().filter(d => d.vendorId === 0x046d && d.productId === 0xbc00);
  }

  connect(path) {
    try {
      this.device = new HID.HID(path);
      this.isConnected = true;
      this.device.on('data', d => this.handleData(d));
      this.device.on('error', e => this.emit('error', e));
      this.emit('connected', { path });
      return true;
    } catch (e) {
      this.emit('error', e);
      return false;
    }
  }

  disconnect() {
    if (this.device) {
      this.device.close();
      this.device = null;
      this.isConnected = false;
      this.prev = null;
      this.scrollPos = {};
      this.emit('disconnected');
    }
  }

  handleData(data) {
    this.reportCount++;
    const bytes = Array.from(data);
    
    const report = {
      count: this.reportCount,
      timestamp: Date.now(),
      raw: bytes,
      hex: bytes.map(b => b.toString(16).padStart(2, '0')).join(' '),
      events: []
    };

    if (this.prev) {
      // Detect changes
      for (let i = 0; i < bytes.length; i++) {
        if (bytes[i] !== this.prev[i]) {
          const event = this.interpret(i, this.prev[i], bytes[i]);
          if (event) report.events.push(event);
        }
      }
      
      // Constant velocity scrolling
      for (const idx in WHEELS) {
        const i = parseInt(idx);
        if (bytes[i] && bytes[i] === this.prev[i]) {
          const event = this.interpret(i, bytes[i], bytes[i]);
          if (event) report.events.push(event);
        }
      }
    }

    this.prev = [...bytes];
    this.emit('data', report);
  }

  interpret(i, prev, curr) {
    // Scroll wheels
    if (WHEELS[i]) {
      if (curr >= 1 && curr <= 127) {
        this.scrollPos[i] = (this.scrollPos[i] || 0) + curr;
        return { type: 'scroll', name: WHEELS[i], byte: i, direction: 'up', amount: curr, position: this.scrollPos[i] };
      } else if (curr >= 128) {
        const amt = 256 - curr;
        this.scrollPos[i] = (this.scrollPos[i] || 0) - amt;
        return { type: 'scroll', name: WHEELS[i], byte: i, direction: 'down', amount: amt, position: this.scrollPos[i] };
      }
      return null;
    }

    // Buttons
    const key = `${i}:${curr}`;
    const prevKey = `${i}:${prev}`;
    
    if (prev === 0 && curr !== 0 && BUTTONS[key]) {
      return { type: 'button', action: 'press', name: BUTTONS[key], byte: i };
    }
    if (prev !== 0 && curr === 0 && BUTTONS[prevKey]) {
      return { type: 'button', action: 'release', name: BUTTONS[prevKey], byte: i };
    }

    return null;
  }
}
