"use strict";
const $ = id => document.getElementById(id);
const socket = io();
const ui = Object.fromEntries([
  'joinScreen','mainScreen','joinForm','nameInput','joinError','slotText','usersNav','publicNav','privateNav','mapNav',
  'privateName','privateLive','mapOpen','backFromPrivate','backFromMap','chatScreen','chatPanel','mapScreen','chatStatus',
  'messages','messageForm','messageInput','photoButton','radioHoldButton','radioStatus','radioListenButton','radioEffectSelect','radioChirps','photoInput','goLiveButton','liveHint','mapVisibility','pinButton','pathButton','filtersButton','filtersPanel','closeFilters',
  'gritSlider','contrastSlider','brightnessSlider','hueSlider','saturationSlider','gritValue','contrastValue','brightnessValue','hueValue','saturationValue','resetFilters','uiGrainOverlay','mapHelp',
  'visionMapHeader','visionMapTime','mapCanvas','mapLines','mapPins','draftActions','draftCount','undoPoint','cancelDraft','finishPath','mapPhotoButton','mapVideoButton','marksTab','reportsTab','marksCount','reportsCount',
  'annotationList','annotationCount','noteDialog','noteForm','noteInput','noteTitle','cancelNote','toast','connectionStatus',
  'photoDialog','photoPreview','photoCaption','closePhotoDialog','cancelPhoto','sendPhoto',
  'imageDialog','imageTitle','imageFull','closeImageDialog',
  'liveDialog','liveVideo','liveTitle','liveInfo','microphoneLabel','micEnabled','startLive','stopLive','closeLiveDialog',
  'mapSourceDialog','mapSourceTitle','closeMapSource','takeMapMedia','chooseMapMedia','mapPhotoInput','mapPhotoCamera','mapVideoInput','mapVideoCamera',
  'mapCaptureDialog','mapCaptureTitle','closeMapCapture','mapCapturePreview','mapCaptureClock','mapCaptureStatus','flipMapCapture','snapMapCapture','recordMapCapture','stopMapCapture','reportPreviewStamp','reportViewerStamp','reportDialog','closeReportDialog','reportPreviewImage','reportPreviewVideo','reportNote','cancelReport','saveReport',
  'reportViewer','reportViewerTitle','closeReportViewer','reportViewerImage','reportViewerVideo','reportViewerText',
  'recordControls','recordClip','stopRecordClip','recordInfo','recordPreview','clipToMap','discardClip',
  'fullscreenButton','animatedWallpaper','voiceEffectSelect','callExtraTools','callEffectHint','callPointer','callDraw','callDrawOff','callRemoteDraw','callLocalDraw','exitCallFullscreen','fullscreenCall','voiceCallButton','videoCallButton','privateCallDialog','callTitle','callRemoteVideo','callLocalVideo','callAudioSymbol','callRemoteAudio','callInfo','callIncomingActions','callActiveActions','acceptCall','declineCall','muteCall','hangupCall','closeCallDialog','callStage','callStageSlot','miniCall','miniCallHandle','miniCallContent','miniCallTitle','miniCallRestore','miniCallHangup','reverseCallCamera','callCameraFilters',
  'photoSourceDialog','closePhotoSource','openChatCamera','openChatGallery','chatCameraDialog','chatCameraVideo','chatCameraInfo','closeChatCamera','snapChatPhoto','useNativeCamera','chatNativeCamera','flipChatCamera','chatCameraFilters','flipLiveCamera','liveCameraFilters','cameraFilterDialog','closeCameraFilters','doneCameraFilters','resetCameraFilters','camBrightness','camContrast','camHue','camSaturation','camBrightnessValue','camContrastValue','camHueValue','camSaturationValue',
  'simOpen','simClose','simPanel','simOptIn','simTarget','simCodeHint','simCode','simProbe','simPuzzle','simFakeIP','simChecksum','simUnlock','simCountdown','simOutput','simPreview','simSound','simStop','simAlarmBanner','simAlarmText','simDismissAlarm',
  'codeSidebarTitle','visionControls','visionReportAge','visionTime','wallpaperButton','wallpaperPanel','closeWallpapers','wallpaperInfo','wallpaperGrid','trustButton','trustStatus','codeSidebar','codeUsers','codeMark','codePath','codeReports','codeWalls','codeFilters','codeExit','codeClock','rotateNotice','rotateExit','terminalPad','padUp','padLeft','padRight','padDown','padPlace','cursorCoords','droneGrid','aimReticle','emergencyButton','emergencyDialog','emergencyRecipient','sendEmergency','cancelEmergency','emergencyAlert','emergencyAlertText','emergencyAlertCall','emergencyAlertMap','emergencyAlertClose'
].map(id => [id,$(id)]));

let myId = null;
let roster = [];
let target = 'public';
let onMap = false;
let messages = [];
let annotations = [];
let roomRequest = 0;
let toolMode = 'browse';
let draftPoints = [];
let pendingPoints = [];
let pendingType = 'pin';
let noteOpenId = null;
let mapListTab = 'marks';
let selectedReport = null; // {kind,mime,blob,previewUrl}; awaiting map placement
let reportPoint = null;
let sourceMediaType = null;
let viewingReportUrl = null;
let reportViewerRequest=0;
let reportPreviewUrl = null;
let toastTimeout;

// Camera color controls are separate from the screen-wide appearance filters.
const cameraColorDefaults=Object.freeze({brightness:100,contrast:100,hue:0,saturation:100});
const cameraColors={...cameraColorDefaults};
function cameraFilterCSS(){
  return `brightness(${cameraColors.brightness}%) contrast(${cameraColors.contrast}%) hue-rotate(${cameraColors.hue}deg) saturate(${cameraColors.saturation}%)`;
}
function applyCameraColors(){
  // A camera-snapshot applies these filters to the saved image; processed live streams apply them per frame.
  ui.chatCameraVideo.style.filter=cameraFilterCSS();
  // For browsers without canvas captureStream, the local preview still responds to settings.
  if(!liveCameraPipeline)ui.liveVideo.style.filter=cameraFilterCSS();
  if(!callSession?.cameraPipeline)ui.callLocalVideo.style.filter=cameraFilterCSS();
  // Incoming video is recolored only in THIS viewer's browser, never sent back.
  ui.callRemoteVideo.style.filter=cameraFilterCSS();
  for(const key of Object.keys(cameraColorDefaults)){
    ui['cam'+key[0].toUpperCase()+key.slice(1)].value=String(cameraColors[key]);
    ui['cam'+key[0].toUpperCase()+key.slice(1)+'Value'].textContent=cameraColors[key]+(key==='hue'?'°':'%');
  }
  try{localStorage.setItem('crimson-camera-filters-v1',JSON.stringify(cameraColors));}catch(_e){}
}
try{
  const saved=JSON.parse(localStorage.getItem('crimson-camera-filters-v1'));
  if(saved && typeof saved==='object'){
    for(const [key,defaultValue] of Object.entries(cameraColorDefaults)){
      if(Number.isFinite(Number(saved[key])))cameraColors[key]=Math.max(key==='hue'?0:40,Math.min(key==='hue'?360:200,Number(saved[key])));
      else cameraColors[key]=defaultValue;
    }
  }
}catch(_e){}
for(const key of Object.keys(cameraColorDefaults)){
  const name='cam'+key[0].toUpperCase()+key.slice(1);
  ui[name].addEventListener('input',()=>{cameraColors[key]=Number(ui[name].value);applyCameraColors();});
}
function openCameraColors(){applyCameraColors();if(!ui.cameraFilterDialog.open)ui.cameraFilterDialog.showModal();}
ui.chatCameraFilters.addEventListener('click',openCameraColors);
ui.liveCameraFilters.addEventListener('click',openCameraColors);
ui.callCameraFilters.addEventListener('click',openCameraColors);
ui.closeCameraFilters.addEventListener('click',()=>ui.cameraFilterDialog.close());
ui.doneCameraFilters.addEventListener('click',()=>ui.cameraFilterDialog.close());
ui.resetCameraFilters.addEventListener('click',()=>{Object.assign(cameraColors,cameraColorDefaults);applyCameraColors();});
let liveCameraPipeline=null;
let callSession=null; // Current private call; defined early for camera-filter initialization.
// Capture a filtered canvas track so the remote viewer also sees camera colors where supported.
// Graceful fallback to the original camera stream if captureStream is unavailable.
function makeCameraPipeline(rawStream){
  try{
    const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;
    if(typeof canvas.captureStream!=='function')return null;
    const ctx=canvas.getContext('2d',{alpha:false});if(!ctx)return null;
    const input=document.createElement('video');input.autoplay=true;input.playsInline=true;input.muted=true;
    input.srcObject=new MediaStream(rawStream.getVideoTracks());
    const capture=canvas.captureStream(24);
    if(!capture.getVideoTracks().length)return null;
    const stream=new MediaStream([...capture.getVideoTracks(),...rawStream.getAudioTracks()]);
    let closed=false,last=0;
    function draw(time){
      if(closed)return;
      if(time-last>=40 && input.readyState>=2){
        last=time;ctx.filter=cameraFilterCSS();
        try{ctx.drawImage(input,0,0,canvas.width,canvas.height);}catch(_e){}
      }
      requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);
    input.play().catch(()=>{});
    return {stream,rawStream,input,canvas,dispose(){closed=true;input.pause();input.srcObject=null;capture.getTracks().forEach(t=>t.stop());},
      async swapTrack(newTrack){input.srcObject=new MediaStream([newTrack]);await input.play().catch(()=>{});}};
  }catch(_e){return null;}
}
applyCameraColors();

// Screen-wide visual adjustments. They never alter map coordinates or what is shared with others.
const filterDefaults = Object.freeze({grit:0, contrast:100, brightness:100, hue:0, saturation:100});
const screenFilters = {...filterDefaults};
function clampFilter(name,value){
  const limits={grit:[0,100],contrast:[50,200],brightness:[40,180],hue:[0,360],saturation:[0,200]};
  const [lo,hi]=limits[name];
  return Number.isFinite(Number(value)) ? Math.max(lo,Math.min(hi,Math.round(Number(value)))) : filterDefaults[name];
}
function applyScreenFilters(){
  // Apply the color filter to the document so chat, headers, popups, map and buttons all change.
  document.documentElement.style.filter=`brightness(${screenFilters.brightness}%) contrast(${screenFilters.contrast}%) hue-rotate(${screenFilters.hue}deg) saturate(${screenFilters.saturation}%)`;
  // Noise is an overlay across the whole app, not just the map image.
  const gritOpacity=String(screenFilters.grit / 100 * 0.82);
  ui.uiGrainOverlay.style.opacity=gritOpacity;
  document.documentElement.style.setProperty('--global-grit-opacity',gritOpacity);
  for(const name of Object.keys(filterDefaults)){
    ui[name+'Slider'].value=String(screenFilters[name]);
    ui[name+'Value'].textContent=`${screenFilters[name]}${name==='hue'?'°':'%'}`;
  }
}
function saveScreenFilters(){
  try{localStorage.setItem('crimson-ui-filters',JSON.stringify(screenFilters));}catch(_error){}
}
function restoreScreenFilters(){
  try{
    const saved=JSON.parse(localStorage.getItem('crimson-ui-filters'));
    if(saved&&typeof saved==='object')for(const name of Object.keys(filterDefaults)){
      if(Object.prototype.hasOwnProperty.call(saved,name))screenFilters[name]=clampFilter(name,saved[name]);
    }
  }catch(_error){}
  applyScreenFilters();
}
function toggleFilters(open){
  ui.filtersPanel.classList.toggle('hidden',!open);
  ui.filtersButton.classList.toggle('active',open);
  ui.filtersButton.setAttribute('aria-expanded',String(open));
}

// Fullscreen is a user-initiated browser feature; mobile Safari may not support it.
ui.fullscreenButton.addEventListener('click',async()=>{
  try{
    if(document.fullscreenElement)await document.exitFullscreen();
    else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();
    else toast('This browser does not offer fullscreen for websites.');
  }catch(err){toast('Fullscreen unavailable: '+(err.message||'browser restriction'));}
});
document.addEventListener('fullscreenchange',()=>{
  const isFull=!!document.fullscreenElement;
  ui.fullscreenButton.textContent=isFull?'[ ] exit full':'[ ] full';
  ui.fullscreenButton.setAttribute('aria-label',isFull?'Exit fullscreen':'Enter fullscreen');
});

function create(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
function toast(text) {
  ui.toast.textContent = text;
  ui.toast.classList.remove('hidden');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => ui.toast.classList.add('hidden'), 3200);
}
function peer(id) { return roster.find(u => u.id === id); }
function roomId() { return target === 'public' ? 'public' : `dm:${[myId,target].sort().join(':')}`; }
function isCurrentRoom(room) { return Boolean(myId) && room === roomId(); }
function time(timestamp) { return new Date(timestamp).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}); }

function displayHeader() {
  const priv = target !== 'public';
  ui.mainScreen.classList.toggle('is-private',priv);
  ui.publicNav.classList.toggle('hidden',onMap || priv);
  ui.privateNav.classList.toggle('hidden',onMap || !priv);
  ui.mapNav.classList.toggle('hidden',!onMap);
  ui.mapOpen.classList.toggle('hidden',onMap);
  ui.chatScreen.classList.toggle('hidden',onMap && !codeMode);
  ui.mapScreen.classList.toggle('hidden',!onMap && !codeMode);
  ui.codeSidebar.classList.toggle('hidden',!codeMode);
  ui.voiceCallButton.classList.toggle('hidden',!priv);
  ui.videoCallButton.classList.toggle('hidden',!priv);
  ui.trustButton.classList.toggle('hidden',!priv);
  ui.mainScreen.classList.toggle('code-mode',codeMode);
  ui.mainScreen.classList.toggle('vision-terminal',codeMode && terminalVariant==='vision');
  ui.visionControls.classList.toggle('hidden',!(codeMode && terminalVariant==='vision'));
  ui.visionMapHeader.classList.toggle('hidden',!(codeMode && terminalVariant==='vision'));
  ui.codeSidebarTitle.firstChild.textContent=terminalVariant==='vision'?'// CODE TERMINAL ':'// CODE MENU ';
  document.body.classList.toggle('terminal-active',codeMode);
  renderCodeRoster();
  ui.privateName.textContent = peer(target)?.name || 'name';
  const livePeer=priv?peer(target):null;
  ui.privateLive.classList.toggle('hidden',!livePeer?.live || onMap);
  ui.chatStatus.textContent = priv ? `private: ${peer(target)?.name||''}` : 'public chat';
  ui.mapVisibility.textContent = priv ? `private • ${peer(target)?.name||'name'}` : 'public • all six';
  if (myId) updateLiveControls();
}
function renderRoster() {
  ui.usersNav.replaceChildren();
  for (let i=0; i<6; i++) {
    const person=roster[i];
    const label = person ? person.name : 'name';
    const btn=create('button','person-tab'+(person?.id === myId ? ' is-me' : '')+(!person ? ' is-empty':''));
    btn.type='button';
    if(person?.avatar){const pic=create('img','person-avatar');pic.src=person.avatar;pic.alt='';pic.decoding='async';btn.append(pic);}
    btn.append(create('span','person-name',label));
    if(person) {
      const indicator=create('span','person-subline'+(person.live?' live-indicator':''),person.live?'LIVE · watch':'');
      btn.append(indicator);
      btn.title=person.live ? `${person.name} is LIVE. Tap LIVE to watch.` : person.id===myId ? 'Public chat' : `Private chat with ${person.name}`;
      btn.addEventListener('click',event=>{
        if(person.live && event.target.closest('.live-indicator')){openLiveFor(person.id);return;}
        openConversation(person.id === myId ? 'public' : person.id);
      });
    } else { btn.disabled=true;btn.title='Waiting for another person'; }
    ui.usersNav.append(btn);
  }
  if(target !== 'public' && !peer(target)) {
    target='public';onMap=false;resetTool();loadConversation();
  }
  if(!myId) ui.slotText.textContent=`${roster.length} / 6 people online`;
  displayHeader();
}
function renderMessages() {
  ui.messages.replaceChildren();
  if(messages.length===0) { ui.messages.append(create('div','empty-chat','chat')); return; }
  for(const msg of messages) {
    const own = msg.userId === myId;
    const row=create('div','message'+(own?' own':''));
    row.append(create('div','sender',own?'you':msg.name));
    if(msg.type==='photo' && typeof msg.photo==='string'){
      const bubble=create('div','bubble photo-bubble');
      const image=create('img','chat-photo');
      image.src=msg.photo;image.alt=`Photo from ${msg.name}`;image.loading='lazy';
      image.addEventListener('click',()=>openImage(msg.photo,msg.name));
      bubble.append(image);
      if(msg.caption) bubble.append(create('div','photo-caption',msg.caption));
      row.append(bubble);
    } else if(msg.type==='map') {
      const box=create('div','bubble map-chat-preview');
      const name=msg.kind==='report'?'MEDIA REPORT':msg.kind==='voice'?'VOICE MARK':msg.kind==='path'?'MAP PATH':'QUICK MARK';
      const preview=create('button','map-message-link',`MAP PREVIEW / ${name} / ${msg.priority===1?'1 • IMPORTANT':'2 • LESS IMPORTANT'} / ${msg.text||'Open map item'}`);
      preview.type='button';
      preview.addEventListener('click',()=>{
        if(!annotations.some(a=>a.id===msg.markId)){toast('This map item is no longer available.');return;}
        enterMap();
        setTimeout(()=>window.ASEMap?.focusItem?.(msg.markId),80);
      });
      box.append(preview);row.append(box);
    } else {
      row.append(create('div','bubble',msg.text));
    }
    row.append(create('div','time',time(msg.time)));
    ui.messages.append(row);
  }
  ui.messages.scrollTop=ui.messages.scrollHeight;
}
function resetTool() {
  toolMode='browse'; draftPoints=[];pendingPoints=[];
  // Do not discard selected media on navigation: a live clip may be waiting for a map tap.
  paintDraft();
}
function loadConversation() {
  const request=++roomRequest;
  socket.emit('room:load',target,(result)=>{
    if(request!==roomRequest)return;
    if(!result?.ok){toast(result?.error||'Cannot open chat');return;}
    messages=result.messages||[];
    annotations=(result.annotations||[]).filter(a=>a.base==='reference');
    window.ASEMap?.setHistory?.(result.history||[]);
    window.ASEMap?.clearMediaCache?.();
    noteOpenId=null;
    currentTrust=result.trust;
    sharedWallpaper=result.wallpaper;
    setWallpaperForCurrentRoom();updateTrustControls();
    renderMessages();renderMap();
  });
}
function openConversation(nextTarget) {
  if(!myId || (nextTarget!=='public' && !peer(nextTarget)))return;
  if(target!==nextTarget)discardSelectedReport();
  if(target!==nextTarget){stopRadio();radioNextAt=0;radioLastFrom=null;}
  target=nextTarget;
  onMap=false;
  resetTool();
  displayHeader();
  loadConversation();
}
function enterMap() {
  stopRadio();
  onMap=true;
  resetTool();
  if(selectedReport)toolMode='report';
  displayHeader();
  renderMap();
}
function leaveMap() {
  onMap=false;
  toggleFilters(false);
  resetTool();
  displayHeader();
}
function pointButton(p,text,draft=false,onClick) {
  const button=create('button','map-pin'+(draft?' draft':''),text);
  button.type='button';
  button.style.left=`${p.x*100}%`;
  button.style.top=`${p.y*100}%`;
  button.addEventListener('click',e=>{e.stopPropagation();if(onClick)onClick();});
  ui.mapPins.append(button);
  return button;
}
function drawPath(points,draft=false) {
  const path=document.createElementNS('http://www.w3.org/2000/svg','path');
  path.setAttribute('d',points.map((p,index)=>`${index?'L':'M'}${(p.x*1000).toFixed(1)} ${(p.y*1000).toFixed(1)}`).join(' '));
  if(draft)path.setAttribute('class','draft');
  ui.mapLines.append(path);
}
function drawArea(points,draft=false,color='#ff4d62') {
  const shape=document.createElementNS('http://www.w3.org/2000/svg','polygon');
  shape.setAttribute('points',points.map(p=>`${(p.x*1000).toFixed(1)},${(p.y*1000).toFixed(1)}`).join(' '));
  shape.setAttribute('class',draft?'ase-area-polygon draft':'ase-area-polygon');
  shape.setAttribute('fill',color);shape.setAttribute('stroke',color);
  shape.setAttribute('stroke-width','2.8');shape.setAttribute('fill-opacity','.17');
  ui.mapLines.append(shape);
}
function areaCenter(points){const sum=points.reduce((acc,p)=>({x:acc.x+p.x,y:acc.y+p.y}),{x:0,y:0});return {x:sum.x/points.length,y:sum.y/points.length};}
function showNote(item) {
  noteOpenId = noteOpenId===item.id ? null : item.id;
  paintMap();
  window.ASECreatorView?.showMark(item);
}
function paintMap() {
  ui.mapLines.replaceChildren();
  ui.mapPins.replaceChildren();
  for(const a of annotations) {
    if(codeMode && terminalVariant==='vision' && a.kind==='report' && reportAgeMinutes!=='all' && Date.now()-Number(a.time)>Number(reportAgeMinutes)*60000)continue;
    if(a.kind==='path'){drawPath(a.points);const line=ui.mapLines.lastElementChild;if(line)line.dataset.mapTime=String(a.time);}
    if(a.kind==='area'){drawArea(a.points,false,a.color||'#ff4d62');const area=ui.mapLines.lastElementChild;if(area)area.dataset.mapTime=String(a.time);}
    (a.kind==='area'?[areaCenter(a.points)]:a.points).forEach((p,i)=>{
      const report=a.kind==='report';
      const label=report ? (a.mediaKind==='video'?'V':'P') : a.kind==='area'?'A':a.kind==='voice'?'V':a.kind==='pin'?'M':String(i+1);
      const button=pointButton(p,label,false,()=>report ? openReportViewer(a) : showNote(a));
      button.dataset.mapTime=String(a.time);
      button.classList.add(a.priority===2?'time-lens-small':'time-lens-major');
      if(report){button.classList.add('report-pin');button.setAttribute('aria-label',`Open ${a.mediaKind} report from ${a.name}`);}
    });
    if(noteOpenId===a.id && a.kind!=='report') {
      const point=a.points[Math.floor((a.points.length-1)/2)];
      const tip=create('div','map-note');
      tip.textContent=a.note|| (a.kind==='pin'?'marked area':'saved path');
      tip.append(create('small','',`— ${a.name} · ${reportClockLabel(a.time)} · ${a.priority===1?'1 IMPORTANT':'2 LESS IMPORTANT'}`));
      tip.style.left=`${Math.min(78,Math.max(22,point.x*100))}%`;
      tip.style.top=`${Math.min(80,Math.max(7,point.y*100+4))}%`;
      tip.setAttribute('role','note');
      ui.mapPins.append(tip);
    }
  }
  paintDraft();
  window.ASEMap?.decorateMap?.();
}
function paintDraft() {
  ui.pinButton.classList.toggle('active',toolMode==='pin');
  window.ASEExtras?.refreshAreaButton?.();
  ui.pathButton.classList.toggle('active',toolMode==='path');
  ui.mapPhotoButton.classList.toggle('active',toolMode==='report' && selectedReport?.kind==='photo');
  ui.mapVideoButton.classList.toggle('active',toolMode==='report' && selectedReport?.kind==='video');
  ui.draftActions.classList.toggle('hidden',!['path','area'].includes(toolMode));
  ui.draftCount.textContent=`${draftPoints.length} point${draftPoints.length===1?'':'s'}`;
  ui.finishPath.disabled=draftPoints.length<(toolMode==='area'?3:2);
  ui.finishPath.textContent=toolMode==='area'?'SAVE AREA':'FINISH PATH';
  ui.mapHelp.textContent=toolMode==='pin'?'tap the image to place a marker':toolMode==='path'?'tap to add points, then finish':toolMode==='area'?'tap 3+ corners to outline an area; SAVE AREA when ready':toolMode==='report'?'tap the picture to place your photo/video report':'tap mark, path, photo or video';
  ui.mapPins.querySelectorAll('.draft').forEach(n=>n.remove());
  ui.mapLines.querySelectorAll('.draft').forEach(n=>n.remove());
  if(draftPoints.length>1&&toolMode==='path')drawPath(draftPoints,true);
  if(draftPoints.length>2&&toolMode==='area')drawArea(draftPoints,true);
  draftPoints.forEach((p,i)=>pointButton(p,String(i+1),true));
}
function reportClockLabel(timestamp){
  const d=new Date(Number(timestamp)||Date.now());
  if(Number.isNaN(d.getTime()))return 'UNKNOWN TIME';
  return d.toLocaleDateString([],{year:'numeric',month:'2-digit',day:'2-digit'})+' '+d.toLocaleTimeString([],{hour12:false});
}
function reportAgeLabel(timestamp){
  const min=Math.max(0,Math.floor((Date.now()-Number(timestamp))/60000));
  return min<1?'JUST NOW':min<60?min+'m AGO':min<1440?Math.floor(min/60)+'h AGO':Math.floor(min/1440)+'d AGO';
}
function renderMap() {
  paintMap();
  const marks=annotations.filter(a=>a.kind!=='report');
  const reports=annotations.filter(a=>a.kind==='report' && (reportAgeMinutes==='all' || (Date.now()-Number(a.time))<=Number(reportAgeMinutes)*60000));
  ui.annotationCount.textContent=`${annotations.length} saved`;
  ui.marksCount.textContent=String(marks.length);
  ui.reportsCount.textContent=String(reports.length);
  for(const name of ['marks','reports']){
    const button=ui[name+'Tab'];
    const active=mapListTab===name;
    button.classList.toggle('active',active);
    button.setAttribute('aria-selected',String(active));
  }
  ui.annotationList.replaceChildren();
  const items=mapListTab==='reports'?reports:marks;
  if(!items.length) {
    ui.annotationList.append(create('span','annotation-empty',mapListTab==='reports'?'no photo/video reports yet':'no marks or paths yet'));
    window.ASEMap?.decorateList?.();
  window.ASEExtras?.updateSearch?.();
    window.ASEExtras?.updateSearch?.();
    return;
  }
  for(const a of [...items].reverse()) {
    const row=create('div','annotation-row');
    const report=a.kind==='report';
    const prefix=report?(a.mediaKind==='video'?'VIDEO':'PHOTO'):(a.kind==='pin'?'MARK':a.kind==='area'?'AREA':a.kind==='voice'?'VOICE':'PATH');
    const open=create('button','annotation-open',`${prefix} [${a.priority===1?'1 IMPORTANT':'2 LOW'}] ${a.note|| (report?'view report':'path')} · ${a.name} · ${reportClockLabel(a.time)}`);
    open.type='button';open.title=report?'View photo or play video':'Show mark on map';
    open.addEventListener('click',()=>{
      if(report)openReportViewer(a);
      else {noteOpenId=a.id;paintMap();window.ASECreatorView?.showMark(a);}
    });
    row.append(open);
    if(a.userId===myId){
      const del=create('button','annotation-remove','×');del.type='button';
      del.title='Delete your map item';
      del.addEventListener('click',()=>socket.emit('map:delete',{to:target,id:a.id},r=>{if(!r?.ok)toast(r?.error||'Could not delete');}));
      row.append(del);
    }
    // Cross-player confirmation: author requests, another room participant approves.
    if(a.missionRequestedBy){
      const pending=create('span','mission-pending',`CONFIRMATION REQUESTED BY ${a.missionRequestedName||a.name}`);
      row.append(pending);
    }
    if(a.userId===myId&&!a.missionRequestedBy){
      const req=create('button','mission-request-button','request mission confirmation');req.type='button';
      req.addEventListener('click',()=>socket.emit('map:mission:request',{to:target,id:a.id},r=>toast(r?.ok?'Another player must confirm before this mark disappears.':r?.error||'Request failed.')));
      row.append(req);
    }else if(a.missionRequestedBy&&a.userId!==myId&&a.missionRequestedBy!==myId){
      const confirm=create('button','mission-confirm-button','confirm mission · remove mark');confirm.type='button';
      confirm.addEventListener('click',()=>socket.emit('map:mission:confirm',{to:target,id:a.id},r=>toast(r?.ok?'Mission confirmed. Mark removed from this chat.':r?.error||'Unable to confirm.')));
      row.append(confirm);
    }
    ui.annotationList.append(row);
  }
  window.ASEMap?.decorateList?.();
  window.ASEExtras?.updateSearch?.();
  window.ASEExtras?.updateSearch?.();
}
function setTool(mode) {
  toolMode=toolMode===mode?'browse':mode;
  if(toolMode!=='browse')window.ASEMap?.setPanMode?.(false);
  draftPoints=[];
  paintMap();
}
function canvasClicked(event) {
  if(toolMode==='browse' || event.target.closest('.map-pin') || event.target.closest('.map-note'))return;
  if(window.ASEMap?.ignoreTap?.())return;
  const p=window.ASEMap?.pointFromClient?.(event.clientX,event.clientY) || (()=>{
    const bounds=ui.mapCanvas.getBoundingClientRect();
    return {x:Math.max(0,Math.min(1,(event.clientX-bounds.left)/bounds.width)),y:Math.max(0,Math.min(1,(event.clientY-bounds.top)/bounds.height))};
  })();
  useMapPoint(p);
}
function useMapPoint(p){
  if(toolMode==='emergency') {
    emergencyPoint=p;
    openEmergencyDialog();
  } else if(toolMode==='quick-pin') {
    window.ASEMap?.quickPlace?.(p);
  } else if(toolMode==='voice') {
    pendingPoints=[p];pendingType='voice';ui.noteTitle.textContent='voice marker message';ui.noteInput.value='';
    ui.noteDialog.showModal();
  } else if(toolMode==='report') {
    if(!selectedReport){toast('Choose a photo or video first.');return;}
    reportPoint=p;showReportEditor();
  } else if(toolMode==='pin'){
    pendingPoints=[p];pendingType='pin';ui.noteTitle.textContent='marker message';ui.noteInput.value='';
    ui.noteDialog.showModal();
  } else if (toolMode==='path' || toolMode==='area') {
    if(draftPoints.length>=30){toast('Maximum 30 points');return;}
    draftPoints.push(p);
    paintMap();
  }
}
function saveMapItem(){
  const points=[...pendingPoints],kind=pendingType,note=ui.noteInput.value.trim();
  const meta=window.ASEMap?.getSettings?.()||{};
  ui.noteDialog.close();resetTool();
  if(kind==='voice'){
    window.ASEMap?.saveVoice?.(points,note,meta);
    return;
  }
  socket.emit('map:add',{to:target,base:'reference',kind,points,note,...meta},result=>{
    if(!result?.ok)toast(result?.error||'Could not save map item');
  });
}


// Hold-to-talk radio for the CURRENT public or private chat. Mic capture begins
// only after a press and browser permission, ends on release/blur/room change.
// It uses short 16-kHz PCM packets for simple cross-browser near-real-time audio.
const RADIO_HZ=16000,RADIO_PACKET=2048;
let radioPress=null,radioSending=null,radioReceiverCtx=null,radioNextAt=0,radioLastFrom=null;
let radioAudioPromptShown=false;
function createListenContext(){
  const Ctx=window.AudioContext||window.webkitAudioContext;
  if(!Ctx)return null;
  if(!radioReceiverCtx)radioReceiverCtx=new Ctx();
  radioReceiverCtx.resume().catch(()=>{});
  return radioReceiverCtx;
}
// Voice processing stays client-side until encoded as short PCM radio packets.
// Distinct from the 10 call-voice effects and the camera color filters.
const RADIO_MODES=new Set(['clean','comms','bass','bright','robot','echo','tunnel','crunch','muffled','distant']);
try{const preset=localStorage.getItem('aseRadioEffect');if(RADIO_MODES.has(preset))ui.radioEffectSelect.value=preset;
  ui.radioChirps.checked=localStorage.getItem('aseRadioChirps')!=='off';}catch(_e){}
ui.radioEffectSelect.addEventListener('change',()=>{
  try{localStorage.setItem('aseRadioEffect',ui.radioEffectSelect.value);}catch(_e){}
  if(radioSending)toast('New radio voice effect applies on the next transmission.');
});
ui.radioChirps.addEventListener('change',()=>{
  try{localStorage.setItem('aseRadioChirps',ui.radioChirps.checked?'on':'off');}catch(_e){}
});
function chirpRadio(direction='start'){
  if(!ui.radioChirps.checked)return;
  if(window.ASESound){window.ASESound.play(direction==='start'?'radio':'radio_stop');return;}
  const ctx=createListenContext();if(!ctx)return;
  try{
    const osc=ctx.createOscillator(),amp=ctx.createGain(),t=ctx.currentTime;
    osc.type='sine';osc.frequency.setValueAtTime(direction==='start'?880:640,t);
    osc.frequency.exponentialRampToValueAtTime(direction==='start'?1050:430,t+.075);
    amp.gain.setValueAtTime(0,t);amp.gain.linearRampToValueAtTime(.065,t+.009);
    amp.gain.exponentialRampToValueAtTime(.001,t+.095);
    osc.connect(amp);amp.connect(ctx.destination);osc.start(t);osc.stop(t+.105);
  }catch(_e){}
}
// Web Audio effects are inserted between the microphone and the PCM encoder.
// All graph nodes and oscillators are shut down when the radio is released.
function buildRadioVoiceGraph(ctx,source,processor,mode){
  const created=[],oscillators=[];
  const filter=(kind,freq,q)=>{const n=ctx.createBiquadFilter();n.type=kind;n.frequency.value=freq;
    if(q!==undefined)n.Q.value=q;created.push(n);return n;};
  const gain=(amount)=>{const n=ctx.createGain();n.gain.value=amount;created.push(n);return n;};
  const chain=(...nodes)=>{for(let i=0;i<nodes.length-1;i++)nodes[i].connect(nodes[i+1]);};
  const drive=(strength)=>{const n=ctx.createWaveShaper(),curve=new Float32Array(1024);
    for(let i=0;i<curve.length;i++){const x=2*i/(curve.length-1)-1;curve[i]=Math.tanh(x*strength)/Math.tanh(strength);}
    n.curve=curve;n.oversample='2x';created.push(n);return n;};
  if(mode==='comms')chain(source,filter('highpass',360),filter('lowpass',2900),drive(1.35),gain(.83),processor);
  else if(mode==='bass')chain(source,filter('lowshelf',330),filter('lowpass',4200),processor),created[0].gain.value=9;
  else if(mode==='bright')chain(source,filter('highpass',180),filter('highshelf',2300),processor),created[1].gain.value=9;
  else if(mode==='robot'){
    const ring=gain(.55);const mod=ctx.createOscillator();mod.type='sine';mod.frequency.value=42;
    const modLevel=gain(.42);mod.connect(modLevel);modLevel.connect(ring.gain);mod.start();oscillators.push(mod);
    chain(source,filter('highpass',160),ring,filter('lowpass',3900),processor);
  }
  else if(mode==='echo'||mode==='tunnel'){
    const dry=gain(mode==='echo'?.8:.65),wet=gain(mode==='echo'?.30:.34);
    const delay=ctx.createDelay(.6);delay.delayTime.value=mode==='echo'?.20:.11;created.push(delay);
    const feedback=gain(mode==='echo'?.22:.30);
    source.connect(dry);dry.connect(processor);
    source.connect(delay);delay.connect(wet);wet.connect(processor);
    delay.connect(feedback);feedback.connect(delay);
    if(mode==='tunnel'){const low=filter('lowpass',1800);source.disconnect(dry);source.disconnect(delay);
      source.connect(low);low.connect(dry);low.connect(delay);}
  }
  else if(mode==='crunch')chain(source,filter('highpass',190),drive(2.7),gain(.62),filter('lowpass',4700),processor);
  else if(mode==='muffled')chain(source,filter('lowpass',1150),gain(1.15),processor);
  else if(mode==='distant')chain(source,filter('bandpass',900,.65),gain(1.8),processor);
  else source.connect(processor);
  return ()=>{
    try{source.disconnect();}catch(_e){}
    for(const n of created){try{n.disconnect();}catch(_e){}}
    for(const o of oscillators){try{o.stop();o.disconnect();}catch(_e){}}
  };
}
ui.radioListenButton.addEventListener('click',()=>{
  if(!createListenContext()){toast('Radio audio is not supported in this browser.');return;}
  ui.radioListenButton.textContent='listen on';
  toast('Radio listening enabled');
});
function resetRadioStatus(){
  ui.radioStatus.textContent='';
  ui.radioHoldButton.classList.remove('transmitting');
  ui.radioHoldButton.textContent='RADIO';
}
function stopRadio(){
  if(radioHotkeyTimeout){clearTimeout(radioHotkeyTimeout);radioHotkeyTimeout=null;}
  if(radioPress)radioPress.held=false;
  radioPress=null;
  const active=radioSending;radioSending=null;
  if(active){
    socket.emit('radio:stop',{to:active.to});
    chirpRadio('stop');
    try{active.cleanupEffect?.();active.source.disconnect();active.processor.disconnect();active.sink.disconnect();}catch(_e){}
    active.stream.getTracks().forEach(t=>t.stop());
    active.context.close().catch(()=>{});
  }
  resetRadioStatus();
}
async function beginRadio(press){
  if(!myId||!socket.connected)return;
  if(radioSending||callSession||isBroadcasting){toast('Finish your call or live video before using radio.');return;}
  if(!navigator.mediaDevices?.getUserMedia){toast('Mic needs an HTTPS page and browser permission.');return;}
  const chosen=target;
  ui.radioStatus.textContent='requesting microphone…';
  let stream=null,context=null;
  try{
    // Permission prompt can outlast the finger press; never transmit afterward.
    stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
    if(!press.held||radioPress!==press||chosen!==target||!socket.connected){stream.getTracks().forEach(t=>t.stop());return;}
    const response=await new Promise(resolve=>socket.timeout(4000).emit('radio:start',{to:chosen},(err,data)=>resolve(err?{ok:false,error:'Radio connection timed out.'}:data)));
    if(!response?.ok)throw Error(response?.error||'Radio is busy.');
    if(!press.held||radioPress!==press||chosen!==target){socket.emit('radio:stop',{to:chosen});stream.getTracks().forEach(t=>t.stop());return;}
    const Ctx=window.AudioContext||window.webkitAudioContext;
    if(!Ctx)throw Error('Live audio is unavailable on this browser.');
    context=new Ctx();await context.resume();
    if(!press.held||radioPress!==press||chosen!==target){socket.emit('radio:stop',{to:chosen});stream.getTracks().forEach(t=>t.stop());context.close().catch(()=>{});return;}
    const source=context.createMediaStreamSource(stream);
    const processor=context.createScriptProcessor(2048,1,1); // fallback-friendly for iOS/Android
    const sink=context.createGain();sink.gain.value=0;
    const cleanupEffect=buildRadioVoiceGraph(context,source,processor,ui.radioEffectSelect.value);
    processor.connect(sink);sink.connect(context.destination);
    const active={stream,context,source,processor,sink,cleanupEffect,to:chosen};radioSending=active;
    const packet=new Int16Array(RADIO_PACKET);let used=0,phase=0;
    processor.onaudioprocess=event=>{
      if(radioSending!==active||!press.held)return;
      const input=event.inputBuffer.getChannelData(0),increment=RADIO_HZ/context.sampleRate;
      for(let i=0;i<input.length;i++){
        phase+=increment;
        if(phase<1)continue;
        phase-=1;
        const sample=Math.max(-1,Math.min(1,input[i]));
        packet[used++]=Math.round(sample<0?sample*32768:sample*32767);
        if(used===RADIO_PACKET){
          socket.emit('radio:chunk',{to:chosen,room:response.room,samples:packet.buffer.slice(0)});
          used=0;
        }
      }
    };
    chirpRadio('start');
    ui.radioHoldButton.textContent='LIVE';ui.radioHoldButton.classList.add('transmitting');
    ui.radioStatus.textContent='TRANSMITTING • release to stop';
  }catch(err){
    if(stream)stream.getTracks().forEach(t=>t.stop());
    if(context)context.close().catch(()=>{});
    if(radioSending?.stream===stream){radioSending.cleanupEffect?.();radioSending=null;}
    socket.emit('radio:stop',{to:chosen});
    if(radioPress===press){radioPress=null;resetRadioStatus();toast(err.message||'Could not start radio.');}
  }
}
ui.radioHoldButton.addEventListener('pointerdown',event=>{
  if(event.button!==0 || radioPress)return;
  event.preventDefault();
  const press={held:true,id:event.pointerId};radioPress=press;
  try{ui.radioHoldButton.setPointerCapture(event.pointerId);}catch(_e){}
  beginRadio(press);
});
for(const type of ['pointerup','pointercancel','lostpointercapture']){
  ui.radioHoldButton.addEventListener(type,event=>{if(radioPress?.id===event.pointerId)stopRadio();});
}
ui.radioHoldButton.addEventListener('contextmenu',e=>e.preventDefault());
// Keyboard access: hold Space or Enter just as you hold the touch button.
ui.radioHoldButton.addEventListener('keydown',event=>{
  if((event.key===' '||event.key==='Enter')&&!event.repeat&&!radioPress){
    event.preventDefault();const press={held:true,id:'keyboard'};radioPress=press;beginRadio(press);
  }
});
ui.radioHoldButton.addEventListener('keyup',event=>{
  if((event.key===' '||event.key==='Enter')&&radioPress?.id==='keyboard'){event.preventDefault();stopRadio();}
});
// Phone hardware volume keys normally belong to Android/iOS, not webpages.
// This conditional support activates ONLY when the browser actually forwards
// BOTH keydown and keyup events; a 12s safety timeout prevents a stuck hot mic.
let radioHotkeyTimeout=null;
function endRadioHotkey(){if(radioHotkeyTimeout){clearTimeout(radioHotkeyTimeout);radioHotkeyTimeout=null;}stopRadio();}
function isTypingFocus(){const el=document.activeElement;
  return !!el&&(el.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(el.tagName));}
function radioShortcut(event){
  const volume=event.key==='AudioVolumeUp'||event.key==='VolumeUp'||event.code==='AudioVolumeUp'||event.keyCode===175;
  const keyboardR=event.code==='KeyR'&&!event.ctrlKey&&!event.metaKey&&!event.altKey;
  return volume?'volume':keyboardR?'shortcut':null;
}
window.addEventListener('keydown',event=>{
  const key=radioShortcut(event);
  if(!key||event.repeat||radioPress||!myId||ui.chatScreen.classList.contains('hidden')||
     ui.mainScreen.classList.contains('hidden')||isTypingFocus()||
     document.querySelector('dialog[open]'))return;
  // Even if a volume key event is received, most mobile browsers won't supply keyup.
  event.preventDefault();
  const press={held:true,id:'hotkey-'+key};radioPress=press;
  beginRadio(press);
  if(key==='volume')radioHotkeyTimeout=setTimeout(()=>{if(radioPress===press)endRadioHotkey();},12000);
});
window.addEventListener('keyup',event=>{
  const key=radioShortcut(event);
  if(key&&radioPress?.id==='hotkey-'+key){event.preventDefault();endRadioHotkey();}
});
window.addEventListener('blur',stopRadio);
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopRadio();});
window.addEventListener('pagehide',stopRadio);
socket.on('radio:started',data=>{
  if(!isCurrentRoom(data.room)||data.userId===myId)return;
  radioLastFrom=data.userId;
  chirpRadio('start');
  ui.radioStatus.textContent=` ${data.name||'Someone'} talking…`;
});
socket.on('radio:stopped',data=>{
  if(radioLastFrom===data.userId && isCurrentRoom(data.room)){
    radioLastFrom=null;chirpRadio('stop');if(!radioSending)resetRadioStatus();
  }
});
socket.on('radio:chunk',data=>{
  if(!isCurrentRoom(data.room)||data.userId===myId)return;
  if(!radioReceiverCtx || radioReceiverCtx.state!=='running'){
    if(!radioAudioPromptShown){radioAudioPromptShown=true;ui.radioStatus.textContent='Tap listen to hear radio';}
    return;
  }
  const samples=data.samples;
  if(!samples)return;
  const bytes=samples instanceof ArrayBuffer?new Uint8Array(samples):
    (ArrayBuffer.isView(samples)?new Uint8Array(samples.buffer,samples.byteOffset,samples.byteLength):null);
  if(!bytes||bytes.byteLength>8192||bytes.byteLength<2||bytes.byteLength%2!==0)return;
  const count=bytes.byteLength/2,buffer=radioReceiverCtx.createBuffer(1,count,RADIO_HZ),dst=buffer.getChannelData(0),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  for(let i=0;i<count;i++)dst[i]=view.getInt16(i*2,true)/32768;
  const src=radioReceiverCtx.createBufferSource();src.buffer=buffer;src.connect(radioReceiverCtx.destination);
  const now=radioReceiverCtx.currentTime;
  if(!radioNextAt || radioNextAt<now-.1 || radioNextAt>now+.8)radioNextAt=now+.10;
  src.start(Math.max(now,radioNextAt));radioNextAt=Math.max(now,radioNextAt)+buffer.duration;
});

ui.joinForm.addEventListener('submit',e=>{
  e.preventDefault();
  // This user gesture makes incoming audio playable on more mobile browsers.
  createListenContext();
  if(!socket.connected){ui.joinError.textContent='Not connected yet. Try again.';return;}
  socket.emit('join',ui.nameInput.value,result=>{
    if(!result?.ok){ui.joinError.textContent=result?.error||'Cannot join';return;}
    myId=result.id;
    ui.joinScreen.classList.add('hidden');
    ui.mainScreen.classList.remove('hidden');
    if(!roster.some(u=>u.id===myId))roster=[...roster,{id:myId,name:result.name}];
    renderRoster();openConversation('public');
  });
});
ui.backFromPrivate.addEventListener('click',()=>openConversation('public'));
ui.mapOpen.addEventListener('click',enterMap);
ui.backFromMap.addEventListener('click',leaveMap);
// Chat slash codes are local UI commands: never broadcast them as messages.
ui.messageForm.addEventListener('submit',event=>{
  const cmd=ui.messageInput.value.trim().toUpperCase();
  if(cmd==='//CODEWALL' || cmd==='//CODEMENU' || cmd==='//CODETERMINAL'){
    event.preventDefault();event.stopImmediatePropagation();
    ui.messageInput.value='';
    if(cmd==='//CODEWALL')unlockWalls();
    else toggleCodeMode(!(codeMode && terminalVariant===(cmd==='//CODEMENU'?'command':'vision')),cmd==='//CODEMENU'?'command':'vision');
  }
},true);
ui.messageForm.addEventListener('submit',e=>{
  e.preventDefault();
  const text=ui.messageInput.value.trim();
  if(!text)return;
  socket.emit('message:send',{to:target,text},result=>{if(!result?.ok)toast(result?.error||'Message not sent');});
  ui.messageInput.value='';ui.messageInput.focus();
});
ui.pinButton.addEventListener('click',()=>{toggleFilters(false);discardSelectedReport();setTool('pin');});
ui.pathButton.addEventListener('click',()=>{toggleFilters(false);discardSelectedReport();setTool('path');});
ui.filtersButton.addEventListener('click',()=>toggleFilters(ui.filtersPanel.classList.contains('hidden')));
ui.closeFilters.addEventListener('click',()=>toggleFilters(false));
for(const name of Object.keys(filterDefaults)){
  ui[name+'Slider'].addEventListener('input',event=>{
    screenFilters[name]=clampFilter(name,event.target.value);
    applyScreenFilters();
    saveScreenFilters();
  });
}
ui.resetFilters.addEventListener('click',()=>{
  Object.assign(screenFilters,filterDefaults);
  applyScreenFilters();
  saveScreenFilters();
});
ui.mapCanvas.addEventListener('click',canvasClicked);
ui.undoPoint.addEventListener('click',()=>{draftPoints.pop();paintMap();});
ui.cancelDraft.addEventListener('click',resetTool);
ui.finishPath.addEventListener('click',()=>{
  if(draftPoints.length<(toolMode==='area'?3:2))return;
  pendingPoints=[...draftPoints];pendingType=toolMode==='area'?'area':'path';
  ui.noteInput.value='';ui.noteTitle.textContent=toolMode==='area'?'area label':'path message';ui.noteDialog.showModal();
});
ui.noteForm.addEventListener('submit',e=>{e.preventDefault();saveMapItem();});
ui.cancelNote.addEventListener('click',()=>ui.noteDialog.close());
ui.noteDialog.addEventListener('close',()=>{pendingPoints=[];});

socket.on('connect',()=>{
  ui.connectionStatus.textContent='online';
  if(myId){
    // Socket IDs change after a reconnect; rejoining is required to restore access permissions.
    myId=null;roster=[];target='public';onMap=false;
    ui.mainScreen.classList.add('hidden');ui.joinScreen.classList.remove('hidden');
    ui.joinError.textContent='Connection restored. Enter your name again.';
  }
});
socket.on('disconnect',()=>{simFinish('Offline. The simulation has stopped.',false);cleanupLiveOnDisconnect();ui.connectionStatus.textContent='offline';ui.joinError.textContent='Disconnected. Checking connection…';});
socket.on('users',list=>{
  roster=Array.isArray(list)?list:[];
  ui.slotText.textContent=`${roster.length} / 6 people online`;
  if(myId)renderRoster();
  simUpdateTargets();
  updateLiveControls();
});
socket.on('message:new',({room,item})=>{
  if(isCurrentRoom(room)){
    if(!messages.some(m=>m.id===item.id)){messages.push(item);renderMessages();}
  }else if(myId&&room.startsWith('dm:')&&room.split(':').includes(myId))toast(`Private message from ${item.name}`);
});
socket.on('map:new',({room,item})=>{
  if(isCurrentRoom(room)) window.ASESound?.onNewMarker?.(item);
  if(isCurrentRoom(room)){
    if(item.base==='reference'&&!annotations.some(a=>a.id===item.id)){
      annotations.push(item);renderMap();
    }
  }else if(myId&&room.startsWith('dm:')&&room.split(':').includes(myId))toast(`Private map item from ${item.name}`);
});
socket.on('map:removed',({room,id})=>{
  if(!isCurrentRoom(room))return;
  annotations=annotations.filter(a=>a.id!==id);
  window.ASEMap?.clearItemMedia?.(id);
  if(noteOpenId===id)noteOpenId=null;
  renderMap();
});
socket.on('map:updated',({room,item})=>{
  if(!isCurrentRoom(room))return;
  const ix=annotations.findIndex(a=>a.id===item.id);
  const newlyRequested=ix>=0&&!annotations[ix].missionRequestedBy&&Boolean(item.missionRequestedBy);
  if(ix>=0)annotations[ix]=item;
  renderMap();
  if(newlyRequested&&item.userId!==myId)toast(`${item.name} requested a second player to confirm mission completion.`);
});
socket.on('map:history:new',({room,event})=>{
  if(isCurrentRoom(room))window.ASEMap?.appendHistory?.(event);
});

// Opt-in cybersecurity training puzzle. The preview is authored fiction; never a private-room fetch.
let simActive=null,simProbeData=null,simCountdownTimer=null,simAlarmTimer=null,simSquareTimer=null;
let simAudioContext=null,simAlarmNodes=[];
function simAudio(){
  try{simAudioContext ||= new (window.AudioContext||window.webkitAudioContext)();
    if(simAudioContext.state==='suspended')simAudioContext.resume().catch(()=>{});
    return simAudioContext;
  }catch(_error){return null;}
}
function simTone(type,frequency,duration=0.11,volume=0.035){
  if(!ui.simSound.checked)return;
  if(window.ASESound){window.ASESound.play(frequency<350?'failure':frequency>800?'success':'terminal');return;}
  const ctx=simAudio();if(!ctx)return;
  try{
    const osc=ctx.createOscillator(),gain=ctx.createGain(),t=ctx.currentTime;
    osc.type=type;osc.frequency.setValueAtTime(frequency,t);
    gain.gain.setValueAtTime(volume,t);gain.gain.exponentialRampToValueAtTime(.0001,t+duration);
    osc.connect(gain).connect(ctx.destination);osc.start(t);osc.stop(t+duration);
  }catch(_error){}
}
function stopSimSquare(){if(simSquareTimer){clearInterval(simSquareTimer);simSquareTimer=null;}}
function startSimSquare(){
  stopSimSquare();if(!ui.simSound.checked)return;
  simTone('square',580);
  simSquareTimer=setInterval(()=>simTone('square',580),850);
}
function playSimAlarm(){
  if(!ui.simSound.checked)return;
  if(window.ASESound){window.ASESound.play('emergency');return;}
  // Sine and sawtooth played together briefly, never microphone/camera access.
  const ctx=simAudio();if(!ctx)return;
  try{
    for(const [type,hz] of [['sine',740],['sawtooth',190]]){
      const osc=ctx.createOscillator(),gain=ctx.createGain(),t=ctx.currentTime;
      osc.type=type;osc.frequency.setValueAtTime(hz,t);
      gain.gain.setValueAtTime(.0001,t);
      gain.gain.linearRampToValueAtTime(type==='sine'?.065:.02,t+.12);
      gain.gain.linearRampToValueAtTime(.0001,t+2.9);
      osc.connect(gain).connect(ctx.destination);osc.start(t);osc.stop(t+3);
      simAlarmNodes.push(osc);
      osc.onended=()=>{simAlarmNodes=simAlarmNodes.filter(x=>x!==osc);};
    }
  }catch(_error){}
}
function simSetOutput(message){ui.simOutput.textContent=message;}
function simSetOpen(open){
  ui.simPanel.classList.toggle('hidden',!open);
  ui.simOpen.setAttribute('aria-expanded',String(open));
  if(!open)stopSimSquare();
}
function simUpdateTargets(){
  const old=ui.simTarget.value;
  ui.simTarget.replaceChildren(new Option('Choose a participant',''));
  for(const person of roster.filter(p=>p.id!==myId)){
    ui.simTarget.add(new Option(`${person.name}${person.simEnabled?' / READY':' / NOT OPTED IN'}`,person.id));
  }
  if(roster.some(p=>p.id===old && p.id!==myId))ui.simTarget.value=old;
  ui.simOptIn.checked=!!peer(myId)?.simEnabled;
  simShowCode();
}
function simShowCode(){
  const p=peer(ui.simTarget.value);
  ui.simCodeHint.textContent=p?.simEnabled ? `SIDE CODE: ${p.simCode}\nTYPE THIS INTO THE ACCESS BOX. Fake IP is revealed after validation.` : 'This participant has not opted in to the training game.';
}
function simResetPreview(){
  if(simCountdownTimer){clearInterval(simCountdownTimer);simCountdownTimer=null;}
  simActive=null;ui.simCountdown.textContent='INACTIVE / 00:00';
  ui.simPreview.replaceChildren();stopSimSquare();
}
function simFinish(message,signalServer=true){
  simResetPreview();simSetOutput(message||'Simulation stopped.');
  if(signalServer&&socket.connected)socket.emit('sim:close');
}
function simTick(){
  if(!simActive)return;
  const remaining=Math.max(0,Math.ceil((simActive.expires-Date.now())/1000));
  ui.simCountdown.textContent=`SIMULATED ACCESS / ${String(Math.floor(remaining/60)).padStart(2,'0')}:${String(remaining%60).padStart(2,'0')}`;
  if(remaining===0)simFinish('60-second fictional access expired.');
}
function simShowIntel(intel){
  simResetPreview();simActive={expires:intel.expires};
  simSetOutput('TRAINING UNLOCKED. Scripted sample messages and fictional markers only. Expires after 60 seconds.');
  const heading=create('div','sim-preview-heading','VIRTUAL CHAT TRANSCRIPT / EXAMPLE DATA');
  ui.simPreview.append(heading);
  for(const message of intel.messages||[]){
    const row=create('div','sim-message');
    row.append(create('strong','',message.name),create('span','',message.text));
    ui.simPreview.append(row);
  }
  ui.simPreview.append(create('div','sim-preview-heading','TRAINING MAP / FAKE MARKS'));
  const map=create('div','sim-sample-map');
  const image=create('img','','');image.src='/map-image.png';image.alt='Reference map used only for fictional marks';
  map.append(image);
  for(const mark of intel.marks||[]){
    const pin=create('div','sim-sample-pin','+');
    pin.style.left=`${mark.x*100}%`;pin.style.top=`${mark.y*100}%`;
    pin.title=mark.label;pin.setAttribute('aria-label',mark.label);
    map.append(pin);
  }
  ui.simPreview.append(map);
  simTick();simCountdownTimer=setInterval(simTick,250);
  stopSimSquare();simTone('square',900,.20);
}
ui.simOpen.addEventListener('click',()=>{simSetOpen(ui.simPanel.classList.contains('hidden'));simUpdateTargets();});
ui.simClose.addEventListener('click',()=>simSetOpen(false));
ui.simTarget.addEventListener('change',()=>{simProbeData=null;ui.simPuzzle.textContent='Request the fake IP again for this node.';simShowCode();});
ui.simSound.addEventListener('change',()=>{if(!ui.simSound.checked)stopSimSquare();});
ui.simOptIn.addEventListener('change',()=>{
  socket.emit('sim:opt',{enabled:ui.simOptIn.checked},r=>{
    if(!r?.ok){ui.simOptIn.checked=!ui.simOptIn.checked;toast(r?.error||'Unable to change setting');}
    else simSetOutput(r.enabled?'Your virtual node accepts training challenges. You may hear an alarm.':'Your node no longer accepts challenges.');
  });
});
ui.simProbe.addEventListener('click',()=>{
  if(!myId)return toast('Join the chat first.');
  const id=ui.simTarget.value;
  if(!id)return simSetOutput('Select another online person.');
  startSimSquare();
  socket.emit('sim:probe',{to:id,code:ui.simCode.value},r=>{
    if(!r?.ok){stopSimSquare();simSetOutput(r?.error||'Access denied.');return;}
    simProbeData={to:id,fakeIp:r.fakeIp,multiplier:r.multiplier,offset:r.offset};
    ui.simPuzzle.textContent=`FAKE IP: ${r.fakeIp}. Find checksum = (third IP octet x ${r.multiplier} + last IP octet + ${r.offset}) mod 997. Enter the fake IP and resulting number.`;
    ui.simFakeIP.value='';ui.simChecksum.value='';
    simSetOutput('Access code accepted. Complete the arithmetic checksum.');
    simTone('square',660,.2);
  });
});
ui.simUnlock.addEventListener('click',()=>{
  if(!simProbeData)return simSetOutput('Request a fake IP first.');
  startSimSquare();
  socket.emit('sim:unlock',{fakeIp:ui.simFakeIP.value,answer:Number(ui.simChecksum.value)},r=>{
    if(!r?.ok){simSetOutput(r?.error||'Challenge failed.');simTone('square',240,.24);return;}
    simShowIntel(r.intel);
  });
});
ui.simStop.addEventListener('click',()=>simFinish('Training stopped.'));
ui.simDismissAlarm.addEventListener('click',()=>{ui.simAlarmBanner.classList.add('hidden');clearTimeout(simAlarmTimer);});
socket.on('sim:alarm',data=>{
  ui.simAlarmText.textContent=`TRAINING ALERT: ${data?.name||'Another participant'} finished your virtual challenge. No private data was accessed.`;
  ui.simAlarmBanner.classList.remove('hidden');
  playSimAlarm();
  clearTimeout(simAlarmTimer);
  simAlarmTimer=setTimeout(()=>ui.simAlarmBanner.classList.add('hidden'),7000);
});
socket.on('sim:closed',data=>simFinish(data?.reason||'Challenge no longer active.',false));

restoreScreenFilters();
renderMap();


// --- In-browser photos, and peer-to-peer live camera broadcasts ---
const rtcConfig={iceServers:[{urls:'stun:stun.l.google.com:19302'}]};
let pendingPhoto=null;
let ownMediaStream=null;
let liveRawStream=null;
let liveCameraFacing='user';
let liveCameraGeneration=0;
let isBroadcasting=false;
let requestedLiveId=null;
let watching=null; // {hostId,pc,pendingIce}
const liveViewers=new Map(); // viewerId -> {pc,pendingIce}

function openImage(dataUrl,name){
  ui.imageTitle.textContent=`photo • ${name}`;
  ui.imageFull.src=dataUrl;
  if(!ui.imageDialog.open)ui.imageDialog.showModal();
}
ui.closeImageDialog.addEventListener('click',()=>ui.imageDialog.close());
ui.imageDialog.addEventListener('close',()=>{ui.imageFull.removeAttribute('src');});

async function preparePhoto(file){
  if(!file || !file.type.startsWith('image/'))throw Error('Choose a photo file.');
  if(file.size>20*1024*1024)throw Error('Photo must be under 20 MB before resizing.');
  const source=URL.createObjectURL(file);
  try{
    const img=new Image();
    await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('The photo cannot be opened in this browser.'));img.src=source;});
    for(const [maxSide,quality] of [[1400,.78],[1150,.72],[950,.66],[800,.60],[650,.52]]){
      const scale=Math.min(1,maxSide/Math.max(img.naturalWidth,img.naturalHeight));
      const canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));
      canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
      const ctx=canvas.getContext('2d');
      if(!ctx)throw Error('This browser cannot process the photo.');
      ctx.drawImage(img,0,0,canvas.width,canvas.height);
      const compressed=canvas.toDataURL('image/jpeg',quality);
      // Canvas conversion strips image metadata, including embedded photo location.
      if(compressed.startsWith('data:image/jpeg;base64,') && compressed.length<=880000)return compressed;
    }
    throw Error('Photo is still too large after resizing.');
  } finally {URL.revokeObjectURL(source);}
}
ui.photoButton.addEventListener('click',()=>{if(!myId){toast('Join the chat first');return;}ui.photoInput.click();});
ui.photoInput.addEventListener('change',async()=>{
  const file=ui.photoInput.files?.[0];ui.photoInput.value='';if(!file)return;
  ui.photoButton.disabled=true;
  try{
    pendingPhoto=await preparePhoto(file);
    ui.photoPreview.src=pendingPhoto;
    ui.photoCaption.value='';
    ui.photoDialog.showModal();
  }catch(error){toast(error.message||'Cannot open photo');}
  finally{ui.photoButton.disabled=false;}
});
function clearPhoto(){pendingPhoto=null;ui.photoPreview.removeAttribute('src');}
ui.closePhotoDialog.addEventListener('click',()=>ui.photoDialog.close());
ui.cancelPhoto.addEventListener('click',()=>ui.photoDialog.close());
ui.photoDialog.addEventListener('close',clearPhoto);
ui.sendPhoto.addEventListener('click',()=>{
  if(!pendingPhoto || !myId || !socket.connected)return;
  ui.sendPhoto.disabled=true;
  const photo=pendingPhoto,caption=ui.photoCaption.value.trim(),to=target;
  socket.timeout(20000).emit('message:photo',{to,photo,caption},(error,result)=>{
    ui.sendPhoto.disabled=false;
    if(error || !result?.ok){toast(result?.error||'Photo could not be sent');return;}
    ui.photoDialog.close();
  });
});

function updateLiveControls(){
  if(!ui.goLiveButton)return;
  ui.goLiveButton.textContent=isBroadcasting?'LIVE • view / stop':' go live';
  ui.goLiveButton.classList.toggle('broadcasting',isBroadcasting);
  ui.liveHint.textContent=isBroadcasting?'camera is broadcasting':'';
}
ui.goLiveButton.addEventListener('click',()=>openLiveFor(myId));
ui.privateLive.addEventListener('click',()=>{if(peer(target)?.live)openLiveFor(target);});

function showLiveDialog(title){
  ui.liveTitle.textContent=title;
  if(!ui.liveDialog.open)ui.liveDialog.showModal();
}
function videoDisplay(stream,muted){
  ui.liveVideo.srcObject=stream;
  ui.liveVideo.muted=muted;
  ui.liveVideo.play().catch(()=>{ui.liveInfo.textContent='Tap the video play button to start watching.';});
}
function clearVideo(){
  ui.liveVideo.pause();ui.liveVideo.srcObject=null;
}
function stopWatching(){
  if(!watching)return;
  const previous=watching;watching=null;
  try{previous.pc.close();}catch(_error){}
  if(socket.connected)socket.emit('live:leave',{hostId:previous.hostId});
  if(!isBroadcasting)clearVideo();
}
function stopLocalStream(){
  isBroadcasting=false;
  for(const {pc} of liveViewers.values())pc.close();
  liveViewers.clear();
  if(ownMediaStream){ownMediaStream.getTracks().forEach(track=>track.stop());ownMediaStream=null;}
  if(liveRawStream){liveRawStream.getTracks().forEach(track=>track.stop());liveRawStream=null;}
  liveCameraPipeline?.dispose();liveCameraPipeline=null;
  ++liveCameraGeneration;
  updateLiveControls();
  if(ui.liveDialog.open && requestedLiveId===myId)clearVideo();
}
function hideLiveDialog(){
  if(requestedLiveId!==myId)stopWatching();
  requestedLiveId=null;
  if(ui.liveDialog.open)ui.liveDialog.close();
  // Closing your own preview NEVER starts or stops broadcasting.
  clearVideo();
}
ui.closeLiveDialog.addEventListener('click',hideLiveDialog);
ui.liveDialog.addEventListener('cancel',event=>{event.preventDefault();hideLiveDialog();});
ui.liveDialog.addEventListener('close',()=>{
  if(requestedLiveId!==null){
    if(requestedLiveId!==myId)stopWatching();
    requestedLiveId=null;
    clearVideo();
  }
});
function openLiveFor(id){
  if(!id || !myId)return;
  if(requestedLiveId!==myId)stopWatching();
  requestedLiveId=id;
  const own=id===myId;
  ui.startLive.classList.toggle('hidden',!own || isBroadcasting);
  ui.stopLive.classList.toggle('hidden',!own || !isBroadcasting);
  ui.microphoneLabel.classList.toggle('hidden',!own || isBroadcasting);
  ui.flipLiveCamera.classList.toggle('hidden',!own || !isBroadcasting);
  ui.liveCameraFilters.classList.toggle('hidden',!own);
  clearVideo();
  if(own){
    showLiveDialog('your live video');
    ui.liveInfo.textContent=isBroadcasting?'You are LIVE. Closing this window keeps your camera live until you press STOP.':'Camera and optional microphone begin only after you press START.';
    if(ownMediaStream){videoDisplay(ownMediaStream,true);ui.liveVideo.style.filter=liveCameraPipeline?'none':cameraFilterCSS();}
    refreshRecordControls();
    return;
  }
  if(!peer(id)?.live){toast('This person is not live');requestedLiveId=null;return;}
  ui.liveVideo.style.filter='none'; // Do not recolor somebody else's incoming camera.
  ui.startLive.classList.add('hidden');ui.stopLive.classList.add('hidden');ui.microphoneLabel.classList.add('hidden');
  ui.recordControls.classList.add('hidden');
  ui.flipLiveCamera.classList.add('hidden');
  ui.liveCameraFilters.classList.add('hidden');
  showLiveDialog(`${peer(id).name} • LIVE`);
  ui.liveInfo.textContent='Connecting to the live broadcast…';
  watching={hostId:id,pc:null,pendingIce:[]};
  socket.timeout(10000).emit('live:watch',{hostId:id},(error,result)=>{
    if(requestedLiveId!==id)return;
    if(error||!result?.ok){ui.liveInfo.textContent=result?.error||'Unable to connect to video.';stopWatching();}
  });
}
ui.startLive.addEventListener('click',async()=>{
  if(isBroadcasting || !myId || !socket.connected)return;
  if(!navigator.mediaDevices?.getUserMedia){ui.liveInfo.textContent='Camera requires an HTTPS website and a supported browser.';return;}
  ui.startLive.disabled=true;
  try{
    const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:liveCameraFacing},width:{ideal:960},height:{ideal:540}},audio:ui.micEnabled.checked});
    if(!myId||!socket.connected){stream.getTracks().forEach(t=>t.stop());throw Error('You are no longer connected.');}
    liveRawStream=stream;
    liveCameraPipeline=makeCameraPipeline(stream);
    ownMediaStream=liveCameraPipeline?.stream||stream;
    const result=await new Promise(resolve=>socket.timeout(10000).emit('live:start',{},(error,response)=>resolve(error?{ok:false,error:'Server could not start broadcast'}:response)));
    if(!result?.ok){stopLocalStream();throw Error(result?.error||'Could not start video.');}
    isBroadcasting=true;
    videoDisplay(ownMediaStream,true);
    ui.liveVideo.style.filter=liveCameraPipeline?'none':cameraFilterCSS();
    ui.liveInfo.textContent='You are LIVE. Tap STOP to end the broadcast.';
    ui.flipLiveCamera.classList.remove('hidden');ui.liveCameraFilters.classList.remove('hidden');
    ui.startLive.classList.add('hidden');ui.stopLive.classList.remove('hidden');ui.microphoneLabel.classList.add('hidden');
    updateLiveControls();
    refreshRecordControls();
    // End immediately if camera or screen capture is revoked by the browser.
    const originalTrack=stream.getVideoTracks()[0];
    originalTrack?.addEventListener('ended',()=>{if(isBroadcasting && liveRawStream?.getVideoTracks()[0]===originalTrack)endBroadcast();});
  }catch(error){ui.liveInfo.textContent=error.message||'Camera permission was denied.';}
  finally{ui.startLive.disabled=false;}
});
function endBroadcast(){
  if(liveRecorder?.state==='recording')liveRecorder.stop();
  if(socket.connected && myId)socket.emit('live:stop',{});
  stopLocalStream();
  ui.liveInfo.textContent='Broadcast stopped.';
  ui.stopLive.classList.add('hidden');ui.startLive.classList.remove('hidden');ui.microphoneLabel.classList.remove('hidden');
  ui.flipLiveCamera.classList.add('hidden');
  refreshRecordControls();
}
ui.flipLiveCamera.addEventListener('click',async()=>{
  if(!isBroadcasting||!liveRawStream)return;
  if(liveRecorder?.state==='recording'){toast('Stop recording before reversing camera');return;}
  const nextFacing=liveCameraFacing==='user'?'environment':'user';
  const token=++liveCameraGeneration;
  ui.flipLiveCamera.disabled=true;
  try{
    const fresh=await requestFacingVideo(nextFacing);
    const newTrack=fresh.getVideoTracks()[0];
    if(!isBroadcasting||token!==liveCameraGeneration){fresh.getTracks().forEach(t=>t.stop());return;}
    const old=liveRawStream.getVideoTracks()[0];
    try{
      if(liveCameraPipeline){
        await liveCameraPipeline.swapTrack(newTrack);
      }else{
        for(const viewer of liveViewers.values()){
          const sender=viewer.pc.getSenders().find(s=>s.track?.kind==='video');
          if(sender)await sender.replaceTrack(newTrack);
        }
      }
    }catch(error){fresh.getTracks().forEach(t=>t.stop());throw error;}
    liveRawStream.removeTrack(old);liveRawStream.addTrack(newTrack);
    if(!liveCameraPipeline){
      ownMediaStream.removeTrack(old);ownMediaStream.addTrack(newTrack);
      videoDisplay(ownMediaStream,true);
    }
    old?.stop();liveCameraFacing=nextFacing;
    newTrack.addEventListener('ended',()=>{if(isBroadcasting&&liveRawStream?.getVideoTracks()[0]===newTrack)endBroadcast();});
    toast('Using '+(nextFacing==='user'?'front':'back')+' camera');
  }catch(error){ui.liveInfo.textContent='Could not reverse camera: '+(error.message||'unavailable');}
  finally{ui.flipLiveCamera.disabled=false;}
});
ui.stopLive.addEventListener('click',endBroadcast);

function createPeer(id,isHost){
  const pc=new RTCPeerConnection(rtcConfig);
  const state={pc,pendingIce:[]};
  pc.onicecandidate=event=>{
    if(event.candidate && socket.connected)socket.emit('live:signal',{to:id,signal:{type:'ice',candidate:event.candidate.toJSON()}});
  };
  pc.onconnectionstatechange=()=>{
    if(['failed','closed'].includes(pc.connectionState)){
      if(isHost){if(liveViewers.get(id)?.pc===pc)liveViewers.delete(id);}
      else if(watching?.pc===pc)ui.liveInfo.textContent='Video connection ended. Close and reopen the stream to retry.';
    }
  };
  return state;
}
async function applyPendingIce(state){
  for(const candidate of state.pendingIce.splice(0)){
    try{await state.pc.addIceCandidate(candidate);}catch(_error){}
  }
}
socket.on('live:viewer:joined',async({viewerId})=>{
  if(!isBroadcasting || !ownMediaStream || !peer(viewerId))return;
  const old=liveViewers.get(viewerId);
  if(old)old.pc.close();
  const state=createPeer(viewerId,true);
  liveViewers.set(viewerId,state);
  try{
    for(const track of ownMediaStream.getTracks())state.pc.addTrack(track,ownMediaStream);
    const offer=await state.pc.createOffer();
    await state.pc.setLocalDescription(offer);
    socket.emit('live:signal',{to:viewerId,signal:{type:'offer',sdp:state.pc.localDescription.sdp}});
  }catch(_error){state.pc.close();liveViewers.delete(viewerId);}
});
socket.on('live:viewer:left',({viewerId})=>{
  const state=liveViewers.get(viewerId);
  if(state){state.pc.close();liveViewers.delete(viewerId);}
});
socket.on('live:signal',async({from,signal})=>{
  if(!signal || !from)return;
  try{
    if(signal.type==='offer' && watching?.hostId===from && requestedLiveId===from){
      if(watching.pc)watching.pc.close();
      const state=createPeer(from,false);
      state.pendingIce.push(...(watching.pendingIce||[]));
      watching=Object.assign({hostId:from},state);
      state.pc.ontrack=event=>{
        if(watching?.pc!==state.pc)return;
        videoDisplay(event.streams[0]||new MediaStream([event.track]),false);
        ui.liveInfo.textContent='Watching live video';
      };
      await state.pc.setRemoteDescription({type:'offer',sdp:signal.sdp});
      await applyPendingIce(state);
      const answer=await state.pc.createAnswer();
      await state.pc.setLocalDescription(answer);
      socket.emit('live:signal',{to:from,signal:{type:'answer',sdp:state.pc.localDescription.sdp}});
    } else if(signal.type==='answer' && liveViewers.has(from)){
      const state=liveViewers.get(from);
      await state.pc.setRemoteDescription({type:'answer',sdp:signal.sdp});
      await applyPendingIce(state);
    } else if(signal.type==='ice'){
      const state=watching?.hostId===from ? watching : liveViewers.get(from);
      if(!state || !signal.candidate)return;
      if(state.pc?.remoteDescription)await state.pc.addIceCandidate(signal.candidate);
      else state.pendingIce.push(signal.candidate);
    }
  }catch(error){
    if(watching?.hostId===from)ui.liveInfo.textContent='Unable to play this live video.';
  }
});
socket.on('live:ended',({hostId})=>{
  if(watching?.hostId===hostId){stopWatching();ui.liveInfo.textContent='Broadcast ended.';}
});
function cleanupLiveOnDisconnect(){
  if(liveRecorder?.state==='recording')liveRecorder.stop();
  stopWatching();
  stopLocalStream();
  hideLiveDialog();
}
updateLiveControls();


// ---- Camera / gallery map reports (photos and video), with room-specific playback ----
function revokeMedia(media){if(media?.previewUrl)URL.revokeObjectURL(media.previewUrl);}
function discardSelectedReport(){
  revokeMedia(selectedReport);
  selectedReport=null;
  reportPoint=null;
  if(toolMode==='report')toolMode='browse';
  paintDraft();
}
function useSelectedReport(kind,blob,mime,recordedAt=Date.now(),source='uploaded'){
  discardSelectedReport();
  selectedReport={kind,blob,mime,recordedAt,source,mediaFilter:window.ASEMap?.selectedMediaFilter?.()||'color',previewUrl:URL.createObjectURL(blob)};
  mapListTab='reports';
  onMap=true;
  resetTool();
  toolMode='report';
  displayHeader();renderMap();
  toast('Tap the map to place your report.');
}
function chooseMapSource(kind){
  sourceMediaType=kind;
  ui.mapSourceTitle.textContent=kind==='photo'?'photo report':'video report';
  if(!ui.mapSourceDialog.open)ui.mapSourceDialog.showModal();
}
ui.mapPhotoButton.addEventListener('click',()=>{toggleFilters(false);chooseMapSource('photo');});
ui.mapVideoButton.addEventListener('click',()=>{toggleFilters(false);chooseMapSource('video');});
ui.closeMapSource.addEventListener('click',()=>ui.mapSourceDialog.close());
function openSourceInput(camera){
  const id=sourceMediaType==='photo'?(camera?'mapPhotoCamera':'mapPhotoInput'):(camera?'mapVideoCamera':'mapVideoInput');
  ui.mapSourceDialog.close();
  ui[id].click();
}
ui.takeMapMedia.addEventListener('click',()=>{ui.mapSourceDialog.close();openMapCapture(sourceMediaType);});
ui.chooseMapMedia.addEventListener('click',()=>openSourceInput(false));
async function prepareReportFile(file,kind){
  if(!file)throw Error('Choose a file.');
  if(kind==='photo'){
    const jpeg=await preparePhoto(file);
    const result=await fetch(jpeg);
    const blob=await result.blob();
    if(blob.size>750000)throw Error('Photo is too large.');
    return {blob,mime:'image/jpeg'};
  }
  const allowed=['video/mp4','video/webm','video/quicktime'];
  const mime=(file.type||'').split(';')[0].toLowerCase();
  if(!allowed.includes(mime))throw Error('Use MP4, WebM or MOV video.');
  if(file.size>8*1024*1024)throw Error('Video must be under 8 MB. Record a short clip or use a smaller file.');
  if(file.size<100)throw Error('Video file appears empty.');
  return {blob:file,mime};
}
for(const [id,kind] of [['mapPhotoInput','photo'],['mapPhotoCamera','photo'],['mapVideoInput','video'],['mapVideoCamera','video']]){
  ui[id].addEventListener('change',async()=>{
    const file=ui[id].files?.[0];ui[id].value='';
    if(!file)return;
    try{
      toast('Preparing report…');
      const prepared=await prepareReportFile(file,kind);
      useSelectedReport(kind,prepared.blob,prepared.mime);
    }catch(err){toast(err.message||'Could not prepare report');}
  });
}

// ===== Browser-first photo/video map reports. Does NOT open the phone's camera app. =====
// Camera access is permission-based and the capture is kept local until the user saves a report.
let mapCaptureStream=null;
let mapCaptureKind='photo';
let mapCaptureFacing='environment';
let mapCaptureSession=0;
let mapCaptureRecorder=null;
let mapCaptureLoop=0;
let mapCaptureCanvas=null;
let mapCaptureRecordingTime=0;
let mapCaptureChunks=[];
let mapCaptureTimeout=null;
let discardCaptureRecording=false;
function stopMapCaptureTracks(){
  if(mapCaptureStream){mapCaptureStream.getTracks().forEach(track=>track.stop());mapCaptureStream=null;}
  ui.mapCapturePreview.pause();ui.mapCapturePreview.srcObject=null;
}
function setMapCaptureButtons(){
  const recording=mapCaptureRecorder?.state==='recording';
  ui.snapMapCapture.classList.toggle('hidden',mapCaptureKind!=='photo');
  ui.recordMapCapture.classList.toggle('hidden',mapCaptureKind!=='video'||recording);
  ui.stopMapCapture.classList.toggle('hidden',mapCaptureKind!=='video'||!recording);
  ui.flipMapCapture.disabled=!!recording;
}
async function launchMapCaptureCamera(){
  const generation=++mapCaptureSession;
  stopMapCaptureTracks();
  if(!navigator.mediaDevices?.getUserMedia){ui.mapCaptureStatus.textContent='An HTTPS website and browser camera permissions are required.';return;}
  ui.mapCaptureStatus.textContent='Requesting permission for the '+(mapCaptureFacing==='environment'?'rear':'front')+' camera…';
  try{
    let stream;
    try{stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:mapCaptureFacing},width:{ideal:1280},height:{ideal:720}}});}
    catch(error){if(mapCaptureFacing==='environment')throw error;stream=await navigator.mediaDevices.getUserMedia({video:true,audio:false});}
    if(generation!==mapCaptureSession||!ui.mapCaptureDialog.open){stream.getTracks().forEach(t=>t.stop());return;}
    mapCaptureStream=stream;ui.mapCapturePreview.srcObject=stream;
    await ui.mapCapturePreview.play().catch(()=>{});
    ui.mapCaptureStatus.textContent='Camera ready. Your photo/video stays on this device until you place it on the map.';
  }catch(error){if(generation===mapCaptureSession)ui.mapCaptureStatus.textContent='Camera unavailable: '+(error.message||'permission denied')+'. Use Choose File instead.';}
}
function openMapCapture(kind){
  mapCaptureKind=kind==='video'?'video':'photo';
  mapCaptureFacing='environment';
  ui.mapCaptureTitle.textContent=mapCaptureKind==='photo'?'ASE / CAPTURE PHOTO':'ASE / RECORD VIDEO';
  if(!ui.mapCaptureDialog.open)ui.mapCaptureDialog.showModal();
  setMapCaptureButtons();
  launchMapCaptureCamera();
}
function cancelMapCapture(){
  ++mapCaptureSession;discardCaptureRecording=true;
  if(mapCaptureRecorder?.state==='recording')mapCaptureRecorder.stop();
  if(mapCaptureTimeout){clearTimeout(mapCaptureTimeout);mapCaptureTimeout=null;}
  cancelAnimationFrame(mapCaptureLoop);mapCaptureLoop=0;
  stopMapCaptureTracks();
  if(ui.mapCaptureDialog.open)ui.mapCaptureDialog.close();
}
ui.closeMapCapture.addEventListener('click',cancelMapCapture);
ui.mapCaptureDialog.addEventListener('cancel',event=>{event.preventDefault();cancelMapCapture();});
ui.mapCaptureDialog.addEventListener('close',()=>{if(mapCaptureStream)cancelMapCapture();});
ui.flipMapCapture.addEventListener('click',()=>{
  mapCaptureFacing=mapCaptureFacing==='environment'?'user':'environment';
  launchMapCaptureCamera();
});
function makeMapCaptureCanvas(){
  const v=ui.mapCapturePreview;
  const w=v.videoWidth,h=v.videoHeight;
  if(!w||!h)throw Error('Camera is still starting. Try again.');
  const scale=Math.min(1,960/Math.max(w,h));
  const canvas=document.createElement('canvas');canvas.width=Math.max(2,Math.round(w*scale));canvas.height=Math.max(2,Math.round(h*scale));
  return canvas;
}
function drawCCTVFrame(canvas,recordedAt){
  const ctx=canvas.getContext('2d',{alpha:false});
  if(!ctx)return;
  ctx.fillStyle='#000';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.filter=window.ASEMap?.cameraFilter?.()||'none';
  ctx.drawImage(ui.mapCapturePreview,0,0,canvas.width,canvas.height);
  ctx.filter='none';
  const date=reportClockLabel(recordedAt);
  const fontPx=Math.max(13,Math.round(canvas.width/36));
  ctx.font=`bold ${fontPx}px monospace`;
  ctx.textBaseline='bottom';
  ctx.shadowColor='#000';ctx.shadowBlur=4;
  ctx.fillStyle='#eaeaea';
  ctx.fillText('ASE / '+date,Math.round(canvas.width*.03),canvas.height-Math.max(9,canvas.height*.035));
  ctx.shadowBlur=0;
}
ui.snapMapCapture.addEventListener('click',()=>{
  if(!mapCaptureStream){toast('Allow camera access first.');return;}
  try{
    const canvas=makeMapCaptureCanvas(),stamp=Date.now();
    drawCCTVFrame(canvas,stamp);
    canvas.toBlob(blob=>{
      if(!blob){toast('Could not capture image');return;}
      if(blob.size>750000){toast('Image is too large. Try again.');return;}
      cancelMapCapture();
      useSelectedReport('photo',blob,'image/jpeg',stamp,'browser');
    },'image/jpeg',.78);
  }catch(error){toast(error.message||'Photo failed');}
});
function mapRecordingMime(){
  if(typeof MediaRecorder==='undefined')return '';
  for(const mime of ['video/webm;codecs=vp8','video/webm','video/mp4'])if(MediaRecorder.isTypeSupported(mime))return mime;
  return '';
}
ui.recordMapCapture.addEventListener('click',()=>{
  if(!mapCaptureStream){toast('Allow camera access first');return;}
  try{
    if(!HTMLCanvasElement.prototype.captureStream||typeof MediaRecorder==='undefined')throw Error('Video recording is not supported in this browser. Use Choose File.');
    const mime=mapRecordingMime();if(!mime)throw Error('Browser does not provide a compatible video recorder.');
    mapCaptureCanvas=makeMapCaptureCanvas();
    mapCaptureRecordingTime=Date.now();mapCaptureChunks=[];discardCaptureRecording=false;
    const stream=mapCaptureCanvas.captureStream(20);
    const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:900000});
    mapCaptureRecorder=recorder;
    const tick=()=>{
      if(mapCaptureRecorder!==recorder||recorder.state==='inactive')return;
      if(ui.mapCapturePreview.readyState>=2)drawCCTVFrame(mapCaptureCanvas,Date.now());
      ui.mapCaptureClock.textContent=' REC '+reportClockLabel(Date.now());
      mapCaptureLoop=requestAnimationFrame(tick);
    };
    recorder.ondataavailable=event=>{if(event.data?.size)mapCaptureChunks.push(event.data);};
    recorder.onerror=()=>{ui.mapCaptureStatus.textContent='Recording failed. Please try again.';};
    recorder.onstop=()=>{
      if(mapCaptureTimeout){clearTimeout(mapCaptureTimeout);mapCaptureTimeout=null;}
      cancelAnimationFrame(mapCaptureLoop);mapCaptureLoop=0;
      stream.getTracks().forEach(track=>track.stop());
      if(mapCaptureRecorder===recorder)mapCaptureRecorder=null;
      setMapCaptureButtons();
      const blob=new Blob(mapCaptureChunks,{type:recorder.mimeType.split(';')[0]});mapCaptureChunks=[];
      const shouldDiscard=discardCaptureRecording;
      if(shouldDiscard)return;
      if(blob.size<100||blob.size>8*1024*1024){ui.mapCaptureStatus.textContent='Recording is empty or over 8MB. Try a shorter clip.';return;}
      cancelMapCapture();
      useSelectedReport('video',blob,blob.type,mapCaptureRecordingTime,'browser');
    };
    // Ensure first frame is available before recording begins.
    drawCCTVFrame(mapCaptureCanvas,mapCaptureRecordingTime);
    recorder.start(500);tick();
    mapCaptureTimeout=setTimeout(()=>{if(recorder.state==='recording')recorder.stop();},12000);
    setMapCaptureButtons();
    ui.mapCaptureStatus.textContent='Recording in the browser. STOP when finished (max 12s). Silent CCTV-style video.';
  }catch(error){ui.mapCaptureStatus.textContent=error.message||'Unable to record.';}
});
ui.stopMapCapture.addEventListener('click',()=>{if(mapCaptureRecorder?.state==='recording')mapCaptureRecorder.stop();});
// The native file inputs remain as an explicit alternative, not the default take-photo action.
setInterval(()=>{
  if(ui.mapCaptureDialog.open&&mapCaptureRecorder?.state!=='recording')ui.mapCaptureClock.textContent='ASE / '+reportClockLabel(Date.now());
  if(codeMode&&terminalVariant==='vision'&&myId&&mapListTab==='reports')renderMap();
},30000);

function showReportEditor(){
  if(!selectedReport||!reportPoint)return;
  ui.reportNote.value='';
  ui.reportPreviewImage.classList.toggle('hidden',selectedReport.kind!=='photo');
  ui.reportPreviewVideo.classList.toggle('hidden',selectedReport.kind!=='video');
  ui.reportPreviewStamp.textContent='ASE · '+reportClockLabel(selectedReport.recordedAt||Date.now())+' · '+(selectedReport.source==='browser'?'CAPTURED':'ADDED')+' / '+(selectedReport.mediaFilter||'COLOR').toUpperCase();
  if(selectedReport.kind==='photo')ui.reportPreviewImage.src=selectedReport.previewUrl;
  else {ui.reportPreviewVideo.src=selectedReport.previewUrl;ui.reportPreviewVideo.load();}
  if(!ui.reportDialog.open)ui.reportDialog.showModal();
}
function closeReportEditor(){
  if(ui.reportDialog.open)ui.reportDialog.close();
  ui.reportPreviewVideo.pause();ui.reportPreviewVideo.removeAttribute('src');ui.reportPreviewVideo.load();
  ui.reportPreviewImage.removeAttribute('src');
}
ui.closeReportDialog.addEventListener('click',closeReportEditor);
ui.cancelReport.addEventListener('click',closeReportEditor);
ui.reportDialog.addEventListener('close',()=>{
  ui.reportPreviewVideo.pause();ui.reportPreviewVideo.removeAttribute('src');
});
ui.saveReport.addEventListener('click',async()=>{
  if(!myId || !socket.connected || !selectedReport || !reportPoint)return;
  const media=selectedReport,point=reportPoint,note=ui.reportNote.value.trim(),to=target;
  ui.saveReport.disabled=true;
  try{
    const bytes=await media.blob.arrayBuffer();
    const result=await new Promise(resolve=>socket.timeout(45000).emit('map:report',{
      to,points:[point],mediaKind:media.kind,mime:media.mime,bytes,note,recordedAt:media.recordedAt,source:media.source,
      ...(window.ASEMap?.getSettings?.()||{}),mediaFilter:media.mediaFilter||window.ASEMap?.selectedMediaFilter?.()||'color' 
    },(err,response)=>resolve(err?{ok:false,error:'Report upload timed out'}:response)));
    if(!result?.ok)throw Error(result?.error||'Upload failed');
    closeReportEditor();discardSelectedReport();resetTool();
    toast('Report saved to this conversation’s map');
  }catch(err){toast(err.message||'Could not upload report');}
  finally{ui.saveReport.disabled=false;}
});
function closeReportViewer(){reportViewerRequest++;if(ui.reportViewer.open)ui.reportViewer.close();}
ui.closeReportViewer.addEventListener('click',closeReportViewer);
ui.reportViewer.addEventListener('close',()=>{
  window.CreatorDossier?.close();
  ui.reportViewerVideo.pause();
  ui.reportViewerVideo.removeAttribute('src');ui.reportViewerVideo.load();
  ui.reportViewerImage.removeAttribute('src');
  if(viewingReportUrl){URL.revokeObjectURL(viewingReportUrl);viewingReportUrl=null;}
});
function openReportViewer(item){
  if(!myId||!item || item.kind!=='report')return;
  closeReportViewer();
  ui.reportViewerTitle.textContent=`${item.mediaKind} report · ${item.name}`;
  ui.reportViewerStamp.textContent='ASE · '+reportClockLabel(item.recordedAt||item.time)+' · '+(item.source==='browser'?'CAPTURED':'ADDED');
  ui.reportViewerText.textContent=(item.note || 'No report message.')+' · PRIORITY '+(item.priority===1?'1 IMPORTANT':'2 LESS IMPORTANT');
  ui.reportViewerImage.classList.add('hidden');
  ui.reportViewerVideo.classList.add('hidden');
  ui.reportViewer.showModal();
  window.CreatorDossier?.open(item);
  const inRoom=target;
  const request=++reportViewerRequest;
  socket.timeout(30000).emit('map:media:get',{to:inRoom,id:item.id},(err,result)=>{
    if(!ui.reportViewer.open||target!==inRoom||reportViewerRequest!==request)return;
    if(err||!result?.ok){ui.reportViewerText.textContent=result?.error||'Could not load report.';return;}
    const raw=result.bytes;
    const bytes=raw instanceof ArrayBuffer?raw:
      (raw?.type==='Buffer'&&Array.isArray(raw.data)?new Uint8Array(raw.data):raw);
    if(!bytes){ui.reportViewerText.textContent='Media unavailable.';return;}
    if(viewingReportUrl)URL.revokeObjectURL(viewingReportUrl);
    viewingReportUrl=URL.createObjectURL(new Blob([bytes],{type:result.mime}));
    if(result.kind==='photo'){
      ui.reportViewerImage.src=viewingReportUrl;ui.reportViewerImage.classList.remove('hidden');
    }else{
      ui.reportViewerVideo.src=viewingReportUrl;
      ui.reportViewerVideo.classList.remove('hidden');
      ui.reportViewerVideo.load();
      ui.reportViewerVideo.play().catch(()=>{}); // user may need to tap Play on mobile
    }
  });
}
ui.marksTab.addEventListener('click',()=>{mapListTab='marks';renderMap();});
ui.reportsTab.addEventListener('click',()=>{mapListTab='reports';renderMap();});

// ---- Explicit recording of the broadcaster's own live stream ----
let liveRecorder=null;
let liveRecordChunks=[];
let liveCaptureStartTime=0;
let liveRecordTimeout=null;
let capturedLiveClip=null;
function discardRecordedClip(){
  revokeMedia(capturedLiveClip);
  capturedLiveClip=null;
  ui.recordPreview.pause();ui.recordPreview.removeAttribute('src');ui.recordPreview.load();
  ui.recordPreview.classList.add('hidden');
  ui.clipToMap.classList.add('hidden');
  ui.discardClip.classList.add('hidden');
}
function refreshRecordControls(){
  const own=!!myId && requestedLiveId===myId;
  ui.recordControls.classList.toggle('hidden',!own || !isBroadcasting);
  const active=liveRecorder?.state==='recording';
  ui.recordClip.classList.toggle('hidden',!!active);
  ui.stopRecordClip.classList.toggle('hidden',!active);
  ui.clipToMap.classList.toggle('hidden',!capturedLiveClip);
  ui.discardClip.classList.toggle('hidden',!capturedLiveClip);
}
function selectRecordingMime(){
  if(typeof MediaRecorder==='undefined')return null;
  for(const mime of ['video/webm;codecs=vp8,opus','video/webm','video/mp4']){
    if(MediaRecorder.isTypeSupported(mime))return mime;
  }
  return null;
}
ui.recordClip.addEventListener('click',()=>{
  if(!isBroadcasting || !ownMediaStream || !myId || !socket.connected)return;
  const mime=selectRecordingMime();
  if(!mime){ui.recordInfo.textContent='This browser does not support video recording.';return;}
  discardRecordedClip();
  liveRecordChunks=[];
  try{
    const recorder=new MediaRecorder(ownMediaStream,{mimeType:mime,videoBitsPerSecond:1200000});
    liveRecorder=recorder;
    ui.recordInfo.textContent='Recording… press STOP to save a clip (maximum 20 seconds).';
    recorder.ondataavailable=e=>{
      if(e.data?.size)liveRecordChunks.push(e.data);
      if(liveRecordChunks.reduce((n,b)=>n+b.size,0)>8*1024*1024 && recorder.state==='recording')recorder.stop();
    };
    recorder.onstop=()=>{
      clearTimeout(liveRecordTimeout);liveRecordTimeout=null;
      const blob=new Blob(liveRecordChunks,{type:recorder.mimeType.split(';')[0]});
      liveRecordChunks=[];
      liveRecorder=null;
      if(blob.size>8*1024*1024){ui.recordInfo.textContent='Clip exceeds 8 MB. Record a shorter video.';}
      else if(blob.size<100){ui.recordInfo.textContent='No video was recorded. Try again.';}
      else{
        const kind='video';
        capturedLiveClip={kind,blob,mime:blob.type,recordedAt:liveCaptureStartTime||Date.now(),source:'browser',previewUrl:URL.createObjectURL(blob)};
        ui.recordPreview.src=capturedLiveClip.previewUrl;
        ui.recordPreview.classList.remove('hidden');
        ui.recordInfo.textContent='Clip saved in your browser. Tap "put clip on map" to share it.';
      }
      refreshRecordControls();
    };
    recorder.onerror=()=>{ui.recordInfo.textContent='Recording error. Try again.';};
    liveCaptureStartTime=Date.now();
    recorder.start(900);
    liveRecordTimeout=setTimeout(()=>{if(recorder.state==='recording')recorder.stop();},20000);
    refreshRecordControls();
  }catch(error){ui.recordInfo.textContent=error.message||'Unable to record';liveRecorder=null;}
});
ui.stopRecordClip.addEventListener('click',()=>{if(liveRecorder?.state==='recording')liveRecorder.stop();});
ui.discardClip.addEventListener('click',()=>{discardRecordedClip();ui.recordInfo.textContent='Clip discarded.';refreshRecordControls();});
ui.clipToMap.addEventListener('click',()=>{
  if(!capturedLiveClip){toast('Record a clip first.');return;}
  const clip=capturedLiveClip;
  capturedLiveClip=null;
  ui.recordPreview.pause();ui.recordPreview.removeAttribute('src');ui.recordPreview.load();
  ui.recordPreview.classList.add('hidden');
  // Ownership of the clip passes to selectedReport; avoid revoking its preview URL.
  discardSelectedReport();
  selectedReport=clip;
  mapListTab='reports';
  requestedLiveId=null;
  if(ui.liveDialog.open)ui.liveDialog.close();
  clearVideo();
  onMap=true;resetTool();toolMode='report';
  displayHeader();renderMap();refreshRecordControls();
  toast('Tap the picture to place your recorded live clip.');
});
// Keep the recorder buttons synchronized when the owner opens a live preview.
ui.liveDialog.addEventListener('close',refreshRecordControls);

refreshRecordControls();


// ===== Crimson Chat expansion: wallpapers, secret landscape UI, private calls, alerts =====
const WALLPAPER_NAMES=["Prism Grid", "Orbit Circles", "Squared Up", "Violet Flow", "Neon Mesh", "Solar Bloom", "Pixel Rain", "Mirage Lines", "Aurora Blocks", "Ripple Field", "Cobalt Lattice", "Orange Phase", "Mint Loops", "Glass Tiles", "Vector Waves", "Arc Reactor", "Chromatic Bars", "Electric Shapes", "Liquid Gradient", "Matrix Geometry", "Blackout Grid", "Razor Wire", "Blood Signal", "Iron District", "Night Circuit", "Toxic Pulse", "Redline Sector", "Vanta Noise", "Ghost Reactor", "Obsidian Tiles", "Warpath Lines", "Static Void", "Voltage Rift", "Dark Orbit", "Steel Teeth", "Rogue Matrix", "Crimson Fracture", "Cipher Maze", "Infrared Night", "Final Protocol"];

let codeMode=false;
let terminalVariant='command';
let spectrumMode='normal';
let reportAgeMinutes='all';
let codeCursor={x:.5,y:.5};
let wallpaperUnlocked=false;
let localWallpaper=1;
let sharedWallpaper=null;
let currentTrust=null;
let emergencyPoint=null;
let emergencyFrom=null;
let chatCameraStream=null;
let chatCameraFacing='environment';
let chatCameraGeneration=0;
// callSession is declared before the camera filter helpers.
let incomingCall=null;
let callStarting=false;
const wallRoomStorage=()=>myId?`crimson-wall-${target==='public'?'public':peer(target)?.name||'private'}`:'crimson-wall-public';
function renderCodeRoster(){
  if(!ui.codeUsers)return;
  ui.codeUsers.replaceChildren();
  const everyone=create('button',target==='public'?'active':'','ALL THREE · PUBLIC');
  everyone.addEventListener('click',()=>openConversation('public'));
  ui.codeUsers.append(everyone);
  for(const person of roster){
    if(person.id===myId)continue;
    const button=create('button',target===person.id?'active':'',person.name+(person.live?' · LIVE':''));
    button.addEventListener('click',()=>openConversation(person.id));
    ui.codeUsers.append(button);
  }
}
function updateCodeClock(){
  const now=new Date();
  if(ui.codeClock)ui.codeClock.textContent=now.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
  const stamp=now.toLocaleTimeString([],{hour12:false});
  ui.visionTime.textContent=stamp;ui.visionMapTime.textContent=stamp;
}
function updateRotate(){ui.rotateNotice.classList.toggle('hidden',!codeMode || window.innerHeight<=window.innerWidth || window.innerWidth>=900);}
function toggleCodeMode(enabled,variant='command'){
  terminalVariant=variant;
  codeMode=enabled;
  if(codeMode){onMap=true;resetTool();if(variant==='vision')mapListTab='reports';}
  else onMap=false;
  displayHeader();
  renderMap();
  updateRotate();
  toast(enabled?(variant==='vision'?'Imaging console opened. Rotate to landscape.':'Terminal view activated. Rotate to landscape.'):'Regular chat view');
}
window.addEventListener('resize',updateRotate);
setInterval(updateCodeClock,30000);updateCodeClock();
ui.rotateExit.addEventListener('click',()=>toggleCodeMode(false));
ui.codeExit.addEventListener('click',()=>toggleCodeMode(false));
ui.codeMark.addEventListener('click',()=>{setTool('pin');toast('Move the crosshair with the pad; tap PLACE.');});
ui.codePath.addEventListener('click',()=>{setTool('path');toast('Add multiple waypoints, then FINISH.');});
ui.codeReports.addEventListener('click',()=>{mapListTab='reports';renderMap();});
ui.codeWalls.addEventListener('click',()=>showWallpaperPanel());
ui.codeFilters.addEventListener('click',()=>toggleFilters(true));
for(const btn of ui.visionControls.querySelectorAll('[data-spectrum]')){
  btn.addEventListener('click',()=>{
    spectrumMode=btn.dataset.spectrum;
    ui.mapCanvas.dataset.spectrum=spectrumMode;
    for(const b of ui.visionControls.querySelectorAll('[data-spectrum]'))b.classList.toggle('selected',b===btn);
  });
}
ui.visionReportAge.addEventListener('change',()=>{reportAgeMinutes=ui.visionReportAge.value;renderMap();});
for(const [id,dx,dy] of [['padUp',0,-.025],['padDown',0,.025],['padLeft',-.025,0],['padRight',.025,0]]){
  ui[id].addEventListener('click',()=>{
    codeCursor.x=Math.max(.02,Math.min(.98,codeCursor.x+dx));
    codeCursor.y=Math.max(.02,Math.min(.98,codeCursor.y+dy));
    positionCursor();
  });
}
function positionCursor(){
  ui.aimReticle.style.left=`${codeCursor.x*100}%`;
  ui.aimReticle.style.top=`${codeCursor.y*100}%`;
  ui.cursorCoords.textContent=`${(codeCursor.x*100).toFixed(1)} / ${(codeCursor.y*100).toFixed(1)}`;
}
ui.padPlace.addEventListener('click',()=>{
  if(toolMode==='browse'){toast('Choose MARK, PATH, or EMERGENCY first.');return;}
  useMapPoint({...codeCursor});
});
positionCursor();
try{
  wallpaperUnlocked=localStorage.getItem('crimson-unlocked-walls')==='yes';
  localWallpaper=Number(localStorage.getItem('crimson-last-wall'))||1;
}catch(_e){}
function unlockWalls(){
  wallpaperUnlocked=true;
  try{localStorage.setItem('crimson-unlocked-walls','yes');}catch(_e){}
  showWallpaperPanel();
  toast('Unlocked the 20 original secret wallpapers; all 100 new cold wallpapers are also available.');
}
function wallUrl(i){return `/wallpapers/wall-${String(i).padStart(2,'0')}.svg`;}
function applyChatWallpaper(i){
  if(!Number.isInteger(i)||i<1||i>142)return;
  const live=i===41||i===42;
  ui.animatedWallpaper.classList.toggle('hidden',!live);
  ui.animatedWallpaper.classList.toggle('motion-grid',i===41);
  ui.animatedWallpaper.classList.toggle('motion-orbits',i===42);
  if(live){
    ui.chatPanel.style.backgroundImage='none';
    ui.chatPanel.style.backgroundColor='#040615';
    return;
  }
  ui.chatPanel.style.backgroundColor='';
  ui.chatPanel.style.backgroundImage=`linear-gradient(#02051999,#02051999),url("${wallUrl(i)}")`;
  ui.chatPanel.style.backgroundSize='cover';
  ui.chatPanel.style.backgroundPosition='center';
}
function setWallpaperForCurrentRoom(){
  let wall=sharedWallpaper;
  if(!wall){try{wall=Number(localStorage.getItem(wallRoomStorage()))||localWallpaper;}catch(_e){wall=localWallpaper;}}
  applyChatWallpaper(wall);
}
const NEW_WALLPAPER_FAMILIES = ['Frost Shards','Arctic Circuit','Midnight Orbits','Cold Static','Obsidian Spikes','Cryo Hex','Black Ice Grid','Steel Plates','Fracture Storm','Polar Waves'];
function showWallpaperPanel(){
  const panel=ui.wallpaperPanel;
  panel.classList.remove('hidden');
  ui.wallpaperInfo.textContent=wallpaperUnlocked?'140 static + 2 live wallpapers · trust to sync':'120 static + 2 live wallpapers · send //CODEWALL to unlock 20 extra';
  ui.wallpaperGrid.replaceChildren();
  const items=[...Array.from({length:20},(_,i)=>i+1),...(wallpaperUnlocked?Array.from({length:20},(_,i)=>i+21):[]),...Array.from({length:100},(_,i)=>i+43),41,42];
  for(const wall of items){
    const b=create('button','wall-option');b.type='button';
    const sample=create('span','wall-thumb');
    if(wall===41||wall===42)sample.classList.add(wall===41?'live-grid':'live-orbits');
    else sample.style.backgroundImage=`url("${wallUrl(wall)}")`;
    const title=wall===41?'LIVE · Scrolling Grid':wall===42?'LIVE · Orbit Circles':wall<=40?WALLPAPER_NAMES[wall-1]:`${NEW_WALLPAPER_FAMILIES[Math.floor((wall-43)/10)]} ${String(((wall-43)%10)+1).padStart(2,'0')}`;
    b.append(sample,create('span','wall-name',`${wall}. ${title}`));
    b.addEventListener('click',()=>selectWallpaper(wall));
    ui.wallpaperGrid.append(b);
  }
}

function selectWallpaper(wall){
  applyChatWallpaper(wall);
  localWallpaper=wall;
  try{
    localStorage.setItem('crimson-last-wall',String(wall));
    localStorage.setItem(wallRoomStorage(),String(wall));
  }catch(_e){}
  if(target!=='public' && currentTrust?.mutual){
    socket.emit('wallpaper:set',{to:target,wall},response=>{
      if(!response?.ok)toast(response?.error||'Could not sync wallpaper');
      else toast('Shared wallpaper set for both people');
    });
  }else toast(target==='public'?'Wallpaper changed on your screen':'Wallpaper changed locally. Both must trust to share it.');
  ui.wallpaperPanel.classList.add('hidden');
}
ui.wallpaperButton.addEventListener('click',showWallpaperPanel);
ui.closeWallpapers.addEventListener('click',()=>ui.wallpaperPanel.classList.add('hidden'));
setWallpaperForCurrentRoom();
function updateTrustControls(){
  const privateChat=target!=='public';
  ui.trustButton.classList.toggle('hidden',!privateChat);
  const mine=currentTrust?.approved?.includes(myId);
  ui.trustButton.textContent=mine?' untrust':'◇ trust';
  ui.trustStatus.textContent=privateChat?(currentTrust?.mutual?`PAIR ${currentTrust.code} · not a security code`:(mine?'waiting for their trust':'mutual trust optional')):'';
  ui.trustStatus.title='Pairing code is a visual confirmation only, not encryption or a secret password.';
}
ui.trustButton.addEventListener('click',()=>{
  if(target==='public')return;
  socket.emit('trust:toggle',{to:target},response=>{if(!response?.ok)toast(response?.error||'Trust failed');});
});
socket.on('trust:status',data=>{
  if(isCurrentRoom(data.room)){
    currentTrust=data;
    updateTrustControls();
    toast(data.mutual?'Mutual trust enabled · shared wallpapers allowed':'Trust settings changed');
  }
});
socket.on('wallpaper:changed',data=>{
  if(isCurrentRoom(data.room)){
    sharedWallpaper=data.wall;
    applyChatWallpaper(data.wall);
    toast('Shared chat wallpaper updated');
  }
});
// Camera dialog uses getUserMedia when allowed, and a native capture file input as fallback.
function openPhotoPreview(file){
  if(!file)return;
  ui.photoButton.disabled=true;
  preparePhoto(file).then(jpeg=>{
    pendingPhoto=jpeg;
    ui.photoPreview.src=jpeg;
    ui.photoCaption.value='';
    if(!ui.photoDialog.open)ui.photoDialog.showModal();
  }).catch(err=>toast(err.message||'Photo failed')).finally(()=>ui.photoButton.disabled=false);
}
async function closeBrowserCamera(){
  ++chatCameraGeneration;
  if(chatCameraStream){chatCameraStream.getTracks().forEach(t=>t.stop());chatCameraStream=null;}
  ui.chatCameraVideo.srcObject=null;
}

// Prefer a definite rear camera, rather than claiming that an ideal hint flipped it.
// A front-facing fallback is allowed only for the initial camera preview.
async function requestFacingVideo(facing,options={}){
  if(!navigator.mediaDevices?.getUserMedia)throw Error('Camera permission requires HTTPS');
  const constraints={video:{facingMode:{exact:facing},...options},audio:false};
  try{return await navigator.mediaDevices.getUserMedia(constraints);}
  catch(firstError){
    let devices=[];
    try{devices=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='videoinput');}catch(_e){}
    const backRe=/back|rear|environment|world|traseira|arrière|rück/i;
    const candidate=devices.find(d=>facing==='environment'?backRe.test(d.label):(/front|user|face|selfie/i).test(d.label));
    if(candidate?.deviceId){
      try{return await navigator.mediaDevices.getUserMedia({video:{deviceId:{exact:candidate.deviceId}},audio:false});}
      catch(_e){}
    }
    if(facing==='user'){
      return navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'user'},...options},audio:false});
    }
    throw Error('A rear camera was not available. Check camera permission or try another device.');
  }
}

async function startBrowserCamera(){
  const token=++chatCameraGeneration;
  const previous=chatCameraStream;
  chatCameraStream=null;
  ui.chatCameraVideo.srcObject=null;
  previous?.getTracks().forEach(t=>t.stop());
  ui.chatCameraInfo.textContent='Opening '+(chatCameraFacing==='user'?'front':'back')+' camera…';
  try{
    if(!navigator.mediaDevices?.getUserMedia)throw Error('Browser camera API unavailable. Use device camera instead.');
    const stream=await requestFacingVideo(chatCameraFacing);
    if(token!==chatCameraGeneration || !ui.chatCameraDialog.open){stream.getTracks().forEach(t=>t.stop());return;}
    chatCameraStream=stream;ui.chatCameraVideo.srcObject=stream;
    await ui.chatCameraVideo.play().catch(()=>{});
    applyCameraColors();
    ui.chatCameraInfo.textContent='Ready · '+(chatCameraFacing==='user'?'front':'back')+' camera';
  }catch(err){if(token===chatCameraGeneration)ui.chatCameraInfo.textContent=(err.message||'Camera unavailable')+' · Try device camera.';}
}
ui.photoButton.addEventListener('click',event=>{
  // Earlier click handler exists; handle this in capture phase instead (below).
});
ui.photoButton.addEventListener('click',event=>{
  if(!myId)return;
  event.stopImmediatePropagation();
  if(!ui.photoSourceDialog.open)ui.photoSourceDialog.showModal();
},true);
ui.closePhotoSource.addEventListener('click',()=>ui.photoSourceDialog.close());
ui.openChatGallery.addEventListener('click',()=>{ui.photoSourceDialog.close();ui.photoInput.click();});
ui.openChatCamera.addEventListener('click',async()=>{
  ui.photoSourceDialog.close();
  if(!ui.chatCameraDialog.open)ui.chatCameraDialog.showModal();
  await startBrowserCamera();
});
ui.flipChatCamera.addEventListener('click',()=>{
  chatCameraFacing=chatCameraFacing==='user'?'environment':'user';
  startBrowserCamera();
});
ui.closeChatCamera.addEventListener('click',()=>ui.chatCameraDialog.close());
ui.chatCameraDialog.addEventListener('close',closeBrowserCamera);
ui.useNativeCamera.addEventListener('click',()=>ui.chatNativeCamera.click());
ui.chatNativeCamera.addEventListener('change',()=>{
  const file=ui.chatNativeCamera.files?.[0];ui.chatNativeCamera.value='';
  ui.chatCameraDialog.close();openPhotoPreview(file);
});
ui.snapChatPhoto.addEventListener('click',()=>{
  const video=ui.chatCameraVideo;
  if(!chatCameraStream||!video.videoWidth){toast('Camera is not ready');return;}
  const canvas=document.createElement('canvas');
  const scale=Math.min(1,1280/Math.max(video.videoWidth,video.videoHeight));
  canvas.width=Math.round(video.videoWidth*scale);canvas.height=Math.round(video.videoHeight*scale);
  const context=canvas.getContext('2d');context.filter=cameraFilterCSS();context.drawImage(video,0,0,canvas.width,canvas.height);
  canvas.toBlob(blob=>{
    if(!blob){toast('Cannot capture frame');return;}
    ui.chatCameraDialog.close();openPhotoPreview(new File([blob],'snapshot.jpg',{type:'image/jpeg'}));
  },'image/jpeg',.83);
});
// Emergency: mark a location, pick another connected user, send urgent alert and ring manually.
function openEmergencyDialog(){
  ui.emergencyRecipient.replaceChildren();
  for(const person of roster){
    if(person.id===myId)continue;
    if(target!=='public'&&person.id!==target)continue;
    const option=document.createElement('option');option.value=person.id;option.textContent=person.name;
    ui.emergencyRecipient.append(option);
  }
  if(!ui.emergencyRecipient.options.length){toast('Another user must be online');return;}
  if(!ui.emergencyDialog.open)ui.emergencyDialog.showModal();
}
ui.emergencyButton.addEventListener('click',()=>{discardSelectedReport();setTool('emergency');toast('Tap the location you want to share urgently.');});
ui.cancelEmergency.addEventListener('click',()=>ui.emergencyDialog.close());
ui.sendEmergency.addEventListener('click',()=>{
  const to=ui.emergencyRecipient.value;
  if(!emergencyPoint||!to)return;
  ui.sendEmergency.disabled=true;
  socket.emit('emergency:send',{to,points:[emergencyPoint]},response=>{
    ui.sendEmergency.disabled=false;
    if(!response?.ok){toast(response?.error||'Alert failed');return;}
    ui.emergencyDialog.close();resetTool();
    toast('Urgent location alert sent · calling now');
    startPrivateCall('audio',to);
  });
});
socket.on('emergency:incoming',data=>{
  if(!peer(data.from))return;
  emergencyFrom=data.from;
  ui.emergencyAlertText.textContent=`${data.name} marked an urgent location on your private map.`;
  if(!ui.emergencyAlert.open && !ui.privateCallDialog.open)ui.emergencyAlert.showModal();
  else toast(`Urgent location alert from ${data.name}`);
});
ui.emergencyAlertClose.addEventListener('click',()=>ui.emergencyAlert.close());
ui.emergencyAlertMap.addEventListener('click',()=>{
  ui.emergencyAlert.close();
  if(!emergencyFrom)return;
  openConversation(emergencyFrom);enterMap();
});
ui.emergencyAlertCall.addEventListener('click',()=>{
  ui.emergencyAlert.close();
  if(emergencyFrom)startPrivateCall('audio',emergencyFrom);
});
// Ten outgoing voice effects (plus original audio). No external audio uploads.
const VOICE_EFFECTS=new Set(['normal','echo','deep','high','robot','radio','cave','alien','megaphone','whisper','telephone']);
let chosenVoiceEffect='normal';
try{const saved=localStorage.getItem('ase-voice-effect');if(VOICE_EFFECTS.has(saved))chosenVoiceEffect=saved;}catch(_e){}
ui.voiceEffectSelect.value=chosenVoiceEffect;
function createVoiceProcessor(raw){
  const AudioCtx=window.AudioContext||window.webkitAudioContext;
  if(!AudioCtx||!raw.getAudioTracks().length)return null;
  let context;
  try{context=new AudioCtx();}catch(_e){return null;}
  const source=context.createMediaStreamSource(new MediaStream(raw.getAudioTracks()));
  const destination=context.createMediaStreamDestination();
  let nodes=[],oscillators=[];
  const make=(node)=>{nodes.push(node);return node;};
  const biquad=(type,freq,Q=1,gain=0)=>{
    const node=make(context.createBiquadFilter());node.type=type;node.frequency.value=freq;node.Q.value=Q;node.gain.value=gain;return node;
  };
  const gain=(amount)=>{const node=make(context.createGain());node.gain.value=amount;return node;};
  const shaper=(intensity)=>{
    const node=make(context.createWaveShaper());const a=new Float32Array(1024);
    for(let i=0;i<a.length;i++){const x=i*2/(a.length-1)-1;a[i]=(1+intensity)*x/(1+intensity*Math.abs(x));}
    node.curve=a;node.oversample='2x';return node;
  };
  const chain=(...parts)=>{
    const all=[source,...parts,destination];for(let i=0;i<all.length-1;i++)all[i].connect(all[i+1]);
  };
  function effect(name){
    try{source.disconnect();}catch(_e){}
    for(const node of nodes){try{node.disconnect();}catch(_e){}}
    for(const oscillator of oscillators){try{oscillator.stop();oscillator.disconnect();}catch(_e){}}
    nodes=[];oscillators=[];
    try{
      switch(name){
        case 'echo':{
          chain(gain(.85));
          const delay=make(context.createDelay(.8));delay.delayTime.value=.26;
          const fb=gain(.31),wet=gain(.45);
          source.connect(delay);delay.connect(fb);fb.connect(delay);delay.connect(wet);wet.connect(destination);break;
        }
        case 'deep':chain(biquad('lowshelf',230,1,13),biquad('highshelf',1300,1,-12),gain(1.0));break;
        case 'high':chain(biquad('lowshelf',360,1,-11),biquad('highshelf',1700,1,12));break;
        case 'robot':
        case 'alien':{
          const band=biquad('bandpass',name==='robot'?950:1450,.45);
          const mod=gain(.53);const lfo=context.createOscillator();lfo.type='sine';lfo.frequency.value=name==='robot'?38:23;
          const depth=gain(.48);lfo.connect(depth);depth.connect(mod.gain);
          oscillators.push(lfo);lfo.start();chain(band,mod);
          if(name==='alien'){
            const delay=make(context.createDelay(.2));delay.delayTime.value=.08;
            const wet=gain(.25);source.connect(delay);delay.connect(wet);wet.connect(destination);
          }break;
        }
        case 'radio':chain(biquad('highpass',480),biquad('lowpass',2400),shaper(1.4));break;
        case 'cave':{
          chain(gain(.8));const delay=make(context.createDelay(.9));delay.delayTime.value=.17;
          const feedback=gain(.48),wet=gain(.48);
          source.connect(delay);delay.connect(feedback);feedback.connect(delay);delay.connect(wet);wet.connect(destination);break;
        }
        case 'megaphone':chain(biquad('highpass',600),biquad('lowpass',2000),shaper(4),gain(.85));break;
        case 'whisper':chain(biquad('highpass',650),biquad('highshelf',1900,1,8),gain(.8));break;
        case 'telephone':chain(biquad('highpass',350),biquad('lowpass',2700),gain(.95));break;
        default:source.connect(destination);
      }
    }catch(err){try{source.disconnect();source.connect(destination);}catch(_e){};return false;}
    return true;
  }
  effect(chosenVoiceEffect);
  context.resume().catch(()=>{});
  return {stream:destination.stream,effect,resume:()=>context.resume(),dispose(){
    try{source.disconnect();}catch(_e){}
    for(const n of nodes)try{n.disconnect();}catch(_e){}
    for(const o of oscillators)try{o.stop();}catch(_e){}
    context.close().catch(()=>{});
  }};
}
ui.voiceEffectSelect.addEventListener('change',()=>{
  const requested=ui.voiceEffectSelect.value;
  if(!VOICE_EFFECTS.has(requested))return;
  chosenVoiceEffect=requested;
  try{localStorage.setItem('ase-voice-effect',requested);}catch(_e){}
  if(callSession?.voiceProcessor){
    const ok=callSession.voiceProcessor.effect(requested);
    if(!ok)toast('Voice effect unavailable on this browser');
    callSession.voiceProcessor.resume().catch(()=>{});
  }else if(callSession?.stream)toast('Your browser cannot process the voice effect; microphone is unchanged.');
});

// Two-person, ephemeral, on-video gestures. Points and lines vanish after 2s idle.
let callDrawMode='off';
let activeCallDrawing=null;
const callShapes=new Map();
let lastDrawingEmit=0;
const NS='http://www.w3.org/2000/svg';
function clearCallDrawings(){
  activeCallDrawing=null;
  for(const shape of callShapes.values())clearTimeout(shape.timer);
  callShapes.clear();ui.callLocalDraw.replaceChildren();ui.callRemoteDraw.replaceChildren();
}
function setCallDrawMode(mode){
  callDrawMode=mode;
  ui.callStage.classList.toggle('draw-enabled',mode!=='off'&&callSession?.kind==='video');
  ui.callPointer.setAttribute('aria-pressed',String(mode==='point'));
  ui.callDraw.setAttribute('aria-pressed',String(mode==='draw'));
}
ui.callPointer.addEventListener('click',()=>setCallDrawMode(callDrawMode==='point'?'off':'point'));
ui.callDraw.addEventListener('click',()=>setCallDrawMode(callDrawMode==='draw'?'off':'draw'));
ui.callDrawOff.addEventListener('click',()=>setCallDrawMode('off'));
function renderCallShape(data){
  if(!callSession||callSession.id!==data.callId||callSession.kind!=='video')return;
  const key=`${data.ownerId}:${data.strokeId}`;
  const parent=data.ownerId===myId?ui.callLocalDraw:ui.callRemoteDraw;
  let item=callShapes.get(key);
  if(!item||data.phase==='start'||data.phase==='point'){
    if(item){clearTimeout(item.timer);item.node.remove();}
    const node=document.createElementNS(NS,data.phase==='point'?'circle':'polyline');
    parent.append(node);
    item={node,timer:null,points:[]};callShapes.set(key,item);
  }
  if(item.node.tagName.toLowerCase()==='circle'){
    item.node.setAttribute('cx',String(data.x*1000));item.node.setAttribute('cy',String(data.y*1000));item.node.setAttribute('r','20');
  }else{
    item.points.push(`${(data.x*1000).toFixed(1)},${(data.y*1000).toFixed(1)}`);
    // Bound line length, even if one participant keeps drawing for a long time.
    if(item.points.length>120)item.points.shift();
    item.node.setAttribute('points',item.points.join(' '));
  }
  clearTimeout(item.timer);
  item.timer=setTimeout(()=>{
    if(callShapes.get(key)===item){item.node.remove();callShapes.delete(key);}
  },2000);
}
function sendCallDraw(data){
  if(!callSession?.id)return;
  const packet={callId:callSession.id,...data};
  renderCallShape(packet);
  socket.emit('call:draw',packet);
}
for(const [overlay,whoseVideo] of [[ui.callLocalDraw,'self'],[ui.callRemoteDraw,'other']]){
  overlay.addEventListener('pointerdown',event=>{
    if(callDrawMode==='off'||callSession?.kind!=='video')return;
    event.preventDefault();
    const box=overlay.getBoundingClientRect();
    if(!box.width||!box.height)return;
    const point={x:Math.max(0,Math.min(1,(event.clientX-box.left)/box.width)),y:Math.max(0,Math.min(1,(event.clientY-box.top)/box.height))};
    const ownerId=whoseVideo==='self'?myId:callSession.peerId;
    const strokeId='d'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
    const mode=callDrawMode;
    activeCallDrawing={pointerId:event.pointerId,overlay,strokeId,ownerId,mode};
    try{overlay.setPointerCapture?.(event.pointerId);}catch(_e){} // A few SVG/mobile browsers do not support capture.
    sendCallDraw({ownerId,strokeId,phase:mode==='point'?'point':'start',...point});
    lastDrawingEmit=Date.now();
  });
  overlay.addEventListener('pointermove',event=>{
    if(!activeCallDrawing||activeCallDrawing.pointerId!==event.pointerId||activeCallDrawing.overlay!==overlay||activeCallDrawing.mode!=='draw')return;
    const now=Date.now();if(now-lastDrawingEmit<35)return;lastDrawingEmit=now;
    const box=overlay.getBoundingClientRect();
    const point={x:Math.max(0,Math.min(1,(event.clientX-box.left)/box.width)),y:Math.max(0,Math.min(1,(event.clientY-box.top)/box.height))};
    sendCallDraw({ownerId:activeCallDrawing.ownerId,strokeId:activeCallDrawing.strokeId,phase:'move',...point});
  });
  for(const type of ['pointerup','pointercancel','lostpointercapture'])overlay.addEventListener(type,event=>{
    if(activeCallDrawing?.pointerId!==event.pointerId||activeCallDrawing?.overlay!==overlay)return;
    activeCallDrawing=null;
  });
}
socket.on('call:draw',data=>{
  if(callSession?.id!==data?.callId)return;
  if(!['point','start','move','end'].includes(data.phase))return;
  if(!Number.isFinite(data.x)||!Number.isFinite(data.y)||data.x<0||data.x>1||data.y<0||data.y>1)return;
  renderCallShape(data);
});

// Calls are peer-to-peer WebRTC. No camera or microphone begins without a local user action.
const callRTCConfig={iceServers:[{urls:'stun:stun.l.google.com:19302'}]};
function callStatus(message){ui.callInfo.textContent=message;}
let callMinimized=false;
let miniCallPointer=null;
let miniCallLastTap=0;
let miniCallLastTapTarget='';
let miniCallDraggedAt=0;
function restoreCallStage(){
  if(ui.callStage.parentNode!==ui.callStageSlot)ui.callStageSlot.append(ui.callStage);
}
function minimizeCall(){
  if(!callSession&&!callStarting)return;
  ui.miniCallContent.append(ui.callStage); // Move active video nodes BEFORE closing dialog to preserve ongoing playback.
  if(ui.privateCallDialog.open)ui.privateCallDialog.close();
  ui.miniCallTitle.textContent=callSession?.kind==='video'?' VIDEO CALL':' PRIVATE CALL';
  ui.miniCall.style.left='';ui.miniCall.style.top='12px';ui.miniCall.style.right='12px';
  ui.miniCall.classList.remove('hidden');callMinimized=true;
  ui.callLocalVideo.play().catch(()=>{});ui.callRemoteVideo.play().catch(()=>{});
  toast('Call minimized · still connected. Tap END only when finished.');
}
function restoreCall(){
  if(!callMinimized)return;
  ui.miniCall.classList.add('hidden');callMinimized=false;restoreCallStage();
  if(!ui.privateCallDialog.open)ui.privateCallDialog.showModal();
}
function removeMiniCall(){
  callMinimized=false;ui.miniCall.classList.add('hidden');restoreCallStage();
  miniCallPointer=null;
}
function showCall(){
  if(ui.emergencyAlert.open)ui.emergencyAlert.close();
  if(callMinimized)restoreCall();
  else if(!ui.privateCallDialog.open)ui.privateCallDialog.showModal();
}
// Drag by the title bar using a pointer (touch, mouse or pen). Keep it within the viewport.
ui.miniCallHandle.addEventListener('pointerdown',event=>{
  if(event.target.closest('button'))return;
  const bounds=ui.miniCall.getBoundingClientRect();
  ui.miniCall.style.left=bounds.left+'px';ui.miniCall.style.top=bounds.top+'px';ui.miniCall.style.right='auto';
  miniCallPointer={id:event.pointerId,x:event.clientX,y:event.clientY,left:bounds.left,top:bounds.top,moved:false};
  ui.miniCallHandle.setPointerCapture?.(event.pointerId);
});
ui.miniCallHandle.addEventListener('pointermove',event=>{
  if(!miniCallPointer||event.pointerId!==miniCallPointer.id)return;
  const dx=event.clientX-miniCallPointer.x,dy=event.clientY-miniCallPointer.y;
  if(Math.hypot(dx,dy)>5)miniCallPointer.moved=true;
  const maxX=Math.max(0,window.innerWidth-ui.miniCall.offsetWidth),maxY=Math.max(0,window.innerHeight-ui.miniCall.offsetHeight);
  ui.miniCall.style.left=Math.max(0,Math.min(maxX,miniCallPointer.left+dx))+'px';
  ui.miniCall.style.top=Math.max(0,Math.min(maxY,miniCallPointer.top+dy))+'px';
});
function finishMiniDrag(event){
  if(miniCallPointer&&event.pointerId===miniCallPointer.id){
    if(miniCallPointer.moved)miniCallDraggedAt=Date.now();
    miniCallPointer=null;
  }
}
ui.miniCallHandle.addEventListener('pointerup',finishMiniDrag);
ui.miniCallHandle.addEventListener('pointercancel',finishMiniDrag);
function tapMiniCall(event){
  if(event.target.closest('button')||Date.now()-miniCallDraggedAt<500)return;
  const now=Date.now();const where=event.currentTarget.id;
  if(now-miniCallLastTap<420 && miniCallLastTapTarget===where){miniCallLastTap=0;restoreCall();}
  else{miniCallLastTap=now;miniCallLastTapTarget=where;}
}
ui.miniCallHandle.addEventListener('click',tapMiniCall);
ui.miniCallContent.addEventListener('click',tapMiniCall);
for(const element of [ui.miniCallHandle,ui.miniCallContent])element.addEventListener('dblclick',restoreCall);
ui.miniCallRestore.addEventListener('click',restoreCall);
ui.miniCallHangup.addEventListener('click',()=>closeCall());
function setPrimaryCallCamera(showMine){
  ui.callStage.classList.toggle('self-large',!!showMine);
  ui.callLocalVideo.setAttribute('title',showMine?'Your camera enlarged • tap the other video':'Tap your camera to enlarge it');
  ui.callRemoteVideo.setAttribute('title',showMine?'Tap the other person to enlarge':'Other person enlarged');
}
for(const [video,makeMineLarge] of [[ui.callLocalVideo,true],[ui.callRemoteVideo,false]]){
  video.addEventListener('click',()=>{
    if(callDrawMode!=='off'||callSession?.kind!=='video')return;
    setPrimaryCallCamera(makeMineLarge);
  });
}
function refreshCallView(){
  const active=!!callSession;
  ui.callIncomingActions.classList.toggle('hidden',!incomingCall);
  ui.callActiveActions.classList.toggle('hidden',!active);
  ui.callLocalVideo.classList.toggle('hidden',!active||callSession.kind!=='video');
  ui.callRemoteVideo.classList.toggle('hidden',!active||callSession.kind!=='video');
  ui.callAudioSymbol.classList.toggle('hidden',active&&callSession.kind==='video');
  ui.muteCall.textContent=callSession?.muted?'unmute mic':'mute mic';
  ui.reverseCallCamera.classList.toggle('hidden',!active||callSession.kind!=='video');
  ui.callCameraFilters.classList.toggle('hidden',!active||callSession.kind!=='video');
  ui.fullscreenCall.classList.toggle('hidden',!active||callSession.kind!=='video');
  ui.callExtraTools.classList.toggle('hidden',!active);
  ui.callDraw.parentElement.classList.toggle('hidden',!active||callSession.kind!=='video');
  if(!active || callSession.kind!=='video')setCallDrawMode('off');
}
async function acquireCallMedia(kind){
  if(!navigator.mediaDevices?.getUserMedia)throw Error('Microphone/camera requires HTTPS and browser permission.');
  return navigator.mediaDevices.getUserMedia({audio:true,video:kind==='video'?{facingMode:'user'}:false});
}
function cleanCall(notify=false){
  const session=callSession;
  if(notify && session)socket.emit('call:end',{callId:session.id});
  callSession=null;incomingCall=null;callStarting=false;
  if(session){
    try{session.pc?.close();}catch(_e){}
    session.cameraPipeline?.dispose();
    session.voiceProcessor?.dispose();
    session.stream?.getTracks().forEach(track=>track.stop());
    session.rawStream?.getTracks().forEach(track=>track.stop());
  }
  ui.callRemoteVideo.srcObject=null;ui.callLocalVideo.srcObject=null;ui.callRemoteAudio.srcObject=null;
  setCallDrawMode('off');clearCallDrawings();
  setPrimaryCallCamera(false);
  removeMiniCall();
  refreshCallView();
}
function closeCall(){cleanCall(true);if(ui.privateCallDialog.open)ui.privateCallDialog.close();}
ui.hangupCall.addEventListener('click',closeCall);
ui.closeCallDialog.addEventListener('click',()=>{
  if(callSession||callStarting){minimizeCall();return;}
  if(incomingCall)socket.emit('call:answer',{callId:incomingCall.callId,accept:false},()=>{});
  closeCall();
});
ui.privateCallDialog.addEventListener('cancel',event=>{event.preventDefault();ui.closeCallDialog.click();});
ui.muteCall.addEventListener('click',()=>{
  if(!callSession)return;
  callSession.muted=!callSession.muted;
  for(const track of callSession.stream?.getAudioTracks()||[])track.enabled=!callSession.muted;
  refreshCallView();
});
async function startPrivateCall(kind,to=target){
  if(callStarting||callSession||incomingCall){toast('Finish the current call first.');return;}
  if(to==='public'||!peer(to)){toast('Choose someone to call');return;}
  callStarting=true;showCall();ui.callTitle.textContent=kind==='video'?'video call':'voice call';
  callStatus(`Calling ${peer(to)?.name||'person'}…`);refreshCallView();
  socket.emit('call:invite',{to,kind},async result=>{
    callStarting=false;
    if(!result?.ok){
      callStatus(result?.error||'Call failed');
      if(callMinimized){removeMiniCall();if(ui.privateCallDialog.open)ui.privateCallDialog.close();toast(result?.error||'Call failed');}
      return;
    }
    callSession={id:result.callId,peerId:to,kind,initiator:true,pc:null,stream:null,pendingIce:[],muted:false};
    refreshCallView();callStatus('Ringing… the other person must accept.');
  });
}
ui.reverseCallCamera.addEventListener('click',async()=>{
  const session=callSession;
  if(!session||session.kind!=='video'||!session.rawStream)return;
  const nextFacing=session.facing==='user'?'environment':'user';
  ui.reverseCallCamera.disabled=true;
  try{
    const fresh=await requestFacingVideo(nextFacing);
    const newTrack=fresh.getVideoTracks()[0];
    if(session!==callSession){fresh.getTracks().forEach(t=>t.stop());return;}
    const old=session.rawStream.getVideoTracks()[0];
    try{
      if(session.cameraPipeline){await session.cameraPipeline.swapTrack(newTrack);}
      else{
        const sender=session.pc?.getSenders().find(s=>s.track?.kind==='video');
        if(sender)await sender.replaceTrack(newTrack);
        session.stream.removeTrack(old);session.stream.addTrack(newTrack);
        ui.callLocalVideo.srcObject=session.stream;
        ui.callLocalVideo.play().catch(()=>{});
      }
    }catch(error){fresh.getTracks().forEach(t=>t.stop());throw error;}
    session.rawStream.removeTrack(old);session.rawStream.addTrack(newTrack);
    old?.stop();session.facing=nextFacing;
    toast('Using '+(nextFacing==='user'?'front':'back')+' camera');
  }catch(err){toast('Could not reverse camera: '+(err.message||'unavailable'));}
  finally{ui.reverseCallCamera.disabled=false;}
});
ui.exitCallFullscreen.addEventListener('click',async()=>{
  if(document.fullscreenElement){try{await document.exitFullscreen();}catch(err){toast('Could not leave fullscreen');}}
});
ui.fullscreenCall.addEventListener('click',async()=>{
  if(callMinimized)restoreCall();
  try{
    if(document.fullscreenElement===ui.callStage)await document.exitFullscreen();
    else if(ui.callStage.requestFullscreen)await ui.callStage.requestFullscreen();
    else toast('Call fullscreen is not supported in this browser.');
  }catch(error){toast('Call fullscreen unavailable: '+(error.message||'blocked'));}
});
document.addEventListener('fullscreenchange',()=>{
  const fullCall=document.fullscreenElement===ui.callStage;
  ui.fullscreenCall.textContent=fullCall?'[ ] exit full':'[ ] fullscreen';
  ui.exitCallFullscreen.classList.toggle('hidden',!fullCall);
});
ui.voiceCallButton.addEventListener('click',()=>startPrivateCall('audio'));
ui.videoCallButton.addEventListener('click',()=>startPrivateCall('video'));
socket.on('call:incoming',data=>{
  if(callSession||incomingCall)return;
  incomingCall=data;
  ui.callTitle.textContent=`${data.kind} call · ${data.name}`;
  callStatus(`${data.name} is calling. Accept to enable your ${data.kind==='video'?'camera and microphone':'microphone'}.`);
  showCall();refreshCallView();
});
ui.declineCall.addEventListener('click',()=>{
  if(incomingCall)socket.emit('call:answer',{callId:incomingCall.callId,accept:false},()=>{});
  incomingCall=null;refreshCallView();ui.privateCallDialog.close();
});
async function startPeerMedia(session){
  const raw=await acquireCallMedia(session.kind);
  if(session!==callSession){raw.getTracks().forEach(t=>t.stop());return;}
  session.rawStream=raw;
  session.facing='user';
  session.cameraPipeline=session.kind==='video'?makeCameraPipeline(raw):null;
  session.voiceProcessor=createVoiceProcessor(raw);
  const cameraTracks=(session.cameraPipeline?.stream||raw).getVideoTracks();
  const audioTracks=(session.voiceProcessor?.stream||raw).getAudioTracks();
  session.stream=new MediaStream([...cameraTracks,...audioTracks]);
  const pc=new RTCPeerConnection(callRTCConfig);session.pc=pc;
  for(const track of session.stream.getTracks())pc.addTrack(track,session.stream);
  ui.callLocalVideo.srcObject=session.stream;ui.callLocalVideo.muted=true;
  ui.callLocalVideo.style.filter=session.cameraPipeline?'none':cameraFilterCSS();
  ui.callRemoteVideo.style.filter=cameraFilterCSS();
  ui.callLocalVideo.play().catch(()=>{});
  pc.ontrack=event=>{
    const stream=event.streams[0];
    if(!stream)return;
    if(session.kind==='video'){
      ui.callRemoteVideo.srcObject=stream;
      ui.callRemoteVideo.play().catch(()=>{});
    }else{
      ui.callRemoteAudio.srcObject=stream;
      ui.callRemoteAudio.play().catch(()=>callStatus('Tap your screen to allow audio playback.'));
    }
  };
  pc.onicecandidate=event=>{
    if(event.candidate)socket.emit('call:signal',{callId:session.id,signal:{type:'ice',candidate:event.candidate.toJSON()}});
  };
  pc.onconnectionstatechange=()=>{
    if(session===callSession){
      if(pc.connectionState==='connected')callStatus('Connected');
      if(pc.connectionState==='failed')callStatus('Connection failed · try ending and calling again.');
    }
  };
  await drainICE(session);
  refreshCallView();
}
async function drainICE(session){
  if(!session.pc?.remoteDescription)return;
  for(const ice of session.pendingIce.splice(0)){
    try{await session.pc.addIceCandidate(new RTCIceCandidate(ice));}catch(_e){}
  }
}
async function offerCall(session){
  if(!session||session!==callSession)return;
  try{
    await startPeerMedia(session);
    if(session!==callSession)return;
    const offer=await session.pc.createOffer();
    await session.pc.setLocalDescription(offer);
    socket.emit('call:signal',{callId:session.id,signal:{type:'offer',sdp:session.pc.localDescription.sdp}});
    callStatus('Connecting media…');
  }catch(err){callStatus(err.message||'Microphone/camera permission denied');closeCall();toast('Call could not start. Check permissions.');}
}
socket.on('call:accepted',data=>{
  if(callSession?.id===data.callId&&callSession.initiator)offerCall(callSession);
});
ui.acceptCall.addEventListener('click',async()=>{
  if(!incomingCall)return;
  const call=incomingCall;
  incomingCall=null;
  const session={id:call.callId,peerId:call.from,kind:call.kind,initiator:false,pc:null,stream:null,pendingIce:[],muted:false};
  callSession=session;refreshCallView();
  callStatus('Requesting your permission for the call…');
  try{
    await startPeerMedia(session);
    if(session!==callSession)return;
    socket.emit('call:answer',{callId:session.id,accept:true},result=>{
      if(!result?.ok){callStatus(result?.error||'Call expired');closeCall();}
      else callStatus('Connecting…');
    });
  }catch(err){callStatus(err.message||'Permission denied');socket.emit('call:answer',{callId:session.id,accept:false},()=>{});cleanCall();if(ui.privateCallDialog.open)ui.privateCallDialog.close();}
});
socket.on('call:signal',async data=>{
  const session=callSession;if(!session||session.id!==data.callId)return;
  const signal=data.signal;
  try{
    if(signal.type==='ice'){
      if(session.pc?.remoteDescription)await session.pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
      else session.pendingIce.push(signal.candidate);
    }else if(signal.type==='offer'){
      if(!session.pc)return;
      await session.pc.setRemoteDescription(new RTCSessionDescription({type:'offer',sdp:signal.sdp}));
      await drainICE(session);
      const answer=await session.pc.createAnswer();
      await session.pc.setLocalDescription(answer);
      socket.emit('call:signal',{callId:session.id,signal:{type:'answer',sdp:session.pc.localDescription.sdp}});
    }else if(signal.type==='answer'){
      if(!session.pc)return;
      await session.pc.setRemoteDescription(new RTCSessionDescription({type:'answer',sdp:signal.sdp}));
      await drainICE(session);
    }
  }catch(error){callStatus('Connection error: '+(error.message||'Unknown'));}
});
socket.on('call:ended',data=>{
  if(callSession?.id===data.callId||incomingCall?.callId===data.callId){
    cleanCall();if(ui.privateCallDialog.open)ui.privateCallDialog.close();
    toast(data.reason||'Call ended');
  }
});
socket.on('disconnect',()=>{stopRadio();cleanCall();closeBrowserCamera();});
refreshCallView();updateTrustControls();
