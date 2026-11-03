/* Section 03 · Chat history: Pinned / Recent sessions, pin and unpin, delete with a
   confirmation (Figma 3073:39325), "Session deleted" toast (3073:39963) and the empty
   state (3073:40543). Opening a session switches the chat to it. */

(() => {
  const { el, sleep, reduceMotion, ASSETS } = Lux;
  const panel = document.getElementById('panel');
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
    if (next === 'history') render();
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

  // Search: title, detection context or mode ("private" / "shared")
  const search = document.getElementById('historySearch');
  const searchClear = document.getElementById('historySearchClear');
  const query = () => search.value.trim().toLowerCase();
  const matches = (s, q) => !q || [s.title, s.ctx, s.mode === 'private' ? 'private' : 'shared'].some(v => v && v.toLowerCase().includes(q));
  const listed = () => Lux.sessions.filter(s => s.title);
  search.addEventListener('input', () => { searchClear.hidden = !search.value; render(); });
  search.addEventListener('keydown', e => { if (e.key === 'Escape' && search.value) { e.stopPropagation(); clearSearch(); } });
  searchClear.addEventListener('click', clearSearch);
  function clearSearch() { search.value = ''; searchClear.hidden = true; render(); search.focus(); }

  // Who can see the chat: the small Corelight tag, on its own line under the meta
  const modeTag = mode => mode === 'private'
    ? '<span class="mode-tag mode-tag--private"><span class="ms" aria-hidden="true">lock</span>Private</span>'
    : '<span class="mode-tag mode-tag--shared"><span class="ms" aria-hidden="true">lock_open_right</span>Shared</span>';

  function row(s) {
    const r = el('div', 'session' + (s === Lux.active ? ' is-current' : ''));
    r.dataset.id = s.id;
    r.innerHTML = `
      <button class="session__open" type="button">
        <span class="session__title">${s.title}</span>
        <span class="session__meta">${s.ctx ? `${s.ctx} · ` : ''}${window.CrossChats ? CrossChats.live(s.id, { ago: s.ago, spin: true }) : s.ago}</span>
        <span class="session__tags">${modeTag(s.mode)}</span>
      </button>
      <button class="session__btn session__pin" type="button" aria-pressed="${s.pinned}" aria-label="${s.pinned ? 'Unpin' : 'Pin'} ${s.title}">
        <img src="${ASSETS}${s.pinned ? 'pin-filled.svg' : 'pin.svg'}" width="14" height="14" alt="">
      </button>
      <button class="session__btn session__delete" type="button" aria-label="Delete ${s.title}">
        <span class="ms ms--14" aria-hidden="true">delete</span>
      </button>`;
    r.querySelector('.session__open').addEventListener('click', async () => {
      await Lux.activate(s);
      showView('chat');
    });
    r.querySelector('.session__pin').addEventListener('click', () => togglePin(s));
    r.querySelector('.session__delete').addEventListener('click', () => confirmDelete(s));
    return r;
  }

  function render() {
    const all = listed();
    const q = query();
    const items = all.filter(s => matches(s, q));
    list.replaceChildren();
    if (all.length && !items.length) {
      const none = el('div', 'history-group history-group--empty fade-in', `
        <p class="history-empty">No chats match “${search.value.trim().replace(/[<>&]/g, '')}”. <button class="link-btn" type="button">Clear search</button></p>`);
      none.querySelector('button').addEventListener('click', clearSearch);
      list.append(none);
      return;
    }
    if (!items.length) {
      const empty = el('div', 'history-group history-group--empty fade-in', `
        <p class="history-group__title">Recent</p>
        <p class="history-empty">Nothing here yet. <button class="link-btn" type="button">Start a chat with Lux</button></p>`);
      empty.querySelector('button').addEventListener('click', () => { Lux.newChat('hello'); showView('chat'); });
      list.append(empty);
      return;
    }
    const pinned = items.filter(s => s.pinned);
    const recent = items.filter(s => !s.pinned).reverse();   // newest first
    [['Pinned', pinned], ['Recent', recent]].forEach(([title, group]) => {
      if (!group.length) return;
      const g = el('div', 'history-group', `<p class="history-group__title">${title}</p>`);
      group.forEach(s => g.append(row(s)));
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
      if (dy) n.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 320, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
    });
  }

  function togglePin(s) {
    flip(() => { s.pinned = !s.pinned; render(); });
    Lux.save?.();
    const btn = list.querySelector(`.session[data-id="${s.id}"] .session__pin`);
    btn?.animate([{ transform: 'scale(0.7) rotate(-20deg)' }, { transform: 'scale(1.15)' }, { transform: 'none' }], { duration: 320, easing: 'ease-out' });
  }

  /* ---------- Delete ---------- */

  let pendingDelete = null;
  function confirmDelete(s) {
    pendingDelete = s;
    openModal();
  }

  function openModal() {
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
      await node.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(16px)' }], { duration: 180, easing: 'ease-in' }).finished;
    }
    flip(() => {
      Lux.sessions.splice(Lux.sessions.indexOf(s), 1);
      s.node.remove();
      render();
    });
    Lux.save?.();
    if (s === Lux.active) Lux.newChat('hello', { keepView: true });   // deleted the open conversation: start fresh
    toast('Session deleted');
  });

  /* ---------- Toast (Figma 3073:39963) ---------- */

  function toast(text) {
    toastSlot.replaceChildren();
    const t = el('div', 'toast', `
      <img class="toast__glow" src="${ASSETS}toast-glow.svg" width="184" height="184" alt="">
      <img src="${ASSETS}checkmark-outline.svg" width="20" height="20" alt="">
      <span class="toast__text">${text}</span>
      <button class="toast__close" type="button" aria-label="Dismiss"><img src="${ASSETS}toast-close.svg" width="16" height="16" alt=""></button>`);
    toastSlot.append(t);
    const close = async () => {
      if (!t.isConnected) return;
      t.classList.add('is-leaving');
      await sleep(200);
      t.remove();
    };
    t.querySelector('.toast__close').addEventListener('click', close);
    setTimeout(close, 4000);
  }
  Lux.toast = toast;
  Lux.onModeChange = () => { if (view === 'history') render(); };
})();
