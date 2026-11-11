(() => {
'use strict';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

let data = null, orig = null, anim = null, fname = 'emoji', playing = true, scrubbing = false, speed = 1;
let colorGroups = [];            // [{hex, arrs:[...]}]
let checkToken = 0;

/* ---------- утилиты ---------- */
function toast(msg, ms = 3200) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), ms);
}
async function gunzip(buf) {
  const s = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(s).text();
}
async function gzip(str) {
  const s = new Blob([str]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
const clamp = v => Math.max(0, Math.min(1, v));
const toHex = a => '#' + [0, 1, 2].map(i => Math.round(clamp(a[i]) * 255).toString(16).padStart(2, '0')).join('');
const fromHex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
const safeName = s => (s || 'emoji').replace(/\.[^.]+$/, '').replace(/[^\p{L}\p{N}_-]+/g, '_');
function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* ---------- загрузка файлов ---------- */
async function openFiles(files) {
  const list = [...files];
  if (!list.length) return;
  $('#aepNote').hidden = true;
  let loaded = false;
  for (const f of list) {
    const ext = f.name.split('.').pop().toLowerCase();
    try {
      if (ext === 'aep') { await showAep(f); continue; }
      if (loaded) continue;
      const buf = await f.arrayBuffer();
      let text;
      const u = new Uint8Array(buf);
      if (ext === 'tgs' || (u[0] === 0x1f && u[1] === 0x8b)) text = await gunzip(buf);
      else if (ext === 'lottie') { toast('формат .lottie (zip) пока не поддерживается — открой .json или .tgs'); continue; }
      else text = new TextDecoder().decode(buf);
      const obj = JSON.parse(text);
      if (!obj.layers || !obj.w) throw new Error('это не Lottie-анимация');
      loadData(obj, f.name);
      loaded = true;
    } catch (e) {
      console.error(e);
      toast('не удалось открыть «' + f.name + '»: ' + e.message);
    }
  }
}

async function showAep(f) {
  const u = new Uint8Array(await f.arrayBuffer());
  const names = new Set();
  const dv = new DataView(u.buffer);
  const dec = new TextDecoder('utf-8', { fatal: false });
  for (let i = 0; i < u.length - 8 && names.size < 14; i++) {
    if (u[i] === 0x55 && u[i + 1] === 0x74 && u[i + 2] === 0x66 && u[i + 3] === 0x38) { // "Utf8"
      const n = dv.getUint32(i + 4, false);
      if (n > 1 && n < 80 && i + 8 + n <= u.length) {
        const s = dec.decode(u.subarray(i + 8, i + 8 + n)).replace(/\0/g, '').trim();
        if (/[\p{L}]/u.test(s) && !/[\u0000-\u001f]/.test(s)) names.add(s);
      }
    }
  }
  const ok = u[0] === 0x52 && u[1] === 0x49 && u[2] === 0x46 && u[3] === 0x58;
  const n = $('#aepNote');
  n.hidden = false;
  n.textContent = (ok ? '«' + f.name + '» — проект After Effects. ' : '«' + f.name + '» не похож на файл After Effects. ') +
    'Браузер не умеет рисовать .aep напрямую: в After Effects экспортируй композицию через Bodymovin / LottieFiles (получится .json) и открой её здесь.' +
    (names.size ? ' Названия внутри проекта: ' + [...names].slice(0, 8).join(', ') + '.' : '');
  showControlsIfNeeded();
}

function showControlsIfNeeded() {
  if (!data) { $('#empty').hidden = false; }
}

/* ---------- загрузка данных и рендер ---------- */
function loadData(obj, name) {
  orig = structuredClone(obj);
  data = obj;
  fname = safeName(name);
  $('#empty').hidden = true;
  $('#stageBox').hidden = false;
  $('#controls').hidden = false;
  ['btnJson', 'btnTgs', 'btnShim', 'btnReset'].forEach(id => ($('#' + id).disabled = false));
  render(false);
  buildColors();
  runChecks();
  updateMeta();
}

function render(keep = true) {
  let frame = 0;
  if (anim) { frame = anim.currentFrame; anim.destroy(); }
  anim = lottie.loadAnimation({
    container: $('#stage'), renderer: 'svg', loop: true, autoplay: playing,
    animationData: structuredClone(data), rendererSettings: { preserveAspectRatio: 'xMidYMid meet' }
  });
  anim.setSpeed(speed);
  anim.addEventListener('DOMLoaded', () => {
    const sc = $('#scrub'); sc.max = Math.max(1, Math.floor(anim.totalFrames) - 1);
    if (keep) playing ? anim.goToAndPlay(frame, true) : anim.goToAndStop(frame, true);
  });
  anim.addEventListener('enterFrame', () => {
    if (scrubbing) return;
    $('#scrub').value = Math.floor(anim.currentFrame);
    $('#frameInfo').textContent = Math.floor(anim.currentFrame) + ' / ' + Math.floor(anim.totalFrames);
  });
}

function updateMeta() {
  const dur = (data.op - data.ip) / data.fr;
  $('#meta').textContent = `${fname} · ${data.w}×${data.h} · ${data.fr} fps · ${dur.toFixed(2)} с`;
}

/* ---------- цвета ---------- */
function walk(node, cb) {
  if (Array.isArray(node)) { node.forEach(n => walk(n, cb)); return; }
  if (node && typeof node === 'object') {
    if ((node.ty === 'fl' || node.ty === 'st') && node.c) cb(node.c);
    for (const k in node) walk(node[k], cb);
  }
}
function collectColors() {
  const map = new Map();
  const add = arr => {
    if (!Array.isArray(arr) || arr.length < 3 || typeof arr[0] !== 'number') return;
    const h = toHex(arr);
    if (!map.has(h)) map.set(h, []);
    map.get(h).push(arr);
  };
  walk(data, c => {
    if (c.a === 1 && Array.isArray(c.k)) c.k.forEach(kf => { add(kf.s); add(kf.e); });
    else add(c.k);
  });
  colorGroups = [...map].map(([hex, arrs]) => ({ hex, arrs })).sort((a, b) => b.arrs.length - a.arrs.length);
}
function buildColors() {
  collectColors();
  const box = $('#colors'); box.innerHTML = '';
  const sel = $('#shimTarget'); sel.innerHTML = '<option value="all">на все цвета</option>';
  if (!colorGroups.length) { box.innerHTML = '<p class="muted">в этой анимации нет заливок и обводок</p>'; return; }
  colorGroups.forEach(g => {
    const chip = document.createElement('label'); chip.className = 'chip'; chip.style.background = g.hex;
    chip.title = g.hex;
    const inp = document.createElement('input'); inp.type = 'color'; inp.value = g.hex;
    const cnt = document.createElement('small'); cnt.textContent = g.arrs.length;
    inp.addEventListener('input', () => {
      const rgb = fromHex(inp.value);
      g.arrs.forEach(a => { a[0] = rgb[0]; a[1] = rgb[1]; a[2] = rgb[2]; });
      chip.style.background = inp.value;
      cancelAnimationFrame(buildColors.raf);
      buildColors.raf = requestAnimationFrame(() => render(true));
    });
    inp.addEventListener('change', buildColors);   // объединяем одинаковые цвета
    chip.append(inp, cnt); box.append(chip);
    const o = document.createElement('option'); o.value = g.hex; o.textContent = g.hex + ' (' + g.arrs.length + ')';
    sel.append(o);
  });
}

/* ---------- перелив ---------- */
function applyShimmer() {
  const pal = $$('#pal input').map(i => fromHex(i.value));
  const target = $('#shimTarget').value;
  const ip = data.ip, op = data.op, n = pal.length;
  let idx = 0, count = 0;
  walk(data, c => {
    if (c.a === 1) return;                         // уже анимированные не трогаем
    const cur = c.k;
    if (!Array.isArray(cur) || typeof cur[0] !== 'number') return;
    if (target !== 'all' && toHex(cur) !== target) return;
    const kfs = [];
    for (let j = 0; j <= n; j++) {
      const t = ip + (op - ip) * j / n;
      const col = pal[(j + idx) % n];
      const kf = { t, s: [col[0], col[1], col[2], 1] };
      if (j < n) { kf.i = { x: [0.5], y: [1] }; kf.o = { x: [0.5], y: [0] }; }
      kfs.push(kf);
    }
    c.a = 1; c.k = kfs; idx++; count++;
  });
  if (!count) { toast('нет статичных цветов для перелива'); return; }
  render(true); buildColors(); runChecks();
  toast('перелив добавлен: ' + count);
}

/* ---------- проверка Telegram ---------- */
async function runChecks() {
  const tok = ++checkToken;
  const dur = (data.op - data.ip) / data.fr;
  const items = [];
  const add = (st, txt) => items.push([st, txt]);
  data.w === 512 && data.h === 512 ? add('ok', 'размер 512×512') : add('bad', `размер ${data.w}×${data.h}, нужен 512×512`);
  [30, 60].includes(Math.round(data.fr)) ? add('ok', data.fr + ' кадров/с') : add('bad', data.fr + ' кадров/с, нужно 30 или 60');
  dur <= 3.01 ? add('ok', 'длительность ' + dur.toFixed(2) + ' с') : add('bad', 'длительность ' + dur.toFixed(2) + ' с, максимум 3 с');
  const hasImg = (data.assets || []).some(a => a.p) || JSON.stringify(data.layers).includes('"ty":2');
  hasImg ? add('bad', 'есть растровые изображения — в TGS их нельзя') : add('ok', 'только векторная графика');
  const bytes = (await gzip(JSON.stringify(data))).length;
  if (tok !== checkToken) return;
  bytes <= 65536 ? add('ok', 'tgs ' + (bytes / 1024).toFixed(1) + ' КБ из 64') : add('bad', 'tgs ' + (bytes / 1024).toFixed(1) + ' КБ, максимум 64');
  const ul = $('#checks'); ul.innerHTML = '';
  items.forEach(([st, txt]) => { const li = document.createElement('li'); li.className = st; li.textContent = txt; ul.append(li); });
}

/* ---------- экспорт ---------- */
$('#btnJson').onclick = () => download(new Blob([JSON.stringify(data)], { type: 'application/json' }), fname + '.json');
$('#btnTgs').onclick = async () => {
  const bytes = await gzip(JSON.stringify(data));
  download(new Blob([bytes], { type: 'application/x-tgsticker' }), fname + '.tgs');
  if (bytes.length > 65536) toast('файл больше 64 КБ — Telegram его не примет');
};

/* ---------- плеер ---------- */
$('#play').onclick = () => {
  if (!anim) return;
  playing = !playing; playing ? anim.play() : anim.pause();
  $('#play').textContent = playing ? '❚❚' : '▶';
};
const sc = $('#scrub');
sc.addEventListener('input', () => { scrubbing = true; anim && anim.goToAndStop(+sc.value, true); $('#frameInfo').textContent = sc.value + ' / ' + Math.floor(anim.totalFrames); });
sc.addEventListener('change', () => { scrubbing = false; if (playing) anim.play(); });
$('#speed').addEventListener('input', e => { speed = +e.target.value; $('#spdOut').textContent = speed + '×'; anim && anim.setSpeed(speed); });
$$('#bgSeg button').forEach(b => b.onclick = () => {
  $$('#bgSeg button').forEach(x => x.classList.toggle('on', x === b));
  $('#stageBox').className = 'stage bg-' + b.dataset.bg;
});
$('#btnShim').onclick = applyShimmer;
$('#btnReset').onclick = () => { if (!orig) return; data = structuredClone(orig); render(true); buildColors(); runChecks(); };

/* ---------- открытие файлов, drag&drop ---------- */
const fileInput = $('#file');
['btnOpen', 'emptyOpen'].forEach(id => ($('#' + id).onclick = () => fileInput.click()));
fileInput.onchange = () => { openFiles(fileInput.files); fileInput.value = ''; };
const drop = $('#drop');
['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('drag'); }));
['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('drag'); }));
drop.addEventListener('drop', e => openFiles(e.dataTransfer.files));

/* ---------- выбор эмодзи ---------- */
const modal = $('#emojiModal');
let curGroup = Object.keys(window.EMOJI_GROUPS)[0];
function openEmoji() { modal.hidden = false; drawTabs(); drawGrid(); }
function drawTabs() {
  const q = $('#emojiSearch').value.trim().toLowerCase();
  const tabs = $('#emojiTabs'); tabs.innerHTML = '';
  Object.keys(window.EMOJI_GROUPS).filter(g => g.includes(q)).forEach(g => {
    const b = document.createElement('button'); b.textContent = g;
    if (g === curGroup) b.className = 'on';
    b.onclick = () => { curGroup = g; drawTabs(); drawGrid(); };
    tabs.append(b);
  });
}
function drawGrid() {
  const grid = $('#emojiGrid'); grid.innerHTML = '';
  (window.EMOJI_GROUPS[curGroup] || '').split(' ').filter(Boolean).forEach(ch => {
    const b = document.createElement('button'); b.textContent = ch; b.title = ch;
    b.onclick = () => pickEmoji(ch, b);
    grid.append(b);
  });
}
async function pickEmoji(ch, btn) {
  const cps = [...ch].map(c => c.codePointAt(0).toString(16));
  const variants = [cps.join('_')];
  if (cps.includes('fe0f')) variants.push(cps.filter(c => c !== 'fe0f').join('_'));
  btn.classList.add('loading');
  try {
    let obj = null;
    for (const v of variants) {
      try {
        const r = await fetch(`https://fonts.gstatic.com/s/e/notoemoji/latest/${v}/lottie.json`);
        if (r.ok) { obj = await r.json(); break; }
      } catch (_) { /* пробуем следующий вариант */ }
    }
    if (!obj) throw new Error('для этого эмодзи нет анимации');
    modal.hidden = true;
    loadData(obj, 'emoji_' + variants[0]);
  } catch (e) { toast(e.message); }
  finally { btn.classList.remove('loading'); }
}
['btnEmoji', 'emptyEmoji'].forEach(id => ($('#' + id).onclick = openEmoji));
$('#closeEmoji').onclick = () => (modal.hidden = true);
modal.addEventListener('click', e => { if (e.target === modal) modal.hidden = true; });
$('#emojiSearch').addEventListener('input', () => { const g = Object.keys(window.EMOJI_GROUPS).filter(x => x.includes($('#emojiSearch').value.trim().toLowerCase())); if (g.length && !g.includes(curGroup)) curGroup = g[0]; drawTabs(); drawGrid(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') modal.hidden = true; });
})();
