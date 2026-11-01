/* Тандем — ядро: уровни и детерминированная физика (общая для хоста, клиента и тестов) */
(function (root) {
'use strict';
const T = 32, COLS = 40, ROWS = 22, HW = 20, HH = 28, BW = 30;
const P = { acc: 0.7, air: 0.45, maxv: 3.4, pushv: 1.7, g: 0.55, maxf: 11, jv: -9.8, coyote: 6, buf: 6 };
const IN = { L: 1, R: 2, U: 4, D: 8, A: 16 };
const HERO = [
  { name: 'Уголёк', el: 'огонь', col: '#ff7a2f' },
  { name: 'Капля', el: 'вода', col: '#3fb6ff' }
];
// твёрдость клеток: t — отступ сверху, h — высота, ow — односторонняя
const TS = {
  '#': { t: 0, h: 32 }, 'I': { t: 0, h: 32 }, 'F': { t: 0, h: 32 },
  'L': { t: 10, h: 22 }, 'W': { t: 10, h: 22 }, 'A': { t: 10, h: 22 },
  '=': { t: 0, h: 10, ow: 1 }
};

/* ---------- уровни ----------
 fill: [символ, кол, ряд, ширина, высота]; marks: [символ, кол, ряд]
 1/2 — старт Уголька/Капли, E/Q — их выходы, r/b — кристаллы огня/воды, B — ящик
 buttons/levers: [кол, ряд, канал]; doors: [кол, ряд, ш, в, канал, инверсия]
 plats: [x1, y1, ширина, x2, y2, канал(-1 — сама ездит), скорость] (y — верх платформы в клетках)
*/
const LEVELS = [
{ name: 'Первые шаги', par: 40, theme: 0,
  fill: [['#',1,12,30,1],['L',19,12,2,1],['W',24,12,2,1],['=',32,14,4,1],['=',36,16,3,1],['=',32,18,4,1],
         ['L',8,20,2,1],['W',13,20,2,1],['A',18,20,2,1]],
  marks: [['1',2,19],['2',4,19],['r',8,19],['b',13,19],['r',19,11],['b',24,11],['E',4,11],['Q',7,11],['r',37,15],['b',33,13]],
  texts: [[10,16.2,'Уголёк не боится лавы, Капле нипочём вода'],[24,16.2,'Зелёная жижа губит обоих'],[14,8,'Каждому — своя дверь. Дойдите вместе!']]
},
{ name: 'Вдвоём сподручнее', par: 30, theme: 1,
  fill: [['#',7,1,32,7],['#',7,12,32,1],['W',22,12,3,1],['=',4,14,3,1],['=',1,16,3,1],['=',4,18,3,1],['L',20,20,3,1]],
  marks: [['1',2,19],['2',3,19],['b',23,11],['b',30,11],['Q',35,11],['r',21,19],['r',28,19],['E',35,19],['b',2,15]],
  buttons: [[9,11,1],[16,19,2]], doors: [[12,13,1,7,1],[14,8,1,4,2]],
  texts: [[26,15.5,'Пока кто-то стоит на кнопке, дверь открыта'],[3.5,4,'Наверх!']]
},
{ name: 'Талая вода', par: 45, theme: 2,
  fill: [['#',1,12,29,1],['W',9,12,4,1],['L',22,12,4,1],['I',21,10,6,1],['=',31,14,4,1],['=',35,16,4,1],['=',31,18,4,1],
         ['W',8,20,5,1],['I',18,13,1,7]],
  marks: [['1',2,19],['2',3,19],['b',10,19],['r',24,19],['E',3,11],['Q',6,11],['b',10,11],['r',23,11],['b',24,9]],
  texts: [[13,15.5,'Капля: «действие» у воды — заморозить'],[24,15.5,'Уголёк: «действие» у льда — растопить'],[18,5,'Ледяной мост держит Каплю. Не растопи его!']]
},
{ name: 'Тяжёлая ноша', par: 55, theme: 3,
  fill: [['#',1,12,33,1],['#',26,17,2,3],['A',30,20,2,1],['=',35,18,4,1],['=',31,16,4,1],['=',35,14,4,1],['#',1,7,9,1],['W',27,12,2,1]],
  marks: [['1',2,19],['2',3,19],['B',6,19],['B',22,19],['B',24,11],['E',3,11],['Q',6,11],['r',27,16],['b',27,11],['r',20,11],['b',13,19]],
  buttons: [[12,19,1],[15,11,2]], doors: [[18,13,1,7,1],[9,8,1,4,2]],
  texts: [[9,15.5,'Ящик можно толкать'],[23,9,'Кнопку прижмёт и ящик'],[22,15.5,'…а ещё на него можно запрыгнуть']]
},
{ name: 'Подъёмник', par: 75, theme: 4,
  fill: [['#',6,12,33,1],['A',13,12,14,1],['L',16,20,2,1],['W',22,20,2,1]],
  marks: [['1',1,19],['2',2,19],['E',36,11],['Q',33,11],['b',9,11],['r',30,11],['r',16,19],['b',22,19],['r',12,19],['b',4,10]],
  plats: [[4,20,2,4,12,1,2.0],[13,12,2,25,12,-1,1.6]],
  levers: [[9,19,1]], buttons: [[7,11,1]],
  texts: [[18,16,'Рычаг — «действие» рядом с ним'],[20,7,'Платформа ездит сама — дождись её']]
},
{ name: 'Противовес', par: 55, theme: 5,
  fill: [['#',4,7,32,1],['#',13,2,14,1],['L',8,7,2,1],['W',29,7,2,1],['W',6,20,2,1],['L',25,20,2,1]],
  marks: [['1',4,19],['2',9,19],['B',12,19],['E',17,6],['Q',22,6],['r',8,6],['b',29,6],['r',15,19],['b',33,19],['r',33,6],['b',28,19]],
  levers: [[32,6,2]], buttons: [[20,19,3],[31,19,1]], doors: [[13,3,1,4,3],[26,3,1,4,3]],
  plats: [[2,20,2,2,7,1,2.2],[36,20,2,36,7,2,2.2]],
  texts: [[20,11,'Один держит — другой едет'],[20,14,'Ящик откроет комнату с выходами']]
},
{ name: 'Ледяные шлюзы', par: 55, theme: 6,
  fill: [['#',1,12,31,1],['W',10,20,6,1],['I',30,13,1,7],['=',33,18,3,1],['=',36,16,3,1],['=',33,14,3,1],['L',21,12,5,1],['W',9,12,3,1]],
  marks: [['1',2,19],['2',3,19],['B',6,19],['E',3,11],['Q',6,11],['b',12,19],['r',28,19],['r',23,11],['b',10,11],['b',37,15],['r',34,13]],
  buttons: [[22,19,1]], doors: [[26,13,1,7,1]], levers: [[17,11,2]],
  plats: [[24,12,2,21,12,2,1.5]],
  texts: [[13,16,'Лёд держит ящик не хуже камня'],[20,6,'Рычаг двигает плот над лавой']]
},
{ name: 'Вершина', par: 90, theme: 7,
  fill: [['#',1,7,34,7],['#',1,1,36,2],['#',37,1,2,19],['I',28,3,1,4],['L',19,7,5,1],['W',9,7,3,1],['W',7,20,5,1],['A',22,20,8,1]],
  marks: [['1',2,19],['2',3,19],['B',5,19],['E',3,6],['Q',6,6],['b',9,19],['r',25,19],['b',27,19],['r',21,6],['b',10,6],['r',31,6],['b',13,19]],
  buttons: [[16,19,1],[33,6,2]], doors: [[19,14,1,6,1]], levers: [[32,19,2],[16,6,3]],
  plats: [[22,20,2,28,20,-1,1.5],[35,20,2,35,7,2,2.2],[22,7,2,19,7,3,1.5]],
  texts: [[17,10.5,'Всё, чему научились, — вместе'],[26,16.5,'Терпение: плот вернётся']]
}
];

function buildLevel(idx) {
  const d = LEVELS[idx];
  const g = new Array(COLS * ROWS).fill('.');
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++)
    if (r === 0 || c === 0 || c === COLS - 1 || r >= 20) g[r * COLS + c] = '#';
  for (const [ch, c, r, w, h] of d.fill)
    for (let y = r; y < r + h; y++) for (let x = c; x < c + w; x++) g[y * COLS + x] = ch;
  const L = { idx, name: d.name, par: d.par, theme: d.theme || 0, g, spawn: [], exits: [], crystals: [], boxes: [],
    buttons: (d.buttons || []).map(([x, y, ch]) => ({ x, y, ch })),
    levers: (d.levers || []).map(([x, y, ch]) => ({ x, y, ch })),
    doors: (d.doors || []).map(([x, y, w, h, ch, inv]) => ({ x, y, w, h, ch, inv: !!inv })),
    plats: (d.plats || []).map(([x1, y1, w, x2, y2, ch, sp]) => ({ x1, y1, w, x2, y2, ch, sp })),
    texts: d.texts || [] };
  for (const [ch, c, r] of d.marks) {
    if (ch === '1') L.spawn[0] = [c, r];
    else if (ch === '2') L.spawn[1] = [c, r];
    else if (ch === 'E') L.exits[0] = { x: c, y: r };
    else if (ch === 'Q') L.exits[1] = { x: c, y: r };
    else if (ch === 'r') L.crystals.push({ x: c, y: r, k: 0 });
    else if (ch === 'b') L.crystals.push({ x: c, y: r, k: 1 });
    else if (ch === 'B') L.boxes.push({ x: c, y: r });
  }
  L.total = [L.crystals.filter(c => c.k === 0).length, L.crystals.filter(c => c.k === 1).length];
  return L;
}
const _cache = [];
function level(idx) { return _cache[idx] || (_cache[idx] = buildLevel(idx)); }

function newHero(c, r) {
  return { x: c * T + (T - HW) / 2, y: (r + 1) * T - HH, vx: 0, vy: 0, g: 1, co: 0, jb: 0, pi: 0, gp: -1, go: 0, f: 1, dr: 0, pu: 0, dead: 0, ex: 0 };
}
function newState(idx) {
  const L = level(idx);
  return {
    lv: idx, k: 0, tm: 0, st: 'play', sT: 0, w: 0, who: -1,
    h: [newHero(...L.spawn[0]), newHero(...L.spawn[1])],
    b: L.boxes.map(b => ({ x: b.x * T + 1, y: (b.y + 1) * T - BW, vy: 0, gp: -1 })),
    d: L.doors.map(() => 0),
    p: L.plats.map(p => ({ x: p.x1 * T, y: p.y1 * T, d: 1, t: 0 })),
    v: L.levers.map(() => 0),
    bt: L.buttons.map(() => 0),
    c: L.crystals.map(() => 0),
    ch: [0, 0, 0, 0, 0, 0, 0, 0],
    m: {}
  };
}

function tile(L, S, c, r) {
  if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return '#';
  const i = r * COLS + c, m = S.m[i];
  return m !== undefined ? m : L.g[i];
}
function ov(ax, ay, aw, ah, b) { return ax < b.x + b.w && ax + aw > b.x && ay < b.y + b.h && ay + ah > b.y; }
function doorRect(L, S, k) {
  const d = L.doors[k], o = S.d[k];
  return { x: d.x * T, y: d.y * T, w: d.w * T, h: d.h * T * (1 - o) };
}
// сплошные прямоугольники в области
function solids(L, S, x, y, w, h, skipBox, out) {
  out.length = 0;
  const c0 = Math.floor(x / T), c1 = Math.floor((x + w) / T), r0 = Math.floor(y / T), r1 = Math.floor((y + h) / T);
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    const s = TS[tile(L, S, c, r)];
    if (s) out.push({ x: c * T, y: r * T + s.t, w: T, h: s.h, ow: s.ow || 0, k: 't' });
  }
  for (let k = 0; k < L.doors.length; k++) {
    const r = doorRect(L, S, k);
    if (r.h > 0.5) { r.ow = 0; r.k = 'd'; out.push(r); }
  }
  for (let k = 0; k < S.b.length; k++) if (k !== skipBox) {
    const b = S.b[k]; out.push({ x: b.x, y: b.y, w: BW, h: BW, ow: 0, k: 'b', id: k });
  }
  for (let k = 0; k < L.plats.length; k++) {
    const p = S.p[k]; out.push({ x: p.x, y: p.y, w: L.plats[k].w * T, h: 12, ow: 1, k: 'p', id: k });
  }
  return out;
}
const _a = [], _b = [];
function blocked(L, S, x, y, w, h, skipBox) {
  const list = solids(L, S, x, y, w, h, skipBox, _b);
  for (const r of list) if (!r.ow && ov(x, y, w, h, r)) return true;
  return false;
}

function pushBox(L, S, id, dx) {
  const b = S.b[id];
  let nx = b.x + dx;
  const list = solids(L, S, Math.min(b.x, nx) - 1, b.y, BW + Math.abs(dx) + 2, BW, id, _b);
  for (const r of list) {
    if (r.ow || !ov(nx, b.y, BW, BW, r)) continue;
    if (dx > 0) nx = Math.min(nx, r.x - BW); else nx = Math.max(nx, r.x + r.w);
  }
  const moved = nx - b.x; b.x = nx; return moved;
}

function moveHeroX(L, S, i, dx) {
  const h = S.h[i]; if (dx === 0) return;
  let nx = h.x + dx;
  const list = solids(L, S, Math.min(h.x, nx) - 1, h.y - 14, HW + Math.abs(dx) + 2, HH + 14, -1, _a).slice();
  // сначала ящики (толкаем), потом остальное
  for (const r of list) {
    if (r.k !== 'b' || !ov(nx, h.y, HW, HH, r)) continue;
    if (h.y + HH <= r.y + 2) continue; // стоим сверху
    const need = dx > 0 ? (nx + HW) - r.x : (r.x + r.w) - nx;
    pushBox(L, S, r.id, dx > 0 ? need : -need);
    h.pu = 4;
    const b = S.b[r.id];
    if (dx > 0) { if (nx + HW > b.x) nx = b.x - HW; } else { if (nx < b.x + BW) nx = b.x + BW; }
  }
  for (const r of list) {
    if (r.ow || r.k === 'b' || !ov(nx, h.y, HW, HH, r)) continue;
    const lift = (h.y + HH) - r.y;
    if (h.g && lift > 0 && lift <= 12 && !blocked(L, S, nx, r.y - HH, HW, HH, -1)) { h.y = r.y - HH; continue; }
    if (dx > 0) nx = Math.min(nx, r.x - HW); else nx = Math.max(nx, r.x + r.w);
    h.vx = 0;
  }
  h.x = nx;
}
function moveHeroY(L, S, i, dy) {
  const h = S.h[i];
  const ny0 = h.y + dy, bot = h.y + HH;
  let ny = ny0;
  h.g = 0; h.go = 0; let gp = -1, best = Infinity;
  const list = solids(L, S, h.x, Math.min(h.y, ny0) - 1, HW, HH + Math.abs(dy) + 2, -1, _a);
  for (const r of list) {
    if (!ov(h.x, ny0, HW, HH, r)) continue;
    if (dy > 0) {
      if (r.ow && (h.dr > 0 || bot > r.y + 0.01)) continue;
      if (r.k === 'b' && bot > r.y + 6) continue; // ящик сбоку
      if (r.y < best || (r.y === best && r.k === 'p')) {
        best = r.y; ny = r.y - HH; h.vy = 0; h.g = 1; h.go = r.ow ? 1 : 0; gp = r.k === 'p' ? r.id : -1;
      }
    } else if (dy < 0) {
      if (r.ow) continue;
      if (r.k === 'b' && h.y < r.y + r.h - 6) continue;
      if (r.y + r.h > ny) { ny = r.y + r.h; h.vy = 0; }
    }
  }
  h.y = ny; h.gp = gp;
}
function stepHero(L, S, i, inp) {
  const h = S.h[i];
  const dir = ((inp & IN.R) ? 1 : 0) - ((inp & IN.L) ? 1 : 0);
  if (dir) h.f = dir;
  const maxv = h.pu > 0 ? P.pushv : P.maxv;
  if (dir) { h.vx += dir * (h.g ? P.acc : P.air); if (h.vx > maxv) h.vx = maxv; if (h.vx < -maxv) h.vx = -maxv; }
  else { h.vx *= h.g ? 0.55 : 0.9; if (Math.abs(h.vx) < 0.05) h.vx = 0; }
  if (h.pu > 0) h.pu--;
  const up = (inp & IN.U) !== 0;
  if (up && !(h.pi & IN.U)) h.jb = P.buf; else if (h.jb > 0) h.jb--;
  if (h.g) h.co = P.coyote; else if (h.co > 0) h.co--;
  if (h.jb > 0 && h.co > 0) { h.vy = P.jv; h.jb = 0; h.co = 0; h.g = 0; h.gp = -1; }
  if (!up && h.vy < -4) h.vy = -4;
  if (h.g && h.go && (inp & IN.D) && !(h.pi & IN.D)) h.dr = 10;
  if (h.dr > 0) h.dr--;
  h.vy += P.g; if (h.vy > P.maxf) h.vy = P.maxf;
  moveHeroX(L, S, i, h.vx);
  moveHeroY(L, S, i, h.vy);
  if ((inp & IN.A) && !(h.pi & IN.A)) doAction(L, S, i);
  h.pi = inp;
}

function doAction(L, S, i) {
  const h = S.h[i], cx = h.x + HW / 2, cy = h.y + HH / 2;
  for (let k = 0; k < L.levers.length; k++) {
    const lv = L.levers[k];
    if (Math.abs(cx - (lv.x * T + 16)) < 28 && Math.abs(cy - (lv.y * T + 18)) < 30) { S.v[k] = S.v[k] ? 0 : 1; return; }
  }
  if (i === 0) {
    const c0 = Math.floor((cx - 60) / T), c1 = Math.floor((cx + 60) / T), r0 = Math.floor((cy - 60) / T), r1 = Math.floor((cy + 60) / T);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++)
      if (tile(L, S, c, r) === 'I' && Math.hypot(c * T + 16 - cx, r * T + 16 - cy) <= 60) S.m[r * COLS + c] = '.';
  } else {
    const fy = h.y + HH, q = [], seen = {};
    const c0 = Math.floor((cx - 60) / T), c1 = Math.floor((cx + 60) / T), r0 = Math.floor((fy - 60) / T), r1 = Math.floor((fy + 60) / T);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++)
      if (tile(L, S, c, r) === 'W' && Math.hypot(c * T + 16 - cx, r * T + 16 - fy) <= 64) { q.push([c, r]); seen[r * COLS + c] = 1; }
    let n = 0;
    while (q.length && n < 30) {
      const [c, r] = q.shift(); S.m[r * COLS + c] = 'F'; n++;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = c + dx, nr = r + dy, id = nr * COLS + nc;
        if (!seen[id] && tile(L, S, nc, nr) === 'W') { seen[id] = 1; q.push([nc, nr]); }
      }
    }
    // вытолкнуть тех, кто оказался во льду
    for (const o of S.h) for (let r = Math.floor(o.y / T); r <= Math.floor((o.y + HH - 0.01) / T); r++)
      for (let c = Math.floor(o.x / T); c <= Math.floor((o.x + HW - 0.01) / T); c++)
        if (tile(L, S, c, r) === 'F' && o.y + HH > r * T) o.y = r * T - HH;
    for (const b of S.b) for (let c = Math.floor(b.x / T); c <= Math.floor((b.x + BW - 0.01) / T); c++) {
      const r = Math.floor((b.y + BW - 0.01) / T);
      if (tile(L, S, c, r) === 'F') b.y = r * T - BW;
    }
  }
}

function heroHazard(L, S, i) {
  const h = S.h[i];
  const y0 = h.y + HH - 4, y1 = h.y + HH - 0.5;
  for (let r = Math.floor(y0 / T); r <= Math.floor(y1 / T); r++)
    for (let c = Math.floor((h.x + 3) / T); c <= Math.floor((h.x + HW - 3) / T); c++) {
      const t = tile(L, S, c, r);
      if (t === 'A') return 'acid';
      if (t === 'L' && i === 1) return 'lava';
      if (t === 'W' && i === 0) return 'water';
    }
  if (h.y > ROWS * T) return 'fall';
  return null;
}

function computeChannels(L, S) {
  for (let c = 0; c < S.ch.length; c++) S.ch[c] = 0;
  for (let k = 0; k < L.buttons.length; k++) {
    const bt = L.buttons[k], rr = { x: bt.x * T + 2, y: bt.y * T + 18, w: 28, h: 14 };
    let on = 0;
    for (const h of S.h) if (!h.dead && ov(h.x, h.y, HW, HH, rr)) on = 1;
    for (const b of S.b) if (ov(b.x, b.y, BW, BW, rr)) on = 1;
    S.bt[k] = on; if (on) S.ch[bt.ch] = 1;
  }
  for (let k = 0; k < L.levers.length; k++) if (S.v[k]) S.ch[L.levers[k].ch] = 1;
}

/* шаг мира. ins — [ввод0, ввод1]; frozen — индекс героя, которого не двигаем (предсказание клиента) */
function stepWorld(L, S, ins, frozen) {
  if (frozen === undefined) frozen = -1;
  const pred = frozen >= 0;
  S.k++;
  if (S.st !== 'play') { S.sT++; return; }
  S.tm++;
  computeChannels(L, S);
  // двери
  for (let k = 0; k < L.doors.length; k++) {
    const dd = L.doors[k], want = (S.ch[dd.ch] ? 1 : 0) ^ (dd.inv ? 1 : 0);
    let o = S.d[k];
    if (want) o = Math.min(1, o + 0.06);
    else if (o > 0) {
      const no = Math.max(0, o - 0.06), rr = { x: dd.x * T, y: dd.y * T, w: dd.w * T, h: dd.h * T * (1 - no) };
      let hit = false;
      for (const h of S.h) if (ov(h.x, h.y, HW, HH, rr)) hit = true;
      for (const b of S.b) if (ov(b.x, b.y, BW, BW, rr)) hit = true;
      if (!hit) o = no;
    }
    S.d[k] = o;
  }
  // платформы
  for (let k = 0; k < L.plats.length; k++) {
    const pd = L.plats[k], p = S.p[k];
    let tx, ty;
    if (pd.ch >= 0) { const on = S.ch[pd.ch]; tx = (on ? pd.x2 : pd.x1) * T; ty = (on ? pd.y2 : pd.y1) * T; }
    else { tx = (p.d ? pd.x2 : pd.x1) * T; ty = (p.d ? pd.y2 : pd.y1) * T; }
    const dx = tx - p.x, dy = ty - p.y, dist = Math.hypot(dx, dy);
    let mx = 0, my = 0;
    if (p.t > 0) p.t--;
    else {
      if (dist > 0.001) { const s = Math.min(pd.sp, dist); mx = dx / dist * s; my = dy / dist * s; }
      if (pd.ch < 0 && dist <= pd.sp) { p.d = p.d ? 0 : 1; p.t = 70; }
    }
    p.x += mx; p.y += my;
    for (let i = 0; i < 2; i++) {
      const h = S.h[i];
      if (i === frozen || h.dead || h.gp !== k) continue;
      if (mx) moveHeroX(L, S, i, mx);
      h.y = p.y - HH;
    }
    for (let j = 0; j < S.b.length; j++) {
      const b = S.b[j]; if (b.gp !== k) continue;
      if (mx) pushBox(L, S, j, mx);
      b.y = p.y - BW;
    }
  }
  // герои
  for (let i = 0; i < 2; i++) if (i !== frozen && !S.h[i].dead) stepHero(L, S, i, ins[i] | 0);
  // ящики: гравитация
  for (let j = 0; j < S.b.length; j++) {
    const b = S.b[j];
    b.vy = Math.min(b.vy + P.g, P.maxf);
    let ny = b.y + b.vy; const bot = b.y + BW; let gp = -1, landed = false;
    const list = solids(L, S, b.x, b.y, BW, BW + b.vy + 2, j, _a);
    for (const r of list) {
      if (!ov(b.x, ny, BW, BW, r)) continue;
      if (r.ow && bot > r.y + 0.01) continue;
      if (r.y < bot - 0.01) continue;
      ny = r.y - BW; landed = true; gp = r.k === 'p' ? r.id : -1;
    }
    for (const h of S.h) if (!h.dead && b.x < h.x + HW && b.x + BW > h.x && bot <= h.y + 0.01 && ny + BW > h.y) { ny = h.y - BW; landed = true; }
    if (landed) b.vy = 0;
    b.y = ny; b.gp = gp;
  }
  // кристаллы, опасности, выходы
  let atExit = 0;
  for (let i = 0; i < 2; i++) {
    const h = S.h[i];
    if (i === frozen || h.dead) continue;
    const cx = h.x + HW / 2, cy = h.y + HH / 2;
    for (let k = 0; k < L.crystals.length; k++) {
      const c = L.crystals[k];
      if (!S.c[k] && c.k === i && Math.hypot(c.x * T + 16 - cx, c.y * T + 16 - cy) < 24) S.c[k] = 1;
    }
    if (!pred) {
      const hz = heroHazard(L, S, i);
      if (hz) { h.dead = hz; S.st = 'dead'; S.sT = 0; S.who = i; return; }
    }
    const ex = L.exits[i];
    h.ex = (h.g && Math.abs(cx - (ex.x * T + 16)) <= 10 && Math.abs(h.y + HH - (ex.y + 1) * T) < 3) ? 1 : 0;
    if (h.ex) atExit++;
  }
  if (!pred) {
    if (atExit === 2) { S.w++; if (S.w >= 24) { S.st = 'win'; S.sT = 0; } } else S.w = 0;
  }
}

function stars(L, S) {
  const got = S.c.reduce((a, b) => a + b, 0);
  let s = 1;
  if (got === L.crystals.length) s++;
  if (S.tm / 60 <= L.par) s++;
  return s;
}

const api = { T, COLS, ROWS, HW, HH, BW, P, IN, HERO, TS, LEVELS, level, newState, stepWorld, tile, stars, solids, doorRect, computeChannels };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TC = api;
})(this);
