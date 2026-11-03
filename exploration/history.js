/* History (v1 section 03), redesigned in this version's style: Pinned / Recent groups grow
   out of a small icon like the prompt tree, rows are prompt cards, delete asks first, then a
   toast confirms. Opening a session switches the chat to it. */

(() => {
  const { el, sleep, reduceMotion } = Lux;
  const chatView = document.getElementById('chatView');
  const historyView = document.getElementById('historyView');
  const list = document.getElementById('historyList');
  const toastSlot = document.getElementById('toastSlot');
  const modalRoot = document.getElementById('modalRoot');

  /* ---------- Views ---------- */

  let view = 'chat';
  async function showView(next) {
    if (next === view) return;
    view = next;
    const from = next === 'history' ? chatView : historyView;
    const to = next === 'history' ? historyView : chatView;
    if (!reduceMotion) {
      await from.animate(
        [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateX(${next === 'history' ? 12 : -12}px)` }],
        { duration: 140, easing: 'cubic-bezier(0.4, 0, 1, 1)' }).finished;
    }
    from.hidden = true;
    to.hidden = false;
    if (next === 'history') render(true);
    if (!reduceMotion) {
      to.animate(
        [{ opacity: 0, transform: `translateX(${next === 'history' ? -12 : 12}px)` }, { opacity: 1, transform: 'none' }],
        { duration: 260, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
    }
    (next === 'history' ? document.getElementById('historyBack') : document.getElementById('input')).focus({ preventScroll: true });
  }
  Lux.showView = showView;

  document.getElementById('historyBtn').addEventListener('click', () => showView('history'));
  document.getElementById('historyBack').addEventListener('click', () => showView('chat'));
  document.getElementById('historyClose').addEventListener('click', () => Lux.setOpen(false));
  Lux.onClose = () => { if (view === 'history') { view = 'chat'; historyView.hidden = true; chatView.hidden = false; } };
  Lux.onSessionStarted = () => { if (view === 'history') render(); };

  /* ---------- List ---------- */

  const listed = () => Lux.sessions.filter(s => s.title);

  // Search: title, detection context or mode ("private" / "shared")
  const search = document.getElementById('historySearch');
  const searchClear = document.getElementById('historySearchClear');
  const query = () => search.value.trim().toLowerCase();
  const matches = (s, q) => !q || [s.title, s.ctx, s.mode === 'private' ? 'private' : 'shared'].some(v => v && v.toLowerCase().includes(q));
  search.addEventListener('input', () => { searchClear.hidden = !search.value; render(); });
  search.addEventListener('keydown', e => { if (e.key === 'Escape' && search.value) { e.stopPropagation(); clearSearch(); } });
  searchClear.addEventListener('click', clearSearch);
  function clearSearch() { search.value = ''; searchClear.hidden = true; render(); search.focus(); }

  // Who can see the chat, as a Corelight tag
  const modeTag = mode => mode === 'private'
    ? '<span class="mode-tag mode-tag--private"><span class="ms" aria-hidden="true">lock</span>Private</span>'
    : '<span class="mode-tag mode-tag--shared"><span class="ms" aria-hidden="true">lock_open_right</span>Shared</span>';

  function row(s, i) {
    const r = el('div', 'session' + (s === Lux.active ? ' is-current' : '') + (s.pinned ? ' is-pinned' : ''));
    r.dataset.id = s.id;
    r.style.setProperty('--i', i);
    r.innerHTML = `
      <button class="session__open" type="button">
        <span class="session__title">${s.title}</span>
        <span class="session__meta">${s.ctx ? `<span class="session__ctx">${s.ctx}</span><span aria-hidden="true">·</span>` : ''}${window.CrossChats ? CrossChats.live(s.id, { ago: s.ago, spin: true }) : `<span>${s.ago}</span>`}</span>
        <span class="session__tags">${modeTag(s.mode)}</span>
      </button>
      <span class="session__actions">
        <button class="icon-btn session__btn session__delete" type="button" aria-label="Delete ${s.title}">
          <span class="ms" aria-hidden="true">delete</span>
        </button>
        <button class="icon-btn session__btn session__pin" type="button" aria-pressed="${s.pinned}" aria-label="${s.pinned ? 'Unpin' : 'Pin'} ${s.title}">
          <span class="ms" aria-hidden="true">keep</span>
        </button>
      </span>`;
    r.querySelector('.session__open').addEventListener('click', async () => {
      await Lux.activate(s);
      showView('chat');
    });
    r.querySelector('.session__pin').addEventListener('click', () => togglePin(s));
    r.querySelector('.session__delete').addEventListener('click', () => confirmDelete(s));
    return r;
  }

  // entering = the view just opened: groups and rows cascade in like the welcome
  function render(entering) {
    const all = listed();
    const q = query();
    const items = all.filter(s => matches(s, q));
    list.replaceChildren();
    list.classList.toggle('is-entering', !!entering && !reduceMotion);
    if (all.length && !items.length) {
      const none = el('div', 'history-empty history-empty--search', `
        <span class="history-empty__icon" aria-hidden="true"><span class="ms">search_off</span></span>
        <p class="history-empty__title">No chats match “${search.value.trim().replace(/[<>&]/g, '')}”</p>
        <p class="history-empty__text">Try a detection name, an IP, or “private”.</p>
        <button class="btn btn--sm" type="button">Clear search</button>`);
      none.querySelector('button').addEventListener('click', clearSearch);
      list.append(none);
      return;
    }
    if (!items.length) {
      const empty = el('div', 'history-empty', `
        <span class="history-empty__icon" aria-hidden="true"><span class="ms">forum</span></span>
        <p class="history-empty__title">Nothing here yet</p>
        <p class="history-empty__text">Your conversations with Lux will show up here.</p>
        <button class="btn btn--primary btn--sm" type="button">Start a chat with Lux</button>`);
      empty.querySelector('button').addEventListener('click', () => { Lux.newChat(); showView('chat'); });
      list.append(empty);
      return;
    }
    const pinned = items.filter(s => s.pinned);
    const recent = items.filter(s => !s.pinned).reverse();   // newest first
    let i = 0;
    [['Pinned', 'keep', pinned], ['Recent', 'schedule', recent]].forEach(([title, icon, group]) => {
      if (!group.length) return;
      const g = el('section', 'history-group', `
        <p class="history-group__label" style="--i:${i++}"><span class="history-group__icon"><span class="ms" aria-hidden="true">${icon}</span></span>${title}<span class="history-group__count">${group.length}</span></p>
        <div class="history-tree"></div>`);
      const tree = g.querySelector('.history-tree');
      group.forEach(s => tree.append(row(s, i++)));
      list.append(g);
    });
  }

  // FLIP: rows glide from their old place to their new one after pin / unpin / delete
  function flip(change) {
    const before = new Map([...list.querySelectorAll('.session')].map(n => [n.dataset.id, n.getBoundingClientRect()]));
    change();
    if (reduceMotion) return;
    list.querySelectorAll('.session').forEach(n => {
      const b = before.get(n.dataset.id);
      const a = n.getBoundingClientRect();
      if (!b) {
        n.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
        return;
      }
      const dy = b.top - a.top;
      if (dy) n.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 360, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
    });
  }

  function togglePin(s) {
    flip(() => { s.pinned = !s.pinned; render(); });
    Lux.save?.();
    const n = list.querySelector(`.session[data-id="${s.id}"]`);
    n?.querySelector('.session__pin')?.animate([{ transform: 'scale(0.6) rotate(-25deg)' }, { transform: 'scale(1.2)' }, { transform: 'none' }], { duration: 360, easing: 'ease-out' });
    if (s.pinned) n?.classList.add('is-sheen');
  }

  /* ---------- Delete ---------- */

  let pendingDelete = null;
  function confirmDelete(s) {
    pendingDelete = s;
    modalRoot.hidden = false;
    document.body.classList.add('has-modal');
    requestAnimationFrame(() => modalRoot.classList.add('is-open'));
    setTimeout(() => document.getElementById('modalConfirm').focus(), 50);
  }
  async function closeModal() {
    modalRoot.classList.remove('is-open');
    await sleep(180);
    modalRoot.hidden = true;
    document.body.classList.remove('has-modal');
  }
  modalRoot.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => { pendingDelete = null; closeModal(); }));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !modalRoot.hidden) { pendingDelete = null; closeModal(); }
  });

  document.getElementById('modalConfirm').addEventListener('click', async () => {
    const s = pendingDelete;
    pendingDelete = null;
    await closeModal();
    if (!s) return;
    const node = list.querySelector(`.session[data-id="${s.id}"]`);
    if (node && !reduceMotion) {
      // the row lifts away and dissolves, like the thinking text leaving
      await node.animate([{ opacity: 1, transform: 'none', filter: 'blur(0)' }, { opacity: 0, transform: 'translateX(12px)', filter: 'blur(4px)' }],
        { duration: 200, easing: 'cubic-bezier(0.4, 0, 1, 1)' }).finished;
    }
    flip(() => {
      Lux.sessions.splice(Lux.sessions.indexOf(s), 1);
      s.node.remove();
      render();
    });
    Lux.save?.();
    if (s === Lux.active) Lux.newChat(null, { keepView: true });   // deleted the open conversation: start fresh
    toast('Session deleted');
  });

  /* ---------- Toast: the "coming soon" bar's look, rising from the input ---------- */

  function toast(text, { icon = 'check_circle', action, onAction } = {}) {
    toastSlot.replaceChildren();
    const t = el('div', 'toast', `
      <span class="ms toast__icon" aria-hidden="true">${icon}</span>
      <span class="toast__text">${text}</span>
      ${action ? `<button class="toast__action" type="button">${action}</button>` : ''}
      <button class="icon-btn toast__close" type="button" aria-label="Dismiss"><img src="icons/close.svg" width="16" height="16" alt=""></button>`);
    toastSlot.append(t);
    const close = async () => {
      if (!t.isConnected) return;
      t.classList.add('is-leaving');
      await sleep(200);
      t.remove();
    };
    t.querySelector('.toast__close').addEventListener('click', close);
    t.querySelector('.toast__action')?.addEventListener('click', () => { onAction(); close(); });
    setTimeout(close, action ? 5000 : 4000);
  }
  Lux.onModeChange = () => { if (view === 'history') render(); };
  Lux.toast = toast;
})();
