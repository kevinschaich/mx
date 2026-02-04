import HID from 'node-hid';
import { EventEmitter } from 'events';

export class HIDReader extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = config;
    this.device = null;
    this.previousData = null;
    this.scrollPositions = {};
    this.reportCount = 0;
    this.isConnected = false;
  }

  static findDevices(vendorId, productId) {
    const devices = HID.devices();
    return devices.filter(d => 
      d.vendorId === vendorId && d.productId === productId
    );
  }

  static findMXDialpad() {
    return HIDReader.findDevices(0x046d, 0xbc00);
  }

  connect(path) {
    try {
      this.device = new HID.HID(path);
      this.isConnected = true;

      this.device.on('data', (data) => this.handleData(data));
      this.device.on('error', (err) => this.handleError(err));

      this.emit('connected', { path });
      return true;
    } catch (err) {
      this.emit('error', err);
      return false;
    }
  }

  disconnect() {
    if (this.device) {
      this.device.close();
      this.device = null;
      this.isConnected = false;
      this.previousData = null;
      this.scrollPositions = {};
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
      changes: [],
      events: []
    };

    if (this.previousData) {
      for (let i = 0; i < bytes.length; i++) {
        if (bytes[i] !== this.previousData[i]) {
          const diff = bytes[i] - this.previousData[i];
          const change = {
            index: i,
            prev: this.previousData[i],
            curr: bytes[i],
            diff: diff
          };
          
          report.changes.push(change);
          
          // Interpret the change
          const event = this.interpretChange(change);
          if (event) {
            report.events.push(event);
          }
        }
      }
      
      // CRITICAL: Also check for active scroll wheels even when value hasn't changed
      // This handles slow, constant-velocity scrolling where the byte stays at value 1
      const scrollWheels = this.config.scrollWheels || {};
      for (const byteIndex of Object.keys(scrollWheels)) {
        const i = parseInt(byteIndex);
        const curr = bytes[i];
        const prev = this.previousData[i];
        
        // If the value is non-zero and hasn't changed, it means constant velocity scrolling
        if (curr !== 0 && curr === prev) {
          // Create a synthetic "change" for constant velocity
          const change = {
            index: i,
            prev: prev,
            curr: curr,
            diff: 0
          };
          
          // Interpret as scroll event
          const event = this.interpretChange(change);
          if (event) {
            report.events.push(event);
          }
        }
      }
    }

    this.previousData = [...bytes];
    this.emit('data', report);
  }

  interpretChange(change) {
    const { index, prev, curr, diff } = change;
    const buttons = this.config.buttons || {};
    const scrollWheels = this.config.scrollWheels || {};

    // IMPORTANT: Check scroll wheels FIRST to avoid misinterpreting scroll stops as button releases
    // Check if this is a known scroll wheel
    if (scrollWheels[index]) {
      // Scroll wheels report absolute velocity values:
      // 0: Stopped
      // 1-127: Clockwise (speed increases with value)
      // 128-255: Counter-clockwise (speed increases as value approaches 128)
      
      // Generate events for any non-zero value to capture constant-velocity scrolling
      if (curr >= 1 && curr <= 127) {
        // Currently scrolling clockwise
        const amount = curr;
        if (!this.scrollPositions[index]) this.scrollPositions[index] = 0;
        this.scrollPositions[index] += amount;
        
        return {
          type: 'scroll',
          name: scrollWheels[index],
          byte: index,
          direction: 'up',
          amount: amount,
          position: this.scrollPositions[index],
          rawValue: curr
        };
      } else if (curr >= 128 && curr <= 255) {
        // Currently scrolling counter-clockwise
        const amount = 256 - curr; // Convert to positive speed value
        if (!this.scrollPositions[index]) this.scrollPositions[index] = 0;
        this.scrollPositions[index] -= amount;
        
        return {
          type: 'scroll',
          name: scrollWheels[index],
          byte: index,
          direction: 'down',
          amount: amount,
          position: this.scrollPositions[index],
          rawValue: curr
        };
      }
      // If curr is 0, the wheel has stopped - don't generate any event (not a button!)
      return null;
    }

    // Check if this is a known button (with bit-level mapping support)
    // Try byte:bitValue first, then fall back to just byte
    let buttonName = null;
    let bitValue = null;
    
    if (prev === 0 && curr !== 0) {
      bitValue = curr;
      buttonName = buttons[`${index}:${curr}`] || buttons[index];
      if (buttonName) {
        return { type: 'button', action: 'press', name: buttonName, byte: index, bitValue };
      }
    } else if (prev !== 0 && curr === 0) {
      bitValue = prev;
      buttonName = buttons[`${index}:${prev}`] || buttons[index];
      if (buttonName) {
        return { type: 'button', action: 'release', name: buttonName, byte: index, bitValue };
      }
    } else if (prev !== 0 && curr !== 0 && prev !== curr) {
      // Button change - try to match the new value
      buttonName = buttons[`${index}:${curr}`] || buttons[index];
      if (buttonName) {
        return { type: 'button', action: 'change', name: buttonName, byte: index, prev, curr };
      }
    }

    // Generic interpretation for unknown bytes
    
    // Check for scroll wheel pattern (absolute velocity values 1-127 or 128-255)
    // Track if this byte has scroll wheel history to avoid false button detection
    const looksLikeScroll = (curr >= 1 && curr <= 127) || (curr >= 128 && curr <= 255) || 
                            (prev >= 1 && prev <= 127) || (prev >= 128 && prev <= 255);
    
    if (looksLikeScroll) {
      if (curr >= 1 && curr <= 127) {
        // Clockwise scrolling
        if (!this.scrollPositions[index]) this.scrollPositions[index] = 0;
        this.scrollPositions[index] += curr;
        
        return {
          type: 'scroll',
          name: `Unknown Scroll ${index}`,
          byte: index,
          direction: 'up',
          amount: curr,
          position: this.scrollPositions[index],
          rawValue: curr
        };
      } else if (curr >= 128 && curr <= 255) {
        // Counter-clockwise scrolling
        const amount = 256 - curr;
        if (!this.scrollPositions[index]) this.scrollPositions[index] = 0;
        this.scrollPositions[index] -= amount;
        
        return {
          type: 'scroll',
          name: `Unknown Scroll ${index}`,
          byte: index,
          direction: 'down',
          amount: amount,
          position: this.scrollPositions[index],
          rawValue: curr
        };
      } else if (curr === 0) {
        // Scroll wheel stopped - track it to prevent button false positives
        if (!this.scrollPositions[index]) this.scrollPositions[index] = 0;
        return null;
      }
    }
    
    // Check for button-like behavior (any change from 0 to non-zero, or non-zero to 0)
    // BUT: Don't detect buttons on bytes that have been used as scroll wheels
    const hasScrollHistory = this.scrollPositions[index] !== undefined;
    
    if (!hasScrollHistory) {
      if (prev === 0 && curr !== 0 && (curr < 1 || curr > 255 || (curr > 127 && curr < 128))) {
        // Button press (bit flag set)
        const bitValue = curr;
        return { type: 'button', action: 'press', name: `Unknown Button ${index}`, byte: index, bitValue };
      } else if (prev !== 0 && curr === 0) {
        // Button release (bit flag cleared) - but only if not a scroll wheel value range
        if (prev > 127 || (prev < 1 || prev > 127)) {
          const bitValue = prev;
          return { type: 'button', action: 'release', name: `Unknown Button ${index}`, byte: index, bitValue };
        }
      } else if (prev !== 0 && curr !== 0 && prev !== curr) {
        // Multiple buttons in same byte - one released, another pressed
        return { type: 'button', action: 'change', name: `Unknown Button ${index}`, byte: index, prev, curr };
      }
    }
    
    // Check for scroll wheel behavior (small incremental changes)
    if (Math.abs(diff) <= 5 && diff !== 0 && prev !== 0 && curr !== 0) {
      if (!this.scrollPositions[index]) this.scrollPositions[index] = 0;
      this.scrollPositions[index] += diff;

      return {
        type: 'scroll',
        name: `Unknown Scroll ${index}`,
        byte: index,
        direction: diff > 0 ? 'up' : 'down',
        amount: Math.abs(diff),
        position: this.scrollPositions[index]
      };
    }

    return null;
  }

  handleError(err) {
    this.emit('error', err);
  }

  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    this.emit('config-updated', this.config);
  }
}
