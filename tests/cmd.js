// Команды гостя: выбор уровня, «Заново», «Уровни» — через ненадёжный канал с повтором до подтверждения
const { launch, sleep } = require('./cdp.js');
(async () => {
  const br = await launch();
  const code = String(1000 + Math.floor(Math.random() * 9000));
  try {
    const p = await br.open(`http://localhost:8811/tests/blank.html`);
    await p.evaluate(`document.body.innerHTML='<iframe id=h style="width:640px;height:360px" src="../index.html?local=1&loss=0.3&autohost=${code}"></iframe><iframe id=j style="width:640px;height:360px"></iframe>'; setTimeout(()=>{document.getElementById('j').src='../index.html?local=1&loss=0.3&autojoin=${code}'},800); true`);
    const H = "document.getElementById('h').contentWindow", J = "document.getElementById('j').contentWindow";
    await p.waitFor(`${H}.TANDEM && ${J}.TANDEM && ${H}.TANDEM.G.scr==='levels' && ${J}.TANDEM.G.scr==='levels'`, 20000);
    console.log('1) оба на выборе уровня: OK');
    await p.evaluate(`${J}.document.querySelectorAll('.lv')[0].click(); true`);
    await p.waitFor(`${H}.TANDEM.G.scr==='play' && ${J}.TANDEM.G.scr==='play' && ${H}.TANDEM.G.L.idx===0`, 10000);
    console.log('2) гость выбрал уровень 1 — у обоих игра: OK');
    await sleep(1500);
    const e0 = await p.evaluate(`${H}.TANDEM.G.epoch`);
    await p.evaluate(`${J}.document.getElementById('hudbtn').click(); ${J}.document.getElementById('pRe').click(); true`);
    await p.waitFor(`${H}.TANDEM.G.epoch > ${e0} && ${J}.TANDEM.G.curE === ${H}.TANDEM.G.epoch`, 10000);
    console.log('3) гость нажал «Заново» — хост перезапустил уровень, гость получил новый: OK');
    await p.evaluate(`${J}.document.getElementById('hudbtn').click(); ${J}.document.getElementById('pLv').click(); true`);
    await p.waitFor(`${H}.TANDEM.G.scr==='levels' && ${J}.TANDEM.G.scr==='levels'`, 10000);
    console.log('4) гость нажал «Уровни» — оба на выборе уровня: OK');
    await p.evaluate(`${H}.document.getElementById('bLvBack').click(); true`);
    await p.waitFor(`${J}.document.getElementById('ovl').classList.contains('on') && /Связь потеряна/.test(${J}.document.getElementById('ovlCard').textContent)`, 10000);
    console.log('5) хост вышел — у гостя «Связь потеряна»: OK');
  } catch (e) { console.log('СБОЙ', e.message); } finally { br.close(); }
})();
