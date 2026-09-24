const channels = [
  { name: 'Operations', type: 'public', description: 'General coordination · Anyone can join', members: 8, pinned: true, symbol: '⌁' },
  { name: 'Night shift', type: 'private', description: 'Invite only · 4 members', members: 4, pinned: true, symbol: '◒' },
  { name: 'Event crew', type: 'public', description: 'Public · 12 members', members: 12, symbol: '✦' },
  { name: 'Warehouse 04', type: 'private', description: 'Invite only · 6 members', members: 6, symbol: '▦' },
  { name: 'Field team', type: 'public', description: 'Public · 21 members', members: 21, symbol: '⌁' }
];
let activeChannel = channels[0];
let selectedPrivacy = 'public';
let keyHeld = false;
let isTransmitting = false;
let micStream = null;
let currentUserName = 'Jordan Davis';
const $ = (selector) => document.querySelector(selector);
const initialsFor = (name) => name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();

function channelMarkup(channel) {
  return `<button class="channel-item ${channel.name === activeChannel.name ? 'active' : ''}" data-channel="${channel.name}"><span class="channel-symbol">${channel.symbol}</span><span class="channel-copy"><strong>${channel.name}</strong><span>${channel.type === 'private' ? 'Private' : `${channel.members} members`}</span></span>${channel.name === 'Operations' ? '<span class="channel-alert">2</span>' : ''}</button>`;
}
function renderChannels(filter = '') {
  const visible = channels.filter((channel) => channel.name.toLowerCase().includes(filter.toLowerCase()));
  $('#pinnedChannels').innerHTML = visible.filter((channel) => channel.pinned).map(channelMarkup).join('');
  $('#allChannels').innerHTML = visible.filter((channel) => !channel.pinned).map(channelMarkup).join('');
  document.querySelectorAll('[data-channel]').forEach((item) => item.addEventListener('click', () => selectChannel(item.dataset.channel)));
}
function selectChannel(name) {
  activeChannel = channels.find((channel) => channel.name === name) || activeChannel;
  $('#channelName').textContent = activeChannel.name;
  $('#channelDescription').textContent = activeChannel.description;
  $('#privacyBadge').textContent = activeChannel.type.toUpperCase();
  $('#privacyBadge').classList.toggle('private', activeChannel.type === 'private');
  $('#channelIcon').textContent = activeChannel.symbol;
  $('#channelIcon').classList.toggle('private', activeChannel.type === 'private');
  $('#memberCount').textContent = `${activeChannel.members} online`;
  $('#chatInput').placeholder = `Send a message to ${activeChannel.name}...`;
  renderChannels($('#channelSearch').value);
  addActivity(`Switched to ${activeChannel.name}`, 'NOW', 'green', 'ACTIVE');
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

renderChannels();
$('#channelSearch').addEventListener('input', (event) => renderChannels(event.target.value));
$('#pttButton').addEventListener('click', toggleTalking);
window.addEventListener('keydown', (event) => { if (event.key.toLowerCase() === 'v' && !event.repeat && document.activeElement.tagName !== 'INPUT') setTalking(true, 'hold'); });
window.addEventListener('keyup', (event) => { if (event.key.toLowerCase() === 'v') stopTalking(); });
$('#sendChat').addEventListener('click', sendChat);
$('#chatInput').addEventListener('input', (event) => { $('#charCount').textContent = `${event.target.value.length}/160`; });
$('#chatInput').addEventListener('keydown', (event) => { if (event.key === 'Enter') sendChat(); });
function sendChat() {
  const input = $('#chatInput');
  const message = input.value.trim();
  if (!message) return;
  showToast(message);
  addActivity('sent a message', 'NOW', 'blue', 'CHAT');
  input.value = '';
  $('#charCount').textContent = '0/160';
}
$('#clearActivity').addEventListener('click', () => { $('#activityList').innerHTML = '<div class="activity-row"><span class="activity-time">NOW</span><div class="activity-avatar blue">JD</div><div><strong>Jordan Davis</strong><span> cleared activity</span></div><span class="activity-tag">DONE</span></div>'; });
$('#openChannelModal').addEventListener('click', () => { $('#channelModal').hidden = false; $('#newChannelName').focus(); });
$('#closeChannelModal').addEventListener('click', () => { $('#channelModal').hidden = true; });
$('#channelModal').addEventListener('click', (event) => { if (event.target.id === 'channelModal') $('#channelModal').hidden = true; });
document.querySelectorAll('.privacy-option').forEach((option) => option.addEventListener('click', () => { selectedPrivacy = option.dataset.privacy; document.querySelectorAll('.privacy-option').forEach((item) => item.classList.toggle('selected', item === option)); }));
$('#createChannel').addEventListener('click', () => {
  const name = $('#newChannelName').value.trim();
  if (!name) { $('#newChannelName').focus(); return; }
  const channel = { name, type: selectedPrivacy, description: selectedPrivacy === 'private' ? 'Invite only · 1 member' : 'General coordination · Anyone can join', members: 1, symbol: selectedPrivacy === 'private' ? '◒' : '⌁' };
  channels.push(channel);
  $('#newChannelName').value = '';
  $('#channelModal').hidden = true;
  selectChannel(name);
  showToast(`${name} is ready to use`, 'SYSTEM');
});
$('#inviteButton').addEventListener('click', () => showToast('Invite link copied to clipboard', 'SYSTEM'));
$('#settingsButton').addEventListener('click', openProfileModal);
$('#profileButton').addEventListener('click', openProfileModal);
$('#closeProfileModal').addEventListener('click', () => { $('#profileModal').hidden = true; });
$('#profileModal').addEventListener('click', (event) => { if (event.target.id === 'profileModal') $('#profileModal').hidden = true; });
$('#saveProfile').addEventListener('click', () => {
  const name = $('#displayName').value.trim() || 'Jordan Davis';
  currentUserName = name;
  document.querySelectorAll('.user-card strong').forEach((element) => { element.textContent = name; });
  document.querySelector('.user-card .avatar').textContent = initialsFor(name);
  $('#profileButton').textContent = initialsFor(name);
  $('#profileModal').hidden = true;
  showToast(`Profile updated to ${name}`, 'SYSTEM');
});
async function openProfileModal() {
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
