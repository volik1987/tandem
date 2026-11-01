// Сенсорное управление: эмуляция телефона 844x390, касания джойстика и кнопок
const { launch, sleep } = require('./cdp.js');
(async () => {
  const br = await launch({ width: 844, height: 390 });
  try {
    const p = await br.open('about:blank');
    await p.send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 2, mobile: true });
    await p.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await p.send('Page.navigate', { url: 'http://localhost:8811/index.html?play=1' });
    await p.waitFor('window.TANDEM && TANDEM.G.S && document.body.classList.contains("touch")');
    await sleep(500);
    const x0 = await p.evaluate('TANDEM.G.S.h[0].x');
    const tp = (type, pts) => p.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id })) });
    // Уголёк (левая половина): палец на джойстик и вправо
    await tp('touchStart', [[80, 250, 1]]);
    for (let i = 1; i <= 6; i++) { await tp('touchMove', [[80 + i * 12, 250, 1]]); await sleep(16); }
    await sleep(600);
    const x1 = await p.evaluate('TANDEM.G.S.h[0].x');
    // второй палец (Капля, правая половина): джойстик влево + прыжок третьим пальцем, мультитач
    const jb = await p.evaluate('(()=>{const r=document.querySelectorAll(".tb.jump")[1].getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()');
    const kx0 = await p.evaluate('TANDEM.G.S.h[1].y');
    await tp('touchMove', [[152, 250, 1], [500, 250, 2]]);
    await tp('touchMove', [[152, 250, 1], [470, 250, 2]]);
    await tp('touchMove', [[152, 250, 1], [440, 250, 2], [jb[0], jb[1], 3]]);
    await sleep(150);
    const ky = await p.evaluate('TANDEM.G.S.h[1].y');
    await sleep(500);
    await p.shot(__dirname + '/shots/touch.png');
    await tp('touchEnd', []);
    const st = await p.evaluate('JSON.stringify(TANDEM.G.S.h.map(h=>[h.x.toFixed(0),h.y.toFixed(0)]))');
    console.log('Уголёк x:', x0.toFixed(1), '->', x1.toFixed(1), x1 > x0 + 30 ? 'OK (идёт вправо)' : 'НЕ ДВИГАЕТСЯ');
    console.log('Капля y до/во время прыжка:', kx0.toFixed(1), ky.toFixed(1), ky < kx0 - 10 ? 'OK (прыгнула)' : 'НЕТ ПРЫЖКА', 'итог', st);
    console.log(p.logs.filter(l => /EXC|error/i.test(l)).join('\n'));
  } finally { br.close(); }
})();
