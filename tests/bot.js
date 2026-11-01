/* Бот-прохождение уровней «Тандема». Работает и в node (tests/solve.js), и в браузере (index.html?bot=N).
   Решение уровня — генератор, отдающий по тику пару вводов [Уголёк, Капля]. */
(function (root) {
'use strict';
function makeBot(C, L, S, opt = {}) {
  const { T, HW, IN } = C;
  const hx = h => S.h[h].x + HW / 2;
  const st = { cur: '' };
  const pair = (h, i) => h === 0 ? [i, 0] : [0, i];
  function* wait(n) { for (let t = 0; t < n; t++) yield [0, 0]; }
  function* until(fn, max = 1200) { st.cur = 'until(' + [fn,max].filter(x=>typeof x!=='function').join(',') + ')' + ' @' + S.k; for (let t = 0; t < max && !fn(); t++) yield [0, 0]; if (!fn()) throw new Error('until: не дождались'); }
  // идти к центру клетки tx (можно дробное)
  function* go(h, tx, max = 900) { st.cur = 'go(' + [h,tx,max].filter(x=>typeof x!=='function').join(',') + ')' + ' @' + S.k;
    const target = tx * T + 16, LAT = opt.lat || 1;
    let stable = 0;
    for (let t = 0; t < max; t++) {
      const H = S.h[h], dx = target - hx(h), ad = Math.abs(dx), dir = dx > 0 ? IN.R : IN.L;
      if (ad < 3.5 && H.g && (LAT === 1 || Math.abs(H.vx) < 0.15)) {
        if (++stable >= LAT) {
          yield* settle(h);
          if (!opt.verify) return;
          for (let w = 0; w < 20; w++) yield [0, 0]; // по сети: убедиться, что сверка с хостом не сдвинула героя
          if (Math.abs(target - hx(h)) < 4.5) return;
          stable = 0;
        } else yield [0, 0];
        continue;
      }
      stable = 0;
      let i = 0;
      const stop = H.vx * H.vx / (2 * 1.2) + (LAT > 1 ? Math.abs(H.vx) * LAT : 0);
      if (ad > 2 && !(ad < stop && Math.sign(dx) === Math.sign(H.vx))) {
        if (LAT > 1 && ad < 18) { if (Math.abs(H.vx) < 0.2 && t % (LAT + 2) === 0) i = dir; }
        else i = dir;
      }
      yield pair(h, i);
    }
    throw new Error(`go(${h},${tx}) не дошёл: x=${(hx(h) / T).toFixed(2)}`);
  }
  function* settle(h) { for (let t = 0; t < 30 && Math.abs(S.h[h].vx) > 0.1; t++) yield [0, 0]; }
  // прыжок в сторону tx, держим прыжок и направление до приземления
  function* jump(h, tx, max = 200) { st.cur = 'jump(' + [h,tx,max].filter(x=>typeof x!=='function').join(',') + ')' + ' @' + S.k;
    const target = tx * T + 16;
    let left = false;
    { const dx0 = target - hx(h); yield pair(h, Math.abs(dx0) > 3 ? (dx0 > 0 ? IN.R : IN.L) : 0); }
    for (let t = 0; t < max; t++) {
      const H = S.h[h];
      if (t > 2 && !H.g) left = true;
      if (left && H.g) { yield* settle(h); return; }
      const dx = target - hx(h);
      let i = IN.U;
      if (Math.abs(dx) > 3) i |= dx > 0 ? IN.R : IN.L;
      yield pair(h, i);
    }
    throw new Error(`jump(${h},${tx}) не приземлился`);
  }
  // разбег от текущего места и прыжок в точке fromTx
  function* runJump(h, fromTx, tx, back = 1.2) { st.cur = 'runJump(' + [h,fromTx,tx].filter(x=>typeof x!=='function').join(',') + ')' + ' @' + S.k; 
    const dir = Math.sign(tx - fromTx), fx = fromTx * T + 16;
    if (back) yield* go(h, fromTx - dir * back);
    for (let t = 0; t < 200 && (fx - hx(h)) * dir > 0; t++) yield pair(h, dir > 0 ? IN.R : IN.L);
    yield* jump(h, tx);
  }
  function* act(h) { st.cur = 'act(' + [h].filter(x=>typeof x!=='function').join(',') + ')' + ' @' + S.k; yield pair(h, IN.A); yield pair(h, IN.A); yield pair(h, IN.A); yield [0, 0]; yield [0, 0]; yield [0, 0]; }
  function* down(h) { st.cur = 'down(' + [h].filter(x=>typeof x!=='function').join(',') + ')' + ' @' + S.k; yield pair(h, IN.D); yield* wait(20); }
  // толкать ящик j, пока его центр не окажется в клетке tx
  function* push(h, j, tx, max = 900) { st.cur = 'push(' + [h,j,tx,max].filter(x=>typeof x!=='function').join(',') + ')' + ' @' + S.k;
    const target = tx * T + 16;
    for (let t = 0; t < max; t++) {
      const b = S.b[j], bc = b.x + 15, dx = target - bc;
      if (Math.abs(dx) < 3) { yield* settle(h); return; }
      yield pair(h, dx > 0 ? IN.R : IN.L);
    }
    throw new Error(`push ящик ${j} не дошёл до ${tx}: ${(S.b[j].x / T).toFixed(2)}`);
  }
  // ехать на самоходной платформе k: ждать её у края, встать, доехать до другого конца, сойти в exitTx
  function* ride(h, k, exitTx, max = 2400) { st.cur = 'ride(' + [h,k,exitTx,max].filter(x=>typeof x!=='function').join(',') + ')' + ' @' + S.k;
    const pd = L.plats[k], p = () => S.p[k];
    const atEnd = (e) => Math.abs(p().x - e * T) < 3 && Math.abs(p().y - (e === pd.x1 ? pd.y1 : pd.y2) * T) < 3;
    const start = Math.abs(hx(h) - pd.x1 * T) < Math.abs(hx(h) - pd.x2 * T) ? pd.x1 : pd.x2;
    const fin = start === pd.x1 ? pd.x2 : pd.x1;
    yield* until(() => atEnd(start), max);
    yield* go(h, start + pd.w / 2 - 0.5);
    let t = 0;
    while (!atEnd(fin)) {
      if (t++ > max) throw new Error('ride: платформа не доехала');
      const c = p().x + pd.w * T / 2, dx = c - hx(h);
      yield pair(h, Math.abs(dx) > 4 ? (dx > 0 ? IN.R : IN.L) : 0);
    }
    yield* go(h, exitTx);
  }
  function* par(...gens) {
    const it = gens.map(g => g[Symbol.iterator]()), done = gens.map(() => false);
    while (done.includes(false)) {
      const out = [0, 0];
      it.forEach((g, n) => { if (done[n]) return; const r = g.next(); if (r.done) done[n] = true; else { out[0] |= r.value[0]; out[1] |= r.value[1]; } });
      if (done.includes(false)) yield out;
    }
  }
  return { st, wait, until, go, jump, runJump, act, down, push, ride, par, S, L };
}

/* решения: U — Уголёк (0), K — Капля (1) */
const U = 0, K = 1;
const SOLUTIONS = [
  // 1 Первые шаги
  function* (b) {
    yield* b.go(U, 12); yield* b.go(K, 6); yield* b.jump(K, 11);
    yield* b.jump(U, 16); yield* b.go(K, 12);
    yield* b.runJump(U, 17, 21); yield* b.runJump(K, 17, 21);
    for (const h of [U, K]) {
      yield* b.go(h, 31); yield* b.jump(h, 33.5); yield* b.jump(h, 37); yield* b.jump(h, 33.5); yield* b.runJump(h, 32.5, 28.5);
    }
    yield* b.go(K, 26.5); yield* b.go(U, 27); yield* b.runJump(U, 26.5, 22.5); yield* b.go(K, 22);
    yield* b.runJump(K, 21.5, 17.5); yield* b.go(U, 18);
    yield* b.go(U, 4); yield* b.go(K, 7);
  },
  // 2 Вдвоём сподручнее
  function* (b) {
    yield* b.go(K, 5); yield* b.jump(K, 5); yield* b.jump(K, 2); yield* b.jump(K, 5); yield* b.jump(K, 8.5); yield* b.go(K, 9);
    yield* b.until(() => b.S.d[0] > 0.5);
    yield* b.go(U, 16);
    yield* b.until(() => b.S.d[1] > 0.5);
    yield* b.go(K, 20); yield* b.go(K, 35);
    yield* b.go(U, 35);
  },
  // 3 Талая вода
  function* (b) {
    yield* b.go(K, 7); yield* b.act(K); yield* b.go(K, 14);
    yield* b.go(U, 17); yield* b.act(U); yield* b.wait(5);
    for (const h of [U, K]) {
      yield* b.go(h, 30); yield* b.jump(h, 32.5); yield* b.jump(h, 36.5); yield* b.jump(h, 32.5); yield* b.runJump(h, 31.5, 27.5);
    }
    yield* b.go(U, 20); yield* b.go(K, 27); yield* b.go(K, 28.2); yield* b.jump(K, 25.5); yield* b.go(K, 19);
    yield* b.go(K, 13); yield* b.act(K); yield* b.go(K, 6);
    yield* b.go(U, 3);
  },
  // 4 Тяжёлая ноша
  function* (b) {
    yield* b.go(U, 4.5); yield* b.push(U, 0, 12);
    yield* b.until(() => b.S.d[0] > 0.5);
    yield* b.jump(U, 14); yield* b.go(U, 20.5); yield* b.push(U, 1, 25);
    yield* b.go(K, 10); yield* b.jump(K, 14); yield* b.go(K, 20.5);
    for (const h of [U, K]) {
      yield* b.go(h, 23.5); yield* b.jump(h, 25); yield* b.jump(h, 26.5); yield* b.go(h, 27.5);
      yield* b.go(h, 28.5); yield* b.runJump(h, 29.2, 33, 0.7); yield* b.go(h, 34); yield* b.jump(h, 36.5); yield* b.jump(h, 33); yield* b.jump(h, 36.5);
      yield* b.runJump(h, 35.5, 31.5);
    }
    yield* b.runJump(U, 29.5, 25.5);
    yield* b.go(K, 25.5);
    yield* b.go(U, 26); yield* b.push(U, 2, 15);
    yield* b.until(() => b.S.d[1] > 0.6);
    yield* b.jump(U, 13); yield* b.go(U, 3);
    yield* b.runJump(K, 17, 13.5); yield* b.go(K, 6);
  },
  // 5 Подъёмник
  function* (b) {
    yield* b.go(U, 17.5); yield* b.go(U, 9);
    yield* b.go(K, 14.5); yield* b.jump(K, 19); yield* b.go(K, 22); yield* b.go(K, 19); yield* b.jump(K, 14.5);
    yield* b.go(K, 4.5); yield* b.act(U);
    yield* b.until(() => Math.abs(b.S.p[0].y - 12 * 32) < 1);
    yield* b.jump(K, 4.5); yield* b.go(K, 9);
    yield* b.act(U); yield* b.until(() => Math.abs(b.S.p[0].y - 20 * 32) < 1);
    yield* b.go(U, 4.5); yield* b.go(K, 7);
    yield* b.until(() => Math.abs(b.S.p[0].y - 12 * 32) < 1);
    yield* b.go(U, 9); yield* b.go(K, 12); yield* b.go(U, 11.5);
    yield* b.ride(K, 1, 28); yield* b.go(K, 33);
    yield* b.ride(U, 1, 30); yield* b.go(U, 36);
  },
  // 6 Противовес
  function* (b) {
    yield* b.go(K, 10.5); yield* b.push(K, 0, 20);
    yield* b.until(() => b.S.d[0] > 0.6);
    yield* b.go(U, 5); yield* b.jump(U, 9); yield* b.go(U, 15); yield* b.go(U, 8.6); yield* b.jump(U, 4.5);
    yield* b.go(U, 2.5);
    yield* b.jump(K, 22); yield* b.go(K, 23.5); yield* b.runJump(K, 24, 28); yield* b.go(K, 33); yield* b.go(K, 31);
    yield* b.until(() => Math.abs(b.S.p[0].y - 7 * 32) < 1);
    yield* b.go(U, 6); yield* b.go(U, 27); yield* b.runJump(U, 28, 32); yield* b.go(K, 36.5);
    yield* b.go(U, 33); yield* b.go(U, 32); yield* b.act(U);
    yield* b.until(() => Math.abs(b.S.p[1].y - 7 * 32) < 1);
    yield* b.go(K, 22); yield* b.go(U, 31.5); yield* b.runJump(U, 31, 27); yield* b.go(U, 17);
  },
  // 7 Ледяные шлюзы
  function* (b) {
    yield* b.go(K, 4.5); yield* b.jump(K, 8); yield* b.go(K, 9); yield* b.act(K); yield* b.go(K, 18);
    yield* b.go(U, 4.5); yield* b.push(U, 0, 22);
    yield* b.until(() => b.S.d[0] > 0.6);
    yield* b.jump(U, 24.5); yield* b.go(U, 29); yield* b.act(U); yield* b.wait(4);
    yield* b.go(K, 20.5); yield* b.jump(K, 24.5); yield* b.go(K, 29);
    for (const h of [U, K]) {
      yield* b.go(h, 31); yield* b.jump(h, 34); yield* b.jump(h, 37); yield* b.jump(h, 34); yield* b.runJump(h, 33, 29.5);
    }
    yield* b.go(K, 24.5);
    yield* b.go(U, 17); yield* b.act(U);
    yield* b.until(() => Math.abs(b.S.p[0].x - 21 * 32) < 1);
    yield* b.go(K, 19.5); yield* b.go(K, 12.4); yield* b.act(K);
    yield* b.go(K, 6); yield* b.go(U, 3);
  },
  // 8 Вершина
  function* (b) {
    yield* b.go(K, 4.5); yield* b.jump(K, 6.2); yield* b.act(K); yield* b.go(K, 13);
    yield* b.go(U, 3.5); yield* b.push(U, 0, 16);
    yield* b.until(() => b.S.d[0] > 0.6);
    yield* b.jump(U, 18); yield* b.go(U, 21); yield* b.go(K, 14.5); yield* b.jump(K, 18); yield* b.go(K, 20.5);
    yield* b.ride(K, 0, 32);
    yield* b.ride(U, 0, 31);
    yield* b.go(K, 35.5); yield* b.go(U, 32); yield* b.act(U);
    yield* b.until(() => Math.abs(b.S.p[1].y - 7 * 32) < 1);
    yield* b.go(K, 31);
    yield* b.act(U); yield* b.until(() => Math.abs(b.S.p[1].y - 20 * 32) < 1);
    yield* b.go(U, 35.5); yield* b.go(K, 33);
    yield* b.until(() => Math.abs(b.S.p[1].y - 7 * 32) < 1);
    yield* b.go(U, 29); yield* b.act(U); yield* b.wait(4);
    yield* b.go(K, 23); yield* b.go(U, 16); yield* b.act(U);
    yield* b.until(() => Math.abs(b.S.p[2].x - 19 * 32) < 1);
    yield* b.go(K, 18); yield* b.go(K, 12.5); yield* b.act(K);
    yield* b.go(K, 6); yield* b.go(U, 3);
  }
];

function runLevel(C, idx, opts = {}) {
  const L = C.level(idx), S = C.newState(idx), bot = makeBot(C, L, S);
  const gen = SOLUTIONS[idx](bot);
  const where = () => ` [шаг ${bot.st.cur}; У ${(S.h[0].x / 32).toFixed(1)},${(S.h[0].y / 32).toFixed(1)} К ${(S.h[1].x / 32).toFixed(1)},${(S.h[1].y / 32).toFixed(1)}]`;
  const log = [];
  let t = 0;
  try {
    for (const inp of gen) {
      C.stepWorld(L, S, inp);
      if (opts.onTick) opts.onTick(S, inp);
      if (S.st === 'dead') return { ok: false, why: `погиб ${C.HERO[S.who].name} (${S.h[S.who].dead}) на тике ${S.k}` + where(), S };
      if (++t > 60 * 400) return { ok: false, why: 'слишком долго', S };
    }
    for (let i = 0; i < 40 && S.st === 'play'; i++) { C.stepWorld(L, S, [0, 0]); if (opts.onTick) opts.onTick(S, [0, 0]); }
  } catch (e) {
    return { ok: false, why: e.message + where(), S };
  }
  return { ok: S.st === 'win', why: S.st === 'win' ? '' : `не у выходов: ex=${S.h[0].ex},${S.h[1].ex}` + where(), S,
    time: S.tm / 60, crystals: S.c.reduce((a, b) => a + b, 0) + '/' + L.crystals.length, stars: C.stars(L, S) };
}

const api = { makeBot, SOLUTIONS, runLevel };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TBOT = api;
})(this);
