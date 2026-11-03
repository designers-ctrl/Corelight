/* Section 02 · Detection context: a detection page whose context is attached to the chat
   as a removable chip, an alert drawer and an entity window. While a drawer or window is
   open, the chat can't sit in its own column, so it floats as a popover opened from the
   Lux launcher in the corner (Figma 3073:37026). */

(() => {
  const PAGE_CONTEXT = {
    dashboard: null,
    detection: 'EternalSafety::EternalBlue | 192.168.1.157',
  };
  const pages = document.querySelectorAll('.page');
  const navItems = document.querySelectorAll('.sidenav__item[data-page]');
  const drawer = document.getElementById('alertDrawer');
  const entity = document.getElementById('entityModal');
  const canvas = document.getElementById('canvas');

  function goTo(page) {
    document.body.dataset.page = page;
    pages.forEach(p => {
      const on = p.dataset.page === page;
      if (on && p.hidden) {
        p.hidden = false;
        if (!Lux.reduceMotion) p.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
      } else if (!on) p.hidden = true;
    });
    navItems.forEach(n => n.classList.toggle('is-active', n.dataset.page === page));
    canvas.scrollTop = 0;
    closeOverlays();
    Lux.pageContext = PAGE_CONTEXT[page];   // what "+ Add context" can offer on this page
    Lux.setContext(PAGE_CONTEXT[page]);
    Lux.syncLauncher();
  }
  Lux.goTo = goTo;

  navItems.forEach(n => n.addEventListener('click', e => { e.preventDefault(); goTo(n.dataset.page); }));
  document.querySelectorAll('.sidenav__item:not([data-page])').forEach(n => n.addEventListener('click', e => e.preventDefault()));

  /* ---------- Overlays: the chat floats over them ---------- */

  let redock = false;   // the chat was docked before an overlay turned it into a popover

  function openOverlay(node) {
    closeOverlays(true);
    node.hidden = false;
    document.body.classList.add('has-overlay');
    requestAnimationFrame(() => node.classList.add('is-open'));
    if (Lux.isOpen() && !Lux.floating) { Lux.setFloating(true); redock = true; }   // docked chat becomes a popover
    Lux.syncLauncher();
  }

  function closeOverlays(keepBodyFlag) {
    [drawer, entity].forEach(node => {
      if (node.hidden) return;
      node.classList.remove('is-open');
      setTimeout(() => { if (!node.classList.contains('is-open')) node.hidden = true; }, 220);
    });
    if (!keepBodyFlag) {
      document.body.classList.remove('has-overlay');
      // back in its column once nothing covers it any more
      if (redock && Lux.isOpen() && Lux.floating) Lux.setFloating(false);
      redock = false;
    }
    Lux.syncLauncher();
  }

  document.querySelectorAll('[data-alert]').forEach(r => {
    r.addEventListener('click', () => openOverlay(drawer));
    r.addEventListener('keydown', e => { if (e.key === 'Enter') openOverlay(drawer); });
  });
  document.querySelectorAll('[data-entity]').forEach(b => b.addEventListener('click', () => openOverlay(entity)));
  drawer.querySelectorAll('[data-close-drawer]').forEach(b => b.addEventListener('click', () => closeOverlays()));
  entity.querySelectorAll('[data-close-entity]').forEach(b => b.addEventListener('click', () => closeOverlays()));

  const prevClose = Lux.closeTopLayer;
  Lux.closeTopLayer = () => {
    if (prevClose && prevClose()) return true;
    if (!drawer.hidden || !entity.hidden) {
      // Esc closes the chat popover first, then the drawer or window
      if (Lux.isOpen() && Lux.floating) return false;
      closeOverlays();
      return true;
    }
    return false;
  };

  /* ---------- "Ask GPT" chips on the detection page go to Lux ---------- */

  document.querySelectorAll('[data-ask]').forEach(b => b.addEventListener('click', async () => {
    if (!Lux.isOpen()) Lux.setOpen(true, { float: document.body.classList.contains('has-overlay') });
    Lux.showView?.('chat');
    if (!Lux.context) Lux.setContext(PAGE_CONTEXT.detection);
    await Lux.sleep(250);
    if (Lux.busy) return;
    if (Lux.active.started) Lux.newChat('hello');
    await Lux.sleep(150);
    Lux.send(b.dataset.ask);
  }));

  goTo('dashboard');
})();
