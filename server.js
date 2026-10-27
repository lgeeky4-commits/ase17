"use strict";
const express = require("express");
const http = require("http");
const path = require("path");
const crypto = require("crypto");
const { Server } = require("socket.io");
const app = express();
const server = http.createServer(app);
// Video reports use Socket.IO binary packets, limited to 8 MiB each.
const io = new Server(server, { maxHttpBufferSize: 10 * 1024 * 1024 });
const PORT = process.env.PORT || 3000;
const MAX_USERS = 6;
const lastSonarAt=new Map();
const users = new Map(); // socket id -> {name}
// Opt-in, scripted cybersecurity game only. No private chat/map contents are ever disclosed.
const simParticipants = new Map(); // id -> {enabled, accessCode, fakeIp}
const simProbes = new Map(); // initiating id -> {to, expires, multiplier, offset}
const simAttempts = new Map(); // initiating id -> {windowStart, count, lastProbe}
const simSessions = new Map(); // initiating id -> {to, until}
function simPublicProfile(id) {
  const p = simParticipants.get(id);
  return {simEnabled:!!p?.enabled, simCode:p?.enabled?p.accessCode:null};
}
function simAttempt(id) {
  const now=Date.now();let a=simAttempts.get(id);
  if(!a || now-a.windowStart>60000) a={windowStart:now,count:0,lastProbe:0};
  a.count++;simAttempts.set(id,a);
  return a.count<=8;
}
function simulatedIntel(from,to) {
  const label=(users.get(to)?.name||'Operator').slice(0,20);
  // Entirely fictional content, deterministic snippets, NOT the user's real messages/marks.
  return {kind:'training-only',subject:label,expires:Date.now()+60000,
    messages:[
      {name:'SIM NODE',text:'[TRAINING] Link established to virtual node.'},
      {name:label+' (simulated)',text:'[FICTION] Checking simulated relay status.'},
      {name:'SIM NODE',text:'[FICTION] Virtual route is available for a training run.'},
      {name:label+' (simulated)',text:'[FICTION] Map markers are training targets, not personal data.'}
    ],
    marks:[{x:.22,y:.32,label:'TRAINING A'},{x:.67,y:.56,label:'TRAINING B'},{x:.45,y:.81,label:'TRAINING C'}]
  };
}

const roomState = new Map(); // room id -> {messages, annotations}
const liveSessions = new Map();
const radioSpeakers = new Map(); // room -> {id,lastChunkAt,lastEmitAt}
function endRadio(room,id){
  const current=radioSpeakers.get(room);
  if(!current || (id && current.id!==id))return;
  radioSpeakers.delete(room);
  io.to(room).emit("radio:stopped",{room,userId:current.id});
}
// Release a stuck talker if their browser disappears without a stop event.
const radioWatch=setInterval(()=>{for(const [room,s] of radioSpeakers)if(Date.now()-s.lastChunkAt>3500)endRadio(room,s.id);},1000);
radioWatch.unref?.();
// Ephemeral pair-level trust and optional shared chat wallpapers.
const trustState = new Map();
const sharedWalls = new Map();
function pairTrust(room){
  if(!trustState.has(room)) trustState.set(room,{approved:new Set(),code:null});
  return trustState.get(room);
}
function trustPayload(room){
  const t=pairTrust(room);
  return {approved:[...t.approved], mutual:t.approved.size===2, code:t.approved.size===2?t.code:null};
}
function sendTrust(room){io.to(room).emit('trust:status',{room,...trustPayload(room)});}

// One-to-one browser calls: the server relays only WebRTC setup messages, never the media.
const calls = new Map(); // call id -> {caller, callee, kind, accepted, timer}
const callByUser = new Map();
function endCall(callId, reason='ended') {
  const call = calls.get(callId);
  if (!call) return;
  clearTimeout(call.timer);
  calls.delete(callId);
  callByUser.delete(call.caller);
  callByUser.delete(call.callee);
  for (const id of [call.caller, call.callee]) io.to(id).emit('call:ended', {callId, reason});
}
 // broadcaster socket id -> Set of authorized viewers
const lastPhotoAt = new Map();
const lastEmergencyAt = new Map();
const lastReportAt = new Map();
const reportMedia = new Map(); // id -> {room,mime,kind,bytes}; room-validated on every fetch
const MAX_REPORT_BYTES = 8 * 1024 * 1024;
const MAX_ROOM_REPORT_BYTES = 24 * 1024 * 1024;
function dropReport(item) { if (["report","voice"].includes(item?.kind)) reportMedia.delete(item.id); }
function validMediaMime(kind,mime) {
  return kind === "photo" ? mime === "image/jpeg" :
    kind === "video" && ["video/webm","video/mp4","video/quicktime"].includes(mime);
}
function binaryBytes(input) {
  if (Buffer.isBuffer(input)) return input;
  if (input instanceof ArrayBuffer) return Buffer.from(input);
  if (ArrayBuffer.isView(input)) return Buffer.from(input.buffer,input.byteOffset,input.byteLength);
  return null;
}
function validMediaMagic(bytes,kind,mime) {
  if (kind === "photo") return bytes.length > 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (mime === "video/webm") return bytes.length > 4 && bytes.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3]));
  return bytes.length > 12 && bytes.toString("ascii",4,8) === "ftyp";
}
// All 140 wallpapers are packed into one local JSON file for GitHub's browser upload limit.
// The public URL is intentionally unchanged so the wallpaper picker still works.
const wallpaperBundle = require("./wallpapers.bundle.json");
app.get("/wallpapers/:filename", (req, res, next) => {
  const match = /^wall-(\d{2,3})\.svg$/.exec(req.params.filename);
  if (!match) return next();
  const index = Number(match[1]);
  const svg = wallpaperBundle[String(index)];
  if (!svg) return res.status(404).type("text/plain").send("Wallpaper not found");
  res.set("Cache-Control", "public, max-age=3600");
  res.type("image/svg+xml; charset=utf-8").send(svg);
});
const PUBLIC_DIR = path.join(__dirname, "public");
app.get("/health", (_req, res) => res.json({ status: "ok", wallpapers: Object.keys(wallpaperBundle).length }));
app.get("/", (_req, res) => res.sendFile(path.join(PUBLIC_DIR, "index.html")));
app.use(express.static(PUBLIC_DIR));

const liveDirections=new Map(); // room -> (creator:type -> latest fictional route)
function liveRoom(room){if(!liveDirections.has(room))liveDirections.set(room,new Map());return liveDirections.get(room);}
function trim(v, max) { return typeof v === "string" ? v.trim().slice(0, max) : ""; }
function roster() { return [...users].map(([id, u]) => ({id, name:u.name, avatar:u.avatar || null, status:u.status || "AVAILABLE", live:liveSessions.has(id), ...simPublicProfile(id)})); }
function stopLive(id) {
  const watchers = liveSessions.get(id);
  if (!watchers) return;
  liveSessions.delete(id);
  io.emit("live:ended", {hostId:id});
  sendUsers();
}
function privateId(a, b) { return `dm:${[a,b].sort().join(":")}`; }
function roomFor(socket, requested) {
  if (!users.has(socket.id)) return null;
  if (requested === "public") return "public";
  const peer = [...users.keys()].find(id => id === requested);
  return peer && peer !== socket.id ? privateId(socket.id, peer) : null;
}
function state(room) {
  if (!roomState.has(room)) roomState.set(room, { messages: [], annotations: [], history: [] });
  return roomState.get(room);
}
function pushLimited(arr, item, max) { arr.push(item); if (arr.length > max) arr.shift(); }
function sendUsers() { io.emit("users", roster()); }
function ack(reply, result) { if (typeof reply === "function") reply(result); }
function validRefPoint(p) {
  return !!p && Number.isFinite(p.x) && Number.isFinite(p.y) &&
    p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;
}
function normalizePoints(input) {
  if (!Array.isArray(input) || input.length < 1 || input.length > 30 || !input.every(validRefPoint)) return null;
  return input.map(p => ({x:p.x, y:p.y}));
}
function normalizeMapMeta(data,now){
  const priority = data?.priority === 1 || data?.priority === 2 ? data.priority : 2;
  const color = /^#[0-9a-fA-F]{6}$/.test(data?.color||'')?data.color.toLowerCase():'#ff4d62';
  const preset = ['Alert','Info','Help','Meeting','Checkpoint','Observe','Custom'].includes(data?.preset)?data.preset:'Custom';
  const ttl = [0,30000,300000,900000,3600000].includes(data?.ttl)?data.ttl:0;
  const mediaFilter = ['color','night','heat'].includes(data?.mediaFilter)?data.mediaFilter:'color';
  return {priority,color,preset,expiresAt:ttl?now+ttl:null,mediaFilter};
}
function addMapHistory(room,action,item,author){
  const s=state(room);
  const event={id:crypto.randomUUID(),action,markId:item.id,kind:item.kind,
    note:trim(item.note,90),name:author||item.name,priority:item.priority||2,time:Date.now(),
    point:item.points?.[0]||null};
  pushLimited(s.history,event,100);
  io.to(room).emit('map:history:new',{room,event});
}
function postMapMessage(room,item){
  const m={id:crypto.randomUUID(),userId:item.userId,name:item.name,type:'map',
    markId:item.id,kind:item.kind,priority:item.priority||2,text:trim(item.note,120),
    point:item.points?.[0]||null,time:item.time};
  pushLimited(state(room).messages,m,200);
  io.to(room).emit('message:new',{room,item:m});
}
function validAudioMagic(bytes,mime){
  if(mime==='audio/webm')return bytes.length>4&&bytes.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3]));
  if(mime==='audio/ogg')return bytes.length>4&&bytes.toString('ascii',0,4)==='OggS';
  return mime==='audio/mp4'&&bytes.length>12&&bytes.toString('ascii',4,8)==='ftyp';
}
// Expired map markers are removed for every participant, including private rooms.
const mapExpireClock=setInterval(()=>{
  for(const [room,s] of roomState){
    for(let i=s.annotations.length-1;i>=0;i--){
      const item=s.annotations[i];
      if(!item.expiresAt||item.expiresAt>Date.now())continue;
      s.annotations.splice(i,1);dropReport(item);
      io.to(room).emit('map:removed',{room,id:item.id});
      addMapHistory(room,'EXPIRED',item,'SYSTEM');
    }
  }
},1200);
mapExpireClock.unref?.();

io.on("connection", socket => {
  socket.emit("hello", { maxUsers: MAX_USERS });
  socket.on("join", (nameValue, reply) => {
    if (users.has(socket.id)) { ack(reply, {ok:true, id:socket.id}); return; }
    if (users.size >= MAX_USERS) { ack(reply, {ok:false, error:"This chat already has six connected people."}); return; }
    const name = trim(nameValue, 20).replace(/\s+/g, " ");
    if (!name || name.length < 2) { ack(reply, {ok:false, error:"Enter a name (at least 2 characters)."}); return; }
    if ([...users.values()].some(u => u.name.toLowerCase() === name.toLowerCase())) {
      ack(reply, {ok:false, error:"That name is already taken."}); return;
    }
    users.set(socket.id, {name});
    simParticipants.set(socket.id, {enabled:false, accessCode:'ASE-'+crypto.randomInt(1000,10000), fakeIp:'203.0.113.'+crypto.randomInt(1,255)});
    socket.join("public");
    // Pair rooms are joined on the server for both peers, so private events go only to that pair.
    for (const id of users.keys()) {
      if (id === socket.id) continue;
      const room = privateId(socket.id, id);
      socket.join(room);
      io.sockets.sockets.get(id)?.join(room);
    }
    ack(reply, {ok:true, id:socket.id, name});
    sendUsers();
  });

  // Personal avatar is intentionally set ONLY by the account's own socket.
  // Small raster image only; never accept HTML, SVG, links or scriptable formats.
  socket.on("profile:update", (data, reply) => {
    const user = users.get(socket.id);
    if (!user) return ack(reply, {ok:false, error:"Join first."});
    const avatar = data?.avatar;
    if (avatar !== null && (typeof avatar !== "string" || avatar.length > 115000 ||
      !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(avatar))) {
      return ack(reply, {ok:false, error:"Please use a small JPEG profile photo."});
    }
    user.avatar=avatar;
    user.status=trim(data?.status || "AVAILABLE",36).replace(/[<>]/g, "") || "AVAILABLE";
    sendUsers();
    ack(reply, {ok:true});
  });

  // Ephemeral room-scoped sonar animations. No hidden mapping or location tracking.
  socket.on("sonar:ping", (data, reply) => {
    const room=roomFor(socket, data?.to);
    if(!room || !validRefPoint(data?.point))return ack(reply,{ok:false,error:"Invalid map point or chat."});
    const now=Date.now();
    if(now-(lastSonarAt.get(socket.id)||0)<1800)return ack(reply,{ok:false,error:"Wait before another ping."});
    lastSonarAt.set(socket.id,now);
    const payload={room,userId:socket.id,name:users.get(socket.id).name,point:{x:data.point.x,y:data.point.y},time:now};
    io.to(room).emit("sonar:ping",payload);
    ack(reply,{ok:true});
  });

  // Training minigame: fake IPs and scripted content only. The target explicitly opts in.
  socket.on('sim:opt', (data,reply)=>{
    const p=simParticipants.get(socket.id);
    if(!p || typeof data?.enabled!=='boolean')return ack(reply,{ok:false,error:'Join the chat first.'});
    p.enabled=data.enabled;
    if(!p.enabled){
      for(const [id,probe] of simProbes)if(probe.to===socket.id)simProbes.delete(id);
      for(const [id,session] of simSessions)if(session.to===socket.id){simSessions.delete(id);io.to(id).emit('sim:closed',{reason:'Participant opted out.'});}
    }
    sendUsers();ack(reply,{ok:true,enabled:p.enabled});
  });
  socket.on('sim:probe', (data,reply)=>{
    const to=data?.to,code=trim(data?.code,32).toUpperCase();
    const p=simParticipants.get(to),a=simAttempts.get(socket.id);
    if(!users.has(socket.id) || !users.has(to) || to===socket.id || !p?.enabled)
      return ack(reply,{ok:false,error:'Choose a participant who opted in to training.'});
    if(a && Date.now()-a.lastProbe<2500)return ack(reply,{ok:false,error:'Wait before retrying.'});
    if(!simAttempt(socket.id))return ack(reply,{ok:false,error:'Too many attempts. Retry in one minute.'});
    simAttempts.get(socket.id).lastProbe=Date.now();
    if(code!==p.accessCode)return ack(reply,{ok:false,error:'Training access code was incorrect.'});
    const multiplier=crypto.randomInt(5,17),offset=crypto.randomInt(11,96);
    simProbes.set(socket.id,{to,expires:Date.now()+90000,multiplier,offset});
    ack(reply,{ok:true,fakeIp:p.fakeIp,multiplier,offset,formula:'(third octet * M + fourth octet + K) mod 997'});
  });
  socket.on('sim:unlock', (data,reply)=>{
    if(!users.has(socket.id) || !simAttempt(socket.id))
      return ack(reply,{ok:false,error:'Too many tries. Retry in one minute.'});
    const probe=simProbes.get(socket.id),p=simParticipants.get(probe?.to);
    if(!probe || probe.expires<Date.now() || !p?.enabled)
      return ack(reply,{ok:false,error:'No active training puzzle. Start again.'});
    const fakeIp=trim(data?.fakeIp,24),answer=Number(data?.answer);
    const octets=p.fakeIp.split('.').map(Number);
    const expected=(octets[2]*probe.multiplier+octets[3]+probe.offset)%997;
    if(fakeIp!==p.fakeIp || !Number.isInteger(answer) || answer!==expected)
      return ack(reply,{ok:false,error:'IP or checksum incorrect. Try the puzzle again.'});
    simProbes.delete(socket.id);
    const intel=simulatedIntel(socket.id,probe.to);
    simSessions.set(socket.id,{to:probe.to,until:intel.expires});
    io.to(probe.to).emit('sim:alarm',{from:socket.id,name:users.get(socket.id).name,duration:3000});
    ack(reply,{ok:true,intel});
  });
  socket.on('sim:close',()=>simSessions.delete(socket.id));

  socket.on("room:load", (key, reply) => {
    const room = roomFor(socket, key);
    if (!room) return ack(reply, {ok:false, error:"Conversation unavailable."});
    const s = state(room);
    ack(reply, {ok:true, messages:s.messages, annotations:s.annotations, history:s.history||[],
      wallpaper:sharedWalls.get(room)||null,
      trust:room.startsWith('dm:')?trustPayload(room):null});
  });


  // Temporary, push-to-talk audio only; no radio clip is stored. The server
  // checks room membership on EVERY packet (public versus a private pair).
  socket.on('radio:start',(data,reply)=>{
    const room=roomFor(socket,data?.to);
    if(!room)return ack(reply,{ok:false,error:'Chat unavailable.'});
    const active=radioSpeakers.get(room);
    if(active && Date.now()-active.lastChunkAt<3500 && active.id!==socket.id){
      return ack(reply,{ok:false,error:'Someone else is using radio. Try again shortly.'});
    }
    if(active && active.id!==socket.id)endRadio(room,active.id);
    radioSpeakers.set(room,{id:socket.id,lastChunkAt:Date.now(),lastEmitAt:0});
    socket.to(room).emit('radio:started',{room,userId:socket.id,name:users.get(socket.id).name});
    ack(reply,{ok:true,room});
  });
  socket.on('radio:chunk',(data)=>{
    const room=roomFor(socket,data?.to),s=room&&radioSpeakers.get(room);
    if(!s||s.id!==socket.id||room!==data?.room)return;
    const bytes=binaryBytes(data?.samples);
    if(!bytes||bytes.length<2||bytes.length>8192||bytes.length%2!==0)return;
    const now=Date.now();
    if(now-s.lastEmitAt<24)return; // bound emitted event rate
    s.lastEmitAt=now;s.lastChunkAt=now;
    socket.to(room).emit('radio:chunk',{room,userId:socket.id,samples:bytes});
  });
  socket.on('radio:stop',data=>{
    const room=roomFor(socket,data?.to);
    if(room)endRadio(room,socket.id);
  });

  socket.on("message:send", (data, reply) => {
    const room = roomFor(socket, data?.to);
    const text = trim(data?.text, 1500);
    if (!room || !text) return ack(reply, {ok:false, error:"Message was not sent."});
    const item = {id:crypto.randomUUID(), userId:socket.id, name:users.get(socket.id).name, text, time:Date.now()};
    pushLimited(state(room).messages, item, 200);
    io.to(room).emit("message:new", {room, item});
    ack(reply, {ok:true});
  });

  // Photos are resized to JPEG in the browser. Accept only bounded JPEG data URLs:
  // no SVG/HTML uploads or arbitrary files, and no cross-room forwarding.
  socket.on("message:photo", (data, reply) => {
    const room = roomFor(socket, data?.to);
    if (!room) return ack(reply, {ok:false, error:"Conversation unavailable."});
    const photo = data?.photo;
    if (typeof photo !== "string" || photo.length > 900000 ||
        !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(photo)) {
      return ack(reply, {ok:false, error:"Only compressed JPEG images up to 650 KB can be sent."});
    }
    const now = Date.now();
    if (now - (lastPhotoAt.get(socket.id) || 0) < 2000) {
      return ack(reply, {ok:false, error:"Wait two seconds before sending another photo."});
    }
    lastPhotoAt.set(socket.id, now);
    const item = {id:crypto.randomUUID(), userId:socket.id, name:users.get(socket.id).name,
      type:"photo", photo, caption:trim(data?.caption, 200), time:now};
    const history = state(room).messages;
    pushLimited(history, item, 100);
    // Bound memory use even when users send many compressed photos.
    while (history.filter(m => m.type === "photo").length > 10) {
      const ix = history.findIndex(m => m.type === "photo");
      history.splice(ix, 1);
    }
    io.to(room).emit("message:new", {room, item});
    ack(reply, {ok:true});
  });

  // Browser WebRTC video: Socket.IO carries signaling ONLY, not the video itself.
  // A viewer must explicitly request a broadcast and the host must be live.
  socket.on("live:start", (_data, reply) => {
    if (!users.has(socket.id)) return ack(reply, {ok:false, error:"Join the chat first."});
    if (!liveSessions.has(socket.id)) liveSessions.set(socket.id, new Set());
    sendUsers();
    ack(reply, {ok:true});
  });
  socket.on("live:stop", (_data, reply) => {
    if (!users.has(socket.id)) return ack(reply, {ok:false});
    stopLive(socket.id);
    ack(reply, {ok:true});
  });
  socket.on("live:watch", (data, reply) => {
    const hostId = data?.hostId;
    if (!users.has(socket.id) || typeof hostId !== "string" || hostId === socket.id ||
        !liveSessions.has(hostId) || !users.has(hostId)) {
      return ack(reply, {ok:false, error:"This broadcast is no longer available."});
    }
    liveSessions.get(hostId).add(socket.id);
    io.to(hostId).emit("live:viewer:joined", {viewerId:socket.id});
    ack(reply, {ok:true});
  });
  socket.on("live:leave", (data) => {
    const hostId = data?.hostId;
    if (!liveSessions.has(hostId)) return;
    liveSessions.get(hostId).delete(socket.id);
    io.to(hostId).emit("live:viewer:left", {viewerId:socket.id});
  });
  socket.on("live:signal", (data) => {
    const to = data?.to;
    const signal = data?.signal;
    if (!users.has(socket.id) || typeof to !== "string" || !users.has(to) ||
        !signal || typeof signal !== "object" || Array.isArray(signal)) return;
    const fromHost = liveSessions.get(socket.id)?.has(to);
    const toHost = liveSessions.get(to)?.has(socket.id);
    if (!fromHost && !toHost) return;
    if (signal.type !== "offer" && signal.type !== "answer" && signal.type !== "ice") return;
    // Reject unbounded or malformed signaling payloads.
    if (JSON.stringify(signal).length > 20000) return;
    io.to(to).emit("live:signal", {from:socket.id, signal});
  });

  // Invite, consent, and direct peer signaling for PRIVATE calls only.
  // No automatic camera/microphone activation, and a user can be in only one call.
  socket.on('call:invite', (data, reply) => {
    const callee = data?.to;
    const kind = data?.kind === 'video' ? 'video' : data?.kind === 'audio' ? 'audio' : null;
    if (!users.has(socket.id) || !users.has(callee) || callee === socket.id || !kind)
      return ack(reply,{ok:false,error:'Select a connected person to call.'});
    if (callByUser.has(socket.id) || callByUser.has(callee))
      return ack(reply,{ok:false,error:'One of you is already in a call.'});
    const callId=crypto.randomUUID();
    const call={caller:socket.id,callee,kind,accepted:false,timer:null};
    call.timer=setTimeout(()=>endCall(callId,'No answer'),45000);
    calls.set(callId,call);
    callByUser.set(socket.id,callId);
    callByUser.set(callee,callId);
    io.to(callee).emit('call:incoming',{callId,from:socket.id,name:users.get(socket.id).name,kind});
    ack(reply,{ok:true,callId});
  });
  socket.on('call:answer',(data,reply)=>{
    const call=calls.get(data?.callId);
    if (!call || call.callee!==socket.id || call.accepted)
      return ack(reply,{ok:false,error:'Call is no longer available.'});
    if (data?.accept!==true){endCall(data.callId,'Declined');return ack(reply,{ok:true});}
    call.accepted=true;
    clearTimeout(call.timer);call.timer=null;
    io.to(call.caller).emit('call:accepted',{callId:data.callId});
    ack(reply,{ok:true});
  });
  socket.on('call:signal',(data)=>{
    const call=calls.get(data?.callId),signal=data?.signal;
    if (!call?.accepted || !signal || typeof signal!=='object' || Array.isArray(signal))return;
    if (socket.id!==call.caller && socket.id!==call.callee)return;
    if (!['offer','answer','ice'].includes(signal.type))return;
    const encoded=JSON.stringify(signal);
    if(encoded.length>25000)return;
    const to=socket.id===call.caller?call.callee:call.caller;
    io.to(to).emit('call:signal',{callId:data.callId,signal});
  });
  // Temporary, room-scoped video-call drawing signals. Never send to public chat.
  const lastDrawAt = new Map();
  socket.on('call:draw',(data)=>{
    const call=calls.get(data?.callId);
    if(!call?.accepted || call.kind!=='video')return;
    if(socket.id!==call.caller && socket.id!==call.callee)return;
    const {ownerId,phase,strokeId,x,y}=data||{};
    if(ownerId!==call.caller && ownerId!==call.callee)return;
    if(!['point','start','move','end'].includes(phase))return;
    if(typeof strokeId!=='string'||!/^[-a-zA-Z0-9_]{1,48}$/.test(strokeId))return;
    if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>1||y<0||y>1)return;
    const now=Date.now(),prior=lastDrawAt.get(socket.id)||0;
    if(phase==='move'&&now-prior<18)return; // Rate-limit on the server as well.
    lastDrawAt.set(socket.id,now);
    const to=socket.id===call.caller?call.callee:call.caller;
    io.to(to).emit('call:draw',{callId:data.callId,ownerId,phase,strokeId,x,y});
  });
  socket.on('call:end',(data)=>{
    const call=calls.get(data?.callId);
    if(call && (call.caller===socket.id || call.callee===socket.id))endCall(data.callId,'Call ended');
  });

  // Both users independently approve trust. The displayed code is a *cosmetic pairing identifier*,
  // not encryption, authentication, a recovery key or a password.
  socket.on('trust:toggle',(data,reply)=>{
    const room=roomFor(socket,data?.to);
    if(!room?.startsWith('dm:'))return ack(reply,{ok:false,error:'Choose a private chat.'});
    const trust=pairTrust(room);
    if(trust.approved.has(socket.id))trust.approved.delete(socket.id);
    else trust.approved.add(socket.id);
    if(trust.approved.size===2){
      trust.code ||= crypto.randomBytes(4).toString('hex').toUpperCase();
    }else trust.code=null;
    sendTrust(room);
    ack(reply,{ok:true,...trustPayload(room)});
  });
  socket.on('wallpaper:set',(data,reply)=>{
    const room=roomFor(socket,data?.to);
    const wall=Number(data?.wall);
    if(!room?.startsWith('dm:') || pairTrust(room).approved.size!==2)
      return ack(reply,{ok:false,error:'Both people must select Trust to share a wallpaper.'});
    if(!Number.isInteger(wall)||wall<1||wall>142)
      return ack(reply,{ok:false,error:'Invalid wallpaper.'});
    sharedWalls.set(room,wall);
    io.to(room).emit('wallpaper:changed',{room,wall});
    ack(reply,{ok:true});
  });
  socket.on('emergency:send',(data,reply)=>{
    const recipient=data?.to;
    const points=normalizePoints(data?.points);
    if(!users.has(socket.id)||!users.has(recipient)||recipient===socket.id||!points||points.length!==1)
      return ack(reply,{ok:false,error:'Select a connected person and a map point.'});
    const now=Date.now();
    if(now-(lastEmergencyAt.get(socket.id)||0)<15000)
      return ack(reply,{ok:false,error:'Wait before sending another alert.'});
    lastEmergencyAt.set(socket.id,now);
    const room=privateId(socket.id,recipient);
    const item={id:crypto.randomUUID(),userId:socket.id,name:users.get(socket.id).name,
      kind:'pin',base:'reference',points,note:'URGENT: location shared with this person',time:now};
    pushLimited(state(room).annotations,item,120);
    io.to(room).emit('map:new',{room,item});
    io.to(recipient).emit('emergency:incoming',{from:socket.id,name:users.get(socket.id).name,point:points[0],time:now});
    ack(reply,{ok:true});
  });

  socket.on('map:live:list',(data,reply)=>{
    const room=roomFor(socket,data?.to);
    if(!room)return ack(reply,{ok:false,error:'Not part of this chat.'});
    ack(reply,{ok:true,room,tracks:[...liveRoom(room).values()]});
  });
  socket.on('map:live:move',(data,reply)=>{
    const room=roomFor(socket,data?.to);
    const point=data?.point;
    if(!room||!validRefPoint(point))return ack(reply,{ok:false,error:'Invalid fictional map point.'});
    const owner=socket.id,key=owner+':move';
    const old=liveRoom(room).get(key);
    const points=[...(old?.points||[]),{x:point.x,y:point.y}].slice(-3);
    const track={owner,name:users.get(owner).name,type:'move',points,time:Date.now()};
    liveRoom(room).set(key,track);
    io.to(room).emit('map:live:update',{room,track});
    ack(reply,{ok:true,track});
  });
  socket.on('map:live:incoming',(data,reply)=>{
    const room=roomFor(socket,data?.to);
    if(!room||!Array.isArray(data?.points)||data.points.length!==2||!data.points.every(validRefPoint))
      return ack(reply,{ok:false,error:'Select two fictional points on the map.'});
    const track={owner:socket.id,name:users.get(socket.id).name,type:'incoming',
      points:data.points.map(p=>({x:p.x,y:p.y})),time:Date.now()};
    liveRoom(room).set(socket.id+':incoming',track);
    io.to(room).emit('map:live:update',{room,track});
    ack(reply,{ok:true,track});
  });
  socket.on('map:live:clear',(data,reply)=>{
    const room=roomFor(socket,data?.to);
    if(!room||!['move','incoming'].includes(data?.type))return ack(reply,{ok:false,error:'Invalid request.'});
    const type=data.type;
    liveRoom(room).delete(socket.id+':'+type);
    io.to(room).emit('map:live:remove',{room,owner:socket.id,type});
    ack(reply,{ok:true});
  });

  socket.on("map:add", (data, reply) => {
    const room = roomFor(socket, data?.to);
    const base = "reference";
    const kind = data?.kind === "path" ? "path" : data?.kind === "area" ? "area" : "pin";
    const points = normalizePoints(data?.points);
    const note = trim(data?.note, 240);
    if (!room || !points || (kind === "path" && points.length < 2) || (kind === "area" && points.length < 3) || (kind === "pin" && points.length !== 1)) {
      return ack(reply, {ok:false, error:"Invalid map annotation."});
    }
    const now=Date.now();
    const item = {id:crypto.randomUUID(), userId:socket.id, name:users.get(socket.id).name,
      kind, base, points, note, time:now,...normalizeMapMeta(data,now)};
    const list=state(room).annotations;
    list.push(item);
    while(list.length>120){const old=list.shift();dropReport(old);io.to(room).emit('map:removed',{room,id:old.id});}
    io.to(room).emit("map:new", {room, item});
    addMapHistory(room,'CREATED',item);
    postMapMessage(room,item);
    ack(reply, {ok:true,id:item.id});
  });

  // Photo and video reports are stored separately from annotation metadata.
  // A media fetch must prove membership of the same exact public/private room.
  socket.on("map:report", (data, reply) => {
    const room = roomFor(socket, data?.to);
    const points = normalizePoints(data?.points);
    const kind = data?.mediaKind;
    const mime = trim(data?.mime, 40).toLowerCase();
    const bytes = binaryBytes(data?.bytes);
    const note = trim(data?.note, 240);
    if (!room || !points || points.length !== 1 || !validMediaMime(kind,mime) ||
        !bytes || bytes.length < 100 || bytes.length > (kind === "photo" ? 750000 : MAX_REPORT_BYTES) ||
        !validMediaMagic(bytes,kind,mime)) {
      return ack(reply, {ok:false,error:"Unsupported or oversized photo/video. Max video size: 8 MB."});
    }
    const now = Date.now();
    if (now - (lastReportAt.get(socket.id) || 0) < 3000)
      return ack(reply, {ok:false,error:"Wait three seconds before uploading another report."});
    lastReportAt.set(socket.id, now);
    const id = crypto.randomUUID();
    // Timestamp is capture time for browser-made reports; uploaded files use upload time.
    // Metadata is informational and not proof of when a file was actually recorded.
    const browserMade=data?.source==='browser';
    const claimed=Number(data?.recordedAt);
    const recordedAt=browserMade && Number.isFinite(claimed) && claimed<=now+60000 && claimed>=now-86400000
      ? Math.trunc(claimed):now;
    const item = {id,userId:socket.id,name:users.get(socket.id).name,kind:"report",mediaKind:kind,
      base:"reference",points,note,time:now,recordedAt,source:browserMade?'browser':'uploaded',
      ...normalizeMapMeta(data,now)};
    const items = state(room).annotations;
    items.push(item);
    reportMedia.set(id,{room,mime,kind,bytes});
    io.to(room).emit("map:new",{room,item});
    addMapHistory(room,'CREATED',item);
    postMapMessage(room,item);
    // Bound server memory. Oldest media reports expire before regular notes/paths.
    let reports = items.filter(a => a.kind === "report");
    const totalSize=()=>reports.reduce((sum,a)=>sum+(reportMedia.get(a.id)?.bytes.length || 0),0);
    while (reports.length > 12 || totalSize() > MAX_ROOM_REPORT_BYTES) {
      const oldest=reports.shift();
      const index=items.findIndex(a=>a.id===oldest.id);
      if(index>=0)items.splice(index,1);
      dropReport(oldest);
      io.to(room).emit("map:removed",{room,id:oldest.id});
    }
    while(items.length>120) {
      const removed=items.shift();dropReport(removed);
      io.to(room).emit("map:removed",{room,id:removed.id});
    }
    ack(reply,{ok:true,id});
  });

  // Voice markers are short, explicit recordings, not open microphones.
  socket.on('map:voice',(data,reply)=>{
    const room=roomFor(socket,data?.to),points=normalizePoints(data?.points);
    const mime=trim(data?.mime,40).toLowerCase(),bytes=binaryBytes(data?.bytes);
    if(!room||!points||points.length!==1||!['audio/webm','audio/ogg','audio/mp4'].includes(mime)||
       !bytes||bytes.length<100||bytes.length>1200000||!validAudioMagic(bytes,mime))
      return ack(reply,{ok:false,error:'Unsupported voice note. Max 1.2 MB.'});
    const now=Date.now();
    const item={id:crypto.randomUUID(),userId:socket.id,name:users.get(socket.id).name,
      kind:'voice',base:'reference',mediaKind:'voice',points,note:trim(data?.note,240),time:now,
      ...normalizeMapMeta(data,now)};
    const items=state(room).annotations;items.push(item);
    reportMedia.set(item.id,{room,mime,kind:'voice',bytes});
    while(items.filter(x=>x.kind==='voice').length>12){
      const ix=items.findIndex(x=>x.kind==='voice');if(ix<0)break;
      const old=items.splice(ix,1)[0];dropReport(old);io.to(room).emit('map:removed',{room,id:old.id});
    }
    while(items.length>120){const old=items.shift();dropReport(old);io.to(room).emit('map:removed',{room,id:old.id});}
    io.to(room).emit('map:new',{room,item});
    addMapHistory(room,'CREATED',item);postMapMessage(room,item);
    ack(reply,{ok:true,id:item.id});
  });

  // Only the creator may move a marker; updated points remain in the same room.
  socket.on('map:update',(data,reply)=>{
    const room=roomFor(socket,data?.to);
    if(!room)return ack(reply,{ok:false,error:'Conversation unavailable.'});
    const a=state(room).annotations.find(item=>item.id===data?.id);
    const points=normalizePoints(data?.points);
    if(!a||a.userId!==socket.id||['path','area'].includes(a.kind)||!points||points.length!==1)
      return ack(reply,{ok:false,error:'Only your own marks can be moved.'});
    a.points=points;a.updatedAt=Date.now();
    io.to(room).emit('map:updated',{room,item:a});
    addMapHistory(room,'MOVED',a);
    ack(reply,{ok:true});
  });

  socket.on("map:media:get",(data,reply)=>{
    const room=roomFor(socket,data?.to);
    if(!room)return ack(reply,{ok:false,error:"Access denied."});
    const item=state(room).annotations.find(a=>a.id===data?.id && ["report","voice"].includes(a.kind));
    const media=item && reportMedia.get(item.id);
    if(!media || media.room!==room)return ack(reply,{ok:false,error:"Report unavailable in this chat."});
    ack(reply,{ok:true,kind:media.kind,mime:media.mime,bytes:media.bytes});
  });

  // Completing a fictional mission requires an author request and independent approval.
  socket.on('map:mission:request',(data,reply)=>{
    const room=roomFor(socket,data?.to);
    if(!room)return ack(reply,{ok:false,error:'This conversation is unavailable.'});
    const item=state(room).annotations.find(a=>a.id===data?.id);
    if(!item)return ack(reply,{ok:false,error:'Map marker was not found.'});
    if(item.userId!==socket.id)return ack(reply,{ok:false,error:'Only the creator can request confirmation.'});
    if(item.missionRequestedBy)return ack(reply,{ok:false,error:'Already awaiting another player.'});
    item.missionRequestedBy=socket.id;item.missionRequestedName=users.get(socket.id).name;item.missionRequestedAt=Date.now();
    io.to(room).emit('map:updated',{room,item});
    addMapHistory(room,'CONFIRMATION REQUESTED',item);
    ack(reply,{ok:true});
  });
  socket.on('map:mission:confirm',(data,reply)=>{
    const room=roomFor(socket,data?.to);
    if(!room)return ack(reply,{ok:false,error:'This conversation is unavailable.'});
    const entries=state(room).annotations,index=entries.findIndex(a=>a.id===data?.id);
    if(index<0)return ack(reply,{ok:false,error:'Map marker no longer exists.'});
    const item=entries[index];
    if(!item.missionRequestedBy)return ack(reply,{ok:false,error:'The creator has not requested mission completion.'});
    if(item.userId===socket.id||item.missionRequestedBy===socket.id)return ack(reply,{ok:false,error:'A different player must confirm the mission.'});
    entries.splice(index,1);dropReport(item);
    io.to(room).emit('map:removed',{room,id:item.id});
    addMapHistory(room,'MISSION CONFIRMED',item,users.get(socket.id).name);
    ack(reply,{ok:true});
  });

  socket.on("map:delete", (data, reply) => {
    const room = roomFor(socket, data?.to);
    if (!room) return ack(reply, {ok:false});
    const s = state(room);
    const idx = s.annotations.findIndex(item => item.id === data?.id && item.userId === socket.id);
    if (idx < 0) return ack(reply, {ok:false, error:"You can remove only your own markers and paths."});
    const [removed] = s.annotations.splice(idx, 1);
    dropReport(removed);
    io.to(room).emit("map:removed", {room, id:removed.id});
    addMapHistory(room,'DELETED',removed);
    ack(reply, {ok:true});
  });

  socket.on("disconnect", () => {
    if (!users.has(socket.id)) return;
    if(callByUser.has(socket.id))endCall(callByUser.get(socket.id),"Disconnected");
    for(const [room,s] of radioSpeakers)if(s.id===socket.id)endRadio(room,socket.id);
    // Remove the departing person's pins, paths, photos, videos and emergency marks
    // from EVERY conversation, including public, and notify current map viewers.
    for(const [room,roomData] of roomState){
      for(let i=roomData.annotations.length-1;i>=0;i--){
        const item=roomData.annotations[i];
        if(item.userId!==socket.id)continue;
        roomData.annotations.splice(i,1);
        dropReport(item);
        io.to(room).emit('map:removed',{room,id:item.id});
        addMapHistory(room,'LEFT / REMOVED',item,'SYSTEM');
      }
    }
    simParticipants.delete(socket.id);
    simProbes.delete(socket.id);
    simAttempts.delete(socket.id);
    simSessions.delete(socket.id);
    for(const [id,probe] of simProbes)if(probe.to===socket.id)simProbes.delete(id);
    for(const [id,session] of simSessions)if(session.to===socket.id){simSessions.delete(id);io.to(id).emit('sim:closed',{reason:'Participant disconnected.'});}
    users.delete(socket.id);
    lastSonarAt.delete(socket.id);
    lastPhotoAt.delete(socket.id);
    lastEmergencyAt.delete(socket.id);
    lastReportAt.delete(socket.id);
    stopLive(socket.id);
    for (const [hostId, watchers] of liveSessions) {
      if (watchers.delete(socket.id)) io.to(hostId).emit("live:viewer:left", {viewerId:socket.id});
    }
    // Live fictional movement layers are ephemeral and visible only in their own rooms.
    for(const [room,tracks] of liveDirections){
      for(const type of ['move','incoming'])if(tracks.delete(socket.id+':'+type))
        io.to(room).emit('map:live:remove',{room,owner:socket.id,type});
      if(tracks.size===0)liveDirections.delete(room);
    }
    // Socket IDs are temporary: discard private conversation state when a member leaves.
    for (const key of [...roomState.keys()]) if (key.startsWith("dm:") && key.split(":").includes(socket.id)) {
      for(const item of roomState.get(key).annotations) dropReport(item);
      roomState.delete(key);
      liveDirections.delete(key);
      trustState.delete(key);
      sharedWalls.delete(key);
    }
    sendUsers();
  });
});
server.listen(PORT, "0.0.0.0", () => console.log(`Crimson Chat running on port ${PORT}`));
