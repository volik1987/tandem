const C = require('../core.js'), B = require('./bot.js');
const lv = +process.argv[2] - 1, from = +(process.argv[3] || 0), to = +(process.argv[4] || 99999), every = +(process.argv[5] || 10);
let last = '';
const r = B.runLevel(C, lv, { onTick: (S, inp) => { if (S.k >= from && S.k <= to && S.k % every === 0) console.log(S.k, inp.join(','), S.h.map(h => `${(h.x / 32).toFixed(2)},${(h.y / 32).toFixed(2)} v${h.vx.toFixed(1)},${h.vy.toFixed(1)} g${h.g}`).join(' | '), 'p', S.p.map(p => (p.x / 32).toFixed(1) + ',' + (p.y / 32).toFixed(1)).join(' '), 'd', S.d.map(d => d.toFixed(2)).join(','), 'ch', S.ch.join('')); } });
console.log(r.ok, r.why);
