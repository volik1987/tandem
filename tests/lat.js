const { launch, sleep } = require('./cdp.js');
(async () => {
  const br = await launch();
  const p = await br.open('http://localhost:8811/tests/net.html?lvl=1' + (process.argv[2] ? '&' + process.argv[2] : ''));
  await p.waitFor("RESULT.host && RESULT.join && RESULT.host.scr==='play' && RESULT.join.scr==='play'", 20000);
  for (let i = 0; i < 6; i++) {
    await sleep(500);
    console.log(await p.evaluate("(()=>{const H=document.getElementById('host').contentWindow.TANDEM.G,J=document.getElementById('join').contentWindow.TANDEM.G;return JSON.stringify({hostK:H.S.k, clientAuthK:J.auth&&J.auth.k, clientSeq:J.seq, hostAck:H.ack, q:H.q.length, pend:J.pending.length, rtt:J.rtt})})()"));
  }
  br.close();
})();
