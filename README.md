# ASE Crimson Chat / Version 2.9 — Command Suite

This ZIP is the complete **browser website project**, built from the previous ASE 2.8.1 easy-upload edition. It still includes the chat, private rooms, picture-based map, reports, radio, live/video calls, wallpapers and Mission Lab. It now allows **up to SIX people online**. No app or Android Studio is necessary for visitors.

## Easiest GitHub/Render installation

1. Download and **extract** the ZIP.
2. Go to your GitHub repository. Remove or overwrite older root files as appropriate so the newest version takes effect.
3. Upload the **contents** of the extracted folder into the repository **root**. Do not add the outer ZIP or an extra nesting folder. Keep the `public/` folder intact.
4. The top level must contain `server.js`, `package.json`, `wallpapers.bundle.json`, `README.md`, plus the `public/` directory.
5. The `public/` directory contains `index.html`, `app.js`, `suite.js`, `suite.css`, `style.css`, `lab.js`, `lab.css`, `ops.js`, the map image, sample videos and a grit texture.
6. On Render, use a **Web Service**, language **Node**, Build Command `npm install`, Start Command `npm start`, and root directory **blank** for a repository-root upload. Deploy the newest commit.
7. Check `https://YOUR-RENDER-URL/health` — it should show `status: ok` and `wallpapers: 140`.
8. Open the bare site URL (not `/public/index.html`) on phones and computers. Camera and microphone features need HTTPS and browser permission.

The 140 static wallpapers are still packaged in ONE `wallpapers.bundle.json` file. The two moving wallpapers use CSS. You do not need to upload 140 separate SVG files. This edition uses fewer than 100 project files, so GitHub's browser upload limit is not a problem.

## New / Version 2.9

Press **ASE / OPS** in the lower-left of the site to open the Command Suite. Access the **WHEEL** button as a shortcut. The new features are:

1. **ASE Command Center** — six-user status roster, authorized chat/map overview, activity panel and links to existing missions, media and radio.
2. **Complete UI Editor** — theme color, text scale, message size and chat width; saved in your current browser.
3. **Secret Vault** — encrypted device-local notes and optional encrypted photos, video clips or wallpapers (up to 8 MB per attachment; up to 20 files). Requires a 6+ character passphrase. Uses Web Crypto AES-GCM + PBKDF2; no server receives this content. Password reset/recovery is unavailable. Note-JSON export does NOT include encrypted attachment bytes; keep originals.
4. **Sonar Ping** — tap a map point to send an ephemeral animated ping to everyone in the *selected* authorized public or private conversation. Server enforces membership and a rate limit. It is not a real-location service.
5. **Command Wheel** — accessible from WHEEL; can also appear with a long-press on an empty portion of the chat pane.
6. **3D Map Tilt** — adjustable simulated perspective preview of your original fixed map; no live map service and no real-time coordinates.
7. **CCTV Clip Editor** — load a sample or personal video, select the start/end interval (up to 30 seconds), apply color treatments, save a CCTV-stamped frame or export a **silent WebM** clip where MediaRecorder/canvas capture is supported. Editing dates are not claimed to be the original capture time.
8. **User Dossiers** — each joined user chooses their own profile photo and status line. The browser compresses the image to a small JPEG; the server distributes only the user's chosen image during their connection. Not a login or identity-verification system.
9. **Cinematic Boot Sequence** — skippable ASE startup and reduced-motion support.
10. **Event Timeline** — recent allowed public/private messages and map events, and local session events, never data from other people's unrelated private rooms.
11. **Thermal Camera Studio** — simulated heat/night-vision filters for your **own permitted camera**; not a thermal sensor.
12. **Radio Spectrum** — an actual waveform analyzer for your own microphone, only after explicit permission; remote radio events have a visual 'on air' indicator.
13. **Surveillance Wall** — local camera (with permission), illustrative map, included video demo, and a *consensual* LIVE stream you already opened in chat. It cannot secretly open a private camera.
14. **Floating Windows** — draggable, resizable chat, map, radio and timeline widgets over the main screen. Floating chat sends to the currently selected conversation.
15. **Six simultaneous connected users** instead of three, with up to six person tabs and a six-person status roster.
16. **Click and sonar sounds**, synthesized in-browser with Web Audio, with on/off and volume controls in the Command Suite. Audio requires user interaction and obeys browser rules.

Extra local chat command shortcuts: `//COMMANDCENTER`, `//ASEOPS`, `//ASEEDITOR`, `//ASEVAULT`, `//SONAR`, `//CCTVEDITOR`, `//DOSSIER`, `//EVENTS`, `//CAMERASTUDIO`, `//SPECTRUM`, `//VIDEO-WALL`.

## Important limitations

- Messages, photo reports and map items currently live in **server memory** and can disappear when the service restarts. Markers and reports are removed when their creator disconnects, as requested earlier. Private room data is isolated by the server but **not end-to-end encrypted**.
- The vault's passphrase encrypts only **local vault data**; it does not protect ordinary chat messages. Avoid using shared browsers for personal secrets.
- Six tabs means up to six *concurrent connected browser sessions*, not six registered accounts.
- The server's `profile:update` checks that the socket owns the edited dossier. Other users can't change a profile via the profile endpoint.
- Phone browsers vary in fullscreen, MediaRecorder, sound, camera switching and WebRTC support. Calls and multi-phone streaming still need end-to-end testing on your real deployed HTTPS site.
- Black Box and Mission Archive retain their existing local storage and backup limitations.
- If Render shows `Cannot GET /`, check that `server.js` and `public/index.html` are in the correct paths and Render is running the latest successful Web Service deploy.

## Tests run during packaging

- `node --check` for server and all client JavaScript files.
- Embedded Chromium UI simulations on 390x844 portrait, 844x390 landscape and 1200x800 desktop; no page JavaScript exceptions in those runs.
- Static checks for new IDs, server room boundaries, 6-person capacity and project assets.
- The public/private events are routed by existing server membership checks. A deployed six-phone and real WebRTC/camera test is still recommended before relying on these features.


## ASE Quick Access Edition (layout fix)
See QUICK_START.md for the new MARK, PATH, and TOOLS toolbar. Advanced dock buttons are collected in one scrollable menu, rather than overlapping the chat and each other.

## Version 3.1 quick map marking

See **MAP_MARKING_GUIDE.md** for the fast mark, priority 1 / 2, map zoom,
voice recording, photo/video filters, marker expiration, drag controls,
marker history, quick previews, and favorite-tool instructions.


## NEW — v3.2 Map Tools and MP3 Sound Studio

This is a full update to v3.1. All previous chat, public/private rooms, quick marking, live media and permitted calling features remain in the project.

### Marker Clustering
- Open your map and use **CLUSTERS ON** to group nearby marker pins at smaller zoom levels.
- Tap a number cluster to zoom in and separate the individual marks. Tap again to disable grouping.
- Clusters are generated locally using the authorized annotations already in your current chat. They do not expose any private-room marker to public members.

### Priority Alerts
- New **Priority 1** items play the **PRIORITY 1 ALERT** MP3 and display a short notification for other people in that conversation.
- Priority 2 uses the quieter **MARK ADDED** sound. Use the Sound Studio to replace either.

### Area Drawing
1. Open the Map. Press **DRAW AREA** on the map toolbar.
2. Tap 3 or more corners of the area on your illustrated map.
3. Press **SAVE AREA**, enter a label and save.
4. Choose a color, importance and expiration before drawing. The area appears as a transparent polygon in the current public/private map.
5. The area goes away when its creator disconnects, as with other saved map annotations.

### Marker Search
- Press **FIND MARK**. Search message, user, preset, kind, color or timestamp.
- Filter by **All**, **Priority 1** or **Priority 2**.
- Tap a result to focus its place on the map. Only the selected conversation's annotations are searched.

### MP3 Sound Studio
There are 20 editable event sound slots:

| # | Event | # | Event |
|---|---|---|---|
| 1 | Button Click | 11 | Call End |
| 2 | Marker Added | 12 | Message Received |
| 3 | Priority 1 Alert | 13 | Photo Taken |
| 4 | Area Created | 14 | Recording Start |
| 5 | Cluster Expanded | 15 | Recording Stop |
| 6 | Sonar Ping | 16 | Emergency Alert |
| 7 | Incoming Call | 17 | Terminal Open |
| 8 | Radio Start | 18 | Terminal Success |
| 9 | Menu Open | 19 | Terminal Failure |
| 10 | Radio Stop | 20 | Map Report Received |

To use: Open **TOOLS → SOUND STUDIO**, or the **SOUND STUDIO / MP3** button in the map toolbar.
- Press **PLAY** to hear any default/assigned MP3.
- Select an **MP3 file** in that row to replace the sound, stored in this browser's IndexedDB.
- Use **SAVE MP3** to download that row's currently assigned sound.
- Press **DEFAULT** to revert a slot to the included MP3.
- To create a sound inside ASE, go to **MAKE YOUR OWN MP3**, choose the event to assign, then choose up to three source sounds. Press **CREATE & ASSIGN MP3**, then **DOWNLOAD CUSTOM MP3**. This composes an original sequence using compatible MP3 frames from the included sound library.
- Press **DOWNLOAD ALL 20 DEFAULT MP3s** for the included sound bank.
- **ENABLE SOUNDS** and **VOLUME** control these event sounds on your device.

Custom uploads/compositions stay **on your device**. They are not broadcast to other people. The demo currently uses no cloud storage for personal MP3 uploads. A saved custom MP3 can be sent manually through any supported file-sharing method. Browser autoplay restrictions may require you to press PLAY once before hearing notifications.

### Deployment
Keep all files with `server.js`, `package.json` and `wallpapers.bundle.json` beside `public/`. Upload the extracted **contents** to GitHub, not the enclosing folder. Create/redeploy a Node Web Service on Render using build command `npm install` and start command `npm start`. All visitors use the hosted HTTPS link.

### Testing notes
- `node --check` passed for server and all client scripts.
- Embedded Chromium tests passed at 390×844 (phone), 844×390 (landscape phone) and 1200×840 (desktop) for drawing an area, searching it, opening Sound Studio and composing/saving an MP3.
- The downloaded composed MP3 decoded with FFprobe as MPEG Layer III at 24 kHz.
- The default 20 MP3 files and the sound pack ZIP passed format/integrity checks.
- Backend authorization follows the existing per-room Socket.IO checks. Full six-phone/camera tests on Render are still required; the demo stores messages and annotations in server memory.


## v3.4 — Live Direction Map Tools
- New **LIVE MARK** dot, moved with one map tap at a time. Exactly the two newest direction arrows are kept per user and room.
- New **SIM INCOMING PATH** tool. Tap a fictional start and destination to share the route. Clear either tool's current overlay with **CLEAR MY LIVE**.
- Server validates public/private room membership on every operation. No GPS/location access.
- ASE's existing maps, photo/video markers, MP3 sounds, wallpapers and chat remain intact.
- See `LIVE_MAP_GUIDE.md`.

## v3.5 — Zoomed Map Navigation

The shared fictional map supports zoom up to **4.5×** with the `+` / `−` controls, mouse wheel, or a two-finger pinch. Use `RESET` to return to 1× and the centered position.

When zoomed in and browsing the map, drag or swipe to pan around it. Use **PAN MAP** when you want to ensure touch gestures move the map rather than place a mark. PAN mode turns off an active live moving marker / incoming route tool and cancels placement mode. Press **PAN MAP** again before placing new marks.

Map markers, their creation times, routes, drawn areas, attached media previews, and live direction arrows move and zoom with the underlying reference image. Marker coordinates are computed after panning so new marks land where you tap. Pan stays within map bounds.

The reference map is an image, not live terrain tiles. Zoom may make the picture pixelated.


## Mission confirmation update

This is a fictional multiplayer roleplay map; locations and incident records are game data, not real emergency reports.

### Two-player mission confirmation
1. Place or open one of your own map items.
2. Press REQUEST MISSION CONFIRMATION.
3. A different connected player opens the same item in the same conversation/map.
4. That second player presses CONFIRM MISSION.
5. The server removes the mark for everyone in that room. The creator cannot self-confirm.

### Confirmation in ASE
Open the map, then the Marks or Reports tab. Creators see REQUEST MISSION CONFIRMATION under their entries. Other participants in the same public/private chat see CONFIRM MISSION · REMOVE MARK after a request. The update stays confined to its conversation, and the Map History logs the confirmation.

**Storage:** All records are held in the running demo server's memory. Restarting the server clears active and completed cases. Real multi-phone calling/radio remains dependent on browser permissions and network conditions.
