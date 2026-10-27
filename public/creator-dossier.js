'use strict';
/* Creator Dossier: fictional shared game information and permission-based contact. */
(() => {
  const config = {
    department:'ASE CRIMSON',
    mount(root){document.getElementById('reportViewerText').insertAdjacentElement('afterend',root);},
    visible(){return (document.getElementById('reportViewer').open||document.getElementById('markerIntelDialog')?.open);},
    mine(){return myId;},
    users(){return roster||[];},
    creator(a){return a.userId;},
    creatorName(a){return a.name;},
    userStatus(u){return u.status||'ACTIVE';},
    latestSharedMedia(a){return null;},
    fields(a,u){const count=annotations.filter(m=>m.userId===a.userId).length;
      return [['ITEM TYPE',(a.kind||'MARK').toUpperCase()],['CREATED',new Date(a.time).toLocaleString()],['PRIORITY',a.priority===1?'1 IMPORTANT':'2 LESS IMPORTANT'],['SHARED MARKS',String(count)],['CHAT ROOM',target==='public'?'PUBLIC':'PRIVATE'],['UNIT STATUS',u?.status||'OFFLINE']];},
    contact(id,kind){startPrivateCall(kind,id);}
  };
  const esc = s => String(s ?? '');
  const el = (tag, className, text) => {const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=esc(text);return n;};
  const root=el('section','creator-intel');root.id='creatorIntel';
  const head=el('div','creator-intel-head');head.append(el('span','', 'CREATOR / INCIDENT DOSSIER'),el('span','', 'RP NETWORK'));
  const loading=el('div','creator-intel-loading');
  const loadLabels=el('div','creator-intel-loading-label'),label=el('span','','LINKING PROFILE DATA'),pct=el('span','','0%');loadLabels.append(label,pct);
  const track=el('div','creator-intel-progress'),fill=el('i');track.append(fill);loading.append(loadLabels,track);
  const content=el('div','creator-intel-content');content.hidden=true;
  const profile=el('div','creator-intel-profile'),avatar=el('div','creator-intel-avatar'),profileText=el('div');
  const name=el('strong'),status=el('small');profileText.append(name,status);profile.append(avatar,profileText);
  const stats=el('div','creator-intel-stats');
  const camera=el('div','creator-intel-camera'),cameraText=el('span','', 'NO LIVE CAMERA / REQUEST ACCESS');camera.append(cameraText);
  const actions=el('div','creator-intel-actions');
  const talk=el('button','creator-intel-talk','MIC / TALK TO CREATOR');talk.type='button';
  const video=el('button','creator-intel-video','REQUEST LIVE CAMERA');video.type='button';actions.append(talk,video);
  const footer=el('div','creator-intel-footer','The report is shown immediately. Creator profile appears after a 2–5 second simulated loading sequence. Live camera and microphone require the owner to accept a call.');
  content.append(profile,stats,camera,actions,footer);root.append(head,loading,content);
  config.mount(root);
  let token=0,item=null,frame=null;
  function stat(k,v){const d=el('div');d.append(el('span','',k),el('b','',v));return d;}
  function online(id){const u=config.users().find(u=>u.id===id);return u||null;}
  function show(item1){
    if(item1.kind==='report'){document.getElementById('reportViewerText').insertAdjacentElement('afterend',root);}
    else document.getElementById('markerIntelReport').insertAdjacentElement('afterend',root);
    const n=++token;item=item1;
    cancelAnimationFrame(frame);frame=null;
    root.hidden=false;loading.hidden=false;content.hidden=true;
    fill.style.width='0%';pct.textContent='0%';label.textContent='INITIALIZING CREATOR PROFILE';
    const duration=2000+Math.random()*3000;
    const start=performance.now();
    function tick(now){
      if(token!==n||!config.visible()){return;}
      const fraction=Math.min(1,(now-start)/duration);
      const value=Math.min(100,Math.floor(fraction*100));
      fill.style.width=value+'%';pct.textContent=value+'%';
      if(fraction<1){frame=requestAnimationFrame(tick);return;}
      loading.hidden=true;content.hidden=false;
      render(item1);
    }
    frame=requestAnimationFrame(tick);
  }
  function render(a){
    if(!a)return;
    const id=config.creator(a);
    const u=online(id);const friendly=config.creatorName(a)||'UNKNOWN UNIT';
    avatar.textContent=friendly.slice(0,2).toUpperCase();
    name.textContent=friendly;
    status.textContent=(u?'ONLINE / '+esc(config.userStatus(u)||'ACTIVE'):'OFFLINE / NOT CONNECTED')+' · '+config.department;
    stats.replaceChildren();
    for(const [k,v] of config.fields(a,u))stats.append(stat(k,v));
    camera.replaceChildren();
    const media=config.latestSharedMedia?.(a);
    if(media && typeof media.data==='string' && /^data:(image\/(?:jpeg|png|webp)|video\/(?:webm|mp4));base64,/.test(media.data)){
      const mediaKind=media.kind==='photo'||media.kind==='image'?'image':'video';
      const tag=el(mediaKind==='image'?'img':'video');
      tag.src=media.data;
      if(mediaKind==='video'){tag.controls=true;tag.playsInline=true;tag.preload='metadata'}else tag.alt='Previously shared photo from this player';
      tag.className='creator-intel-recent-media';
      camera.append(el('span','','LATEST SHARED CAMERA REPORT / NOT LIVE'),tag);
    }else{
      cameraText.textContent='CAMERA PRIVATE / '+(u?'REQUEST LIVE VIDEO TO VIEW':'CREATOR IS OFFLINE');
      camera.append(cameraText);
    }
    talk.disabled=!id||id===config.mine()||!u;
    video.disabled=talk.disabled;
    if(id===config.mine()){talk.title='This is your own mark';video.title='This is your own mark';}
    else if(!u){talk.title='Creator is offline';video.title='Creator is offline';}
  }
  talk.onclick=()=>item&&config.contact(config.creator(item),'audio',item);
  video.onclick=()=>item&&config.contact(config.creator(item),'video',item);
  function reset(){token++;cancelAnimationFrame(frame);frame=null;root.hidden=true;item=null;}
  window.CreatorDossier={open:show,close:reset,root,render:()=>render(item)};
})();
