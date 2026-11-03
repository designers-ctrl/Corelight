/* Ask Lux v1 — Corelight's "🚧 ChatOps v1" Figma file as a working prototype.
   This file is the chat core: open/close (docked column or floating popover), sessions,
   welcome states, sending, thinking, streaming, Lux answers, the Investigator Agent
   handoff (approve / cancel / undo / daily limit), unsupported requests and error states.
   history.js, profiles.js and pages.js build on the `Lux` object exported at the end.
   Sections covered: 01 core chat · 02 detection context · 03 history · 04 agent profiles ·
   05 unsupported requests · 06 edge cases. (08 light mode is intentionally not built.) */

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let instant = false;   // true while replaying a saved session: no delays, no streaming
const sleep = ms => new Promise(r => setTimeout(r, (reduceMotion || instant) ? 0 : ms));
const $ = id => document.getElementById(id);

const chat = $('chat');
const askLuxBtn = $('askLuxBtn');
const panel = $('panel');
const section = $('chatSection');
const welcome = $('welcome');
const hello = $('hello');
const threads = $('threads');
const composer = $('composer');
const input = $('input');
const sendBtn = $('sendBtn');
const stopBtn = $('stopBtn');
const attachment = $('attachment');
const contextSlot = $('contextSlot');
const launcher = $('luxLauncher');

const ASSETS = 'v1/assets/';
const AGENTS = {
  lux: {
    key: 'lux',
    name: 'Lux AI',
    icon: `<span class="agent-icon">${AgentIcons.html('lux', 16)}</span>`,      // icons from LUX AI chat v4 (agent-icons.js)
    thinkIcon: AgentIcons.html('lux', 24),
    ring: 'agent-status-ring.svg',
  },
  investigation: {
    key: 'investigation',
    name: 'Investigator Agent',
    icon: `<span class="agent-icon">${AgentIcons.html('investigation', 16)}</span>`,
    thinkIcon: AgentIcons.html('investigation', 24),
    ring: 'agent-status-ring-investigation.svg',
  },
};

const CREDIT_LIMIT = 10;
let credits = 7;        // investigations used today, tenant-wide; each approved handoff uses one
let busy = null;        // { stopped, byUser } while an agent is answering
let forceNext = null;   // scenario hook: 'timeout' | 'error' for the next request

const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};
const escapeHtml = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const scrollToEnd = force => {
  const near = section.scrollHeight - section.scrollTop - section.clientHeight < 80;
  if (force || near) section.scrollTo({ top: section.scrollHeight, behavior: (reduceMotion || instant) ? 'auto' : 'smooth' });
};

/* ---------- Sessions: one thread container per conversation ---------- */

const sessions = [];
let sid = 0;
let active = null;
let thread = null;   // the active session's container

function createSession(props = {}) {
  const node = el('div', 'thread');
  node.hidden = true;
  threads.append(node);
  return Object.assign({ id: `s${++sid}`, title: '', ctx: null, ago: 'Just now', pinned: false, started: false, node, welcomeMode: 'prompts', mode: lastMode }, props);
}

/* ---------- Private / Shared ----------
   The first icon in the input row. Each chat remembers who can see it; new chats start in the
   mode you used last. Changing it shows a notice at the top with Undo. */

let lastMode = 'shared';
const vis = $('vis');
const visBtn = $('visBtn');
const visMenu = $('visMenu');
const MODE_COPY = {
  private: { icon: 'lock', label: 'Private', placeholder: 'Ask anything. Only you will see this chat',
    title: 'Now private', long: 'Only you can see this chat, and Lux won’t learn from it.', short: 'Only you can see it' },
  shared: { icon: 'lock_open_right', label: 'Shared', placeholder: 'Ask anything',
    title: 'Now shared', long: 'Your team can see this chat, and Lux learns from it.', short: 'Your team can see it' },
};

function syncMode() {
  const mode = active?.mode || 'shared';
  vis.classList.toggle('is-private', mode === 'private');
  visBtn.querySelector('.ms').textContent = MODE_COPY[mode].icon;
  visBtn.setAttribute('aria-label', `Who can see this chat: ${MODE_COPY[mode].label}`);
  visMenu.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.mode === mode)));
  input.placeholder = MODE_COPY[mode].placeholder;
}

// Notice at the top of the chat (Corelight toast: dark surface, green edge and glow)
const modeNoteSlot = $('modeNoteSlot');
let noteTimer = 0;
function closeModeNote(n) {
  if (!n?.isConnected || n.classList.contains('is-leaving')) return;
  n.classList.add('is-leaving');
  setTimeout(() => n.remove(), 220);
}
function showModeNote(mode, onUndo) {
  clearTimeout(noteTimer);
  modeNoteSlot.querySelectorAll('.mode-note').forEach(closeModeNote);
  const c = MODE_COPY[mode];
  const n = el('div', `mode-note mode-note--${mode}`, `
    <img class="mode-note__glow" src="${ASSETS}toast-glow.svg" width="184" height="184" alt="">
    <span class="ms mode-note__icon" aria-hidden="true">${c.icon}</span>
    <span class="mode-note__text"><span class="mode-note__title mode-note__title--long">${c.title}</span><span class="mode-note__title mode-note__title--short">${c.label}</span><span class="mode-note__desc mode-note__desc--long">${c.long}</span><span class="mode-note__desc mode-note__desc--short">${c.short}</span></span>
    <button class="mode-note__undo" type="button">Undo</button>
    <button class="mode-note__close" type="button" aria-label="Dismiss"><img src="${ASSETS}toast-close.svg" width="16" height="16" alt=""></button>`);
  n.setAttribute('role', 'status');
  n.setAttribute('aria-label', `${c.title}. ${c.long}`);
  modeNoteSlot.append(n);
  const arm = ms => { clearTimeout(noteTimer); noteTimer = setTimeout(() => closeModeNote(n), ms); };
  arm(6000);
  n.addEventListener('pointerenter', () => clearTimeout(noteTimer));
  n.addEventListener('pointerleave', () => arm(2500));
  n.querySelector('.mode-note__close').addEventListener('click', () => closeModeNote(n));
  n.querySelector('.mode-note__undo').addEventListener('click', () => { closeModeNote(n); onUndo(); });
}

function setMode(mode, { silent = false } = {}) {
  if (!active || active.mode === mode) return;
  const before = active.mode;
  const s = active;
  s.mode = mode;
  lastMode = mode;
  syncMode();
  visBtn.classList.remove('is-pop'); void visBtn.offsetWidth; visBtn.classList.add('is-pop');
  Lux.onModeChange?.();
  saveSessions();
  if (silent) return;
  showModeNote(mode, () => {
    s.mode = before;
    lastMode = before;
    if (s === active) syncMode();
    Lux.onModeChange?.();
    saveSessions();
  });
}

// The lock opens its menu on hover (after a short pause) or on click
let visTimer = 0;
function setVisOpen(open, { focus = false } = {}) {
  clearTimeout(visTimer);
  if (open === !visMenu.hidden) return;
  visMenu.hidden = !open;
  visBtn.setAttribute('aria-expanded', String(open));
  if (open && focus) visMenu.querySelector('[aria-checked="true"]')?.focus();
}
vis.addEventListener('pointerenter', e => {
  if (e.pointerType !== 'mouse') return;
  clearTimeout(visTimer);
  visTimer = setTimeout(() => setVisOpen(true), 140);
});
vis.addEventListener('pointerleave', e => {
  if (e.pointerType !== 'mouse') return;
  clearTimeout(visTimer);
  visTimer = setTimeout(() => setVisOpen(false), 220);
});
visBtn.addEventListener('click', () => setVisOpen(visMenu.hidden, { focus: true }));
visMenu.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => {
  setMode(b.dataset.mode);
  setVisOpen(false);
  input.focus({ preventScroll: true });
}));
visMenu.addEventListener('keydown', e => {
  const items = [...visMenu.querySelectorAll('[data-mode]')];
  const i = items.indexOf(document.activeElement);
  if (e.key === 'Escape') { e.preventDefault(); setVisOpen(false); visBtn.focus(); }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus(); }
});
document.addEventListener('click', e => {
  if (!visMenu.hidden && !e.target.closest('.vis')) setVisOpen(false);
});

async function activate(s) {
  if (busy) { busy.stopped = true; setBusy(null); }
  sessions.forEach(x => { x.node.hidden = x !== s; });
  active = s;
  thread = s.node;
  AgentWork.setScope(s.id);     // the bar shows this chat's agents; other chats are in the panel
  if (s.build && !s.built) {           // saved session: replay its conversation instantly
    s.built = true;
    instant = true;
    try { await s.build(); } finally { instant = false; }
  }
  renderWelcome();
  syncMode();
  section.scrollTop = s.started ? section.scrollHeight : 0;
  if (sessions.includes(s)) saveSessions();
}

function renderWelcome() {
  const empty = !active.started;
  section.classList.toggle('has-thread', !empty);
  section.classList.toggle('is-hello', empty && active.welcomeMode === 'hello');
  welcome.hidden = !(empty && active.welcomeMode === 'prompts');
  hello.hidden = !(empty && active.welcomeMode === 'hello');
  CrossChats.update();
}

/* ---------- Welcome intros (typed) ---------- */

let introRun = 0;
let promptsTyped = false;

async function typeInto(target, text, speed, run) {
  const node = document.createTextNode('');
  const caret = el('span', 'type-caret is-typing');
  target.replaceChildren(node, caret);
  for (let i = 1; i <= text.length; i++) {
    if (run !== introRun) return null;
    node.data = text.slice(0, i);
    const ch = text[i - 1];
    let delay = speed * (0.55 + Math.random() * 0.9);   // human rhythm
    if (ch === ' ') delay += speed * 0.4;
    if (/[,.?!]/.test(ch)) delay += 160;
    await sleep(delay);
  }
  caret.classList.remove('is-typing');
  return caret;
}

async function fadeCaret(caret) {
  if (!caret) return;
  await sleep(700);
  caret.classList.add('is-leaving');
  await sleep(260);
  caret.remove();
}

// Default state: the heading types, then the agents and prompts pop in
async function playPromptsIntro({ type }) {
  const run = ++introRun;
  const typed = welcome.querySelector('.typed');
  const full = 'How can I help you today?';
  section.classList.remove('is-entering', 'is-ready');
  void section.offsetWidth;
  section.classList.add('is-entering');
  if (!type || reduceMotion) { typed.textContent = full; section.classList.add('is-ready'); return; }
  typed.textContent = '';
  await sleep(340);
  const caret = await typeInto(typed, full, 42, run);
  if (!caret) return;
  await sleep(180);
  promptsTyped = true;
  section.classList.add('is-ready');
  await sleep(200);
  fadeCaret(caret);
}

// New thread (Figma 3073:40756): "Hello John", then "How can I help you today?"
async function playHelloIntro({ type = true } = {}) {
  const run = ++introRun;
  const [t1, t2] = hello.querySelectorAll('.typed');
  const a = 'Hello John', b = 'How can I help you today?';
  hello.classList.remove('is-ready');
  if (!type || reduceMotion) { t1.textContent = a; t2.textContent = b; hello.classList.add('is-ready'); return; }
  t1.textContent = ''; t2.textContent = '';
  await sleep(260);
  const c1 = await typeInto(t1, a, 70, run);
  if (!c1) return;
  await sleep(240);
  c1.remove();
  const c2 = await typeInto(t2, b, 32, run);
  if (!c2) return;
  hello.classList.add('is-ready');
  fadeCaret(c2);
}

function playIntro(opts = {}) {
  if (active.started) return;
  if (active.welcomeMode === 'hello') playHelloIntro({ type: opts.type ?? true });
  else playPromptsIntro({ type: opts.type ?? !promptsTyped });
}

/* ---------- Open / close: docked column or floating popover ---------- */

let floating = false;
const overlayOpen = () => document.body.classList.contains('has-overlay');
const isOpen = () => chat.classList.contains('is-open');

function setFloating(on) {
  floating = on;
  chat.classList.toggle('is-floating', on);
  chat.classList.remove('is-expanded');
  if (on) delete chat.dataset.size;
  syncLauncher();
}

function setOpen(open, { float } = {}) {
  if (open && float !== undefined) setFloating(float);
  chat.classList.toggle('is-open', open);
  chat.inert = !open;
  askLuxBtn.setAttribute('aria-pressed', String(open));
  if (open) {
    playIntro();
    setTimeout(() => input.focus({ preventScroll: true }), 320);
  } else {
    introRun++;   // stop typing if the panel closes mid-way
    Lux.onClose?.();
  }
  syncLauncher();
}

// The floating launcher shows on pages with context, whenever the docked column is closed
function syncLauncher() {
  const page = document.body.dataset.page;
  const show = page === 'detection' && !(isOpen() && !floating);
  launcher.hidden = !show;
  launcher.classList.toggle('is-active', isOpen() && floating);
}

askLuxBtn.addEventListener('click', () => {
  // Top-nav entry point opens the docked column; over a drawer or window it floats instead
  const wantFloat = overlayOpen();
  if (isOpen() && floating === wantFloat) setOpen(false);
  else setOpen(true, { float: wantFloat });
});
launcher.addEventListener('click', () => {
  if (isOpen() && floating) setOpen(false);
  else setOpen(true, { float: true });
});
$('closeBtn').addEventListener('click', () => setOpen(false));
/* Chat size (as in v3): M = half the content area, L = the whole content area. null = default.
   Only for the docked column; the floating popover keeps its own size. */
function setSize(size) {
  if (size) chat.dataset.size = size;
  else delete chat.dataset.size;
  chat.classList.remove('is-expanded');
  $('expandBtn').setAttribute('aria-label', size ? 'Collapse chat' : 'Expand chat');
}
function sizeScenario(size) {
  if (!isOpen() || floating) setOpen(true, { float: false });
  setSize(size);
}
$('expandBtn').addEventListener('click', () => {
  if (chat.dataset.size) return setSize(null);
  const expanded = chat.classList.toggle('is-expanded');
  $('expandBtn').setAttribute('aria-label', expanded ? 'Collapse chat' : 'Expand chat');
});
$('newChatBtn').addEventListener('click', () => newChat('hello'));
$('upcomingClose').addEventListener('click', () => {
  const box = $('upcoming');
  box.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.98)' }],
    { duration: reduceMotion ? 1 : 180, easing: 'ease-in' }).finished.then(() => { box.hidden = true; });
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || document.body.classList.contains('has-modal')) return;
  if (Lux.closeTopLayer?.()) return;
  if (isOpen()) setOpen(false);
});

// New chat thread (section 03): leaves the current conversation in history
function newChat(mode = 'hello', { keepView = false, quiet = false, typed = true } = {}) {
  const s = createSession({ welcomeMode: mode });
  if (quiet) s.started = true;      // straight into a flow (scenarios): no greeting to flash and vanish
  sessions.push(s);
  activate(s);
  clearAttachment();
  input.value = '';
  autosize();
  if (!keepView) Lux.showView?.('chat');
  section.classList.toggle('is-still', !typed);   // greeting already in place: no cascade
  if (!quiet) playIntro({ type: typed });
  if (!keepView) input.focus({ preventScroll: true });
  return s;
}

/* ---------- Context chip (section 02) ---------- */

let context = null;
function setContext(label) {
  context = label || null;
  if (context) $('contextText').textContent = context;
  contextSlot.classList.toggle('is-shown', !!context);
}
$('contextRemove').addEventListener('click', () => { setContext(null); input.focus(); });

/* ---------- Composer ---------- */

function autosize() {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 200) + 'px';
  composer.classList.toggle('has-text', input.value.trim().length > 0 || !attachment.hidden);
}
input.addEventListener('input', autosize);
input.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); composer.requestSubmit(); }
});

// Interactive light: a soft glow follows the cursor over cards
document.addEventListener('pointermove', e => {
  const card = e.target.closest?.('.prompt, .soon-card, .ask-card');
  if (!card) return;
  const r = card.getBoundingClientRect();
  card.style.setProperty('--mx', `${e.clientX - r.left}px`);
  card.style.setProperty('--my', `${e.clientY - r.top}px`);
});

// "Compact text attachment": a large pasted block (a log) becomes a small attachment
input.addEventListener('paste', e => {
  const text = e.clipboardData?.getData('text') || '';
  if (text.split('\n').length < 5 && text.length < 280) return;
  e.preventDefault();
  setAttachment(text.trim().split('\n').slice(0, 3).join('\n') + '\n...');
});
function setAttachment(text) {
  attachment.querySelector('.composer__attachment-text').textContent = text;
  attachment.hidden = false;
  autosize();
}
function clearAttachment() { attachment.hidden = true; autosize(); }
$('attachmentRemove').addEventListener('click', () => { clearAttachment(); input.focus(); });

composer.addEventListener('submit', e => {
  e.preventDefault();
  if (busy) return;
  const text = input.value.trim();
  const att = attachment.hidden ? null : attachment.querySelector('.composer__attachment-text').textContent;
  if (!text && !att) return;
  send(text || 'Help me understand this log', att);
});
stopBtn.addEventListener('click', () => { if (busy) { busy.stopped = true; busy.byUser = true; } });

function setBusy(state) {
  const was = busy;
  busy = state;
  sendBtn.hidden = !!state;
  stopBtn.hidden = !state;
  if (!state) workEnd(was?.stopped);
}

/* ---------- Agent activity bar (shared agent-work.js) ----------
   Above the input: shows while Lux or the Investigator Agent works on an answer, and for
   background work started by a scenario. Same component and look in every version. */

AgentWork.mount({ before: composer });
const WORK_ICON = { lux: AgentIcons.src('lux', 24), investigation: AgentIcons.html('investigation', 20) };

/* ---------- Agents working across chats (shared cross-chats.js) ----------
   The Investigation Agent keeps working in another chat. A new chat shows it in the panel above
   the input (same in every version); Open chat goes there, where its live card sits in Lux's reply. */

const crossAgent = () => ({ key: 'investigation', name: AGENTS.investigation.name, icon: WORK_ICON.investigation });
function crossChat() {
  const D = CrossChats.DEMO;
  const s = createSession({ title: D.title, about: D.context, ago: 'Just now', cross: true, mode: 'shared' });
  s.uid = `x${Date.now().toString(36)}`;
  s.ts = Date.now();
  s.job = CrossChats.startDemo(s.id, crossAgent(), end => { s.end = end; });
  s.build = async () => {
    await leaveWelcome();
    thread.append(userMsgEl(D.ask));
    const m = agentMessage(AGENTS.lux);
    const text = el('div', 'text');
    text.append(el('p', '', escapeHtml(D.lead)));
    m.content.append(text);
    const box = el('div', 'aw-cards');
    box.append(CrossChats.demoCard(s.job, crossAgent(), s.end));
    m.content.append(box);
    m.wrap.append(actionsRow());
    m.done();
  };
  sessions.push(s);
  return s;
}

/* Agents working across multiple chats: two agents in the chat that's open and two in another
   one. The shared panel lists both chats, the open one first with a CURRENT badge. */
const multiAgent = role => (role === 'investigator' ? crossAgent() : { key: 'lux', name: AGENTS.lux.name, icon: WORK_ICON.lux });
function multiChat(which) {
  const D = CrossChats.MULTI[which];
  const s = createSession({ title: D.title, about: D.context, ago: 'Just now', cross: true, mode: 'shared' });
  s.uid = `x${which}${Date.now().toString(36)}`;
  s.ts = Date.now();
  s.jobs = CrossChats.startMulti(s.id, which, multiAgent, (k, end) => { (s.ends ||= [])[k] = end; });
  s.build = async () => {
    await leaveWelcome();
    thread.append(userMsgEl(D.ask));
    const m = agentMessage(AGENTS.lux);
    const text = el('div', 'text');
    text.append(el('p', '', escapeHtml(D.lead)));
    m.content.append(text, CrossChats.multiCards(which, multiAgent, s.jobs, s.ends));
    m.wrap.append(actionsRow());
    m.done();
  };
  sessions.push(s);
  return s;
}
async function multiScenario() {
  document.body.dataset.page === 'dashboard' || Lux.goTo?.('dashboard');
  if (!isOpen()) setOpen(true, { float: false });
  Lux.showView?.('chat');
  AgentWork.clearAll();
  const prev = active;
  const drop = x => { x.node.remove(); sessions.splice(sessions.indexOf(x), 1); };
  sessions.filter(x => x.cross).forEach(drop);
  if (prev && sessions.includes(prev) && !prev.saved && !prev.started && !prev.turns?.length) drop(prev);   // the old empty chat isn't kept
  multiChat('other');
  const s = multiChat('current');
  CrossChats.expand(false);       // collapsed: "Agents working in 2 chats"
  await activate(s);
}
CrossChats.mount({
  before: document.querySelector('.aw'),
  current: () => ({ id: active?.id, intro: !!active && !active.started }),
  info: id => { const s = sessions.find(x => x.id === id); return s ? { title: s.title, context: s.about } : null; },
  open: id => {
    const s = sessions.find(x => x.id === id);
    if (!s) return;
    Lux.showView?.('chat');
    if (s !== active) activate(s);
    else scrollToEnd(true);
  },
});
const WORK_STEPS = {
  lux: ['Analyzing request', 'Searching Zeek logs', 'Writing the answer'],
  investigation: ['Generating LogScale query', 'Running query on the last 24 hours', 'Analyzing related alerts', 'Writing the answer'],
};
let workJob = null;     // the agent working on the current answer
const clip = (t, n = 44) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
function lastQuestion() {
  const m = [...thread.querySelectorAll('.user-msg')].pop();
  return (m?.lastChild?.textContent || '').trim();
}
function workBegin(agent) {
  if (instant) return;
  if (workJob) AgentWork.finish(workJob);
  const q = lastQuestion();
  const ip = (q.match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/) || [])[0];
  const steps = WORK_STEPS[agent.key] || WORK_STEPS.lux;
  workJob = AgentWork.start({
    agent: { name: agent.name, icon: WORK_ICON[agent.key] },
    task: agent.key === 'lux' ? (q ? `Answering “${clip(q)}”` : 'Answering your question') : `Investigating ${ip || 'the activity'}`,
    // the thinking time is one phase here, so the steps run on their own and the last one waits for the answer
    steps: steps.map((label, i) => ({ label, ms: i < steps.length - 1 ? 900 : 4000 })),
    hold: true,
    owner: active?.id,    // its chat shows "Agent is working..." in History while this runs
  });
}
function workAnswer() {
  if (!workJob) return;
  const j = AgentWork.jobs.find(x => x.id === workJob);
  const last = (WORK_STEPS[j?.agent === AGENTS.investigation.name ? 'investigation' : 'lux']).length - 1;
  AgentWork.step(workJob, last);
}
function workEnd(stopped) {
  if (!workJob) return;
  if (stopped) AgentWork.stop(workJob); else AgentWork.finish(workJob);
  workJob = null;
}

// Background work for the scenarios: Lux summarizes the night, the Investigator Agent ends on an approval
function backgroundWork({ fast = false } = {}) {
  const t = ms => (fast ? Math.round(ms / 4) : ms);
  const lux = {
    agent: { name: AGENTS.lux.name, icon: WORK_ICON.lux }, task: 'Summarizing overnight detections', where: 'background',
    steps: [{ label: 'Collecting 41 new detections', ms: t(2600) }, { label: 'Grouping by host and technique', ms: t(2600) }, { label: 'Ranking by risk', ms: t(2200) }, { label: 'Writing the summary', ms: t(2000) }],
    result: { summary: '41 detections · 3 need attention', findings: ['EternalBlue on 192.168.1.157 is the top risk', '12 low-risk port scans can be closed', 'No new hosts compromised overnight'] },
  };
  const inv = {
    agent: { name: AGENTS.investigation.name, icon: WORK_ICON.investigation }, task: 'Investigating EternalBlue on 192.168.1.157', where: 'background',
    steps: [{ label: 'Gathering network activity', ms: t(2400) }, { label: 'Enriching with threat intelligence', ms: t(2600) }, { label: 'Checking for related assets', ms: t(2300) }, { label: 'Analyzing potential intent', ms: t(2100) }],
    approval: {
      question: '192.168.1.157 is still sending SMB exploit traffic to 4 hosts. Isolate it from the network?', short: 'Isolate 192.168.1.157?',
      inChat: true,   // asked only in the chat card; the bar shows what the agent already did
      done: ['Checked IP address 192.168.1.157', 'Analyzed network traffic', 'Identified SMB exploit activity', 'Detected suspicious activity across 4 hosts'],
      yes: 'Isolate host', no: 'Not now', yesDone: 'Isolation started for 192.168.1.157', noDone: 'Left online. Lux keeps watching it',
      findings: ['SMB exploit attempts to 4 internal hosts', 'No successful logins found', 'Matches EternalBlue tooling (high confidence)'],
    },
  };
  return { lux, inv };
}

/* ---------- Prompts ---------- */

const SAMPLE_LOG = '_path: ssl\n_system_name: LABSensor2\n_write_ts: 2026-09-22T20:51:26.670146Z\n...';
document.querySelectorAll('.prompt').forEach(btn => {
  btn.addEventListener('click', () => usePrompt(btn.querySelector('.prompt__text').textContent, btn.dataset.prompt));
});

// Prompts with a [placeholder] go into the composer with it selected; others are sent
function usePrompt(text, kind) {
  if (kind === 'log') return send(text, SAMPLE_LOG);
  const m = text.match(/\[[^\]]+\]|\{[^}]+\}/);
  if (!m) return send(text);
  input.value = text;
  autosize();
  input.focus();
  input.setSelectionRange(m.index, m.index + m[0].length);
}

/* ---------- Conversation ---------- */

async function leaveWelcome() {
  if (active.started) return;
  introRun++;   // stop the heading if it's still typing
  const box = active.welcomeMode === 'hello' ? hello : welcome;
  box.classList.add('is-leaving');
  await sleep(150);
  box.classList.remove('is-leaving');
  active.started = true;
  renderWelcome();
}

async function send(text, att) {
  if (busy) return;
  input.value = '';
  autosize();
  clearAttachment();
  await leaveWelcome();
  const s = active;
  if (!s.title) {                        // first message names the session in history
    s.title = text.length > 34 ? text.slice(0, 32).trimEnd() + '…' : text;
    s.ctx = context;
    s.ago = 'Just now';
    s.uid ||= `u${Date.now().toString(36)}`;
    Lux.onSessionStarted?.(s);
  }
  // remembered, so the chat is still here after a reload or a switch to another version
  const turn = { q: text, att: att || null, ctx: context || null };
  if (!s.saved) { (s.turns ||= []).push(turn); s.ts = Date.now(); saveSessions(); }
  thread.append(userMsgEl(text, att));
  scrollToEnd(true);
  await respond({ text, att, ctx: context, msg: thread.lastElementChild, turn });
}
function userMsgEl(text, att) {
  const msg = el('div', 'user-msg');
  if (att) msg.append(el('div', 'user-msg__attachment', escapeHtml(att)));
  msg.append(el('div', '', escapeHtml(text)));
  return msg;
}

// Runs one request: thinking, then the right kind of answer. Handles stop / failures.
async function respond(req) {
  const state = { stopped: false, byUser: false };
  setBusy(state);
  const outcome = forceNext;
  forceNext = null;
  await think(AGENTS.lux, 'Analyzing request...', state);

  if (!state.stopped && outcome) {
    errorAlert(req, outcome);
  } else if (!state.stopped) {
    const kind = classify(req);
    if (kind.type === 'answer') await luxAnswer(kind.answer, state);
    else if (kind.type === 'background') await backgroundAnswer(req, state);
    else if (kind.type === 'unsupported') await unsupported(kind.agent, state);
    else await handoff(kind.topic, state);
  }
  if (state.stopped && state.byUser) interrupted({ text: req.text, anchor: req.msg, retry: () => respond(req) });
  if (busy === state) setBusy(null);
}

function classify({ text, att, ctx }) {
  const t = text.toLowerCase();
  if (/\bbackground\b|while i (work|keep)|keep (working|watching)/.test(t)) return { type: 'background' };
  if (att || /(understand|explain).*\blog\b/.test(t)) return { type: 'answer', answer: LOG_ANSWER };
  if (/lateral movement/.test(t)) return { type: 'answer', answer: LATERAL_ANSWER };
  if (/\b(write|create|build|draft|author|prepare|generate)\b.*\b(reports?|summary|summaries|notes?|write-?ups?)\b/.test(t)) return { type: 'unsupported', agent: 'reporting' };
  if (/\bhunt(s|ing)?\b/.test(t) && !/how do i/.test(t)) return { type: 'unsupported', agent: 'threat' };
  if (/dns tunnel/.test(t) && /how/.test(t)) return { type: 'answer', answer: DNS_ANSWER };
  if (/beacon/.test(t) && /how/.test(t)) return { type: 'answer', answer: BEACON_ANSWER };
  if (ctx && /technique|adversar/.test(t)) return { type: 'answer', answer: CTX_TECHNIQUES };
  if (ctx && /(this|the) (alert|detection)|eternalblue|attack/.test(t)) return { type: 'answer', answer: CTX_ATTACK };
  if (/phish/.test(t)) return { type: 'investigate', topic: 'phish' };
  if (/exfil|send to external|sent to external|how much data/.test(t)) return { type: 'investigate', topic: 'exfil' };
  if (/domain|looked up|lookup/.test(t)) return { type: 'investigate', topic: 'domain' };
  return { type: 'investigate', topic: 'ip' };   // IPs, hashes, hosts, activity
}

async function think(agent, label, state) {
  workBegin(agent);
  const row = el('div', 'thinking', `
    <span class="thinking__icon">${agent.thinkIcon}</span>
    <span class="thinking__label">${label}</span>
    <img class="spinner" src="${ASSETS}spinner.svg" width="16" height="16" alt="">`);
  row.setAttribute('role', 'status');
  thread.append(row);
  scrollToEnd(true);
  const end = Date.now() + 1600 + Math.random() * 600;
  while (!instant && !reduceMotion && Date.now() < end && !state.stopped) await sleep(80);
  workAnswer();
  row.classList.add('is-done');
  await sleep(180);
  row.remove();
}

function agentName(agent) {
  return `<span class="agent-msg__name"><span class="agent-name" data-agent="${agent.key}" tabindex="0">${agent.name}</span></span>`;
}

function agentMessage(agent) {
  const wrap = el('div', 'agent-msg', `
    <div class="agent-msg__head">
      ${agent.icon}
      ${agentName(agent)}
      <img class="agent-msg__status" src="${ASSETS}${agent.ring}" alt="" width="16" height="16">
    </div>
    <div class="agent-msg__body"><div class="agent-msg__content"></div></div>`);
  thread.append(wrap);
  scrollToEnd();
  return {
    wrap,
    body: wrap.querySelector('.agent-msg__body'),
    content: wrap.querySelector('.agent-msg__content'),
    done() { wrap.querySelector('.agent-msg__status').classList.add('is-on'); },
  };
}

function reasoningToggle(label, lines) {
  const btn = el('button', 'reasoning-btn', `${label}<span class="ms ms--16" aria-hidden="true">keyboard_arrow_down</span>`);
  btn.type = 'button';
  btn.setAttribute('aria-expanded', 'false');
  const box = el('div', 'reasoning', `<div class="reasoning__inner"><div class="reasoning__box">${lines.map(l => `<div>${l}</div>`).join('')}</div></div>`);
  btn.addEventListener('click', () => {
    const open = btn.getAttribute('aria-expanded') !== 'true';
    btn.setAttribute('aria-expanded', String(open));
    box.classList.toggle('is-open', open);
  });
  return [btn, box];
}

function actionsRow() {
  const row = el('div', 'msg-actions fade-in', `
    <button type="button" aria-label="Good response" aria-pressed="false"><span class="ms ms--14" aria-hidden="true">thumb_up</span></button>
    <button type="button" aria-label="Bad response" aria-pressed="false"><span class="ms ms--14" aria-hidden="true">thumb_down</span></button>
    <button type="button" aria-label="Copy response"><span class="ms ms--14" aria-hidden="true">content_copy</span></button>`);
  const [up, down, copy] = row.querySelectorAll('button');
  [up, down].forEach((b, i) => b.addEventListener('click', () => {
    const on = b.getAttribute('aria-pressed') !== 'true';
    b.setAttribute('aria-pressed', String(on));
    if (on) [up, down][1 - i].setAttribute('aria-pressed', 'false');
  }));
  copy.addEventListener('click', () => {
    const text = row.closest('.agent-msg')?.querySelector('.agent-msg__content')?.innerText || '';
    navigator.clipboard?.writeText(text).catch(() => {});
    copy.querySelector('.ms').textContent = 'check';
    setTimeout(() => { copy.querySelector('.ms').textContent = 'content_copy'; }, 1200);
  });
  return row;
}

function suggestions(items) {
  const box = el('div', 'suggest fade-in', `<p class="suggest__intro">If you want, I can:</p>`);
  items.forEach(t => {
    const b = el('button', 'suggest__item', `<img src="${ASSETS}suggest-arrow.svg" width="16" height="16" alt=""><span>${t}</span>`);
    b.type = 'button';
    b.addEventListener('click', () => { if (!busy) send(t); });
    box.append(b);
  });
  return box;
}

/* Lux answers directly (no other agent needed) */
/* Lux hands the work to agents that keep going in the background. Their live cards sit in this
   reply (same jobs as the activity bar above the input); a reopened chat shows how they ended. */
async function backgroundAnswer(req, state) {
  const turn = req.turn || active.turns?.[active.turns.length - 1];
  const onlyApproval = /isolat|approv/i.test(req.text);
  const work = backgroundWork({ fast: onlyApproval });
  const specs = onlyApproval ? [work.inv] : [work.lux, work.inv];
  const m = agentMessage(AGENTS.lux);
  const text = el('div', 'text');
  m.content.append(text);
  await streamBlocks(text, [{ p: onlyApproval
    ? 'I asked the Investigator Agent to check 192.168.1.157 in the background. If it should be isolated, it will ask you first.'
    : 'I started two agents in the background, so you can keep working. Their progress is below and in the bar above the input. Anything that needs your approval will wait for you.' }], state);
  if (state.stopped) return;
  const box = el('div', 'aw-cards');
  const chatId = active?.id;
  specs.forEach((spec, k) => {
    const saved = turn?.bg?.[k];
    if (saved && saved.status !== 'working') { box.append(AgentWork.staticCard(spec, saved)); return; }
    const id = AgentWork.start(Object.assign({}, spec, { owner: chatId, onEnd: end => { if (turn) { (turn.bg ||= [])[k] = end; saveSessions(); } } }));
    box.append(AgentWork.card(id));
  });
  m.content.append(box);
  m.wrap.append(actionsRow());
  m.done();
  scrollToEnd();
}

async function luxAnswer(answer, state) {
  const m = agentMessage(AGENTS.lux);
  const [btn, box] = reasoningToggle('Lux reasoning', answer.reasoning);
  m.content.append(btn, box);
  const text = el('div', 'text');
  m.content.append(text);
  await streamBlocks(text, answer.blocks, state);
  if (state.stopped) return;
  m.body.append(el('div', 'divider fade-in'), suggestions(answer.suggest));
  m.wrap.append(actionsRow());
  m.done();
  scrollToEnd();
}

/* Section 05: a request only an upcoming agent can handle */
const UPCOMING = {
  reporting: {
    lead: "Writing incident reports and summaries will be handled by a dedicated agent that's on the way. Here's what it will do, and what I can help with in the meantime.",
    name: 'Reporting Agent',
    desc: 'Turns investigations into incident reports and summaries, with a timeline, affected assets and recommended next steps',
    asks: [
      ['How much data did 192.168.1.157 send to external hosts yesterday?', 'investigation'],
      ['Help me understand this log', 'lux'],
    ],
  },
  threat: {
    lead: "Hypothesis-driven hunting will be handled by a dedicated agent that's on the way. Here's what it will do, and what I can help with in the meantime.",
    name: 'Hunting Agent',
    desc: 'Runs hypothesis-driven hunts across your network, pivots across Zeek logs, and turns what it finds into detections',
    asks: [
      ['Which hosts contacted newly registered domains this week?', 'investigation'],
      ['How do I hunt for beaconing in Zeek logs?', 'lux'],
    ],
  },
};

async function unsupported(key, state) {
  const u = UPCOMING[key];
  const wrap = el('div', 'agent-msg agent-msg--plain');
  thread.append(wrap);
  const text = el('div', 'text');
  wrap.append(text);
  await streamBlocks(text, [{ p: u.lead.replace(/&amp;/g, '&') }], state);
  if (state.stopped) return;
  wrap.append(el('div', 'soon-block fade-in', `
    <span class="tag">Coming Soon</span>
    <div class="soon-card soon-card--lg">
      <div class="soon-card__top">${AgentIcons.html(key, 16, { off: true })}<span class="soon-card__name">${u.name}</span></div>
      <p class="soon-card__desc">${u.desc}</p>
    </div>`));
  await sleep(160);
  const asks = el('div', 'also-ask fade-in', `<p class="also-ask__title">You can also ask</p>`);
  u.asks.forEach(([q, agentKey]) => {
    const a = AGENTS[agentKey];
    const b = el('button', 'ask-card', `<span class="ask-card__q">${q}</span><span class="ask-card__agent">${a.icon}${a.name}</span>`);
    b.type = 'button';
    b.addEventListener('click', () => { if (!busy) send(q); });
    asks.append(b);
  });
  wrap.append(asks);
  scrollToEnd();
}

/* Lux hands off to the Investigator Agent and asks for approval first */
async function handoff(topic, state) {
  const m = agentMessage(AGENTS.lux);
  const text = el('div', 'text');
  m.content.append(text);

  if (credits >= CREDIT_LIMIT) {
    await streamBlocks(text, [{ p: "This request needs the Investigator Agent, and today's investigations are used up." }], state);
    if (state.stopped) return;
    m.body.append(limitCard());
    const after = el('div', 'text');
    m.body.append(after);
    await sleep(300);
    await streamBlocks(after, [{ p: 'I can still answer questions about Corelight, Zeek, and how to investigate this manually.' }], state);
    return;   // the design shows no status ring in this state
  }

  await streamBlocks(text, [{ p: 'I can bring in the Investigator Agent to generate a LogScale query and analyze the related alerts and connections.' }], state);
  if (state.stopped) return;
  m.body.append(approvalCard(m, topic));
  scrollToEnd();
}

function creditRow(used) {
  const full = used >= CREDIT_LIMIT;
  return `<div class="agent-row">
      ${AGENTS.investigation.icon}
      <span class="agent-row__name"><span class="agent-name" data-agent="investigation" tabindex="0">Investigator Agent</span></span>
      <img class="agent-row__ring" src="${ASSETS}${full ? 'credit-ring-full.svg' : 'credit-ring.svg'}" width="20" height="20" alt="">
      <span class="agent-row__count">${used}/${CREDIT_LIMIT}</span>
    </div>`;
}

function approvalCard(m, topic) {
  const wrap = el('div', 'handoff', `<div class="handoff__inner"><div class="handoff-card">
      <p class="handoff-card__title">Bring in an agent</p>
      <div class="handoff-card__rows">
        ${creditRow(credits)}
        <div class="btns">
          <button class="btn btn--outline" type="button" data-act="approve">Approve</button>
          <button class="btn btn--ghost" type="button" data-act="cancel">Cancel</button>
        </div>
      </div>
    </div></div>`);
  wrap._msg = m;
  wrap._topic = topic;
  wrap.querySelector('[data-act="approve"]').addEventListener('click', () => approve(m, wrap, topic));
  wrap.querySelector('[data-act="cancel"]').addEventListener('click', () => cancel(m, wrap, topic));
  return wrap;
}

function limitCard() {
  return el('div', 'limit-card', `
    <div class="limit-card__title"><span class="ms ms--16" aria-hidden="true">error</span>Daily limit reached</div>
    ${creditRow(CREDIT_LIMIT)}
    <p class="limit-card__note">10 of 10 investigations used across your tenant. Resets at midnight</p>`);
}

async function approve(m, card, topic, { free = false } = {}) {
  if (busy) return;
  rememberDecision(true);
  card.querySelectorAll('button').forEach(b => { b.disabled = true; });
  card.classList.add('is-collapsing');
  await sleep(380);
  card.remove();
  const [btn, box] = reasoningToggle('Lux reasoning', LUX_HANDOFF_REASONING);
  m.content.prepend(btn, box);
  btn.classList.add('fade-in');
  m.done();
  if (!free) credits = Math.min(CREDIT_LIMIT, credits + 1);
  await runInvestigation(m.wrap, topic);
}

async function runInvestigation(anchor, topic) {
  const inv = INVESTIGATIONS[topic] || INVESTIGATIONS.ip;
  const state = { stopped: false, byUser: false };
  setBusy(state);
  await think(AGENTS.investigation, 'Investigator Agent is analyzing...', state);
  if (!state.stopped) {
    const msg = agentMessage(AGENTS.investigation);
    const [b2, p2] = reasoningToggle('Investigator Agent reasoning', inv.reasoning);
    msg.content.append(b2, p2);
    const text = el('div', 'text');
    msg.content.append(text);
    await streamBlocks(text, inv.blocks, state);
    if (!state.stopped) {
      if (inv.detections) msg.content.append(detectionsList());
      await sleep(250);
      msg.body.append(el('div', 'divider fade-in'), suggestions(inv.suggest));
      msg.wrap.append(actionsRow());
      msg.done();
      scrollToEnd();
    }
  }
  if (state.stopped && state.byUser) {
    const userMsg = [...thread.querySelectorAll('.user-msg')].pop();
    interrupted({ text: userMsg?.lastChild?.textContent || '', anchor, retry: () => runInvestigation(anchor, topic) });
  }
  if (busy === state) setBusy(null);
}

function rememberDecision(approved) {
  const turn = !instant && active.turns?.[active.turns.length - 1];
  if (turn) { turn.approve = approved; saveSessions(); }
}

async function cancel(m, card, topic) {
  if (busy) return;
  rememberDecision(false);
  const canceled = el('div', 'canceled-card', `
    <div class="canceled-card__left">
      <span class="canceled-card__icon"><span class="ms ms--16" aria-hidden="true">cancel</span></span>
      <div class="canceled-card__text"><span>Handoff canceled</span><span>Investigator Agent not started</span></div>
    </div>
    <button class="btn btn--outline" type="button">Undo</button>`);
  card.replaceWith(canceled);
  m.done();
  const reply = el('div', 'text');
  m.body.append(reply);
  const state = { stopped: false };
  setBusy(state);
  await streamBlocks(reply, [{ p: "Understood. Nothing was run. I'd need the Investigator Agent to answer this." }], state);
  const actions = actionsRow();
  m.body.append(actions);
  if (busy === state) setBusy(null);

  canceled.querySelector('button').addEventListener('click', () => {
    if (busy) return;
    reply.remove();
    actions.remove();
    canceled.replaceWith(approvalCard(m, topic));
  });
}

/* Detections: the design sets these as tab-separated text, which can't line up in a
   384px panel; shown as a compact list with the same fields. */
function detectionsList() {
  const rows = [
    ['#FA4D56', 'High', 'Periodic beaconing to rare external host', 'Sep 24, 09:12', 'Sep 30, 16:58', 'Open'],
    ['#FF9300', 'Medium', 'Self-signed certificate on outbound TLS', 'Sep 24, 09:12', 'Sep 30, 16:58', 'Open'],
    ['#F1C21B', 'Low', 'SMB enumeration of multiple internal hosts', 'Sep 19, 14:03', 'Sep 19, 14:05', 'Closed (benign: IT inventory scan)'],
  ];
  return el('div', 'detections fade-in', `
    <p class="detections__title">Detections</p>
    <ul class="detections__list">${rows.map(([c, sev, name, first, last, status]) => `
      <li class="det">
        <div class="det__top"><span class="sev" style="--c:${c}">${sev}</span><span class="det__status${status === 'Open' ? ' is-open' : ''}">${status}</span></div>
        <div class="det__name">${name}</div>
        <div class="det__time">First seen ${first} · Last seen ${last}</div>
      </li>`).join('')}
    </ul>`);
}

/* ---------- Section 06: edge cases ---------- */

const ERRORS = {
  timeout: 'Connection timed out',
  error: 'Failed to complete request',
};

// Timeout / loading error (Figma 3073:43148)
function errorAlert(req, kind) {
  const box = el('div', 'alert alert--warning', `
    <img class="alert__glow" src="${ASSETS}warning-glow.svg" width="184" height="184" alt="">
    <img class="alert__icon" src="${ASSETS}warning-20.svg" width="20" height="20" alt="">
    <div class="alert__stack">
      <p class="alert__title">${ERRORS[kind]}</p>
      <p class="alert__body">We could not complete your request, refresh the page to try again</p>
      <button class="alert__link" type="button">Try again</button>
    </div>`);
  thread.append(box);
  scrollToEnd();
  box.querySelector('.alert__link').addEventListener('click', async () => {
    if (busy) return;
    await removeAnimated(box);
    respond(req);
  });
}

// Streaming interrupted (Figma 3073:44347): the user pressed Stop
function interrupted({ text, anchor, retry }) {
  const box = el('div', 'interrupted', `
    <div class="alert alert--info">
      <img class="alert__glow" src="${ASSETS}info-glow.svg" width="184" height="184" alt="">
      <img class="alert__icon" src="${ASSETS}info-20.svg" width="20" height="20" alt="">
      <div class="alert__stack"><p class="alert__text">Lux’s response was interrupted</p></div>
    </div>
    <div class="btns">
      <button class="btn btn--outline" type="button" data-act="edit">Edit prompt</button>
      <button class="btn btn--outline" type="button" data-act="retry">Try again</button>
    </div>`);
  thread.append(box);
  scrollToEnd();
  box.querySelector('[data-act="edit"]').addEventListener('click', () => {
    input.value = text || '';
    autosize();
    input.focus();
    input.select();
  });
  box.querySelector('[data-act="retry"]').addEventListener('click', async () => {
    if (busy) return;
    // drop the partial answer and this notice, then answer again
    await removeAnimated(box);
    if (anchor && anchor.parentNode === thread) {
      while (anchor.nextSibling) anchor.nextSibling.remove();
    }
    retry();
  });
}

async function removeAnimated(node) {
  if (!reduceMotion) {
    await node.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-4px)' }],
      { duration: 160, easing: 'ease-in' }).finished;
  }
  node.remove();
}

/* ---------- Streaming ---------- */
/* Blocks: { h }, { p }, { li } or { li, lead }. Words fade in from a slight blur. */
async function streamBlocks(target, blocks, state) {
  const caret = el('span', 'caret');
  let list = null;
  for (const block of blocks) {
    if (state.stopped) break;
    let node;
    if (block.li) {
      if (!list) { list = el('ul'); target.append(list); }
      node = el('li');
      list.append(node);
      if (block.lead) node.append(el('strong', '', escapeHtml(block.lead) + ' '));
    } else {
      list = null;
      node = el(block.h ? 'h4' : 'p');
      target.append(node);
    }
    const text = block.li || block.p || block.h;
    if (instant) { node.append(text); continue; }
    for (const part of text.split(/(\s+)/)) {
      if (state.stopped) break;
      if (!part) continue;
      if (/^\s+$/.test(part)) { node.append(part); continue; }
      node.append(el('span', 'tok', escapeHtml(part)));
      node.append(caret);
      scrollToEnd();
      await sleep(18 + Math.random() * 30);
    }
    await sleep(90);
  }
  caret.remove();
  setTimeout(() => {
    target.querySelectorAll('.tok').forEach(t => t.replaceWith(t.textContent));
    target.normalize();
  }, 400);
}

/* ---------- Content (from the design where it exists) ---------- */

const LOG_ANSWER = {
  reasoning: [
    'Understanding your request - Identifying the work, dependencies, and best capability.',
    'Reasoning - Reading the ssl.log fields and the connection state.',
  ],
  blocks: [
    { h: 'What happened:' },
    { li: 'Host 192.168.57.5 tried to open an encrypted RDP (Remote Desktop) session to 192.168.57.8 on port 3389.' },
    { li: 'The server answered, but the handshake is recorded as not completed.' },
    { h: 'Why it\'s "not established":' },
    { li: "The sensor only captured the server's half of the conversation. ssl_history: sxni is all lowercase, which means server-side messages only (hello, certificate, done, cipher change)." },
    { li: "The client's messages were never seen, so there's no SNI and no JA3 fingerprint for the client. This is most likely a capture or visibility gap, not a failed connection." },
    { h: 'Notable details:' },
    { lead: 'Old, weak encryption:', li: 'TLS 1.0 with RSA key exchange and CBC mode. The server is outdated or unhardened.' },
    { lead: 'Odd certificate:', li: "It's self-signed with CN=localhost. Windows RDP normally uses the machine's hostname, so .8 may be a Linux box (xrdp), a lab or test system, or a tool-generated cert." },
    { lead: 'Internal traffic:', li: 'Both hosts are on the same private subnet, so this is internal (east-west) RDP.' },
  ],
  suggest: [
    'Show the raw ssl.log entries for 203.0.113.87',
    "Compare this host's activity to other Finance VLAN workstations",
  ],
};

// Not in the design: written in the same style
const LATERAL_ANSWER = {
  reasoning: [
    'Understanding your request - Identifying the work, dependencies, and best capability.',
    'Reasoning - Mapping lateral movement techniques to Zeek logs.',
  ],
  blocks: [
    { h: 'Where to start:' },
    { li: 'Look for internal hosts talking to each other over admin protocols: SMB (445), RDP (3389), WinRM (5985) and SSH (22).' },
    { li: 'Compare against a 7-day baseline to surface host pairs that are new.' },
    { h: 'Zeek logs to check:' },
    { lead: 'conn.log:', li: 'internal-to-internal connections on those ports.' },
    { lead: 'smb_files.log and dce_rpc.log:', li: 'remote service creation and writes to admin shares.' },
    { lead: 'kerberos.log:', li: 'unusual ticket requests from the same source.' },
  ],
  suggest: [
    'Find new internal host pairs on SMB in the last 24 hours',
    'Show remote service creation events this week',
  ],
};

const DNS_ANSWER = {
  reasoning: ['Understanding your request - Identifying the work, dependencies, and best capability.', 'Reasoning - Mapping DNS tunneling traits to dns.log fields.'],
  blocks: [
    { h: 'What tunneling looks like in dns.log:' },
    { lead: 'Long queries:', li: 'query names well over 50 characters, often with random-looking subdomains.' },
    { lead: 'High entropy:', li: 'labels that look like encoded data (base32 or hex) instead of words.' },
    { lead: 'Volume to one domain:', li: 'hundreds of unique subdomains of the same parent domain from a single host.' },
    { lead: 'Unusual record types:', li: 'lots of TXT or NULL queries, which can carry more data.' },
  ],
  suggest: ['Which hosts made unusually long DNS queries in the last 7 days?', 'Show TXT queries to rare domains this week'],
};

const BEACON_ANSWER = {
  reasoning: ['Understanding your request - Identifying the work, dependencies, and best capability.', 'Reasoning - Mapping beaconing traits to conn.log and ssl.log.'],
  blocks: [
    { h: 'What beaconing looks like:' },
    { lead: 'Regular timing:', li: 'connections from one host to the same destination at near-constant intervals.' },
    { lead: 'Similar size:', li: 'requests and responses with almost identical byte counts.' },
    { lead: 'Rare destination:', li: 'a host few or no other machines in your network talk to.' },
    { h: 'Where to look:' },
    { li: 'Group conn.log by source and destination, then compare the spread of time between connections.' },
  ],
  suggest: ['Which hosts show beaconing to rare external hosts?', 'Show ssl.log for connections with identical byte counts'],
};

const CTX_ATTACK = {
  reasoning: ['Understanding your request - Using the open detection as context.', 'Reasoning - Matching EternalBlue (MS17-010) to known campaigns.'],
  blocks: [
    { h: 'What this alert means:' },
    { li: 'EternalBlue (MS17-010) exploits a flaw in SMBv1 to run code remotely on unpatched Windows hosts.' },
    { li: '192.168.1.157 received traffic matching the exploit pattern 2,033 times since August 6.' },
    { h: 'Attacks usually associated with it:' },
    { lead: 'Ransomware:', li: 'WannaCry and NotPetya used EternalBlue to spread from host to host.' },
    { lead: 'Lateral movement:', li: 'attackers use it to reach other machines that still accept SMBv1.' },
    { lead: 'Reconnaissance:', li: 'scanners and red-team tools probe for vulnerable SMBv1 hosts.' },
  ],
  suggest: ['Is 192.168.201.02 a known vulnerability scanner?', 'Which other hosts still accept SMBv1 connections?'],
};

const CTX_TECHNIQUES = {
  reasoning: ['Understanding your request - Using the open detection as context.', 'Reasoning - Mapping EternalBlue to MITRE ATT&CK techniques.'],
  blocks: [
    { h: 'Techniques an adversary might use:' },
    { lead: 'T1210 Exploitation of Remote Services:', li: 'EternalBlue itself, run against SMBv1.' },
    { lead: 'T1021.002 SMB/Windows Admin Shares:', li: 'moving to other hosts once credentials are stolen.' },
    { lead: 'T1570 Lateral Tool Transfer:', li: 'copying payloads over SMB to the next host.' },
    { lead: 'T1486 Data Encrypted for Impact:', li: 'the ransomware stage seen in WannaCry and NotPetya.' },
  ],
  suggest: ['Show SMB file writes from 192.168.201.02', 'Which other hosts still accept SMBv1 connections?'],
};

const LUX_HANDOFF_REASONING = [
  'Understanding your request - Identifying the work, dependencies, and best capability.',
  'Reasoning - Compiling top detections from the past 24 hours',
];

const INVESTIGATIONS = {
  ip: {
    reasoning: ['Understanding your request - Activity for 192.0.2.44 over the last 14 days.', 'Querying - conn.log, ssl.log and dns.log in LogScale.', 'Correlating - Detections linked to this host.'],
    blocks: [
      { li: '192.0.2.44 is an internal workstation (WS-FIN-0217, Finance VLAN 40) with mostly normal activity and one notable anomaly.' },
      { li: 'Starting Sep 24, it began making regular outbound TLS connections to a rarely seen external host.' },
      { li: 'The timing and size of these connections look like beaconing. That traffic triggered 2 detections, and one of them is still open.' },
    ],
    detections: true,
    suggest: ['Show the raw ssl.log entries for 203.0.113.87', "Compare this host's activity to other Finance VLAN workstations"],
  },
  phish: {
    reasoning: ['Understanding your request - Phishing activity linked to 62.26.134.247.', 'Querying - http.log, dns.log and smtp.log in LogScale.'],
    blocks: [
      { li: '62.26.134.247 hosts a lookalike login page (corelight-secure-login[.]com) registered 3 days ago.' },
      { li: '12 internal users opened it on Sep 29 after a phishing email; 3 of them submitted credentials.' },
      { li: 'No follow-up connections from those hosts have been seen since.' },
    ],
    suggest: ['List the 3 users who submitted credentials', 'Show DNS lookups for corelight-secure-login[.]com'],
  },
  exfil: {
    reasoning: ['Understanding your request - Outbound data volume for 192.168.1.157.', 'Querying - conn.log in LogScale, grouped by destination.'],
    blocks: [
      { li: '192.168.1.157 sent 4.2 GB to external hosts yesterday, about 30 times its daily average.' },
      { li: '3.9 GB went to a single cloud storage IP between 01:12 and 02:40, outside working hours.' },
      { li: 'The transfer started 20 minutes after the EternalBlue alerts on the same host.' },
    ],
    suggest: ['Show the files transferred in that window', 'Has any other host contacted that storage IP?'],
  },
  domain: {
    reasoning: ['Understanding your request - Lookups of update-check-cdn[.]net.', 'Querying - dns.log in LogScale for the last 24 hours.'],
    blocks: [
      { li: '4 hosts looked up update-check-cdn[.]net in the last 24 hours, all in the Engineering VLAN.' },
      { li: 'The domain was registered 6 days ago and resolves to an IP with a poor reputation.' },
      { li: 'One host, ws-eng-042, then connected to that IP every 45 seconds.' },
    ],
    suggest: ['Show connections from ws-eng-042 to that IP', 'Which other domains resolve to the same IP?'],
  },
};

/* ---------- Saved sessions (section 03 sample data) ---------- */

const SAVED = [
  { mode: 'shared', title: 'Suspicious IP activity', ctx: 'EternalSafety::EternalBlue | 192.168.1.157', pinned: true,
    q: 'Provide details about recent activities for IP 192.0.2.44 within the last 14 days', approve: true },
  { mode: 'private', title: 'Phishing investigation', ctx: '62.26.134.247', pinned: true,
    q: 'Was 62.26.134.247 involved in any phishing activity this week?', approve: true },
  { mode: 'shared', title: 'Malware execution alert', ctx: 'EternalSafety::EternalBlue | 192.168.1.157',
    q: 'Help me understand this log', att: SAMPLE_LOG },
  { mode: 'private', title: 'Data exfiltration attempt', ctx: 'EternalSafety::EternalBlue | 192.168.1.157',
    q: 'How much data did 192.168.1.157 send to external hosts yesterday?', approve: true },
  { mode: 'shared', title: 'Suspicious domain lookup', ctx: 'EternalSafety::EternalBlue | 192.168.1.157',
    q: 'Who looked up update-check-cdn[.]net in the last 24 hours?', approve: true },
];

/* Your own chats are kept in localStorage (questions, handoff decisions, background results,
   pin and mode), and the open one comes back after a reload or a switch to another version. */
const STORE_KEY = 'lux-figma-v1-sessions-v1';
function loadSessions() {
  try { const d = JSON.parse(localStorage.getItem(STORE_KEY)); return d && d.v === 1 ? d : null; } catch { return null; }
}
function saveSessions() {
  try {
    const data = { v: 1, saved: {}, sessions: [], lastMode,
      deleted: SAVED.filter(d => !sessions.some(s => s.saved && s.title === d.title)).map(d => d.title),
      active: active ? (active.saved ? { title: active.title } : { uid: active.uid }) : null };
    sessions.forEach(s => {
      if (s.saved) data.saved[s.title] = { pinned: s.pinned, mode: s.mode };
      else if (s.turns?.length) data.sessions.push({ uid: s.uid, title: s.title, ctx: s.ctx, ts: s.ts, pinned: s.pinned, mode: s.mode, turns: s.turns, working: !!s.keepWorking });
    });
    localStorage.setItem(STORE_KEY, JSON.stringify(data));
  } catch { /* storage blocked: the chat still works, it just isn't kept */ }
}
function agoOf(ts) {
  const m = Math.round((Date.now() - (ts || Date.now())) / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}
async function replayTurns(s) {
  const prevCtx = context;
  for (const t of s.turns) {
    context = t.ctx;
    await leaveWelcome();
    thread.append(userMsgEl(t.q, t.att));
    await respond({ text: t.q, att: t.att, ctx: t.ctx, msg: thread.lastElementChild, turn: t });
    const card = thread.querySelector('.handoff');
    if (card && t.approve === true) await approve(card._msg, card, card._topic, { free: true });
    else if (card && t.approve === false) await cancel(card._msg, card, card._topic);
  }
  context = prevCtx;
}
const stored = loadSessions();
if (stored?.lastMode) lastMode = stored.lastMode;

SAVED.forEach(d => {
  if (stored?.deleted?.includes(d.title)) return;
  const meta = stored?.saved?.[d.title];
  const s = createSession({ title: d.title, ctx: d.ctx, ago: '12 min ago', pinned: meta ? meta.pinned : !!d.pinned, saved: true, mode: meta?.mode || d.mode });
  s.build = async () => {
    const prevCtx = context;
    context = d.ctx;
    await leaveWelcome();
    const msg = el('div', 'user-msg');
    if (d.att) msg.append(el('div', 'user-msg__attachment', escapeHtml(d.att)));
    msg.append(el('div', '', escapeHtml(d.q)));
    thread.append(msg);
    await respond({ text: d.q, att: d.att, ctx: d.ctx, msg });
    if (d.approve) {
      const card = thread.querySelector('.handoff');
      if (card) await approve(card._msg, card, card._topic, { free: true });
    }
    context = prevCtx;
  };
  sessions.push(s);
});

(stored?.sessions || []).forEach(d => {
  const s = createSession({ uid: d.uid, title: d.title, ctx: d.ctx, ts: d.ts, ago: agoOf(d.ts), pinned: d.pinned, mode: d.mode || 'shared', turns: d.turns, keepWorking: !!d.working });
  s.build = () => replayTurns(s);
  sessions.push(s);
});

/* ---------- Start: the chat you had open, or a new one ---------- */

const reopen = stored?.active && sessions.find(s => (stored.active.uid && s.uid === stored.active.uid) || (stored.active.title && s.saved && s.title === stored.active.title));
const first = reopen || createSession({ welcomeMode: 'prompts' });
if (!reopen) sessions.push(first);
activate(first);
setTimeout(() => setOpen(true, { float: false }), 400);

/* ---------- Shared API for history.js, profiles.js, pages.js and scenarios ---------- */

const Lux = window.Lux = {
  AGENTS, ASSETS, CREDIT_LIMIT, el, sleep, reduceMotion, usePrompt,
  get credits() { return credits; },
  set credits(v) { credits = v; },
  get busy() { return busy; },
  get active() { return active; },
  get floating() { return floating; },
  sessions, activate, newChat, send, setOpen, setFloating, setContext, syncLauncher, isOpen, setMode, save: () => saveSessions(),
  get context() { return context; },
  forceNext(kind) { forceNext = kind; },
  stop() { if (busy) { busy.stopped = true; busy.byUser = true; } },
  playIntro,
};

/* ---------- Scenarios for the version switcher (states with no natural trigger) ---------- */

// For the switcher: is the open chat still at its welcome?
window.PROTOTYPE_AT_INTRO = () => !active || (!active.started && !active.turns?.length);

// greet: 'none' = straight into the flow (no greeting), 'still' = greeting already in place,
// 'play' = the full typed intro (the Intro scenario)
async function runScenario(fn, { mode = 'hello', greet = 'none' } = {}) {
  stopDraftWorking();
  document.body.dataset.page === 'dashboard' || Lux.goTo?.('dashboard');
  if (!isOpen()) setOpen(true, { float: false });
  Lux.showView?.('chat');
  if (greet === 'play') { await sleep(250); newChat(mode); await sleep(200); return fn(); }
  newChat(mode, { quiet: greet === 'none', typed: false });
  await sleep(greet === 'still' ? 350 : 150);
  fn();
}
const REPORT_REQUEST = 'Write an incident report on the DNS tunneling in dns.log';

/* The private "Draft a note…" chat. Running "Private chat" again used to add another copy to
   History each time; now there is only ever one. In "History with modes" its agent shows as
   still working (spinner + "Agent is working..." in place of the timestamp) until another
   scenario runs. */
const DRAFT_NOTE = 'Draft a note on how I want to handle the EternalBlue detection';
let draftWorking = null;      // the chat marked as working for "History with modes"
{
  // its agent keeps working: the state never ends on its own, and comes back after a reload
  const w = sessions.find(x => x.keepWorking);
  if (w) { draftWorking = w.id; CrossChats.markWorking(w.id, true); }
}
const isDraftNote = s => !s.saved && !s.cross && s.turns?.[0]?.q === DRAFT_NOTE;
function dropDraftNotes(keep) {
  sessions.filter(s => isDraftNote(s) && s !== keep && s !== active).forEach(s => {
    s.node.remove();
    sessions.splice(sessions.indexOf(s), 1);
  });
}
function draftNoteChat() {
  const all = sessions.filter(isDraftNote);
  let s = all.sort((a, b) => (b.ts || 0) - (a.ts || 0))[0];
  if (!s) {
    s = createSession({ title: `${DRAFT_NOTE.slice(0, 32).trimEnd()}…`, mode: 'private', ts: Date.now(), ago: 'Just now',
      turns: [{ q: DRAFT_NOTE, att: null, ctx: null }] });
    s.uid = `u${Date.now().toString(36)}`;
    s.build = () => replayTurns(s);
    sessions.push(s);
  }
  dropDraftNotes(s);
  saveSessions();
  return s;
}
function stopDraftWorking() {
  if (draftWorking) CrossChats.markWorking(draftWorking, false);
  sessions.forEach(x => { x.keepWorking = false; });
  draftWorking = null;
}
window.PROTOTYPE_SCENARIOS = [
  { label: 'Intro', hint: 'How can I help you today?', run: () => runScenario(() => {}, { mode: 'prompts', greet: 'play' }) },
  { label: 'Investigation handoff', hint: 'Approve or cancel', run: () => runScenario(() => send('Provide details about recent activities for IP 192.0.2.44 within the last 14 days')) },
  { label: 'Daily limit reached', hint: '10/10 credits', run: () => runScenario(() => { credits = CREDIT_LIMIT; send('Provide details about recent activities for IP 192.0.2.44 within the last 14 days'); }) },
  { label: 'Unsupported request', hint: 'Coming soon agent', run: () => runScenario(() => send(REPORT_REQUEST)) },
  { label: 'Connection timed out', hint: 'Error', run: () => runScenario(() => { forceNext = 'timeout'; send(REPORT_REQUEST); }) },
  { label: 'Failed to complete request', hint: 'Error', run: () => runScenario(() => { forceNext = 'error'; send(REPORT_REQUEST); }) },
  { label: 'Interrupted response', hint: 'Stop while streaming', run: () => runScenario(async () => {
    send('Tell me about host 192.168.57.5 and help me understand this log', SAMPLE_LOG);
    while (!thread.querySelector('.caret')) await sleep(60);
    await sleep(500);
    Lux.stop();
  }) },
  { label: 'Size M', hint: 'Half', size: true, run: () => sizeScenario('m') },
  { label: 'Size L', hint: 'Full width', size: true, run: () => sizeScenario('l') },
  { label: 'Detection page with context', hint: 'Context chip, popover', run: () => Lux.goTo?.('detection') },
  { label: 'Agent working in chat', hint: 'Bar follows the reply', run: () => runScenario(async () => {
    AgentWork.clearAll();
    send('Provide details about recent activities for IP 192.0.2.44 within the last 14 days');
    let btn = null;
    for (let i = 0; i < 80 && !(btn = [...thread.querySelectorAll('.handoff button, .agent-card button')].find(b => /approve/i.test(b.textContent) && !b.disabled)); i++) await sleep(100);
    await sleep(700);
    btn?.click();
    await sleep(900);
    AgentWork.expand(true);
  }) },
  { label: 'Agents working in background', hint: 'Live cards in the chat', run: () => runScenario(async () => {
    AgentWork.clearAll();
    await send('Investigate EternalBlue on 192.168.1.157 in the background and summarize last night’s detections');
  }) },
  { label: 'Agent needs approval', hint: 'Approve in the chat', run: () => runScenario(async () => {
    AgentWork.clearAll();
    await send('In the background, check if 192.168.1.157 needs to be isolated');
  }) },
  { label: 'Private chat', hint: 'Only you can see it', run: () => runScenario(async () => {
    setVisOpen(true);
    await sleep(1100);
    visMenu.querySelector('[data-mode="private"]').click();
    await sleep(900);
    dropDraftNotes();          // only one Draft note chat in History: this new one
    send(DRAFT_NOTE);
  }, { greet: 'still' }) },
  { label: 'History with modes', hint: 'Search, Private / Shared tags', run: () => runScenario(async () => {
    const s = draftNoteChat();          // exactly one Draft note chat, its agent still at work
    draftWorking = s.id;
    s.keepWorking = true;
    CrossChats.markWorking(s.id, true);
    saveSessions();
    await sleep(150);
    Lux.showView?.('history');
  }) },
  { label: 'Agents Working Across Chats', badge: 'NEW', hint: 'Monitor other chats', run: () => runScenario(() => {
    AgentWork.clearAll();
    sessions.filter(s => s.cross).forEach(s => { s.node.remove(); sessions.splice(sessions.indexOf(s), 1); });
    crossChat();
    CrossChats.expand(false);      // compact bar; the arrow opens the details
    CrossChats.update();
  }, { greet: 'still' }) },
  { label: 'Agents Working Across Multiple Chats', badge: 'NEW', hint: 'Current + another chat', multi: true, run: () => multiScenario() },
];
window.PROTOTYPE_SCENARIOS.forEach(sc => {
  const run = sc.run;
  sc.run = (...args) => { CrossChats.setMode(sc.multi ? 'multi' : 'others'); if (!sc.size) setSize(null); return run(...args); };
});
