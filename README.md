# 🌌 KageDrop - Secure Local File Sharing

KageDrop is a high-performance, secure, and visually stunning web application for instant file transfers between devices on the same local network. Inspired by Snapdrop but powered by modern encryption and a "Cinematic HUD" interface.

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![Python](https://img.shields.io/badge/python-3.8+-green.svg)
![License](https://img.shields.io/badge/license-MIT-lightgrey.svg)

## ✨ Key Features

- **🔐 End-to-End Encryption**: Every transfer is secured using **AES-256-GCM** encryption. Keys are generated client-side and never stored on the server.
- **📁 Folder Support**: Automatically zips entire folders on-the-fly for seamless directory transfers.
- **🚀 Real-time Discovery**: Instant device discovery using FastAPI WebSockets. No account needed, just open and share.
- **🎮 Cinematic HUD UI**: A dark, "Glassmorphism" interface with a smooth, magnetic HUD tooltip that follows your cursor.
- **📊 Advanced Progress Tracking**: Real-time speed indicators, progress bars, and cryptographic state updates.
- **📥 Local Inbox**: Keeps track of received files during your session for easy downloads.
- **📱 QR Code Sharing**: Quickly bridge devices by scanning a generated QR code to join the network.
- **🧹 Auto-Cleanup**: The server automatically deletes transferred files after 5 minutes to preserve privacy and storage.

## 🛠️ Tech Stack

- **Backend**: Python 3.8+, FastAPI, Uvicorn, WebSockets.
- **Frontend**: Vanilla JavaScript (ES6+), HTML5, CSS3.
- **Security**: Web Crypto API (AES-GCM).
- **Libraries**: 
  - `JSZip` for folder compression.
  - `QRCode.js` for instant link sharing.
  - `Toastify` for sleek notifications.
  - `FontAwesome` for iconography.

## 📂 Project Structure

```text
file-sharing/
├── backend/              # FastAPI Server Logic
│   ├── main.py           # WebSocket & API Endpoints
│   └── requirements.txt  # Python Dependencies
├── frontend/             # Web Client
│   ├── index.html        # Main UI
│   ├── css/              # Glassmorphism Styles
│   └── js/               # App, Socket & Transfer logic
├── uploads/              # Temporary encrypted storage
├── run.py                # Smart startup script
└── README.md             # You are here
```

## 🚀 Quick Start

### 1. Prerequisites
Ensure you have **Python 3.8+** installed on your system.

### 2. Installation
Clone the repository and install the required dependencies:

```bash
pip install -r backend/requirements.txt
```

### 3. Running the App
The easiest way to start KageDrop is using the provided `run.py` script, which automatically detects your local IP:

```bash
python run.py
```

- **Local Access**: `http://localhost:8000`
- **Network Access**: `http://<YOUR_IP>:8000` (Use this for sharing between devices)

> **Note**: For sharing to work, both devices must be connected to the same WiFi/Network.

## 🔒 Security Model

KageDrop uses a hybrid approach for transfers:
1. **Signaling**: WebSockets are used to exchange file metadata and encrypted session keys.
2. **Encryption**: The sender generates a random 256-bit AES key. The file is encrypted using **AES-GCM** before being uploaded.
3. **Storage**: Files are temporarily stored in the `uploads/` directory in their encrypted form.
4. **Decryption**: The receiver downloads the encrypted blob and uses the shared key (exchanged via secure WebSocket signaling) to decrypt the file locally in the browser.

## 📝 License
This project is open-source and available under the [MIT License](LICENSE).
