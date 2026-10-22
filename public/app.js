import { STR } from './i18n.js';
import { CONFIG, triage, detectRisk, isLocked, traumaScreen } from './triage.js';

const KEY = 'degerlen.v1';
const root = document.getElementById('app');
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const blank = () => ({
  lang: null, consent: null, tests: [], lock: null, needRetest: false, records: [],
  sessions: [], voiceOut: false, usage: { day: '', sec: 0 }, intake: { concerns: [] }, trauma: null,
});

function load() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    if (v && typeof v === 'object') {
      if (v.chat && v.chat.msgs && v.chat.msgs.length) {
        v.sessions = (v.sessions || []).concat([{ id: uid(), mode: v.chat.mode, topic: v.chat.topic, age: v.chat.age, ts: Date.now(), upd: Date.now(), msgs: v.chat.msgs, moodBefore: null, moodAfter: null, done: false, sec: 0 }]);
      }
      delete v.chat;
      return Object.assign(blank(), v);
    }
  } catch (e) { /* ignore */ }
  return blank();
}
let S = load();
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ }
}

const guessLang = () => ((navigator.language || 'en').toLowerCase().startsWith('tr') ? 'tr' : 'en');
const lang = () => S.lang || guessLang();

/* ---------- daily time ---------- */
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

/* ---------- helpers ---------- */
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

const ICONS = {
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>',
  book: '<path d="M4 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4z"/><path d="M20 4h-6a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h7z"/>',
  chart: '<path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/>',
  gear: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  send: '<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/>',
  mic: '<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/>',
  speaker: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/>',
  speakeroff: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l5 6M22 9l-5 6"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  trash: '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chev: '<path d="M9 5l7 7-7 7"/>',
  heart: '<path d="M12 20s-7-4.6-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.4-7 10-7 10z"/>',
  spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  leaf: '<path d="M5 19c0-8 5-14 15-14 0 10-6 15-14 15"/><path d="M5 19c3-5 6-8 10-10"/>',
};
function ico(name) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('class', 'i');
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = ICONS[name] || '';
  return s;
}

const btn = (label, onclick, cls = 'btn') => h('button', { type: 'button', class: cls, onclick }, label);
const abtn = (icon, onclick, label, cls = 'abtn') => h('button', { type: 'button', class: cls, 'aria-label': label, onclick }, ico(icon));

const TABS = [
  ['home', 'home', () => screenHome()],
  ['talk', 'chat', () => screenTalk()],
  ['record', 'edit', () => screenRecord()],
  ['learn', 'book', () => screenLearn()],
  ['progress', 'chart', () => screenProgress()],
];
function navbar(active) {
  return h('nav', { class: 'nav' }, TABS.map(([key, icon, go]) =>
    h('button', { type: 'button', class: key === active ? 'on' : '', 'aria-label': tx('nav.' + key), onclick: go }, ico(icon), tx('nav.' + key))));
}

function page(opts, ...nodes) {
  stopTimer();
  document.documentElement.lang = lang();
  const { title, sub, back, tab, gear, right, cls } = opts;
  const bar = h('div', { class: 'appbar' },
    back ? abtn('back', back, tx('common.back')) : h('span', { class: 'mark' }, ico('heart')),
    h('div', { class: 'ttl' }, h('b', null, title), sub ? h('span', null, sub) : null),
    right,
    gear ? abtn('gear', screenSettings, tx('common.settings')) : null);
  const main = h('div', { class: 'main' + (tab ? ' hasnav' : '') }, ...nodes, h('p', { class: 'foot' }, tx('foot')));
  root.replaceChildren(h('div', { class: 'shell' + (cls ? ' ' + cls : '') }, bar, main, tab ? navbar(tab) : null));
  window.scrollTo(0, 0);
}

const fmtDate = (ms) => new Date(ms).toLocaleString(lang() === 'tr' ? 'tr-TR' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });
const fmtDay = (ms) => new Date(ms).toLocaleDateString(lang() === 'tr' ? 'tr-TR' : 'en-GB', { day: 'numeric', month: 'short' });

function resources() {
  const items = tx('res.items').map((it) => {
    if (it.tel) return h('li', null, h('a', { href: 'tel:' + it.tel }, it.label));
    if (it.url) return h('li', null, h('a', { href: it.url, target: '_blank', rel: 'noopener noreferrer' }, it.label));
    return h('li', null, it.label);
  });
  return h('div', { class: 'card res' }, h('h2', null, tx('result.res_title')), h('ul', null, items));
}

const sessionTitle = (s) => (s.mode === 'past' ? tx('talk.past_session') : tx('topics.' + (s.topic || 'other')));

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
  page({ title: tx('name') },
    h('div', { class: 'hero' }, h('h2', null, 'DeğerLen'), h('p', { class: 'sub' }, 'Dil / Language')),
    btn('Türkçe', () => { S.lang = 'tr'; save(); route(); }),
    btn('English', () => { S.lang = 'en'; save(); route(); }, 'btn alt')
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
  page({ title: tx('name'), sub: tx('tagline') },
    h('div', { class: 'card' },
      h('h2', null, tx('consent.title')),
      h('ul', { class: 'bul' }, ['b1', 'b2', 'b3', 'b4', 'b5'].map((k) => h('li', null, tx('consent.' + k))))
    ),
    h('label', { class: 'check' }, a, h('span', null, tx('consent.age'))),
    h('label', { class: 'check' }, b, h('span', null, tx('consent.agree'))),
    go
  );
}

/* ---------- assessment (paged) ---------- */
const SAF = ['risk_recent', 'risk_plan', 'psychosis', 'mania'];

function screenCheckin() {
  const pages = [
    { t: 'concern' },
    { t: 'phq', idx: [0, 1, 2] }, { t: 'phq', idx: [3, 4, 5] }, { t: 'phq', idx: [6, 7, 8] },
    { t: 'func' },
    { t: 'gad', idx: [0, 1, 2, 3] }, { t: 'gad', idx: [4, 5, 6] },
    { t: 'safety', idx: [0, 1] }, { t: 'safety', idx: [2, 3] },
  ];
  const ans = { phq: [], gad: [], safety: {}, func: null, concerns: new Set((S.intake && S.intake.concerns) || []) };
  let p = 0;

  function question(text, options, get, set) {
    const pills = h('div', { class: 'pills' });
    const paint = () => {
      pills.replaceChildren(...options.map(([label, v]) =>
        h('button', { type: 'button', class: 'pill' + (get() === v ? ' on' : ''), onclick: () => { set(v); paint(); refresh(); } }, label)));
    };
    paint();
    return h('div', { class: 'card q' }, h('div', null, text), pills);
  }

  let refresh = () => {};

  function draw() {
    const pg = pages[p];
    const opts = tx('checkin.opts').map((l, v) => [l, v]);
    const yn = [[tx('common.yes'), true], [tx('common.no'), false]];
    let intro; let heading; let body = []; let ready = () => true;

    if (pg.t === 'concern') {
      heading = tx('checkin.concern_title');
      intro = tx('checkin.concern_sub');
      const chips = h('div', { class: 'chips' });
      const paint = () => chips.replaceChildren(...Object.keys(STR.tr.topics).map((k) =>
        h('button', { type: 'button', class: 'chip' + (ans.concerns.has(k) ? ' on' : ''), onclick: () => { if (ans.concerns.has(k)) ans.concerns.delete(k); else ans.concerns.add(k); paint(); } }, tx('topics.' + k))));
      paint();
      body = [chips];
    } else if (pg.t === 'phq') {
      heading = tx('checkin.sec_mood'); intro = tx('checkin.intro_phq');
      body = pg.idx.map((i) => question(tx('checkin.phq')[i], opts, () => ans.phq[i], (v) => { ans.phq[i] = v; }));
      ready = () => pg.idx.every((i) => ans.phq[i] !== undefined);
    } else if (pg.t === 'func') {
      heading = tx('checkin.sec_func'); intro = '';
      body = [question(tx('checkin.func_q'), tx('checkin.func_opts').map((l, v) => [l, v]), () => ans.func, (v) => { ans.func = v; })];
      ready = () => ans.func !== null;
    } else if (pg.t === 'gad') {
      heading = tx('checkin.sec_anx'); intro = tx('checkin.intro_gad');
      body = pg.idx.map((i) => question(tx('checkin.gad')[i], opts, () => ans.gad[i], (v) => { ans.gad[i] = v; }));
      ready = () => pg.idx.every((i) => ans.gad[i] !== undefined);
    } else {
      heading = tx('checkin.sec_safety'); intro = tx('checkin.intro_safety');
      body = pg.idx.map((i) => question(tx('checkin.safety.' + SAF[i]), yn, () => ans.safety[SAF[i]], (v) => { ans.safety[SAF[i]] = v; }));
      ready = () => pg.idx.every((i) => ans.safety[SAF[i]] !== undefined);
    }

    const last = p === pages.length - 1;
    const next = h('button', { type: 'button', class: 'btn', disabled: true, onclick: () => { if (!ready()) return; if (last) finish(); else { p += 1; draw(); } } }, last ? tx('common.finish') : tx('common.next'));
    const hint = h('p', { class: 'muted xs', style: 'text-align:center' }, tx('checkin.need_all'));
    refresh = () => { const ok = ready(); next.disabled = !ok; hint.style.visibility = ok ? 'hidden' : 'visible'; };

    page({ title: tx('checkin.title'), sub: tx('checkin.step', { n: p + 1, total: pages.length }), back: p > 0 ? () => { p -= 1; draw(); } : (S.tests.length && !S.needRetest ? screenHome : null) },
      h('div', { class: 'progress' }, h('div', { class: 'bar', style: 'width:' + Math.round(((p + 1) / pages.length) * 100) + '%' })),
      h('div', null, h('h2', null, heading), intro ? h('p', { class: 'muted', style: 'margin-top:4px' }, intro) : null),
      body, next, hint);
    refresh();
  }

  function finish() {
    const res = triage({ phq: ans.phq, gad: ans.gad, safety: ans.safety });
    S.intake = { concerns: [...ans.concerns] };
    S.tests.push({ ts: Date.now(), phq: res.phqScore, gad: res.gadScore, phqLevel: res.phqLevel, gadLevel: res.gadLevel, func: ans.func, outcome: res.outcome, band: res.band });
    S.needRetest = res.outcome !== 'ok';
    S.lock = res.lockUntil ? { until: res.lockUntil, reason: res.outcome } : null;
    save();
    if (res.outcome === 'ok') return screenOk(res);
    return screenLocked();
  }

  draw();
}

function screenOk(res) {
  page({ title: tx('result.ok_title') },
    h('div', { class: 'card ok' },
      h('h2', null, tx('result.ok_title')),
      h('p', null, tx('result.ok_' + res.band)),
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
  page({ title: tx('result.locked_title'), gear: true },
    h('div', { class: 'card ' + (crisis ? 'crisis' : 'psych') },
      h('h2', null, crisis ? tx('result.crisis_title') : tx('result.psych_title')),
      h('p', null, crisis ? tx('result.crisis_text') : tx('result.psych_text', { date })),
      crisis ? h('p', { class: 'muted small' }, tx('result.crisis_retest', { date })) : null
    ),
    resources()
  );
}

/* ---------- home ---------- */
function screenHome() {
  const last = S.tests[S.tests.length - 1];
  const total = CONFIG.dailyChatMinutes * 60;
  const pct = Math.min(100, Math.round((usedSec() / total) * 100));
  const open = S.sessions.filter((s) => !s.done && s.msgs.length).sort((a, b) => b.upd - a.upd)[0];
  const done = S.sessions.filter((s) => s.done).length;
  page({ title: tx('name'), sub: tx('tagline'), tab: 'home', gear: true },
    h('div', { class: 'hero' },
      h('div', null, h('h2', null, tx('home.hello')), h('p', { class: 'sub' }, tx('home.sub'))),
      h('div', null,
        h('div', { class: 'row between xs', style: 'margin-bottom:6px;opacity:.9' }, h('span', null, tx('home.today')), h('span', null, tx('home.time_left', { m: Math.ceil(remainingSec() / 60) }))),
        h('div', { class: 'meterbar' }, h('i', { style: 'width:' + (100 - pct) + '%' }))),
      btn(tx('home.cta'), screenTalk)
    ),
    open ? h('button', { type: 'button', class: 'item', onclick: () => openSession(open.id) },
      h('span', { class: 'ic' }, ico('chat')),
      h('span', { class: 'tx' }, h('b', null, tx('home.continue')), h('span', null, sessionTitle(open) + ' · ' + tx('home.resume_sub'))),
      h('span', { class: 'go' }, ico('chev'))) : null,
    (last && ['moderate', 'high'].includes(last.band)) ? h('div', { class: 'card warn' }, tx('home.pro_note')) : null,
    h('div', { class: 'stats' },
      h('div', { class: 'stat' }, h('b', null, done), h('span', null, tx('home.stats_sessions'))),
      h('div', { class: 'stat' }, h('b', null, S.records.length), h('span', null, tx('home.stats_records'))),
      h('div', { class: 'stat' }, h('b', null, last ? last.phq + '/' + last.gad : '–'), h('span', null, tx('home.last')))),
    h('div', { class: 'grid2' },
      homeTile('edit', tx('home.record_title'), tx('home.record_sub'), screenRecord),
      homeTile('leaf', tx('home.past_title'), tx('home.past_sub'), screenPast),
      homeTile('book', tx('home.learn_title'), tx('home.learn_sub'), screenLearn),
      homeTile('chart', tx('home.progress_title'), tx('home.progress_sub'), screenProgress)),
    h('button', { type: 'button', class: 'link plain', onclick: screenCheckin }, tx('home.retake'))
  );
}
function homeTile(icon, title, sub, go) {
  return h('button', { type: 'button', class: 'tile', onclick: go }, h('span', { class: 'ic' }, ico(icon)), h('div', { class: 'tt' }, title), h('div', { class: 'ts' }, sub));
}

/* ---------- talk (new + history) ---------- */
function screenTalk() {
  const limited = !remainingSec();
  const sessions = [...S.sessions].sort((a, b) => b.upd - a.upd);
  page({ title: tx('talk.title'), sub: tx('chat.sub'), tab: 'talk', gear: true },
    h('div', { class: 'card' },
      h('div', null, h('h2', null, tx('talk.new')), h('p', { class: 'muted small' }, tx('talk.new_sub'))),
      limited ? h('p', { class: 'muted' }, tx('talk.limit_note')) : null,
      h('div', { class: 'chips' }, Object.keys(STR.tr.topics).map((k) => h('button', { type: 'button', class: 'chip', disabled: limited, onclick: () => startSession('general', k, null) }, tx('topics.' + k))))),
    h('button', { type: 'button', class: 'item', onclick: screenPast },
      h('span', { class: 'ic' }, ico('leaf')),
      h('span', { class: 'tx' }, h('b', null, tx('home.past_title')), h('span', null, tx('home.past_sub'))),
      h('span', { class: 'go' }, ico('chev'))),
    h('h3', null, tx('talk.history')),
    sessions.length ? h('div', { class: 'list' }, sessions.map((s) =>
      h('div', { class: 'item', style: 'padding:10px 10px 10px 14px' },
        h('button', { type: 'button', class: 'row', style: 'flex:1;border:0;background:none;text-align:left;cursor:pointer;min-width:0;padding:0', onclick: () => openSession(s.id) },
          h('span', { class: 'ic' }, ico('chat')),
          h('span', { class: 'tx' }, h('b', null, sessionTitle(s)),
            h('span', null, fmtDay(s.upd) + ' · ' + tx('talk.msgs', { n: s.msgs.length }) + ' · ' + (s.done ? tx('talk.done') : tx('talk.open'))))),
        h('button', { type: 'button', class: 'iconlink', 'aria-label': tx('common.delete'), onclick: () => { if (window.confirm(tx('talk.delete_confirm'))) { S.sessions = S.sessions.filter((x) => x.id !== s.id); save(); screenTalk(); } } }, ico('trash'))))) : h('p', { class: 'muted' }, tx('talk.empty'))
  );
}

function screenPast() {
  if (!remainingSec()) return screenLimit();
  if (!S.trauma) return screenTrauma();
  page({ title: tx('home.past_title'), back: screenTalk, tab: 'talk' },
    h('div', { class: 'card soft' }, tx('home.past_warning')),
    S.trauma.flag ? h('div', { class: 'card warn' }, tx('trauma.flag')) : null,
    h('h3', null, tx('home.age_title')),
    Object.keys(STR.tr.ages).map((k) => btn(tx('ages.' + k), () => startSession('past', null, k), 'btn opt'))
  );
}

function screenTrauma() {
  const ans = [];
  const next = h('button', { type: 'button', class: 'btn', disabled: true, onclick: () => { S.trauma = Object.assign({ ts: Date.now() }, traumaScreen(ans)); save(); screenPast(); } }, tx('common.next'));
  const cards = tx('trauma.q').map((q, i) => {
    const pills = h('div', { class: 'pills' });
    const paint = () => pills.replaceChildren(...[[tx('common.yes'), true], [tx('common.no'), false]].map(([l, v]) =>
      h('button', { type: 'button', class: 'pill' + (ans[i] === v ? ' on' : ''), onclick: () => { ans[i] = v; paint(); next.disabled = !tx('trauma.q').every((_, j) => ans[j] !== undefined); } }, l)));
    paint();
    return h('div', { class: 'card q' }, h('div', null, q), pills);
  });
  page({ title: tx('trauma.title'), back: screenTalk, tab: 'talk' },
    h('p', { class: 'muted' }, tx('trauma.intro')), cards, h('p', { class: 'muted xs' }, tx('trauma.note')), next);
}

/* ---------- sessions ---------- */
function startSession(mode, topic, age) {
  if (!remainingSec()) return screenLimit();
  const s = { id: uid(), mode, topic, age, ts: Date.now(), upd: Date.now(), msgs: [], moodBefore: null, moodAfter: null, done: false, sec: 0 };
  S.sessions.unshift(s);
  save();
  screenMood('before', s);
}

function openSession(id) {
  const s = S.sessions.find((x) => x.id === id);
  if (!s) return screenTalk();
  if (s.done) return screenSummary(s.id);
  if (!remainingSec()) return screenLimit();
  if (s.moodBefore == null && !s.msgs.length) return screenMood('before', s);
  screenChat(s.id);
}

function screenMood(kind, s) {
  let v = kind === 'before' ? 5 : (s.moodBefore == null ? 5 : s.moodBefore);
  const out = h('div', { class: 'bigval' }, String(v));
  const range = h('input', { type: 'range', min: '0', max: '10', step: '1', value: String(v), 'aria-label': tx(kind === 'before' ? 'mood.q_before' : 'mood.q_after') });
  range.addEventListener('input', () => { v = Number(range.value); out.textContent = String(v); });
  const back = kind === 'before'
    ? () => { if (!s.msgs.length) { S.sessions = S.sessions.filter((x) => x.id !== s.id); save(); } screenTalk(); }
    : () => screenChat(s.id);
  page({ title: tx(kind === 'before' ? 'mood.title_before' : 'mood.title_after'), back },
    h('div', { class: 'card scale' },
      h('h2', null, tx(kind === 'before' ? 'mood.q_before' : 'mood.q_after')),
      out, range,
      h('div', { class: 'ends' }, h('span', null, '0 · ' + tx('mood.low')), h('span', null, tx('mood.high') + ' · 10'))),
    btn(tx(kind === 'before' ? 'mood.start' : 'mood.save'), () => {
      if (kind === 'before') { s.moodBefore = v; s.upd = Date.now(); save(); screenChat(s.id); }
      else { s.moodAfter = v; s.done = true; s.upd = Date.now(); save(); screenSummary(s.id); }
    })
  );
}

function screenSummary(id) {
  const s = S.sessions.find((x) => x.id === id);
  if (!s) return screenTalk();
  const b = s.moodBefore; const a = s.moodAfter;
  const diff = (a == null || b == null) ? null : a - b;
  page({ title: tx('mood.summary_title'), sub: sessionTitle(s), back: screenTalk, tab: 'talk' },
    h('div', { class: 'card' },
      b != null && a != null ? h('div', { class: 'cmp' },
        h('div', { class: 'n' }, h('b', null, b), h('span', null, tx('mood.before_label'))),
        h('span', { class: 'ar' }, ico('chev')),
        h('div', { class: 'n' }, h('b', null, a), h('span', null, tx('mood.after_label')))) : null,
      diff != null ? h('p', null, diff > 0 ? tx('mood.better') : diff === 0 ? tx('mood.same') : tx('mood.worse')) : null,
      h('p', { class: 'muted small' }, tx('mood.duration', { m: Math.max(1, Math.round((s.sec || 0) / 60)) }) + ' · ' + tx('talk.msgs', { n: s.msgs.length }))),
    h('div', { class: 'card teal' }, h('h2', null, tx('mood.step_title')), h('p', null, tx('mood.step'))),
    btn(tx('mood.to_record'), screenRecord),
    btn(tx('common.home'), screenHome, 'btn alt')
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
function stopVoice() {
  try { if (rec) rec.stop(); } catch (e) { /* ignore */ }
  try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
}

function triggerCrisis(id) {
  stopVoice();
  S.lock = { until: Date.now() + CONFIG.crisisLockHours * 3600 * 1000, reason: 'crisis' };
  S.needRetest = true;
  if (id) S.sessions = S.sessions.filter((x) => x.id !== id);
  save();
  route();
}

const clean = (t) => String(t).replace(/\*\*/g, '').replace(/^#+\s*/gm, '').replace(/\[\[RISK\]?\]?/g, '').trim();
function tidy(t) {
  const s = clean(t);
  if (!s || /[.!?…"”')]\s*$/.test(s)) return s;
  const m = s.match(/^[\s\S]*[.!?…]/);
  return m && m[0].length >= s.length * 0.5 ? m[0].trim() : s;
}

async function askAI(s, onDelta, stream) {
  const body = JSON.stringify({
    lang: lang(), mode: s.mode, topic: s.topic, age: s.age, mood: s.moodBefore, trauma: !!(S.trauma && S.trauma.flag),
    messages: s.msgs.slice(-14), stream,
  });
  const r = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body });
  const ct = r.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    const d = await r.json().catch(() => ({}));
    if (d.risk) return { risk: true };
    if (r.ok && d.reply) return { text: d.reply };
    return { error: true };
  }
  if (!r.ok || !r.body) return { error: true };
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += dec.decode(value, { stream: true });
    if (/\[\[RISK/.test(text)) return { risk: true };
    onDelta(text);
  }
  text += dec.decode();
  return { text };
}

function screenChat(id) {
  const s = S.sessions.find((x) => x.id === id);
  if (!s) return screenTalk();
  if (!remainingSec()) return screenLimit();
  const list = h('div', { class: 'msgs' });
  const input = h('textarea', { rows: '1', placeholder: tx('chat.placeholder'), 'aria-label': tx('chat.placeholder') });
  const sendBtn = h('button', { type: 'button', class: 'send', 'aria-label': tx('common.send') }, ico('send'));
  const mic = SR ? h('button', { type: 'button', class: 'mic', 'aria-label': tx('chat.mic') }, ico('mic')) : null;
  let busy = false;

  const avatar = () => h('span', { class: 'av' }, ico('spark'));
  const scroll = () => window.scrollTo(0, document.body.scrollHeight);

  const copyBtn = (text) => h('button', {
    type: 'button', class: 'copyb', 'aria-label': tx('common.copy'),
    onclick: (e) => {
      const b = e.currentTarget;
      try { navigator.clipboard.writeText(text); b.title = tx('common.copied'); b.style.color = 'var(--teal)'; setTimeout(() => { b.style.color = ''; }, 1200); } catch (err) { /* ignore */ }
    },
  }, ico('copy'));

  const row = (m) => (m.role === 'user'
    ? h('div', { class: 'mrow u' }, h('div', { class: 'b u' }, m.content))
    : h('div', { class: 'mrow' }, avatar(), h('div', { class: 'b a' }, m.content), copyBtn(m.content)));

  function paint() {
    list.replaceChildren();
    const intro = s.mode === 'past' ? tx('chat.intro_past') : tx('chat.intro_general');
    list.append(h('div', { class: 'mrow' }, avatar(), h('div', { class: 'b a' }, intro)));
    for (const m of s.msgs) list.append(row(m));
    if (!s.msgs.length) {
      const sts = tx(s.mode === 'past' ? 'talk.starters_past' : 'talk.starters_general');
      list.append(h('div', { class: 'starters' }, sts.map((t) => h('button', { type: 'button', class: 'chip', onclick: () => send(t) }, t))));
    }
  }

  async function send(prefill) {
    const text = (typeof prefill === 'string' ? prefill : input.value).trim();
    if (!text || busy) return;
    if (!remainingSec()) return screenLimit();
    if (rec) { try { rec.stop(); } catch (e) { /* ignore */ } }
    if (detectRisk(text)) return triggerCrisis(s.id);
    input.value = '';
    input.style.height = 'auto';
    s.msgs.push({ role: 'user', content: text });
    s.upd = Date.now();
    save();
    paint();
    busy = true;
    sendBtn.disabled = true;
    const bub = h('div', { class: 'b a' }, h('span', { class: 'dots' }, h('i'), h('i'), h('i')));
    list.append(h('div', { class: 'mrow' }, avatar(), bub));
    scroll();
    let got = false;
    const onDelta = (t) => { got = true; bub.textContent = clean(t); scroll(); };
    let res;
    try {
      res = await askAI(s, onDelta, true);
      if (!res.risk && !(res.text && clean(res.text))) res = await askAI(s, onDelta, false);
    } catch (e) {
      try { res = got ? { text: bub.textContent } : await askAI(s, onDelta, false); } catch (e2) { res = { error: true }; }
    }
    if (res.risk) return triggerCrisis(s.id);
    const final = res.text ? tidy(res.text) : '';
    if (final) {
      s.msgs.push({ role: 'assistant', content: final });
      s.upd = Date.now();
      save();
      paint();
      speak(final);
    } else {
      paint();
      list.append(h('div', { class: 'mrow' }, avatar(), h('div', { class: 'b a err' }, tx('chat.error'))));
    }
    busy = false;
    sendBtn.disabled = false;
    scroll();
  }

  sendBtn.addEventListener('click', () => send());
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
  input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 130) + 'px'; });
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

  const leftEl = h('span', { class: 'badge timepill' });
  const showLeft = () => { leftEl.textContent = tx('chat.remaining', { m: Math.ceil(remainingSec() / 60) }); };
  showLeft();
  let warned = remainingSec() <= 300;

  const voiceBtn = h('button', { type: 'button', class: 'abtn', 'aria-label': tx('chat.voice_out') });
  const paintVoice = () => { voiceBtn.replaceChildren(ico(S.voiceOut ? 'speaker' : 'speakeroff')); voiceBtn.title = S.voiceOut ? tx('chat.voice_on') : tx('chat.voice_off'); };
  paintVoice();
  voiceBtn.addEventListener('click', () => { S.voiceOut = !S.voiceOut; save(); paintVoice(); if (!S.voiceOut) { try { window.speechSynthesis.cancel(); } catch (e) { /* ignore */ } } });

  const endBtn = h('button', { type: 'button', class: 'abtn txt', onclick: () => {
    stopVoice();
    if (!s.msgs.some((m) => m.role === 'user')) { S.sessions = S.sessions.filter((x) => x.id !== s.id); save(); return screenTalk(); }
    return screenMood('after', s);
  } }, tx('chat.end'));

  page({ title: sessionTitle(s), sub: tx('chat.sub'), cls: 'chatwrap', back: () => { stopVoice(); screenTalk(); }, right: [voiceBtn, endBtn] },
    h('div', { style: 'display:flex;justify-content:center;gap:8px;flex-wrap:wrap' }, leftEl, h('span', { class: 'badge' }, tx('chat.badge'))),
    list);
  document.querySelector('.shell').append(h('div', { class: 'composer' }, h('div', { class: 'cbox' }, input, mic, sendBtn)));
  paint();
  window.scrollTo(0, document.body.scrollHeight);

  chatTimer = setInterval(() => {
    if (document.hidden) return;
    usedSec();
    S.usage.sec += 5;
    s.sec = (s.sec || 0) + 5;
    save();
    if (remainingSec() <= 0) { stopVoice(); return screenLimit(); }
    if (!warned && remainingSec() <= 300) {
      warned = true;
      list.append(h('div', { class: 'mrow', style: 'justify-content:center' }, h('div', { class: 'b note' }, tx('chat.five_left'))));
      scroll();
    }
    showLeft();
  }, 5000);
}

/* ---------- daily limit ---------- */
function screenLimit() {
  page({ title: tx('limit.title'), back: screenHome },
    h('div', { class: 'card soft' }, h('h2', null, tx('limit.title')), h('p', null, tx('limit.text'))),
    btn(tx('home.record_title'), screenRecord),
    btn(tx('common.home'), screenHome, 'btn alt'),
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
    return h('div', { class: 'card' },
      h('div', { class: 'muted xs' }, fmtDate(r.ts) + ' · ' + tx('record.traps.' + (r.trap || 'none'))),
      h('p', null, h('b', null, r.thought)),
      r.alt ? h('p', null, '→ ' + r.alt) : null,
      h('div', { class: 'muted xs' }, (r.before ?? '') + '% → ' + (r.after ?? '') + '%'),
      h('button', { type: 'button', class: 'link', onclick: () => { S.records.splice(realIdx, 1); save(); screenRecord(); } }, tx('common.delete'))
    );
  });

  page({ title: tx('record.title'), tab: 'record', gear: true },
    h('p', { class: 'muted' }, tx('record.intro')),
    h('div', { class: 'card' },
      field('situation', true), field('thought', true), field('emotion', false), slider('before'),
      h('label', { class: 'fld' }, h('span', null, tx('record.trap')), trap),
      field('for', true), field('against', true), field('alt', true), slider('after'),
      save1),
    h('h3', null, tx('record.list')),
    past.length ? past : h('p', { class: 'muted' }, tx('record.empty'))
  );
}

/* ---------- learn ---------- */
function screenLearn() {
  const keys = Object.keys(STR.tr.learn.items);
  page({ title: tx('learn.title'), tab: 'learn', gear: true },
    h('div', { class: 'card teal' }, h('h2', null, tx('learn.how_title')), h('p', null, tx('learn.how'))),
    h('h3', null, tx('learn.tech_title')),
    tx('learn.tech').map((t) => h('details', { class: 'acc' }, h('summary', null, t.t), h('div', { class: 'bd' }, h('p', null, t.d)))),
    h('h3', null, tx('learn.traps_title')),
    keys.map((k) => {
      const it = tx('learn.items.' + k);
      return h('details', { class: 'acc' },
        h('summary', null, tx('record.traps.' + k)),
        h('div', { class: 'bd' },
          h('p', null, it.d),
          h('div', { class: 'q-ex' }, h('span', { class: 'xs', style: 'display:block;font-style:normal;font-weight:700' }, tx('learn.ex')), it.ex),
          h('div', { class: 'q-ask' }, h('span', { class: 'xs muted', style: 'display:block;font-weight:700' }, tx('learn.ask')), it.q)));
    })
  );
}

/* ---------- progress ---------- */
function screenProgress() {
  const done = S.sessions.filter((s) => s.done && s.moodBefore != null && s.moodAfter != null).sort((a, b) => b.upd - a.upd);
  const avg = done.length ? (done.reduce((n, s) => n + (s.moodAfter - s.moodBefore), 0) / done.length) : null;
  const rows = [...S.tests].reverse().slice(0, 12).map((t) =>
    h('div', { class: 'card prow' },
      h('div', { class: 'muted xs' }, fmtDate(t.ts)),
      h('div', { class: 'lbl' }, tx('progress.mood') + ' ' + t.phq + '/27'),
      h('div', { class: 'meter' }, h('div', { class: 'fill m', style: 'width:' + Math.round((t.phq / 27) * 100) + '%' })),
      h('div', { class: 'lbl' }, tx('progress.anx') + ' ' + t.gad + '/21'),
      h('div', { class: 'meter' }, h('div', { class: 'fill a', style: 'width:' + Math.round((t.gad / 21) * 100) + '%' }))
    ));
  const moodRows = done.slice(0, 10).map((s) =>
    h('div', { class: 'card prow' },
      h('div', { class: 'row between' }, h('span', { class: 'lbl' }, sessionTitle(s)), h('span', { class: 'muted xs' }, fmtDay(s.upd))),
      h('div', { class: 'dual', style: 'margin:8px 8px 4px' },
        h('i', { class: 'b', style: 'left:' + s.moodBefore * 10 + '%' }), h('i', { class: 'a', style: 'left:' + s.moodAfter * 10 + '%' })),
      h('div', { class: 'row between muted xs' }, h('span', null, '0'), h('span', null, s.moodBefore + ' → ' + s.moodAfter), h('span', null, '10'))));
  page({ title: tx('progress.title'), tab: 'progress', gear: true },
    h('div', { class: 'stats' },
      h('div', { class: 'stat' }, h('b', null, done.length), h('span', null, tx('progress.stat_sessions'))),
      h('div', { class: 'stat' }, h('b', null, S.records.length), h('span', null, tx('progress.stat_records'))),
      h('div', { class: 'stat' }, h('b', null, avg == null ? '–' : (avg > 0 ? '+' : '') + avg.toFixed(1)), h('span', null, tx('progress.stat_avg')))),
    h('h3', null, tx('progress.mood_change')),
    moodRows.length ? moodRows : h('p', { class: 'muted' }, tx('progress.none_sessions')),
    h('h3', null, tx('progress.tests')),
    rows.length ? rows : h('p', { class: 'muted' }, tx('progress.empty')),
    h('p', { class: 'muted xs' }, tx('result.note_scores'))
  );
}

/* ---------- settings ---------- */
function screenSettings() {
  const voice = h('input', { type: 'checkbox' });
  voice.checked = !!S.voiceOut;
  voice.addEventListener('change', () => { S.voiceOut = voice.checked; save(); });
  const normal = S.lang && S.consent && !isLocked(S.lock) && S.tests.length && !S.needRetest;
  page({ title: tx('settings.title'), back: normal ? screenHome : route },
    h('h3', null, tx('settings.language')),
    h('div', { class: 'chips' },
      btn('Türkçe', () => { S.lang = 'tr'; save(); screenSettings(); }, 'chip' + (lang() === 'tr' ? ' on' : '')),
      btn('English', () => { S.lang = 'en'; save(); screenSettings(); }, 'chip' + (lang() === 'en' ? ' on' : ''))),
    h('label', { class: 'check' }, voice, h('span', null, tx('settings.voice'))),
    normal ? btn(tx('settings.retake'), screenCheckin, 'btn alt') : null,
    h('div', { class: 'card' }, h('h2', null, tx('settings.privacy_title')), h('p', { class: 'small' }, tx('settings.privacy'))),
    h('div', { class: 'card' }, h('h2', null, tx('settings.method_title')), h('p', { class: 'small' }, tx('settings.method'))),
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
    h('p', { class: 'muted xs' }, tx('settings.about'))
  );
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
}
route();
