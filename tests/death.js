// Гибель и перезапуск: оба бегут вправо, Уголёк падает в воду
const { launch, sleep } = require('./cdp.js');
(async () => {
  const br = await launch();
  try {
    const p = await br.open('http://localhost:8811/index.html?play=1');
    await p.waitFor('window.TANDEM && TANDEM.G.S');
    await p.evaluate('TANDEM.force = 2');
    await p.waitFor("TANDEM.G.S.st === 'dead'", 8000);
    await sleep(250);
    const st = await p.evaluate("JSON.stringify({who: TANDEM.G.S.who, why: TANDEM.G.S.h[TANDEM.G.S.who].dead, msg: document.getElementById('msgDead').textContent})");
    await p.shot(__dirname + '/shots/death.png');
    await p.evaluate('TANDEM.force = 0');
    await p.waitFor("TANDEM.G.S.st === 'play' && TANDEM.G.S.k < 30", 5000);
    console.log('гибель:', st, '→ перезапуск OK');
  } catch (e) { console.log('СБОЙ', e.message); } finally { br.close(); }
})();
