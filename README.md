# MX Dialpad Controller

Ultra-minimal interface for the Logitech MX Dialpad with DaVinci Resolve integration.

## Quick Start

```bash
npm install
npm start              # http://localhost:8080
npm run cli            # CLI monitor
```

## Features

- Real-time HID monitoring with physics-based wheel control
- DaVinci Resolve trim mode (BottomLeft button)
- Dark Tailwind UI with live visualizations
- Configurable friction & sensitivity

## Hardcoded Controls

- **TopLeft** - Back button
- **TopRight** - Forward button
- **BottomLeft** - Left button (trim mode trigger)
- **BottomRight** - Right button
- **Scroll Wheel** - Position tracking
- **Jog Wheel** - Frame navigation with physics

## Architecture

```
563 lines total (79% reduction from original 2,700)

server.js         185 lines  - Express + Socket.IO + Physics
lib/hid-reader.js 118 lines  - HID reader (hardcoded mappings)
public/app.js     110 lines  - Frontend logic
public/index.html  64 lines  - Tailwind UI
index.js           59 lines  - CLI monitor
list-devices.js    23 lines  - Device scanner
config.json         4 lines  - Friction & sensitivity only
```

## Stack

- **Tailwind CSS** - Utility-first styling
- **node-hid** - HID communication
- **@nut-tree-fork/nut-js** - Keyboard automation
- **Socket.IO** - Real-time updates
- **Express** - Web server
