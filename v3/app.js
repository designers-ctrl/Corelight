/* Ask Lux v3 — "Your AI security team" (Figma 13874:164881).
   Lux answers first. When a question needs more, it brings in the Investigator Agent or the
   Triage Analyst: they join the chat, work through their steps, post findings and leave.
   "Conversation usage" adds up what each of them spent. Chats are saved in localStorage as a
   list of items; everything on screen is rendered from those items. */

(() => {
const A = 'v3/assets/';
const $ = id => document.getElementById(id);
const stage = $('stage'), chat = $('chat'), feed = $('feed'), chatBody = $('chatBody');
const input = $('input'), composer = $('composer'), sendBtn = $('sendBtn'), micBtn = $('micBtn');
const usageEl = $('usage'), titleEl = $('chatTitle'), menu = $('menu'), plusMenu = $('plusMenu');
const sheet = $('sheet'), extrasEl = $('extras'), moreBtn = $('moreBtn'), plusBtn = $('plusBtn');

const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const uid = () => Math.random().toString(36).slice(2, 10);
const now = () => Date.now();
const timeOf = ts => new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

/* ---------- The team ---------- */

const AGENTS = {
  lux: { name: 'Lux AI', allowance: 600 },
  ia: { name: 'Investigator Agent', letters: 'IA', allowance: 900, tint: 'green', perStep: 100, findings: 131 },
  ta: { name: 'Triage Analyst', letters: 'TA', allowance: 1455, tint: 'yellow', perStep: 30, findings: 40 },
};
const SOON = [
  { key: 'ha', name: 'Hunting Agent', letters: 'HA' },
  { key: 'ra', name: 'Reporting Agent', letters: 'RA' },
];
const LUX_CREDITS = 39;
const BUDGET = 1012;                // 769 credits = 76% of the conversation budget
const DESC = 'Answers questions and explains alerts';
const DEFAULT_IP = '51.181.192.4';

const STEPS = ['Gathering network activity', 'Enriching with threat intelligence', 'Checking for related assets', 'Analyzing potential intent'];
const FINDINGS = [
  'Observed 143 failed SSH login attempts against 2 internal assets in the last 24 hours.',
  'IP is associated with a known scanning infrastructure (OVH, France).',
  'No successful authentications detected.',
  'Similar activity seen targeting other customers (threat intel match: medium confidence).',
];
const DETECTIONS = [
  { sev: 'high', name: 'SSH brute force from {ip}', meta: 'High · bastion-01', min: 12 },
  { sev: 'med', name: 'Port scan on 22/tcp from OVH range', meta: 'Medium · 10.0.4.0/24', min: 22 },
  { sev: 'med', name: 'Repeated auth failures on vpn-gw-02', meta: 'Medium · vpn-gw-02', min: 26 },
];
const QUESTIONS = [
  { title: 'View full investigation', desc: 'Analyze related activity, threat intelligence activity', team: ['lux', 'ta', 'ia'], ask: `View the full investigation for ${DEFAULT_IP}`, plan: ['investigate', 'triage'] },
  { title: 'Analyze IP or domain', desc: 'Related activity, threat intelligence assets related activity', team: ['lux', 'ia'], ask: `Analyze IP ${DEFAULT_IP}`, plan: ['investigate'] },
  { title: 'Full investigation', desc: 'Analyze related activity, and affected assets activity', team: ['lux', 'ta', 'ia'], ask: `Run a full investigation on ${DEFAULT_IP} and its affected assets`, plan: ['investigate', 'triage'] },
];
const CARD_PROMPTS = {
  lux: 'What can my AI security team do?',
  ia: `Investigate ${DEFAULT_IP}`,
  ta: `Is there threat intelligence on ${DEFAULT_IP}? Should we escalate?`,
};

/* ---------- Icons: glyph tiles in L, letter tiles in S (as in Figma) ---------- */

const size = () => stage.dataset.size;
const LUX_IMG = { hero: ['hero-lux.svg', 90.618], card: ['card-lux.svg', 64], who: ['sub-lux.svg', 22], usage: ['u-lux-44.svg', 44], mini: ['mini-lux.svg', 16] };
const LUX_IMG_S = { hero: ['s-hero-lux.svg', 64], card: ['card-lux.svg', 40], who: ['sub-lux.svg', 22], usage: ['u-lux-44.svg', 32], mini: ['mini-lux.svg', 16] };
const GLYPH = { hero: ['hero-', '.svg', 76.4602], card: ['card-', '.svg', 64], who: ['sub-', '.svg', 22], usage: ['u-', '-44.svg', 44] };
const LT_SIZE = { hero: 40, card: 40, who: 22, usage: 32, mini: 16 };

function img(file, px, cls = '') {
  return `<img${cls ? ` class="${cls}"` : ''} src="${A}${file}" width="${px}" height="${px}" alt="">`;
}
function letterTile(key, px) {
  const off = key === 'ha' || key === 'ra';
  const letters = AGENTS[key]?.letters || SOON.find(s => s.key === key).letters;
  const small = px <= 22;
  const star = off ? 'star-off.svg' : small ? `mini-${key}-star.svg` : `star-${key}.svg`;
  return `<span class="lt lt--${off ? 'off' : key}${small ? ` lt--${px}` : ''}" style="--s:${px}px"><span class="lt__t">${letters}</span><img class="lt__star" src="${A}${star}" alt=""></span>`;
}
function icon(key, slot) {
  const s = size() !== 's';   // M and L: the wide layout
  if (key === 'lux') {
    const [f, px] = (s ? LUX_IMG : LUX_IMG_S)[slot];
    return img(f, px, slot === 'mini' ? 'mini-lux' : '');
  }
  if (slot === 'mini') return letterTile(key, 16);
  // Investigator Agent and Triage Analyst: always the green IA / gold TA letter tile, at every size
  if (key === 'ia' || key === 'ta') return letterTile(key, s ? Math.round(GLYPH[slot][2]) : LT_SIZE[slot]);
  if (s) {
    if (key === 'ha') return img('card-ha.svg', 71);
    const [pre, post, px] = GLYPH[slot];
    return img(`${pre}${key}${post}`, px);
  }
  return letterTile(key, LT_SIZE[slot]);
}

const SVG = {
  plus: '<svg width="16" height="16" viewBox="0 0 16 16"><path fill="#F4F4F4" d="M8.5 7.5V3h-1v4.5H3v1h4.5V13h1V8.5H13v-1z"/></svg>',
  clock: '<svg width="16" height="16" viewBox="0 0 16 16"><path fill="#F4F4F4" d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 13A6 6 0 1 1 8 2a6 6 0 0 1 0 12zm.5-9.5h-1V8.7l2.9 2.9.7-.7-2.6-2.6z"/></svg>',
  expand: '<svg width="16" height="16" viewBox="0 0 16 16"><path fill="#F4F4F4" d="M9 2h5v5h-1V3.7L9.4 7.3l-.7-.7L12.3 3H9zM2 9h1v3.3l3.6-3.6.7.7L3.7 13H7v1H2z"/></svg>',
  shrink: '<svg width="16" height="16" viewBox="0 0 16 16"><path fill="#F4F4F4" d="M14 2.7 13.3 2 10 5.3V3H9v4h4V6h-2.3zM2 13.3l.7.7L6 10.7V13h1V9H3v1h2.3z"/></svg>',
  minimize: '<svg width="16" height="16" viewBox="0 0 16 16"><path fill="#F4F4F4" d="M3 11h10v1H3z"/><path fill="#F4F4F4" d="M8 9.2 4.6 5.8l.7-.7L8 7.8l2.7-2.7.7.7z"/></svg>',
  close: '<svg width="16" height="16" viewBox="0 0 16 16"><path fill="#F4F4F4" d="M12 4.7 11.3 4 8 7.3 4.7 4l-.7.7L7.3 8 4 11.3l.7.7L8 8.7l3.3 3.3.7-.7L8.7 8z"/></svg>',
  file: '<svg width="16" height="16" viewBox="0 0 16 16"><path fill="#F4F4F4" d="M9.7 1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V4.3zM9.5 2.4 11.6 4.5H9.5zM12 14H4V2h4.5v3.5H12z"/></svg>',
  check: '<svg width="16" height="16" viewBox="0 0 16 16"><path fill="#33E881" d="M6.5 11.3 3.2 8l-.7.7 4 4 7-7-.7-.7z"/></svg>',
};

/* ---------- Saved chats ---------- */

const KEY = 'lux-v3-chats-v1';
let lastMode = 'shared';     // Private / Shared: new chats start in the mode used last
let store = load() || seed();
lastMode = store.lastMode || 'shared';
let active = null;
let run = null;            // the reply being written: { c, stop, ff, wake }
let thinking = null;       // chat id while "Lux AI is thinking..."
let replyTo = null;        // { who, text } from a message's Reply button
let attachments = [];      // [{ kind: 'detection' | 'file' | 'image', name }]
let userScrolled = false;
const nodes = new Map();

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.v === 1 && Array.isArray(s.chats)) return s;
  } catch { /* storage blocked or empty */ }
  return null;
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* storage blocked */ }
}
function blank(title) {
  return { id: uid(), title: title || '', auto: !title, ts: now(), items: [], watch: false, decision: null, draft: '', mode: lastMode };
}
function seed() {
  const s = { v: 1, chats: [], activeId: null, size: 's', open: true, min: false, usageOpen: false };
  const day = 864e5;
  const old = blank('Failed logins on bastion-01');
  old.auto = false;
  old.mode = 'private';
  const t0 = now() - 2 * day;
  old.items.push({ id: uid(), k: 'user', text: 'Why are there so many failed SSH logins on bastion-01?', at: t0 });
  instantPlan(old, ['investigate'], t0, DEFAULT_IP);
  old.ts = t0 + 4 * 6e4;
  const older = blank('Weekly detection review');
  older.auto = false;
  const t1 = now() - 6 * day;
  older.items.push({ id: uid(), k: 'user', text: 'Which detections can be closed this week?', at: t1 });
  instantPlan(older, ['triage'], t1, DEFAULT_IP);
  older.ts = t1 + 3 * 6e4;
  const fresh = blank();
  s.chats.push(fresh, old, older);
  s.activeId = fresh.id;
  return s;
}

// Finished items for a plan, written at once (seeds, reload in the middle of a reply)
function instantPlan(c, plan, t, ip) {
  for (const step of plan) {
    t += 30000;
    c.items.push({ id: uid(), k: 'lux', kind: step, ip, at: t });
    const a = step === 'investigate' ? 'ia' : step === 'triage' ? 'ta' : null;
    if (a) {
      c.items.push({ id: uid(), k: 'agent', a, at: t, steps: 4, findings: true, leftAt: t + 120000, stopped: false });
      t += 120000;
    }
  }
  return t;
}

// A reply that was cut off by a reload is finished on the spot
function settle(c) {
  c.mode = c.mode === 'private' ? 'private' : 'shared';   // chats saved before modes existed are shared
  for (const it of c.items) {
    if (it.k === 'agent' && !it.leftAt) {
      it.steps = 4; it.findings = true; it.leftAt = it.at + 120000;
    }
  }
  const last = c.items[c.items.length - 1];
  if (last && last.k === 'user') instantPlan(c, route(last.text, last.files), last.at, ipOf(last.text));
}

/* ---------- Usage ---------- */

function creditsOf(c) {
  const r = { lux: 0, ia: 0, ta: 0 };
  for (const it of c.items) {
    if (it.k === 'lux') r.lux += LUX_CREDITS;
    if (it.k === 'agent') r[it.a] += it.steps * AGENTS[it.a].perStep + (it.findings ? AGENTS[it.a].findings : 0);
  }
  return r;
}
function agentsIn(c) {
  const set = new Set(['lux']);
  c.items.forEach(it => { if (it.k === 'agent') set.add(it.a); });
  return [...set];
}

let usageBuiltFor = '';
function buildUsage() {
  const s = size();
  usageBuiltFor = s;
  const bar = '<div class="bar"><div class="bar__fill"><i data-a="lux"></i><i data-a="ia"></i><i data-a="ta"></i></div></div>';
  const lead = s === 'l'
    ? `<div class="usage__lead"><span class="usage__ml">${img('usage-ml.svg', 16)}</span><span class="usage__label">Conversation usage</span></div>
       <div class="usage__meter"><span class="usage__credits" data-credits>0</span><span class="usage__unit">credits used</span>${bar}<span class="usage__pct" data-pct>0%</span></div>`
    : `<div class="usage__s"><span class="usage__ml">${img('usage-ml.svg', 16)}</span><span class="usage__big" data-pct>0%</span>
         <div class="usage__stack"><span class="usage__small">/ <b data-credits>0</b> credits used</span>${bar}</div></div>`;
  usageEl.innerHTML = `
    <div class="usage__row">
      ${lead}
      <button class="usage__agents" type="button" data-usage-toggle>${img('users.svg', 16)}<span data-agents>1 agent</span></button>
      <button class="usage__toggle" type="button" data-usage-toggle aria-label="Usage by agent" aria-expanded="false">${img('chev-down.svg', 16)}</button>
    </div>
    <div class="usage__detail"><div><div class="usage__cols">
      ${['lux', 'ia', 'ta'].map((k, i) => `
        <div class="ucol" style="--i:${i}" data-col="${k}">
          ${icon(k, 'usage')}
          <div class="ucol__text">
            <div class="ucol__line"><span class="ucol__name">${AGENTS[k].name}</span><span class="ucol__pct" data-apct>0%</span></div>
            <div class="ubar"><i style="background:var(--c-${k})"></i></div>
          </div>
        </div>`).join('')}
    </div></div></div>`;
  usageEl.querySelectorAll('[data-usage-toggle]').forEach(b => b.addEventListener('click', () => setUsageOpen(!store.usageOpen)));
  usageEl.dataset.shown = '';
}

function setUsageOpen(open) {
  store.usageOpen = open;
  usageEl.classList.toggle('is-open', open);
  usageEl.querySelector('.usage__toggle')?.setAttribute('aria-expanded', String(open));
  save();
}

function countTo(node, to, suffix = '') {
  const from = Number(node.dataset.v || 0);
  node.dataset.v = to;
  if (from === to) { node.textContent = to + suffix; return; }
  const dur = 600;
  let t0 = null;
  const step = t => {
    if (t0 === null) t0 = t;
    const k = Math.min(1, Math.max(0, (t - t0) / dur));
    const e = 1 - Math.pow(1 - k, 3);
    node.textContent = Math.round(from + (to - from) * e) + suffix;
    if (k < 1 && node.dataset.v == to) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function renderUsage(instant) {
  if (usageBuiltFor !== size()) buildUsage();
  const c = active;
  const cr = creditsOf(c);
  const total = cr.lux + cr.ia + cr.ta;
  const pct = Math.min(100, Math.round(total / BUDGET * 100));
  const credits = usageEl.querySelector('[data-credits]');
  const pctEl = usageEl.querySelector('[data-pct]');
  if (instant) {
    credits.dataset.v = total; credits.textContent = total;
    pctEl.dataset.v = pct; pctEl.textContent = pct + '%';
  } else {
    countTo(credits, total);
    countTo(pctEl, pct, '%');
  }
  const fill = usageEl.querySelector('.bar__fill');
  fill.style.width = `${Math.min(100, total / BUDGET * 100)}%`;
  ['lux', 'ia', 'ta'].forEach(k => {
    fill.querySelector(`[data-a="${k}"]`).style.width = total ? `${cr[k] / total * 100}%` : '0%';
    const ap = Math.min(100, Math.round(cr[k] / AGENTS[k].allowance * 100));
    const col = usageEl.querySelector(`[data-col="${k}"]`);
    col.querySelector('[data-apct]').textContent = ap + '%';
    col.querySelector('.ubar i').style.width = `${ap}%`;
  });
  const n = agentsIn(c).length;
  usageEl.querySelector('[data-agents]').textContent = `${n} agent${n === 1 ? '' : 's'}`;
  usageEl.classList.toggle('is-open', !!store.usageOpen);
  usageEl.querySelector('.usage__toggle').setAttribute('aria-expanded', String(!!store.usageOpen));
  if (instant) usageEl.querySelectorAll('.bar__fill, .bar__fill i, .ubar i').forEach(n => {
    n.style.transition = 'none';
    requestAnimationFrame(() => requestAnimationFrame(() => { n.style.transition = ''; }));
  });
}

/* ---------- Routing: what a question needs ---------- */

const IP_RE = /\b(\d{1,3}(?:\.\d{1,3}){3})\b/;
const ipOf = text => (String(text).match(IP_RE) || [])[1] || DEFAULT_IP;
function route(text, files) {
  const t = String(text).toLowerCase();
  if (/\bbackground\b|while i (work|keep)|keep (working|watching)/.test(t)) return ['background'];
  const triage = /triage|threat intel|intelligence|escalat|close (it|this|the)|criteria|false positive|can be closed/.test(t);
  const inv = IP_RE.test(text) || (files || []).some(f => f.kind === 'detection') ||
    /investigat|what is happening|what's happening|suspicious|domain|\bip\b|host|ssh|login|brute|scan|analy[sz]e/.test(t);
  if (inv && triage) return ['investigate', 'triage'];
  if (triage) return ['triage'];
  if (inv) return ['investigate'];
  return ['general'];
}
function titleFor(text) {
  const t = String(text).toLowerCase();
  if (IP_RE.test(text) || /\bip\b|domain/.test(t)) return 'Suspicious IP activity';
  if (/triage|escalat|close/.test(t)) return 'Detection triage';
  const words = String(text).replace(/\s+/g, ' ').trim().split(' ').slice(0, 6).join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/* ---------- Rendering ---------- */

function words(html) {
  // Split text into words that fade in one after another; tags stay whole
  let k = 0;
  return html.replace(/(<[^>]+>[^<]*<\/[^>]+>)|([^\s<]+)/g, (m, tag) => `<span class="w" style="--k:${k++}">${m}</span>`);
}

function who(key, state, extraCls = '') {
  return `<div class="who ${extraCls}"><span class="who__ico">${icon(key, 'who')}</span><span class="who__name">${AGENTS[key].name}</span><span class="who__state">${state}</span></div>`;
}

const TOOLS = `<div class="tools">
  <button class="tool" type="button" data-tool="copy" aria-label="Copy" title="Copy"><img src="${A}copy.svg" width="16" height="16" alt=""></button>
  <button class="tool" type="button" data-tool="reply" aria-label="Reply" title="Reply"><img src="${A}reply.svg" width="16" height="16" alt=""></button>
  <button class="tool" type="button" data-tool="del" aria-label="Delete" title="Delete"><img src="${A}trash.svg" width="16" height="16" alt=""></button>
</div>`;

function actBtn(act, label, ico, i, extra = '') {
  return `<button class="act" type="button" data-act="${act}" style="--i:${i}"><img src="${A}${ico}" width="16" height="16" alt=""><span class="act__lbl">${label}</span>${extra}</button>`;
}
function watchBtn(tint, i) {
  const on = active?.watch;
  return `<button class="act${on ? ' is-on' : ''}" type="button" data-act="watch" style="--i:${i}" aria-pressed="${!!on}"><img src="${A}act-target-${tint}.svg" width="16" height="16" alt=""><span class="act__lbl">${on ? 'On watchlist' : 'Add to watchlist'}</span></button>`;
}

function luxCopy(it) {
  const ip = esc(it.ip || DEFAULT_IP);
  if (it.kind === 'multi') return {
    title: 'Working on it in the background',
    body: esc(CrossChats.MULTI[it.which].lead),
    acts: [],
  };
  if (it.kind === 'cross') return {
    title: 'Working on it in the background',
    body: esc(CrossChats.DEMO.lead).replace('Investigator Agent', '<b>Investigator Agent</b>'),
    acts: [actBtn('activity', 'Show activity', 'act-detect-white.svg', 0)],
  };
  if (it.kind === 'background') return {
    title: 'Working on it in the background',
    body: it.fast
      ? 'The Triage Analyst is reviewing 4 open detections in the background. It will ask you before closing anything.'
      : 'I started two agents in the background, so you can keep working. Their progress is below and in the bar above the input. Anything that needs your approval will wait for you.',
    acts: [actBtn('activity', 'Show activity', 'act-detect-white.svg', 0)],
  };
  if (it.kind === 'investigate') return {
    title: 'This looks like an investigation',
    body: `The <b>Investigator Agent</b> can run a deeper analysis on <span class="ip">${ip}</span>, including related activity indicators and potential impact.`,
    acts: [actBtn('investigation', 'View full investigation', 'act-target-white.svg', 0), watchBtn('white', 1), actBtn('related', 'Related detections', 'act-detect-white.svg', 2)],
  };
  if (it.kind === 'triage') return {
    title: 'Ready for triage',
    body: `The Triage Analyst can review <span class="ip ip--b">${ip}</span> against configured criteria and check for related activity before deciding whether the detection should be closed or escalated.`,
    acts: [actBtn('criteria', 'View triage criteria', 'act-target-white.svg', 0), actBtn('related', 'Related detections', 'act-detect-white.svg', 1)],
  };
  return {
    title: 'Here’s how your team can help',
    body: 'I answer questions and explain alerts. When a question needs a deeper look, I bring in the <b>Investigator Agent</b> or the <b>Triage Analyst</b>. Ask about an IP, a host or a detection to get started.',
    acts: [actBtn(`ask:${CARD_PROMPTS.ia}`, `Investigate ${DEFAULT_IP}`, 'act-target-white.svg', 0), actBtn(`ask:${CARD_PROMPTS.ta}`, 'Triage this detection', 'act-detect-white.svg', 1)],
  };
}

function renderUser(it) {
  const n = el('div', 'u-msg');
  const files = (it.files || []).map(f => `<span class="chip">${chipLabel(f)}</span>`).join('');
  n.innerHTML = `<div class="u-msg__bubble">
    ${it.reply ? `<button class="u-msg__quote" type="button" data-jump="${esc(it.reply.id || '')}" title="Show the original message"><span class="u-msg__quote-who">${esc(it.reply.who)}</span><span class="u-msg__quote-text">${esc(it.reply.text)}</span></button>` : ''}
    ${files ? `<div class="u-msg__files">${files}</div>` : ''}
    <p class="u-msg__text">${esc(it.text)}</p>
    <span class="u-msg__time">${timeOf(it.at)}</span>
  </div>`;
  return n;
}

function renderLux(it, live) {
  const c = luxCopy(it);
  const n = el('div', 'block');
  n.innerHTML = `${who('lux', `responded ${timeOf(it.at)}`)}
    <div class="card">
      <p class="card__title">${c.title}</p>
      <p class="card__body">${live ? words(c.body) : c.body}</p>
      <div class="acts">${c.acts.join('')}</div>
      ${TOOLS}
    </div>`;
  if (it.kind === 'background') n.querySelector('.acts').before(bgCards(it));
  if (it.kind === 'cross') n.querySelector('.acts').before(crossCards(it));
  if (it.kind === 'multi') n.querySelector('.acts').before(CrossChats.multiCards(it.which, multiAgent, multiJobs.get(it.chat) || [], it.bg || []));
  return n;
}

/* Background work in a Lux reply: live cards for running agents (same jobs as the activity bar),
   finished ones show how they ended; a job that was still running when the page closed restarts. */
const bgLive = new Map();     // item id → running job ids (not saved: job ids don't survive a reload)
function bgCards(it) {
  const work = backgroundWork({ fast: it.fast });
  const specs = it.fast ? [work.triage] : [work.inv, work.triage];
  const ids = bgLive.get(it.id) || [];
  const box = el('div', 'aw-cards');
  specs.forEach((spec, k) => {
    const saved = it.bg?.[k];
    if (saved && saved.status !== 'working') { box.append(AgentWork.staticCard(spec, saved)); return; }
    if (!ids[k] || !AgentWork.status(ids[k])) {
      const c = active;
      ids[k] = AgentWork.start(Object.assign({}, spec, { onEnd: end => { (it.bg ||= [])[k] = end; if (c) c.ts = c.ts || now(); save(); } }));
    }
    box.append(AgentWork.card(ids[k]));
  });
  bgLive.set(it.id, ids);
  return box;
}

function renderAgent(it) {
  const tint = AGENTS[it.a].tint;
  const n = el('div', 'block');
  n.innerHTML = `${who(it.a, `joined ${timeOf(it.at)}`)}
    <div class="run run--${it.a}">
      <div class="card">
        <div class="steps"></div>
        <div class="run__sep"></div>
        <div class="findings"><div>
          <p class="findings__title">Initial findings</p>
          <ul>${FINDINGS.map((f, i) => `<li style="--i:${i}">${f}</li>`).join('')}</ul>
        </div></div>
        <div class="acts">
          ${actBtn('investigation', 'View full investigation', `act-target-${tint}.svg`, 0)}
          ${actBtn('related', 'Related detections', `act-detect-${tint}.svg`, 1, ' <span class="act__n">3</span>')}
          ${watchBtn(tint, 2)}
        </div>
        ${TOOLS}
      </div>
    </div>`;
  syncAgentNode(n, it);
  return n;
}

function stepRow(i, state, tint) {
  const ico = state === 'done' ? `check-${tint}.svg` : 'in-progress.svg';
  const label = { done: 'Completed', now: 'In progress', stopped: 'Stopped' }[state];
  return `<div class="step is-${state}" data-step="${i}"><span class="step__ico"><img src="${A}${ico}" width="16" height="16" alt=""></span><span class="step__name">${STEPS[i]}</span><span class="step__state">${label}</span></div>`;
}

function syncAgentNode(n, it) {
  const tint = AGENTS[it.a].tint;
  const live = !it.leftAt;
  n.querySelector('.run').classList.toggle('is-live', live);
  const box = n.querySelector('.steps');
  const shown = it.stopped ? Math.min(it.steps + 1, 4) : live ? Math.min(it.steps + 1, 4) : 4;
  for (let i = 0; i < shown; i++) {
    const state = i < it.steps ? 'done' : it.stopped ? 'stopped' : 'now';
    const row = box.querySelector(`[data-step="${i}"]`);
    if (!row) box.insertAdjacentHTML('beforeend', stepRow(i, state, tint));
    else if (!row.classList.contains(`is-${state}`)) row.outerHTML = stepRow(i, state, tint);
  }
  const fin = n.querySelector('.findings');
  fin.classList.toggle('is-in', !!it.findings);
  fin.hidden = !it.findings && !live;
}

function renderLeft(it) {
  return el('div', '', who(it.a, `${it.stopped ? 'stopped' : 'left'} ${timeOf(it.leftAt)}`, 'who--left')).firstElementChild;
}

function renderNote(it) {
  return el('div', 'note', `${esc(it.text)} · ${timeOf(it.at)}`);
}

const TITLE = 'Your AI security team';
const SUBTITLE = 'Ask Lux a question and it can bring in the right specialist when needed';
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

function renderIntro(animate) {
  const s = size() !== 's';   // M and L: the wide layout
  const play = animate && !reduceMotion.matches;
  const n = el('section', `intro ${play ? 'is-playing is-paused' : 'is-static is-live'}`);
  // Rings draw round from different start angles, inner first
  const ring = (f, px, cls, rd, from) => `<img${cls ? ` class="${cls}"` : ''} src="${A}${f}" width="${px}" height="${px}" alt="" style="--rd:${rd}ms;--from:${from}deg">`;
  const rings = s
    ? ring('hero-ring-600.svg', 600, 'ring-spin', 420, 270) + ring('hero-ring-242.png', 242, '', 300, 180) + ring('hero-ring-180.svg', 180, 'ring-spin ring-spin--rev', 200, 0)
    : ring('s-ring-600.svg', 600, 'ring-spin', 460, 270) + ring('s-ring-314.png', 314, '', 360, 180) + ring('s-ring-160.png', 160, '', 260, 90) + ring('s-ring-120.svg', 120, 'ring-spin ring-spin--rev', 180, 0);
  const card = (k, i) => `<button class="agent-card" type="button" data-agent="${k}" style="--i:${i}" title="${AGENTS[k].name}: ${DESC}">
      ${icon(k, 'card')}
      <span class="agent-card__text"><span class="agent-card__name">${AGENTS[k].name}</span><span class="agent-card__desc">${DESC}</span></span>
    </button>`;
  const soon = (x, i) => `<div class="agent-card agent-card--soon" data-soon="${x.key}" style="--i:${i}" role="button" tabindex="0" aria-disabled="true">
      ${icon(x.key, 'card')}
      <span class="agent-card__text"><span class="agent-card__name">${x.name}</span><span class="agent-card__desc">Coming ${s ? 'soon' : 'Soon'}</span></span>
    </div>`;
  const q = (x, i) => `<button class="q-card" type="button" data-q="${i}" style="--i:${i}">
      <span class="q-card__ico"><img src="${A}q-icon.svg" width="16" height="16" alt=""></span>
      <span class="q-card__text">
        <span class="q-card__top"><span class="q-card__title">${x.title}</span><span class="q-card__team">${x.team.map(k => icon(k, 'mini')).join('')}</span></span>
        <span class="q-card__desc">${x.desc}</span>
      </span>
    </button>`;
  const sub = SUBTITLE.split(' ').map((w, k) => `<span class="wd" style="--k:${k}">${w}</span>`).join(' ');
  n.innerHTML = `
    <div class="hero">
      <span class="hero__glow"></span>
      <span class="hero__vline hero__vline--top"></span>
      <div class="hero__row">
        <span class="hero__tile hero__tile--ia">${icon('ia', 'hero')}</span>
        <span class="hero__hline hero__hline--l"><i class="spark"></i></span>
        <span class="hero__lux"><span class="hero__rings">${rings}</span><span class="hero__ripple"></span>${icon('lux', 'hero')}</span>
        <span class="hero__hline hero__hline--r"><i class="spark"></i></span>
        <span class="hero__tile hero__tile--ta">${icon('ta', 'hero')}</span>
      </div>
      <span class="hero__vline hero__vline--bottom"></span>
    </div>
    <div class="intro__head">
      <div class="type"><h3 class="intro__title">Your <span class="grad">AI security team</span></h3><span class="type__caret" aria-hidden="true"></span></div>
      <p class="intro__sub">${sub}</p>
    </div>
    <div class="teams">
      <div class="team">${['lux', 'ia', 'ta'].map(card).join('')}</div>
      <div class="team team--soon">${SOON.map((x, i) => soon(x, 3 + i)).join('')}</div>
    </div>
    <p class="intro__label">Suggested questions</p>
    <div class="suggest">${QUESTIONS.map(q).join('')}</div>`;
  if (play) playIntro(n);
  return n;
}

/* Intro motion: the illustration builds first (Lux focuses in, rings draw round, the signal
   reaches the two agents), then the headline types out and the rest of the page follows.
   CSS runs the illustration on fixed delays; JS types the title and tells CSS when it ends. */
const TYPE_AT = 1250;
function typingPlan(text) {
  // Uneven, human rhythm, but the same on every run
  let seed = 11;
  return [...text].map(ch => {
    seed = (seed * 9301 + 49297) % 233280;
    return ch === ' ' ? 120 : 30 + (seed / 233280) * 30;
  });
}
function charEdges(h) {
  const base = h.getBoundingClientRect().left;
  const out = [];
  const walk = document.createTreeWalker(h, NodeFilter.SHOW_TEXT);
  const r = document.createRange();
  let t;
  while ((t = walk.nextNode())) {
    for (let j = 0; j < t.length; j++) {
      r.setStart(t, j); r.setEnd(t, j + 1);
      out.push(r.getBoundingClientRect().right - base);
    }
  }
  return out;
}
// Starts once the page has loaded (fonts and tiles ready), so the first visit sees all of it
function whenReady(fn) {
  const go = () => document.fonts.ready.then(() => setTimeout(fn, 120));
  if (document.readyState === 'complete') go();
  else addEventListener('load', go, { once: true });
}
function playIntro(n) {
  const rate = window.__introRate || 1;          // test hook: slow motion for frame captures
  const at = ms => ms / rate;
  const plan = typingPlan(TITLE);
  const typing = plan.slice(1).reduce((a, b) => a + b, 0);
  n.style.setProperty('--after', TYPE_AT + typing + 140);
  const box = n.querySelector('.type');
  const h = n.querySelector('.intro__title');
  const done = () => {
    if (!n.isConnected) return;
    n.classList.add('is-typed');
    setTimeout(() => n.isConnected && n.classList.add('is-live'), at(1600));
  };
  whenReady(() => {
    if (!n.isConnected) return;
    n.classList.remove('is-paused');
    if (rate !== 1) requestAnimationFrame(() => n.getAnimations({ subtree: true }).forEach(a => { a.playbackRate = rate; }));
    setTimeout(() => type(), at(TYPE_AT));
  });
  const type = () => {
    if (!n.isConnected) return;
    const edges = charEdges(h);
    if (!edges.length || edges[edges.length - 1] <= 0) return done();
    let i = 0;
    const tick = () => {
      if (!n.isConnected) return;
      box.style.setProperty('--tx', `${edges[i] + 3}px`);
      box.style.setProperty('--cx', `${edges[i] + 3}px`);
      i += 1;
      if (i < edges.length) setTimeout(tick, at(plan[i]));
      else {
        // let the soft edge clear the last letter before the mask goes away
        setTimeout(() => box.style.setProperty('--tx', `${edges[edges.length - 1] + 16}px`), at(60));
        setTimeout(done, at(200));
      }
    };
    n.classList.add('is-typing');
    tick();
  };
}

let renderSeq = 0, pendingScroll = null;   // 'top' | 'bottom' | ratio, applied after layout
function renderChat({ animateIntro = false, keepScroll = false } = {}) {
  const span = chatBody.scrollHeight - chatBody.clientHeight;
  const intent = keepScroll
    ? (pendingScroll ?? (chatBody.scrollTop >= span - 4 && active.items.length ? 'bottom' : chatBody.scrollTop / Math.max(1, span)))
    : (active.items.length ? 'bottom' : 'top');
  pendingScroll = intent;
  const seq = ++renderSeq;
  nodes.clear();
  feed.classList.add('no-anim');
  feed.replaceChildren(...(active.quiet ? [] : [renderIntro(animateIntro)]));   // quiet: a scenario that starts straight in the flow
  if (animateIntro) feed.classList.remove('no-anim');
  let turn = null;
  for (const it of active.items) {
    if (it.k === 'user' || !turn) { turn = el('div', 'turn'); feed.append(turn); }
    place(turn, it, false);
  }
  if (thinking === active.id) showThinking(active, true);
  titleEl.textContent = active.title || 'New chat';
  renderUsage(true);
  syncTurnMin();
  requestAnimationFrame(() => {
    if (seq !== renderSeq) return;
    const max = chatBody.scrollHeight - chatBody.clientHeight;
    chatBody.scrollTop = intent === 'bottom' ? max : intent === 'top' ? 0 : intent * max;
    pinTop = chatBody.scrollTop;
    pendingScroll = null;
    requestAnimationFrame(() => feed.classList.remove('no-anim'));
  });
}

function place(turn, it, live) {
  let n;
  if (it.k === 'user') n = renderUser(it);
  else if (it.k === 'lux') n = renderLux(it, live);
  else if (it.k === 'agent') n = renderAgent(it);
  else n = renderNote(it);
  n.dataset.id = it.id;
  turn.append(n);
  nodes.set(it.id, n);
  if (it.k === 'agent' && it.leftAt) {
    const l = renderLeft(it);
    l.dataset.leftOf = it.id;
    turn.append(l);
  }
  return n;
}

function lastTurn() { return [...feed.querySelectorAll('.turn')].pop(); }

function syncTurnMin() {
  feed.style.setProperty('--turn-min', `${Math.max(0, chatBody.clientHeight - 32)}px`);
}
new ResizeObserver(syncTurnMin).observe(chatBody);

// Keep the newest line in view while a reply is written, unless the reader scrolled away
let pinTop = 0;   // where the latest question sits at the top of the view
function follow() {
  if (userScrolled) return;
  const t = lastTurn();
  const last = t?.lastElementChild;
  if (!last) return;
  const bottom = last.offsetTop + last.offsetHeight + 16;
  const need = bottom - chatBody.clientHeight;
  if (need > pinTop + 2 && need > chatBody.scrollTop + 2) chatBody.scrollTo({ top: need, behavior: 'smooth' });
}
['wheel', 'touchmove'].forEach(ev => chatBody.addEventListener(ev, () => { if (run) userScrolled = true; }, { passive: true }));
chatBody.addEventListener('keydown', e => { if (['ArrowUp', 'PageUp', 'Home'].includes(e.key)) userScrolled = true; });

/* ---------- Items ---------- */

function addItem(c, it) {
  it.id = uid();
  c.items.push(it);
  c.ts = now();
  if (c === active) {
    let t = lastTurn();
    if (it.k === 'user' || !t) { t = el('div', 'turn'); feed.append(t); }
    place(t, it, true);
    renderUsage();
  }
  save();
  CrossChats.update();
  return it;
}

function syncItem(c, it) {
  save();
  if (c !== active) return;
  const n = nodes.get(it.id);
  if (it.k === 'agent' && n) {
    syncAgentNode(n, it);
    if (it.leftAt && !feed.querySelector(`[data-left-of="${it.id}"]`)) {
      const l = renderLeft(it);
      l.dataset.leftOf = it.id;
      n.after(l);
    }
  }
  renderUsage();
  follow();
}

function showThinking(c, quiet) {
  thinking = c.id;
  if (c !== active) return;
  hideThinkingNode();
  const t = lastTurn() || feed;
  const n = el('div', '', who('lux', 'is thinking...')).firstElementChild;
  n.querySelector('.who__state').classList.add('is-thinking');
  n.id = 'thinking';
  t.append(n);
  if (!quiet) follow();
}
function hideThinkingNode() { document.getElementById('thinking')?.remove(); }
function hideThinking() { thinking = null; hideThinkingNode(); }

/* ---------- Replies ---------- */

function wait(R, ms) {
  if (R.ff || R.stop) return Promise.resolve();
  return new Promise(res => {
    const t = setTimeout(res, ms);
    R.wake = () => { clearTimeout(t); res(); };
  });
}

/* ---------- Agent activity bar (shared agent-work.js) ----------
   Above the input: mirrors Lux and the agents while they work on a reply (the same steps as
   the cards in the chat), plus background work started by a scenario. Same in every version. */

AgentWork.mount({ before: $('composerWrap') });
const WORK_ICON = { lux: `${A}sub-lux.svg`, ia: letterTile('ia', 20), ta: letterTile('ta', 20) };

/* ---------- Agents working across chats (shared cross-chats.js) ----------
   The Investigator Agent keeps working in another chat. A new chat shows it in the panel above
   the input (same in every version); Open chat goes there, where its live card sits in Lux's reply. */

const KEEP_WORKING = { hold: true, dots: true };   // a demo agent that never finishes: three dots in its card
const crossJobs = new Map();     // chat id → running job id (not saved: job ids don't survive a reload)
const crossAgent = () => ({ key: 'ia', name: AGENTS.ia.name, icon: WORK_ICON.ia });
function crossCards(it) {
  const box = el('div', 'aw-cards');
  box.append(CrossChats.demoCard(crossJobs.get(it.chat), crossAgent(), it.bg?.[0]));
  return box;
}
function crossChat() {
  const D = CrossChats.DEMO;
  const t = now() - 2 * 6e4;
  const c = blank(D.title);
  c.context = D.context;
  c.demo = true;
  c.mode = 'shared';
  const lux = { id: uid(), k: 'lux', kind: 'cross', at: t + 4000, chat: c.id };
  c.items.push({ id: uid(), k: 'user', text: D.ask, at: t }, lux);
  c.ts = now() - 6e4;
  crossJobs.set(c.id, CrossChats.startDemo(c.id, crossAgent(), end => { lux.bg = [end]; save(); }, KEEP_WORKING));
  store.chats.splice(1, 0, c);   // right after the new chat that's open
  return c;
}

/* Agents working across multiple chats: two agents in the chat that's open (Investigator Agent,
   Triage Analyst) and two in another one (Investigator Agent, Lux AI). The shared panel lists both
   chats, the open one first with a CURRENT badge. */
const multiJobs = new Map();     // chat id → running job ids
const multiAgent = (role, which) => (role === 'investigator' ? crossAgent()
  : which === 'current' ? { key: 'ta', name: AGENTS.ta.name, icon: WORK_ICON.ta }
  : { key: 'lux', name: AGENTS.lux.name, icon: WORK_ICON.lux });
function multiChat(which) {
  const D = CrossChats.MULTI[which];
  const t = now() - 3 * 6e4;
  const c = blank(D.title);
  c.context = D.context;
  c.demo = true;
  c.mode = 'shared';
  const lux = { id: uid(), k: 'lux', kind: 'multi', which, at: t + 4000, chat: c.id };
  c.items.push({ id: uid(), k: 'user', text: D.ask, at: t }, lux);
  c.ts = now() - 6e4;
  multiJobs.set(c.id, CrossChats.startMulti(c.id, which, multiAgent, (k, end) => { (lux.bg ||= [])[k] = end; save(); },
    m => (m.role === 'assistant' ? KEEP_WORKING : {})));   // the assistants keep working; the others still ask / finish
  store.chats.unshift(c);
  return c;
}
CrossChats.mount({
  before: document.querySelector('.aw'),
  current: () => ({ id: active?.id, intro: !!active && !active.items.length }),
  info: id => { const c = store.chats.find(x => x.id === id); return c ? { title: c.title, context: c.context } : null; },
  open: id => {
    const c = store.chats.find(x => x.id === id);
    if (!c) return;
    if (store.min) setMin(false);
    if (c !== active) activate(c);
    else chatBody.scrollTo({ top: chatBody.scrollHeight, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
  },
});
const clipText = (t, n = 44) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
const LUX_NEXT = { investigate: 'Bringing in the Investigator Agent', triage: 'Bringing in the Triage Analyst', general: 'Writing the answer', background: 'Starting agents in the background' };

async function respond(c, text, plan) {
  const R = run = { c, stop: false, ff: false, wake: null };
  userScrolled = false;
  setBusy(true);
  const ip = ipOf(text);
  let luxJob = null;
  try {
    for (const step of plan) {
      if (R.stop) break;
      luxJob = R.ff ? null : AgentWork.start({
        agent: { name: AGENTS.lux.name, icon: WORK_ICON.lux }, task: `Answering “${clipText(text)}”`,
        steps: [{ label: 'Reading your question', ms: 1300 }, { label: LUX_NEXT[step], ms: 1100 }], auto: false,
      });
      showThinking(c);
      await wait(R, 1300);
      if (R.stop) break;
      hideThinking();
      addItem(c, step === 'background'
        ? { k: 'lux', kind: step, ip, at: now(), fast: /approv|close|triage|review/i.test(text) && !/investigat/i.test(text) }
        : { k: 'lux', kind: step, ip, at: now() });
      if (luxJob) AgentWork.step(luxJob, 1);
      follow();
      await wait(R, 1100);
      if (luxJob) { AgentWork.finish(luxJob); luxJob = null; }
      if (step === 'investigate') await agentRun(R, 'ia', ip);
      if (step === 'triage') await agentRun(R, 'ta', ip);
    }
  } finally {
    if (luxJob) AgentWork.stop(luxJob);
    if (thinking === c.id) hideThinking();
    if (run === R) { run = null; setBusy(false); }
    save();
  }
}

async function agentRun(R, a, ip = DEFAULT_IP) {
  if (R.stop) return;
  const c = R.c;
  const it = addItem(c, { k: 'agent', a, at: now(), steps: 0, findings: false, leftAt: null, stopped: false });
  const job = R.ff ? null : AgentWork.start({
    agent: { name: AGENTS[a].name, icon: WORK_ICON[a] }, task: a === 'ia' ? `Investigating ${ip}` : `Triaging ${ip}`,
    steps: STEPS.map((label, i) => ({ label, ms: [1200, 1100, 1100, 2200][i] })), auto: false,
  });
  follow();
  const beats = [1200, 1100, 1100];
  for (let i = 0; i < 3; i++) {
    await wait(R, beats[i]);
    if (R.stop) { if (job) AgentWork.stop(job); return stopAgent(c, it); }
    it.steps = i + 1;
    if (i === 2) it.findings = true;
    if (job) AgentWork.step(job, i + 1);
    syncItem(c, it);
  }
  await wait(R, 2200);
  if (R.stop) { if (job) AgentWork.stop(job); return stopAgent(c, it); }
  it.steps = 4;
  syncItem(c, it);
  if (job) AgentWork.finish(job, { summary: `${FINDINGS.length} findings`, findings: FINDINGS.slice(0, 3) });
  await wait(R, 900);
  it.leftAt = now();
  syncItem(c, it);
  await wait(R, 500);
}

// Background work for the scenarios: the Investigator looks at another IP, the Triage Analyst ends on an approval
function backgroundWork({ fast = false } = {}) {
  const t = ms => (fast ? Math.round(ms / 4) : ms);
  const inv = {
    agent: { name: AGENTS.ia.name, icon: WORK_ICON.ia }, task: 'Investigating 203.0.113.24', where: 'background',
    steps: STEPS.map((label, i) => ({ label, ms: t([2400, 2600, 2300, 2100][i]) })),
    result: { summary: '3 findings · low risk', findings: ['Port scan from a cloud range, 2 hosts touched', 'No successful connections', 'Not seen in threat intel feeds'] },
  };
  const triage = {
    agent: { name: AGENTS.ta.name, icon: WORK_ICON.ta }, task: 'Reviewing 4 open detections', where: 'background',
    steps: [{ label: 'Checking configured criteria', ms: t(2400) }, { label: 'Looking for related activity', ms: t(2600) }, { label: 'Deciding close or escalate', ms: t(2200) }],
    approval: {
      question: '3 of 4 detections meet your closing criteria: scanning only, no successful logins. Close them?', short: 'Close 3 detections?',
      yes: 'Close 3', no: 'Not now', yesDone: 'Closed 3 detections, 1 left open', noDone: 'Left open for review',
      findings: ['3 detections closed as scanning activity', '1 escalated: new host contacted', 'Watchlist updated'],
    },
  };
  return { inv, triage };
}

function stopAgent(c, it) {
  it.stopped = true;
  it.leftAt = now();
  syncItem(c, it);
}

function setBusy(on) {
  sendBtn.classList.toggle('is-stop', on);
  sendBtn.setAttribute('aria-label', on ? 'Stop' : 'Send');
  syncSend();
}
function syncSend() {
  sendBtn.disabled = !run && !input.value.trim() && !attachments.length;
}

function stopReply() {
  if (!run) return;
  run.stop = true;
  run.wake?.();
  hideThinking();
  flash('Stopped');
}

// Switching chats: the reply in the old chat finishes at once, in the background
function fastForward() {
  if (!run) return;
  run.ff = true;
  run.wake?.();
}

/* ---------- Sending ---------- */

function send(text, plan) {
  text = String(text || '').trim();
  if (!text && attachments.length) text = attachments.some(a => a.kind === 'detection') ? `What is happening with ${DEFAULT_IP}?` : 'What can you tell me about this file?';
  if (!text) return;
  if (run) { flash('Lux is still answering. Stop it or wait a moment.'); return; }
  if (stage.classList.contains('is-min')) setMin(false);
  closeAll();
  const c = active;
  const files = attachments.slice();
  const item = { k: 'user', text, at: now() };
  if (files.length) item.files = files;
  if (replyTo) { item.reply = replyTo; clearReplyMark(); }
  if (c.auto && !c.items.length) { c.title = titleFor(text); titleEl.textContent = c.title; }
  addItem(c, item);
  input.value = '';
  c.draft = '';
  attachments = [];
  replyTo = null;
  renderExtras();
  autosize();
  syncSend();
  // New question at the top, the answer grows below it
  const t = lastTurn();
  syncTurnMin();
  pinTop = Math.max(0, t.offsetTop - 16);
  requestAnimationFrame(() => chatBody.scrollTo({ top: pinTop, behavior: 'smooth' }));
  respond(c, text, plan || route(text, files));
}

composer.addEventListener('submit', e => {
  e.preventDefault();
  if (run) { stopReply(); return; }
  send(input.value);
});
input.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    if (run) { flash('Lux is still answering. Stop it or wait a moment.'); return; }
    send(input.value);
  }
  if (e.key === 'Escape') closeAll();
});
input.addEventListener('input', () => {
  autosize();
  syncSend();
  active.draft = input.value;
  clearTimeout(input._t);
  input._t = setTimeout(save, 300);
});
function autosize() {
  if (stage.classList.contains('is-min')) { input.style.height = ''; return; }
  input.style.height = 'auto';
  input.style.height = `${Math.min(168, Math.max(28, input.scrollHeight))}px`;
}
// The minimized bar opens the chat again when clicked
composer.addEventListener('pointerdown', e => {
  if (!stage.classList.contains('is-min') || e.target.closest('#micBtn, #imageBtn')) return;
  e.preventDefault();
  setMin(false);
  requestAnimationFrame(() => input.focus());
});

/* Context chips above the input: replying to, detection, files */
function chipLabel(f) {
  if (f.kind === 'detection') return `<span>Detection: <b>${esc(f.name)}</b></span>`;
  if (f.kind === 'image') return `${img('image-search.svg', 14)}<span>${esc(f.name)}</span>`;
  return `${SVG.file.replace('width="16" height="16"', 'width="14" height="14"')}<span>${esc(f.name)}</span>`;
}
function renderExtras() {
  extrasEl.replaceChildren();
  if (replyTo) {
    const ch = el('span', 'chip chip--quote', `<img src="${A}reply.svg" width="14" height="14" alt="" style="opacity:.8"><span>Replying to <b>${esc(replyTo.who)}</b> · ${esc(replyTo.text)}</span><button type="button" aria-label="Cancel reply">×</button>`);
    ch.querySelector('button').addEventListener('click', () => { clearReplyMark(); replyTo = null; renderExtras(); input.focus(); });
    extrasEl.append(ch);
  }
  attachments.forEach((f, i) => {
    const ch = el('span', 'chip', `${chipLabel(f)}<button type="button" aria-label="Remove">×</button>`);
    ch.querySelector('button').addEventListener('click', () => { attachments.splice(i, 1); renderExtras(); syncSend(); input.focus(); });
    extrasEl.append(ch);
  });
  extrasEl.hidden = !extrasEl.children.length;
}

/* + menu: detection context, file, image */
plusBtn.addEventListener('click', e => {
  e.stopPropagation();
  if (!plusMenu.hidden) return closeAll();
  closeAll();
  setVisOpen(false);
  plusMenu.innerHTML = `
    ${menuItem('detection', `<img src="${A}act-detect-white.svg" alt="">`, 'Add this detection')}
    ${menuItem('file', SVG.file, 'Upload a log file…')}
    ${menuItem('image', `<img src="${A}image-search.svg" alt="">`, 'Search with an image…')}`;
  plusMenu.hidden = false;
  plusBtn.setAttribute('aria-expanded', 'true');
});
plusMenu.addEventListener('click', e => {
  const b = e.target.closest('[data-m]');
  if (!b) return;
  closeAll();
  if (b.dataset.m === 'detection') addAttachment({ kind: 'detection', name: `SSH brute force from ${DEFAULT_IP}` });
  if (b.dataset.m === 'file') $('fileInput').click();
  if (b.dataset.m === 'image') $('imageInput').click();
});
$('imageBtn').addEventListener('click', () => $('imageInput').click());
$('fileInput').addEventListener('change', e => { const f = e.target.files[0]; if (f) addAttachment({ kind: 'file', name: f.name }); e.target.value = ''; });
$('imageInput').addEventListener('change', e => { const f = e.target.files[0]; if (f) addAttachment({ kind: 'image', name: f.name }); e.target.value = ''; });
function addAttachment(a) {
  if (attachments.some(x => x.kind === a.kind && x.name === a.name)) return;
  attachments.push(a);
  renderExtras();
  syncSend();
  input.focus();
}

/* Voice input: writes what was "heard" into the box */
let rec = null;
micBtn.addEventListener('click', () => (rec ? stopRec() : startRec()));
function startRec() {
  const said = active.items.some(it => it.k === 'agent' && it.a === 'ia')
    ? 'Do we have threat intelligence on related infrastructure?'
    : `What is happening with ${DEFAULT_IP}?`;
  rec = { i: 0 };
  micBtn.classList.add('is-rec');
  micBtn.setAttribute('aria-pressed', 'true');
  micBtn.setAttribute('aria-label', 'Stop voice input');
  const base = input.value ? input.value.replace(/\s*$/, ' ') : '';
  rec.timer = setInterval(() => {
    rec.i += 1;
    input.value = base + said.slice(0, rec.i);
    autosize(); syncSend();
    if (rec.i >= said.length) stopRec();
  }, 38);
  input.focus();
}
function stopRec() {
  if (!rec) return;
  clearInterval(rec.timer);
  rec = null;
  micBtn.classList.remove('is-rec');
  micBtn.setAttribute('aria-pressed', 'false');
  micBtn.setAttribute('aria-label', 'Voice input');
  active.draft = input.value;
  save();
}

/* ---------- Clicks in the conversation ---------- */

feed.addEventListener('click', e => {
  const agentCard = e.target.closest('[data-agent]');
  if (agentCard) return prefill(CARD_PROMPTS[agentCard.dataset.agent]);
  const soon = e.target.closest('[data-soon]');
  if (soon) return flash(`${SOON.find(s => s.key === soon.dataset.soon).name} is coming soon`);
  const q = e.target.closest('[data-q]');
  if (q) { const x = QUESTIONS[q.dataset.q]; return send(x.ask, x.plan); }
  const act = e.target.closest('[data-act]');
  if (act) return onAct(act);
  const tool = e.target.closest('[data-tool]');
  if (tool) return onTool(tool);
});
feed.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-soon]')) { e.preventDefault(); e.target.click(); }
});

function prefill(text) {
  input.value = text;
  autosize(); syncSend();
  input.focus();
  input.setSelectionRange(text.length, text.length);
  composer.animate([{ boxShadow: '0 0 0 3px rgba(51,232,129,.35)' }, { boxShadow: '0 0 0 3px rgba(51,232,129,0)' }], { duration: 700 });
}

const itemOf = node => active.items.find(it => it.id === node.closest('[data-id]')?.dataset.id);

function onAct(b) {
  const a = b.dataset.act;
  if (a.startsWith('ask:')) return send(a.slice(4));
  if (a === 'watch') return toggleWatch();
  if (a === 'related') return openRelated(b);
  if (a === 'investigation') return openInvestigation(itemOf(b));
  if (a === 'criteria') return openCriteria(itemOf(b));
  if (a === 'activity') return AgentWork.expand(true);
}

function toggleWatch() {
  active.watch = !active.watch;
  save();
  feed.querySelectorAll('[data-act="watch"]').forEach(b => {
    b.classList.toggle('is-on', active.watch);
    b.setAttribute('aria-pressed', String(active.watch));
    b.querySelector('.act__lbl').textContent = active.watch ? 'On watchlist' : 'Add to watchlist';
    b.animate([{ transform: 'scale(0.94)' }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.34,1.4,.64,1)' });
  });
  flash(active.watch ? `${DEFAULT_IP} added to watchlist` : `${DEFAULT_IP} removed from watchlist`);
}

function textOf(it) {
  if (it.k === 'lux') {
    const c = luxCopy(it);
    return `${c.title}\n${el('div', '', c.body).textContent}`;
  }
  if (it.k === 'agent') {
    return `${AGENTS[it.a].name}\n${STEPS.map((s, i) => `${s}: ${i < it.steps ? 'Completed' : 'In progress'}`).join('\n')}${it.findings ? `\n\nInitial findings\n${FINDINGS.map(f => `• ${f}`).join('\n')}` : ''}`;
  }
  return it.text || '';
}

function copyText(text) {
  const fallback = () => {
    const ta = el('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
    document.body.append(ta);
    ta.select();
    try { document.execCommand('copy'); } catch { /* nothing else to try */ }
    ta.remove();
  };
  try { navigator.clipboard.writeText(text).catch(fallback); } catch { fallback(); }
}

function clearReplyMark() { feed.querySelectorAll('.is-replying').forEach(n => n.classList.remove('is-replying')); }
// The quote in a sent message: scroll to the original and light it up
function jumpTo(id) {
  const n = nodes.get(id);
  if (!n) return flash('That message was deleted');
  userScrolled = true;
  n.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const target = n.querySelector('.card') || n;
  target.classList.remove('is-found'); void target.offsetWidth; target.classList.add('is-found');
}
feed.addEventListener('click', e => {
  const q = e.target.closest('[data-jump]');
  if (q && q.dataset.jump) jumpTo(q.dataset.jump);
});
input.addEventListener('keydown', e => {
  if (e.key === 'Escape' && replyTo) { e.stopPropagation(); clearReplyMark(); replyTo = null; renderExtras(); }
});

function onTool(b) {
  const it = itemOf(b);
  if (!it) return;
  const t = b.dataset.tool;
  if (t === 'copy') {
    copyText(textOf(it));
    const imgEl = b.querySelector('img');
    const was = imgEl.src;
    b.innerHTML = SVG.check;
    setTimeout(() => { b.innerHTML = `<img src="${was}" width="16" height="16" alt="">`; }, 1200);
    flash('Copied');
  }
  if (t === 'reply') {
    clearReplyMark();
    replyTo = { id: it.id, who: it.k === 'lux' ? 'Lux AI' : AGENTS[it.a].name, text: it.k === 'lux' ? luxCopy(it).title : (it.findings ? 'Initial findings' : STEPS[Math.min(it.steps, 3)]) };
    nodes.get(it.id)?.classList.add('is-replying');
    renderExtras();
    if (stage.classList.contains('is-min')) setMin(false);
    input.focus();
  }
  if (t === 'del') {
    if (run && run.c === active) return flash('Wait until the reply is finished');
    const i = active.items.indexOf(it);
    active.items.splice(i, 1);
    save();
    const n = nodes.get(it.id);
    const left = feed.querySelector(`[data-left-of="${it.id}"]`);
    [n, left].forEach(x => x && x.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateY(-4px)' }], { duration: 180 }).finished.then(() => x.remove()));
    nodes.delete(it.id);
    renderUsage();
    const c = active;
    flash('Message deleted', 'Undo', () => {
      c.items.splice(Math.min(i, c.items.length), 0, it);
      save();
      if (c === active) renderChat({ keepScroll: true });
    });
  }
}

/* ---------- Related detections (popup) ---------- */

function openRelated(btn) {
  const wasOpen = !menu.hidden && menu._for === btn;
  closeAll();
  if (wasOpen) return;
  menu._for = btn;
  btn.setAttribute('aria-expanded', 'true');
  menu.classList.add('popup--wide');
  menu.innerHTML = `<p class="popup__head">Related detections</p>` + DETECTIONS.map((d, i) => `
    <button class="popup__item popup__item--two" type="button" data-det="${i}">
      <span class="sev sev--${d.sev}"></span>
      <span class="popup__two"><b>${esc(d.name.replace('{ip}', DEFAULT_IP))}</b><small>${d.meta} · ${timeOf(now() - d.min * 6e4)}</small></span>
    </button>`).join('');
  menu.querySelectorAll('[data-det]').forEach(b => b.addEventListener('click', () => {
    const d = DETECTIONS[b.dataset.det];
    closeAll();
    flash(`Opening “${d.name.replace('{ip}', DEFAULT_IP)}”`);
  }));
  placeMenu(btn, 'below-left');
}

/* ---------- Sheets: full investigation, triage criteria ---------- */

function latestAgent(a) { return [...active.items].reverse().find(it => it.k === 'agent' && it.a === a); }

function openSheet(title, sub, body) {
  closeAll();
  sheet.classList.remove('is-out');
  sheet.innerHTML = `
    <div class="sheet__head">
      <div class="sheet__title"><b>${title}</b><small>${sub}</small></div>
      <button class="sheet__close" type="button" aria-label="Close">${SVG.close}</button>
    </div>
    <div class="sheet__body">${body}</div>`;
  sheet.querySelectorAll('.sheet__body > *').forEach((n, i) => n.style.setProperty('--i', i));
  sheet.hidden = false;
  sheet.querySelector('.sheet__close').addEventListener('click', closeSheet);
  sheet.querySelector('.sheet__close').focus();
}
function closeSheet() {
  if (sheet.hidden) return;
  sheet.classList.add('is-out');
  setTimeout(() => { sheet.hidden = true; sheet.classList.remove('is-out'); }, 200);
}

function openInvestigation() {
  const it = latestAgent('ia') || latestAgent('ta');
  const ip = DEFAULT_IP;
  const steps = it
    ? STEPS.map((s, i) => `<div class="row"><span class="tick ${i < it.steps ? 'tick--yes' : 'tick--no'}">${i < it.steps ? '✓' : '…'}</span><span class="row__main"><b>${s}</b></span><span class="row__time">${i < it.steps ? 'Completed' : it.stopped ? 'Stopped' : 'In progress'}</span></div>`).join('')
    : '';
  const done = it?.findings;
  openSheet(`Investigation · ${ip}`, it ? `${AGENTS[it.a].name} · ${it.leftAt ? `finished ${timeOf(it.leftAt)}` : 'in progress'}` : 'Waiting for the Investigator Agent', `
    <div class="kpis">
      <div class="kpi"><b>143</b><small>Failed SSH logins (24h)</small></div>
      <div class="kpi"><b>2</b><small>Internal assets targeted</small></div>
      <div class="kpi"><b>0</b><small>Successful logins</small></div>
      <div class="kpi"><b>Medium</b><small>Threat intel confidence</small></div>
    </div>
    ${it ? `<div class="sec"><p class="sec__title">Steps</p><div class="rows">${steps}</div></div>` : ''}
    <div class="sec"><p class="sec__title">Initial findings</p>
      ${done ? `<div class="rows">${FINDINGS.map(f => `<div class="row"><span class="row__main">${f}</span></div>`).join('')}</div>` : '<p class="sheet__empty">Findings show up here as soon as the agent posts them.</p>'}
    </div>
    <div class="sec"><p class="sec__title">Affected assets</p><div class="rows">
      <div class="row"><span class="row__main"><b>bastion-01</b><small>10.0.4.12 · Linux jump host</small></span><span class="row__time">97 attempts</span></div>
      <div class="row"><span class="row__main"><b>vpn-gw-02</b><small>10.0.1.5 · VPN gateway</small></span><span class="row__time">46 attempts</span></div>
    </div></div>
    <div class="sec"><p class="sec__title">Timeline</p><div class="rows">
      <div class="row"><span class="row__time">${timeOf(now() - 26 * 6e4)}</span><span class="row__main">First failed SSH login from ${ip}</span></div>
      <div class="row"><span class="row__time">${timeOf(now() - 22 * 6e4)}</span><span class="row__main">Port scan on 22/tcp across 10.0.4.0/24</span></div>
      <div class="row"><span class="row__time">${timeOf(now() - 12 * 6e4)}</span><span class="row__main">Detection raised: SSH brute force (High)</span></div>
      ${it ? `<div class="row"><span class="row__time">${timeOf(it.at)}</span><span class="row__main">${AGENTS[it.a].name} joined the chat</span></div>` : ''}
    </div></div>
    <div class="verdict__btns"><button class="btn" type="button" data-sheet="watch">${active.watch ? 'On watchlist ✓' : 'Add to watchlist'}</button></div>`);
  sheet.querySelector('[data-sheet="watch"]').addEventListener('click', e => {
    toggleWatch();
    e.currentTarget.textContent = active.watch ? 'On watchlist ✓' : 'Add to watchlist';
  });
}

function openCriteria() {
  const it = latestAgent('ta');
  const ready = it && it.findings;
  const crit = [
    ['Source is known scanning infrastructure', true],
    ['No successful authentication', true],
    ['Activity limited to SSH (22/tcp)', true],
    ['Threat intel confidence is high', false],
  ];
  const decided = active.decision;
  openSheet(`Triage criteria · ${DEFAULT_IP}`, it ? `Triage Analyst · ${it.leftAt ? `finished ${timeOf(it.leftAt)}` : 'reviewing now'}` : 'Waiting for the Triage Analyst', `
    <div class="sec"><p class="sec__title">Configured criteria</p><div class="rows">
      ${crit.map(([t, ok]) => `<div class="row"><span class="tick ${ready ? (ok ? 'tick--yes' : 'tick--no') : 'tick--no'}">${ready ? (ok ? '✓' : '✕') : '…'}</span><span class="row__main"><b>${t}</b></span><span class="row__time">${ready ? (ok ? 'Met' : 'Not met') : 'Checking'}</span></div>`).join('')}
    </div></div>
    <div class="verdict">
      <p>${ready ? 'Recommendation: <b>close as scanning activity</b> and keep the IP on the watchlist. Threat intel is only medium confidence, so escalate if new activity shows up.' : 'The recommendation appears when the Triage Analyst finishes its review.'}</p>
      <div class="verdict__btns">
        <button class="btn btn--primary" type="button" data-decide="closed"${!ready || decided ? ' disabled' : ''}>${decided === 'closed' ? 'Closed ✓' : 'Close detection'}</button>
        <button class="btn" type="button" data-decide="escalated"${!ready || decided ? ' disabled' : ''}>${decided === 'escalated' ? 'Escalated ✓' : 'Escalate'}</button>
      </div>
    </div>`);
  sheet.querySelectorAll('[data-decide]').forEach(b => b.addEventListener('click', () => {
    active.decision = b.dataset.decide;
    const text = b.dataset.decide === 'closed' ? 'Detection closed by you' : 'Detection escalated to Tier 2';
    closeSheet();
    addItem(active, { k: 'note', text, at: now() });
    follow();
    flash(text);
  }));
}

/* ---------- Header: rename, ⋮ menu ---------- */

function startRename() {
  if (titleEl.isContentEditable) return;
  const before = active.title;
  titleEl.contentEditable = 'true';
  titleEl.focus();
  document.getSelection().selectAllChildren(titleEl);
  const finish = keep => {
    titleEl.contentEditable = 'false';
    titleEl.removeEventListener('keydown', onKey);
    titleEl.removeEventListener('blur', onBlur);
    const name = titleEl.textContent.trim();
    if (keep && name && name !== before) { active.title = name; active.auto = false; save(); flash('Chat renamed'); }
    titleEl.textContent = active.title || 'New chat';
  };
  const onKey = e => {
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  };
  const onBlur = () => finish(true);
  titleEl.addEventListener('keydown', onKey);
  titleEl.addEventListener('blur', onBlur);
}
titleEl.addEventListener('click', startRename);
$('renameBtn').addEventListener('click', e => { e.stopPropagation(); startRename(); });

function menuItem(m, ico, label, extra = '', cls = '') {
  return `<button class="popup__item ${cls}" type="button" role="menuitem" data-m="${m}">${ico ? `<span class="popup__swatch">${ico}</span>` : ''}<span>${label}</span>${extra}</button>`;
}

moreBtn.addEventListener('click', e => {
  e.stopPropagation();
  if (!menu.hidden && menu._for === moreBtn) return closeAll();
  closeAll();
  mainMenu();
});

function mainMenu() {
  menu._for = moreBtn;
  moreBtn.setAttribute('aria-expanded', 'true');
  menu.classList.remove('popup--wide');
  const l = size() === 'l';
  menu.innerHTML = `
    ${menuItem('new', SVG.plus, 'New chat')}
    ${menuItem('recent', SVG.clock, 'Recent chats', `<i class="menu-spin" role="status" aria-label="An agent is working in a recent chat" title="An agent is working in a recent chat"></i><em>›</em>`, 'popup__item--recent')}
    ${menuItem('rename', `<img src="${A}pencil.svg" alt="">`, 'Rename')}
    <div class="popup__sep"></div>
    ${menuItem('size', l ? SVG.shrink : SVG.expand, l ? 'Shrink to S' : 'Expand to L')}
    ${menuItem('min', SVG.minimize, 'Minimize to input')}
    ${menuItem('close', SVG.close, 'Close chat')}
    <div class="popup__sep"></div>
    ${menuItem('delete', `<img src="${A}trash.svg" alt="">`, 'Delete chat', '', 'popup__item--danger')}`;
  placeMenu(moreBtn, 'below-right');
}

// The spinner next to "Recent chats" is a fixed demo state: an agent is always at work in a recent chat

// Demo: this chat always sits second in Recent chats with an agent at work ("Working" + spinner)
const ALWAYS_WORKING = 'Failed logins on bastion-01';
function recentMenu() {
  const all = store.chats.filter(c => c.items.length || c === active).sort((a, b) => b.ts - a.ts);
  const pinned = all.find(c => c.title === ALWAYS_WORKING && c !== active);
  const list = all.filter(c => c !== pinned).slice(0, pinned ? 7 : 8);
  if (pinned) list.splice(Math.min(1, list.length), 0, pinned);
  menu.innerHTML = `
    ${menuItem('back', '', '‹ Recent chats', '', 'popup__back')}
    <div class="popup__sep"></div>
    ${list.map(c => {
      const working = c === pinned;
      const n = c.items.filter(i => i.k === 'user').length;
      return `<button class="popup__item popup__item--two${working ? ' is-working' : ''}" type="button" data-chat="${c.id}">
        <span class="popup__swatch">${c === active ? SVG.check : ''}</span>
        <span class="popup__two"><b>${esc(c.title || 'New chat')}</b><small><span class="ms popup__mode${c.mode === 'private' ? ' is-private' : ''}" aria-label="${c.mode === 'private' ? 'Private' : 'Shared'}" role="img">${c.mode === 'private' ? 'lock' : 'lock_open_right'}</span>${working ? '<span class="popup__working">Working</span>' : `${n} question${n === 1 ? '' : 's'} · ${rel(c.ts)}`}</small></span>
        ${working ? '<i class="menu-spin" role="status" aria-label="An agent is working in this chat" title="An agent is working in this chat"></i>'
          : window.CrossChats ? CrossChats.live(c.id, { label: false }) : ''}
      </button>`;
    }).join('')}
    <div class="popup__sep"></div>
    ${menuItem('new', SVG.plus, 'New chat')}`;
  menu.querySelectorAll('[data-chat]').forEach(b => b.addEventListener('click', () => {
    closeAll();
    const c = store.chats.find(x => x.id === b.dataset.chat);
    if (c && c !== active) activate(c, true);
  }));
}

menu.addEventListener('click', e => {
  const b = e.target.closest('[data-m]');
  if (!b) return;
  e.stopPropagation();
  const m = b.dataset.m;
  if (m === 'recent') return recentMenu();
  if (m === 'back') return mainMenu();
  closeAll();
  if (m === 'new') newChat();
  if (m === 'rename') startRename();
  if (m === 'size') setSize(size() === 'l' ? 's' : 'l');
  if (m === 'min') setMin(true);
  if (m === 'close') setOpen(false);
  if (m === 'delete') deleteChat(active);
});

function placeMenu(btn, where) {
  menu.hidden = false;
  const cr = chat.getBoundingClientRect();
  const br = btn.getBoundingClientRect();
  const h = menu.offsetHeight, w = menu.offsetWidth;
  let top = br.bottom - cr.top + 6;
  if (top + h > cr.height - 8) top = Math.max(8, br.top - cr.top - h - 6);
  menu.style.top = `${top}px`;
  if (where === 'below-right') {
    menu.style.left = 'auto';
    menu.style.right = `${Math.max(8, cr.right - br.right)}px`;
    menu.style.transformOrigin = 'top right';
  } else {
    menu.style.right = 'auto';
    menu.style.left = `${Math.min(cr.width - w - 8, Math.max(8, br.left - cr.left))}px`;
    menu.style.transformOrigin = 'top left';
  }
}

function closeAll() {
  menu.hidden = true;
  plusMenu.hidden = true;
  menu._for?.setAttribute('aria-expanded', 'false');
  menu._for = null;
  plusBtn.setAttribute('aria-expanded', 'false');
}

document.addEventListener('click', e => {
  const path = e.composedPath();
  const inside = sel => path.some(n => n instanceof Element && n.matches(sel));
  if (!inside('#menu, #moreBtn, #plusMenu, #plusBtn, [data-act="related"]')) closeAll();
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (!menu.hidden || !plusMenu.hidden) return closeAll();
  if (!sheet.hidden) return closeSheet();
});

const MIN = 6e4, HOUR = 60 * MIN, DAY = 24 * HOUR;
function rel(ts) {
  const d = now() - ts;
  if (d < MIN) return 'just now';
  if (d < HOUR) return `${Math.round(d / MIN)} min ago`;
  if (d < DAY) return `${Math.round(d / HOUR)} h ago`;
  const n = Math.round(d / DAY);
  return `${n} day${n === 1 ? '' : 's'} ago`;
}

/* ---------- Chats ---------- */

function activate(c, animate) {
  if (run && run.c !== c) fastForward();
  stopRec();
  closeSheet();
  closeAll();
  active = c;
  store.activeId = c.id;
  replyTo = null;
  attachments = [];
  renderExtras();
  input.value = c.draft || '';
  autosize();
  syncSend();
  AgentWork.setScope(c.id);     // the bar shows this chat's agents; other chats are in the panel
  renderChat({ animateIntro: animate && !c.items.length });
  syncMode();
  save();
  CrossChats.update();
}

/* ---------- Private / Shared ----------
   The lock after "+": each chat remembers who can see it, new chats start in the mode used
   last, and a change shows a notice at the top with Undo. Same as LUX AI chat v1 and v2. */

const vis = $('vis');
const visBtn = $('visBtn');
const visMenu = $('visMenu');
const modeNoteSlot = $('modeNoteSlot');
const MODE_COPY = {
  private: { icon: 'lock', label: 'Private', placeholder: 'Ask anything. Only you will see this chat',
    title: 'Now private', long: 'Only you can see this chat, and Lux won’t learn from it.', short: 'Only you can see it' },
  shared: { icon: 'lock_open_right', label: 'Shared', placeholder: 'Ask anything',
    title: 'Now shared', long: 'Your team can see this chat, and Lux learns from it.', short: 'Your team can see it' },
};

function syncMode() {
  const mode = active?.mode === 'private' ? 'private' : 'shared';
  vis.classList.toggle('is-private', mode === 'private');
  visBtn.querySelector('.ms').textContent = MODE_COPY[mode].icon;
  visBtn.setAttribute('aria-label', `Who can see this chat: ${MODE_COPY[mode].label}`);
  visMenu.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.mode === mode)));
  input.placeholder = MODE_COPY[mode].placeholder;
}

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
    <img class="mode-note__glow" src="v1/assets/toast-glow.svg" width="184" height="184" alt="">
    <span class="ms mode-note__icon" aria-hidden="true">${c.icon}</span>
    <span class="mode-note__text"><span class="mode-note__title mode-note__title--long">${c.title}</span><span class="mode-note__title mode-note__title--short">${c.label}</span><span class="mode-note__desc mode-note__desc--long">${c.long}</span><span class="mode-note__desc mode-note__desc--short">${c.short}</span></span>
    <button class="mode-note__undo" type="button">Undo</button>
    <button class="mode-note__close" type="button" aria-label="Dismiss"><img src="v1/assets/toast-close.svg" width="16" height="16" alt=""></button>`);
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
  const c = active;
  const apply = m => {
    c.mode = m;
    lastMode = store.lastMode = m;
    save();
    if (c === active) syncMode();
  };
  apply(mode);
  visBtn.classList.remove('is-pop'); void visBtn.offsetWidth; visBtn.classList.add('is-pop');
  if (!silent) showModeNote(mode, () => apply(before));
}

let visTimer = 0;
function setVisOpen(open, { focus = false } = {}) {
  clearTimeout(visTimer);
  if (open === !visMenu.hidden) return;
  if (open) closeAll();
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
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setVisOpen(false); visBtn.focus(); }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus(); }
});
document.addEventListener('click', e => {
  if (!visMenu.hidden && !e.target.closest('.vis')) setVisOpen(false);
});

function newChat() {
  if (!active.items.length) {
    flash('This chat is already new');
    input.focus();
    return;
  }
  const c = blank();
  store.chats.unshift(c);
  activate(c, true);
  input.focus();
}

function deleteChat(c) {
  if (run && run.c === c) { run.stop = true; run.wake?.(); }
  const i = store.chats.indexOf(c);
  store.chats.splice(i, 1);
  const next = store.chats.filter(x => x.items.length).sort((a, b) => b.ts - a.ts)[0] || store.chats[0];
  activate(next || (store.chats.unshift(blank()), store.chats[0]), true);
  flash('Chat deleted', 'Undo', () => {
    store.chats.splice(Math.min(i, store.chats.length), 0, c);
    activate(c);
  });
}

/* ---------- Size, open, minimized ---------- */

function setSize(s) {
  if (s === size() && chat.dataset.size === s) return;
  stage.dataset.size = s;
  chat.dataset.size = s;
  store.size = s;
  save();
  closeAll();
  usageBuiltFor = '';
  renderChat({ keepScroll: true });
}
function setOpen(open) {
  stage.classList.toggle('is-closed', !open);
  $('luxBtn').setAttribute('aria-pressed', String(open));
  store.open = open;
  if (open && store.min) setMin(false);
  save();
}
function setMin(min) {
  stage.classList.toggle('is-min', min);
  store.min = min;
  closeAll();
  closeSheet();
  autosize();
  save();
  if (!min) requestAnimationFrame(() => { syncTurnMin(); follow(); });
}
$('luxBtn').addEventListener('click', () => {
  if (store.min) { setMin(false); setOpen(true); return; }
  setOpen(stage.classList.contains('is-closed'));
  if (store.open) input.focus();
});
input.addEventListener('keydown', e => {
  if (e.key === 'ArrowUp' && stage.classList.contains('is-min') && !input.value) setMin(false);
});

// Drag the left edge: snaps to S, M (half) or L
(() => {
  const handle = $('chatResize');
  let startX = 0, startW = 0, max = 0;
  handle.addEventListener('pointerdown', e => {
    if (stage.classList.contains('is-min')) return;
    handle.setPointerCapture(e.pointerId);
    startX = e.clientX;
    startW = chat.getBoundingClientRect().width;
    max = stage.getBoundingClientRect().width - 48;
    chat.classList.add('is-dragging');
  });
  handle.addEventListener('pointermove', e => {
    if (!chat.classList.contains('is-dragging')) return;
    const w = Math.min(max, Math.max(400, startW + (startX - e.clientX)));
    chat.style.width = `${w}px`;
  });
  const end = () => {
    if (!chat.classList.contains('is-dragging')) return;
    const w = chat.getBoundingClientRect().width;
    chat.classList.remove('is-dragging');
    chat.style.width = '';
    const half = (max - 16) / 2 + 8;
    setSize(w < (440 + half) / 2 ? 's' : w > (half + max) / 2 ? 'l' : 'm');
  };
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
})();

/* ---------- Toast ---------- */

function flash(text, action, onAction) {
  document.querySelectorAll('.flash').forEach(n => n.remove());
  const f = el('div', 'flash', `<span>${esc(text)}</span>`);
  if (action) {
    const b = el('button', '', esc(action));
    b.type = 'button';
    b.addEventListener('click', () => { f.remove(); onAction(); });
    f.append(b);
  }
  chat.append(f);
  setTimeout(() => f.isConnected && f.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200 }).finished.then(() => f.remove()), action ? 4200 : 1800);
}

/* ---------- Start ---------- */

store.chats.forEach(settle);
stage.dataset.size = chat.dataset.size = store.size = 's';   // always opens in S; M and L only when picked
if (!store.open) stage.classList.add('is-closed');
if (store.min) stage.classList.add('is-min');
$('luxBtn').setAttribute('aria-pressed', String(!!store.open));
activate(store.chats.find(c => c.id === store.activeId) || store.chats[0] || (store.chats.push(blank()), store.chats[0]), true);

/* ---------- Shared API + scenarios for the version switcher ---------- */

window.PROTOTYPE_AT_INTRO = () => !active || !active.items.length;

const Lux = window.Lux = {
  get store() { return store; }, get active() { return active; }, get busy() { return !!run; },
  send, newChat, activate, setSize, setOpen, setMin, setUsageOpen, flash, save, setMode, AGENTS,
};

async function typeChars(text, speed = 34) {
  input.focus();
  for (const ch of text) {
    input.value += ch;
    autosize(); syncSend();
    await sleep(speed);
  }
  active.draft = input.value;
}

// greet: 'play' = the full intro (Intro scenario), 'still' = intro already in place (scenarios
// that type or click a suggestion), 'none' = straight into the flow, no intro to flash and vanish
function fresh({ greet = 'still' } = {}) {
  fastForward();
  run = null;
  setBusy(false);
  closeAll();
  closeSheet();
  if (!store.open) setOpen(true);
  if (store.min) setMin(false);
  store.chats = store.chats.filter(x => x.items.length);   // empty chats aren't kept
  const c = blank();
  if (greet === 'none') c.quiet = true;
  store.chats.unshift(c);
  activate(c, greet === 'play');
  return c;
}

// A finished first turn, written at once, ending a few minutes ago
function finishedTurn(c, text, plan, minsAgo) {
  const t = now() - minsAgo * 6e4;
  c.items.push({ id: uid(), k: 'user', text, at: t });
  c.title = titleFor(text);
  c.auto = false;
  const end = instantPlan(c, plan, t, ipOf(text));
  c.ts = end;
  // 10:24 → 10:26 → 10:27 → 10:28 rhythm from the Figma frames
  c.items.forEach(it => { if (it.k === 'agent') it.leftAt = it.at + 2 * 6e4; });
}

const IP_Q = `what is happening with ${DEFAULT_IP}`;
const TI_Q = 'Do we have threat intelligence on related infrastructure?';

function fullConversation(minsAgo = 6) {
  const c = fresh();
  finishedTurn(c, IP_Q, ['investigate'], minsAgo);
  const t = now() - (minsAgo - 3) * 6e4;
  c.items.push({ id: uid(), k: 'user', text: TI_Q, at: t });
  instantPlan(c, ['triage'], t, DEFAULT_IP);
  c.items.forEach(it => { if (it.k === 'agent') it.leftAt = it.at + 1 * 6e4; });
  c.ts = now();
  save();
  activate(c);
  return c;
}

window.PROTOTYPE_SCENARIOS = [
  { label: 'Intro', hint: 'Your AI security team', run: () => { fresh({ greet: 'play' }); } },
  { label: 'Ask about an IP', hint: 'Lux, then Investigator', run: async () => {
    fresh();
    await sleep(500);
    await typeChars(IP_Q, 30);
    await sleep(250);
    send(input.value);
  } },
  { label: 'Suggested question', hint: 'Lux, Investigator, Triage', run: async () => {
    fresh();
    await sleep(700);
    feed.querySelector('[data-q="0"]').click();
  } },
  { label: 'Follow-up to triage', hint: 'Triage Analyst joins', run: async () => {
    const c = fresh();
    finishedTurn(c, IP_Q, ['investigate'], 4);
    save();
    activate(c);
    await sleep(500);
    await typeChars(TI_Q, 26);
    await sleep(250);
    send(input.value);
  } },
  { label: 'Full conversation', hint: 'Both agents left', run: () => { fullConversation(); } },
  { label: 'Usage by agent', hint: 'Credits per agent', run: () => { fullConversation(); setUsageOpen(true); } },
  { label: 'Full investigation', hint: 'Opens the details', run: async () => { fullConversation(); await sleep(400); openInvestigation(); } },
  { label: 'Triage criteria', hint: 'Close or escalate', run: async () => { fullConversation(); await sleep(400); openCriteria(); } },
  { label: 'Related detections', hint: '3 detections', run: async () => {
    fullConversation();
    await sleep(400);
    const b = [...feed.querySelectorAll('[data-act="related"]')].pop();
    b.scrollIntoView({ block: 'center' });
    await sleep(250);
    openRelated(b);
  } },
  { label: 'Size M', hint: 'Half the content area', size: true, run: () => { fullConversation(); setSize('m'); } },
  { label: 'Size L', hint: 'Whole content area', size: true, run: () => { fullConversation(); setSize('l'); } },
  { label: 'Size S', hint: 'Default, 440px', run: () => { setSize('s'); if (store.min) setMin(false); if (!store.open) setOpen(true); } },
  { label: 'Minimized to input', hint: 'Figma Variant2', run: () => { if (!store.open) setOpen(true); setMin(true); } },
  { label: 'Chat menu', hint: 'New, recent, rename…', run: async () => { if (store.min) setMin(false); if (!store.open) setOpen(true); await sleep(150); closeAll(); mainMenu(); } },
  { label: 'Reply to a message', hint: 'Quote, then answer', run: async () => {
    fullConversation(5);
    await sleep(700);
    const card = [...feed.querySelectorAll('.block')].find(b => b.querySelector('[data-act="criteria"]'));
    card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(500);
    card?.querySelector('[data-tool="reply"]')?.click();
    await sleep(900);
    await typeChars('What would make you escalate instead of closing?', 24);
    await sleep(300);
    send(input.value);
  } },
  { label: 'Agent working in chat', hint: 'Bar follows the reply', run: async () => {
    AgentWork.clearAll();
    fresh();
    await sleep(500);
    await typeChars(IP_Q, 22);
    await sleep(200);
    send(input.value);
    await sleep(3200);
    AgentWork.expand(true);
  } },
  { label: 'Agents working in background', hint: 'Live cards in the chat', run: async () => {
    AgentWork.clearAll();
    fresh({ greet: 'none' });
    await sleep(200);
    send('Investigate 203.0.113.24 in the background and review the open detections');
  } },
  { label: 'Agent needs approval', hint: 'Approve in chat or bar', run: async () => {
    AgentWork.clearAll();
    fresh({ greet: 'none' });
    await sleep(200);
    send('In the background, review the open detections and ask me before closing any');
  } },
  { label: 'Private chat', hint: 'Only you can see it', run: async () => {
    fresh();
    await sleep(600);
    setVisOpen(true);
    await sleep(1100);
    visMenu.querySelector('[data-mode="private"]').click();
    await sleep(900);
    await typeChars(IP_Q, 26);
    await sleep(250);
    send(input.value);
  } },
  { label: 'Recent chats with modes', hint: 'Lock icon per chat', run: async () => {
    if (store.min) setMin(false);
    if (!store.open) setOpen(true);
    await sleep(150);
    closeAll();
    mainMenu();
    recentMenu();
  } },
  { label: 'Reset saved chats', hint: 'Back to the start', run: () => {
    fastForward();
    run = null;
    setBusy(false);
    try { localStorage.removeItem(KEY); } catch { /* storage blocked */ }
    lastMode = 'shared';
    store = seed();
    stage.classList.remove('is-closed', 'is-min');
    setSize('s');
    activate(store.chats[0], true);
    flash('Saved chats cleared');
  } },
  { label: 'Agents Working Across Chats', badge: 'NEW', hint: 'Monitor other chats', run: async () => {
    AgentWork.clearAll();
    crossJobs.clear();
    store.chats = store.chats.filter(x => !x.demo);
    fresh();
    crossChat();
    CrossChats.expand(false);      // compact bar; the arrow opens the details
    save();
    CrossChats.update();
  } },
  { label: 'Agents Working Across Multiple Chats', badge: 'NEW', hint: 'Current + another chat', multi: true, run: async () => {
    AgentWork.clearAll();
    crossJobs.clear();
    multiJobs.clear();
    store.chats = store.chats.filter(x => !x.demo);
    fresh({ greet: 'none' });
    store.chats = store.chats.filter(x => x.items.length);   // the blank chat isn't kept
    multiChat('other');
    const c = multiChat('current');
    CrossChats.expand(false);       // collapsed: "Agents working in 2 chats"
    activate(c);
    save();
    CrossChats.update();
  } },
];
window.PROTOTYPE_SCENARIOS.forEach(sc => {
  const run = sc.run;
  // every scenario starts the chat in S; only the Size M / L scenarios change it
  sc.run = (...args) => { CrossChats.setMode(sc.multi ? 'multi' : 'others'); if (!sc.size) setSize('s'); return run(...args); };
});
})();
