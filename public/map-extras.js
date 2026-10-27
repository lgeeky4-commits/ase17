/* ASE v3.2 - room-scoped marker clustering, area controls, search, and local MP3 sound studio. */
(() => {
'use strict';
const $=id=>document.getElementById(id);
const EVENT_NAMES={click:'BUTTON CLICK',mark:'MARK ADDED',priority:'PRIORITY 1 ALERT',area:'AREA CREATED',cluster:'CLUSTER EXPANDED',sonar:'SONAR PING',call:'INCOMING CALL',radio:'RADIO START',menu:'MENU OPEN',radio_stop:'RADIO STOP',call_end:'CALL ENDED',message:'NEW MESSAGE',photo:'PHOTO TAKEN',record_start:'RECORDING START',record_stop:'RECORDING STOP',emergency:'EMERGENCY ALERT',terminal:'TERMINAL OPEN',success:'CODE SUCCESS',failure:'CODE FAILURE',report:'MAP REPORT RECEIVED'};
const EVENT_KEYS=Object.keys(EVENT_NAMES);
const soundPath=name=>`/sounds/${name}.mp3`;
const SETTINGS_KEY='ase-map-v32-settings';
let clusterOn=true,soundEnabled=true,soundVolume=48;
let searchQuery='',searchImportance='all';
let searchOpen=false;
let dbPromise=null;
let sounds=new Map();
try{const saved=JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}');clusterOn=saved.clusterOn!==false;soundEnabled=saved.soundEnabled!==false;soundVolume=Number.isFinite(saved.soundVolume)?Math.max(0,Math.min(100,saved.soundVolume)):48;}catch{}
function save(){try{localStorage.setItem(SETTINGS_KEY,JSON.stringify({clusterOn,soundEnabled,soundVolume}))}catch{}}
const time=t=>new Date(t||Date.now()).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',hour12:false});
function announce(value){if(typeof toast==='function')toast(value)}
function getRoom(){return target==='public'?'public':`dm:${[myId,target].sort().join(':')}`}

/* Expand/collapse by clustering only single-place pins, reports and voice notes.
   The server continues to keep every item and permission separate. */
function decorateClusters(zoom){
  const layer=$('mapPins');if(!layer||!clusterOn||zoom>=2.35)return;
  const rect=$('mapCanvas').getBoundingClientRect();
  if(!rect.width||!rect.height)return;
  const byItem=new Map();
  const pins=Array.from(layer.querySelectorAll('button.map-pin[data-map-id]:not(.draft)'));
  // Keep small/priority-2 reports individually visible even at reset zoom.
  const items=annotations.filter(a=>['pin','report','voice'].includes(a.kind)&&a.points?.length===1&&a.priority!==2);
  for(const btn of pins){
    const id=btn.dataset.mapId;if(!id)continue;
    if(!byItem.has(id))byItem.set(id,btn);
  }
  const nodes=items.filter(a=>byItem.has(a.id)).map(a=>({id:a.id,p:a.points[0]}));
  // A 44px grouping distance is scaled back into original map-image coordinates.
  const dx=48/(rect.width*zoom),dy=48/(rect.height*zoom);
  const groups=[];const seen=new Set();
  for(let i=0;i<nodes.length;i++){
    if(seen.has(nodes[i].id))continue;
    let frontier=[nodes[i]],group=[];seen.add(nodes[i].id);
    while(frontier.length){
      const n=frontier.pop();group.push(n);
      for(const other of nodes){
        if(seen.has(other.id))continue;
        if(Math.abs(other.p.x-n.p.x)<=dx&&Math.abs(other.p.y-n.p.y)<=dy){
          seen.add(other.id);frontier.push(other);
        }
      }
    }
    if(group.length>1)groups.push(group);
  }
  for(const group of groups){
    const ids=new Set(group.map(x=>x.id));
    const point={x:group.reduce((v,x)=>v+x.p.x,0)/group.length,y:group.reduce((v,x)=>v+x.p.y,0)/group.length};
    for(const el of layer.querySelectorAll('[data-map-id]'))if(ids.has(el.dataset.mapId))el.style.display='none';
    const btn=document.createElement('button');btn.type='button';btn.className='ase-map-cluster';
    btn.textContent=String(group.length);const ts=group.map(x=>Number(annotations.find(a=>a.id===x.id)?.time)).filter(Number.isFinite);if(ts.length)btn.dataset.mapTime=String(Math.round(ts.reduce((a,b)=>a+b,0)/ts.length));btn.style.left=`${point.x*100}%`;btn.style.top=`${point.y*100}%`;
    btn.setAttribute('aria-label',`${group.length} nearby markers. Expand for details.`);
    btn.title=`${group.length} markers / tap to expand`;
    btn.onclick=e=>{e.stopPropagation();window.ASEMap?.setZoom?.(2.5);window.ASESound?.play('cluster');};
    layer.append(btn);
  }
}
function startArea(){
  if(!myId)return announce('Join ASE first.');
  if(!onMap)enterMap();
  if(toolMode==='area'){resetTool();announce('Area drawing ended.');return;}
  resetTool();toolMode='area';draftPoints=[];paintMap();
  $('aseAreaButton')?.classList.add('active');
  announce('AREA: Tap 3 or more corners, then SAVE AREA.');
}
function refreshAreaButton(){
  const button=$('aseAreaButton');if(button)button.classList.toggle('active',toolMode==='area');
}

/* Marker search never requests or queries another room; it only looks at annotations
   already authorized and loaded for the current public/private conversation. */
function displaySearch(){
  const result=$('aseSearchResults');if(!result)return;
  result.replaceChildren();
  const query=searchQuery.trim().toLowerCase();
  const matching=[...annotations].reverse().filter(a=>{
    if(searchImportance!=='all'&&String(a.priority||2)!==searchImportance)return false;
    const text=[a.kind,a.name,a.note,a.preset,a.color,a.mediaKind,a.priority===1?'important':'less important',time(a.time),new Date(a.time).toLocaleDateString()].filter(Boolean).join(' ').toLowerCase();
    return !query||text.includes(query);
  });
  $('aseSearchCount').textContent=`${matching.length} / ${annotations.length}`;
  if(!matching.length){const empty=document.createElement('span');empty.className='annotation-empty';empty.textContent='No matching marks in this conversation.';result.append(empty);return}
  for(const a of matching.slice(0,45)){
    const button=document.createElement('button');button.type='button';
    button.textContent=`${time(a.time)} · ${a.kind.toUpperCase()} · P${a.priority||2} · ${a.note||a.preset||'No message'} / ${a.name}`;
    button.onclick=()=>{
      searchOpen=false;drawSearchState();
      window.ASEMap?.focusItem?.(a.id);
      if(a.kind==='report')openReportViewer(a);
    };
    result.append(button);
  }
}
function drawSearchState(){
  const panel=$('aseSearchPanel'),button=$('aseSearchButton');
  if(panel)panel.hidden=!searchOpen;
  if(button)button.classList.toggle('active',searchOpen);
  if(searchOpen)displaySearch();
}
function toggleSearch(){if(!myId)return announce('Join ASE first.');if(!onMap)enterMap();searchOpen=!searchOpen;drawSearchState();if(searchOpen)$('aseSearchInput').focus();}

// Insert accessible actions next to the existing v3.1 map tools, not over the map.
const strip=$('aseMarkStrip');
if(strip){
  const toolbar=document.createElement('div');toolbar.className='ase-search-toolbar';toolbar.innerHTML=`
    <button type="button" id="aseClusterToggle">CLUSTERS ON</button>
    <button type="button" id="aseAreaButton">DRAW AREA</button>
    <button type="button" id="aseSearchButton">FIND MARK</button>`;
  strip.append(toolbar);
  $('aseClusterToggle').onclick=()=>{clusterOn=!clusterOn;save();$('aseClusterToggle').textContent=clusterOn?'CLUSTERS ON':'CLUSTERS OFF';$('aseClusterToggle').classList.toggle('active',clusterOn);paintMap();};
  $('aseClusterToggle').textContent=clusterOn?'CLUSTERS ON':'CLUSTERS OFF';$('aseClusterToggle').classList.toggle('active',clusterOn);
  $('aseAreaButton').onclick=startArea;
  $('aseSearchButton').onclick=toggleSearch;
  const panel=document.createElement('section');panel.className='ase-search-panel';panel.id='aseSearchPanel';panel.hidden=true;
  panel.innerHTML=`<div class="ase-search-row"><input id="aseSearchInput" aria-label="Search map marks" placeholder="Search message, user, color..." maxlength="80"><select id="aseSearchImportance" aria-label="Filter marker priority"><option value="all">ALL</option><option value="1">PRIORITY 1</option><option value="2">PRIORITY 2</option></select><button type="button" id="aseSearchClose">CLOSE</button></div><div class="ase-search-meta"><strong>MAP SEARCH</strong><span id="aseSearchCount">0 / 0</span></div><div id="aseSearchResults" class="ase-search-results"></div>`;
  strip.after(panel);
  $('aseSearchInput').oninput=e=>{searchQuery=e.target.value;displaySearch()};
  $('aseSearchImportance').onchange=e=>{searchImportance=e.target.value;displaySearch()};
  $('aseSearchClose').onclick=()=>{searchOpen=false;drawSearchState()};
}

/* Sound Studio: every UI sound event has its own editable MP3 slot. Uploaded files
   are saved locally in IndexedDB on THIS browser only; no MP3 is sent to the chat server. */
function openDB(){
  if(dbPromise)return dbPromise;
  dbPromise=new Promise((resolve,reject)=>{
    if(!window.indexedDB){resolve(null);return}
    const request=indexedDB.open('ASE-v32-MP3',1);
    request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('sounds'))request.result.createObjectStore('sounds')};
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });return dbPromise;
}
async function storeCustom(name,file){
  const db=await openDB();if(!db)throw Error('This browser cannot save custom MP3s.');
  await new Promise((resolve,reject)=>{const tx=db.transaction('sounds','readwrite');tx.objectStore('sounds').put(file,name);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});
  const prior=sounds.get(name);if(prior?.url)URL.revokeObjectURL(prior.url);
  sounds.set(name,{blob:file,url:URL.createObjectURL(file)});
}
async function deleteCustom(name){
  const db=await openDB();if(db)await new Promise((resolve,reject)=>{const tx=db.transaction('sounds','readwrite');tx.objectStore('sounds').delete(name);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});
  const prior=sounds.get(name);if(prior?.url)URL.revokeObjectURL(prior.url);sounds.delete(name);
}
async function loadSaved(){
  const db=await openDB();if(!db)return;
  await Promise.all(EVENT_KEYS.map(name=>new Promise((resolve)=>{
    const tx=db.transaction('sounds','readonly');const req=tx.objectStore('sounds').get(name);
    req.onsuccess=()=>{if(req.result instanceof Blob)sounds.set(name,{blob:req.result,url:URL.createObjectURL(req.result)});resolve()};req.onerror=resolve;
  })));
  updateSoundRows();
}
function safeSound(name){return EVENT_KEYS.includes(name)?name:null}
function play(name){
  if(!soundEnabled||soundVolume<=0||!safeSound(name))return true;
  const chosen=sounds.get(name);
  const audio=new Audio(chosen?.url||soundPath(name));
  audio.volume=Math.min(.8,soundVolume/100*.6);
  audio.preload='auto';
  audio.play().catch(()=>{});
  return true;
}
function alertMarker(item){
  if(!myId||!item)return;
  if(item.priority===1){
    play('priority');
    if(item.userId!==myId)announce(`IMPORTANT MAP MARK · ${item.name}: ${item.note||item.preset||'Priority 1'}`);
  }else play(item.kind==='report'?'report':item.kind==='area'?'area':'mark');
}
const soundDialog=document.createElement('dialog');soundDialog.className='ase-sound-dialog';soundDialog.id='aseSoundDialog';
soundDialog.innerHTML=`<div class="ase-sound-heading"><strong>ASE / SOUND STUDIO</strong><button type="button" id="aseSoundClose">CLOSE</button></div>
 <p>Replace every built-in sound with your own MP3, or use and download the original sounds. Changes are local to this device.</p>
 <div class="ase-sound-master"><label><input type="checkbox" id="aseSoundEnable" checked> ENABLE SOUNDS</label><label>VOLUME <input id="aseSoundVolume" type="range" min="0" max="100" value="48"></label><output id="aseSoundVolumeOut">48%</output></div>
 <div id="aseSoundRows" class="ase-sound-rows"></div>
 <section class="ase-sound-builder" aria-label="Custom MP3 composer"><h3>MAKE YOUR OWN MP3</h3><p>Combine up to three included sounds into a custom MP3. Assign it to any event and save it as a file to share.</p><div class="ase-sound-builder-grid"><label>ASSIGN TO <select id="aseSoundTarget"></select></label><label>FIRST SOUND <select id="aseSoundPart1"></select></label><label>SECOND SOUND <select id="aseSoundPart2"></select></label><label>THIRD SOUND <select id="aseSoundPart3"></select></label></div><div class="ase-sound-builder-actions"><button type="button" id="aseComposeSound">CREATE & ASSIGN MP3</button><button type="button" id="aseDownloadSound" disabled>DOWNLOAD CUSTOM MP3</button></div><output id="aseComposeStatus">Choose a sound sequence, then create.</output></section>
 <div class="ase-sound-footer"><a download href="/ASE_MP3_Sound_Pack.zip">DOWNLOAD ALL 20 DEFAULT MP3s</a><span>Custom MP3s stay on this device. Max upload: 1.5 MB.</span></div>`;
document.body.append(soundDialog);
const soundRows=$('aseSoundRows');
function updateSoundRows(){
  soundRows.querySelectorAll('[data-audio-event]').forEach(row=>{
    const key=row.dataset.audioEvent;
    const status=row.querySelector('.ase-sound-status');status.textContent=sounds.has(key)?'YOUR MP3':'BUILT-IN MP3';
  });
}
for(const key of EVENT_KEYS){
  const row=document.createElement('div');row.className='ase-sound-row';row.dataset.audioEvent=key;
  const label=document.createElement('strong');label.textContent=EVENT_NAMES[key];
  const status=document.createElement('span');status.className='ase-sound-status';status.textContent='BUILT-IN MP3';
  const listen=document.createElement('button');listen.type='button';listen.textContent='PLAY';listen.onclick=()=>{
    const old=soundEnabled,vol=soundVolume;soundEnabled=true;if(!vol)soundVolume=48;play(key);soundEnabled=old;soundVolume=vol;
  };
  const input=document.createElement('input');input.type='file';input.accept='.mp3,audio/mpeg';input.setAttribute('aria-label',`Upload MP3 for ${EVENT_NAMES[key]}`);
  input.onchange=async()=>{
    const file=input.files?.[0];if(!file)return;
    if(file.size>1500000||file.size<100||!(/\.mp3$/i.test(file.name)||file.type==='audio/mpeg')){announce('Choose an MP3 smaller than 1.5 MB.');input.value='';return}
    try{
      const header=new Uint8Array(await file.slice(0,4).arrayBuffer());
      if(!((header[0]===73&&header[1]===68&&header[2]===51)||(header[0]===255&&(header[1]&0xe0)===0xe0)))throw Error('Not a valid MP3 file header.');
      await storeCustom(key,file);updateSoundRows();announce(`${EVENT_NAMES[key]} sound saved on this device.`);
    }catch(e){announce('MP3 not saved: '+e.message)}finally{input.value=''}
  };
  const download=document.createElement('button');download.type='button';download.textContent='SAVE MP3';download.onclick=()=>{
    const src=sounds.get(key);
    const a=document.createElement('a');a.href=src?.url||soundPath(key);a.download=`ASE_${key}.mp3`;document.body.append(a);a.click();a.remove();
  };
  const restore=document.createElement('button');restore.type='button';restore.textContent='DEFAULT';restore.onclick=async()=>{
    try{await deleteCustom(key);updateSoundRows();announce(`${EVENT_NAMES[key]} reset.`)}catch(e){announce(e.message)}
  };
  row.append(label,status,listen,input,download,restore);soundRows.append(row);
}
// Browser-side MP3 composition uses complete MPEG audio frames from the built-in
// MP3 sound bank. All 20 source clips share the same encoding parameters.
// No microphone access, online transcoding server or external library is needed.
const targetSelect=$('aseSoundTarget'),parts=[1,2,3].map(n=>$('aseSoundPart'+n));
for(const [key,name] of Object.entries(EVENT_NAMES)){
 targetSelect.add(new Option(name,key));
 for(const sel of parts)sel.add(new Option(name,key));
}
parts[0].value='mark';
for(const sel of parts.slice(1))sel.add(new Option('NONE',''));
parts[1].value='priority';parts[2].value='';
let composed=null;
function stripId3(bytes){
 if(bytes[0]!==73||bytes[1]!==68||bytes[2]!==51)return bytes;
 const length=((bytes[6]&127)<<21)|((bytes[7]&127)<<14)|((bytes[8]&127)<<7)|(bytes[9]&127);
 return bytes.subarray(10+length);
}
async function composeMP3(){
 const keys=parts.map(select=>select.value).filter(Boolean);
 if(!keys.length)throw Error('Choose at least one sound.');
 const pieces=[];
 for(const key of keys){
   const response=await fetch(soundPath(key));if(!response.ok)throw Error('Sound file is unavailable.');
   const piece=stripId3(new Uint8Array(await response.arrayBuffer()));
   if(piece.length<100||piece[0]!==255||(piece[1]&224)!==224)throw Error('MP3 frames could not be read.');
   pieces.push(piece);
 }
 return new Blob(pieces,{type:'audio/mpeg'});
}
$('aseComposeSound').onclick=async()=>{
 const button=$('aseComposeSound');button.disabled=true;$('aseComposeStatus').textContent='Creating MP3...';
 try{
  const blob=await composeMP3();const key=targetSelect.value;
  if(blob.size>1500000)throw Error('The finished sound is too large.');
  await storeCustom(key,blob);composed={blob,key};
  updateSoundRows();$('aseDownloadSound').disabled=false;
  $('aseComposeStatus').textContent=`Created ${EVENT_NAMES[key]} MP3 (${Math.round(blob.size/1024)} KB). It is now assigned to that event.`;
  play(key);
 }catch(e){$('aseComposeStatus').textContent=e.message;}
 finally{button.disabled=false}
};
$('aseDownloadSound').onclick=()=>{
 if(!composed)return;
 const link=document.createElement('a');const url=URL.createObjectURL(composed.blob);
 link.href=url;link.download=`ASE_MADE_${composed.key}.mp3`;
 document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
};
$('aseSoundClose').onclick=()=>soundDialog.close();
soundDialog.addEventListener('cancel',()=>soundDialog.close());
$('aseSoundEnable').checked=soundEnabled;
$('aseSoundVolume').value=soundVolume;$('aseSoundVolumeOut').textContent=soundVolume+'%';
$('aseSoundEnable').onchange=e=>{soundEnabled=e.target.checked;save()};
$('aseSoundVolume').oninput=e=>{soundVolume=Number(e.target.value);$('aseSoundVolumeOut').textContent=soundVolume+'%';save()};
function openStudio(){if(!soundDialog.open)soundDialog.showModal()}
const dock=document.querySelector('#aseQuickGrid');
if(dock){const button=document.createElement('button');button.id='aseStudioDock';button.type='button';button.className='ase-studio-dock';button.textContent='SOUND STUDIO';button.onclick=openStudio;dock.append(button)}
if(strip){const button=document.createElement('button');button.id='aseMapSounds';button.type='button';button.className='ase-map-sounds';button.textContent='SOUND STUDIO / MP3';button.onclick=openStudio;strip.append(button)}
// A call or radio tone uses the same locally selected MP3. Sonar calls are routed from suite.js.
socket.on('call:incoming',()=>play('call'));
socket.on('call:ended',()=>play('call_end'));
socket.on('emergency:incoming',()=>play('emergency'));
socket.on('message:new',({room,item})=>{
  if(myId&&item?.userId!==myId&&room===getRoom())play('message');
});
socket.on('sonar:ping',({room})=>{if(myId&&room===getRoom()&&$('aseSonarSound')?.checked!==false)play('sonar')});
let lastClickSound=0;
document.addEventListener('click',event=>{
  if(event.target.closest('button,[role="button"]') && Date.now()-lastClickSound>110){lastClickSound=Date.now();play('click')}
},{passive:true});
document.addEventListener('click',event=>{
  const b=event.target.closest('button');if(!b)return;
  if(b.matches('#aseOpsOpen,#aseWheelOpen,#aseQuickTools,#mapOpen,[data-suite-tab],.ase-quick-tools,#aseLabOpen,#aseCodeMenu,#aseStudioDock,#aseMapSounds'))play('menu');
  if(b.matches('[data-terminal],.ase-terminal-card,[data-scenario]'))play('terminal');
},{passive:true});
$('snapMapCapture')?.addEventListener('click',()=>play('photo'));
$('recordMapCapture')?.addEventListener('click',()=>play('record_start'));
$('stopMapCapture')?.addEventListener('click',()=>play('record_stop'));
$('recordClip')?.addEventListener('click',()=>play('record_start'));
$('stopRecordClip')?.addEventListener('click',()=>play('record_stop'));
$('photoButton')?.addEventListener('click',()=>play('photo'));
loadSaved().catch(()=>{});
window.ASESound={play,onNewMarker:alertMarker,openStudio};
window.ASEExtras={decorateClusters,updateSearch:displaySearch,startArea,refreshAreaButton};
})();
