// KageDrop - Cloudflare Worker Signaling Server
// Uses Durable Objects to manage the room of connected devices

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // All WebSocket connections go to the Durable Object
    if (url.pathname.startsWith('/ws/')) {
      const roomId = 'global'; // everyone shares one room
      const id = env.SIGNALING.idFromName(roomId);
      const stub = env.SIGNALING.get(id);
      return stub.fetch(request);
    }

    return new Response('KageDrop Signaling Server', { status: 200 });
  }
};

// ─── Durable Object ────────────────────────────────────────────────────────────
export class Signaling {
  constructor(state) {
    this.state = state;
    // Map of clientId -> { ws, identity }
    this.clients = new Map();
  }

  async fetch(request) {
    const url = new URL(request.url);
    const clientId = url.pathname.split('/ws/')[1];

    if (!clientId) return new Response('Missing client ID', { status: 400 });

    // Upgrade to WebSocket
    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }

    const [client, server] = Object.values(new WebSocketPair());
    server.accept();

    // Register client
    this.clients.set(clientId, {
      ws: server,
      identity: { name: 'Unknown', icon: '' }
    });

    this.broadcastDeviceList();

    server.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handleMessage(clientId, data);
      } catch (e) {
        console.error('Parse error:', e);
      }
    });

    server.addEventListener('close', () => {
      this.clients.delete(clientId);
      this.broadcastDeviceList();
    });

    server.addEventListener('error', () => {
      this.clients.delete(clientId);
      this.broadcastDeviceList();
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  handleMessage(fromId, data) {
    switch (data.type) {

      case 'set_identity': {
        const client = this.clients.get(fromId);
        if (client && data.identity) {
          client.identity = data.identity;
          this.broadcastDeviceList();
        }
        break;
      }

      case 'file_offer': {
        // Forward offer to target, include sender's identity and id
        const sender = this.clients.get(fromId);
        const target = this.clients.get(data.target_id);
        if (target && sender) {
          this.send(target.ws, {
            type: 'file_offer',
            from_id: fromId,
            from_identity: sender.identity,
            file_info: data.file_info,
            transfer_id: data.transfer_id,
            encryption_key: data.encryption_key
          });
        }
        break;
      }

      case 'accept_transfer': {
        // Forward acceptance back to the original sender
        const target = this.clients.get(data.target_id);
        if (target) {
          this.send(target.ws, {
            type: 'transfer_accepted',
            transfer_id: data.transfer_id,
            target_id: fromId  // tells sender to open P2P to this id
          });
        }
        break;
      }

      case 'webrtc_signal': {
        // Relay WebRTC signaling (offer/answer/ice-candidate) between peers
        const target = this.clients.get(data.target_id);
        if (target) {
          this.send(target.ws, {
            type: 'webrtc_signal',
            from_id: fromId,
            signal: data.signal
          });
        }
        break;
      }
    }
  }

  broadcastDeviceList() {
    const devices = [];
    this.clients.forEach((client, id) => {
      devices.push({ id, ...client.identity });
    });

    this.clients.forEach((client, id) => {
      this.send(client.ws, {
        type: 'device_list',
        devices,
        your_id: id
      });
    });
  }

  send(ws, data) {
    try {
      if (ws.readyState === 1) { // OPEN
        ws.send(JSON.stringify(data));
      }
    } catch (e) {
      // client already gone
    }
  }
}
