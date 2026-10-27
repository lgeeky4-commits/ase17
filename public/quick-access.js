/* ASE v3.0 - one accessible tool menu instead of overlapping fixed buttons.
   Moving existing DOM buttons preserves all their original event listeners. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const shell = $('mainScreen');
  if (!shell) return;

  const dock = document.createElement('nav');
  dock.id = 'aseQuickAccess';
  dock.className = 'ase-quick-access';
  dock.setAttribute('aria-label', 'Quick chat and map tools');
  dock.innerHTML = `
    <div class="ase-quick-bar">
      <button type="button" id="aseQuickMark" title="Go to the map and place a marker">MARK</button>
      <button type="button" id="aseQuickPath" title="Go to the map and start a route">PATH</button>
      <button type="button" id="aseQuickToggle" aria-controls="aseQuickMenu" aria-expanded="false">TOOLS +</button>
    </div>
    <div id="aseQuickMenu" class="ase-quick-menu" hidden>
      <div class="ase-quick-heading"><strong>ASE / ALL TOOLS</strong><button type="button" id="aseQuickClose" aria-label="Close tools menu">CLOSE</button></div>
      <div class="ase-quick-grid" id="aseQuickGrid"></div>
    </div>
    <div class="ase-quick-help" id="aseQuickHelp" role="status" aria-live="polite" hidden></div>
  `;
  document.body.append(dock);

  const menu = $('aseQuickMenu');
  const toggle = $('aseQuickToggle');
  const grid = $('aseQuickGrid');
  const help = $('aseQuickHelp');
  let helpTimer;
  let isOpen = false;
  const setMenu = open => {
    isOpen = !!open;
    menu.hidden = !isOpen;
    toggle.textContent = isOpen ? 'TOOLS -' : 'TOOLS +';
    toggle.setAttribute('aria-expanded', String(isOpen));
  };
  const showHelp = value => {
    help.hidden = false;
    help.textContent = value;
    clearTimeout(helpTimer);
    helpTimer = setTimeout(() => help.hidden = true, 2400);
  };

  // Original buttons used different fixed corners and overlapped one another.
  // Relocate their actual DOM nodes instead of creating duplicate buttons.
  const selectors = ['#aseDock','.ops-dock','.lab-dock','.simulation-dock','.wallpaper-dock','.ui-filter-dock'];
  for (const selector of selectors) {
    const original = document.querySelector(selector);
    if (original) grid.append(original);
  }

  function beginTool(mode) {
    if (shell.classList.contains('hidden')) return showHelp('Join the chat to use map tools.');
    if ($('mapScreen')?.classList.contains('hidden')) $('mapOpen')?.click();
    const target = mode === 'pin' ? $('pinButton') : $('pathButton');
    if (!target) return showHelp('Map controls unavailable.');
    target.click();
    setMenu(false);
    showHelp(mode === 'pin' ? 'Tap the map to mark a point.' : 'Tap the map to add route points.');
  }

  $('aseQuickMark').addEventListener('click', () => beginTool('pin'));
  $('aseQuickPath').addEventListener('click', () => beginTool('path'));
  toggle.addEventListener('click', () => setMenu(!isOpen));
  $('aseQuickClose').addEventListener('click', () => {setMenu(false);toggle.focus()});
  grid.addEventListener('click', event => {
    if (event.target.closest('button')) setMenu(false);
  });
  document.addEventListener('pointerdown', event => {
    if (isOpen && !dock.contains(event.target)) setMenu(false);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && isOpen) {setMenu(false);toggle.focus()}
  });

  // Nothing covers the login form while the user is not in a chat.
  const updateVisibility = () => {dock.hidden = shell.classList.contains('hidden')};
  new MutationObserver(updateVisibility).observe(shell, {attributes:true,attributeFilter:['class']});
  updateVisibility();
})();
