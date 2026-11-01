// Скриншоты меню, выбора уровней и уровней (бот играет в браузере)
const { launch, sleep } = require('./cdp.js');
const BASE = 'http://localhost:8811/';
(async () => {
  const br = await launch({ width: 1280, height: 720 });
  try {
    let p = await br.open(BASE + 'index.html');
    await sleep(1200);
    await p.shot(__dirname + '/shots/menu.png');
    await p.evaluate("document.getElementById('bLocal').click()");
    await sleep(700);
    await p.shot(__dirname + '/shots/levels.png');
    console.log('logs:', p.logs.join('\n'));
    p.close();
    const lv = process.argv[2] ? process.argv[2].split(',').map(Number) : [1, 3, 5, 8];
    for (const n of lv) {
      p = await br.open(BASE + `index.html?bot=${n}`);
      await p.waitFor('window.TANDEM && TANDEM.G.S');
      const at = +(process.argv[3] || 700);
      await p.waitFor(`TANDEM.G.S.k > ${at}`, 60000);
      await p.shot(__dirname + `/shots/level${n}.png`);
      const r = await p.evaluate('JSON.stringify({k:TANDEM.G.S.k, st:TANDEM.G.S.st})');
      console.log('level', n, r, p.logs.slice(0, 5).join(' | '));
      p.close();
    }
  } finally { br.close(); }
})();
