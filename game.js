/* Тандем — интерфейс, сеть, ввод, отрисовка */
(function () {
'use strict';
const C = window.TC;
const { T, COLS, ROWS, HW, HH, BW, IN, HERO } = C;
const WW = COLS * T, WH = ROWS * T;
const Q = new URLSearchParams(location.search);
const $ = id => document.getElementById(id);
const TICK = 1000 / 60;
const NAME = HERO.map(h => h.name);

/* ================= прогресс ================= */
const SAVE = 'tandem-v1';
let prog = { best: {} };
try { const s = JSON.parse(localStorage.getItem(SAVE)); if (s && s.best) prog = s; } catch (e) {}
function saveProg() { try { localStorage.setItem(SAVE, JSON.stringify(prog)); } catch (e) {} }
function recordWin(lv, st, t) {
  const b = prog.best[lv];
  if (!b || st > b.s || (st === b.s && t < b.t)) prog.best[lv] = { s: Math.max(st, b ? b.s : 0), t: b ? Math.min(t, b.t) : t };
  saveProg();
}
let peerProg = {};
function isOpen(i) {
  if (Q.has('all') || i === 0) return true;
  return !!(prog.best[i - 1] || peerProg[i - 1]);
}
function bestOf(i) {
  const a = prog.best[i], b = peerProg[i];
  if (!a) return b; if (!b) return a;
  return a.s >= b.s ? a : b;
}

/* ================= транспорт ================= */
const LOCAL = Q.get('local') === '1';
const LAG = +(Q.get('lag') || 0), LOSS = +(Q.get('loss') || 0);
const PREFIX = 'tandem-v1-';
function loadScript(src) {
  return new Promise((ok, bad) => {
    if ([...document.scripts].some(s => s.src === src)) return ok();
    const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => bad(new Error('load')); document.head.appendChild(s);
  });
}
const rndCode = () => String(1000 + Math.floor(Math.random() * 9000));

function peerTransport() {
  let peer = null, conn = null, dead = false;
  const tr = { kind: 'peer' };
  const fail = (h, e) => {
    const t = e && e.type;
    if (t === 'peer-unavailable') h.error('Игра с таким кодом не найдена');
    else if (t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed') h.error('Нет связи с сервером. Проверь интернет');
    else if (t === 'browser-incompatible') h.error('Этот браузер не умеет играть по сети');
    else h.error('Ошибка сети: ' + (t || e));
  };
  const wire = (c, h) => {
    c.on('data', d => h.data(d));
    c.on('close', () => { if (!dead) h.close(); });
    c.on('error', () => { if (!dead) h.close(); });
  };
  tr.host = async (code, h) => {
    try { await loadScript('https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js'); } catch (e) { h.error('Не удалось загрузить сетевой модуль. Проверь интернет'); return; }
    const attempt = (c, n) => {
      peer = new Peer(PREFIX + c, { debug: 0 });
      peer.on('open', () => h.open(c));
      peer.on('error', e => {
        if (e.type === 'unavailable-id' && n < 6) { peer.destroy(); attempt(rndCode(), n + 1); }
        else fail(h, e);
      });
      peer.on('disconnected', () => { if (!dead && peer && !peer.destroyed) try { peer.reconnect(); } catch (e) {} });
      peer.on('connection', c2 => {
        if (conn && conn.open) { c2.on('open', () => c2.close()); return; }
        conn = c2;
        c2.on('open', () => h.conn());
        wire(c2, h);
      });
    };
    attempt(code, 0);
  };
  tr.join = async (code, h) => {
    try { await loadScript('https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js'); } catch (e) { h.error('Не удалось загрузить сетевой модуль. Проверь интернет'); return; }
    peer = new Peer({ debug: 0 });
    let opened = false;
    const to = setTimeout(() => { if (!opened && !dead) h.error('Игра с таким кодом не найдена'); }, 20000);
    peer.on('open', () => {
      conn = peer.connect(PREFIX + code, { serialization: 'json', reliable: false });
      conn.on('open', () => { opened = true; clearTimeout(to); h.conn(); });
      wire(conn, h);
    });
    peer.on('error', e => { clearTimeout(to); fail(h, e); });
  };
  tr.send = m => { if (conn && conn.open) try { conn.send(m); } catch (e) {} };
  tr.destroy = () => { dead = true; try { conn && conn.close(); } catch (e) {} try { peer && peer.destroy(); } catch (e) {} };
  return tr;
}

// второй транспорт для тестов: BroadcastChannel (вкладки/iframe одного origin)
function bcTransport() {
  const bc = new BroadcastChannel('tandem-local');
  const me = 'x' + Math.random().toString(36).slice(2, 9);
  let other = null, code = null, role = null, h = null, dead = false;
  const tr = { kind: 'bc' };
  const post = (m) => { if (!dead) bc.postMessage(m); };
  bc.onmessage = (ev) => {
    const m = ev.data; if (!m || dead) return;
    if (role === 'host') {
      if (m.t === 'probe' && m.code === code && m.from !== me) post({ t: 'taken', code, to: m.from });
      if (m.t === 'hello' && m.code === code && !other) { other = m.from; post({ t: 'welcome', to: other, from: me }); h.conn(); }
      else if (m.t === 'hello' && m.code === code && other === m.from) post({ t: 'welcome', to: other, from: me });
    }
    if (m.t === 'taken' && m.to === me && role === 'probing') role = 'taken';
    if (m.t === 'welcome' && m.to === me && role === 'join' && !other) { other = m.from; h.conn(); }
    if (m.t === 'd' && m.to === me && m.from === other) h.data(m.d);
    if (m.t === 'bye' && m.from === other && other) h.close();
  };
  tr.host = (c, hh) => {
    h = hh;
    const attempt = (cc, n) => {
      role = 'probing'; post({ t: 'probe', code: cc, from: me });
      setTimeout(() => {
        if (role === 'taken' && n < 6) attempt(rndCode(), n + 1);
        else { role = 'host'; code = cc; h.open(cc); }
      }, 250);
    };
    attempt(c, 0);
  };
  tr.join = (c, hh) => {
    h = hh; role = 'join'; code = c;
    let n = 0;
    const iv = setInterval(() => {
      if (other || dead) return clearInterval(iv);
      if (++n > 12) { clearInterval(iv); h.error('Игра с таким кодом не найдена'); return; }
      post({ t: 'hello', code: c, from: me });
    }, 250);
    post({ t: 'hello', code: c, from: me });
  };
  tr.send = (d) => {
    if (!other) return;
    if (LOSS && Math.random() < LOSS) return;
    const m = { t: 'd', to: other, from: me, d };
    if (LAG) setTimeout(() => post(m), LAG * (0.8 + Math.random() * 0.4)); else post(m);
  };
  tr.destroy = () => { if (other) post({ t: 'bye', from: me }); dead = true; setTimeout(() => bc.close(), 50); };
  addEventListener('pagehide', () => { if (!dead && other) post({ t: 'bye', from: me }); });
  return tr;
}
const makeTransport = () => LOCAL ? bcTransport() : peerTransport();

/* ================= ввод ================= */
const keys = new Set();
addEventListener('keydown', e => {
  if (e.target && e.target.tagName === 'INPUT') return;
  keys.add(e.code);
  if (G.scr === 'play' && /^(Arrow|Space)/.test(e.code)) e.preventDefault();
  if (e.code === 'Escape' && G.scr === 'play') togglePause();
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
const K1 = { l: ['KeyA'], r: ['KeyD'], u: ['KeyW', 'Space'], d: ['KeyS'], a: ['KeyE', 'KeyF', 'KeyQ'] };
const K2 = { l: ['ArrowLeft'], r: ['ArrowRight'], u: ['ArrowUp'], d: ['ArrowDown'], a: ['Enter', 'ShiftRight', 'Slash', 'Numpad0', 'Period', 'ControlRight'] };
const KALL = { l: [...K1.l, ...K2.l], r: [...K1.r, ...K2.r], u: [...K1.u, ...K2.u], d: [...K1.d, ...K2.d], a: [...K1.a, ...K2.a, 'ShiftLeft', 'KeyX', 'KeyK'] };
function keyBits(m) {
  const any = a => a.some(k => keys.has(k));
  return (any(m.l) ? IN.L : 0) | (any(m.r) ? IN.R : 0) | (any(m.u) ? IN.U : 0) | (any(m.d) ? IN.D : 0) | (any(m.a) ? IN.A : 0);
}
function padBits(n) {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const p = pads && [...pads].filter(Boolean)[n];
  if (!p) return 0;
  const b = i => p.buttons[i] && p.buttons[i].pressed;
  const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
  return ((ax < -0.4 || b(14)) ? IN.L : 0) | ((ax > 0.4 || b(15)) ? IN.R : 0) | ((b(0) || b(12)) ? IN.U : 0) | ((ay > 0.6 || b(13)) ? IN.D : 0) | ((b(1) || b(2) || b(3)) ? IN.A : 0);
}
// сенсорные зоны: tz[p] = {jx, jy (смещение), jump, act}
const TZ = [{ dx: 0, dy: 0, jump: 0, act: 0 }, { dx: 0, dy: 0, jump: 0, act: 0 }];
function touchBits(p) {
  const z = TZ[p];
  return (z.dx < -0.32 ? IN.L : 0) | (z.dx > 0.32 ? IN.R : 0) | ((z.jump || z.dy < -0.7) ? IN.U : 0) | (z.dy > 0.6 ? IN.D : 0) | (z.act ? IN.A : 0);
}
function readInput(p) {
  // p: 0/1 — игрок на этом устройстве (локальный режим), 'net' — единственный игрок
  if (window.TANDEM && TANDEM.force != null) return TANDEM.force;
  if (p === 'net') return keyBits(KALL) | padBits(0) | touchBits(0);
  return keyBits(p === 0 ? K1 : K2) | padBits(p) | touchBits(p);
}
function buildTouch(duo) {
  const root = $('touch'); root.innerHTML = ''; root.classList.toggle('duo', duo);
  const n = duo ? 2 : 1;
  for (let p = 0; p < n; p++) {
    const pc = duo ? p : G.me;
    const z = document.createElement('div'); z.className = 'tz p' + pc;
    z.innerHTML = `<div class="joyA"><div class="joyHint">${duo ? NAME[p] + '<br>' : ''}двигай пальцем</div><div class="joy"><div class="knob"></div></div></div>
      <div class="tb act"><span>✋</span>действие</div><div class="tb jump"><span>⤒</span>прыжок</div>`;
    root.appendChild(z);
    const st = TZ[duo ? p : 0];
    const joyA = z.querySelector('.joyA'), joy = z.querySelector('.joy'), knob = z.querySelector('.knob');
    let jid = null, ox = 0, oy = 0;
    joyA.addEventListener('pointerdown', e => {
      e.preventDefault(); if (jid !== null) return;
      jid = e.pointerId; joyA.setPointerCapture(jid);
      const r = joyA.getBoundingClientRect(); ox = e.clientX - r.left; oy = e.clientY - r.top;
      joy.style.left = ox + 'px'; joy.style.top = oy + 'px'; joy.classList.add('on'); knob.style.transform = '';
      st.dx = st.dy = 0;
    });
    const move = e => {
      if (e.pointerId !== jid) return;
      const r = joyA.getBoundingClientRect();
      let dx = e.clientX - r.left - ox, dy = e.clientY - r.top - oy;
      const R = 50, d = Math.hypot(dx, dy);
      if (d > R) { // плавающий джойстик: центр подтягивается за пальцем
        ox += dx - dx / d * R; oy += dy - dy / d * R; dx = dx / d * R; dy = dy / d * R;
        joy.style.left = ox + 'px'; joy.style.top = oy + 'px';
      }
      knob.style.transform = `translate(${dx}px,${dy}px)`;
      st.dx = dx / R; st.dy = dy / R;
    };
    const up = e => { if (e.pointerId !== jid) return; jid = null; joy.classList.remove('on'); st.dx = st.dy = 0; };
    joyA.addEventListener('pointermove', move);
    joyA.addEventListener('pointerup', up); joyA.addEventListener('pointercancel', up); joyA.addEventListener('lostpointercapture', up);
    for (const [cls, key] of [['jump', 'jump'], ['act', 'act']]) {
      const b = z.querySelector('.tb.' + cls); const ids = new Set();
      const on = e => { e.preventDefault(); ids.add(e.pointerId); try { b.setPointerCapture(e.pointerId); } catch (_) {} st[key] = 1; b.classList.add('on'); };
      const off = e => { ids.delete(e.pointerId); if (!ids.size) { st[key] = 0; b.classList.remove('on'); } };
      b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('lostpointercapture', off);
    }
  }
}
function markTouch() { document.body.classList.add('touch'); }
if (matchMedia('(pointer:coarse)').matches) markTouch();
addEventListener('touchstart', markTouch, { passive: true });

/* ================= состояние игры ================= */
const G = {
  scr: 'menu',       // menu | levels | lobby | join | wait | play
  mode: null,        // local | host | client
  me: 0,
  L: null, S: null,  // уровень и авторитетное состояние (хост/локально)
  epoch: 0,
  paused: false,
  tr: null, connected: false, lastRecv: 0,
  // хост
  q: [], ack: 0, remoteIn: 0, lastCmd: 0, peerRtt: 0,
  // клиент
  seq: 0, pending: [], hist: [], auth: null, P: null, snaps: [], lastK: -1, curE: -1, tOff: null,
  corr: { x: 0, y: 0 }, cmdId: 0, cmd: null, rtt: 0, pingT: 0,
  prevView: null, wonShown: false, botGen: null
};
window.TANDEM = { G, C, force: null, other: () => otherHero() };

function view() { return G.mode === 'client' ? G.P || G.auth : G.S; }
function statusState() { return G.mode === 'client' ? G.auth : G.S; }

function startLevel(lv) {
  if (lv >= C.LEVELS.length) { showLevels(); return; }
  G.L = C.level(lv); G.S = C.newState(lv); G.epoch++;
  G.paused = false; G.wonShown = false; G.prevView = null; particles.length = 0;
  buildStatic();
  enterPlay();
}
function enterPlay() {
  G.scr = 'play';
  show('game'); hideOvl();
  document.body.classList.add('playing');
  buildTouch(G.mode === 'local');
  resize();
  wakeLock(true);
}

/* ---------- хост: очередь ввода второго игрока ---------- */
function hostTakeRemote() {
  const q = G.q;
  while (q.length && q[0][0] <= G.ack) q.shift();
  if (q.length > 4) { // очередь растёт — догоняем, сохраняя нажатия прыжка/действия
    const drop = q.splice(0, q.length - 2);
    let edge = 0; for (const d of drop) edge |= d[1] & (IN.U | IN.A);
    q[0] = [q[0][0], q[0][1] | edge];
  }
  if (q.length) { const [s, i] = q.shift(); G.ack = s; G.remoteIn = i; }
  return G.remoteIn;
}
function hostOnData(m) {
  G.lastRecv = performance.now();
  if (!m) return;
  if (m.t === 'i') {
    for (const [s, i] of m.s) {
      if (s <= G.ack || G.q.some(e => e[0] === s)) continue;
      G.q.push([s, i]);
    }
    G.q.sort((a, b) => a[0] - b[0]);
    if (m.rt) G.peerRtt = m.rt;
    if (m.pt) G.pingEcho = m.pt;
    if (m.pr) peerProg = m.pr;
    if (m.c && m.c.id > G.lastCmd) { G.lastCmd = m.c.id; runCmd(m.c); }
  } else if (m.t === 'hi') {
    if (m.pr) peerProg = m.pr;
  }
}
function runCmd(c) {
  if (c.c === 'restart' && G.L) startLevel(G.L.idx);
  else if (c.c === 'next' && G.L) startLevel(G.L.idx + 1);
  else if (c.c === 'levels') showLevels();
  else if (c.c === 'lv' && isOpen(c.n)) startLevel(c.n);
}
function hostSend() {
  if (!G.tr || !G.connected) return;
  const base = { a: G.ack, ca: G.lastCmd, e: G.epoch, pe: G.pingEcho || 0 };
  if (G.scr === 'play' && G.S) G.tr.send(Object.assign({ t: 's', k: G.S.k, S: G.S }, base));
  else G.tr.send(Object.assign({ t: 'l', pr: prog.best }, base));
}

/* ---------- клиент: предсказание и сверка ---------- */
function clientOnData(m) {
  G.lastRecv = performance.now();
  if (!m) return;
  if (m.pe && m.pe === G.pingT) { G.rtt = Math.round(performance.now() - G.pingT); G.pingT = -1; }
  if (G.cmd && m.ca >= G.cmd.id) G.cmd = null;
  if (m.t === 'l') {
    if (m.pr) peerProg = m.pr;
    if (G.scr !== 'levels' || G.mode !== 'client') { G.auth = G.P = null; G.L = null; showLevels(); }
    return;
  }
  if (m.t !== 's') return;
  const S = m.S;
  if (m.e !== G.curE) { G.curE = m.e; G.snaps.length = 0; G.lastK = -1; G.auth = null; G.P = null; G.wonShown = false; G.prevView = null; particles.length = 0; }
  if (m.k <= G.lastK) return; // устаревший снимок
  G.lastK = m.k;
  if (!G.L || G.L.idx !== S.lv) { G.L = C.level(S.lv); buildStatic(); }
  if (G.scr !== 'play') enterPlay();
  const now = performance.now();
  const sample = m.k - now / TICK;
  G.tOff = G.tOff === null ? sample : Math.max(sample, G.tOff - 0.05);
  G.snaps.push({ k: m.k, h: S.h });
  if (G.snaps.length > 40) G.snaps.shift();
  // сверка своего героя
  const me = G.me, other = 1 - me;
  const before = G.P ? { x: G.P.h[me].x + G.corr.x, y: G.P.h[me].y + G.corr.y } : null;
  G.auth = S;
  G.pending = G.pending.filter(p => p[0] > m.a);
  if (S.st !== 'play') { G.P = structuredClone(S); G.corr.x = G.corr.y = 0; return; }
  const P = structuredClone(S);
  for (const [, inp] of G.pending) C.stepWorld(G.L, P, me === 0 ? [inp, 0] : [0, inp], other);
  G.P = P;
  if (before) {
    G.corr.x = before.x - P.h[me].x; G.corr.y = before.y - P.h[me].y;
    if (Math.hypot(G.corr.x, G.corr.y) > 90) G.corr.x = G.corr.y = 0;
  }
}
function clientTick() {
  if (G.scr !== 'play' || !G.P || !G.L) { clientSendIdle(); return; }
  const inp = G.paused ? 0 : readInput('net');
  G.seq++;
  G.pending.push([G.seq, inp]);
  if (G.pending.length > 180) G.pending.shift();
  G.hist.push([G.seq, inp]); if (G.hist.length > 5) G.hist.shift();
  const pkt = { t: 'i', s: G.hist.slice() };
  if (G.cmd) pkt.c = G.cmd;
  if (G.seq % 30 === 0) { G.pingT = performance.now(); pkt.pt = G.pingT; pkt.rt = G.rtt; }
  if (G.seq % 120 === 1) pkt.pr = prog.best;
  G.tr.send(pkt);
  if (G.auth && G.auth.st === 'play') C.stepWorld(G.L, G.P, G.me === 0 ? [inp, 0] : [0, inp], 1 - G.me);
}
let idleN = 0;
function clientSendIdle() {
  if (!G.tr || !G.connected) return;
  if (++idleN % 10) return;
  const pkt = { t: 'i', s: [] };
  if (G.cmd) pkt.c = G.cmd;
  if (idleN % 60 === 0) pkt.pr = prog.best;
  G.tr.send(pkt);
}
function sendCmd(c, n) {
  if (G.mode === 'client') { G.cmd = { id: ++G.cmdId, c, n }; }
  else runCmd({ c, n });
}
// позиция чужого героя с интерполяцией (~100 мс назад)
function otherHero() {
  const sn = G.snaps, o = 1 - G.me;
  if (!sn.length) return null;
  const rt = performance.now() / TICK + (G.tOff || 0) - 6;
  if (rt >= sn[sn.length - 1].k || sn.length === 1) return sn[sn.length - 1].h[o];
  for (let i = sn.length - 2; i >= 0; i--) {
    const a = sn[i], b = sn[i + 1];
    if (a.k <= rt) {
      const f = (rt - a.k) / (b.k - a.k), ha = a.h[o], hb = b.h[o];
      return Object.assign({}, hb, { x: ha.x + (hb.x - ha.x) * f, y: ha.y + (hb.y - ha.y) * f });
    }
  }
  return sn[0].h[o];
}

/* ---------- общий шаг ---------- */
function simTick() {
  if (G.mode === 'client') { clientTick(); checkLink(); return; }
  if (G.mode === 'host') checkLink();
  if (G.scr === 'play' && G.S) {
    if (window.TANDEM.hook) TANDEM.hook(G);
    const S = G.S;
    let ins;
    if (G.mode === 'local') {
      if (G.botGen) { const r = G.botGen.next(); ins = r.done ? [0, 0] : r.value; if (r.done) G.botGen = null; }
      else ins = [readInput(0), readInput(1)];
    } else ins = [readInput('net'), hostTakeRemote()];
    if (!(G.paused && G.mode === 'local')) C.stepWorld(G.L, S, ins);
    if (S.st === 'dead' && S.sT > 100) startLevel(G.L.idx);
  }
  if (G.mode === 'host') { G.hostN = (G.hostN || 0) + 1; if (G.scr === 'play' ? G.hostN % 2 === 0 : G.hostN % 15 === 0) hostSend(); }
}
function checkLink() {
  if (!G.connected) return;
  if (performance.now() - G.lastRecv > 5000) lostLink();
}
function lostLink() {
  if (!G.connected) return;
  G.connected = false;
  toast('Связь потеряна');
  showOvl(`<h2>Связь потеряна</h2><p class="res">Второй игрок отключился или пропал интернет.</p><div class="row"><button class="big" id="oMenu">В меню</button></div>`);
  $('oMenu').onclick = toMenu;
}

/* ================= главный цикл ================= */
let acc = 0, last = performance.now(), lastFrame = 0;
function advance(now) {
  let dt = now - last; last = now;
  if (dt > 250) dt = 250; if (dt < 0) dt = 0;
  acc += dt;
  let n = 0;
  while (acc >= TICK && n < 20) { acc -= TICK; simTick(); n++; }
}
function frame(now) {
  requestAnimationFrame(frame);
  lastFrame = now;
  advance(now);
  if (G.scr === 'play') render(now); else drawBg(now);
  if (G.scr === 'menu') drawHeroPrev(now);
}
requestAnimationFrame(frame);
setInterval(() => { const n = performance.now(); if (n - lastFrame > 150) advance(n); }, 50);

/* ================= отрисовка ================= */
const cv = $('cv'), ctx = cv.getContext('2d');
let DPR = 1, SC = 1, OX = 0, OY = 0, CW = 0, CH = 0;
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  CW = innerWidth; CH = innerHeight;
  cv.width = Math.round(CW * DPR); cv.height = Math.round(CH * DPR);
  SC = Math.min(CW / WW, CH / WH);
  OX = (CW - WW * SC) / 2; OY = (CH - WH * SC) / 2;
  const b = $('bgfx'); b.width = Math.round(CW * DPR); b.height = Math.round(CH * DPR);
  if (G.L) buildStatic();
}
addEventListener('resize', resize);

const THEMES = [
  { h: 252, s: 22, l: 26, acc: '#b49cff', bg: ['#1b1440', '#0a0918'] },
  { h: 205, s: 20, l: 25, acc: '#7fd6ff', bg: ['#0f2038', '#070c18'] },
  { h: 188, s: 24, l: 27, acc: '#a8f6ff', bg: ['#0d2a36', '#06111a'] },
  { h: 30, s: 26, l: 26, acc: '#ffc27a', bg: ['#2b1a10', '#100906'] },
  { h: 150, s: 18, l: 23, acc: '#8fffb4', bg: ['#0e2a20', '#06120c'] },
  { h: 315, s: 18, l: 24, acc: '#ff9ce0', bg: ['#2a1030', '#110614'] },
  { h: 212, s: 26, l: 30, acc: '#cfeeff', bg: ['#16283f', '#080f1c'] },
  { h: 12, s: 26, l: 22, acc: '#ffb07a', bg: ['#2e120c', '#120605'] }
];
const CHC = ['#ffffff', '#ffb43a', '#c27cff', '#3fe6c8', '#ff6aa8', '#9cff6a', '#6aa8ff', '#fff27a'];
function hash(a, b) { let x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); }

let stat = null; // статичный слой уровня
function buildStatic() {
  const L = G.L; if (!L) return;
  const s = SC * DPR;
  stat = stat || document.createElement('canvas');
  stat.width = Math.max(1, Math.round(WW * s)); stat.height = Math.max(1, Math.round(WH * s));
  const c = stat.getContext('2d');
  c.setTransform(s, 0, 0, s, 0, 0);
  drawLevelBase(c, L, false);
}
function drawLevelBase(c, L, mini) {
  const th = THEMES[L.theme % THEMES.length];
  const g = c.createLinearGradient(0, 0, 0, WH); g.addColorStop(0, th.bg[0]); g.addColorStop(1, th.bg[1]);
  c.fillStyle = g; c.fillRect(0, 0, WW, WH);
  if (!mini) {
    // дальняя кладка и светящиеся пятна
    c.globalAlpha = 0.07; c.strokeStyle = th.acc; c.lineWidth = 1;
    for (let y = 0; y < WH; y += 24) {
      c.beginPath(); c.moveTo(0, y); c.lineTo(WW, y); c.stroke();
      for (let x = ((y / 24) % 2) * 24; x < WW; x += 48) { c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 24); c.stroke(); }
    }
    c.globalAlpha = 1;
    for (let i = 0; i < 7; i++) {
      const x = hash(i, L.idx) * WW, y = hash(L.idx, i + 3) * WH, r = 120 + hash(i, 9) * 220;
      const rg = c.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, th.acc + '22'); rg.addColorStop(1, th.acc + '00');
      c.fillStyle = rg; c.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // далёкие кристаллические шпили
    for (let i = 0; i < 14; i++) {
      const x = hash(i * 3, L.idx + 1) * WW, h = 60 + hash(i, L.idx + 7) * 160, w = 10 + hash(i, 2) * 18;
      c.fillStyle = th.acc + '10';
      c.beginPath(); c.moveTo(x - w, WH - 64); c.lineTo(x, WH - 64 - h); c.lineTo(x + w, WH - 64); c.fill();
    }
  }
  const solid = (cc, r) => cc < 0 || cc >= COLS || r < 0 || r >= ROWS || L.g[r * COLS + cc] === '#';
  for (let r = 0; r < ROWS; r++) for (let cc = 0; cc < COLS; cc++) {
    if (L.g[r * COLS + cc] !== '#') continue;
    const x = cc * T, y = r * T, v = hash(cc, r);
    const l = th.l + (v - 0.5) * 6;
    const gg = c.createLinearGradient(0, y, 0, y + T);
    gg.addColorStop(0, `hsl(${th.h},${th.s}%,${l + 6}%)`); gg.addColorStop(1, `hsl(${th.h},${th.s}%,${l - 5}%)`);
    c.fillStyle = gg; c.fillRect(x, y, T, T);
    if (!mini) {
      c.strokeStyle = `hsla(${th.h},${th.s}%,${th.l - 14}%,.55)`; c.lineWidth = 1;
      c.beginPath(); c.moveTo(x, y + 16.5); c.lineTo(x + T, y + 16.5);
      const o = (r % 2) ? 8 : 24; c.moveTo(x + o + .5, y); c.lineTo(x + o + .5, y + 16); c.moveTo(x + ((o + 16) % 32) + .5, y + 16); c.lineTo(x + ((o + 16) % 32) + .5, y + 32);
      c.stroke();
      if (v > 0.8) { c.fillStyle = `hsla(${th.h},${th.s}%,${th.l + 14}%,.25)`; c.fillRect(x + 4 + v * 10, y + 5, 3, 3); }
    }
    if (!solid(cc, r - 1)) { // верхняя кромка — светится
      c.fillStyle = `hsl(${th.h},${th.s + 10}%,${th.l + 22}%)`; c.fillRect(x, y, T, 3);
      if (!mini) { const eg = c.createLinearGradient(0, y - 8, 0, y + 2); eg.addColorStop(0, th.acc + '00'); eg.addColorStop(1, th.acc + '55'); c.fillStyle = eg; c.fillRect(x, y - 8, T, 10); }
    }
    if (!solid(cc, r + 1)) { c.fillStyle = 'rgba(0,0,0,.45)'; c.fillRect(x, y + T - 3, T, 3); }
    if (!solid(cc - 1, r)) { c.fillStyle = 'rgba(255,255,255,.08)'; c.fillRect(x, y, 2, T); }
    if (!solid(cc + 1, r)) { c.fillStyle = 'rgba(0,0,0,.3)'; c.fillRect(x + T - 2, y, 2, T); }
  }
  if (!mini) {
    c.font = '600 15px "Trebuchet MS",system-ui,sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const [x, y, txt] of L.texts) {
      c.fillStyle = 'rgba(0,0,0,.5)'; c.fillText(txt, x * T + 1, y * T + 1);
      c.fillStyle = 'rgba(235,235,255,.62)'; c.fillText(txt, x * T, y * T);
    }
    // виньетка
    const vg = c.createRadialGradient(WW / 2, WH / 2, WH * 0.4, WW / 2, WH / 2, WW * 0.65);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.45)');
    c.fillStyle = vg; c.fillRect(0, 0, WW, WH);
  }
}

const LIQ = {
  L: { top: '#ffe07a', mid: '#ff6a1f', bot: '#9a160b', glow: 'rgba(255,110,30,', bub: '#ffd060' },
  W: { top: '#b4f0ff', mid: '#2f8fe0', bot: '#103682', glow: 'rgba(80,180,255,', bub: '#d8f8ff' },
  A: { top: '#e2ff7a', mid: '#58cc28', bot: '#174f10', glow: 'rgba(140,255,60,', bub: '#eaff9a' }
};
function drawTiles(c, L, S, t) {
  for (let r = 0; r < ROWS; r++) {
    let cc = 0;
    while (cc < COLS) {
      const ch = C.tile(L, S, cc, r);
      if (LIQ[ch]) {
        let e = cc; while (e + 1 < COLS && C.tile(L, S, e + 1, r) === ch) e++;
        drawLiquid(c, ch, cc * T, (e + 1) * T, r * T, t);
        cc = e + 1; continue;
      }
      const x = cc * T, y = r * T;
      if (ch === 'I') {
        const g = c.createLinearGradient(x, y, x + T, y + T);
        g.addColorStop(0, 'rgba(225,250,255,.92)'); g.addColorStop(1, 'rgba(110,195,240,.8)');
        c.fillStyle = g; c.fillRect(x + 1, y + 1, T - 2, T - 2);
        c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 1.5; c.strokeRect(x + 1.5, y + 1.5, T - 3, T - 3);
        c.fillStyle = 'rgba(255,255,255,.55)'; c.beginPath(); c.moveTo(x + 5, y + 22); c.lineTo(x + 20, y + 5); c.lineTo(x + 25, y + 5); c.lineTo(x + 9, y + 24); c.fill();
      } else if (ch === 'F') {
        const g = c.createLinearGradient(0, y, 0, y + T);
        g.addColorStop(0, '#f0fdff'); g.addColorStop(0.25, '#bdeefc'); g.addColorStop(1, '#5fb4e6');
        c.fillStyle = g; c.fillRect(x, y, T, T);
        c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 1;
        c.beginPath(); const v = hash(cc, r);
        c.moveTo(x + 4 + v * 8, y + 4); c.lineTo(x + 14, y + 16); c.lineTo(x + 10 + v * 12, y + 28); c.moveTo(x + 14, y + 16); c.lineTo(x + 26, y + 12); c.stroke();
        c.fillStyle = '#ffffff'; c.fillRect(x, y, T, 2);
      } else if (ch === '=') {
        const g = c.createLinearGradient(0, y, 0, y + 10);
        g.addColorStop(0, '#c99a5c'); g.addColorStop(1, '#6b4422');
        c.fillStyle = g; c.fillRect(x, y, T, 9);
        c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(x + T - 1, y, 1, 9);
        c.fillStyle = '#e8c48a'; c.fillRect(x + 6, y + 3, 2, 2); c.fillRect(x + 24, y + 3, 2, 2);
      }
      cc++;
    }
  }
}
function drawLiquid(c, ch, x0, x1, y, t) {
  const P = LIQ[ch], top = y + 8;
  c.beginPath();
  c.moveTo(x0, y + T);
  for (let x = x0; x <= x1; x += 4) c.lineTo(x, top + Math.sin(t * 2.4 + x * 0.06) * 1.8 + Math.sin(t * 1.3 + x * 0.13) * 1.2);
  c.lineTo(x1, y + T); c.closePath();
  const g = c.createLinearGradient(0, top, 0, y + T);
  g.addColorStop(0, P.top); g.addColorStop(0.3, P.mid); g.addColorStop(1, P.bot);
  c.fillStyle = g; c.fill();
  // свечение над поверхностью
  c.save(); c.globalCompositeOperation = 'lighter';
  const gg = c.createLinearGradient(0, top - 26, 0, top + 6);
  gg.addColorStop(0, P.glow + '0)'); gg.addColorStop(1, P.glow + (ch === 'W' ? '.22)' : '.38)'));
  c.fillStyle = gg; c.fillRect(x0, top - 26, x1 - x0, 32);
  // пузырьки / блики
  c.fillStyle = P.bub;
  for (let x = x0 + 6; x < x1; x += 11) {
    const ph = (t * (ch === 'W' ? 0.5 : 0.8) + hash(x, y) * 7) % 1;
    const by = y + T - 4 - ph * 20, bx = x + Math.sin(t * 3 + x) * 2;
    c.globalAlpha = (1 - ph) * (ch === 'W' ? 0.35 : 0.6);
    c.beginPath(); c.arc(bx, by, ch === 'W' ? 1.4 : 2, 0, 7); c.fill();
  }
  c.globalAlpha = 1; c.restore();
}

function drawObjects(c, L, S, t) {
  // выходы
  for (let i = 0; i < 2; i++) {
    const ex = L.exits[i], x = ex.x * T + 16, y = (ex.y + 1) * T - 30;
    const on = S.h[i].ex, col = i ? '#3fb6ff' : '#ff7a2f', col2 = i ? '#a8f4ff' : '#ffd36b';
    c.save(); c.globalCompositeOperation = 'lighter';
    const rg = c.createRadialGradient(x, y, 2, x, y, on ? 60 : 42);
    rg.addColorStop(0, col + (on ? 'aa' : '55')); rg.addColorStop(1, col + '00');
    c.fillStyle = rg; c.fillRect(x - 64, y - 64, 128, 128);
    c.restore();
    c.save(); c.translate(x, y);
    c.fillStyle = 'rgba(5,4,15,.75)'; c.beginPath(); c.ellipse(0, 0, 14, 28, 0, 0, 7); c.fill();
    c.lineWidth = 3.5; c.strokeStyle = col2; c.shadowColor = col; c.shadowBlur = on ? 18 : 8;
    c.beginPath(); c.ellipse(0, 0, 15, 29, 0, 0, 7); c.stroke();
    c.shadowBlur = 0;
    // вращающиеся искры по кольцу
    for (let k = 0; k < 6; k++) {
      const a = t * (on ? 3 : 1.4) + k * Math.PI / 3;
      c.fillStyle = col2; c.globalAlpha = 0.8; c.beginPath(); c.arc(Math.cos(a) * 15, Math.sin(a) * 29, 1.8, 0, 7); c.fill();
    }
    c.globalAlpha = 1;
    c.scale(0.9, 0.9);
    if (i === 0) symFlame(c, 0, 4, col2, t); else symDrop(c, 0, 4, col2);
    c.restore();
  }
  // кнопки
  for (let k = 0; k < L.buttons.length; k++) {
    const b = L.buttons[k], x = b.x * T, y = b.y * T, on = S.bt[k], col = CHC[b.ch];
    c.fillStyle = '#1a1826'; c.fillRect(x + 2, y + 27, 28, 5);
    if (on) { c.save(); c.globalCompositeOperation = 'lighter'; const rg = c.createRadialGradient(x + 16, y + 28, 0, x + 16, y + 28, 30); rg.addColorStop(0, col + '88'); rg.addColorStop(1, col + '00'); c.fillStyle = rg; c.fillRect(x - 14, y, 60, 34); c.restore(); }
    c.fillStyle = col; c.fillRect(x + 5, y + (on ? 25 : 21), 22, on ? 3 : 6);
    c.fillStyle = 'rgba(255,255,255,.5)'; c.fillRect(x + 5, y + (on ? 25 : 21), 22, 1.5);
  }
  // рычаги
  for (let k = 0; k < L.levers.length; k++) {
    const lv = L.levers[k], x = lv.x * T + 16, y = lv.y * T + 30, on = S.v[k], col = CHC[lv.ch];
    const a = on ? 0.65 : -0.65;
    c.strokeStyle = '#c9c4dc'; c.lineWidth = 3; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x, y - 3); c.lineTo(x + Math.sin(a) * 20, y - 3 - Math.cos(a) * 20); c.stroke();
    c.fillStyle = col; c.shadowColor = col; c.shadowBlur = on ? 14 : 4;
    c.beginPath(); c.arc(x + Math.sin(a) * 20, y - 3 - Math.cos(a) * 20, 4.5, 0, 7); c.fill(); c.shadowBlur = 0;
    c.fillStyle = '#3a3650'; c.beginPath(); c.arc(x, y + 2, 9, Math.PI, 0); c.fill();
    c.fillStyle = col; c.globalAlpha = on ? 1 : 0.35; c.fillRect(x - 6, y - 1, 12, 2); c.globalAlpha = 1;
  }
  // двери
  for (let k = 0; k < L.doors.length; k++) {
    const d = L.doors[k], r = C.doorRect(L, S, k), col = CHC[d.ch];
    c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(d.x * T, d.y * T, d.w * T, 4);
    if (r.h < 1) continue;
    const g = c.createLinearGradient(r.x, 0, r.x + r.w, 0);
    g.addColorStop(0, '#2b2840'); g.addColorStop(0.5, '#5a5578'); g.addColorStop(1, '#2b2840');
    c.fillStyle = g; c.fillRect(r.x + 3, r.y, r.w - 6, r.h);
    c.fillStyle = 'rgba(0,0,0,.3)';
    for (let yy = r.y + 10; yy < r.y + r.h - 4; yy += 16) c.fillRect(r.x + 3, yy, r.w - 6, 2);
    c.fillStyle = col; c.shadowColor = col; c.shadowBlur = 10;
    c.fillRect(r.x + 3, r.y + r.h - 5, r.w - 6, 4);
    c.fillRect(r.x + r.w / 2 - 2, r.y + 4, 4, Math.max(0, r.h - 12));
    c.shadowBlur = 0;
  }
  // платформы
  for (let k = 0; k < L.plats.length; k++) {
    const pd = L.plats[k], p = S.p[k], w = pd.w * T, col = pd.ch >= 0 ? CHC[pd.ch] : '#d8d4ff';
    c.save(); c.globalCompositeOperation = 'lighter';
    for (const fx of [10, w - 10]) {
      const rg = c.createRadialGradient(p.x + fx, p.y + 14, 0, p.x + fx, p.y + 14, 14 + Math.sin(t * 20 + k) * 2);
      rg.addColorStop(0, col + 'cc'); rg.addColorStop(1, col + '00'); c.fillStyle = rg; c.fillRect(p.x + fx - 16, p.y, 32, 32);
    }
    c.restore();
    const g = c.createLinearGradient(0, p.y, 0, p.y + 12);
    g.addColorStop(0, '#e8e4ff'); g.addColorStop(0.4, '#8c86b0'); g.addColorStop(1, '#3c3858');
    c.fillStyle = g; c.fillRect(p.x, p.y, w, 12);
    c.fillStyle = col; c.fillRect(p.x + 4, p.y + 5, w - 8, 2);
  }
  // ящики
  for (const b of S.b) {
    const x = b.x, y = b.y;
    const g = c.createLinearGradient(x, y, x, y + BW); g.addColorStop(0, '#c48a4a'); g.addColorStop(1, '#7d4d22');
    c.fillStyle = g; c.fillRect(x, y, BW, BW);
    c.strokeStyle = '#4a2a10'; c.lineWidth = 2; c.strokeRect(x + 1, y + 1, BW - 2, BW - 2);
    c.strokeStyle = 'rgba(74,42,16,.8)'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(x + 4, y + 4); c.lineTo(x + BW - 4, y + BW - 4); c.stroke();
    c.fillStyle = 'rgba(255,230,180,.25)'; c.fillRect(x + 2, y + 2, BW - 4, 2);
    c.fillStyle = '#3a2410'; for (const [a, bb] of [[4, 4], [BW - 6, 4], [4, BW - 6], [BW - 6, BW - 6]]) c.fillRect(x + a, y + bb, 2, 2);
  }
  // кристаллы
  for (let k = 0; k < L.crystals.length; k++) {
    if (S.c[k]) continue;
    const cr = L.crystals[k], x = cr.x * T + 16, y = cr.y * T + 16 + Math.sin(t * 2.5 + k) * 3;
    const col = cr.k ? '#4fc8ff' : '#ff7a2f', col2 = cr.k ? '#d8fbff' : '#ffe08a';
    c.save(); c.globalCompositeOperation = 'lighter';
    const rg = c.createRadialGradient(x, y, 0, x, y, 22); rg.addColorStop(0, col + 'aa'); rg.addColorStop(1, col + '00');
    c.fillStyle = rg; c.fillRect(x - 22, y - 22, 44, 44); c.restore();
    const sx = 0.45 + Math.abs(Math.cos(t * 1.8 + k)) * 0.55;
    c.save(); c.translate(x, y); c.scale(sx, 1);
    const g = c.createLinearGradient(-8, -10, 8, 10); g.addColorStop(0, col2); g.addColorStop(0.5, col); g.addColorStop(1, cr.k ? '#1a5fb0' : '#a32a0c');
    c.fillStyle = g; c.beginPath(); c.moveTo(0, -11); c.lineTo(8, -2); c.lineTo(0, 11); c.lineTo(-8, -2); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 1; c.stroke();
    c.fillStyle = 'rgba(255,255,255,.7)'; c.beginPath(); c.moveTo(0, -11); c.lineTo(3, -2); c.lineTo(0, 2); c.lineTo(-3, -2); c.fill();
    c.restore();
  }
}
function symFlame(c, x, y, col, t) {
  c.fillStyle = col; c.beginPath();
  const f = Math.sin(t * 9) * 1.5;
  c.moveTo(x, y - 14 + f); c.quadraticCurveTo(x + 10, y - 2, x + 6, y + 6); c.quadraticCurveTo(x, y + 11, x - 6, y + 6); c.quadraticCurveTo(x - 10, y - 2, x, y - 14 + f); c.fill();
  c.fillStyle = 'rgba(255,255,255,.75)'; c.beginPath(); c.moveTo(x, y - 4); c.quadraticCurveTo(x + 4, y + 2, x, y + 6); c.quadraticCurveTo(x - 4, y + 2, x, y - 4); c.fill();
}
function symDrop(c, x, y, col) {
  c.fillStyle = col; c.beginPath(); c.moveTo(x, y - 14); c.bezierCurveTo(x + 4, y - 6, x + 9, y - 1, x + 9, y + 3); c.arc(x, y + 3, 9, 0, Math.PI); c.bezierCurveTo(x - 9, y - 1, x - 4, y - 6, x, y - 14); c.fill();
  c.fillStyle = 'rgba(255,255,255,.7)'; c.beginPath(); c.ellipse(x - 3, y + 1, 2.2, 3.5, -0.4, 0, 7); c.fill();
}

/* ---------- герои ---------- */
const vis = [{ sq: 0, g: 1, bl: 0 }, { sq: 0, g: 1, bl: 0 }];
function drawHero(c, i, h, t, me) {
  const v = vis[i];
  if (h.g && !v.g && h.vy >= 0) v.sq = 0.28;
  v.g = h.g; v.sq *= 0.85;
  const cx = h.x + HW / 2, base = h.y + HH;
  const st = Math.max(-0.16, Math.min(0.22, -h.vy * 0.022));
  const sy = 1 + st - v.sq, sx = 1 / Math.max(0.6, sy);
  const run = h.g ? Math.sin(t * 18) * Math.min(1, Math.abs(h.vx) / 3) : 0;
  const by = base - Math.abs(run) * 1.5;
  c.save();
  c.globalCompositeOperation = 'lighter';
  const glow = i ? 'rgba(70,170,255,' : 'rgba(255,120,30,';
  const rg = c.createRadialGradient(cx, by - 14, 0, cx, by - 14, 40);
  rg.addColorStop(0, glow + '.45)'); rg.addColorStop(1, glow + '0)');
  c.fillStyle = rg; c.fillRect(cx - 40, by - 54, 80, 80);
  c.restore();
  // тень
  c.fillStyle = 'rgba(0,0,0,.3)'; c.beginPath(); c.ellipse(cx, base + 1, 10 * sx, 2.5, 0, 0, 7); c.fill();
  if (i === 0) {
    // язычки пламени
    for (let k = -1; k <= 1; k++) {
      const bx = cx + k * 5 * sx, tipx = cx + k * 5 + Math.sin(t * 13 + k * 2) * 2 - h.vx * 1.3, tipy = by - 24 * sy - (k === 0 ? 14 : 8) + Math.sin(t * 17 + k) * 2.5;
      const fg = c.createLinearGradient(0, tipy, 0, by - 14 * sy);
      fg.addColorStop(0, 'rgba(255,240,150,0)'); fg.addColorStop(0.4, '#ffd34a'); fg.addColorStop(1, '#ff6a1a');
      c.fillStyle = fg; c.beginPath();
      c.moveTo(bx - 5, by - 16 * sy); c.quadraticCurveTo(bx - 4, tipy + 8, tipx, tipy); c.quadraticCurveTo(bx + 4, tipy + 8, bx + 5, by - 16 * sy); c.fill();
    }
    const g = c.createRadialGradient(cx - 3, by - 16 * sy, 1, cx, by - 12 * sy, 15);
    g.addColorStop(0, '#fff7c8'); g.addColorStop(0.35, '#ffb032'); g.addColorStop(0.75, '#ff5a1a'); g.addColorStop(1, '#a8200c');
    c.fillStyle = g; c.beginPath(); c.ellipse(cx, by - 12 * sy, 11.5 * sx, 12.5 * sy, 0, 0, 7); c.fill();
    // трещинки-угольки
    c.strokeStyle = 'rgba(120,20,0,.55)'; c.lineWidth = 1.2; c.beginPath();
    c.moveTo(cx - 8 * sx, by - 6 * sy); c.lineTo(cx - 4 * sx, by - 4 * sy); c.lineTo(cx - 5 * sx, by - 1 * sy);
    c.moveTo(cx + 7 * sx, by - 5 * sy); c.lineTo(cx + 3 * sx, by - 3 * sy); c.stroke();
  } else {
    const tipx = cx - h.vx * 1.4, tipy = by - 31 * sy;
    const g = c.createRadialGradient(cx - 4, by - 15 * sy, 1, cx, by - 11 * sy, 17);
    g.addColorStop(0, '#f0ffff'); g.addColorStop(0.4, '#66d4ff'); g.addColorStop(0.85, '#1f7fe0'); g.addColorStop(1, '#1650b0');
    c.fillStyle = g; c.beginPath();
    c.moveTo(tipx, tipy);
    c.bezierCurveTo(cx + 4 * sx, tipy + 9, cx + 12 * sx, by - 19 * sy, cx + 11.5 * sx, by - 11 * sy);
    c.arc(cx, by - 11 * sy, 11.5 * sx, 0, Math.PI);
    c.bezierCurveTo(cx - 12 * sx, by - 19 * sy, cx - 4 * sx, tipy + 9, tipx, tipy);
    c.fill();
    c.strokeStyle = 'rgba(200,250,255,.6)'; c.lineWidth = 1; c.stroke();
    c.fillStyle = 'rgba(255,255,255,.75)'; c.beginPath(); c.ellipse(cx - 5 * sx, by - 17 * sy, 2.5, 4.5, -0.5, 0, 7); c.fill();
  }
  // глаза (моргают)
  v.bl = (v.bl + 1) % 240;
  const blink = v.bl > 232 ? 0.15 : 1;
  const ey = by - (i ? 11 : 13) * sy, f = h.f || 1;
  for (const s of [-1, 1]) {
    const ex = cx + f * 2.5 + s * 4.2 * sx;
    c.fillStyle = '#fff'; c.beginPath(); c.ellipse(ex, ey, 3, 4 * blink, 0, 0, 7); c.fill();
    if (blink > 0.5) { c.fillStyle = i ? '#062a55' : '#3a0a00'; c.beginPath(); c.arc(ex + f * 1.1, ey + 0.6, 1.8, 0, 7); c.fill(); }
  }
  if (me) {
    const col = i ? '#8ff3ff' : '#ffcf4a', yy = h.y - 22 + Math.sin(t * 4) * 2;
    c.fillStyle = col; c.beginPath(); c.moveTo(cx - 5, yy); c.lineTo(cx + 5, yy); c.lineTo(cx, yy + 6); c.fill();
  }
  c.restore && 0;
}

/* ---------- частицы ---------- */
const particles = [];
function emit(x, y, n, o) {
  for (let k = 0; k < n; k++) {
    const a = (o.a !== undefined ? o.a : Math.random() * Math.PI * 2) + (Math.random() - 0.5) * (o.spread || 6.3);
    const sp = (o.sp || 2) * (0.4 + Math.random() * 0.8);
    particles.push({ x: x + (Math.random() - 0.5) * (o.w || 0), y: y + (Math.random() - 0.5) * (o.h || 0), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0,
      max: (o.life || 40) * (0.6 + Math.random() * 0.6), col: o.cols ? o.cols[k % o.cols.length] : o.col, sz: (o.sz || 2.5) * (0.6 + Math.random() * 0.8), g: o.g || 0, add: o.add !== false, fr: o.fr || 0.98 });
  }
  if (particles.length > 900) particles.splice(0, particles.length - 900);
}
function drawParticles(c) {
  for (let k = particles.length - 1; k >= 0; k--) {
    const p = particles[k];
    p.life++; p.x += p.vx; p.y += p.vy; p.vy += p.g; p.vx *= p.fr; p.vy *= p.fr;
    if (p.life > p.max) { particles.splice(k, 1); continue; }
  }
  c.save();
  for (const add of [false, true]) {
    c.globalCompositeOperation = add ? 'lighter' : 'source-over';
    for (const p of particles) {
      if (p.add !== add) continue;
      const a = 1 - p.life / p.max;
      c.globalAlpha = a; c.fillStyle = p.col;
      c.beginPath(); c.arc(p.x, p.y, p.sz * (add ? 1 : 0.6 + (1 - a) * 1.4), 0, 7); c.fill();
    }
  }
  c.restore();
}
// эффекты из разницы состояний
function diffFx(L, prev, cur, heroes) {
  if (!prev) return;
  for (let k = 0; k < L.crystals.length; k++) if (cur.c[k] && !prev.c[k]) {
    const cr = L.crystals[k];
    emit(cr.x * T + 16, cr.y * T + 16, 26, { cols: cr.k ? ['#4fc8ff', '#d8fbff', '#ffffff'] : ['#ff7a2f', '#ffe08a', '#ffffff'], sp: 3.2, life: 40, sz: 2.4 });
    sfx(cr.k ? 'gemw' : 'gemf');
  }
  for (const id in cur.m) if (prev.m[id] !== cur.m[id]) {
    const x = (id % COLS) * T + 16, y = Math.floor(id / COLS) * T + 16;
    if (cur.m[id] === '.') { emit(x, y, 14, { col: 'rgba(230,240,255,.7)', sp: 1.2, a: -Math.PI / 2, spread: 1.5, life: 60, sz: 5, add: false, g: -0.02 }); sfx('melt'); }
    if (cur.m[id] === 'F') { emit(x, y - 6, 8, { cols: ['#ffffff', '#bff4ff'], sp: 1.8, life: 34, sz: 2 }); sfx('freeze'); }
  }
  for (let k = 0; k < cur.v.length; k++) if (cur.v[k] !== prev.v[k]) { const lv = L.levers[k]; emit(lv.x * T + 16, lv.y * T + 14, 10, { col: CHC[lv.ch], sp: 2, life: 24 }); sfx('lever'); }
  for (let k = 0; k < cur.bt.length; k++) if (cur.bt[k] && !prev.bt[k]) sfx('btn');
  for (let i = 0; i < 2; i++) {
    const h = heroes[i], hp = prev.h[i];
    if (!h) continue;
    if (hp && h.vy < -5 && hp.vy >= -1) sfx('jump');
  }
}
function heroTrail(i, h, t) {
  const cx = h.x + HW / 2, by = h.y + HH;
  if (i === 0) {
    if (Math.random() < 0.35) emit(cx + (Math.random() - 0.5) * 8, by - 30, 1, { cols: ['#ffb040', '#ff7020', '#ffe080'], sp: 0.6, a: -Math.PI / 2, spread: 1.2, life: 34, sz: 1.8, g: -0.02 });
  } else {
    if (Math.abs(h.vx) > 2 && h.g && Math.random() < 0.3) emit(cx - h.f * 8, by - 4, 1, { col: '#8fdcff', sp: 1.2, a: -Math.PI / 2 - h.f * 0.8, spread: 0.8, life: 28, sz: 1.6, g: 0.12 });
    if (Math.random() < 0.06) emit(cx, by - 18, 1, { col: '#e0ffff', sp: 0.3, life: 30, sz: 1.2 });
  }
}

/* ---------- кадр ---------- */
function render(now) {
  const t = now / 1000;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = '#05040b'; ctx.fillRect(0, 0, CW, CH);
  const L = G.L, S = view();
  if (!L || !S) return;
  ctx.setTransform(DPR * SC, 0, 0, DPR * SC, DPR * OX, DPR * OY);
  if (stat) ctx.drawImage(stat, 0, 0, WW, WH);
  drawTiles(ctx, L, S, t);
  drawObjects(ctx, L, S, t);
  // герои
  const heroes = [S.h[0], S.h[1]];
  if (G.mode === 'client') {
    const me = G.me;
    G.corr.x *= 0.82; G.corr.y *= 0.82;
    heroes[me] = Object.assign({}, S.h[me], { x: S.h[me].x + G.corr.x, y: S.h[me].y + G.corr.y });
    const oh = otherHero(); if (oh) heroes[1 - me] = oh;
    if (G.auth && G.auth.st !== 'play') { heroes[0] = G.auth.h[0]; heroes[1] = G.auth.h[1]; }
  }
  const SS = statusState();
  for (let i = 0; i < 2; i++) {
    const h = heroes[i];
    if (h.dead) continue;
    if (SS && SS.st === 'play') heroTrail(i, h, t);
    drawHero(ctx, i, h, t, G.mode !== 'local' && i === G.me);
  }
  diffFx(L, G.prevView, S, heroes);
  // смерть и победа
  if (SS) {
    if (SS.st === 'dead' && !G.deadFx) {
      G.deadFx = true; const h = SS.h[SS.who];
      const cx = h.x + HW / 2, cy = h.y + HH / 2;
      emit(cx, cy, 50, { cols: SS.who ? ['#4fc8ff', '#ffffff', '#c8f4ff'] : ['#ff7a2f', '#ffd36b', '#ff3a10'], sp: 4, life: 50, sz: 3 });
      emit(cx, cy, 20, { col: 'rgba(220,220,230,.6)', sp: 1, a: -Math.PI / 2, spread: 1.6, life: 70, sz: 6, add: false, g: -0.03 });
      sfx('die');
    }
    if (SS.st !== 'dead') G.deadFx = false;
  }
  drawParticles(ctx);
  G.prevView = structuredClone({ c: S.c, m: S.m, v: S.v, bt: S.bt, h: heroes.map(h => ({ vy: h.vy })) });
  drawHud(ctx, L, S, SS);
  syncStatusUi(SS);
  // поля за пределами мира
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
function fmt(sec) { sec = Math.max(0, Math.floor(sec)); return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); }
function drawHud(c, L, S, SS) {
  c.save();
  const g = c.createLinearGradient(0, 0, 0, 34); g.addColorStop(0, 'rgba(5,4,12,.85)'); g.addColorStop(1, 'rgba(5,4,12,.35)');
  c.fillStyle = g; c.fillRect(0, 0, WW, 32);
  c.font = '700 17px "Trebuchet MS",system-ui,sans-serif'; c.textBaseline = 'middle';
  c.fillStyle = '#eef0ff'; c.textAlign = 'left';
  c.fillText(`${L.idx + 1}. ${L.name}`, 14, 17);
  const tm = (SS || S).tm / 60;
  c.textAlign = 'center';
  c.fillStyle = tm <= L.par ? '#ffe9a0' : '#ff9a8a';
  c.fillText(fmt(tm), WW / 2, 16);
  c.font = '600 12px "Trebuchet MS",system-ui,sans-serif'; c.fillStyle = 'rgba(220,220,255,.55)';
  c.fillText('★ до ' + fmt(L.par), WW / 2 + 62, 17);
  // кристаллы
  let x = WW - 240;
  for (let k = 0; k < 2; k++) {
    const got = L.crystals.reduce((a, cr, j) => a + (cr.k === k && S.c[j] ? 1 : 0), 0);
    c.save(); c.translate(x, 16); c.fillStyle = k ? '#4fc8ff' : '#ff7a2f';
    c.beginPath(); c.moveTo(0, -9); c.lineTo(6, -1); c.lineTo(0, 9); c.lineTo(-6, -1); c.fill(); c.restore();
    c.textAlign = 'left'; c.font = '700 16px "Trebuchet MS",system-ui,sans-serif'; c.fillStyle = '#eef0ff';
    c.fillText(`${got}/${L.total[k]}`, x + 11, 17);
    x += 70;
  }
  if (G.mode !== 'local') {
    const ms = G.mode === 'client' ? G.rtt : G.peerRtt;
    c.textAlign = 'left'; c.font = '600 12px "Trebuchet MS",system-ui,sans-serif';
    c.fillStyle = !G.connected ? '#ff7a7a' : ms > 200 ? '#ffc25a' : '#7dffb0';
    c.fillText(G.connected ? `● связь${ms ? ' ' + ms + ' мс' : ''}` : '● нет связи', 300, 17);
  }
  if (G.paused && G.mode === 'local') { c.fillStyle = 'rgba(0,0,0,.4)'; c.fillRect(0, 32, WW, WH - 32); }
  c.restore();
}
const DEATH = {
  water: 'Уголёк погас в воде!', lava: 'Капля испарилась в лаве!',
  acid0: 'Уголёк растворился в ядовитой жиже!', acid1: 'Капля растворилась в ядовитой жиже!',
  fall0: 'Уголёк сорвался вниз!', fall1: 'Капля сорвалась вниз!'
};
function syncStatusUi(SS) {
  const md = $('msgDead');
  if (SS && SS.st === 'dead') {
    const r = SS.h[SS.who].dead;
    const txt = DEATH[r] || DEATH[r + SS.who] || 'Ой!';
    if (!md.classList.contains('on')) {
      md.innerHTML = `<span style="color:${SS.who ? '#8fdcff' : '#ffb070'}">${txt}</span><br><small style="font-size:.55em;color:#ccd">Заново…</small>`;
      md.classList.add('on');
    }
  } else md.classList.remove('on');
  if (SS && SS.st === 'win' && !G.wonShown) {
    G.wonShown = true;
    const L = G.L, st = C.stars(L, SS), tm = SS.tm / 60, got = SS.c.reduce((a, b) => a + b, 0);
    recordWin(L.idx, st, tm);
    sfx('win');
    for (let k = 0; k < 4; k++) emit(WW / 2 + (Math.random() - 0.5) * 600, 200 + Math.random() * 200, 30, { cols: ['#ff7a2f', '#ffd36b', '#4fc8ff', '#d8fbff'], sp: 4, life: 70, sz: 3, g: 0.05 });
    const last = L.idx === C.LEVELS.length - 1;
    showOvl(`<h2>${last ? 'Вершина покорена!' : 'Уровень пройден!'}</h2>
      <div class="stars">${'★'.repeat(st)}<i>${'★'.repeat(3 - st)}</i></div>
      <div class="res">Время ${fmt(tm)} (★ до ${fmt(L.par)}) · кристаллы ${got}/${L.crystals.length}${last ? '<br>Вы прошли все уровни. Настоящий тандем!' : ''}</div>
      <div class="row">${last ? '' : '<button class="big duo" id="oNext">Дальше</button>'}<button class="big" id="oAgain">Ещё раз</button><button class="big ghost" id="oLv">Уровни</button></div>`);
    if (!last) $('oNext').onclick = () => { hideOvl(); sendCmd('next'); };
    $('oAgain').onclick = () => { hideOvl(); sendCmd('restart'); };
    $('oLv').onclick = () => { hideOvl(); sendCmd('levels'); };
  }
}

/* ---------- звук (короткие синтезированные сигналы) ---------- */
let AC = null;
function sfx(k) {
  try {
    if (!AC) { AC = new (window.AudioContext || window.webkitAudioContext)(); }
    if (AC.state === 'suspended') AC.resume();
    const o = AC.createOscillator(), g = AC.createGain(), n = AC.currentTime;
    const S = { jump: [420, 640, 0.08, 'triangle', 0.05], gemf: [880, 1320, 0.15, 'sine', 0.08], gemw: [990, 1480, 0.15, 'sine', 0.08], melt: [300, 120, 0.25, 'sawtooth', 0.03],
      freeze: [1400, 2200, 0.2, 'square', 0.025], lever: [200, 160, 0.06, 'square', 0.05], btn: [260, 330, 0.06, 'triangle', 0.05], die: [400, 60, 0.45, 'sawtooth', 0.07], win: [523, 1046, 0.5, 'triangle', 0.08] }[k];
    if (!S) return;
    o.type = S[3]; o.frequency.setValueAtTime(S[0], n); o.frequency.exponentialRampToValueAtTime(S[1], n + S[2]);
    g.gain.setValueAtTime(S[4], n); g.gain.exponentialRampToValueAtTime(0.0001, n + S[2] + 0.05);
    o.connect(g); g.connect(AC.destination); o.start(n); o.stop(n + S[2] + 0.06);
  } catch (e) {}
}

/* ---------- фон меню и превью героев ---------- */
const motes = Array.from({ length: 60 }, (_, i) => ({ x: Math.random(), y: Math.random(), s: 0.3 + Math.random(), k: i % 2, p: Math.random() * 6 }));
function drawBg(now) {
  const b = $('bgfx'), c = b.getContext('2d'), t = now / 1000;
  c.setTransform(DPR, 0, 0, DPR, 0, 0);
  const g = c.createLinearGradient(0, 0, CW, CH); g.addColorStop(0, '#1d0f1c'); g.addColorStop(0.5, '#0b0a14'); g.addColorStop(1, '#0a1626');
  c.fillStyle = g; c.fillRect(0, 0, CW, CH);
  c.globalCompositeOperation = 'lighter';
  for (const [x, y, col] of [[0.15, 0.8, 'rgba(255,110,40,'], [0.85, 0.2, 'rgba(60,160,255,']]) {
    const rg = c.createRadialGradient(x * CW, y * CH, 0, x * CW, y * CH, Math.max(CW, CH) * 0.5);
    rg.addColorStop(0, col + '.22)'); rg.addColorStop(1, col + '0)'); c.fillStyle = rg; c.fillRect(0, 0, CW, CH);
  }
  for (const m of motes) {
    const y = ((m.y - t * 0.02 * m.s) % 1 + 1) % 1, x = m.x + Math.sin(t * 0.5 + m.p) * 0.01;
    c.fillStyle = m.k ? 'rgba(120,200,255,.5)' : 'rgba(255,150,60,.5)';
    c.beginPath(); c.arc(x * CW, y * CH, 1.5 * m.s + 0.5, 0, 7); c.fill();
  }
  c.globalCompositeOperation = 'source-over';
}
function drawHeroPrev(now) {
  const cvp = $('heroPrev'); if (!cvp.offsetParent) return;
  const c = cvp.getContext('2d'), t = now / 1000;
  c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cvp.width, cvp.height);
  c.setTransform(2, 0, 0, 2, 0, 0);
  // маленькая сцена: лава и вода, площадка
  drawLiquid(c, 'L', 0, 64, 138, t); drawLiquid(c, 'W', 156, 220, 138, t);
  const gg = c.createLinearGradient(0, 138, 0, 170); gg.addColorStop(0, '#5a4f8a'); gg.addColorStop(1, '#241e40');
  c.fillStyle = gg; c.fillRect(64, 138, 92, 32); c.fillStyle = '#9d8fe0'; c.fillRect(64, 138, 92, 3);
  const j0 = Math.max(0, Math.sin(t * 2.2)) * 18, j1 = Math.max(0, Math.sin(t * 2.2 + 2)) * 18;
  drawHero(c, 0, { x: 72, y: 110 - j0, vx: 0, vy: j0 > 1 ? -Math.cos(t * 2.2) * 6 : 0, g: j0 < 1, f: 1 }, t, false);
  drawHero(c, 1, { x: 128, y: 110 - j1, vx: 0, vy: j1 > 1 ? -Math.cos(t * 2.2 + 2) * 6 : 0, g: j1 < 1, f: -1 }, t, false);
  c.font = '700 12px "Trebuchet MS",sans-serif'; c.textAlign = 'center';
  c.fillStyle = '#ffb070'; c.fillText('Уголёк', 82, 62); c.fillStyle = '#8fdcff'; c.fillText('Капля', 138, 62);
}
function drawMini(cnv, idx) {
  const L = C.level(idx), c = cnv.getContext('2d');
  cnv.width = 200; cnv.height = 110;
  c.setTransform(200 / WW, 0, 0, 110 / WH, 0, 0);
  drawLevelBase(c, L, true);
  const S = C.newState(idx);
  drawTiles(c, L, S, 0); drawObjects(c, L, S, 0);
  for (let i = 0; i < 2; i++) { const h = S.h[i]; c.fillStyle = i ? '#3fb6ff' : '#ff7a2f'; c.beginPath(); c.arc(h.x + 10, h.y + 14, 16, 0, 7); c.fill(); }
}

/* ================= экраны ================= */
function show(id) {
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('on', s.id === id);
  if (id !== 'game') { document.body.classList.remove('playing'); $('msgDead').classList.remove('on'); }
}
function showOvl(html) { $('ovlCard').innerHTML = html; $('ovl').classList.add('on'); }
function hideOvl() { $('ovl').classList.remove('on'); }
let toastT = 0;
function toast(msg) { const e = $('toast'); e.textContent = msg; e.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => e.classList.remove('on'), 3500); }

function showLevels() {
  G.scr = 'levels'; G.paused = false; hideOvl(); wakeLock(false);
  if (G.mode !== 'client') G.S = null;
  show('levels');
  $('lvNote').textContent = G.mode === 'local' ? 'Оба героя на одном экране: Уголёк — WASD + E, Капля — стрелки + Enter'
    : G.mode === 'host' ? 'Друг подключён! Уровень может выбрать любой из вас' : G.mode === 'client' ? 'Ты — Капля. Уровень может выбрать любой из вас' : '';
  const grid = $('lvGrid'); grid.innerHTML = '';
  C.LEVELS.forEach((d, i) => {
    const open = isOpen(i), b = bestOf(i);
    const el = document.createElement('button'); el.className = 'lv' + (open ? '' : ' lock');
    const cn = document.createElement('canvas'); drawMini(cn, i); el.appendChild(cn);
    el.insertAdjacentHTML('beforeend', `<div class="nm">${i + 1}. ${d.name}</div><div class="st">${b ? '★'.repeat(b.s) + '<i>' + '★'.repeat(3 - b.s) + '</i> ' + fmt(b.t) : '<i>★★★</i>'}</div>`);
    if (open) el.onclick = () => { if (G.mode === 'client') { sendCmd('lv', i); el.style.outline = '2px solid #3fb6ff'; } else startLevel(i); };
    grid.appendChild(el);
  });
}
function toMenu() {
  hideOvl(); wakeLock(false);
  if (G.tr) { G.tr.destroy(); G.tr = null; }
  Object.assign(G, { mode: null, connected: false, S: null, L: null, auth: null, P: null, snaps: [], pending: [], hist: [], q: [], cmd: null, botGen: null, paused: false });
  G.scr = 'menu'; show('menu');
  if (location.search && /join|auto/.test(location.search)) history.replaceState(null, '', location.pathname + (LOCAL ? '?local=1' : ''));
}
function togglePause() {
  if (G.scr !== 'play') return;
  if ($('ovl').classList.contains('on') && !G.paused) return;
  if (G.paused) { G.paused = false; hideOvl(); return; }
  G.paused = true;
  showOvl(`<h2>${G.mode === 'local' ? 'Пауза' : 'Меню'}</h2>${G.mode !== 'local' ? '<p class="res">Игра по сети не останавливается</p>' : ''}
    <div class="btns"><button class="big duo" id="pGo">Продолжить</button><button class="big" id="pRe">Заново</button><button class="big" id="pLv">Уровни</button><button class="big ghost" id="pMenu">Выйти в меню</button></div>`);
  $('pGo').onclick = togglePause;
  $('pRe').onclick = () => { G.paused = false; hideOvl(); sendCmd('restart'); };
  $('pLv').onclick = () => { G.paused = false; hideOvl(); sendCmd('levels'); };
  $('pMenu').onclick = toMenu;
}
$('hudbtn').onclick = togglePause;

/* ---------- сеть: хост ---------- */
function hostGame(forceCode) {
  G.mode = 'host'; G.me = 0; G.scr = 'lobby'; show('lobby');
  $('codeBig').textContent = '····'; $('lobbyStatus').textContent = 'Подключаемся к серверу'; $('lobbyStatus').className = 'status dots';
  const qc = $('qr').getContext('2d'); qc.clearRect(0, 0, 420, 420);
  G.tr = makeTransport();
  G.tr.host(forceCode || rndCode(), {
    open: code => {
      G.code = code; $('codeBig').textContent = code;
      $('lobbyStatus').textContent = 'Ждём второго игрока';
      const url = location.origin + location.pathname + '?join=' + code + (LOCAL ? '&local=1' : '');
      $('joinLink').textContent = url;
      drawQr(url);
    },
    conn: () => {
      G.connected = true; G.lastRecv = performance.now(); G.q = []; G.ack = 0;
      toast('Второй игрок подключился!');
      const lv = Q.get('lvl');
      if (lv !== null && Q.has('autohost')) startLevel(Math.max(0, Math.min(C.LEVELS.length - 1, +lv - 1)));
      else showLevels();
      hostSend();
    },
    data: hostOnData,
    close: () => lostLink(),
    error: msg => { $('lobbyStatus').textContent = msg; $('lobbyStatus').className = 'status err'; if (G.connected) lostLink(); }
  });
}
async function drawQr(url) {
  const cnv = $('qr'), c = cnv.getContext('2d');
  try {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js');
    const qr = qrcode(0, 'M'); qr.addData(url); qr.make();
    const n = qr.getModuleCount(), s = Math.floor(400 / n), off = (420 - s * n) / 2;
    c.fillStyle = '#fff'; c.fillRect(0, 0, 420, 420); c.fillStyle = '#0b0a14';
    for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (qr.isDark(r, k)) c.fillRect(off + k * s, off + r * s, s, s);
  } catch (e) {
    c.fillStyle = '#fff'; c.fillRect(0, 0, 420, 420); c.fillStyle = '#555'; c.font = '28px sans-serif'; c.textAlign = 'center'; c.fillText('QR недоступен', 210, 210);
  }
}
/* ---------- сеть: клиент ---------- */
function joinGame(code) {
  code = String(code || '').replace(/\D/g, '').slice(0, 4);
  if (code.length !== 4) { $('joinStatus').textContent = 'Нужно 4 цифры'; $('joinStatus').className = 'status err'; return; }
  G.mode = 'client'; G.me = 1; G.scr = 'join'; show('joinScr');
  $('codeIn').value = code;
  $('joinStatus').textContent = 'Подключаемся…'; $('joinStatus').className = 'status';
  $('bJoinGo').disabled = true;
  if (G.tr) G.tr.destroy();
  G.tr = makeTransport();
  G.curE = -1; G.lastK = -1; G.seq = 0; G.pending = []; G.hist = []; G.snaps = []; G.tOff = null;
  G.tr.join(code, {
    conn: () => {
      G.connected = true; G.lastRecv = performance.now();
      $('bJoinGo').disabled = false;
      G.scr = 'wait'; show('wait');
      G.tr.send({ t: 'hi', pr: prog.best });
    },
    data: clientOnData,
    close: () => lostLink(),
    error: msg => {
      $('bJoinGo').disabled = false;
      if (G.connected) { lostLink(); return; }
      G.mode = null; $('joinStatus').textContent = msg; $('joinStatus').className = 'status err';
      if (G.tr) { G.tr.destroy(); G.tr = null; }
    }
  });
}

/* ---------- кнопки меню ---------- */
$('bHost').onclick = () => hostGame();
$('bJoin').onclick = () => { G.scr = 'join'; show('joinScr'); $('joinStatus').textContent = ''; setTimeout(() => $('codeIn').focus(), 50); };
$('bLocal').onclick = () => { G.mode = 'local'; G.me = 0; goFullscreen(); showLevels(); };
$('bLvBack').onclick = () => { if (G.mode === 'local') toMenu(); else toMenu(); };
$('bLobbyBack').onclick = toMenu;
$('bJoinBack').onclick = toMenu;
$('bWaitBack').onclick = toMenu;
$('bJoinGo').onclick = () => { goFullscreen(); joinGame($('codeIn').value); };
$('codeIn').addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4); });
$('codeIn').addEventListener('keydown', e => { if (e.key === 'Enter') joinGame($('codeIn').value); });
let deferredInstall = null;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; $('bInstall').style.display = ''; });
$('bInstall').onclick = async () => { if (!deferredInstall) return; deferredInstall.prompt(); deferredInstall = null; $('bInstall').style.display = 'none'; };

function goFullscreen() {
  if (!document.body.classList.contains('touch')) return;
  const el = document.documentElement;
  try { const p = el.requestFullscreen && el.requestFullscreen({ navigationUI: 'hide' }); if (p && p.catch) p.catch(() => {}); } catch (e) {}
  try { screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {}); } catch (e) {}
}
let wl = null;
async function wakeLock(on) {
  try {
    if (on && !wl && navigator.wakeLock) { wl = await navigator.wakeLock.request('screen'); wl.addEventListener('release', () => { wl = null; }); }
    if (!on && wl) { wl.release(); wl = null; }
  } catch (e) { wl = null; }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && G.scr === 'play') wakeLock(true); });

/* ================= запуск ================= */
resize();
if (Q.has('autohost')) hostGame(Q.get('autohost'));
else if (Q.has('autojoin')) joinGame(Q.get('autojoin'));
else if (Q.has('join')) joinGame(Q.get('join'));
else if (Q.has('bot')) {
  G.mode = 'local';
  loadScript('tests/bot.js').then(() => {
    const lv = Math.max(0, +Q.get('bot') - 1);
    startLevel(lv);
    G.botGen = TBOT.SOLUTIONS[lv](TBOT.makeBot(C, G.L, G.S))[Symbol.iterator]();
  });
} else if (Q.has('play')) { G.mode = 'local'; startLevel(Math.max(0, +Q.get('play') - 1)); }
})();
