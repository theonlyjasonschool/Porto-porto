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
const $ = (selector) => document.querySelector(selector);

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
  row.innerHTML = `<span class="activity-time">${time}</span><div class="activity-avatar ${color}">JD</div><div><strong>Jordan Davis</strong><span> ${text}</span></div><span class="activity-tag">${tag}</span>`;
  $('#activityList').prepend(row);
}
function showToast(message, author = 'Jordan') {
  const toast = document.createElement('div');
  toast.className = 'chat-toast';
  toast.innerHTML = `<strong>${author}</strong><span>${message}</span>`;
  $('#toastStack').append(toast);
  window.setTimeout(() => toast.remove(), 5100);
}
function setTalking(talking) {
  keyHeld = talking;
  $('#pttButton').classList.toggle('active', talking);
  $('#pttButton .ptt-label').textContent = talking ? 'TRANSMITTING' : 'PUSH TO TALK';
  $('#pttButton .ptt-sub').textContent = talking ? 'Release to send' : 'Release to send';
  $('#speakerCard').style.display = talking ? 'none' : 'flex';
  $('#emptySpeaker').style.display = talking ? 'flex' : 'none';
  if (talking) {
    addActivity('started transmitting', 'NOW', 'green', 'LIVE');
    showToast('You are live on the channel', 'SYSTEM');
  }
}
function stopTalking() {
  if (!keyHeld) return;
  setTalking(false);
  showToast('Voice note sent to the channel', 'SYSTEM');
}

renderChannels();
$('#channelSearch').addEventListener('input', (event) => renderChannels(event.target.value));
$('#pttButton').addEventListener('pointerdown', (event) => { event.preventDefault(); setTalking(true); });
window.addEventListener('pointerup', stopTalking);
window.addEventListener('keydown', (event) => { if (event.key.toLowerCase() === 'v' && !event.repeat && document.activeElement.tagName !== 'INPUT') setTalking(true); });
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
$('#settingsButton').addEventListener('click', () => showToast('Settings are coming in the next alpha', 'SYSTEM'));
setInterval(() => { $('#latency').textContent = `${38 + Math.floor(Math.random() * 12)} ms`; }, 4000);
