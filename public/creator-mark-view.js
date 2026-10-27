'use strict';
/* View an ASE marker without changing its public/private room. */
(() => {
  const dialog=document.createElement('dialog');dialog.id='markerIntelDialog';dialog.className='creator-intel-dialog';
  dialog.innerHTML='<div class="creator-intel-dialog-head"><b>ASE / MARK DETAIL</b><button type="button" id="markerIntelClose">CLOSE</button></div><div id="markerIntelReport" class="creator-intel-report"></div>';
  document.body.append(dialog);
  document.getElementById('markerIntelClose').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>window.CreatorDossier?.close());
  dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close()});
  function showMark(a){
    if(!a||a.kind==='report')return;
    const box=document.getElementById('markerIntelReport');box.replaceChildren();
    const title=document.createElement('b'),details=document.createElement('p'),meta=document.createElement('small');
    title.textContent=(a.kind||'MARK').toUpperCase()+' / '+(a.name||'CREATOR');
    details.textContent=a.note||'Marker without additional report text.';
    meta.textContent='PLACED '+new Date(a.time).toLocaleString()+' / '+(a.priority===1?'IMPORTANT':'ROUTINE');
    box.append(title,details,meta);
    if(!dialog.open)dialog.showModal();
    window.CreatorDossier?.open(a);
  }
  window.ASECreatorView={showMark};
})();
