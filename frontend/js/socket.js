class SocketManager {
    constructor() {
        this.clientId = this.getOrCreateClientId();
        this.socket = null;
        this.onDeviceListUpdate = null;
        this.onFileOffer = null;
        this.onTransferAccepted = null;
        this.onFileReady = null;
        this.myInfo = null;
    }

    getOrCreateClientId() {
        // Use sessionStorage but append a small random tab-specific suffix 
        // to ensure multiple tabs don't conflict, while keeping character persistence
        let baseId = sessionStorage.getItem('skyshare_base_id');
        if (!baseId) {
            baseId = Math.random().toString(36).substring(2, 8);
            sessionStorage.setItem('skyshare_base_id', baseId);
        }
        
        // Every tab gets a unique sub-id for the socket connection
        const tabId = Math.random().toString(36).substring(2, 6);
        return `${baseId}-${tabId}`;
    }

    connect() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        const wsUrl = `${protocol}//${host}/ws/${this.clientId}`;

        this.socket = new WebSocket(wsUrl);

        this.socket.onopen = () => {
            console.log('Connected to SkyShare Network with ID:', this.clientId);
            
            // Start identity fetch in background (non-blocking)
            this.updateAnimeIdentity();
        };

        this.socket.onmessage = (event) => {
            console.log('Message received:', event.data);
            const data = JSON.parse(event.data);
            this.handleMessage(data);
        };

        this.socket.onclose = () => {
            console.log('Disconnected. Retrying in 3s...');
            setTimeout(() => this.connect(), 3000);
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
        
        // Deterministic selection based on baseId
        const baseId = this.clientId.split('-')[0];
        let hash = 0;
        for (let i = 0; i < baseId.length; i++) {
            hash = baseId.charCodeAt(i) + ((hash << 5) - hash);
        }
        const index = Math.abs(hash) % characters.length;
        const charName = characters[index];

        console.log(`Fetching identity for: ${charName}`);

        try {
            // Use search API instead of ID to be 100% sure we get a result
            const res = await fetch(`https://api.jikan.moe/v4/characters?q=${encodeURIComponent(charName)}&limit=1`);
            const json = await res.json();
            
            if (json.data && json.data.length > 0) {
                const charData = json.data[0];
                const identity = {
                    name: charData.name,
                    icon: charData.images.jpg.image_url
                };
                
                console.log('Identity found:', identity.name);
                this.send({
                    type: 'set_identity',
                    identity: identity
                });
            } else {
                throw new Error('No data found for character');
            }
        } catch (err) {
            console.error('Jikan API Error:', err);
            // Fallback to local image or specific URL if API fails
            this.send({
                type: 'set_identity',
                identity: { name: charName, icon: `https://ui-avatars.com/api/?name=${encodeURIComponent(charName)}&background=random&size=200` }
            });
        }
    }

    handleMessage(data) {
        switch (data.type) {
            case 'device_list':
                const otherDevices = data.devices.filter(d => d.id !== this.clientId);
                this.myInfo = data.devices.find(d => d.id === this.clientId);
                if (this.onDeviceListUpdate) this.onDeviceListUpdate(otherDevices, this.myInfo);
                break;
            
            case 'file_offer':
                if (this.onFileOffer) this.onFileOffer(data);
                break;
            
            case 'transfer_accepted':
                if (this.onTransferAccepted) this.onTransferAccepted(data);
                break;
            
            case 'file_ready':
                if (this.onFileReady) this.onFileReady(data);
                break;
        }
    }

    send(data) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify(data));
        }
    }

    offerFile(targetId, fileInfo, transferId, encryptionKey) {
        this.send({
            type: 'file_offer',
            target_id: targetId,
            file_info: fileInfo,
            transfer_id: transferId,
            encryption_key: encryptionKey
        });
    }

    acceptTransfer(targetId, transferId) {
        this.send({
            type: 'accept_transfer',
            target_id: targetId,
            transfer_id: transferId
        });
    }
}

const socketManager = new SocketManager();
