"use strict";
/* ASE Mission Lab v2.8. Video, notes, and custom consoles remain local to this browser.
   This module never reads private messages or connects to another participant. */
(() => {
  const $ = id => document.getElementById(id);
  const ids = ['labOpen','labSuite','labExit','labToast','labBuilder','labReplay','labArchive',
    'labTermName','labTermTheme','labTermLayout','labTermWallpaper','labTermGrid','labGridValue',
    'labTermTelemetry','labTermLog','labTermScan','labAbilityOne','labAbilityTwo','labAbilityThree',
    'labSaveTerminal','labLaunchTerminal','labPreviewTitle','labPreviewCommand','labPreviewClock',
    'labTerminalPreview','labCustomMap','labCustomGrid','labCustomMarks','labCustomScan',
    'labCustomTelemetry','labCustomContacts','labCustomLog','labSavedTerminals','labTerminalCount',
    'labUseDemo','labPickVideo','labVideoInput','labReplayVideo','labVideoStamp','labPlayPause',
    'labReplaySpeed','labReplayTime','labReplaySeek','labVideoSourceNote','labMissionTitle',
    'labMissionNotes','labAttachTerminal','labOpenAssignedTerminal','labSaveMission','labReplayMap','labReplayPins',
    'labMarkerText','labClearEvents','labEventList','labExportArchive','labImportArchive',
    'labArchiveInput','labArchiveStats','labArchiveRefresh','labMissionList'];
  const v=Object.fromEntries(ids.map(id=>[id,$(id)]));
  if(ids.some(id=>!v[id])){console.error('ASE Mission Lab is missing a UI element.');return;}
  const make=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=String(text);return n;};
  const hasBlob = b => b instanceof Blob && b.size>0;
  const clip=(s,max=100)=>String(s||'').trim().slice(0,max);
  const clamp=(n,min,max)=>Math.min(max,Math.max(min,Number.isFinite(+n)?+n:min));
  const uuid=()=>typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():`ase-${Date.now()}-${Math.random().toString(36).slice(2,9)}`;
  const timeLabel=s=>{const n=Number.isFinite(+s)?Math.max(0,+s):0;return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(Math.floor(n%60)).padStart(2,'0')}`;};
  const demoEvents=[{id:'d-1',t:2,x:24,y:30,text:'Sector Alpha identified'},{id:'d-2',t:5.5,x:68,y:45,text:'Virtual relay checkpoint'},{id:'d-3',t:9,x:55,y:80,text:'Recon sequence complete'}];
  const MODULES={scan:'SCAN SWEEP',beacon:'BEACON PING',grid:'GRID LOCK',fog:'COLD FOG',static:'STATIC SIM',shield:'SHIELD RING',decoy:'DECOY MARKS',fade:'SHADOW VEIL'};
  const THEMES=['ice','red','green','amber','purple','silver'];
  const LAYOUTS=['center','wide','sidebar'];
  const LS_KEY='ase-custom-terminals-v1';
  let terminals=[],editingId=null,markers=[],labOpen=false,tab='builder',toastTimer=0,fxTimer=0;
  let events=demoEvents.map(o=>({...o})),source={kind:'demo',name:'ASE supplied sample',blob:null},activeObjectUrl='',activeMissionId=null,dbPromise=null,currentLastEvent=-1,lastMaxMedia=80*1024*1024;
  let timerHandle=0;

  function notice(text){clearTimeout(toastTimer);v.labToast.textContent=text;v.labToast.classList.add('lab-alert-show');toastTimer=setTimeout(()=>v.labToast.classList.remove('lab-alert-show'),5000);}
  function localUrl(n){return `/wallpapers/wall-${String(clamp(n,1,140)).padStart(2,'0')}.svg`;}
  function readTerminals(){try{const arr=JSON.parse(localStorage.getItem(LS_KEY)||'[]');terminals=Array.isArray(arr)?arr.filter(t=>t&&typeof t==='object').slice(0,70).map(sanitizeTerminal):[];}catch(_){terminals=[];}}
  function sanitizeTerminal(t){return {
    id:clip(t.id||uuid(),80),name:clip(t.name||'UNTITLED TERMINAL',32),
    theme:THEMES.includes(t.theme)?t.theme:'ice',layout:LAYOUTS.includes(t.layout)?t.layout:'center',
    wallpaper:clamp(t.wallpaper,1,140),grid:clamp(t.grid,0,4),
    telemetry:!!t.telemetry,log:!!t.log,scan:!!t.scan,
    abilities:Array.isArray(t.abilities)?t.abilities.slice(0,3).map(a=>MODULES[a]?a:'scan'):['scan','beacon','grid']};}
  function saveTerminalData(){try{localStorage.setItem(LS_KEY,JSON.stringify(terminals));return true;}catch(e){notice('Browser storage is full or unavailable. Terminal was not saved.');return false;}}
  function terminalCommand(t){const slug=t.name.toUpperCase().replace(/[^A-Z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,18)||'CUSTOM';return '//MY-'+slug;}
  function fromForm(){return sanitizeTerminal({id:editingId||uuid(),name:v.labTermName.value,theme:v.labTermTheme.value,
    layout:v.labTermLayout.value,wallpaper:+v.labTermWallpaper.value,grid:+v.labTermGrid.value,
    telemetry:v.labTermTelemetry.checked,log:v.labTermLog.checked,scan:v.labTermScan.checked,
    abilities:[v.labAbilityOne.value,v.labAbilityTwo.value,v.labAbilityThree.value]});}
  function fillForm(t){editingId=t.id;v.labTermName.value=t.name;v.labTermTheme.value=t.theme;v.labTermLayout.value=t.layout;
    v.labTermWallpaper.value=t.wallpaper;v.labTermGrid.value=t.grid;v.labTermTelemetry.checked=t.telemetry;
    v.labTermLog.checked=t.log;v.labTermScan.checked=t.scan;
    [v.labAbilityOne,v.labAbilityTwo,v.labAbilityThree].forEach((e,i)=>e.value=t.abilities[i]||'scan');renderTerminal();}
  function addTerminal(){const t=fromForm();if(!t.name){notice('Enter a terminal name first.');return;}
    const idx=terminals.findIndex(x=>x.id===t.id);if(idx>=0)terminals[idx]=t;else if(terminals.length<70)terminals.unshift(t);else{notice('70-terminal storage limit reached.');return;}
    if(!saveTerminalData())return;editingId=t.id;renderTerminalList();renderTerminalChoices();notice(`Saved: ${t.name}. Type ${terminalCommand(t)} in chat to open it.`);
  }
  function removeTerminal(id){terminals=terminals.filter(t=>t.id!==id);if(editingId===id)editingId=null;saveTerminalData();renderTerminalList();renderTerminalChoices();notice('Custom terminal removed from this browser.');}
  function renderTerminalList(){v.labSavedTerminals.replaceChildren();v.labTerminalCount.textContent=`${terminals.length} SAVED`;
    if(!terminals.length){v.labSavedTerminals.append(make('p','lab-muted','No saved custom terminals yet. Build your first one above.'));return;}
    for(const t of terminals){const row=make('div','lab-saved-item');const info=make('div');info.append(make('strong','',t.name),make('small','',terminalCommand(t)));
      const use=make('button','','EDIT');use.type='button';use.addEventListener('click',()=>{fillForm(t);switchTab('builder');});
      const run=make('button','','RUN');run.type='button';run.addEventListener('click',()=>{fillForm(t);switchTab('builder');notice('Terminal loaded. Click the map and launch modules to interact.');});
      const del=make('button','lab-danger','DELETE');del.type='button';del.addEventListener('click',()=>removeTerminal(t.id));row.append(info,use,run,del);v.labSavedTerminals.append(row);}}
  function renderTerminalChoices(){const selected=v.labAttachTerminal.value;v.labAttachTerminal.replaceChildren(new Option('NONE',''));
    for(const t of terminals)v.labAttachTerminal.append(new Option(t.name,t.id));
    if([...v.labAttachTerminal.options].some(o=>o.value===selected))v.labAttachTerminal.value=selected;}
  function log(message){v.labCustomLog.prepend(make('span','',`${new Date().toLocaleTimeString()} / ${message}`));while(v.labCustomLog.children.length>8)v.labCustomLog.lastChild.remove();}
  function renderTerminal(){const p=fromForm();v.labGridValue.textContent=String(p.grid);v.labPreviewTitle.textContent=p.name;
    v.labPreviewCommand.textContent=terminalCommand(p)+' / CUSTOM LOCAL';
    v.labTerminalPreview.className=`lab-terminal-preview lab-layout-${p.layout} lab-theme-${p.theme}`;
    v.labCustomMap.src=localUrl(p.wallpaper);v.labCustomGrid.style.opacity=String(p.grid/5);
    v.labCustomTelemetry.classList.toggle('hidden',!p.telemetry);v.labCustomLog.classList.toggle('hidden',!p.log);
    v.labCustomScan.classList.toggle('hidden',!p.scan);v.labCustomContacts.textContent=`${String(markers.length).padStart(2,'0')} CONTACTS`;
    const buttons=v.labTerminalPreview.querySelectorAll('[data-lab-action]');buttons.forEach((b,i)=>{
      b.dataset.labAction=p.abilities[i]||'scan';b.textContent=MODULES[p.abilities[i]]||'SCAN SWEEP';});
    v.labPreviewClock.textContent=new Date().toLocaleTimeString([], {hour12:false});}
  function markInCustom(x,y){markers.push({x,y});if(markers.length>20)markers.shift();v.labCustomMarks.replaceChildren();
    for(const m of markers){const item=make('span','lab-custom-dot','+');item.style.left=m.x+'%';item.style.top=m.y+'%';v.labCustomMarks.append(item);}
    v.labCustomContacts.textContent=`${String(markers.length).padStart(2,'0')} CONTACTS`;
    log(`SIM MARK / ${Math.round(x)}:${Math.round(y)}`);}
  function triggerAbility(action){clearTimeout(fxTimer);v.labTerminalPreview.dataset.fx=action;
    if(action==='decoy'){for(let i=0;i<3;i++)markInCustom(10+Math.random()*80,10+Math.random()*80);}
    if(action==='beacon'||action==='scan'||action==='shield')markInCustom(25+Math.random()*50,25+Math.random()*50);
    log(`${(MODULES[action]||action).toUpperCase()} / SCREEN SIMULATION`);
    fxTimer=setTimeout(()=>{delete v.labTerminalPreview.dataset.fx;},1900);}
  function initModules(){[v.labAbilityOne,v.labAbilityTwo,v.labAbilityThree].forEach((select,i)=>{select.replaceChildren();
    for(const [val,name] of Object.entries(MODULES))select.append(new Option(name,val));select.value=['scan','beacon','grid'][i];});}

  // IndexedDB stores metadata and optional personal video blobs locally, never on the chat server.
  function openDB(){if(dbPromise)return dbPromise;dbPromise=new Promise((resolve,reject)=>{
    if(!window.indexedDB){reject(new Error('IndexedDB unavailable'));return;}
    const req=indexedDB.open('ASE-MissionLab-v1',1);
    req.onupgradeneeded=()=>{const db=req.result; if(!db.objectStoreNames.contains('missions'))db.createObjectStore('missions',{keyPath:'id'});
      if(!db.objectStoreNames.contains('videos'))db.createObjectStore('videos',{keyPath:'id'});};
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||new Error('Storage could not open'));
  });return dbPromise;}
  async function storeGet(store,key){const db=await openDB();return new Promise((resolve,reject)=>{const req=db.transaction(store,'readonly').objectStore(store).get(key);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
  async function storeAll(store){const db=await openDB();return new Promise((resolve,reject)=>{const req=db.transaction(store,'readonly').objectStore(store).getAll();req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
  async function storePut(store,item){const db=await openDB();return new Promise((resolve,reject)=>{const req=db.transaction(store,'readwrite').objectStore(store).put(item);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
  async function storeDelete(store,key){const db=await openDB();return new Promise((resolve,reject)=>{const req=db.transaction(store,'readwrite').objectStore(store).delete(key);req.onsuccess=()=>resolve();req.onerror=()=>reject(req.error);});}
  async function seedDemo(){try{
    let seeded=false;try{seeded=localStorage.getItem('ase-lab-demo-seeded')==='yes';}catch(_e){}if(seeded)return;const present=await storeGet('missions','ase-demo-echo17');if(present)return;
    await storePut('missions',{id:'ase-demo-echo17',title:'ECHO-17 / TRAINING REPLAY',notes:'Included fictional reconnaissance sample. Open this mission to see video-synced annotations.',events:demoEvents,createdAt:Date.now(),updatedAt:Date.now(),sourceKind:'demo',videoName:'ASE supplied sample',duration:12,terminalId:''});try{localStorage.setItem('ase-lab-demo-seeded','yes');}catch(_e){}
  }catch(e){console.warn('Mission Lab sample mission unavailable',e);}}
  function cleanEvents(input){return Array.isArray(input)?input.slice(0,100).map(e=>({id:clip(e.id||uuid(),90),x:clamp(e.x,0,100),y:clamp(e.y,0,100),t:clamp(e.t,0,21600),text:clip(e.text||'Map event',100)})):[];}
  function setEvents(newEvents){events=cleanEvents(newEvents);currentLastEvent=-1;drawEvents();}
  function selectVideo(kind,name,blob=null){v.labReplayVideo.pause();if(activeObjectUrl){URL.revokeObjectURL(activeObjectUrl);activeObjectUrl='';}
    source={kind,name,blob};if(hasBlob(blob)){activeObjectUrl=URL.createObjectURL(blob);v.labReplayVideo.src=activeObjectUrl;}
    else v.labReplayVideo.src='/blackbox-demo.mp4';
    v.labReplayVideo.load();v.labVideoSourceNote.textContent=(kind==='demo'?'Built-in video included with the website. ':'Personal video stays on this device. ')+name;
    updatePlayback();}
  function loadDemo(){activeMissionId=null;selectVideo('demo','ASE supplied sample');setEvents(demoEvents);v.labMissionTitle.value='ECHO-17 REPLAY';v.labMissionNotes.value='Fictional training replay with time-synced map markers.';notice('Built-in Black Box sample loaded.');}
  function handleOwnVideo(file){if(!file)return;
    if(file.size>lastMaxMedia){notice('That video is over 80 MB. Choose a smaller clip to save in your browser.');return;}
    if(!file.type.startsWith('video/')&&!/\.(mp4|webm|mov|m4v)$/i.test(file.name)){notice('Choose a video file.');return;}
    activeMissionId=null;selectVideo('file',clip(file.name,100),file);setEvents([]);
    v.labMissionTitle.value=clip(file.name.replace(/\.[a-z\d]+$/i,'').toUpperCase(),64)||'CUSTOM REPLAY';
    notice('Personal video loaded. Tap the map to add timeline markers.');}
  function drawEvents(){v.labEventList.replaceChildren();const now=v.labReplayVideo.currentTime||0;
    if(!events.length)v.labEventList.append(make('p','lab-muted','No timed marks yet. Play or seek the video, then tap the map to add one.'));
    [...events].sort((a,b)=>a.t-b.t).forEach(e=>{const row=make('div','lab-event-row');if(e.t<=now+.1)row.classList.add('is-past');
      const jump=make('button','','['+timeLabel(e.t)+'] '+e.text);jump.type='button';jump.title='Jump to this event';jump.addEventListener('click',()=>{v.labReplayVideo.currentTime=clamp(e.t,0,v.labReplayVideo.duration||e.t);updatePlayback();});
      const remove=make('button','lab-danger','X');remove.type='button';remove.title='Remove event';remove.addEventListener('click',()=>{setEvents(events.filter(x=>x.id!==e.id));});row.append(jump,remove);v.labEventList.append(row);});
    drawReplayPins();}
  function drawReplayPins(){const now=v.labReplayVideo.currentTime||0;v.labReplayPins.replaceChildren();
    for(const e of events){if(e.t>now+.15)continue;const pin=make('span','lab-replay-pin','+');pin.style.left=e.x+'%';pin.style.top=e.y+'%';pin.title=`${timeLabel(e.t)} / ${e.text}`;v.labReplayPins.append(pin);}
  }
  function updatePlayback(){const vid=v.labReplayVideo,d=Number.isFinite(vid.duration)?vid.duration:0,c=vid.currentTime||0;
    v.labReplaySeek.value=d?Math.round(c/d*1000):0;v.labReplayTime.textContent=`${timeLabel(c)} / ${timeLabel(d||12)}`;
    v.labVideoStamp.textContent=`${new Date().toLocaleDateString()}  ${timeLabel(c)} / PLAYBACK`;
    const past=events.filter(e=>e.t<=c+.15).length;
    if(past!==currentLastEvent){currentLastEvent=past;drawEvents();}else drawReplayPins();}
  function addReplayEvent(e){const box=v.labReplayMap.getBoundingClientRect();if(!box.width||!box.height)return;
    const x=clamp((e.clientX-box.left)/box.width*100,0,100),y=clamp((e.clientY-box.top)/box.height*100,0,100);
    const note=clip(v.labMarkerText.value,100)||'TIMED MAP MARK';if(events.length>=100){notice('This replay supports up to 100 timeline events.');return;}
    events.push({id:uuid(),x,y,t:Math.max(0,v.labReplayVideo.currentTime||0),text:note});v.labMarkerText.value='';drawEvents();notice(`Marker attached at ${timeLabel(v.labReplayVideo.currentTime)}.`);}
  async function saveMission(){const title=clip(v.labMissionTitle.value,64)||'UNTITLED MISSION',id=activeMissionId||uuid();
    try {
    const old=await storeGet('missions',id).catch(()=>null),kind=source.kind;
    const duration=Number.isFinite(v.labReplayVideo.duration)?v.labReplayVideo.duration:old?.duration||12;
    const meta={id,title,notes:clip(v.labMissionNotes.value,1500),events:cleanEvents(events),createdAt:old?.createdAt||Date.now(),
      updatedAt:Date.now(),sourceKind:kind==='demo'?'demo':'stored',videoName:source.name,duration,terminalId:v.labAttachTerminal.value||''};
    try{
      if(kind!=='demo'){
        const blob=source.blob;
        if(!hasBlob(blob)){if(!old?.sourceKind||old.sourceKind==='demo')throw new Error('Choose your video again before saving.');
          meta.sourceKind='stored';}
        else{if(blob.size>lastMaxMedia)throw new Error('Video is too large for local archive.');
          await storePut('videos',{id,blob,name:source.name,mime:blob.type});}
      }else if(old?.sourceKind==='stored')await storeDelete('videos',id);
      await storePut('missions',meta);activeMissionId=id;notice('Mission saved locally. Open MISSION ARCHIVE to replay it later.');await renderArchive();
    }catch(e){notice(`Could not save mission: ${e?.message||'browser storage error'}`);}
    }catch(e){notice('Mission storage is blocked: '+(e?.message||'unavailable'));}
  }
  async function openMission(id){try{const m=await storeGet('missions',id);if(!m){notice('Mission not found on this device.');return;}
    let blob=null;if(m.sourceKind==='stored')blob=(await storeGet('videos',id))?.blob||null;
    if(m.sourceKind==='missing'){notice('The mission index is available, but its personal video was not exported. Use LINK VIDEO in the archive to attach the original.');return;}
    if(m.sourceKind==='stored'&&!hasBlob(blob)){notice('Saved video is unavailable; reselect its original file to continue.');return;}
    activeMissionId=id;selectVideo(m.sourceKind==='demo'?'demo':'stored',m.videoName||'Saved video',blob);
    setEvents(m.events||[]);v.labMissionTitle.value=m.title;v.labMissionNotes.value=m.notes||'';
    v.labAttachTerminal.value=[...v.labAttachTerminal.options].some(o=>o.value===m.terminalId)?m.terminalId:'';
    switchTab('replay');notice(`Mission loaded: ${m.title}`);
  }catch(e){notice(`Cannot open mission: ${e.message||'storage failure'}`);}}
  async function deleteMission(id){try{await storeDelete('missions',id);await storeDelete('videos',id);if(activeMissionId===id)activeMissionId=null;await renderArchive();notice('Mission removed from this device.');}catch(e){notice('Could not delete mission: '+e.message);}}
  async function renderArchive(){v.labMissionList.replaceChildren();let list=[];
    try{list=await storeAll('missions');}catch(e){v.labMissionList.append(make('p','lab-muted','Browser storage is blocked. Enable site storage to save missions.'));return;}
    list.sort((a,b)=>b.updatedAt-a.updatedAt);v.labArchiveStats.textContent=`${list.length} STORED MISSIONS / LOCAL ONLY`;
    if(!list.length)v.labMissionList.append(make('p','lab-muted','No missions saved yet. Use BLACK BOX to start a replay and save a mission.'));
    for(const m of list){const card=make('article','lab-mission-card');const head=make('div','lab-mission-head');head.append(make('strong','',m.title),make('time','',new Date(m.updatedAt).toLocaleString()));
      const subtitle=make('p','',`${m.sourceKind==='demo'?'BUILT-IN SAMPLE':'PERSONAL VIDEO'} / ${m.events?.length||0} TIMED MARKS / ${m.videoName||''}`);
      const note=make('p','lab-muted',clip(m.notes,220)||'No mission notes.');const acts=make('div','lab-mission-actions');
      const open=make('button','','OPEN REPLAY');open.type='button';open.addEventListener('click',()=>openMission(m.id));
      if(m.sourceKind==='missing'){const relink=make('button','','LINK VIDEO');relink.type='button';relink.addEventListener('click',()=>{
        const input=document.createElement('input');input.type='file';input.accept='video/*,.mp4,.webm,.mov';input.style.display='none';document.body.append(input);
        input.addEventListener('change',async()=>{const f=input.files?.[0];input.remove();if(!f)return;if(f.size>lastMaxMedia){notice('Choose a video smaller than 80 MB.');return;}
          try{await storePut('videos',{id:m.id,blob:f,name:clip(f.name,100),mime:f.type});
            await storePut('missions',{...m,sourceKind:'stored',videoName:clip(f.name,100),updatedAt:Date.now()});await renderArchive();notice('Video linked successfully.');}
          catch(err){notice('Could not link video: '+err.message);}} ,{once:true});input.click();});acts.append(relink);}
      const del=make('button','lab-danger','DELETE');del.type='button';del.addEventListener('click',()=>{
        if(confirm(`Delete "${m.title}" and its stored video from this browser?`))deleteMission(m.id);
      });acts.append(open,del);card.append(head,subtitle,note,acts);v.labMissionList.append(card);}}
  async function exportArchive(){try{const list=await storeAll('missions');const payload={format:'ASE-MissionArchive',version:1,exportedAt:new Date().toISOString(),includesVideos:false,
    missions:list.map(m=>({...m,sourceKind:m.sourceKind==='demo'?'demo':'missing',videoName:m.videoName}))};
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='ase-mission-archive.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    notice('Mission index downloaded as JSON. Personal video files are not embedded.');
  }catch(e){notice('Export unavailable: '+e.message);}}
  async function importArchive(file){if(!file)return;if(file.size>1024*1024){notice('JSON index is too large.');return;}
    try{const parsed=JSON.parse(await file.text());if(parsed.format!=='ASE-MissionArchive'||!Array.isArray(parsed.missions))throw new Error('Not an ASE archive index.');
      const missions=parsed.missions.slice(0,120);let n=0;
      for(const item of missions){const id=uuid();await storePut('missions',{id,title:clip(item.title,64)||'IMPORTED MISSION',
        notes:clip(item.notes,1500),events:cleanEvents(item.events),createdAt:Date.now(),updatedAt:Date.now(),
        sourceKind:item.sourceKind==='demo'?'demo':'missing',videoName:clip(item.videoName,100)||'Video not included',duration:clamp(item.duration,0,21600),terminalId:''});n++;}
      await renderArchive();notice(`Imported ${n} mission entries. Personal videos must be selected again.`);
    }catch(e){notice('Import failed: '+e.message);}}
  function changeTab(){document.querySelectorAll('[data-lab-tab]').forEach(btn=>{
    const current=btn.dataset.labTab===tab;btn.setAttribute('aria-selected',current?'true':'false');btn.classList.toggle('active',current);
  });[['builder',v.labBuilder],['replay',v.labReplay],['archive',v.labArchive]].forEach(([name,el])=>el.classList.toggle('hidden',tab!==name));
    if(tab==='archive')renderArchive();if(tab==='builder')renderTerminal();}
  function switchTab(name){tab=['builder','replay','archive'].includes(name)?name:'builder';changeTab();}
  function openSuite(name='builder'){document.getElementById('opsClose')?.click();labOpen=true;v.labSuite.classList.remove('hidden');
    document.body.classList.add('lab-is-open');switchTab(name);v.labSuite.focus();}
  function closeSuite(){labOpen=false;v.labSuite.classList.add('hidden');document.body.classList.remove('lab-is-open');v.labReplayVideo.pause();}
  function captureCommand(e){const inp=$('messageInput');if(!inp)return;const value=inp.value.trim().toUpperCase();
    let dest=({'//BUILDER':'builder','//CUSTOMBUILDER':'builder','//BLACKBOX':'replay','//REPLAY':'replay','//MISSIONARCHIVE':'archive','//ARCHIVE':'archive'})[value];
    const match=terminals.find(t=>terminalCommand(t)===value);
    if(!dest&&!match)return;e.preventDefault();e.stopImmediatePropagation();inp.value='';
    if(match){fillForm(match);dest='builder';}openSuite(dest);
  }
  function initListeners(){v.labOpen.addEventListener('click',()=>openSuite('builder'));v.labExit.addEventListener('click',closeSuite);
    document.querySelectorAll('[data-lab-tab]').forEach(button=>button.addEventListener('click',()=>switchTab(button.dataset.labTab)));
    window.addEventListener('keydown',e=>{if(e.key==='Escape'&&labOpen)closeSuite();});
    const form=$('messageForm');if(form)form.addEventListener('submit',captureCommand,true);
    [v.labTermName,v.labTermTheme,v.labTermLayout,v.labTermWallpaper,v.labTermGrid,v.labTermTelemetry,v.labTermLog,v.labTermScan,v.labAbilityOne,v.labAbilityTwo,v.labAbilityThree].forEach(el=>{
      el.addEventListener('input',renderTerminal);el.addEventListener('change',renderTerminal);});
    v.labSaveTerminal.addEventListener('click',addTerminal);v.labLaunchTerminal.addEventListener('click',()=>{renderTerminal();notice('Custom terminal preview is active. Tap the map or select a module.');});
    v.labTerminalPreview.querySelectorAll('[data-lab-action]').forEach(b=>b.addEventListener('click',()=>triggerAbility(b.dataset.labAction)));
    v.labCustomMap.parentElement.addEventListener('click',e=>{const box=v.labCustomMap.parentElement.getBoundingClientRect();
      markInCustom(clamp((e.clientX-box.left)/box.width*100,0,100),clamp((e.clientY-box.top)/box.height*100,0,100));});
    v.labUseDemo.addEventListener('click',loadDemo);v.labPickVideo.addEventListener('click',()=>v.labVideoInput.click());
    v.labVideoInput.addEventListener('change',()=>{handleOwnVideo(v.labVideoInput.files?.[0]);v.labVideoInput.value='';});
    v.labReplayVideo.addEventListener('error',()=>notice('This video format is not supported in this browser. Try an MP4/H.264 or WebM clip.'));
    v.labReplaySpeed.addEventListener('change',()=>{v.labReplayVideo.playbackRate=+v.labReplaySpeed.value;});
    v.labPlayPause.addEventListener('click',()=>{if(v.labReplayVideo.paused)v.labReplayVideo.play().catch(()=>notice('Tap play on the video to begin.'));else v.labReplayVideo.pause();});
    for(const event of ['timeupdate','seeked','loadedmetadata','durationchange','play','pause'])v.labReplayVideo.addEventListener(event,updatePlayback);
    v.labReplaySeek.addEventListener('input',()=>{if(Number.isFinite(v.labReplayVideo.duration))v.labReplayVideo.currentTime=v.labReplayVideo.duration*(+v.labReplaySeek.value/1000);});
    v.labReplayMap.addEventListener('click',addReplayEvent);
    v.labReplayMap.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();const box=v.labReplayMap.getBoundingClientRect();addReplayEvent({clientX:box.left+box.width/2,clientY:box.top+box.height/2});}});
    v.labClearEvents.addEventListener('click',()=>{setEvents([]);notice('Replay markers cleared for this editing session.');});
    v.labOpenAssignedTerminal.addEventListener('click',()=>{const t=terminals.find(x=>x.id===v.labAttachTerminal.value);if(!t){notice('Choose a saved custom terminal first.');return;}fillForm(t);switchTab('builder');notice('Assigned terminal loaded.');});
    v.labSaveMission.addEventListener('click',saveMission);v.labArchiveRefresh.addEventListener('click',renderArchive);
    v.labExportArchive.addEventListener('click',exportArchive);v.labImportArchive.addEventListener('click',()=>v.labArchiveInput.click());
    v.labArchiveInput.addEventListener('change',()=>{importArchive(v.labArchiveInput.files?.[0]);v.labArchiveInput.value='';});
    timerHandle=setInterval(()=>{if(labOpen&&tab==='builder')v.labPreviewClock.textContent=new Date().toLocaleTimeString([],{hour12:false});},1000);
  }
  async function init(){initModules();readTerminals();renderTerminal();renderTerminalList();renderTerminalChoices();
    initListeners();selectVideo('demo','ASE supplied sample');setEvents(demoEvents);
    try{await openDB();await seedDemo();}catch(e){notice('Mission saving requires browser storage; it is unavailable here.');}
  }
  init();
})();
