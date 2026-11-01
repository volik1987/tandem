// node tests/solve.js [номер уровня с 1] [--map]
const C = require('../core.js'), B = require('./bot.js');
const arg = process.argv.slice(2), only = arg.find(a => /^\d+$/.test(a));
let fails = 0;
for (let i = 0; i < C.LEVELS.length; i++) {
  if (only && +only !== i + 1) continue;
  const L = C.level(i);
  if (arg.includes('--map')) {
    const S = C.newState(i), rows = [];
    for (let r = 0; r < C.ROWS; r++) { let s = ''; for (let c = 0; c < C.COLS; c++) s += L.g[r * C.COLS + c]; rows.push(s); }
    const put = (c, r, ch) => { rows[r] = rows[r].slice(0, c) + ch + rows[r].slice(c + 1); };
    L.buttons.forEach(b => put(b.x, b.y, '_')); L.levers.forEach(b => put(b.x, b.y, '/'));
    L.doors.forEach(d => { for (let y = d.y; y < d.y + d.h; y++) put(d.x, y, '|'); });
    L.plats.forEach(p => { for (let x = 0; x < p.w; x++) put(p.x1 + x, p.y1, '~'); });
    L.crystals.forEach(c => put(c.x, c.y, c.k ? 'b' : 'r')); L.boxes.forEach(b => put(b.x, b.y, 'B'));
    put(L.exits[0].x, L.exits[0].y, 'E'); put(L.exits[1].x, L.exits[1].y, 'Q');
    put(L.spawn[0][0], L.spawn[0][1], '1'); put(L.spawn[1][0], L.spawn[1][1], '2');
    console.log(rows.map((s, r) => String(r).padStart(2) + ' ' + s).join('\n'));
  }
  const r = B.runLevel(C, i);
  if (!r.ok) fails++;
  console.log(`${i + 1}. ${L.name}: ${r.ok ? 'ПРОЙДЕН' : 'ПРОВАЛ — ' + r.why}${r.ok ? ` за ${r.time.toFixed(1)} с (пар ${L.par}), кристаллы ${r.crystals}, звёзд ${r.stars}` : ''}`);
}
process.exit(fails ? 1 : 0);
