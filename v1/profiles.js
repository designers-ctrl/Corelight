/* Section 04 · Agent profiles (Figma 3073:44689): what an agent can do, usage credits and
   suggested questions. Opens when hovering, focusing or clicking an agent name. */

(() => {
  const { el, ASSETS } = Lux;
  const card = document.getElementById('profileCard');

  const PROFILES = {
    lux: {
      name: 'Lux AI',
      icon: AgentIcons.html('lux', 16),     // LUX AI chat v4 icons (agent-icons.js)
      // The Figma Lux variant repeats the Investigator Agent text; this is written for Lux.
      desc: 'Answers questions about Corelight, Zeek and your logs, explains detections, and brings in specialist agents when a question needs them.',
      credits: false,
      asks: [
        ['code', 'New to Zeek', 'Help me understand this log', 'log'],
        ['troubleshoot', 'New to network incident response', 'How do I investigate lateral movement?', 'lateral'],
      ],
    },
    investigation: {
      name: 'Investigator Agent',
      icon: AgentIcons.html('investigation', 16),
      desc: 'Generates Logscale query, investigates network alerts, correlates telemetry, explains evidence, and recommends response actions.',
      credits: true,
      asks: [
        ['frame_inspect', 'Investigating an IP or host', 'How many external IPs has [IP] connected to over the last 24 hours?'],
        ['person_search', 'Investigating an IOC', 'Does this Sha256 hash [hash] appear anywhere in my network?'],
        ['deployed_code', 'Get suggested response options', 'What action should I take next?', null, true],
      ],
    },
  };

  let anchor = null;
  let showTimer = 0;
  let hideTimer = 0;

  function fill(key) {
    const p = PROFILES[key];
    const used = Lux.credits;
    card.innerHTML = `
      <div class="profile-card__head"><span class="profile-card__icon">${p.icon}</span><span class="profile-card__name">${p.name}</span></div>
      <div class="profile-card__desc">
        <p>${p.desc}</p>
        ${p.credits ? `
          <div class="profile-card__usage"><span>Usage Credits</span><strong>${used}/${Lux.CREDIT_LIMIT}</strong></div>
          <div class="meter" role="meter" aria-valuemin="0" aria-valuemax="${Lux.CREDIT_LIMIT}" aria-valuenow="${used}" aria-label="Usage credits">
            <span class="meter__fill" style="--p:${used / Lux.CREDIT_LIMIT}"></span>
          </div>` : ''}
      </div>
      <div class="profile-card__try">
        <p class="profile-card__try-title">Try asking</p>
        ${p.asks.map(([icon, meta, q, kind, strong]) => `
          <button class="ask-card ask-card--profile${strong ? ' is-strong' : ''}" type="button" data-q="${q}" data-kind="${kind || ''}">
            <span class="prompt__meta"><span class="ms ms--14" aria-hidden="true">${icon}</span>${meta}</span>
            <span class="ask-card__q">${q}</span>
          </button>`).join('')}
      </div>`;
    card.querySelectorAll('.ask-card').forEach(b => b.addEventListener('click', () => {
      hide(true);
      if (!Lux.isOpen()) Lux.setOpen(true, { float: Lux.floating });
      Lux.showView?.('chat');
      if (!Lux.busy) Lux.usePrompt(b.dataset.q, b.dataset.kind);
    }));
  }

  function place(target) {
    const r = target.getBoundingClientRect();
    const w = Math.min(400, window.innerWidth - 32);
    card.style.width = `${w}px`;
    const h = card.offsetHeight;
    let left = r.right - w;                       // right-aligned to the name, like the design
    left = Math.max(16, Math.min(left, window.innerWidth - w - 16));
    let top = r.bottom + 8;
    if (top + h > window.innerHeight - 16) top = Math.max(16, r.top - h - 8);
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
