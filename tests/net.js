// Сетевой тест: две iframe (хост и гость через ?local=1), бот проходит уровень по сети
const { launch, sleep } = require('./cdp.js');
const lvl = +(process.argv[2] || 2), q = process.argv[3] || '';
(async () => {
  const br = await launch({ width: 1280, height: 720 });
  let ok = false;
  try {
    const p = await br.open(`http://localhost:8811/tests/net.html?lvl=${lvl}${q ? '&' + q : ''}`);
    await p.waitFor("RESULT.host && RESULT.join && RESULT.host.scr==='play' && RESULT.join.scr==='play'", 45000);
    console.log('оба в игре');
    const t0 = Date.now(); let shotDone = false, doorsH = {}, doorsJ = {}, seen = [];
    let sync = { hostSeesGuestMoved: false, guestSeesHostMoved: false };
    let h0 = null, j0 = null;
    while (Date.now() - t0 < 120000) {
      const R = await p.evaluate('JSON.parse(JSON.stringify(RESULT))');
      if (!h0 && R.host.h) { h0 = R.host.h; j0 = R.join.other; }
      if (R.host.h && h0 && Math.abs(R.host.h[1][0] - h0[1][0]) > 40) sync.hostSeesGuestMoved = true;
      if (R.join.other && j0 && Math.abs(R.join.other[0] - j0[0]) > 40) sync.guestSeesHostMoved = true;
      const tm = ((Date.now() - t0) / 1000).toFixed(1);
      (R.host.d || []).forEach((d, i) => { if (d > 0.9 && !doorsH[i]) { doorsH[i] = tm; } });
      (R.join.d || []).forEach((d, i) => { if (d > 0.9 && !doorsJ[i]) { doorsJ[i] = tm; } });
      if (!shotDone && Date.now() - t0 > (+process.env.SHOT || 9000)) { await p.shot(__dirname + `/shots/net_lvl${lvl}${q ? '_' + q.replace(/[&=]/g, '') : ''}.png`); shotDone = true;
        console.log('снимок: хост', JSON.stringify(R.host.h), 'гость видит', JSON.stringify(R.join.h), 'другой (интерп.)', JSON.stringify(R.join.other), 'двери', JSON.stringify(R.host.d), JSON.stringify(R.join.d)); }
      if (R.host.won && R.join.won) { ok = true; console.log(`ПОБЕДА у обоих за ${tm} с`); break; }
      if (R.errors.length) { console.log('ошибки бота', R.errors); break; }
      await sleep(250);
    }
    const R = await p.evaluate('JSON.parse(JSON.stringify(RESULT))');
    console.log('двери открылись у хоста (с):', JSON.stringify(doorsH), 'у гостя:', JSON.stringify(doorsJ));
    console.log('синхронизация:', JSON.stringify(sync), 'макс. расхождение предсказания:', R.maxPredErr, 'rtt', R.join.rtt, 'ack', R.host.ack, 'pending', R.join.pending);
    console.log('итог хост', JSON.stringify(R.host), '\nитог гость', JSON.stringify(R.join));
    if (ok) await p.shot(__dirname + `/shots/net_lvl${lvl}_win.png`);
    const errs = p.logs.filter(l => /EXC|error/i.test(l));
    if (errs.length) console.log('ошибки консоли:', errs.slice(0, 5));
  } catch (e) { console.log('СБОЙ', e.message); }
  finally { br.close(); process.exit(ok ? 0 : 1); }
})();
