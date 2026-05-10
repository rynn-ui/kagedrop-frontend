class SocketManager {
    constructor() {
        this.clientId = this.getOrCreateClientId();
        this.socket = null;
        this.onDeviceListUpdate = null;
        this.onFileOffer = null;
        this.onTransferAccepted = null;
        this.onSignal = null;
        this.myInfo = null;

        this.SIGNALING_SERVER = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
            ? `ws://${window.location.host}/ws/${this.clientId}`
            : `wss://kagedrop-signaling.kagedrop.workers.dev/ws/${this.clientId}`;
    }

    // ✅ Every tab/device gets a fully unique ID - no shared base
    getOrCreateClientId() {
        let id = sessionStorage.getItem('skyshare_client_id');
        if (!id) {
            id = Math.random().toString(36).substring(2, 10)
               + Math.random().toString(36).substring(2, 10);
            sessionStorage.setItem('skyshare_client_id', id);
        }
        return id;
    }

    connect() {
        this.socket = new WebSocket(this.SIGNALING_SERVER);

        this.socket.onopen = () => {
            console.log('Connected with ID:', this.clientId);
            this.updateAnimeIdentity();
        };

        this.socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.handleMessage(data);
        };

        this.socket.onclose = () => {
            console.log('Disconnected. Retrying in 3s...');
            setTimeout(() => this.connect(), 3000);
        };

        this.socket.onerror = (err) => {
            console.error('WebSocket error:', err);
        };
    }

    async updateAnimeIdentity() {
        const characters = [
            "Naruto Uzumaki", "Monkey D. Luffy", "Satoru Gojo", "Ichigo Kurosaki",
            "Roronoa Zoro", "Kakashi Hatake", "Saitama", "Levi Ackerman",
            "Mikasa Ackerman", "Tanjiro Kamado", "Nezuko Kamado", "Izuku Midoriya",
            "Shoto Todoroki", "Ken Kaneki", "Edward Elric", "Killua Zoldyck",
            "Gon Freecss", "Yuji Itadori", "Sasuke Uchiha", "Light Yagami"
        ];

        // ✅ Hash the full unique clientId so every device gets a different character
        let hash = 0;
        for (let i = 0; i < this.clientId.length; i++) {
            hash = this.clientId.charCodeAt(i) + ((hash << 5) - hash);
        }
        const index = Math.abs(hash) % characters.length;
        const charName = characters[index];

        try {
            const res = await fetch(`https://api.jikan.moe/v4/characters?q=${encodeURIComponent(charName)}&limit=1`);
            const json = await res.json();
            if (json.data && json.data.length > 0) {
                const charData = json.data[0];
                this.send({
                    type: 'set_identity',
                    identity: { name: charData.name, icon: charData.images.jpg.image_url }
                });
            } else throw new Error('No data');
        } catch {
            this.send({
                type: 'set_identity',
                identity: {
                    name: charName,
                    icon: `https://ui-avatars.com/api/?name=${encodeURIComponent(charName)}&background=random&size=200`
                }
            });
        }
    }

    handleMessage(data) {
        switch (data.type) {
            case 'device_list': {
                // ✅ Use your_id from server to correctly filter yourself out
                const otherDevices = data.devices.filter(d => d.id !== data.your_id);
                this.myInfo = data.devices.find(d => d.id === data.your_id);
                if (this.onDeviceListUpdate) this.onDeviceListUpdate(otherDevices, this.myInfo);
                break;
            }
            case 'file_offer':
                if (this.onFileOffer) this.onFileOffer(data);
                break;
            case 'transfer_accepted':
                if (this.onTransferAccepted) this.onTransferAccepted(data);
                break;
            case 'webrtc_signal':
                if (this.onSignal) this.onSignal(data);
                break;
        }
    }

    send(data) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify(data));
        }
    }

    sendSignal(targetId, signal) {
        this.send({ type: 'webrtc_signal', target_id: targetId, signal });
    }

    offerFile(targetId, fileInfo, transferId, encryptionKey) {
        this.send({ type: 'file_offer', target_id: targetId, file_info: fileInfo, transfer_id: transferId, encryption_key: encryptionKey });
    }

    acceptTransfer(targetId, transferId) {
        this.send({ type: 'accept_transfer', target_id: targetId, transfer_id: transferId });
    }
}

const socketManager = new SocketManager();
