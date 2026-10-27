'use strict';
/* Shared fictional game-map mark: move a dot with each tap; keep only 2 arrows.
   INCOMING route is a separate two-tap, explicitly fictional directional overlay. */
(() => {
 const canvas=document.getElementById('mapCanvas');
 const world=document.getElementById('aseMapWorld');
 const mapActions=document.querySelector('#mapScreen .map-actions');
 if(!canvas||!world||!mapActions||typeof socket==='undefined')return;
 let mode='off',incomingStart=null,knownRoom=null,knownId=null;
 const cached=new Map();
 const toolbar=document.createElement('div');toolbar.className='ase-live-toolbar';toolbar.innerHTML=`
 <button type="button" id="aseLiveMove">LIVE MARK / OFF</button>
 <button type="button" id="aseLiveIncoming">SIM INCOMING PATH</button>
 <button type="button" id="aseClearLive">CLEAR MY LIVE</button>
 <div class="ase-live-help" id="aseLiveHelp">Tap LIVE MARK, then tap a new point each time to move your dot. The latest two arrows show its direction.</div>`;
 mapActions.after(toolbar);
 const layer=document.createElement('div');layer.className='ase-live-layer';layer.id='aseLiveLayer';world.append(layer);
 const by=id=>document.getElementById(id);
 const key=t=>t.owner+':'+t.type;
 const roomKey=()=>!myId?null:target==='public'?'public':`dm:${[myId,target].sort().join(':')}`;
 const labelTime=t=>new Date(t).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
 const svg=(name,attrs)=>{const el=document.createElementNS('http://www.w3.org/2000/svg',name);for(const [k,v]of Object.entries(attrs||{}))el.setAttribute(k,String(v));return el};
 function draw(){
  layer.replaceChildren();
  const art=svg('svg',{viewBox:'0 0 1000 1000',preserveAspectRatio:'none','aria-hidden':'true'});
  const defs=svg('defs');
  for(const [type,color] of [['move','#65d6ff'],['incoming','#ff5a6c']]){
   const marker=svg('marker',{id:'ase-arrow-'+type,markerWidth:9,markerHeight:9,refX:6,refY:3,orient:'auto',markerUnits:'userSpaceOnUse'});
   marker.append(svg('path',{d:'M0 0L6 3L0 6Z',fill:color}));defs.append(marker);
  }
  art.append(defs);
  for(const track of cached.values()){
   const col=track.type==='incoming'?'#ff5a6c':'#65d6ff';
   for(let i=1;i<(track.points||[]).length;i++){
    const a=track.points[i-1],b=track.points[i];
    const line=svg('line',{x1:a.x*1000,y1:a.y*1000,x2:b.x*1000,y2:b.y*1000,
      stroke:col,'stroke-width':track.type==='incoming'?3:2.5,'stroke-dasharray':track.type==='incoming'?'12 6':'none',
      'marker-end':`url(#ase-arrow-${track.type})`,opacity:.9});
    art.append(line);
   }
  }
  layer.append(art);
  for(const track of cached.values()){
   const p=track.points?.at(-1);if(!p)continue;
   const dot=document.createElement('div');dot.className='ase-live-badge'+(track.type==='incoming'?' incoming':'');
   dot.style.left=p.x*100+'%';dot.style.top=p.y*100+'%';
   dot.textContent=(track.type==='incoming'?'INCOMING / ':'LIVE / ')+track.name+' · '+labelTime(track.time);
   layer.append(dot);
  }
 }
 function status(message){by('aseLiveHelp').textContent=message}
 function setMode(next){
  if(!myId){toast('Join ASE first.');return}
  mode=mode===next?'off':next;incomingStart=null;
  if(mode!=='off')window.ASEMap?.setPanMode?.(false);
  by('aseLiveMove').classList.toggle('active',mode==='move');
  by('aseLiveIncoming').classList.toggle('active',mode==='incoming');
  by('aseLiveMove').textContent=mode==='move'?'LIVE MARK / ON':'LIVE MARK / OFF';
  if(mode!=='off'){resetTool();toolMode='browse';}
  status(mode==='move'?'LIVE MARK: One tap moves the dot live. Only the last TWO arrows stay.':mode==='incoming'?'FICTIONAL INCOMING: Tap a start point, then a destination.':'Live tools off. Existing map tools work normally.');
 }
 function emit(name,data){return new Promise((resolve,reject)=>{socket.timeout(6500).emit(name,{to:target,...data},(error,result)=>{if(error||!result?.ok)reject(new Error(result?.error||'Could not share map update'));else resolve(result)})})}
 by('aseLiveMove').onclick=()=>setMode('move');
 by('aseLiveIncoming').onclick=()=>setMode('incoming');
 by('aseClearLive').onclick=async()=>{
  if(!myId)return toast('Join first.');
  for(const type of ['move','incoming'])try{await emit('map:live:clear',{type})}catch(error){toast(error.message)}
  status('Your live marks were cleared in this conversation.');
 };
 canvas.addEventListener('click',async event=>{
  if(mode==='off'||!myId||!onMap)return;
  if(event.target.closest('button,input,select,.ase-zoom-controls,.map-note,.map-pin')||window.ASEMap?.ignoreTap?.())return;
  event.preventDefault();event.stopImmediatePropagation();
  const point=window.ASEMap?.pointFromClient?.(event.clientX,event.clientY);
  if(!point)return;
  if(mode==='move'){
   try{await emit('map:live:move',{point});status(`Moved live dot to ${Math.round(point.x*100)} / ${Math.round(point.y*100)}. Two newest arrows remain.`)}catch(error){toast(error.message)}
  }else{
   if(!incomingStart){incomingStart=point;status('Fictional incoming origin selected. Tap the next destination.');return;}
   const start=incomingStart;incomingStart=null;
   try{await emit('map:live:incoming',{points:[start,point]});status('Fictional incoming route shared in this conversation.');}catch(error){toast(error.message)}
  }
 },true);
 socket.on('map:live:update',({room,track})=>{if(room!==roomKey()||!track?.owner)return;cached.set(key(track),track);draw()});
 socket.on('map:live:remove',({room,owner,type})=>{if(room!==roomKey())return;cached.delete(owner+':'+type);draw()});
 function reloadRoom(){
  const current=roomKey();
  if(current===knownRoom&&knownId===myId)return;
  knownRoom=current;knownId=myId;cached.clear();draw();incomingStart=null;mode='off';
  by('aseLiveMove').classList.remove('active');by('aseLiveIncoming').classList.remove('active');by('aseLiveMove').textContent='LIVE MARK / OFF';
  if(!current)return;
  const roomTarget=target;
  socket.timeout(5000).emit('map:live:list',{to:roomTarget},(error,result)=>{
   if(error||!result?.ok||roomKey()!==current)return;
   cached.clear();for(const t of result.tracks||[])if(t?.owner)cached.set(key(t),t);draw();
  });
 }
 setInterval(reloadRoom,420);
 socket.on('disconnect',()=>{knownRoom=null;knownId=null;cached.clear();draw()});
 window.ASELive={active:()=>mode!=='off',stop:()=>{if(mode!=='off')setMode('off')}};
})();
