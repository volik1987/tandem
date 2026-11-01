const { launch, sleep } = require('./cdp.js');
(async () => {
  const br = await launch();
  try {
    const p = await br.open('http://localhost:8811/index.html?local=1');
    await sleep(500);
    await p.evaluate("document.getElementById('bHost').click()");
    await p.waitFor("/^\\d{4}$/.test(document.getElementById('codeBig').textContent)", 8000);
    await sleep(1500);
    await p.shot(__dirname + '/shots/lobby.png');
    await p.evaluate("document.getElementById('bLobbyBack').click()");
    await sleep(300);
    await p.evaluate("document.getElementById('bJoin').click()");
    await sleep(200);
    await p.evaluate("document.getElementById('codeIn').value='9999'; document.getElementById('bJoinGo').click()");
    await p.waitFor("document.getElementById('joinStatus').classList.contains('err')", 8000);
    console.log('ошибка при неверном коде:', await p.evaluate("document.getElementById('joinStatus').textContent"));
    await p.shot(__dirname + '/shots/join_error.png');
  } catch (e) { console.log('СБОЙ', e.message); } finally { br.close(); }
})();
