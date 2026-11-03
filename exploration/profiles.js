/* Agent profiles (v1 section 04), redesigned in this version's style: what an agent does,
   its usage ring (the same ring as the "Bring in an agent" card) and questions to try as
   prompt cards. Opens when hovering, focusing or clicking an agent name. */

(() => {
  const { AGENTS, CREDIT_LIMIT } = Lux;
  const card = document.getElementById('profileCard');

  const PROFILES = {
    lux: {
      desc: 'Answers questions about Corelight, Zeek and your logs, explains detections, and brings in specialist agents when a question needs them.',
      credits: false,
      asks: [
        ['icons/code-mark.svg', 'New to Zeek', 'Help me understand this log', 'log'],
        ['icons/loop-mark.svg', 'New to network incident response', 'How do I investigate lateral movement?'],
      ],
    },
    investigation: {
      desc: 'Generates LogScale queries, investigates network alerts, correlates telemetry, explains evidence, and recommends response actions.',
      credits: true,
      asks: [
        ['icons/search-mark.svg', 'Investigating an IP or host', 'How many external IPs has [IP] connected to over the last 24 hours?'],
        ['icons/person-search.svg', 'Investigating an IOC', 'Does this Sha256 hash [hash] appear anywhere in my network?'],
        ['ms:deployed_code', 'Get suggested response options', 'What action should I take next?'],
      ],
    },
  };

  let anchor = null;
  let showTimer = 0;
  let hideTimer = 0;

  function fill(key) {
    const a = AGENTS[key];
    const p = PROFILES[key];
    const used = Lux.credits;
    card.innerHTML = `
      <div class="profile-card__head">
        ${AgentIcons.html(key, 24)}
        <div class="profile-card__titles">
          <span class="profile-card__name">${a.name}</span>
          <span class="profile-card__kind">${key === 'lux' ? 'Built in' : 'Runs with your approval'}</span>
        </div>
      </div>
      <p class="profile-card__desc">${p.desc}</p>
      ${p.credits ? `
        <div class="profile-card__usage">
          <svg class="ring" viewBox="0 0 20 20" aria-hidden="true">
            <circle class="ring__track" cx="10" cy="10" r="8"/>
            <circle class="ring__fill" cx="10" cy="10" r="8" style="--p:${used / CREDIT_LIMIT}"/>
          </svg>
          <span>Usage credits</span>
          <strong>${used}/${CREDIT_LIMIT}</strong>
        </div>` : ''}
      <p class="profile-card__try">Try asking</p>
      <div class="profile-card__asks">
        ${p.asks.map(([icon, meta, q, kind], i) => `
          <button class="prompt" type="button" style="--i:${i}" data-q="${q}" data-kind="${kind || ''}">
            <span class="prompt__meta">${icon.startsWith('ms:') ? `<span class="ms" aria-hidden="true">${icon.slice(3)}</span>` : `<img src="${icon}" width="16" height="16" alt="">`}${meta}</span>
            <span class="prompt__text">${q}</span>
          </button>`).join('')}
      </div>`;
    card.querySelectorAll('.prompt').forEach(b => b.addEventListener('click', () => {
      hide(true);
      if (!Lux.isOpen()) Lux.setOpen(true, { float: Lux.floating });
      Lux.showView?.('chat');
      if (!Lux.busy) Lux.usePrompt(b.dataset.q, b.dataset.kind);
    }));
  }

  function place(target) {
    const r = target.getBoundingClientRect();
    const w = Math.min(360, window.innerWidth - 32);
    card.style.width = `${w}px`;
    const h = card.offsetHeight;
    let left = r.right - w;                       // right-aligned to the name
    left = Math.max(16, Math.min(left, window.innerWidth - w - 16));
    let top = r.bottom + 10;
    if (top + h > window.innerHeight - 16) top = Math.max(16, r.top - h - 10);
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
    card.style.transformOrigin = `${r.right - left}px ${top > r.top ? 0 : h}px`;
  }

  function show(target) {
    clearTimeout(hideTimer);
    if (anchor === target && !card.hidden) return;
    anchor = target;
    fill(target.dataset.agent);
    card.hidden = false;
    card.classList.remove('is-open');
    place(target);
    requestAnimationFrame(() => card.classList.add('is-open'));
  }

  function hide(now) {
    clearTimeout(showTimer);
    clearTimeout(hideTimer);
    const go = () => {
      card.classList.remove('is-open');
      anchor = null;
      setTimeout(() => { if (!anchor) card.hidden = true; }, 160);
    };
    if (now) go(); else hideTimer = setTimeout(go, 220);
  }

  document.addEventListener('pointerover', e => {
    const t = e.target.closest?.('[data-agent]');
    if (t) {
      clearTimeout(hideTimer);
      clearTimeout(showTimer);
      showTimer = setTimeout(() => show(t), 320);
    } else if (e.target.closest?.('#profileCard')) {
      clearTimeout(hideTimer);
    }
  });
  document.addEventListener('pointerout', e => {
    const t = e.target.closest?.('[data-agent], #profileCard');
    if (!t) return;
    const to = e.relatedTarget;
    if (to && (to.closest?.('#profileCard') || (anchor && anchor.contains(to)))) return;
    clearTimeout(showTimer);
    if (!card.hidden) hide();
  });
  document.addEventListener('click', e => {
    const t = e.target.closest?.('[data-agent]');
    if (t) { clearTimeout(showTimer); if (anchor === t && !card.hidden) hide(true); else show(t); return; }
    if (!e.target.closest?.('#profileCard') && !card.hidden) hide(true);
  });
  document.addEventListener('focusin', e => {
    const t = e.target.closest?.('[data-agent]');
    if (t && e.target.matches(':focus-visible')) show(t);
  });
  document.addEventListener('keydown', e => {
    const t = e.target.closest?.('[data-agent]');
    if (t && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); show(t); card.querySelector('button')?.focus(); }
  });
  document.getElementById('chatSection').addEventListener('scroll', () => { if (!card.hidden) hide(true); }, { passive: true });

  const prevClose = Lux.closeTopLayer;
  Lux.closeTopLayer = () => {
    if (!card.hidden) { hide(true); return true; }
    return prevClose ? prevClose() : false;
  };
})();
