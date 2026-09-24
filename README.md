# Porto Porto

An alpha prototype for a real-time walkie-talkie app.

## Run it

Open `index.html` in a browser, or serve this folder with any static file server:

```bash
python3 -m http.server 4173
```

Then visit `http://localhost:4173`.

## Alpha interactions

- Hold the large button on touch or mouse to push to talk.
- Hold `V` on desktop to transmit.
- Send transient channel chat from the composer at the bottom of the screen.
- Use `+` to create public or private channels.
- Switch channels from the left rail and search the channel list.
- Open the profile button to change your display name and choose a wired or Bluetooth audio device.
- Tap the talk button once to start and again to stop. Supported device play/pause buttons use the same toggle through the browser Media Session API.

Voice transport is simulated in this visual alpha. A production version would connect the controls to a WebRTC or WebSocket voice service.