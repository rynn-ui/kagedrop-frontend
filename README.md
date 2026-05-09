# SkyShare - Instant Local File Sharing

SkyShare is a modern, Snapdrop-inspired web application that allows users to transfer files between devices on the same local network instantly.

## Features
- **Real-time Discovery**: Devices automatically appear on the grid when they open the site.
- **WebSocket Signaling**: Uses FastAPI WebSockets for instant connection and discovery.
- **Glassmorphism UI**: A sleek, dark, modern design with smooth animations.
- **Drag & Drop Support**: Send files by simply dropping them onto a device card.
- **Progress Tracking**: Real-time progress bar and transfer speed indicator.
- **Automatic Cleanup**: Transferred files are automatically deleted from the server after 5 minutes.
- **Responsive Design**: Works perfectly on desktops, tablets, and mobile phones.
- **QR Code Sharing**: Quickly open the site on other devices by scanning the QR code.

## Tech Stack
- **Backend**: Python, FastAPI, WebSockets
- **Frontend**: HTML5, CSS3 (Vanilla), JavaScript (Vanilla)
- **UI Assets**: FontAwesome, Google Fonts, Particles.js, DiceBear Avatars

## How it Works
1. **Connection**: When you open SkyShare, your browser establishes a WebSocket connection to the FastAPI server.
2. **Identification**: The server assigns you a random name (e.g., "Golden Falcon") and a unique ID.
3. **Discovery**: The server broadcasts the updated device list to all connected clients.
4. **Signaling**: When you select a file to send, a "file offer" is sent to the target device via WebSockets.
5. **Transfer**: Upon acceptance, the file is uploaded to the server's temporary storage and then automatically downloaded by the target device.

## Setup Instructions

### Prerequisites
- Python 3.8+ installed.

### Installation
1. Clone or download this project.
2. Navigate to the project root.
3. Install dependencies:
   ```bash
   pip install -r backend/requirements.txt
   ```

### Running Locally
1. Start the server:
   ```bash
   python -m backend.main
   ```
2. Open your browser and go to `http://localhost:8000` (or your local IP, e.g., `http://192.168.1.5:8000`).
3. To share between devices, make sure both devices are on the same WiFi/Network and open the URL using your local IP.

## Future Upgrades (P2P)
Current implementation uses server-relayed transfers for maximum compatibility. Future versions could implement **WebRTC P2P** to allow direct device-to-device transfers, bypassing the server entirely for better speed and privacy.
