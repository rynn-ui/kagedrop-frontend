# 🌌 KageDrop - Secure P2P File Sharing

KageDrop is a high-performance, secure, and visually stunning web application for instant, serverless file transfers between devices. Powered by WebRTC for direct browser-to-browser communication and secured with modern encryption.

![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)
![P2P](https://img.shields.io/badge/transfer-WebRTC-orange.svg)
![License](https://img.shields.io/badge/license-MIT-lightgrey.svg)

## ✨ Key Features

- **🚀 Peer-to-Peer (WebRTC)**: Files go directly from one browser to another. No server ever touches your data.
- **🔐 End-to-End Encryption**: Every transfer is secured using **AES-256-GCM** encryption via the Web Crypto API.
- **📁 Folder Support**: Automatically zips entire folders on-the-fly for seamless directory transfers.
- **☁️ Serverless Signaling**: Uses a tiny Cloudflare Worker to help devices find each other—completely free and infinitely scalable.
- **🎮 Cinematic HUD UI**: A dark, "Glassmorphism" interface with a smooth, magnetic HUD tooltip that follows your cursor.
- **📊 Advanced Progress Tracking**: Real-time speed indicators, progress bars, and cryptographic state updates.
- **📥 Local Inbox**: Keeps track of received files during your session for easy downloads.
- **📱 QR Code Sharing**: Quickly bridge devices by scanning a generated QR code to join the network.

## 🛠️ Tech Stack

- **Signaling**: Cloudflare Workers (WebSockets).
- **Transfer**: WebRTC RTCDataChannel.
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
├── backend/              # Signaling Logic
│   └── signaling.js      # Cloudflare Worker script
├── frontend/             # Web Client (Deploy to Netlify/GitHub Pages)
│   ├── index.html        # Main UI
│   ├── css/              # Glassmorphism Styles
│   └── js/               # App, Socket & Transfer logic
└── README.md             # You are here
```

## 🚀 Deployment

### 1. Deploy the Signaling Server
1. Create a new [Cloudflare Worker](https://workers.cloudflare.com/).
2. Paste the contents of `backend/signaling.js`.
3. Enable **Durable Objects** for the `Signaling` class and bind it to the name `SIGNALING`.
4. Deploy and note your worker URL (e.g., `skyshare-signaling.yourname.workers.dev`).

### 2. Configure the Frontend
In `frontend/js/socket.js`, update the `SIGNALING_SERVER` URL with your Cloudflare Worker URL:

```javascript
this.SIGNALING_SERVER = 'wss://your-worker-url.workers.dev/ws/' + this.clientId;
```

### 3. Host the Frontend
Upload the `frontend/` folder to any static hosting service like Netlify, Vercel, or GitHub Pages.

## 🔒 Security Model

KageDrop uses a pure P2P approach:
1. **Signaling**: A WebSocket relays minimal metadata (SDP offers/answers) so two browsers can find each other.
2. **WebRTC**: A direct, encrypted data channel is established between the two devices.
3. **Encryption**: Files are further encrypted using **AES-256-GCM** before being sent over the P2P channel.
4. **Privacy**: Files never touch any server. They stream in chunks directly through the devices' RAM.

## 📝 License
This project is open-source and available under the [MIT License](LICENSE).
