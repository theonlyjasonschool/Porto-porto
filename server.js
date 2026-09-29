const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const WebSocket = require('ws');

const rootDirectory = __dirname;
const port = Number.parseInt(process.env.PORT || '4173', 10);
const host = process.env.HOST || '0.0.0.0';
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

function send(response, statusCode, body, contentType) {
  response.writeHead(statusCode, {
    'Content-Type': contentType,
    'Cache-Control': 'no-cache'
  });
  response.end(body);
}

function resolveFile(requestPath) {
  const decodedPath = decodeURIComponent(requestPath);
  const relativePath = decodedPath === '/' ? 'index.html' : decodedPath.replace(/^\/+/, '');
  const filePath = path.resolve(rootDirectory, relativePath);
  if (filePath !== rootDirectory && !filePath.startsWith(`${rootDirectory}${path.sep}`)) return null;
  return filePath;
}

const server = http.createServer((request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.setHeader('Allow', 'GET, HEAD');
    return send(response, 405, 'Method Not Allowed', 'text/plain; charset=utf-8');
  }

  let requestUrl;
  try {
    requestUrl = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  } catch {
    return send(response, 400, 'Bad Request', 'text/plain; charset=utf-8');
  }

  if (requestUrl.pathname === '/health') {
    return send(response, 200, JSON.stringify({ status: 'ok', service: 'porto-porto' }), 'application/json; charset=utf-8');
  }

  let filePath;
  try {
    filePath = resolveFile(requestUrl.pathname);
  } catch {
    return send(response, 400, 'Bad Request', 'text/plain; charset=utf-8');
  }
  if (!filePath) return send(response, 403, 'Forbidden', 'text/plain; charset=utf-8');

  fs.stat(filePath, (statError, stats) => {
    if (statError || !stats.isFile()) return send(response, 404, 'Not Found', 'text/plain; charset=utf-8');
    const contentType = contentTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    response.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-cache' });
    if (request.method === 'HEAD') return response.end();
    fs.createReadStream(filePath).on('error', () => {
      if (!response.headersSent) send(response, 500, 'Internal Server Error', 'text/plain; charset=utf-8');
      else response.destroy();
    }).pipe(response);
  });
});

const signalingServer = new WebSocket.Server({ noServer: true, maxPayload: 65536 });
const signalingRooms = new Map();
const signalingPeers = new Map();

server.on('upgrade', (request, socket, head) => {
  let requestUrl;
  try {
    requestUrl = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  } catch {
    return socket.destroy();
  }
  if (requestUrl.pathname !== '/signal') return socket.destroy();
  signalingServer.handleUpgrade(request, socket, head, (webSocket) => signalingServer.emit('connection', webSocket, request));
});

function removeSignalingPeer(webSocket) {
  const peer = signalingPeers.get(webSocket);
  if (!peer) return;
  signalingPeers.delete(webSocket);
  const room = signalingRooms.get(peer.roomId);
  room?.delete(peer.peerId);
  if (room?.size) {
    const message = JSON.stringify({ type: 'peer-left', peerId: peer.peerId });
    room.forEach((member) => {
      if (member.webSocket.readyState === WebSocket.OPEN) member.webSocket.send(message);
    });
  } else {
    signalingRooms.delete(peer.roomId);
  }
}

signalingServer.on('connection', (webSocket) => {
  webSocket.on('message', (payload) => {
    let message;
    try {
      message = JSON.parse(payload.toString());
    } catch {
      webSocket.close(1003, 'Invalid signaling message');
      return;
    }
    if (!message || typeof message !== 'object' || Array.isArray(message)) {
      webSocket.close(1003, 'Invalid signaling message');
      return;
    }

    if (message.type === 'join' && !signalingPeers.has(webSocket)) {
      if (typeof message.roomId !== 'string' || message.roomId.length > 120 || typeof message.peerId !== 'string' || message.peerId.length > 80 || typeof message.name !== 'string' || !message.name.trim()) {
        webSocket.close(1008, 'Invalid room identity');
        return;
      }
      const room = signalingRooms.get(message.roomId) || new Map();
      if (room.has(message.peerId)) {
        webSocket.close(1008, 'Peer is already in this room');
        return;
      }
      const peers = [...room.values()].map((peer) => ({ peerId: peer.peerId, name: peer.name }));
      const participant = { webSocket, roomId: message.roomId, peerId: message.peerId, name: message.name.trim().slice(0, 24) };
      room.set(participant.peerId, participant);
      signalingRooms.set(participant.roomId, room);
      signalingPeers.set(webSocket, participant);
      webSocket.send(JSON.stringify({ type: 'peers', peers }));
      room.forEach((peer) => {
        if (peer.webSocket !== webSocket) peer.webSocket.send(JSON.stringify({ type: 'peer-joined', peerId: participant.peerId, name: participant.name }));
      });
      return;
    }

    const participant = signalingPeers.get(webSocket);
    if (!participant || !['offer', 'answer', 'ice'].includes(message.type) || typeof message.to !== 'string') return;
    const target = signalingRooms.get(participant.roomId)?.get(message.to);
    if (!target || target.webSocket.readyState !== WebSocket.OPEN) return;
    const relay = { type: message.type, peerId: participant.peerId, name: participant.name };
    if (message.type === 'ice' && message.candidate && typeof message.candidate === 'object') relay.candidate = message.candidate;
    if (message.type !== 'ice' && message.description && typeof message.description === 'object') relay.description = message.description;
    if (relay.candidate || relay.description) target.webSocket.send(JSON.stringify(relay));
  });
  webSocket.on('close', () => removeSignalingPeer(webSocket));
  webSocket.on('error', () => removeSignalingPeer(webSocket));
});

server.listen(port, host, () => {
  console.log(`Porto Porto listening on http://localhost:${port}`);
});
