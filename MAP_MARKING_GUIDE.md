# ASE Crimson Chat v3.1 — Quick Marking Guide

This version extends ASE v3.0 without replacing public/private messaging, calls,
wallpapers, the Command Center, or the custom terminal system.

## QUICK MARK (one tap, no typing)
1. Join ASE. Tap QUICK from the chat dock (or QUICK MARK in map mode).
2. Choose a preset, Importance 1 or 2, a color, and expiration time.
3. Tap the map to place the marker. Keep tapping to place more quick marks.
4. To stop, tap MARK or another map tool.

## Priority levels
- 1 · IMPORTANT — large marker. Zoom to 1.7x or higher to read more detail.
- 2 · LESS IMPORTANT — smaller marker. With an attached photo or video, zoom
  to 1.7x or higher to show a compact preview with its creation time.

## Attachments
- PHOTO + MARK: allow browser camera, select COLOR / NIGHT VISION / HEAT, take
  a picture, tap the map, and save the report.
- VIDEO + MARK: select filter, record up to 12 seconds inside the browser, tap
  the map, and save the report. The video is silent and capped at 8 MB.
- VOICE MARK: tap START RECORDING, then STOP / USE (8 seconds maximum), tap the
  map, add optional text, and save. Audio requires browser microphone permission.
- Original map PHOTO and VIDEO buttons still allow uploading files instead.
- Camera visual modes are simulated grading, not true IR or thermal sensors.

## Zoom and edit
- Use + / - / RESET or mouse wheel. On touchscreens pinch with two fingers.
- At 1.7x and above, more marker details appear.
- Turn on DRAG MARKS to move a marker that YOU created. Turn off afterwards.
- The original map image stays the same; zoom and overlays are screen-only.

## Quick message bubbles and favorites
- Pick a bubble message before placing a marker to prefill the fast text.
- The three favorite tools appear below the chat dock and within the map panel.
- To change your favorites, open TOOLS and use the FAVORITE TOOLS controls.

## History and chat previews
- Open HISTORY below the map. It records created, moved, deleted, expired and
  disconnect-removed markers while the multiplayer server stays online.
- New map actions create map-preview entries in the same public or private chat.
  Tap a preview in chat to jump back to its map marker.

## Security and retention
- Room membership is checked on every marker, media and edit request.
- Private map markers and attachments are not delivered to the public chat.
- Ownership is checked on moving/deleting markers.
- Temporary markers automatically expire on the server.
- As before, all markers by a disconnected user are removed.
- The demo stores messages, voice, images, and videos in server RAM. They reset
  on server restart and are not suitable for sensitive or long-term storage.

## Installation / Render
1. Download ZIP, extract it, and upload the files and `public/` directory to a
   fresh GitHub repository or replace all files in the original ASE repository.
2. Ensure `server.js`, `package.json`, and `wallpapers.bundle.json` are at the
   repository root. `public/` must be a sibling folder.
3. Deploy using the Node.js environment with Start Command `npm start`.
4. Use the HTTPS URL to access microphone and camera permissions on phones.
