import { STR } from './i18n.js';
import { CONFIG, triage, detectRisk, isLocked } from './triage.js';

const KEY = 'degerlen.v1';
const root = document.getElementById('app');

const blank = () => ({ lang: null, consent: null, tests: [], lock: null, needRetest: false, records: [], chat: null, voiceOut: false, usage: { day: '', sec: 0 } });

function load() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    if (v && typeof v === 'object') return Object.assign(blank(), v);
  } catch (e) { /* ignore */ }
  return blank();
}
let S = load();
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ }
}

const guessLang = () => ((navigator.language || 'en').toLowerCase().startsWith('tr') ? 'tr' : 'en');
const lang = () => S.lang || guessLang();

const dayKey = () => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};
function usedSec() {
  if (!S.usage || S.usage.day !== dayKey()) S.usage = { day: dayKey(), sec: 0 };
  return S.usage.sec;
}
const remainingSec = () => Math.max(0, CONFIG.dailyChatMinutes * 60 - usedSec());
let chatTimer = null;
function stopTimer() {
  if (chatTimer) { clearInterval(chatTimer); chatTimer = null; }
}

function tx(key, vars) {
  let s = key.split('.').reduce((o, k) => (o == null ? o : o[k]), STR[lang()]);
  if (typeof s === 'string' && vars) for (const k of Object.keys(vars)) s = s.split('{' + k + '}').join(String(vars[k]));
  return s == null ? key : s;
}

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

function view(...nodes) {
  stopTimer();
  document.documentElement.lang = lang();
  root.replaceChildren(h('div', { class: 'wrap' }, ...nodes, h('p', { class: 'foot' }, tx('foot'))));
  window.scrollTo(0, 0);
}

const btn = (label, onclick, cls = 'btn') => h('button', { type: 'button', class: cls, onclick }, label);

function topbar(title, onBack) {
  return h('div', { class: 'topbar' },
    onBack ? h('button', { type: 'button', class: 'iconbtn', 'aria-label': tx('common.back'), onclick: onBack }, '‹') : h('span', { class: 'iconbtn ph' }),
    h('div', { class: 'title' }, title),
    h('button', { type: 'button', class: 'iconbtn', 'aria-label': tx('common.settings'), onclick: screenSettings }, '⚙')
  );
}

const fmtDate = (ms) => new Date(ms).toLocaleString(lang() === 'tr' ? 'tr-TR' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });

function resources() {
  const items = tx('res.items').map((it) => {
    if (it.tel) return h('li', null, h('a', { href: 'tel:' + it.tel }, it.label));
    if (it.url) return h('li', null, h('a', { href: it.url, target: '_blank', rel: 'noopener noreferrer' }, it.label));
    return h('li', null, it.label);
  });
  return h('div', { class: 'card res' }, h('h3', null, tx('result.res_title')), h('ul', null, items));
}

/* ---------- routing ---------- */
function route() {
  if (!S.lang) return screenLang();
  if (!S.consent) return screenConsent();
  if (isLocked(S.lock)) return screenLocked();
  if (S.needRetest || !S.tests.length) return screenCheckin();
  return screenHome();
}

/* ---------- language ---------- */
function screenLang() {
  view(
    h('div', { class: 'hero' }, h('div', { class: 'logo' }, 'DeğerLen'), h('p', { class: 'muted' }, 'Dil / Language')),
    btn('Türkçe', () => { S.lang = 'tr'; save(); route(); }),
    btn('English', () => { S.lang = 'en'; save(); route(); })
  );
}

/* ---------- consent ---------- */
function screenConsent() {
  const a = h('input', { type: 'checkbox', id: 'c1' });
  const b = h('input', { type: 'checkbox', id: 'c2' });
  const go = h('button', { type: 'button', class: 'btn', disabled: true }, tx('consent.button'));
  const upd = () => { go.disabled = !(a.checked && b.checked); };
  a.addEventListener('change', upd);
  b.addEventListener('change', upd);
  go.addEventListener('click', () => {
    if (go.disabled) return;
    S.consent = { ts: Date.now(), age18: true };
    save();
    route();
  });
  view(
    h('div', { class: 'hero' }, h('div', { class: 'logo' }, 'DeğerLen'), h('p', { class: 'muted' }, tx('tagline'))),
    h('div', { class: 'card' },
      h('h2', null, tx('consent.title')),
      h('ul', { class: 'bul' }, ['b1', 'b2', 'b3', 'b4', 'b5'].map((k) => h('li', null, tx('consent.' + k))))
    ),
    h('label', { class: 'check' }, a, h('span', null, tx('consent.age'))),
    h('label', { class: 'check' }, b, h('span', null, tx('consent.agree'))),
    go
  );
}

/* ---------- check-in ---------- */
function screenCheckin() {
  const SAF = ['risk_recent', 'risk_plan', 'psychosis', 'mania'];
  const total = 9 + 7 + SAF.length;
  const ans = { phq: [], gad: [], safety: {} };
  let i = 0;

  function next() {
    i += 1;
    if (i >= total) return finish();
    draw();
  }

  function draw() {
    let intro; let q; let opts; let pick;
    if (i < 9) {
      intro = tx('checkin.intro_phq'); q = tx('checkin.phq')[i];
      opts = tx('checkin.opts').map((l, v) => [l, v]);
      pick = (v) => { ans.phq[i] = v; next(); };
    } else if (i < 16) {
      const j = i - 9;
      intro = tx('checkin.intro_gad'); q = tx('checkin.gad')[j];
      opts = tx('checkin.opts').map((l, v) => [l, v]);
      pick = (v) => { ans.gad[j] = v; next(); };
    } else {
      const id = SAF[i - 16];
      intro = tx('checkin.intro_safety'); q = tx('checkin.safety.' + id);
      opts = [[tx('common.yes'), true], [tx('common.no'), false]];
      pick = (v) => { ans.safety[id] = v; next(); };
    }
    view(
      topbar(tx('checkin.title'), i > 0 ? () => { i -= 1; draw(); } : (S.tests.length ? screenHome : null)),
      h('div', { class: 'progress' }, h('div', { class: 'bar', style: 'width:' + Math.round((i / total) * 100) + '%' })),
      h('p', { class: 'muted small' }, tx('checkin.progress', { n: i + 1, total })),
      h('p', { class: 'muted' }, intro),
      h('div', { class: 'card q' }, q),
      opts.map(([label, v]) => btn(label, () => pick(v), 'btn opt'))
    );
  }

  function finish() {
    const res = triage({ phq: ans.phq, gad: ans.gad, safety: ans.safety });
    S.tests.push({ ts: Date.now(), phq: res.phqScore, gad: res.gadScore, phqLevel: res.phqLevel, gadLevel: res.gadLevel, outcome: res.outcome, band: res.band });
    S.needRetest = res.outcome !== 'ok';
    S.lock = res.lockUntil ? { until: res.lockUntil, reason: res.outcome } : null;
    save();
    if (res.outcome === 'ok') return screenOk(res);
    return screenLocked();
  }

  draw();
}

function screenOk(res) {
  const textKey = 'result.ok_' + res.band;
  view(
    h('div', { class: 'card ok' },
      h('h2', null, tx('result.ok_title')),
      h('p', null, tx(textKey)),
      h('p', { class: 'muted small' }, tx('result.scores', { phq: res.phqScore, gad: res.gadScore })),
      h('p', { class: 'muted small' }, tx('result.note_scores'))
    ),
    btn(tx('common.start'), route)
  );
}

function screenLocked() {
  const lock = S.lock || { until: Date.now(), reason: 'psychiatry' };
  const crisis = lock.reason === 'crisis';
  const date = fmtDate(lock.until);
  view(
    topbar(tx('result.locked_title'), null),
    h('div', { class: 'card ' + (crisis ? 'crisis' : 'psych') },
      h('h2', null, crisis ? tx('result.crisis_title') : tx('result.psych_title')),
      h('p', null, crisis ? tx('result.crisis_text') : tx('result.psych_text', { date })),
      crisis ? h('p', { class: 'muted small' }, tx('result.crisis_retest', { date })) : null
    ),
    resources()
  );
}

/* ---------- home ---------- */
function card(title, sub, onclick) {
  return h('button', { type: 'button', class: 'tile', onclick }, h('div', { class: 'tt' }, title), h('div', { class: 'ts' }, sub));
}

function screenHome() {
  const hasChat = S.chat && S.chat.msgs && S.chat.msgs.length;
  view(
    topbar(tx('name'), null),
    h('h2', { class: 'greet' }, tx('home.hello')),
    h('p', { class: 'muted' }, tx('home.sub')),
    (S.tests.length && ['moderate', 'high'].includes(S.tests[S.tests.length - 1].band)) ? h('div', { class: 'card soft' }, tx('home.pro_note')) : null,
    hasChat ? card(tx('home.continue'), tx('chat.badge'), screenChat) : null,
    card(tx('home.talk_title'), tx('home.talk_sub'), screenTopics),
    card(tx('home.past_title'), tx('home.past_sub'), screenAges),
    card(tx('home.record_title'), tx('home.record_sub'), screenRecord),
    card(tx('home.progress_title'), tx('home.progress_sub'), screenProgress),
    card(tx('home.checkin_title'), tx('home.checkin_sub'), screenCheckin)
  );
}

function screenTopics() {
  if (!remainingSec()) return screenLimit();
  view(
    topbar(tx('home.talk_title'), screenHome),
    h('h3', null, tx('home.topic_title')),
    h('div', { class: 'chips' }, Object.keys(STR.tr.topics).map((k) => btn(tx('topics.' + k), () => startChat('general', k, null), 'chip')))
  );
}

function screenAges() {
  if (!remainingSec()) return screenLimit();
  view(
    topbar(tx('home.past_title'), screenHome),
    h('div', { class: 'card soft' }, tx('home.past_warning')),
    h('h3', null, tx('home.age_title')),
    Object.keys(STR.tr.ages).map((k) => btn(tx('ages.' + k), () => startChat('past', null, k), 'btn opt'))
  );
}

/* ---------- chat ---------- */
let rec = null;
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

function speak(text) {
  if (!S.voiceOut || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang() === 'tr' ? 'tr-TR' : 'en-US';
    window.speechSynthesis.speak(u);
  } catch (e) { /* ignore */ }
}

function startChat(mode, topic, age) {
  if (!remainingSec()) return screenLimit();
  S.chat = { mode, topic, age, msgs: [] };
  save();
  screenChat();
}

function triggerCrisis() {
  try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
  S.lock = { until: Date.now() + CONFIG.crisisLockHours * 3600 * 1000, reason: 'crisis' };
  S.needRetest = true;
  S.chat = null;
  save();
  route();
}

function screenChat() {
  if (!S.chat) return screenHome();
  if (!remainingSec()) return screenLimit();
  stopTimer();
  const chat = S.chat;
  const list = h('div', { class: 'msgs' });
  const input = h('textarea', { rows: '1', placeholder: tx('chat.placeholder'), 'aria-label': tx('chat.placeholder') });
  const sendBtn = h('button', { type: 'button', class: 'send', 'aria-label': tx('common.send') }, '➤');
  const mic = SR ? h('button', { type: 'button', class: 'mic', 'aria-label': tx('chat.mic') }, '🎤') : null;
  const voice = h('input', { type: 'checkbox' });
  voice.checked = !!S.voiceOut;
  voice.addEventListener('change', () => { S.voiceOut = voice.checked; save(); if (!voice.checked) { try { window.speechSynthesis.cancel(); } catch (e) { /* ignore */ } } });
  let busy = false;

  const bubble = (role, text, cls) => h('div', { class: 'b ' + (role === 'user' ? 'u' : 'a') + (cls ? ' ' + cls : '') }, text);
  const scroll = () => window.scrollTo(0, document.body.scrollHeight);

  function paint() {
    list.replaceChildren();
    if (!chat.msgs.length) list.append(bubble('assistant', chat.mode === 'past' ? tx('chat.intro_past') : tx('chat.intro_general')));
    for (const m of chat.msgs) list.append(bubble(m.role, m.content));
  }

  async function send() {
    const text = input.value.trim();
    if (!text || busy) return;
    if (!remainingSec()) return screenLimit();
    if (rec) { try { rec.stop(); } catch (e) { /* ignore */ } }
    if (detectRisk(text)) return triggerCrisis();
    input.value = '';
    chat.msgs.push({ role: 'user', content: text });
    save();
    paint();
    busy = true;
    sendBtn.disabled = true;
    const wait = bubble('assistant', tx('chat.thinking'), 'wait');
    list.append(wait);
    scroll();
    try {
      const r = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lang: lang(), mode: chat.mode, topic: chat.topic, age: chat.age, messages: chat.msgs.slice(-14) }),
      });
      const d = await r.json().catch(() => ({}));
      if (d.risk) return triggerCrisis();
      wait.remove();
      if (r.ok && d.reply) {
        chat.msgs.push({ role: 'assistant', content: d.reply });
        save();
        list.append(bubble('assistant', d.reply));
        speak(d.reply);
      } else {
        list.append(bubble('assistant', tx('chat.error'), 'err'));
      }
    } catch (e) {
      wait.remove();
      list.append(bubble('assistant', tx('chat.error'), 'err'));
    }
    busy = false;
    sendBtn.disabled = false;
    scroll();
  }

  sendBtn.addEventListener('click', send);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
  input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 140) + 'px'; });
  if (mic) {
    mic.addEventListener('click', () => {
      if (rec) { try { rec.stop(); } catch (e) { /* ignore */ } return; }
      try {
        rec = new SR();
        rec.lang = lang() === 'tr' ? 'tr-TR' : 'en-US';
        rec.interimResults = true;
        rec.continuous = false;
        const base = input.value ? input.value + ' ' : '';
        rec.onresult = (e) => { let t = ''; for (const r of e.results) t += r[0].transcript; input.value = base + t; };
        rec.onend = () => { rec = null; mic.classList.remove('on'); };
        rec.onerror = () => { rec = null; mic.classList.remove('on'); };
        rec.start();
        mic.classList.add('on');
      } catch (e) { rec = null; }
    });
  }

  const leftEl = h('div', { class: 'badge' });
  const showLeft = () => { leftEl.textContent = tx('chat.remaining', { m: Math.ceil(remainingSec() / 60) }); };
  showLeft();
  let warned = remainingSec() <= 300;
  chatTimer = setInterval(() => {
    if (document.hidden) return;
    usedSec();
    S.usage.sec += 5;
    save();
    if (remainingSec() <= 0) {
      try { if (rec) rec.stop(); } catch (e) { /* ignore */ }
      try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
      return screenLimit();
    }
    if (!warned && remainingSec() <= 300) {
      warned = true;
      list.append(bubble('assistant', tx('chat.five_left'), 'note'));
      scroll();
    }
    showLeft();
  }, 5000);

  const title = chat.mode === 'past' ? tx('home.past_title') : tx('topics.' + (chat.topic || 'other'));
  root.replaceChildren(h('div', { class: 'wrap chatwrap' },
    topbar(title, () => { if (rec) { try { rec.stop(); } catch (e) { /* ignore */ } } screenHome(); }),
    h('div', { class: 'badge' }, tx('chat.badge')),
    leftEl,
    h('label', { class: 'check small' }, voice, h('span', null, tx('chat.voice_out'))),
    list,
    h('div', { class: 'composer' }, input, mic, sendBtn)
  ));
  document.documentElement.lang = lang();
  paint();
  window.scrollTo(0, document.body.scrollHeight);
}

/* ---------- daily limit ---------- */
function screenLimit() {
  view(
    topbar(tx('limit.title'), screenHome),
    h('div', { class: 'card soft' }, h('h2', null, tx('limit.title')), h('p', null, tx('limit.text'))),
    btn(tx('home.record_title'), screenRecord),
    btn(tx('common.home'), screenHome, 'btn opt'),
    resources()
  );
}

/* ---------- thought record ---------- */
function screenRecord() {
  const f = {};
  const field = (key, multi) => {
    const el = multi ? h('textarea', { rows: '3', 'aria-label': tx('record.' + key) }) : h('input', { type: 'text', 'aria-label': tx('record.' + key) });
    f[key] = el;
    return h('label', { class: 'fld' }, h('span', null, tx('record.' + key)), el);
  };
  const slider = (key) => {
    const out = h('b', null, '50');
    const el = h('input', { type: 'range', min: '0', max: '100', value: '50', 'aria-label': tx('record.' + key) });
    el.addEventListener('input', () => { out.textContent = el.value; });
    f[key] = el;
    return h('label', { class: 'fld' }, h('span', null, tx('record.' + key) + ': ', out, '%'), el);
  };
  const trap = h('select', { 'aria-label': tx('record.trap') }, Object.keys(STR.tr.record.traps).map((k) => h('option', { value: k }, tx('record.traps.' + k))));
  f.trap = trap;

  const save1 = btn(tx('common.save'), () => {
    if (!f.thought.value.trim()) { f.thought.focus(); return; }
    S.records.push({
      ts: Date.now(), situation: f.situation.value.trim(), thought: f.thought.value.trim(), emotion: f.emotion.value.trim(),
      before: Number(f.before.value), trap: trap.value, for: f.for.value.trim(), against: f.against.value.trim(),
      alt: f.alt.value.trim(), after: Number(f.after.value),
    });
    save();
    screenRecord();
  });

  const past = [...S.records].reverse().map((r, idx) => {
    const realIdx = S.records.length - 1 - idx;
    return h('div', { class: 'card rec' },
      h('div', { class: 'muted small' }, fmtDate(r.ts) + ' · ' + tx('record.traps.' + (r.trap || 'none'))),
      h('p', null, h('b', null, r.thought)),
      r.alt ? h('p', null, '→ ' + r.alt) : null,
      h('div', { class: 'muted small' }, (r.before ?? '') + '% → ' + (r.after ?? '') + '%'),
      h('button', { type: 'button', class: 'link', onclick: () => { S.records.splice(realIdx, 1); save(); screenRecord(); } }, tx('common.delete'))
    );
  });

  view(
    topbar(tx('record.title'), screenHome),
    h('p', { class: 'muted' }, tx('record.intro')),
    field('situation', true), field('thought', true), field('emotion', false), slider('before'),
    h('label', { class: 'fld' }, h('span', null, tx('record.trap')), trap),
    field('for', true), field('against', true), field('alt', true), slider('after'),
    save1,
    h('h3', null, tx('record.list')),
    past.length ? past : h('p', { class: 'muted' }, tx('record.empty'))
  );
}

/* ---------- progress ---------- */
function screenProgress() {
  const rows = [...S.tests].reverse().slice(0, 12).map((t) =>
    h('div', { class: 'card prow' },
      h('div', { class: 'muted small' }, fmtDate(t.ts)),
      h('div', { class: 'lbl' }, tx('progress.mood') + ' ' + t.phq + '/27'),
      h('div', { class: 'meter' }, h('div', { class: 'fill m', style: 'width:' + Math.round((t.phq / 27) * 100) + '%' })),
      h('div', { class: 'lbl' }, tx('progress.anx') + ' ' + t.gad + '/21'),
      h('div', { class: 'meter' }, h('div', { class: 'fill a', style: 'width:' + Math.round((t.gad / 21) * 100) + '%' }))
    ));
  view(
    topbar(tx('progress.title'), screenHome),
    h('p', null, tx('progress.records', { n: S.records.length })),
    h('h3', null, tx('progress.tests')),
    rows.length ? rows : h('p', { class: 'muted' }, tx('progress.empty')),
    h('p', { class: 'muted small' }, tx('result.note_scores'))
  );
}

/* ---------- settings ---------- */
function screenSettings() {
  const voice = h('input', { type: 'checkbox' });
  voice.checked = !!S.voiceOut;
  voice.addEventListener('change', () => { S.voiceOut = voice.checked; save(); });
  const back = S.lang && S.consent && !isLocked(S.lock) && S.tests.length && !S.needRetest ? screenHome : route;
  view(
    topbar(tx('settings.title'), back),
    h('h3', null, tx('settings.language')),
    h('div', { class: 'chips' },
      btn('Türkçe', () => { S.lang = 'tr'; save(); screenSettings(); }, 'chip' + (lang() === 'tr' ? ' on' : '')),
      btn('English', () => { S.lang = 'en'; save(); screenSettings(); }, 'chip' + (lang() === 'en' ? ' on' : ''))
    ),
    h('label', { class: 'check' }, voice, h('span', null, tx('settings.voice'))),
    btn(tx('settings.delete'), () => {
      if (window.confirm(tx('settings.delete_confirm'))) {
        const l = S.lang;
        localStorage.removeItem(KEY);
        S = blank();
        S.lang = l;
        save();
        route();
      }
    }, 'btn danger'),
    h('p', { class: 'muted small' }, tx('settings.about'))
  );
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
}
route();
