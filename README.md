# MX Dialpad Configuration Tool

A Node.js application with web UI for discovering, connecting to, and configuring the Logitech MX Dialpad HID device. Configure button and scroll wheel mappings through an intuitive web interface with real-time event logging.

## Features

- 🔌 Auto-discovers and connects to MX Dialpad
- 🌐 Web-based configuration interface
- 📊 Real-time event logging with Socket.IO
- 🎯 Visual button and scroll wheel mapping editor
- 💾 Persistent configuration storage
- 🖥️ CLI mode for debugging

## Setup

```bash
npm install
```

## Usage

### Web Interface (Recommended)

Start the web server:

```bash
npm start
```

Then open http://localhost:8080 in your browser.

**Features:**
- Live event monitoring
- Configure button mappings (byte index → button name)
- Configure scroll wheel mappings (byte index → wheel name)
- Save/load configurations
- Real-time status updates

### CLI Mode

For debugging and discovering byte mappings:

```bash
npm run cli
```

This will connect to the device and log all input reports with automatic event interpretation based on your saved configuration.

### List Devices

See all available HID devices:

```bash
npm run list
```

## Configuration

The web UI automatically saves your configuration to `config.json`. This file contains:

```json
{
  "buttons": {
    "5": "Button 1",
    "6": "Button 2"
  },
  "scrollWheels": {
    "10": "Main Scroll Wheel",
    "12": "Side Scroll Wheel"
  }
}
```

## How to Map Controls

1. Start the web server (`npm start`)
2. Open http://localhost:8080
3. Press ONE button or scroll ONE wheel at a time
4. See "Unknown Button X" or "Unknown Scroll X" appear in the log
5. Type a name directly in the input field below the event
6. Press **Enter** or click the "➕ Map" button
7. **Instantly verified!** Press the same button/wheel again:
   - Event now shows your custom name with a ✓ checkmark
   - Log entry highlighted in green
   - Shows "Mapped control (byte X)" confirmation

**Note:** Quick-add from logs auto-saves to the server, so future events immediately use your mappings!

## Architecture

- **`lib/hid-reader.js`** - Core HID device library (EventEmitter-based)
- **`server.js`** - Express + Socket.IO web server
- **`public/index.html`** - Web UI for configuration
- **`index.js`** - CLI monitor script
- **`list-devices.js`** - Device discovery utility
- **`config.json`** - Saved configuration (auto-generated)

## API Endpoints

- `GET /api/devices` - List all MX Dialpad interfaces
- `GET /api/config` - Get current configuration
- `POST /api/config` - Update configuration
- `GET /api/status` - Get connection status
- `POST /api/connect` - Connect to device
- `POST /api/disconnect` - Disconnect from device

## Socket.IO Events

**From Server:**
- `config` - Configuration updated
- `status` - Connection status changed
- `report` - New input report received
- `error` - Error occurred

## Requirements

- Node.js 16+
- MX Dialpad connected via USB or Bluetooth
- macOS, Linux, or Windows

## Notes

- The app auto-connects to the vendor-specific interface (Usage Page 0xff43)
- No sudo required on macOS/Windows
- Configuration persists between restarts
- Web UI updates in real-time for all connected clients
