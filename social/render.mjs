// Renders social/status.html to social/out/478breathing-status-<lang>.mp4
// (1080x1920, 30 fps, H.264 + AAC with the app's own sounds).
// Usage: node social/render.mjs [de|en] [--audio-only]   (default: de)
//        --audio-only writes just the soundtrack (out/478breathing-audio.wav), handy for
//        checking levels without rendering 1,290 frames.
// Needs Google Chrome and ffmpeg. Drives headless Chrome over the DevTools
// Protocol, calls the page's renderAt(t) per frame (frame-exact), and lets the
// page render its soundtrack offline through audio.js (renderAudio()).
import { spawn, spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const lang = process.argv[2] === 'en' ? 'en' : 'de';
const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(ROOT, 'out');
const WORK = join(OUT_DIR, '.work-' + lang);
const OUT = join(OUT_DIR, `478breathing-status-${lang}.mp4`);
const FPS = 30;
const W = 1080, H = 1920;

rmSync(WORK, { recursive: true, force: true });
mkdirSync(join(WORK, 'frames'), { recursive: true });

const port = await new Promise(r => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); });
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${join(WORK, 'chrome-profile')}`,
  '--hide-scrollbars', `--window-size=${W},${H}`, '--force-device-scale-factor=1',
  '--autoplay-policy=no-user-gesture-required',
  '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));

let targets = [];
for (let i = 0; i < 100; i++) {
  try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.find(t => t.type === 'page')) break; } catch {}
  await sleep(200);
}
const page = targets.find(t => t.type === 'page');
if (!page) { chrome.kill(); throw new Error('Chrome did not start'); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let id = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const { r, j } = pending.get(m.id); pending.delete(m.id); m.error ? j(new Error(JSON.stringify(m.error))) : r(m.result); } };
const send = (method, params = {}) => new Promise((r, j) => { const i = ++id; pending.set(i, { r, j }); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => { const res = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails)); return res.result.value; };

await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'file://' + join(ROOT, 'status.html') + `?render=1&lang=${lang}` });
for (let i = 0; ; i++) {
  let ok = false; try { ok = await ev('document.body && document.body.dataset.ready === "1"'); } catch {}
  if (ok) break; if (i > 150) throw new Error('page not ready'); await sleep(100);
}
const DURATION = await ev('window.DURATION');

// soundtrack first (offline, takes a moment)
const wav = await ev('renderAudio()');
writeFileSync(join(WORK, 'audio.wav'), Buffer.from(wav, 'base64'));
console.log('audio rendered');
if (process.argv.includes('--audio-only')) {
  writeFileSync(join(OUT_DIR, '478breathing-audio.wav'), Buffer.from(wav, 'base64'));
  try { await send('Browser.close'); } catch {}
  ws.close(); await sleep(300); try { chrome.kill(); } catch {}
  rmSync(WORK, { recursive: true, force: true });
  console.log('done:', join(OUT_DIR, '478breathing-audio.wav'));
  process.exit(0);
}

const N = Math.round(DURATION * FPS);
for (let n = 0; n < N; n++) {
  await ev(`renderAt(${n / FPS})`);
  await ev('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(1))))');
  const { data } = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: W, height: H, scale: 1 } });
  writeFileSync(join(WORK, 'frames', `f_${String(n).padStart(5, '0')}.png`), Buffer.from(data, 'base64'));
  if (n % 150 === 0) console.log(`frame ${n}/${N}`);
}
try { await send('Browser.close'); } catch {}
ws.close(); await sleep(500); try { chrome.kill(); } catch {}

const ff = spawnSync('ffmpeg', ['-y', '-loglevel', 'error',
  '-framerate', String(FPS), '-i', join(WORK, 'frames', 'f_%05d.png'),
  '-i', join(WORK, 'audio.wav'),
  '-af', `afade=t=out:st=${DURATION - 1.5}:d=1.5`,
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.1',
  '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', OUT], { stdio: 'inherit' });
if (ff.status !== 0) throw new Error('ffmpeg failed');
rmSync(WORK, { recursive: true, force: true });
console.log('done:', OUT);
