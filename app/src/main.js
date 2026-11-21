import { LAYOUTS, GRADES, renderPoster, drawCover, exportPNG, applyQueryParams } from './cover.js';

const SAMPLE_FILES = ['boulevard.jpg', 's2.jpg', 's3.jpg', 's5.jpg', 's6.jpg', 'pier.jpg', 's1.jpg', 's4.jpg'];
const ROLE_NAMES = ['THE DRIVER', 'THE BOSS', 'THE INSIDER', 'THE RIDER', 'THE COURIER', 'THE LOOKOUT', 'THE MECHANIC', 'THE ANGLER'];
const PLACES = ['OCEAN DRIVE · 6:42 PM', 'CORAL CAUSEWAY · 7:15 PM', 'NEON AVENUE · 9:03 PM', 'THE PIER · 5:58 PM'];
const DEFAULTS = {
  layout: 'hero', grade: 'sunset', gradeStrength: 72, ink: 42, halftone: 18, grain: 16, glow: 34,
  title: 'PALM FEVER', subtitle: 'one last summer', tagline: 'A CITY THAT NEVER COOLS',
  quote: 'A wild ride under neon skies.', outlet: 'THE SUNSET POST', ticket: 'VOL. 1', ending: 'COMING SOON',
  showQuote: true, showSeal: true, showBarcode: true, showBilling: true, showPalm: true, titleSize: 100,
};
const state = { ...DEFAULTS, photos: [], panels: [], selected: 0 };
const sampleRoot = './samples/';
const $ = (id) => document.getElementById(id);
const preview = $('poster');
const frame = $('previewFrame');
const ctx = preview.getContext('2d');
const imageCache = new Map();
const undoStack = [];
const future = [];
let drag = null;
let rendering = false;

function snapshot() {
  return JSON.stringify({ ...state, photos: state.photos.map(({ src, name }) => ({ src, name })), panels: state.panels });
}
function commit() {
  const value = snapshot();
  if (undoStack.at(-1) !== value) undoStack.push(value);
  if (undoStack.length > 60) undoStack.shift();
  future.length = 0;
  syncHistoryButtons();
}
function restore(value) {
  Object.assign(state, JSON.parse(value));
  render();
  syncControls();
}
function undo() {
  if (undoStack.length < 2) return;
  future.push(undoStack.pop());
  restore(undoStack.at(-1));
}
function redo() {
  if (!future.length) return;
  const value = future.pop();
  undoStack.push(value);
  restore(value);
}
function syncHistoryButtons() {
  $('undo').disabled = undoStack.length < 2;
  $('redo').disabled = future.length === 0;
}
function layoutKeys() {
  return Array.isArray(LAYOUTS) ? LAYOUTS.map((item) => typeof item === 'string' ? item : item.id) : Object.keys(LAYOUTS);
}
function gradeKeys() {
  return Array.isArray(GRADES) ? GRADES.map((item) => typeof item === 'string' ? item : item.id) : Object.keys(GRADES);
}
function labelFor(source, id) {
  const item = Array.isArray(source) ? source.find((entry) => entry.id === id) : source[id];
  return (typeof item === 'object' && (item.label || item.name || item.title)) || id.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[-_]/g, ' ');
}
function makePanel(index, previous) {
  return { photo: previous?.photo ?? (index % Math.max(state.photos.length, 1)), zoom: previous?.zoom ?? 1,
    ox: previous?.ox ?? 0, oy: previous?.oy ?? 0, flip: previous?.flip ?? false,
    fx: previous?.fx ?? 0.5, fy: previous?.fy ?? 0.5,
    role: previous?.role ?? ROLE_NAMES[index % ROLE_NAMES.length],
    location: previous?.location ?? PLACES[index % PLACES.length] };
}
function panelCount(layout = state.layout) {
  const counts = { hero: 7, hero3: 4, six: 6, diagonal: 3, seven: 7, nine: 9, titleband: 5, popout: 6 };
  return counts[layout] || 7;
}
function setLayout(id) {
  if (!layoutKeys().includes(id)) return;
  const old = state.panels;
  state.layout = id;
  state.panels = Array.from({ length: panelCount(id) }, (_, i) => makePanel(i, old[i]));
  state.selected = Math.min(state.selected, state.panels.length - 1);
  commit();
  render();
}
function setGrade(id) {
  if (!gradeKeys().includes(id)) return;
  state.grade = id;
  commit();
  render();
}
function imageFor(photo) {
  if (!photo) return null;
  if (!imageCache.has(photo.src)) {
    const img = new Image();
    imageCache.set(photo.src, img);
    img.onload = render;
    img.src = photo.src;
  }
  const img = imageCache.get(photo.src);
  return img.complete && img.naturalWidth ? img : null;
}
function posterState() {
  return { ...state, photos: state.photos, panels: state.panels, width: preview.width, height: preview.height };
}
function drawFallback() {
  ctx.clearRect(0, 0, preview.width, preview.height);
  ctx.fillStyle = '#170f25';
  ctx.fillRect(0, 0, preview.width, preview.height);
  const cols = state.layout === 'diagonal' ? 3 : 3;
  const rows = Math.ceil(state.panels.length / cols);
  const cellW = preview.width / cols;
  const cellH = preview.height * 0.76 / rows;
  state.panels.forEach((panel, i) => {
    const x = (i % cols) * cellW;
    const y = Math.floor(i / cols) * cellH;
    const img = imageFor(state.photos[panel.photo]);
    if (img) {
      const scale = Math.max(cellW / img.width, cellH / img.height) * panel.zoom;
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.save();
      ctx.beginPath(); ctx.rect(x, y, cellW, cellH); ctx.clip();
      if (panel.flip) { ctx.translate(x + cellW, 0); ctx.scale(-1, 1); }
      ctx.drawImage(img, x + (cellW - w) / 2 + panel.ox, y + (cellH - h) / 2 + panel.oy, w, h);
      ctx.restore();
    }
    ctx.strokeStyle = '#f6c76a'; ctx.lineWidth = 4; ctx.strokeRect(x, y, cellW, cellH);
  });
  const shade = ctx.createLinearGradient(0, preview.height * 0.48, 0, preview.height);
  shade.addColorStop(0, 'rgba(22,8,31,0)'); shade.addColorStop(1, 'rgba(17,8,29,.96)');
  ctx.fillStyle = shade; ctx.fillRect(0, 0, preview.width, preview.height);
  ctx.textAlign = 'center'; ctx.fillStyle = '#ffd573'; ctx.font = 'bold 94px Impact, sans-serif';
  ctx.fillText(state.title || 'PALM FEVER', preview.width / 2, preview.height * 0.78, preview.width * 0.92);
  ctx.fillStyle = '#fff1d2'; ctx.font = 'italic 30px Georgia, serif'; ctx.fillText(state.subtitle, preview.width / 2, preview.height * 0.85);
  ctx.fillStyle = '#ffc454'; ctx.font = 'bold 16px sans-serif'; ctx.fillText(state.tagline, preview.width / 2, preview.height * 0.94);
}
function render() {
  if (rendering) return;
  rendering = true;
  const box = frame.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const aspect = 1;
  const maxW = Math.max(260, box.width - 36);
  const maxH = Math.max(280, box.height - 48);
  const cssW = Math.min(maxW, maxH * aspect);
  const cssH = cssW / aspect;
  preview.style.width = cssW + 'px'; preview.style.height = cssH + 'px';
  preview.width = Math.round(cssW * ratio); preview.height = Math.round(cssH * ratio);
  try {
    const payload = posterState();
    let result;
    if (renderPoster.length >= 2) result = renderPoster(preview, payload);
    else result = renderPoster({ ...payload, canvas: preview, ctx });
    if (result && result !== preview && typeof result.getContext === 'function') ctx.drawImage(result, 0, 0, preview.width, preview.height);
  } catch {
    try { drawCover(ctx, posterState()); } catch { drawFallback(); }
  }
  $('selectionLabel').textContent = 'PANEL ' + String(state.selected + 1).padStart(2, '0') + ' / ' + String(state.panels.length).padStart(2, '0');
  $('zoomValue').textContent = (state.panels[state.selected]?.zoom || 1).toFixed(2) + '×';
  $('panelPhoto').textContent = state.photos[state.panels[state.selected]?.photo]?.name || 'NO PHOTO';
  paintThumbnails();
  rendering = false;
}

function renderPickers() {
  $('layoutPicker').innerHTML = layoutKeys().map((id) => '<button class="choice ' + (state.layout === id ? 'active' : '') + '" data-layout="' + id + '"><span class="mini-grid">▦</span><span>' + labelFor(LAYOUTS, id) + '</span></button>').join('');
  $('gradePicker').innerHTML = gradeKeys().map((id) => '<button class="grade-choice ' + (state.grade === id ? 'active' : '') + '" data-grade="' + id + '"><i class="swatch swatch-' + id + '"></i>' + labelFor(GRADES, id) + '</button>').join('');
  $('layoutPicker').querySelectorAll('[data-layout]').forEach((button) => button.addEventListener('click', () => setLayout(button.dataset.layout)));
  $('gradePicker').querySelectorAll('[data-grade]').forEach((button) => button.addEventListener('click', () => setGrade(button.dataset.grade)));
}
function paintThumbnails() {
  const strip = $('sampleStrip');
  if (!strip) return;
  strip.innerHTML = state.photos.map((photo, i) => '<button class="thumb ' + (state.panels[state.selected]?.photo === i ? 'used' : '') + '" data-photo="' + i + '" title="' + photo.name + '"><img src="' + photo.src + '" alt=""><span>' + String(i + 1).padStart(2, '0') + '</span></button>').join('');
  strip.querySelectorAll('[data-photo]').forEach((button) => button.addEventListener('click', () => {
    const panel = state.panels[state.selected];
    if (!panel) return;
    commit(); panel.photo = Number(button.dataset.photo); panel.zoom = 1; panel.ox = 0; panel.oy = 0; render();
  }));
}
function syncControls() {
  const fields = ['title', 'subtitle', 'tagline', 'quote', 'outlet', 'ticket', 'ending', 'gradeStrength', 'ink', 'halftone', 'grain', 'glow', 'titleSize'];
  for (const key of fields) {
    const input = $(key);
    if (input) input.value = state[key];
  }
  for (const key of ['showQuote', 'showSeal', 'showBarcode', 'showBilling', 'showPalm']) $(key).checked = state[key];
  const panel = state.panels[state.selected];
  if (!panel) return;
  $('role').value = panel.role;
  $('location').value = panel.location;
  $('panelZoom').value = panel.zoom;
  $('zoomValue').textContent = panel.zoom.toFixed(2) + '×';
  $('flip').classList.toggle('active', panel.flip);
  renderPickers();
  paintThumbnails();
}
function addPhotos(files) {
  const usable = Array.from(files || []).filter((file) => file.type.startsWith('image/'));
  if (!usable.length) return;
  commit();
  for (const file of usable) {
    const src = URL.createObjectURL(file);
    state.photos.push({ src, name: file.name || 'Photo ' + (state.photos.length + 1) });
  }
  if (!state.panels.length) state.panels = Array.from({ length: panelCount() }, (_, i) => makePanel(i));
  state.panels.forEach((panel, i) => { if (panel.photo >= state.photos.length) panel.photo = i % state.photos.length; });
  render();
}
function loadSamples() {
  commit();
  state.photos = SAMPLE_FILES.map((name) => ({ src: sampleRoot + name, name }));
  state.panels = Array.from({ length: panelCount(state.layout) }, (_, i) => makePanel(i));
  state.selected = 0;
  state.layout = 'hero'; state.grade = 'sunset'; state.title = 'PALM FEVER';
  state.panels = Array.from({ length: panelCount('hero') }, (_, i) => makePanel(i));
  renderPickers(); render();
}
function autoFill() {
  if (!state.photos.length) { loadSamples(); return; }
  commit();
  state.panels.forEach((panel, i) => {
    panel.photo = i % state.photos.length;
    panel.zoom = Number((1.12 + Math.random() * 1.35).toFixed(2));
    panel.ox = Math.round((Math.random() - 0.5) * 90);
    panel.oy = Math.round((Math.random() - 0.5) * 90);
    panel.fx = Math.min(0.8, Math.max(0.2, 0.2 + Math.random() * 0.6));
    panel.fy = Math.min(0.8, Math.max(0.2, 0.2 + Math.random() * 0.6));
  });
  render();
}
function surprise() {
  commit();
  const layouts = layoutKeys(); const grades = gradeKeys();
  state.layout = layouts[Math.floor(Math.random() * layouts.length)];
  state.grade = grades[Math.floor(Math.random() * grades.length)];
  state.panels = Array.from({ length: panelCount(state.layout) }, (_, i) => makePanel(i));
  for (let i = state.panels.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [state.panels[i].photo, state.panels[j].photo] = [state.panels[j].photo, state.panels[i].photo];
  }
  renderPickers(); render();
}
function toast(message, error = false) {
  const node = $('toast'); node.textContent = message;
  node.classList.toggle('error', error); node.classList.add('visible');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => node.classList.remove('visible'), 2800);
}
function downloadBlob(blob, filename) {
  if (!(blob instanceof Blob)) throw new Error('PNG export did not return an image.');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob); link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
function asBlob(value) {
  if (value instanceof Blob) return value;
  if (typeof value === 'string' && value.startsWith('data:')) {
    const [head, body] = value.split(',');
    const bytes = atob(body); const array = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) array[i] = bytes.charCodeAt(i);
    return new Blob([array], { type: head.includes('image/png') ? 'image/png' : 'application/octet-stream' });
  }
  return null;
}
async function exportSize(width, height, filename) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const payload = { ...posterState(), canvas, width, height, photos: state.photos, panels: state.panels };
  let result;
  try {
    result = exportPNG.length >= 3 ? await exportPNG(payload, width, height) :
      exportPNG.length === 2 ? await exportPNG(payload, { width, height }) : await exportPNG(payload);
  } catch { result = null; }
  let blob = asBlob(result);
  if (!blob && result && typeof result.toBlob === 'function') blob = await new Promise((resolve) => result.toBlob(resolve, 'image/png'));
  if (!blob) {
    try {
      if (renderPoster.length >= 2) renderPoster(canvas, payload);
      else renderPoster({ ...payload, canvas, ctx: canvas.getContext('2d') });
    } catch {
      try { drawCover(canvas.getContext('2d'), payload); } catch { drawFallbackOn(canvas, payload); }
    }
    blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  }
  downloadBlob(blob, filename);
}
function drawFallbackOn(canvas, data) {
  const target = canvas.getContext('2d');
  target.fillStyle = '#1b1026'; target.fillRect(0, 0, canvas.width, canvas.height);
  target.fillStyle = '#f7c45d'; target.textAlign = 'center';
  target.font = 'bold ' + Math.round(canvas.width * 0.09) + 'px Impact, sans-serif';
  target.fillText(data.title, canvas.width / 2, canvas.height * 0.78, canvas.width * 0.9);
}
async function exportAll() {
  const button = $('exportAll'); button.disabled = true;
  try {
    await exportSize(1080, 1080, 'sunset-reel-square.png');
    await exportSize(1080, 1350, 'sunset-reel-portrait.png');
    await exportSize(1920, 1080, 'sunset-reel-wide.png');
    toast('Three PNG sizes exported');
  } catch (error) { toast(error.message || 'PNG export failed', true); }
  finally { button.disabled = false; }
}
function selectPanel(index) {
  if (index < 0 || index >= state.panels.length) return;
  state.selected = index; syncControls(); render();
}
function panelAt(x, y) {
  const rect = preview.getBoundingClientRect();
  const cols = 3; const rows = Math.ceil(state.panels.length / cols);
  const col = Math.min(cols - 1, Math.max(0, Math.floor(x / rect.width * cols)));
  const row = Math.min(rows - 1, Math.max(0, Math.floor(y / rect.height * rows)));
  return Math.min(state.panels.length - 1, row * cols + col);
}
function normalizedPoint(event) {
  const rect = preview.getBoundingClientRect();
  return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
}
preview.addEventListener('pointerdown', (event) => {
  if (!state.panels.length) return;
  commit();
  preview.setPointerCapture(event.pointerId);
  const point = normalizedPoint(event); const index = panelAt(event.offsetX, event.offsetY);
  selectPanel(index);
  const panel = state.panels[index];
  const marker = Math.hypot(point.x - panel.fx, point.y - panel.fy) < 0.04;
  drag = { pointer: event.pointerId, index, x: event.clientX, y: event.clientY, marker, swap: event.shiftKey };
});
preview.addEventListener('pointermove', (event) => {
  if (!drag || drag.pointer !== event.pointerId) return;
  const panel = state.panels[drag.index];
  if (drag.marker) {
    const point = normalizedPoint(event); panel.fx = Math.max(0.05, Math.min(0.95, point.x)); panel.fy = Math.max(0.05, Math.min(0.95, point.y));
  } else if (drag.swap) {
    const target = panelAt(event.offsetX, event.offsetY);
    if (target !== drag.index) { [state.panels[target].photo, panel.photo] = [panel.photo, state.panels[target].photo]; drag.index = target; }
  } else {
    panel.ox += event.clientX - drag.x; panel.oy += event.clientY - drag.y;
  }
  drag.x = event.clientX; drag.y = event.clientY; render();
});
preview.addEventListener('pointerup', () => { if (drag) commit(); drag = null; });
preview.addEventListener('pointercancel', () => { if (drag) commit(); drag = null; });
preview.addEventListener('wheel', (event) => {
  event.preventDefault(); const panel = state.panels[state.selected]; if (!panel) return;
  commit(); panel.zoom = Math.max(1, Math.min(4, panel.zoom * (event.deltaY < 0 ? 1.08 : 0.92)));
  $('panelZoom').value = panel.zoom; render();
}, { passive: false });

function bindCaption(id, key) {
  const input = $(id);
  input.addEventListener('focus', commit);
  input.addEventListener('input', () => { state[key] = input.value; render(); });
  input.addEventListener('change', () => { state[key] = input.value; commit(); render(); });
}
function bindSlider(id, key) {
  const input = $(id);
  input.addEventListener('pointerdown', commit);
  input.addEventListener('input', () => { state[key] = Number(input.value); $(id + 'Output').textContent = input.value + (key === 'titleSize' ? '%' : ''); render(); });
  input.addEventListener('change', () => { state[key] = Number(input.value); commit(); render(); });
}
for (const [id, key] of [['title','title'], ['subtitle','subtitle'], ['tagline','tagline'], ['quote','quote'], ['outlet','outlet'], ['ticket','ticket'], ['ending','ending']]) bindCaption(id, key);
for (const key of ['gradeStrength', 'ink', 'halftone', 'grain', 'glow', 'titleSize']) bindSlider(key, key);
for (const key of ['showQuote', 'showSeal', 'showBarcode', 'showBilling', 'showPalm']) {
  $(key).addEventListener('change', () => { commit(); state[key] = $(key).checked; render(); });
}
$('role').addEventListener('change', () => { commit(); state.panels[state.selected].role = $('role').value; render(); });
$('location').addEventListener('change', () => { commit(); state.panels[state.selected].location = $('location').value; render(); });
$('panelZoom').addEventListener('pointerdown', commit);
$('panelZoom').addEventListener('input', () => { state.panels[state.selected].zoom = Number($('panelZoom').value); render(); });
$('panelZoom').addEventListener('change', () => { commit(); render(); });
$('flip').addEventListener('click', () => { commit(); state.panels[state.selected].flip = !state.panels[state.selected].flip; syncControls(); render(); });
$('resetCrop').addEventListener('click', () => { commit(); Object.assign(state.panels[state.selected], { zoom: 1, ox: 0, oy: 0, fx: 0.5, fy: 0.5 }); syncControls(); render(); });
$('photoPrev').addEventListener('click', () => { commit(); const p = state.panels[state.selected]; p.photo = (p.photo + state.photos.length - 1) % state.photos.length; render(); });
$('photoNext').addEventListener('click', () => { commit(); const p = state.panels[state.selected]; p.photo = (p.photo + 1) % state.photos.length; render(); });
$('fileInput').addEventListener('change', (event) => addPhotos(event.target.files));
$('addPhotos').addEventListener('click', () => $('fileInput').click());
$('loadSamples').addEventListener('click', loadSamples);
$('autoFill').addEventListener('click', autoFill);
$('surprise').addEventListener('click', surprise);
$('exportAll').addEventListener('click', exportAll);
$('undo').addEventListener('click', undo); $('redo').addEventListener('click', redo);
$('help').addEventListener('click', () => $('shortcuts').showModal());
$('closeShortcuts').addEventListener('click', () => $('shortcuts').close());
$('coverReturn').addEventListener('click', () => { document.body.classList.remove('cover-mode'); window.history.replaceState(null, '', '?shot=editor'); render(); });
const dropzone = $('photoDrop');
dropzone.addEventListener('dragover', (event) => { event.preventDefault(); dropzone.classList.add('dragging'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragging'));
dropzone.addEventListener('drop', (event) => { event.preventDefault(); dropzone.classList.remove('dragging'); addPhotos(event.dataTransfer.files); });
window.addEventListener('dragover', (event) => event.preventDefault());
window.addEventListener('drop', (event) => { if (event.target !== dropzone && !dropzone.contains(event.target)) { event.preventDefault(); addPhotos(event.dataTransfer.files); } });
window.addEventListener('paste', (event) => {
  const files = Array.from(event.clipboardData?.items || []).map((item) => item.getAsFile()).filter(Boolean);
  addPhotos(files);
});
window.addEventListener('resize', render);
window.addEventListener('keydown', (event) => {
  const tag = event.target?.tagName;
  if (event.ctrlKey || event.metaKey) {
    if (event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); }
    return;
  }
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
  if (event.key.toLowerCase() === 'f') $('flip').click();
  if (event.key.toLowerCase() === 'r') $('resetCrop').click();
  if (event.key.toLowerCase() === 's') surprise();
});
function applyLocation() {
  const params = new URLSearchParams(location.search);
  try { applyQueryParams(state, params); } catch { try { applyQueryParams(params, state); } catch {} }
  if (params.has('layout') && layoutKeys().includes(params.get('layout'))) setLayout(params.get('layout'));
  if (params.has('grade') && gradeKeys().includes(params.get('grade'))) state.grade = params.get('grade');
  if (params.has('caption')) state.title = params.get('caption');
  if (params.has('photo')) {
    const requested = params.get('photo');
    const match = SAMPLE_FILES.find((name) => name === requested || name.replace(/.[^.]+$/, '') === requested);
    if (match) state.photos = SAMPLE_FILES.map((name) => ({ src: sampleRoot + name, name }));
  }
  state.panels = Array.from({ length: panelCount(state.layout) }, (_, i) => makePanel(i, state.panels[i]));
  if (params.has('photo')) {
    const chosen = SAMPLE_FILES.findIndex((name) => name === params.get('photo') || name.startsWith(params.get('photo') + '.'));
    if (chosen >= 0) state.panels[0].photo = chosen;
  }
  if (params.get('shot') === 'cover') enterCoverMode();
}
function enterCoverMode() {
  document.body.classList.add('cover-mode');
  $('coverReturn').hidden = false;
}
loadSamples();
applyLocation();
undoStack.length = 0; commit(); syncControls(); render();
