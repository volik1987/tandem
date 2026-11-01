const { launch, sleep } = require('./cdp.js');
(async () => {
  const br = await launch();
  const p = await br.open('http://localhost:8811/tests/net.html?lvl=1');
  await p.waitFor("RESULT.host && RESULT.join && RESULT.host.scr==='play' && RESULT.join.scr==='play'", 20000);
  const m = () => p.evaluate("(()=>{const H=document.getElementById('host').contentWindow.TANDEM.G,J=document.getElementById('join').contentWindow.TANDEM.G;return {hk:H.S.k,js:J.seq,q:H.q.length,pend:J.pending.length,rtt:J.rtt,t:performance.now()}})()");
  const a = await m(); await sleep(3000); const b = await m();
  const dt = (b.t - a.t) / 1000;
  console.log('host ticks/s', ((b.hk - a.hk) / dt).toFixed(1), 'client ticks/s', ((b.js - a.js) / dt).toFixed(1), b);
  br.close();
})();
