const servers = [
  { id: 'porto', name: 'Porto Network', description: 'Operations and shared coordination', members: 28, symbol: 'PN' },
  { id: 'field', name: 'Field Operations', description: 'Teams working across the field', members: 16, symbol: 'FO' },
  { id: 'events', name: 'Event Crew', description: 'Planning and live event teams', members: 42, symbol: 'EC' }
];
const channels = [
  { name: 'Operations', serverId: 'porto', type: 'public', description: 'General coordination · Anyone can join', members: 8, pinned: true, symbol: '⌁' },
  { name: 'Night shift', serverId: 'porto', type: 'private', description: 'Invite only · 4 members', members: 4, pinned: true, symbol: '◒' },
  { name: 'Warehouse 04', serverId: 'field', type: 'private', description: 'Invite only · 6 members', members: 6, pinned: true, symbol: '▦' },
  { name: 'Field team', serverId: 'field', type: 'public', description: 'Public · 21 members', members: 21, symbol: '⌁' },
  { name: 'Event crew', serverId: 'events', type: 'public', description: 'Public · 12 members', members: 12, pinned: true, symbol: '✦' }
];
const builtInRoomKeys = new Set(channels.map((channel) => `${channel.serverId}:${channel.name.toLowerCase()}`));
try {
  const savedRooms = JSON.parse(localStorage.getItem('porto-custom-rooms') || '[]');
  if (Array.isArray(savedRooms)) {
    savedRooms.filter((room) => room && typeof room.name === 'string' && servers.some((server) => server.id === room.serverId) && ['public', 'private'].includes(room.type))
      .forEach((room) => channels.push({ name: room.name.slice(0, 24), serverId: room.serverId, type: room.type, description: room.type === 'private' ? 'Invite only · 1 member' : 'Public · 1 member', members: 1, symbol: room.type === 'private' ? '◒' : '⌁' }));
  }
} catch (error) {}
let activeServer = null;
let activeChannel = null;
let selectedPrivacy = 'public';
let keyHeld = false;
let isTransmitting = false;
let micStream = null;
let callStream = null;
let signalSocket = null;
let callMicMuted = false;
let callCameraDisabled = false;
let isStartingVideoCall = false;
let videoStartToken = 0;
const peerConnections = new Map();
const pendingIceCandidates = new Map();
const localPeerId = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
let currentUserName = localStorage.getItem('porto-profile-name') || 'Jordan Davis';
let messageLogs = {};
try { messageLogs = JSON.parse(localStorage.getItem('porto-message-logs') || '{}'); } catch (error) { messageLogs = {}; }
const $ = (selector) => document.querySelector(selector);
const initialsFor = (name) => name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();

function renderServers() {
  $('#serverList').innerHTML = servers.map((server) => `<button class="server-card" data-server="${server.id}"><span class="server-mark">${server.symbol}</span><span class="server-card-copy"><strong>${server.name}</strong><span>${server.description} · ${server.members} members</span></span><span class="server-arrow" aria-hidden="true">→</span></button>`).join('');
  document.querySelectorAll('[data-server]').forEach((item) => item.addEventListener('click', () => selectServer(item.dataset.server)));
}
function selectServer(id) {
  activeServer = servers.find((server) => server.id === id) || servers[0];
  $('#serverDirectory').hidden = true;
  $('#appShell').hidden = false;
  $('#serverLabel').textContent = activeServer.name.toUpperCase();
  $('#channelSearch').value = '';
  const serverChannels = channels.filter((channel) => channel.serverId === activeServer.id);
  activeChannel = serverChannels[0] || null;
  renderChannels();
  if (activeChannel) selectChannel(activeChannel.name);
}

function channelMarkup(channel) {
  return `<button class="channel-item ${channel.name === activeChannel.name ? 'active' : ''}" data-channel="${channel.name}"><span class="channel-symbol">${channel.symbol}</span><span class="channel-copy"><strong>${channel.name}</strong><span>${channel.type === 'private' ? 'Private' : `${channel.members} members`}</span></span>${channel.name === 'Operations' ? '<span class="channel-alert">2</span>' : ''}</button>`;
}
function renderChannels(filter = '') {
  const visible = channels.filter((channel) => channel.serverId === activeServer?.id && channel.name.toLowerCase().includes(filter.toLowerCase()));
  $('#pinnedChannels').innerHTML = visible.filter((channel) => channel.pinned).map(channelMarkup).join('');
  $('#allChannels').innerHTML = visible.filter((channel) => !channel.pinned).map(channelMarkup).join('');
  document.querySelectorAll('[data-channel]').forEach((item) => item.addEventListener('click', () => selectChannel(item.dataset.channel)));
}
function selectChannel(name) {
  const nextChannel = channels.find((channel) => channel.serverId === activeServer.id && channel.name === name) || activeChannel;
  if (nextChannel !== activeChannel && isStartingVideoCall) cancelVideoStartup();
  if (activeChannel && nextChannel !== activeChannel && callStream) leaveVideoCall(false);
  activeChannel = nextChannel;
  $('#channelName').textContent = activeChannel.name;
  $('#channelDescription').textContent = activeChannel.description;
  $('#privacyBadge').textContent = activeChannel.type.toUpperCase();
  $('#privacyBadge').classList.toggle('private', activeChannel.type === 'private');
  $('#channelIcon').textContent = activeChannel.symbol;
  $('#channelIcon').classList.toggle('private', activeChannel.type === 'private');
  $('#memberCount').textContent = `${activeChannel.members} online`;
  $('#chatInput').placeholder = `Send a message to ${activeChannel.name}...`;
  renderChannels($('#channelSearch').value);
  renderMessageLog();
}
function logKey() { return `${activeServer.id}:${activeChannel.name}`; }
function saveMessageLogs() { localStorage.setItem('porto-message-logs', JSON.stringify(messageLogs)); }
function renderMessageLog() {
  const messages = messageLogs[logKey()] || [];
  const list = $('#activityList');
  list.innerHTML = '';
  if (!messages.length) {
    const empty = document.createElement('div');
    empty.className = 'activity-row empty-log';
    empty.textContent = 'No messages in this room yet.';
    list.append(empty);
    return;
  }
  messages.forEach((message) => appendMessageRow(message, false));
}
function appendMessageRow(message, save = true) {
  $('#activityList .empty-log')?.remove();
  const row = document.createElement('div');
  row.className = 'activity-row message-row';
  const time = document.createElement('span');
  time.className = 'activity-time';
  time.textContent = message.time;
  const avatar = document.createElement('div');
  avatar.className = 'activity-avatar blue';
  avatar.textContent = initialsFor(message.author);
  const copy = document.createElement('div');
  copy.className = 'message-copy';
  const author = document.createElement('strong');
  author.textContent = message.author;
  const text = document.createElement('span');
  text.textContent = message.text;
  copy.append(author, text);
  row.append(time, avatar, copy);
  $('#activityList').append(row);
  if (save) {
    const messages = messageLogs[logKey()] || (messageLogs[logKey()] = []);
    messages.push(message);
    if (messages.length > 100) messages.shift();
    saveMessageLogs();
  }
}
function addActivity(text, time = 'NOW', color = 'orange', tag = 'INFO') {
  const row = document.createElement('div');
  row.className = 'activity-row';
  row.innerHTML = `<span class="activity-time">${time}</span><div class="activity-avatar ${color}">${initialsFor(currentUserName)}</div><div><strong>${currentUserName}</strong><span> ${text}</span></div><span class="activity-tag">${tag}</span>`;
  $('#activityList').prepend(row);
}
function showToast(message, author = 'Jordan') {
  const toast = document.createElement('div');
  toast.className = 'chat-toast';
  toast.innerHTML = `<strong>${author}</strong><span>${message}</span>`;
  $('#toastStack').append(toast);
  window.setTimeout(() => toast.remove(), 5100);
}
function setVideoStatus() {
  const connected = [...peerConnections.values()].filter((connection) => connection.connectionState === 'connected').length;
  $('#videoStatus').textContent = connected ? `${connected + 1} in call` : 'Waiting for others';
}
function sendSignal(message) {
  if (signalSocket?.readyState === WebSocket.OPEN) signalSocket.send(JSON.stringify(message));
}
function addRemoteVideo(peerId, name, stream) {
  let tile = [...$('#videoGrid').querySelectorAll('[data-peer-video]')].find((element) => element.dataset.peerVideo === peerId);
  if (!tile) {
    tile = document.createElement('div');
    tile.className = 'video-tile remote-video-tile';
    tile.dataset.peerVideo = peerId;
    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    const label = document.createElement('span');
    tile.append(video, label);
    $('#videoGrid').append(tile);
  }
  tile.querySelector('video').srcObject = stream;
  tile.querySelector('span').textContent = name;
}
function removeVideoPeer(peerId) {
  peerConnections.get(peerId)?.close();
  peerConnections.delete(peerId);
  pendingIceCandidates.delete(peerId);
  [...$('#videoGrid').querySelectorAll('[data-peer-video]')].find((element) => element.dataset.peerVideo === peerId)?.remove();
  setVideoStatus();
}
function createPeerConnection(peerId, name) {
  if (peerConnections.has(peerId)) return peerConnections.get(peerId);
  const connection = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
  peerConnections.set(peerId, connection);
  callStream.getTracks().forEach((track) => connection.addTrack(track, callStream));
  connection.onicecandidate = (event) => {
    if (event.candidate) sendSignal({ type: 'ice', to: peerId, candidate: event.candidate });
  };
  connection.ontrack = (event) => addRemoteVideo(peerId, name, event.streams[0] || new MediaStream([event.track]));
  connection.onconnectionstatechange = () => {
    if (connection.connectionState === 'failed') removeVideoPeer(peerId);
    else setVideoStatus();
  };
  return connection;
}
async function applyQueuedIce(peerId, connection) {
  const candidates = pendingIceCandidates.get(peerId) || [];
  pendingIceCandidates.delete(peerId);
  for (const candidate of candidates) await connection.addIceCandidate(new RTCIceCandidate(candidate));
}
async function sendVideoOffer(peer) {
  const connection = createPeerConnection(peer.peerId, peer.name);
  const offer = await connection.createOffer();
  await connection.setLocalDescription(offer);
  sendSignal({ type: 'offer', to: peer.peerId, description: connection.localDescription });
}
async function handleVideoSignal(message) {
  if (!callStream) return;
  if (message.type === 'peers') {
    for (const peer of message.peers) await sendVideoOffer(peer);
    setVideoStatus();
    return;
  }
  if (message.type === 'peer-left') {
    removeVideoPeer(message.peerId);
    return;
  }
  if (message.type === 'peer-joined') return;
  let connection = peerConnections.get(message.peerId);
  if (message.type === 'offer') {
    connection = createPeerConnection(message.peerId, message.name || 'Participant');
    await connection.setRemoteDescription(new RTCSessionDescription(message.description));
    await applyQueuedIce(message.peerId, connection);
    const answer = await connection.createAnswer();
    await connection.setLocalDescription(answer);
    sendSignal({ type: 'answer', to: message.peerId, description: connection.localDescription });
  } else if (message.type === 'answer' && connection) {
    await connection.setRemoteDescription(new RTCSessionDescription(message.description));
    await applyQueuedIce(message.peerId, connection);
  } else if (message.type === 'ice' && message.candidate) {
    if (!connection || !connection.remoteDescription) {
      const candidates = pendingIceCandidates.get(message.peerId) || [];
      candidates.push(message.candidate);
      pendingIceCandidates.set(message.peerId, candidates);
    } else {
      await connection.addIceCandidate(new RTCIceCandidate(message.candidate));
    }
  }
}
async function startVideoCall() {
  if (callStream || isStartingVideoCall || !activeChannel) return;
  if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === 'undefined') {
    showToast('Video calls are not supported by this browser', 'SYSTEM');
    return;
  }
  isStartingVideoCall = true;
  const startToken = ++videoStartToken;
  const roomId = `${activeServer.id}:${activeChannel.name}`;
  $('#videoButton').disabled = true;
  $('#videoButton').textContent = 'Starting video…';
  try {
    const acquiredStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    if (startToken !== videoStartToken) {
      acquiredStream.getTracks().forEach((track) => track.stop());
      return;
    }
    callStream = acquiredStream;
    isStartingVideoCall = false;
    $('#videoButton').disabled = false;
    callMicMuted = false;
    callCameraDisabled = false;
    $('#localVideo').srcObject = callStream;
    $('#localVideoName').textContent = currentUserName;
    $('#toggleCallMic').textContent = 'Mute mic';
    $('#toggleCamera').textContent = 'Turn camera off';
    $('#videoRoom').hidden = false;
    $('#videoStatus').textContent = 'Connecting';
    $('#videoButton').textContent = 'Video active';
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    signalSocket = new WebSocket(`${protocol}//${location.host}/signal`);
    const activeSocket = signalSocket;
    activeSocket.addEventListener('open', () => {
      activeSocket.send(JSON.stringify({ type: 'join', roomId, peerId: localPeerId, name: currentUserName }));
      setVideoStatus();
    });
    activeSocket.addEventListener('message', (event) => {
      try {
        handleVideoSignal(JSON.parse(event.data)).catch(() => showToast('Could not connect a video participant', 'SYSTEM'));
      } catch (error) {
        showToast('Received an invalid call signal', 'SYSTEM');
      }
    });
    activeSocket.addEventListener('close', () => {
      if (signalSocket === activeSocket && callStream) {
        $('#videoStatus').textContent = 'Signaling disconnected';
        showToast('Video call connection was lost', 'SYSTEM');
      }
    });
    activeSocket.addEventListener('error', () => showToast('Unable to reach the video call server', 'SYSTEM'));
    addActivity('joined the video call', 'NOW', 'green', 'VIDEO');
  } catch (error) {
    if (startToken !== videoStartToken) return;
    isStartingVideoCall = false;
    $('#videoButton').disabled = false;
    leaveVideoCall(false);
    showToast('Camera and microphone permission is needed for video', 'SYSTEM');
  }
}
function cancelVideoStartup() {
  if (!isStartingVideoCall) return;
  videoStartToken++;
  isStartingVideoCall = false;
  $('#videoButton').disabled = false;
  $('#videoButton').textContent = 'Start video';
}
function leaveVideoCall(notify = true) {
  cancelVideoStartup();
  const activeSocket = signalSocket;
  signalSocket = null;
  if (activeSocket) activeSocket.close();
  peerConnections.forEach((connection) => connection.close());
  peerConnections.clear();
  pendingIceCandidates.clear();
  callStream?.getTracks().forEach((track) => track.stop());
  callStream = null;
  $('#localVideo').srcObject = null;
  $('#videoGrid').querySelectorAll('[data-peer-video]').forEach((tile) => tile.remove());
  $('#videoRoom').hidden = true;
  $('#videoButton').textContent = 'Start video';
  if (notify) showToast('You left the video call', 'SYSTEM');
}
function toggleCallMicrophone() {
  if (!callStream) return;
  callMicMuted = !callMicMuted;
  callStream.getAudioTracks().forEach((track) => { track.enabled = !callMicMuted; });
  $('#toggleCallMic').textContent = callMicMuted ? 'Unmute mic' : 'Mute mic';
}
function toggleCallCamera() {
  if (!callStream) return;
  callCameraDisabled = !callCameraDisabled;
  callStream.getVideoTracks().forEach((track) => { track.enabled = !callCameraDisabled; });
  $('#toggleCamera').textContent = callCameraDisabled ? 'Turn camera on' : 'Turn camera off';
}
async function requestMicrophone() {
  if (micStream || !navigator.mediaDevices?.getUserMedia) return true;
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    $('#micPermission').textContent = 'Microphone ready';
    $('#micPermission').classList.add('ready');
    await populateAudioDevices();
    return true;
  } catch (error) {
    showToast('Microphone permission is needed to speak', 'SYSTEM');
    $('#micPermission').textContent = 'Microphone permission was blocked';
    return false;
  }
}
async function populateAudioDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  const devices = await navigator.mediaDevices.enumerateDevices();
  const microphone = $('#microphoneSelect');
  const speaker = $('#speakerSelect');
  microphone.innerHTML = '';
  speaker.innerHTML = '';
  devices.filter((device) => device.kind === 'audioinput').forEach((device, index) => {
    microphone.add(new Option(device.label || `Microphone ${index + 1}`, device.deviceId));
  });
  devices.filter((device) => device.kind === 'audiooutput').forEach((device, index) => {
    speaker.add(new Option(device.label || `Speaker ${index + 1}`, device.deviceId));
  });
}
async function setTalking(talking, source = 'toggle') {
  if (talking && !(await requestMicrophone())) return;
  isTransmitting = talking;
  if (source !== 'hold') keyHeld = talking;
  $('#pttButton').classList.toggle('active', talking);
  $('#pttButton .ptt-label').textContent = talking ? 'TRANSMITTING' : 'TAP TO TALK';
  $('#pttButton .ptt-sub').textContent = talking ? 'Tap again to stop' : 'Tap again to stop';
  $('#speakerCard').style.display = talking ? 'none' : 'flex';
  $('#emptySpeaker').style.display = talking ? 'flex' : 'none';
  if (navigator.mediaSession) navigator.mediaSession.playbackState = talking ? 'playing' : 'paused';
  if (talking) {
    addActivity('started transmitting', 'NOW', 'green', 'LIVE');
    showToast('You are live on the channel', 'SYSTEM');
  } else {
    showToast('Voice transmission stopped', 'SYSTEM');
  }
}
function stopTalking() {
  if (!keyHeld || !isTransmitting) return;
  setTalking(false, 'hold');
}

function toggleTalking() {
  setTalking(!isTransmitting, 'toggle');
}

renderServers();
$('#displayName').value = currentUserName;
$('.user-card strong').textContent = currentUserName;
$('.user-card .avatar').textContent = initialsFor(currentUserName);
$('#profileButton').textContent = initialsFor(currentUserName);
$('#channelSearch').addEventListener('input', (event) => renderChannels(event.target.value));
$('#pttButton').addEventListener('click', toggleTalking);
$('#videoButton').addEventListener('click', startVideoCall);
$('#leaveVideoButton').addEventListener('click', () => leaveVideoCall());
$('#toggleCallMic').addEventListener('click', toggleCallMicrophone);
$('#toggleCamera').addEventListener('click', toggleCallCamera);
window.addEventListener('keydown', (event) => { if (event.key.toLowerCase() === 'v' && !event.repeat && document.activeElement.tagName !== 'INPUT') setTalking(true, 'hold'); });
window.addEventListener('keyup', (event) => { if (event.key.toLowerCase() === 'v') stopTalking(); });
$('#sendChat').addEventListener('click', sendChat);
$('#chatInput').addEventListener('input', (event) => { $('#charCount').textContent = `${event.target.value.length}/160`; });
$('#chatInput').addEventListener('keydown', (event) => { if (event.key === 'Enter') sendChat(); });
function sendChat() {
  const input = $('#chatInput');
  const message = input.value.trim();
  if (!message) return;
  appendMessageRow({ author: currentUserName, text: message, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
  input.value = '';
  $('#charCount').textContent = '0/160';
}
$('#clearActivity').addEventListener('click', () => { messageLogs[logKey()] = []; saveMessageLogs(); renderMessageLog(); });
$('#openChannelModal').addEventListener('click', () => { $('#channelModal').hidden = false; $('#newChannelName').focus(); });
$('#closeChannelModal').addEventListener('click', () => { $('#channelModal').hidden = true; });
$('#channelModal').addEventListener('click', (event) => { if (event.target.id === 'channelModal') $('#channelModal').hidden = true; });
document.querySelectorAll('.privacy-option').forEach((option) => option.addEventListener('click', () => { selectedPrivacy = option.dataset.privacy; document.querySelectorAll('.privacy-option').forEach((item) => item.classList.toggle('selected', item === option)); }));
$('#createChannel').addEventListener('click', () => {
  const name = $('#newChannelName').value.trim();
  if (!name) { $('#newChannelName').focus(); return; }
  if (channels.some((channel) => channel.serverId === activeServer.id && channel.name.toLowerCase() === name.toLowerCase())) {
    showToast('A room with that name already exists', 'SYSTEM');
    return;
  }
  const channel = { name, serverId: activeServer.id, type: selectedPrivacy, description: selectedPrivacy === 'private' ? 'Invite only · 1 member' : 'Public · 1 member', members: 1, symbol: selectedPrivacy === 'private' ? '◒' : '⌁' };
  channels.push(channel);
  localStorage.setItem('porto-custom-rooms', JSON.stringify(channels.filter((room) => !builtInRoomKeys.has(`${room.serverId}:${room.name.toLowerCase()}`))));
  $('#newChannelName').value = '';
  $('#channelModal').hidden = true;
  selectChannel(name);
  showToast(`${name} is ready to use`, 'SYSTEM');
});
$('#inviteButton').addEventListener('click', () => showToast('Invite link copied to clipboard', 'SYSTEM'));
$('#settingsButton').addEventListener('click', () => { $('#channelModal').hidden = false; $('#newChannelName').focus(); });
$('#serversButton').addEventListener('click', () => { cancelVideoStartup(); if (callStream) leaveVideoCall(false); $('#appShell').hidden = true; $('#serverDirectory').hidden = false; });
$('#profileButton').addEventListener('click', openProfileModal);
$('#closeProfileModal').addEventListener('click', () => { $('#profileModal').hidden = true; });
$('#profileModal').addEventListener('click', (event) => { if (event.target.id === 'profileModal') $('#profileModal').hidden = true; });
$('#saveProfile').addEventListener('click', () => {
  const name = $('#displayName').value.trim() || 'Jordan Davis';
  currentUserName = name;
  localStorage.setItem('porto-profile-name', name);
  document.querySelectorAll('.user-card strong').forEach((element) => { element.textContent = name; });
  document.querySelector('.user-card .avatar').textContent = initialsFor(name);
  $('#profileButton').textContent = initialsFor(name);
  $('#localVideoName').textContent = name;
  $('#profileModal').hidden = true;
  showToast(`Profile updated to ${name}`, 'SYSTEM');
});
async function openProfileModal() {
  $('#displayName').value = currentUserName;
  $('#profileModal').hidden = false;
  await populateAudioDevices();
}
$('#microphoneSelect').addEventListener('change', async (event) => {
  if (!navigator.mediaDevices?.getUserMedia) return;
  const deviceId = event.target.value;
  if (micStream) micStream.getTracks().forEach((track) => track.stop());
  micStream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId } } });
  $('#micPermission').textContent = 'Microphone ready';
  $('#micPermission').classList.add('ready');
});
if (navigator.mediaSession) {
  try {
    navigator.mediaSession.setActionHandler('play', toggleTalking);
    navigator.mediaSession.setActionHandler('pause', toggleTalking);
  } catch (error) {
    console.info('Media buttons are not supported by this browser.');
  }
}
setInterval(() => { $('#latency').textContent = `${38 + Math.floor(Math.random() * 12)} ms`; }, 4000);
