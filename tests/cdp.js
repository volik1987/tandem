// Мини-обвязка над Chrome DevTools Protocol (node 22+, встроенный WebSocket)
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function launch({ width = 1280, height = 720, port = 9333 + Math.floor(Math.random() * 500) } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tandem-chrome-'));
  const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, `--window-size=${width},${height}`,
    '--no-first-run', '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', ...(process.env.CHROME_EXTRA ? process.env.CHROME_EXTRA.split(' ') : []), 'about:blank'], { stdio: 'ignore' });
  let ver;
  for (let i = 0; i < 100; i++) {
    try { ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); break; } catch (e) { await sleep(100); }
  }
  if (!ver) throw new Error('Chrome не запустился');
  const close = () => { try { proc.kill('SIGKILL'); } catch (e) {} try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} };
  return { port, close, open: (url) => openPage(port, url, width, height) };
}
async function openPage(port, url, width, height) {
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  let tgt = list.find(t => t.type === 'page');
  const ws = new WebSocket(tgt.webSocketDebuggerUrl);
  await new Promise((ok, bad) => { ws.onopen = ok; ws.onerror = bad; });
  let id = 0; const wait = new Map(); const logs = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && wait.has(m.id)) { const [ok, bad] = wait.get(m.id); wait.delete(m.id); m.error ? bad(new Error(m.error.message)) : ok(m.result); }
    if (m.method === 'Runtime.consoleAPICalled') logs.push(m.params.type + ': ' + m.params.args.map(a => a.value !== undefined ? a.value : a.description).join(' '));
    if (m.method === 'Runtime.exceptionThrown') logs.push('EXC: ' + (m.params.exceptionDetails.exception ? m.params.exceptionDetails.exception.description : m.params.exceptionDetails.text));
  };
  const send = (method, params = {}) => new Promise((ok, bad) => { const i = ++id; wait.set(i, [ok, bad]); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url });
  await sleep(800);
  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text));
    return r.result.value;
  };
  const shot = async (file) => {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
  };
  const waitFor = async (expr, ms = 15000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { try { if (await evaluate(expr)) return true; } catch (e) {} await sleep(100); }
    throw new Error('waitFor timeout: ' + expr);
  };
  return { send, evaluate, shot, waitFor, logs, close: () => ws.close() };
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
module.exports = { launch, sleep };
