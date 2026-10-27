# ASE Crimson Chat — Quick Access Edition

This update reorganizes the old overlapping corner tools into a single menu. The six-person network, public/private chats, photo/video reports, live video, calls, radio, saved missions, 140 wallpapers, and the previously installed terminals remain in the website.

## Fast map controls
- **MARK**: tap once to open the map and enter marker placement. Tap on the map to mark your chosen point and complete its note.
- **PATH**: tap once to open the map and enter multipoint route placement. Tap each waypoint; use the map's existing finish button when complete.
- **TOOLS +**: reveal a scrollable grid containing the original ASE / OPS, WHEEL, PING, OPS / 10, ASE / LAB, HACK SIM, wallpapers, fullscreen, and filters buttons.
- **TOOLS -** or **CLOSE**: fold it away, revealing the chat.

The toolbar is hidden at the join screen and while larger feature windows are open, so it does not cover them. It automatically adapts to portrait, landscape and desktop width. Original buttons keep their event handlers.

## Install / deploy
Unzip this archive into a new GitHub repo or replace the files in your existing ASE repo (keep `public/` next to `server.js` and `package.json`). Render build command: `npm install`; start command: `npm start`. Use the HTTPS site on your phone.

## Verification
JavaScript syntax checks passed, and a local embedded-browser UI simulation tested mobile portrait, landscape, and desktop. The 9 advanced tools maintained nonoverlapping 44px-tall touch targets, and both quick buttons routed to the existing map and tool controls. End-to-end multiplayer on a deployed six-phone session was not rerun here.


### ASE 3.2 map/sounds
Open the map for CLUSTERS ON / DRAW AREA / FIND MARK / SOUND STUDIO. The map and chat each contain a way to open Sound Studio. No extra app is required to make or download an MP3. See SOUND_STUDIO_GUIDE.md.
