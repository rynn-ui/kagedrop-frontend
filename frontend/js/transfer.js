class TransferManager {
    constructor() {
        this.peerConnections = {}; // targetId -> RTCPeerConnection
        this.dataChannels = {};    // targetId -> RTCDataChannel
        this.receivers = {};       // transferId -> { chunks, receivedSize, fileInfo }
        this.onProgress = null;
        this.onFileReady = null;
        this.onCryptoStatus = null;
        
        this.CHUNK_SIZE = 65536; // 16KB chunks for max compatibility
    }

    // --- Crypto Utilities (Stays the same) ---
    async generateKey() {
        const key = await window.crypto.subtle.generateKey(
            { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]
        );
        const exported = await window.crypto.subtle.exportKey("raw", key);
        return btoa(String.fromCharCode(...new Uint8Array(exported)));
    }

    async importKey(keyB64) {
        const raw = Uint8Array.from(atob(keyB64), c => c.charCodeAt(0));
        return await window.crypto.subtle.importKey(
            "raw", raw, "AES-GCM", true, ["encrypt", "decrypt"]
        );
    }

    async encryptFile(file, keyB64) {
        const key = await this.importKey(keyB64);
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const data = await file.arrayBuffer();
        const encrypted = await window.crypto.subtle.encrypt(
            { name: "AES-GCM", iv }, key, data
        );
        const combined = new Uint8Array(iv.length + encrypted.byteLength);
        combined.set(iv);
        combined.set(new Uint8Array(encrypted), iv.length);
        return new Blob([combined]);
    }

    async decryptFile(blob, keyB64) {
        const key = await this.importKey(keyB64);
        const data = await blob.arrayBuffer();
        const iv = data.slice(0, 12);
        const encrypted = data.slice(12);
        const decrypted = await window.crypto.subtle.decrypt(
            { name: "AES-GCM", iv: new Uint8Array(iv) }, key, encrypted
        );
        return new Blob([decrypted]);
    }

    async zipFolder(files) {
        const zip = new JSZip();
        const folderName = files[0].webkitRelativePath.split('/')[0];
        for (const file of files) {
            const relativePath = file.webkitRelativePath;
            const content = await file.arrayBuffer();
            zip.file(relativePath, content);
        }
        const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
        return { blob, folderName: folderName + '.zip' };
    }

    // --- WebRTC Logic ---

    async getPeerConnection(targetId) {
        if (this.peerConnections[targetId]) return this.peerConnections[targetId];

        const pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                socketManager.sendSignal(targetId, { type: 'ice-candidate', candidate: event.candidate });
            }
        };

        pc.ondatachannel = (event) => {
            this.setupDataChannel(targetId, event.channel);
        };

        this.peerConnections[targetId] = pc;
        return pc;
    }

    setupDataChannel(targetId, channel) {
        channel.binaryType = 'arraybuffer';
        
        channel.onopen = () => console.log(`DataChannel open with ${targetId}`);
        channel.onclose = () => {
            console.log(`DataChannel closed with ${targetId}`);
            delete this.dataChannels[targetId];
        };

        channel.onmessage = (event) => {
            this.handleDataMessage(targetId, event.data);
        };

        this.dataChannels[targetId] = channel;
    }

    async handleDataMessage(targetId, data) {
        if (typeof data === 'string') {
            const msg = JSON.parse(data);
            if (msg.type === 'file_start') {
                this.receivers[msg.transferId] = {
                    chunks: [],
                    receivedSize: 0,
                    fileInfo: msg.fileInfo,
                    startTime: Date.now()
                };
                if (this.onCryptoStatus) this.onCryptoStatus('receiving');
            } else if (msg.type === 'file_end') {
                const receiver = this.receivers[msg.transferId];
                const blob = new Blob(receiver.chunks);
                if (this.onFileReady) this.onFileReady(msg.transferId, blob, receiver.fileInfo);
                delete this.receivers[msg.transferId];
            }
        } else {
            // Binary chunk
            // The first few bytes of binary data might need to identify the transfer
            // But for simplicity in 1-on-1 transfers, we can assume the active one
            const transferId = Object.keys(this.receivers)[0]; 
            if (transferId) {
                const receiver = this.receivers[transferId];
                receiver.chunks.push(data);
                receiver.receivedSize += data.byteLength;
                
                const percent = (receiver.receivedSize / receiver.fileInfo.size) * 100;
                const speed = receiver.receivedSize / ((Date.now() - receiver.startTime) / 1000);
                if (this.onProgress) this.onProgress(percent, speed);
            }
        }
    }

    async handleSignal(fromId, signal) {
        const pc = await this.getPeerConnection(fromId);

        if (signal.type === 'offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socketManager.sendSignal(fromId, { type: 'answer', sdp: answer });
        } else if (signal.type === 'answer') {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        } else if (signal.type === 'ice-candidate') {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
        }
    }

    async initiateTransfer(targetId) {
        const pc = await this.getPeerConnection(targetId);
        const channel = pc.createDataChannel('fileTransfer', { ordered: true });
        this.setupDataChannel(targetId, channel);

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socketManager.sendSignal(targetId, { type: 'offer', sdp: offer });
        
        return new Promise((resolve) => {
            const check = setInterval(() => {
                if (this.dataChannels[targetId] && this.dataChannels[targetId].readyState === 'open') {
                    clearInterval(check);
                    resolve();
                }
            }, 100);
        });
    }

    async sendFile(file, targetId, transferId, keyB64) {
        let uploadBlob = file;
        if (keyB64) {
            if (this.onCryptoStatus) this.onCryptoStatus('encrypting');
            uploadBlob = await this.encryptFile(file, keyB64);
        }

        if (!this.dataChannels[targetId]) {
            await this.initiateTransfer(targetId);
        }

        const channel = this.dataChannels[targetId];
        channel.send(JSON.stringify({
            type: 'file_start',
            transferId,
            fileInfo: { name: file.name, size: uploadBlob.size }
        }));

        if (this.onCryptoStatus) this.onCryptoStatus('uploading');
        
        const reader = uploadBlob.stream().getReader();
        let offset = 0;
        const startTime = Date.now();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            // Split value into CHUNK_SIZE chunks
            for (let i = 0; i < value.length; i += this.CHUNK_SIZE) {
                const chunk = value.slice(i, i + this.CHUNK_SIZE);
                
                // Handle backpressure
                while (channel.bufferedAmount > 1024 * 1024) { // wait only if buffer > 1MB
                    await new Promise(r => setTimeout(r, 10));
                }
                
                channel.send(chunk);
                offset += chunk.byteLength;
                
                const percent = (offset / uploadBlob.size) * 100;
                const speed = offset / ((Date.now() - startTime) / 1000);
                if (this.onProgress) this.onProgress(percent, speed);
            }
        }

        channel.send(JSON.stringify({ type: 'file_end', transferId }));
    }

    async downloadFile(blob, filename, keyB64) {
        let finalBlob = blob;
        if (keyB64) {
            if (this.onCryptoStatus) this.onCryptoStatus('decrypting');
            finalBlob = await this.decryptFile(blob, keyB64);
        }

        if (this.onCryptoStatus) this.onCryptoStatus('done');
        const url = URL.createObjectURL(finalBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    formatSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    formatSpeed(bytesPerSecond) {
        if (bytesPerSecond < 1024) return bytesPerSecond.toFixed(0) + ' B/s';
        if (bytesPerSecond < 1024 * 1024) return (bytesPerSecond / 1024).toFixed(1) + ' KB/s';
        return (bytesPerSecond / (1024 * 1024)).toFixed(1) + ' MB/s';
    }
}

const transferManager = new TransferManager();
