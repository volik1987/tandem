// Проверки правил: стихии, двери, лёд, детерминизм
const C = require('../core.js');
let fail = 0; const ok = (c, m) => { console.log((c ? 'OK  ' : 'FAIL') + ' ' + m); if (!c) fail++; };
function run(lv, ins, n) { const L = C.level(lv), S = C.newState(lv); for (let i = 0; i < n && S.st === 'play'; i++) C.stepWorld(L, S, ins); return S; }
// уровень 1: оба бегут вправо — Капля сгорает в лаве (кол. 8–9) раньше, чем Уголёк дойдёт до воды
let S = run(0, [C.IN.R, C.IN.R], 400);
ok(S.st === 'dead' && S.who === 1 && S.h[1].dead === 'lava', 'Капля гибнет в лаве');
// только Уголёк бежит вправо — проходит лаву и гаснет в воде
S = run(0, [C.IN.R, 0], 400);
ok(S.st === 'dead' && S.who === 0 && S.h[0].dead === 'water', 'Уголёк проходит лаву и гаснет в воде');
// уровень 2: Уголёк упирается в закрытую дверь (кол. 12)
S = run(1, [C.IN.R, 0], 200);
ok(S.st === 'play' && S.h[0].x + C.HW <= 12 * 32 + 0.01, 'закрытая дверь держит героя');
// уровень 3: Капля не может растопить лёд, Уголёк может
{ const L = C.level(2), S = C.newState(2); S.h[1].x = 17 * 32 - C.HW; S.h[0].x = 2 * 32;
  C.stepWorld(L, S, [0, C.IN.A]); ok(C.tile(L, S, 18, 19) === 'I', 'Капля не растапливает лёд');
  S.h[0].x = 17 * 32 - C.HW; C.stepWorld(L, S, [0, 0]); C.stepWorld(L, S, [C.IN.A, 0]); ok(C.tile(L, S, 18, 19) === '.', 'Уголёк растапливает лёд'); }
// детерминизм: два прогона одинаковы
{ const B = require('./bot.js'); const a = B.runLevel(C, 7).S, b = B.runLevel(C, 7).S; ok(JSON.stringify(a) === JSON.stringify(b), 'физика детерминирована'); }
process.exit(fail ? 1 : 0);
