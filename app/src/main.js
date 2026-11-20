import { LAYOUTS, GRADES, renderPoster, drawCover, exportPNG, applyQueryParams } from './cover.js';

const $ = (id) => document.getElementById(id);
const canvas = $('posterCanvas');
const wrap = $('canvasWrap');
const byId = (id) => $(id);
const ROLE_DEFAULTS = ['THE DRIVER', 'THE BOSS', 'THE INSIDER', 'THE RIDER', 'THE COURIER', 'THE LOOKOUT', 'THE MECHANIC', 'THE ANGLER'];
const LOCATION_DEFAULTS = ['OCEAN DRIVE · 6:42 PM', 'CORAL CAUSEWAY · 7:15 PM', 'NEON AVENUE · 9:03 PM', 'THE PIER · 5:58 PM'];
const SAMPLE_FILES = ['boulevard.jpg', 's2.jpg', 's3.jpg', 's5.jpg', 's6.jpg', 'pier.jpg', 's1.jpg', 's4.jpg'];
const LAYOUT_COUNTS = { hero: 5, hero3: 3, six: 6, diagonal: 7, seven: 7, nine: 9, titleband: 6, popout: 5 };
const state = {
  photos: [], panels: [], layout: 'hero', grade: 'sunset', gradeStrength: 72,
  ink: 42, halftone: 18, grain: 16, glow: 34, titleSize: 100,
  title: 'PALM FEVER', subtitle: 'one last summer', tagline: 'A CITY THAT NEVER COOLS',
  quote: 'A wild ride under neon skies.', outlet: 'THE SUNSET POST', ticket: 'VOL. 1',
  ending: 'COMING SOON', showSeal: true, showBarcode: true, showBilling: true,
  showQuote: true, showPalm: true
};
let selectedPanel = 0;
let coverOnly = false;
let renderTimer = 0;
let drag = null;
let faceDrag = false;
let history = [];
let historyIndex = -1;
let historyTimer = 0;
const imageCache = new Map();

function makePanel(index, photo = index % Math.max(state.photos.length, 1)) {
  return {
    photo, zoom: 1, ox: 0, oy: 0, flip: false,
    role: ROLE_DEFAULTS[index % ROLE_DEFAULTS.length],
    location: LOCATION_DEFAULTS[index % LOCATION_DEFAULTS.length], fx: 0.5, fy: 0.5
  };
}

function rebuildPanels(layout = state.layout) {
  const previous = state.panels;
  state.layout = layout;
  const count = LAYOUT_COUNTS[layout] || 5;
  state.panels = Array.from({ length: count }, (_, i) => {
    const panel = previous[i] ? { ...previous[i] } : makePanel(i);
    panel.photo = state.photos.length ? Math.max(0, Math.min(state.photos.length - 1, panel.photo)) : 0;
    return panel;
  });
  selectedPanel = Math.min(selectedPanel, state.panels.length - 1);
  updatePanelEditor();
}

function regionGrid(count) {
  if (state.layout === 'hero' && count === 5) {
    return [
      { x: 0, y: 0, w: .58, h: 1 }, { x: .58, y: 0, w: .42, h: .34 },
      { x: .58, y: .34, w: .42, h: .33 }, { x: .58, y: .67, w: .42, h: .33 },
      { x: 0, y: .72, w: .34, h: .28 }
    ];
  }
  const cols = count <= 3 ? count : count <= 6 ? 3 : count <= 8 ? 4 : 3;
  const rows = Math.ceil(count / cols);
  return Array.from({ length: count }, (_, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    return { x: col / cols, y: row / rows, w: 1 / cols, h: 1 / rows };
  });
}

function panelRect(index) {
  const boxes = regionGrid(state.panels.length);
  const box = boxes[index] || { x: 0, y: 0, w: 1, h: 1 };
  return { x: box.x * canvas.width, y: box.y * canvas.height, w: box.w * canvas.width, h: box.h * canvas.height };
}

function drawSelection() {
  if (coverOnly || !canvas || !state.panels.length) return;
  const ctx = canvas.getContext('2d');
  const r = panelRect(selectedPanel);
  ctx.save();
  ctx.strokeStyle = '#ffe37a';
  ctx.lineWidth = Math.max(2, canvas.width / 480);
  ctx.setLineDash([8, 5]);
  ctx.strokeRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
  ctx.setLineDash([]);
  const panel = state.panels[selectedPanel];
  const radius = Math.max(5, canvas.width / 120);
  ctx.beginPath();
  ctx.arc(r.x + panel.fx * r.w, r.y + panel.fy * r.h, radius, 0, Math.PI * 2);
  ctx.fillStyle = '#fff3a6';
  ctx.fill();
  ctx.strokeStyle = '#17121c';
  ctx.lineWidth = Math.max(1, radius / 3);
  ctx.stroke();
  ctx.restore();
}

function render() {
  if (!canvas || !state.panels.length) return;
  renderPoster(canvas, state);
  drawSelection();
}

function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(render, 60);
}

function resizeCanvas() {
  if (!canvas || !wrap) return;
  const rect = wrap.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  if (coverOnly) {
    canvas.width = Math.round(window.innerWidth * ratio);
    canvas.height = Math.round(window.innerHeight * ratio);
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
  } else {
    const style = getComputedStyle(wrap);
    const horizontalPadding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const verticalPadding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    const side = Math.max(1, Math.floor(Math.min(rect.width - horizontalPadding - 2, rect.height - verticalPadding - 2) * ratio));
    canvas.width = side;
    canvas.height = side;
    canvas.style.width = side / ratio + 'px';
    canvas.style.height = side / ratio + 'px';
  }
  render();
}

function updatePhotoCount() {
  const ready = byId('photoCount');
  if (ready) ready.textContent = state.photos.length + ' ready';
}

function updateThumbs() {
  const strip = byId('thumbStrip');
  if (!strip) return;
  strip.replaceChildren();
  state.photos.forEach((photo, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'photo-thumb' + (state.panels[selectedPanel]?.photo === index ? ' is-assigned' : '');
    button.title = photo.name + ' · click to assign';
    button.setAttribute('aria-label', 'Assign ' + photo.name + ' to selected panel');
    const image = document.createElement('img');
    image.src = photo.src;
    image.alt = '';
    button.append(image);
    button.addEventListener('click', () => {
      const panel = state.panels[selectedPanel];
      if (!panel) return;
      panel.photo = index;
      panel.zoom = Math.max(1, panel.zoom);
      updateThumbs();
      commitHistory();
      render();
    });
    strip.append(button);
  });
  updatePhotoCount();
}

function setBusy(busy) {
  const indicator = byId('busyIndicator');
  if (indicator) indicator.hidden = !busy;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const cached = imageCache.get(src);
    if (cached?.complete && cached.naturalWidth) return resolve(cached);
    const image = new Image();
    image.onload = () => { imageCache.set(src, image); resolve(image); };
    image.onerror = () => reject(new Error('Could not load ' + src));
    image.src = src;
  });
}

async function loadSamples() {
  setBusy(true);
  const loaded = [];
  for (const name of SAMPLE_FILES) {
    const src = 'samples/' + name;
    try {
      await loadImage(src);
      loaded.push({ src, name });
    } catch (error) {
      console.warn(error);
    }
  }
  state.photos = loaded;
  if (!state.panels.length) rebuildPanels('hero');
  else rebuildPanels(state.layout);
  state.panels.forEach((panel, index) => {
    panel.photo = index % state.photos.length;
    panel.zoom = 1; panel.ox = 0; panel.oy = 0; panel.fx = 0.5; panel.fy = 0.5;
  });
  updateThumbs();
  setBusy(false);
  render();
}

function addPhoto(src, name) {
  state.photos.push({ src, name });
  loadImage(src).catch((error) => showToast(error.message));
  updateThumbs();
  render();
}

function bootstrap() {
  rebuildPanels('hero');
  resizeCanvas();
  updateThumbs();
  render();
  loadSamples().then(() => {
    const mode = applyQueryParams(state, new URLSearchParams(location.search));
    rebuildPanels(state.layout);
    if (state.panels.length > 1 && state.panels.every((panel) => panel.photo === state.panels[0].photo)) {
      state.panels.forEach((panel, index) => {
        panel.photo = index % state.photos.length;
        panel.zoom = 1; panel.ox = 0; panel.oy = 0; panel.fx = 0.5; panel.fy = 0.5;
      });
    }
    updateThumbs();
    render();
    if (mode === 'cover') enterCoverMode();
    resetHistory();
  });
}


function snapshot() {
  return JSON.stringify(state);
}

function resetHistory() {
  history = [snapshot()];
  historyIndex = 0;
  updateHistoryButtons();
}

function commitHistory() {
  const next = snapshot();
  if (history[historyIndex] === next) return;
  history = history.slice(0, historyIndex + 1);
  history.push(next);
  if (history.length > 80) history.shift();
  historyIndex = history.length - 1;
  updateHistoryButtons();
}

function deferHistory() {
  clearTimeout(historyTimer);
  historyTimer = setTimeout(commitHistory, 350);
}

function updateHistoryButtons() {
  const undo = byId('undoBtn');
  const redo = byId('redoBtn');
  if (undo) undo.disabled = historyIndex <= 0;
  if (redo) redo.disabled = historyIndex >= history.length - 1;
}

function restoreHistory(index) {
  if (index < 0 || index >= history.length) return;
  historyIndex = index;
  const restored = JSON.parse(history[index]);
  Object.keys(state).forEach((key) => delete state[key]);
  Object.assign(state, restored);
  selectedPanel = Math.min(selectedPanel, state.panels.length - 1);
  syncControls();
  drawChoices();
  updatePanelEditor();
  updateThumbs();
  updateHistoryButtons();
  render();
}

function undo() { restoreHistory(historyIndex - 1); }
function redo() { restoreHistory(historyIndex + 1); }

function showToast(message) {
  const toast = byId('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { toast.hidden = true; }, 2600);
}

function updatePanelEditor() {
  const panel = state.panels[selectedPanel];
  if (!panel) return;
  const label = byId('selectedPanelLabel');
  if (label) label.textContent = 'Panel ' + (selectedPanel + 1) + ' · ' + panel.role;
  const role = byId('roleInput');
  const locationInput = byId('locationInput');
  if (role) role.value = panel.role;
  if (locationInput) locationInput.value = panel.location;
  updateThumbs();
}

function drawChoices() {
  const layouts = byId('layoutChoices');
  const grades = byId('gradeChoices');
  if (layouts) {
    layouts.replaceChildren();
    LAYOUTS.forEach((layout) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'choice-button' + (state.layout === layout.id ? ' is-active' : '');
      button.textContent = layout.name;
      button.setAttribute('aria-pressed', String(state.layout === layout.id));
      button.addEventListener('click', () => {
        rebuildPanels(layout.id);
        drawChoices();
        updateThumbs();
        render();
        commitHistory();
      });
      layouts.append(button);
    });
  }
  if (grades) {
    grades.replaceChildren();
    const colors = {
      sunset: ['#ffbd76', '#d64e72', '#56295c'], golden: ['#ffe49a', '#e7814c', '#65394b'],
      neon: ['#ff4fca', '#5b6bff', '#13233f'], teal: ['#a2f4d2', '#21a8ae', '#214568'],
      heatwave: ['#ffdb55', '#ff5c3d', '#722d49'], ultraviolet: ['#f0a6ff', '#7255df', '#251c50'],
      miami: ['#ff9fbc', '#36d3cf', '#263766'], noir: ['#dedbd1', '#74737d', '#171820']
    };
    GRADES.forEach((grade) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'grade-choice' + (state.grade === grade.id ? ' is-active' : '');
      button.setAttribute('aria-label', grade.name);
      button.setAttribute('aria-pressed', String(state.grade === grade.id));
      const swatch = document.createElement('span');
      swatch.className = 'grade-swatch';
      const pair = colors[grade.id] || ['#ffc778', '#633e7d', '#171820'];
      swatch.style.background = 'linear-gradient(135deg, ' + pair.join(', ') + ')';
      const name = document.createElement('span');
      name.textContent = grade.name;
      button.append(swatch, name);
      button.addEventListener('click', () => {
        state.grade = grade.id;
        drawChoices();
        render();
        commitHistory();
      });
      grades.append(button);
    });
  }
}

function syncControls() {
  const fields = {
    titleInput: 'title', subtitleInput: 'subtitle', taglineInput: 'tagline',
    quoteInput: 'quote', outletInput: 'outlet', ticketInput: 'ticket', endingInput: 'ending'
  };
  Object.entries(fields).forEach(([id, key]) => { if (byId(id)) byId(id).value = state[key]; });
  const sliders = {
    gradeRange: ['gradeStrength', 'gradeOut'], inkRange: ['ink', 'inkOut'],
    halftoneRange: ['halftone', 'halftoneOut'], grainRange: ['grain', 'grainOut'],
    glowRange: ['glow', 'glowOut'], titleSizeRange: ['titleSize', 'titleSizeOut']
  };
  Object.entries(sliders).forEach(([id, [key, outputId]]) => {
    if (byId(id)) byId(id).value = state[key];
    if (byId(outputId)) byId(outputId).textContent = state[key] + '%';
  });
  const toggles = {
    sealToggle: 'showSeal', barcodeToggle: 'showBarcode', billingToggle: 'showBilling',
    quoteToggle: 'showQuote', palmToggle: 'showPalm'
  };
  Object.entries(toggles).forEach(([id, key]) => { if (byId(id)) byId(id).checked = state[key]; });
  updatePanelEditor();
}

function bindCaptionInputs() {
  const fields = {
    titleInput: 'title', subtitleInput: 'subtitle', taglineInput: 'tagline',
    quoteInput: 'quote', outletInput: 'outlet', ticketInput: 'ticket', endingInput: 'ending'
  };
  Object.entries(fields).forEach(([id, key]) => {
    byId(id)?.addEventListener('input', (event) => {
      state[key] = event.currentTarget.value;
      scheduleRender();
      deferHistory();
    });
  });
  const toggles = {
    sealToggle: 'showSeal', barcodeToggle: 'showBarcode', billingToggle: 'showBilling',
    quoteToggle: 'showQuote', palmToggle: 'showPalm'
  };
  Object.entries(toggles).forEach(([id, key]) => {
    byId(id)?.addEventListener('change', (event) => {
      state[key] = event.currentTarget.checked;
      render();
      commitHistory();
    });
  });
  byId('roleInput')?.addEventListener('input', (event) => {
    const panel = state.panels[selectedPanel];
    if (!panel) return;
    panel.role = event.currentTarget.value;
    const label = byId('selectedPanelLabel');
    if (label) label.textContent = 'Panel ' + (selectedPanel + 1) + ' · ' + panel.role;
    scheduleRender();
    deferHistory();
  });
  byId('locationInput')?.addEventListener('input', (event) => {
    const panel = state.panels[selectedPanel];
    if (!panel) return;
    panel.location = event.currentTarget.value;
    scheduleRender();
    deferHistory();
  });
}

function bindSliders() {
  const sliders = {
    gradeRange: ['gradeStrength', 'gradeOut'], inkRange: ['ink', 'inkOut'],
    halftoneRange: ['halftone', 'halftoneOut'], grainRange: ['grain', 'grainOut'],
    glowRange: ['glow', 'glowOut'], titleSizeRange: ['titleSize', 'titleSizeOut']
  };
  Object.entries(sliders).forEach(([id, [key, outputId]]) => {
    const input = byId(id);
    if (!input) return;
    input.value = state[key];
    input.addEventListener('input', () => {
      state[key] = Number(input.value);
      if (byId(outputId)) byId(outputId).textContent = state[key] + '%';
      scheduleRender();
    });
    input.addEventListener('change', () => { commitHistory(); render(); });
  });
}

function bindUploads() {
  const input = byId('photoInput');
  const loadFiles = (files) => {
    Array.from(files || []).filter((file) => file.type.startsWith('image/')).forEach((file) => {
      const src = URL.createObjectURL(file);
      addPhoto(src, file.name);
    });
    if (files?.length) { commitHistory(); if (input) input.value = ''; }
  };
  input?.addEventListener('change', () => loadFiles(input.files));
  ['uploadDrop', 'canvasWrap'].forEach((id) => {
    const target = byId(id);
    if (!target) return;
    target.addEventListener('dragover', (event) => { event.preventDefault(); target.classList.add('is-dragging'); });
    target.addEventListener('dragleave', (event) => {
      if (!target.contains(event.relatedTarget)) target.classList.remove('is-dragging');
    });
    target.addEventListener('drop', (event) => {
      event.preventDefault();
      target.classList.remove('is-dragging');
      loadFiles(event.dataTransfer.files);
    });
  });
  document.addEventListener('paste', (event) => {
    const files = Array.from(event.clipboardData?.items || []).map((item) => item.getAsFile()).filter(Boolean);
    if (files.length) loadFiles(files);
  });
  byId('loadSamplesBtn')?.addEventListener('click', async () => {
    await loadSamples();
    commitHistory();
  });
}

function assignPanel(index) {
  if (index < 0 || index >= state.panels.length) return;
  selectedPanel = index;
  updatePanelEditor();
  render();
}

function canvasPoint(event) {
  const bounds = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - bounds.left) * canvas.width / bounds.width,
    y: (event.clientY - bounds.top) * canvas.height / bounds.height
  };
}

function panelAt(point) {
  for (let i = state.panels.length - 1; i >= 0; i -= 1) {
    const r = panelRect(i);
    if (point.x >= r.x && point.x <= r.x + r.w && point.y >= r.y && point.y <= r.y + r.h) return i;
  }
  return -1;
}

function nearFace(point, index) {
  const r = panelRect(index);
  const p = state.panels[index];
  const x = r.x + p.fx * r.w;
  const y = r.y + p.fy * r.h;
  return Math.hypot(point.x - x, point.y - y) <= Math.max(18, canvas.width / 55);
}

function bindCanvasEditing() {
  canvas.addEventListener('pointerdown', (event) => {
    if (coverOnly) return;
    const point = canvasPoint(event);
    const index = panelAt(point);
    if (index < 0) return;
    if (index !== selectedPanel) assignPanel(index);
    const panel = state.panels[selectedPanel];
    faceDrag = !event.shiftKey && nearFace(point, selectedPanel);
    drag = {
      pointerId: event.pointerId, index: selectedPanel, x: point.x, y: point.y,
      ox: panel.ox, oy: panel.oy, fx: panel.fx, fy: panel.fy,
      target: event.shiftKey ? -1 : selectedPanel, swap: event.shiftKey
    };
    canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const point = canvasPoint(event);
    const panel = state.panels[drag.index];
    const r = panelRect(drag.index);
    if (event.shiftKey) drag.swap = true;
    if (drag.swap) {
      drag.target = panelAt(point);
      return;
    }
    if (faceDrag) {
      panel.fx = Math.max(0, Math.min(1, drag.fx + (point.x - drag.x) / r.w));
      panel.fy = Math.max(0, Math.min(1, drag.fy + (point.y - drag.y) / r.h));
    } else {
      panel.ox = Math.max(-1, Math.min(1, drag.ox - (point.x - drag.x) / r.w));
      panel.oy = Math.max(-1, Math.min(1, drag.oy - (point.y - drag.y) / r.h));
    }
    render();
  });
  canvas.addEventListener('pointerup', (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.shiftKey) drag.swap = true;
    if (drag.swap) drag.target = panelAt(canvasPoint(event));
    if (drag.swap && drag.target >= 0 && drag.target !== drag.index) {
      const photo = state.panels[drag.index].photo;
      state.panels[drag.index].photo = state.panels[drag.target].photo;
      state.panels[drag.target].photo = photo;
      updateThumbs();
    }
    drag = null;
    faceDrag = false;
    commitHistory();
    render();
  });
  canvas.addEventListener('pointercancel', () => { drag = null; faceDrag = false; render(); });
  canvas.addEventListener('wheel', (event) => {
    if (coverOnly) return;
    event.preventDefault();
    const index = panelAt(canvasPoint(event));
    if (index < 0) return;
    assignPanel(index);
    const panel = state.panels[index];
    panel.zoom = Math.max(1, Math.min(4, panel.zoom * (event.deltaY < 0 ? 1.12 : 1 / 1.12)));
    render();
    clearTimeout(historyTimer);
    historyTimer = setTimeout(commitHistory, 250);
  }, { passive: false });
}

function resetSelectedPanel() {
  const panel = state.panels[selectedPanel];
  if (!panel) return;
  panel.zoom = 1;
  panel.ox = 0;
  panel.oy = 0;
  panel.fx = 0.5;
  panel.fy = 0.5;
  render();
  commitHistory();
}

function autoFill() {
  if (!state.photos.length) return;
  state.panels.forEach((panel, index) => {
    panel.photo = index % state.photos.length;
    panel.zoom = 1.12 + Math.random() * 1.35;
    panel.ox = (Math.random() - 0.5) * 0.72;
    panel.oy = (Math.random() - 0.5) * 0.72;
    panel.fx = Math.max(0.2, Math.min(0.8, 0.5 - panel.ox * 0.22));
    panel.fy = Math.max(0.2, Math.min(0.8, 0.5 - panel.oy * 0.22));
  });
  updateThumbs();
  render();
  commitHistory();
}

function surprise() {
  const layout = LAYOUTS[Math.floor(Math.random() * LAYOUTS.length)];
  const grade = GRADES[Math.floor(Math.random() * GRADES.length)];
  state.grade = grade.id;
  rebuildPanels(layout.id);
  const order = state.photos.map((_, i) => i).sort(() => Math.random() - 0.5);
  state.panels.forEach((panel, i) => { panel.photo = order[i % Math.max(order.length, 1)] || 0; });
  drawChoices();
  updateThumbs();
  render();
  commitHistory();
}

function bindPanelActions() {
  byId('autoFillBtn')?.addEventListener('click', autoFill);
  byId('surpriseBtn')?.addEventListener('click', surprise);
  byId('flipBtn')?.addEventListener('click', () => {
    const panel = state.panels[selectedPanel];
    if (!panel) return;
    panel.flip = !panel.flip;
    render();
    commitHistory();
  });
  byId('resetBtn')?.addEventListener('click', resetSelectedPanel);
  byId('resetPanelBtn')?.addEventListener('click', resetSelectedPanel);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function exportOne(size) {
  const filename = 'sunset-reel-' + size + '.png';
  try {
    const blob = await exportPNG(state, size);
    downloadBlob(blob, filename);
    showToast('Exported ' + filename);
  } catch (error) {
    showToast('Export failed: ' + (error?.message || 'please try again'));
  }
}

function bindExport() {
  byId('exportBtn')?.addEventListener('click', () => exportOne(byId('sizeSelect')?.value || 'square'));
  byId('exportAllBtn')?.addEventListener('click', async () => {
    for (const size of ['square', 'portrait', 'wide']) await exportOne(size);
  });
}

function openHelp() { if (byId('helpOverlay')) byId('helpOverlay').hidden = false; }
function closeHelp() { if (byId('helpOverlay')) byId('helpOverlay').hidden = true; }

function bindShortcuts() {
  byId('helpBtn')?.addEventListener('click', openHelp);
  byId('closeHelpBtn')?.addEventListener('click', closeHelp);
  byId('doneHelpBtn')?.addEventListener('click', closeHelp);
  document.addEventListener('keydown', (event) => {
    const target = event.target;
    const typing = target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
    if (event.key === 'Escape') { closeHelp(); return; }
    if (event.key === '?' && !typing) { event.preventDefault(); openHelp(); return; }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) redo(); else undo();
    }
  });
}

function enterCoverMode() {
  coverOnly = true;
  ['topbar', 'sidebar', 'inspector'].forEach((id) => {
    const element = byId(id);
    if (element) element.style.display = 'none';
  });
  const stage = document.querySelector('.stage');
  if (stage) {
    stage.style.width = '100vw';
    stage.style.height = '100vh';
    stage.style.margin = '0';
  }
  if (wrap) {
    wrap.style.position = 'fixed';
    wrap.style.inset = '0';
    wrap.style.width = '100vw';
    wrap.style.height = '100vh';
    wrap.style.maxWidth = 'none';
  }
  document.body.style.margin = '0';
  document.body.style.overflow = 'hidden';
  resizeCanvas();
}

function bindEverything() {
  bindCaptionInputs();
  bindSliders();
  bindUploads();
  bindPanelActions();
  bindCanvasEditing();
  bindExport();
  bindShortcuts();
  syncControls();
  drawChoices();
  byId('sizeSelect')?.addEventListener('change', () => {});
  window.addEventListener('resize', resizeCanvas);
  resetHistory();
}

bindEverything();
bootstrap();

