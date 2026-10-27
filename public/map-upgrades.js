/* ASE v3.1: quick markers, zoom, priority, media, voice notes, favorite tools, history.
   The underlying server still authorizes every room and map mutation. */
(() => {
'use strict';
const el=id=>document.getElementById(id);
const canvas=el('mapCanvas');
if(!canvas)return;
const MARK_PRESETS=['Alert','Info','Help','Meeting','Checkpoint','Observe','Custom'];
const DEFAULT_PHRASES=['Check this point','Meet here','Need assistance','Area clear','Watch this location','Follow this path'];
const QUICK_ACTIONS={quick:'QUICK MARK',mark:'MARK + NOTE',path:'PATH',photo:'PHOTO + MARK',video:'VIDEO + MARK',voice:'VOICE MARK',drag:'DRAG MARKS',history:'HISTORY'};
const MARK_COLORS=['#ff4d62','#f0d067','#5bccf3','#6ae0a1','#fafafa','#9f89ff'];
const MAX_THUMBS=6;
let zoom=1,panX=0,panY=0,panMode=false,dragEnabled=false,ignoreClickUntil=0,mediaFilter='color',voiceRecording=null,voiceStream=null,voiceBlob=null;
let markerHistory=[],mediaCache=new Map(),pendingMedia=new Set(),favoriteIds=['quick','photo','video'];
let selectedPreset='Alert',selectedPriority=1,selectedColor='#ff4d62',selectedTtl=0,selectedPhrase='';
try{const saved=JSON.parse(localStorage.getItem('ase-map-v31-options')||'{}');
 if(MARK_PRESETS.includes(saved.preset))selectedPreset=saved.preset;
 if([1,2].includes(saved.priority))selectedPriority=saved.priority;
 if(MARK_COLORS.includes(saved.color))selectedColor=saved.color;
 if([0,30000,300000,900000,3600000].includes(saved.ttl))selectedTtl=saved.ttl;
 if(Array.isArray(saved.favorites)&&saved.favorites.length===3&&saved.favorites.every(v=>QUICK_ACTIONS[v]))favoriteIds=saved.favorites;
}catch{}
const saveOptions=()=>{try{localStorage.setItem('ase-map-v31-options',JSON.stringify({preset:selectedPreset,priority:selectedPriority,color:selectedColor,ttl:selectedTtl,favorites:favoriteIds}))}catch{}};
const currentRoom=()=>target==='public'?'public':`dm:${[myId,target].sort().join(':')}`;
const labelTime=t=>new Date(t||Date.now()).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',hour12:false});
const itemPriority=a=>a.priority===1?1:2;
const timeCaption=a=>`${labelTime(a.time)} · ${itemPriority(a)} ${itemPriority(a)===1?'IMPORTANT':'LOW'}`;
const colorSafe=v=>MARK_COLORS.includes(v)?v:'#ff4d62';
function settings(){return {priority:selectedPriority,color:selectedColor,preset:selectedPreset,ttl:selectedTtl};}
function setHistory(list){markerHistory=Array.isArray(list)?list.slice(-100):[];renderHistoryIfOpen();}
function appendHistory(event){if(!markerHistory.some(e=>e.id===event.id))markerHistory.push(event);markerHistory=markerHistory.slice(-100);renderHistoryIfOpen();}
function clearMediaCache(){for(const url of mediaCache.values())URL.revokeObjectURL(url);mediaCache.clear();pendingMedia.clear();}
function clearItemMedia(id){const key=`${currentRoom()}|${id}`;const url=mediaCache.get(key);if(url)URL.revokeObjectURL(url);mediaCache.delete(key);pendingMedia.delete(key);}
function mediaUrl(a,callback){
 const key=`${currentRoom()}|${a.id}`;
 if(mediaCache.has(key)){callback(mediaCache.get(key));return}
 if(pendingMedia.has(key)||mediaCache.size>MAX_THUMBS)return;
 pendingMedia.add(key);const room=target;
 socket.timeout(25000).emit('map:media:get',{to:room,id:a.id},(error,result)=>{
  pendingMedia.delete(key);
  if(error||!result?.ok||target!==room)return;
  const bytes=result.bytes instanceof ArrayBuffer?result.bytes:(result.bytes?.type==='Buffer'?new Uint8Array(result.bytes.data):result.bytes);
  if(!bytes)return;
  const url=URL.createObjectURL(new Blob([bytes],{type:result.mime}));
  mediaCache.set(key,url);callback(url);
 });
}
// The original map is an image. Scaling the single world layer preserves pin and route alignment.
const world=document.createElement('div');world.className='map-world';world.id='aseMapWorld';
for(const id of ['mapImage','mapLines','mapPins']){const child=el(id);if(child)world.append(child)}
canvas.insertBefore(world,canvas.firstChild);
// One transformed world layer keeps image, marker positions, area outlines, and
// multiplayer live arrows aligned during pinch/drag/pan.
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
function applyViewport(){
 const rangeX=(zoom-1)*canvas.clientWidth/2,rangeY=(zoom-1)*canvas.clientHeight/2;
 panX=clamp(panX,-rangeX,rangeX);panY=clamp(panY,-rangeY,rangeY);
 world.style.transform=`translate(${panX}px,${panY}px) scale(${zoom})`;
 canvas.classList.toggle('zoom-details',zoom>=1.7);
 canvas.classList.toggle('pan-mode',panMode);
 canvas.classList.toggle('pan-available',zoom>1);
 el('aseZoomLabel').textContent=zoom.toFixed(1)+'×';
}
function setZoom(value,clientX,clientY){
 const previous=zoom;
 const next=Math.min(4.5,Math.max(1,Math.round(value*100)/100));
 if(next!==previous&&Number.isFinite(clientX)&&Number.isFinite(clientY)){
  const rect=canvas.getBoundingClientRect();
  const x=clientX-rect.left-rect.width/2;
  const y=clientY-rect.top-rect.height/2;
  const ratio=next/previous;
  panX-=(ratio-1)*(x-panX);panY-=(ratio-1)*(y-panY);
 }
 zoom=next;
 if(zoom===1){panX=0;panY=0}
 applyViewport();paintMap();
}
function pointFromClient(clientX,clientY){const rect=canvas.getBoundingClientRect();
 return {x:Math.max(0,Math.min(1,0.5+(clientX-rect.left-rect.width/2-panX)/(rect.width*zoom))),
   y:Math.max(0,Math.min(1,0.5+(clientY-rect.top-rect.height/2-panY)/(rect.height*zoom)))};
}
function canPan(){return onMap&&zoom>1&&(panMode||(toolMode==='browse'&&!window.ASELive?.active?.()))}
function setPanMode(value){
 panMode=!!value;
 if(panMode){resetTool();toolMode='browse';window.ASELive?.stop?.();paintMap()}
 el('asePanToggle').textContent=panMode?'PAN ON':'PAN MAP';
 el('asePanToggle').classList.toggle('active',panMode);
 el('asePanToggle').setAttribute('aria-pressed',String(panMode));
 applyViewport();
}
window.addEventListener('resize',applyViewport);
function ignoreTap(){return Date.now()<ignoreClickUntil;}
const zoomControls=document.createElement('div');zoomControls.className='ase-zoom-controls';zoomControls.innerHTML=`
  <button type="button" id="aseZoomOut" aria-label="Zoom out">−</button>
  <output id="aseZoomLabel">1.0×</output>
  <button type="button" id="aseZoomIn" aria-label="Zoom in">+</button>
  <button type="button" id="aseZoomReset">RESET</button>
  <button type="button" id="asePanToggle" aria-pressed="false">PAN MAP</button>`;
canvas.append(zoomControls);
zoomControls.addEventListener('click',e=>e.stopPropagation());
zoomControls.addEventListener('pointerdown',e=>e.stopPropagation());
el('aseZoomOut').onclick=()=>setZoom(zoom-.25);
el('aseZoomIn').onclick=()=>setZoom(zoom+.25);
el('aseZoomReset').onclick=()=>{panX=0;panY=0;setZoom(1)};
el('asePanToggle').onclick=()=>setPanMode(!panMode);
canvas.addEventListener('wheel',e=>{if(!onMap)return;e.preventDefault();setZoom(zoom+(e.deltaY<0?.22:-.22),e.clientX,e.clientY)},{passive:false});
// Two fingers pinch/translate the world. One finger pans in Browse mode when
// zoomed, or in explicit PAN mode. Dragging will never create a live mark.
const touches=new Map();let single=null,pinch=null;
canvas.addEventListener('click',e=>{
 if(ignoreTap()){e.preventDefault();e.stopImmediatePropagation();ignoreClickUntil=0}
},true);
canvas.addEventListener('pointerdown',e=>{
 if(!onMap||e.button!==0&&e.pointerType==='mouse')return;
 if(e.target.closest('button,input,select,.map-pin,.map-note,.ase-mini-preview,.ase-zoom-controls'))return;
 touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(touches.size===2||canPan()){try{canvas.setPointerCapture(e.pointerId)}catch{}}
 if(touches.size===2){
  for(const id of touches.keys()){try{canvas.setPointerCapture(id)}catch{}}
  const [a,b]=[...touches.values()];
  pinch={distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),startZoom:zoom,midX:(a.x+b.x)/2,midY:(a.y+b.y)/2};
  single=null;ignoreClickUntil=Date.now()+650;
 }else if(touches.size===1&&canPan())single={id:e.pointerId,x:e.clientX,y:e.clientY,px:panX,py:panY,moved:false};
});
canvas.addEventListener('pointermove',e=>{
 if(touches.has(e.pointerId))touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(pinch&&touches.size>=2){
  const [a,b]=[...touches.values()];
  const midX=(a.x+b.x)/2,midY=(a.y+b.y)/2;
  const distance=Math.hypot(a.x-b.x,a.y-b.y);
  setZoom(pinch.startZoom*distance/pinch.distance,midX,midY);
  panX+=midX-pinch.midX;panY+=midY-pinch.midY;
  pinch.midX=midX;pinch.midY=midY;applyViewport();
  ignoreClickUntil=Date.now()+650;
 }else if(single?.id===e.pointerId&&canPan()){
  const dx=e.clientX-single.x,dy=e.clientY-single.y;
  if(Math.hypot(dx,dy)>4)single.moved=true;
  if(single.moved){panX=single.px+dx;panY=single.py+dy;applyViewport();ignoreClickUntil=Date.now()+550}
 }
});
function endGesture(e){
 if(single?.id===e.pointerId&&single.moved)ignoreClickUntil=Date.now()+550;
 if(pinch)ignoreClickUntil=Date.now()+650;
 touches.delete(e.pointerId);try{canvas.releasePointerCapture(e.pointerId)}catch{}
 if(touches.size<2)pinch=null;
 single=null;
}
canvas.addEventListener('pointerup',endGesture);
canvas.addEventListener('pointercancel',endGesture);
applyViewport();

// High-priority marks reveal notes on zoom. Low-priority media show a compact card above their position.
function decorateMap(){
 const pins=[...ui.mapPins.querySelectorAll('button.map-pin:not(.draft)')];let index=0;
 for(const a of annotations){
  for(let j=0;j<(a.kind==='area'?1:a.points.length);j++){
   const btn=pins[index++];if(!btn)continue;
   btn.dataset.mapId=a.id;btn.dataset.priority=String(itemPriority(a));btn.dataset.mapTime=String(a.time);
   btn.style.setProperty('--marker-color',colorSafe(a.color));
   btn.classList.add(itemPriority(a)===1?'importance-1':'importance-2');
   btn.title=`${a.note||a.kind} · ${timeCaption(a)}`;
   btn.setAttribute('aria-label',`${a.kind} ${a.note||''} created ${labelTime(a.time)} priority ${itemPriority(a)}`);
   if(a.kind==='voice'){
    btn.textContent='AUDIO';
    btn.addEventListener('click',ev=>{ev.stopImmediatePropagation();openVoice(a)},{capture:true});
   }
   if(a.userId===myId&&a.kind!=='path')bindDrag(btn,a);
  }
  if(!a.points.length)continue;
  const pos=a.kind==='area'?{x:a.points.reduce((v,p)=>v+p.x,0)/a.points.length,y:a.points.reduce((v,p)=>v+p.y,0)/a.points.length}:a.points[Math.floor((a.points.length-1)/2)];
  if(a.kind==='voice'||a.kind==='pin'||a.kind==='report'||a.kind==='area'){
   const stamp=document.createElement('div');stamp.className='ase-mark-stamp';stamp.style.left=`${pos.x*100}%`;stamp.style.top=`${pos.y*100}%`;
   stamp.dataset.mapId=a.id;stamp.dataset.mapTime=String(a.time);stamp.textContent=`${itemPriority(a)} · ${labelTime(a.time)}`;
   stamp.style.setProperty('--marker-color',colorSafe(a.color));ui.mapPins.append(stamp);
  }
  if(zoom>=1.7){
   if(itemPriority(a)===2&&(a.kind==='report'||a.kind==='voice'))showMiniMedia(a,pos);
   else if(itemPriority(a)===1&&a.kind!=='path'){
    const detail=document.createElement('div');detail.className='ase-priority-detail';detail.dataset.mapId=a.id;detail.dataset.mapTime=String(a.time);
    detail.style.left=`${pos.x*100}%`;detail.style.top=`${pos.y*100}%`;
    detail.style.setProperty('--marker-color',colorSafe(a.color));
    const name=document.createElement('strong');name.textContent=`${a.preset||a.kind.toUpperCase()} / 1`;
    const text=document.createElement('span');text.textContent=(a.note||`${a.kind.toUpperCase()} MARK`).slice(0,70);
    const stamp=document.createElement('small');stamp.textContent=labelTime(a.time);
    detail.append(name,text,stamp);ui.mapPins.append(detail);
   }
  }
 }
 window.ASEExtras?.decorateClusters?.(zoom);
}
function showMiniMedia(a,pos){
 const tile=document.createElement('button');tile.type='button';tile.className='ase-mini-preview';tile.dataset.mapId=a.id;tile.dataset.mapTime=String(a.time);
 tile.style.left=`${pos.x*100}%`;tile.style.top=`${pos.y*100}%`;
 tile.setAttribute('aria-label',`Open ${a.kind} attached at ${labelTime(a.time)}`);
 const head=document.createElement('span');head.className='ase-mini-caption';head.textContent=`${a.kind==='voice'?'AUDIO':a.mediaKind==='video'?'VIDEO':'PHOTO'} / 2 · ${labelTime(a.time)}`;
 const holder=document.createElement('div');holder.className='ase-mini-media';holder.textContent='MEDIA LOADING';
 tile.append(head,holder);
 tile.onclick=e=>{e.stopPropagation();a.kind==='voice'?openVoice(a):openReportViewer(a)};
 ui.mapPins.append(tile);
 const put=url=>{
  if(!tile.isConnected)return;
  holder.replaceChildren();
  if(a.kind==='voice'){holder.textContent='▶ LISTEN TO VOICE NOTE';return}
  const media=document.createElement(a.mediaKind==='video'?'video':'img');
  if(media.tagName==='VIDEO'){media.muted=true;media.loop=true;media.autoplay=true;media.playsInline=true;media.preload='metadata';media.play().catch(()=>{})}
  else media.alt='Map media thumbnail';
  media.src=url;holder.append(media);
 };
 if(a.kind==='voice'){put(null)}else mediaUrl(a,put);
}
let dragSession=null;
function bindDrag(button,a){
 button.addEventListener('pointerdown',e=>{
  if(!dragEnabled||toolMode!=='browse')return;
  e.preventDefault();e.stopPropagation();
  dragSession={id:a.id,origin:a.points[0],x:e.clientX,y:e.clientY,pid:e.pointerId,button};
  button.setPointerCapture?.(e.pointerId);
  button.classList.add('drag-moving');
 });
 button.addEventListener('pointermove',e=>{
  if(!dragSession||dragSession.button!==button||dragSession.pid!==e.pointerId)return;
  const p=pointFromClient(e.clientX,e.clientY);
  button.style.left=`${p.x*100}%`;button.style.top=`${p.y*100}%`;
 });
 button.addEventListener('pointerup',e=>{
  if(!dragSession||dragSession.button!==button||dragSession.pid!==e.pointerId)return;
  const session=dragSession;dragSession=null;button.classList.remove('drag-moving');
  const p=pointFromClient(e.clientX,e.clientY);
  ignoreClickUntil=Date.now()+600;
  button.addEventListener('click',ev=>{ev.preventDefault();ev.stopImmediatePropagation()},{capture:true,once:true});
  socket.emit('map:update',{to:target,id:session.id,points:[p]},result=>{
    if(!result?.ok){toast(result?.error||'Could not move marker');paintMap();}
  });
 });
}
function focusItem(id){
 const item=annotations.find(a=>a.id===id);if(!item)return toast('This mark is no longer available.');
 setZoom(2);
 const center=item.points?.[Math.floor((item.points.length-1)/2)];
 if(center){panX=(.5-center.x)*canvas.clientWidth*zoom;panY=(.5-center.y)*canvas.clientHeight*zoom;applyViewport()}
 noteOpenId=item.id;paintMap();
 const button=[...ui.mapPins.querySelectorAll('button.map-pin')].find(btn=>btn.dataset.mapId===id);
 if(button){button.classList.add('ase-highlight');setTimeout(()=>button.classList.remove('ase-highlight'),1900);}
}

const strip=document.createElement('section');strip.id='aseMarkStrip';strip.className='ase-mark-strip';strip.setAttribute('aria-label','Quick map marker tools');
strip.innerHTML=`
 <div class="ase-mark-strip-row">
  <button id="aseMapQuick" type="button">QUICK MARK</button>
  <button id="aseMapPhoto" type="button">PHOTO + MARK</button>
  <button id="aseMapVideo" type="button">VIDEO + MARK</button>
  <button id="aseMapVoice" type="button">VOICE MARK</button>
  <button id="aseMapDrag" type="button">DRAG OFF</button>
 </div>
 <div class="ase-mark-options">
  <label>PRESET <select id="aseMapPreset">${MARK_PRESETS.map(v=>`<option>${v}</option>`).join('')}</select></label>
  <label>IMPORTANCE <select id="aseMapPriority"><option value="1">1 · IMPORTANT</option><option value="2">2 · LESS IMPORTANT</option></select></label>
  <label>COLOR <select id="aseMapColor">${MARK_COLORS.map(c=>`<option value="${c}">${({'#ff4d62':'RED','#f0d067':'YELLOW','#5bccf3':'BLUE','#6ae0a1':'GREEN','#fafafa':'WHITE','#9f89ff':'PURPLE'})[c]}</option>`).join('')}</select></label>
  <label>EXPIRES <select id="aseMapExpiry"><option value="0">NEVER</option><option value="30000">30 SEC</option><option value="300000">5 MIN</option><option value="900000">15 MIN</option><option value="3600000">1 HOUR</option></select></label>
 </div>
 <div class="ase-phrase-bar" id="aseMapPhrases"></div>`;
el('mapHelp').after(strip);
const settingsInputs={preset:el('aseMapPreset'),priority:el('aseMapPriority'),color:el('aseMapColor'),ttl:el('aseMapExpiry')};
settingsInputs.preset.value=selectedPreset;settingsInputs.priority.value=selectedPriority;
settingsInputs.color.value=selectedColor;settingsInputs.ttl.value=selectedTtl;
settingsInputs.preset.onchange=()=>{selectedPreset=settingsInputs.preset.value;saveOptions()};
settingsInputs.priority.onchange=()=>{selectedPriority=Number(settingsInputs.priority.value);saveOptions()};
settingsInputs.color.onchange=()=>{selectedColor=settingsInputs.color.value;saveOptions()};
settingsInputs.ttl.onchange=()=>{selectedTtl=Number(settingsInputs.ttl.value);saveOptions()};
function quickPlace(p){
 if(!myId){toast('Join a room first');return}
 socket.emit('map:add',{to:target,base:'reference',kind:'pin',points:[p],note:selectedPhrase||selectedPreset,
  ...settings()},result=>{if(!result?.ok)toast(result?.error||'Quick mark failed');else toast('Quick mark added / '+selectedPreset)});
}
function startQuickMark(){
 if(!myId)return toast('Join the chat first.');
 setPanMode(false);
 if(!onMap)enterMap();
 toolMode='quick-pin';paintMap();
 toast('QUICK MARK: Tap multiple points. Tap MARK to exit.');
}
function action(name){
 if(!myId)return toast('Join the chat first');
 if(!onMap)enterMap();
 if(name==='quick')startQuickMark();
 if(name==='mark'){ui.pinButton.click()}
 if(name==='path'){ui.pathButton.click()}
 if(name==='photo'){openMapCapture('photo')}
 if(name==='video'){openMapCapture('video')}
 if(name==='voice'){startVoiceMarker()}
 if(name==='drag'){dragEnabled=!dragEnabled;resetTool();el('aseMapDrag').textContent=dragEnabled?'DRAG ON':'DRAG OFF';el('aseMapDrag').classList.toggle('active',dragEnabled);toast(dragEnabled?'Drag your own markers to move them.':'Marker dragging off.')}
 if(name==='history'){mapListTab='history';renderMap();el('aseHistoryTab')?.scrollIntoView?.({block:'nearest'})}
}
el('aseMapQuick').onclick=()=>action('quick');el('aseMapPhoto').onclick=()=>action('photo');
el('aseMapVideo').onclick=()=>action('video');el('aseMapVoice').onclick=()=>action('voice');el('aseMapDrag').onclick=()=>action('drag');
for(const phrase of DEFAULT_PHRASES){const btn=document.createElement('button');btn.type='button';btn.textContent=phrase;
 btn.onclick=()=>{selectedPhrase=phrase;[...el('aseMapPhrases').children].forEach(b=>b.classList.toggle('active',b===btn));
   if(ui.noteDialog.open)ui.noteInput.value=phrase;
   if(ui.reportDialog.open)ui.reportNote.value=phrase;
 };el('aseMapPhrases').append(btn)}
// Existing note and report dialogs also use the currently selected priority, color and expiration.
const noteHint=document.createElement('p');noteHint.className='ase-map-hint';noteHint.textContent='Importance, color, preset, and expiration use the map selections.';
el('noteInput').after(noteHint);el('reportNote').after(noteHint.cloneNode(true));

// Recorded camera media embeds one of three simulated palettes into the captured file.
const modeLine=document.createElement('label');modeLine.className='ase-camera-mode';modeLine.innerHTML=`CAMERA LOOK <select id="aseMapCaptureMode"><option value="color">COLOR</option><option value="night">NIGHT VISION</option><option value="heat">HEAT / STYLED</option></select>`;
el('mapCaptureStatus').after(modeLine);
function cameraFilter(){return mediaFilter==='night'?'grayscale(1) sepia(1) hue-rotate(65deg) saturate(3) contrast(1.45) brightness(.78)':
 mediaFilter==='heat'?'grayscale(1) sepia(1) saturate(6) hue-rotate(313deg) contrast(1.7) brightness(1.15)':'none';}
function setMediaFilter(value){mediaFilter=['color','night','heat'].includes(value)?value:'color';
 el('aseMapCaptureMode').value=mediaFilter;ui.mapCapturePreview.style.filter=cameraFilter();
}
el('aseMapCaptureMode').addEventListener('change',e=>setMediaFilter(e.target.value));

// Eight-second microphone attachment, stopped and saved only by explicit user action.
const voiceDialog=document.createElement('dialog');voiceDialog.id='aseVoiceDialog';voiceDialog.className='media-dialog';
voiceDialog.innerHTML=`<div class="media-heading"><strong>VOICE MARKER</strong><button type="button" id="aseCloseVoice">X</button></div>
<p class="report-help" id="aseVoiceStatus">Your microphone is used only while recording.</p>
<div class="media-actions"><button type="button" id="aseVoiceRecord">START RECORDING</button><button type="button" id="aseVoiceStop">STOP / USE</button></div>
<p class="report-help">Maximum 8 seconds. The recording is sent to this conversation only after you place the voice marker on the map.</p>`;
document.body.append(voiceDialog);
const stopBtn=el('aseVoiceStop');stopBtn.disabled=true;
function stopMic(){voiceStream?.getTracks().forEach(t=>t.stop());voiceStream=null}
function supportedAudio(){
 if(typeof MediaRecorder==='undefined')return '';
 for(const m of ['audio/webm;codecs=opus','audio/webm','audio/mp4','audio/ogg'])if(MediaRecorder.isTypeSupported(m))return m;
 return '';
}
function startVoiceMarker(){
 if(!navigator.mediaDevices?.getUserMedia)return toast('An HTTPS website is needed for voice recording.');
 voiceDialog.showModal();
}
el('aseCloseVoice').onclick=()=>{if(voiceRecording?.state==='recording')voiceRecording.stop();voiceDialog.close();stopMic()};
voiceDialog.addEventListener('cancel',e=>{e.preventDefault();el('aseCloseVoice').click()});
el('aseVoiceRecord').onclick=async()=>{
 if(voiceRecording?.state==='recording')return;
 const mime=supportedAudio();if(!mime){el('aseVoiceStatus').textContent='Audio recording not supported by this browser.';return}
 try{voiceStream=await navigator.mediaDevices.getUserMedia({audio:true});
  let chunks=[],timer=null;const recorder=new MediaRecorder(voiceStream,{mimeType:mime,audioBitsPerSecond:64000});
  voiceRecording=recorder;el('aseVoiceRecord').disabled=true;stopBtn.disabled=false;
  el('aseVoiceStatus').textContent='RECORDING NOW · Maximum 8 seconds';
  recorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data)};
  recorder.onstop=()=>{clearTimeout(timer);stopMic();stopBtn.disabled=true;el('aseVoiceRecord').disabled=false;
   voiceRecording=null;
   const blob=new Blob(chunks,{type:recorder.mimeType.split(';')[0]});chunks=[];
   if(blob.size<100||blob.size>1200000){el('aseVoiceStatus').textContent='Voice note too small or too large. Try again.';return}
   voiceBlob=blob;voiceDialog.close();toolMode='voice';paintMap();toast('Tap map location to attach your voice marker.');
  };
  recorder.start(200);timer=setTimeout(()=>{if(recorder.state==='recording')recorder.stop()},8000);
 }catch(e){stopMic();el('aseVoiceStatus').textContent='Microphone unavailable: '+e.message}
};
stopBtn.onclick=()=>{if(voiceRecording?.state==='recording')voiceRecording.stop()};
async function saveVoice(points,note,meta){
 if(!voiceBlob)return toast('No voice recording selected.');
 const blob=voiceBlob,room=target;
 try{const bytes=await blob.arrayBuffer();const result=await new Promise(resolve=>socket.timeout(25000).emit('map:voice',{
  to:room,points,bytes,mime:blob.type,note,...meta},(error,data)=>resolve(error?{ok:false,error:'Upload timed out'}:data)));
  if(!result?.ok)throw Error(result?.error||'Voice upload failed');voiceBlob=null;toast('Voice marker saved.');
 }catch(e){toast(e.message)}
}
const listenDialog=document.createElement('dialog');listenDialog.className='media-dialog';listenDialog.id='aseListenDialog';
listenDialog.innerHTML=`<div class="media-heading"><strong>VOICE MARKER</strong><button id="aseCloseListen" type="button">X</button></div><p id="aseListenInfo" class="report-help"></p><audio id="aseListenPlayer" controls preload="none" style="width:100%"></audio>`;
document.body.append(listenDialog);let voiceUrl=null;
el('aseCloseListen').onclick=()=>listenDialog.close();
listenDialog.addEventListener('close',()=>{el('aseListenPlayer').pause();el('aseListenPlayer').removeAttribute('src');if(voiceUrl)URL.revokeObjectURL(voiceUrl);voiceUrl=null});
function openVoice(a){
 if(listenDialog.open)listenDialog.close();
 el('aseListenInfo').textContent=`${a.name} / ${labelTime(a.time)} / ${a.note||'Voice marker'}`;
 listenDialog.showModal();
 socket.timeout(25000).emit('map:media:get',{to:target,id:a.id},(error,result)=>{
  if(!listenDialog.open||error||!result?.ok)return;
  const bytes=result.bytes instanceof ArrayBuffer?result.bytes:(result.bytes?.type==='Buffer'?new Uint8Array(result.bytes.data):result.bytes);
  if(!bytes)return;voiceUrl=URL.createObjectURL(new Blob([bytes],{type:result.mime}));
  el('aseListenPlayer').src=voiceUrl;
 });
}
// Room history retained only while the server session is active.
const historyTab=document.createElement('button');historyTab.type='button';historyTab.id='aseHistoryTab';historyTab.textContent='HISTORY';
const tabbar=el('marksTab').parentElement;tabbar.append(historyTab);
historyTab.onclick=()=>{mapListTab='history';renderMap()};
function renderHistoryIfOpen(){if(mapListTab==='history')decorateList()}
function decorateList(){historyTab.classList.toggle('active',mapListTab==='history');
 historyTab.setAttribute('aria-selected',String(mapListTab==='history'));
 if(mapListTab!=='history')return;
 for(const id of ['marksTab','reportsTab']){el(id).classList.remove('active');el(id).setAttribute('aria-selected','false')}
 const list=el('annotationList');list.replaceChildren();
 if(!markerHistory.length){const d=document.createElement('span');d.className='annotation-empty';d.textContent='No recent marker activity';list.append(d);return}
 for(const h of [...markerHistory].reverse()){
  const btn=document.createElement('button');btn.type='button';btn.className='ase-history-entry';
  btn.textContent=`${labelTime(h.time)}  ${h.action}  ${h.kind.toUpperCase()}  / ${h.name} / ${h.note||'--'}`;
  btn.onclick=()=>focusItem(h.markId);list.append(btn)
 }
}

// Three user-selectable favorites sit under the fixed navigation bar, not over another button.
const mapFavBar=document.createElement('div');mapFavBar.className='ase-map-favorite-bar';mapFavBar.id='aseMapFavBar';
strip.querySelector('.ase-mark-strip-row')?.after(mapFavBar);
const dock=el('aseQuickAccess');
if(dock){
 const favBar=document.createElement('div');favBar.id='aseFavBar';favBar.className='ase-favorite-bar';
 dock.querySelector('.ase-quick-bar')?.after(favBar);
 const favSettings=document.createElement('div');favSettings.className='ase-favorite-settings';favSettings.innerHTML='<strong>FAVORITE TOOLS</strong>';
 function renderFavs(){favBar.replaceChildren();mapFavBar.replaceChildren();for(let i=0;i<3;i++){
  for(const parent of [favBar,mapFavBar]){const b=document.createElement('button');b.type='button';b.textContent=QUICK_ACTIONS[favoriteIds[i]];b.title=`Favorite ${i+1}`;b.onclick=e=>{e.stopPropagation();action(favoriteIds[i])};parent.append(b)}
 }}
 for(let i=0;i<3;i++){
  const select=document.createElement('select');select.setAttribute('aria-label',`Favorite tool ${i+1}`);
  Object.entries(QUICK_ACTIONS).forEach(([id,name])=>select.add(new Option(name,id)));
  select.value=favoriteIds[i];select.onchange=()=>{favoriteIds[i]=select.value;saveOptions();renderFavs()};favSettings.append(select)
 }
 const menu=dock.querySelector('.ase-quick-menu');menu?.append(favSettings);renderFavs();
}
window.ASEMap={getSettings:settings,setHistory,appendHistory,decorateMap,decorateList,
 clearMediaCache,clearItemMedia,pointFromClient,ignoreTap,quickPlace,saveVoice,cameraFilter,selectedMediaFilter:()=>mediaFilter,
 focusItem,action,startQuickMark,setZoom,getZoom:()=>zoom,getPan:()=>({x:panX,y:panY}),setPanMode,voiceStatus:()=>!!voiceBlob};
// Extra quick action from the main dock keeps original MARK and PATH intact.
const quickBar=el('aseQuickAccess')?.querySelector('.ase-quick-bar');
if(quickBar){const b=document.createElement('button');b.id='aseOneTapQuick';b.type='button';b.textContent='QUICK';b.onclick=startQuickMark;quickBar.insertBefore(b,quickBar.firstChild)}
})();
