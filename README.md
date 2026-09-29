# Porto Porto

An alpha prototype for a real-time walkie-talkie app.

## Run it

Install dependencies and run the included Node server:

```bash
npm install
npm start
```

Then visit `http://localhost:4173`. Use another port with `PORT=8080 node server.js`.

The server also exposes `GET /health` for deployment checks.

## Deploy on Render

Create a **Web Service** from this repository. Render can use the included `render.yaml`, or set these values manually:

- Build command: `npm install`
- Start command: `npm start`
- Health check path: `/health`

Do not deploy this as a Static Site, because the Node server needs to run as a Web Service.

## Alpha interactions

- Hold the large button on touch or mouse to push to talk.
- Hold `V` on desktop to transmit.
- Choose a server from the directory shown when the app opens, then switch servers from the top bar.
- Use Settings or `+` to create public or invite-only rooms in the current server.
- Search and switch rooms from the left rail.
- Send messages from the composer; each room has a text log saved in this browser.
- Start a video call from a room; participants connect peer-to-peer with WebRTC.
- Use the profile button to edit your display name and choose a wired or Bluetooth audio device.
- Tap the talk button once to start and again to stop. Supported device play/pause buttons use the same toggle through the browser Media Session API.

Voice transport is simulated in this visual alpha. A production version would connect the controls to a WebRTC or WebSocket voice service.
Video calls require camera and microphone permission and a secure browser context (`localhost` is allowed). STUN is configured for peer discovery; a TURN relay is not configured, so some networks may not connect. Server membership, private-room access, and message sharing are not backed by accounts or a remote database in this alpha; room and message data are stored locally in the browser.