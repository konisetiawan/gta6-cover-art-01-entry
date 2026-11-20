// Poster renderer for the Make.fun cover editor. Canvas coordinates are always local.
export const LAYOUTS = [
  { id: 'hero', name: 'Hero mosaic' }, { id: 'hero3', name: 'Hero + three' },
  { id: 'six', name: 'Six grid' }, { id: 'diagonal', name: 'Diagonal trio' },
  { id: 'seven', name: 'Seven mosaic' }, { id: 'nine', name: 'Nine grid' },
  { id: 'titleband', name: 'Title band below' }, { id: 'popout', name: 'Pop-out hero' }
];

export const GRADES = [
  { id: 'sunset', name: 'Sunset', frame: '#f7b45f', title: ['#ffe28a', '#ff8e49', '#e84c82'], sky: ['#ffb258', '#ef6976', '#50376f'], filter: 'saturate(1.16) contrast(1.05) sepia(.12)' },
  { id: 'golden', name: 'Golden', frame: '#f5c75b', title: ['#fff49a', '#ffc23f', '#e66b31'], sky: ['#ffd16a', '#f08b42', '#74452e'], filter: 'saturate(1.18) contrast(1.04) sepia(.24)' },
  { id: 'neon', name: 'Neon Night', frame: '#62e5ed', title: ['#a7ffff', '#45c8eb', '#a858dc'], sky: ['#ec477f', '#493a9e', '#20b9c2'], filter: 'saturate(1.45) contrast(1.16) hue-rotate(8deg)' },
  { id: 'teal', name: 'Teal', frame: '#74d8c6', title: ['#c4fff0', '#42c6b6', '#397dc4'], sky: ['#f1b878', '#52b7ad', '#255a79'], filter: 'saturate(1.18) contrast(1.06) hue-rotate(-12deg)' },
  { id: 'heatwave', name: 'Heatwave', frame: '#ff7546', title: ['#ffe27e', '#ff6845', '#dc3657'], sky: ['#ffd057', '#f16648', '#813d69'], filter: 'saturate(1.32) contrast(1.12) sepia(.1)' },
  { id: 'ultraviolet', name: 'Ultraviolet', frame: '#b984f0', title: ['#eee2ff', '#b77bf3', '#ed529a'], sky: ['#f182ad', '#844eaf', '#28255d'], filter: 'saturate(1.3) contrast(1.12) hue-rotate(24deg)' },
  { id: 'miami', name: 'Miami', frame: '#ff87b3', title: ['#fff0d4', '#ff82b1', '#53d7c3'], sky: ['#ff93a7', '#c765a4', '#34bcae'], filter: 'saturate(1.34) contrast(1.07) hue-rotate(-5deg)' },
  { id: 'noir', name: 'Noir', frame: '#b8bec5', title: ['#ffffff', '#b8c2cf', '#657080'], sky: ['#777e89', '#424650', '#181a21'], filter: 'grayscale(1) contrast(1.22) brightness(.92)' }
];

const TAU = Math.PI * 2;
const imageCache = new Map();
const noiseCache = new Map();
const renderBindings = new WeakMap();
const watchedImages = new WeakMap();
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const unit = n => clamp(Number(n) || 0, 0, 1);
const gradeFor = id => GRADES.find(g => g.id === id) || GRADES[0];
const mix = (a, b, t) => a + (b - a) * t;
const hexRgb = hex => {
  const s = (hex || '#000000').replace('#', '');
  const n = parseInt(s.length === 3 ? s.split('').map(c => c + c).join('') : s, 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgba = (hex, alpha = 1) => 'rgba(' + hexRgb(hex).join(',') + ',' + alpha + ')';
const makeGradient = (ctx, rect, stops, vertical = false) => {
  const g = vertical ? ctx.createLinearGradient(0, rect.y, 0, rect.y + rect.h) : ctx.createLinearGradient(rect.x, rect.y, rect.x + rect.w, rect.y);
  stops.forEach((color, i) => g.addColorStop(i / Math.max(1, stops.length - 1), color));
  return g;
};

// Fractions keep all eight compositions resolution-independent.
function grid(cols, rows, count, zone = { x: 0.035, y: 0.13, w: 0.93, h: 0.77 }, gap = 0.009) {
  const cw = (zone.w - gap * (cols - 1)) / cols, ch = (zone.h - gap * (rows - 1)) / rows;
  return Array.from({ length: count }, (_, i) => ({ x: zone.x + (i % cols) * (cw + gap), y: zone.y + Math.floor(i / cols) * (ch + gap), w: cw, h: ch }));
}
function layoutSpec(id) {
  const gap = 0.008;
  if (id === 'hero') return {
    panels: [
      { x: .035, y: .135, w: .555, h: .76, hero: true },
      { x: .598, y: .135, w: .367, h: .245 }, { x: .598, y: .391, w: .178, h: .245 },
      { x: .787, y: .391, w: .178, h: .245 }, { x: .598, y: .647, w: .367, h: .248 }
    ], title: { x: .055, y: .58, w: .77, h: .23 }
  };
  if (id === 'hero3') return {
    panels: [{ x: .035, y: .13, w: .93, h: .49, hero: true }, ...grid(3, 1, 3, { x: .035, y: .63, w: .93, h: .265 }, gap)],
    title: { x: .075, y: .49, w: .79, h: .22 }
  };
  if (id === 'six') return { panels: grid(3, 2, 6, { x: .035, y: .13, w: .93, h: .765 }, gap), title: { x: .07, y: .56, w: .8, h: .25 } };
  if (id === 'diagonal') return {
    panels: [0, 1, 2].map(i => ({ x: .035 + i * .311, y: .14, w: .306, h: .75, slant: .09, hero: i === 1 })),
    title: { x: .08, y: .56, w: .82, h: .24 }
  };
  if (id === 'seven') return {
    panels: [...grid(4, 1, 4, { x: .035, y: .14, w: .93, h: .365 }, gap), ...grid(3, 1, 3, { x: .19, y: .515, w: .62, h: .38 }, gap)],
    title: { x: .07, y: .60, w: .83, h: .2 }
  };
  if (id === 'nine') return { panels: grid(3, 3, 9, { x: .035, y: .13, w: .93, h: .765 }, gap), title: { x: .07, y: .54, w: .83, h: .25 } };
  if (id === 'titleband') return {
    panels: grid(5, 1, 5, { x: .035, y: .105, w: .93, h: .55 }, gap),
    title: { x: .055, y: .69, w: .89, h: .22 }, band: { x: 0, y: .655, w: 1, h: .345 }
  };
  if (id === 'popout') return {
    panels: [
      ...grid(3, 2, 5, { x: .035, y: .13, w: .93, h: .735 }, gap),
      { x: .29, y: .31, w: .42, h: .43, hero: true, popout: true }
    ], title: { x: .07, y: .60, w: .82, h: .24 }
  };
  return layoutSpec('hero');
}

function sourceImage(src) {
  if (!src) return null;
  if (typeof src === 'object' && src.complete !== undefined) return src;
  if (imageCache.has(src)) return imageCache.get(src);
  if (typeof Image === 'undefined') return null;
  const image = new Image();
  image.crossOrigin = 'anonymous'; image.src = src; imageCache.set(src, image);
  return image;
}
function panelPhoto(state, panel, index) {
  const slot = panel && Number.isFinite(panel.photo) ? panel.photo : index;
  const photo = state.photos && state.photos.length ? state.photos[((slot % state.photos.length) + state.photos.length) % state.photos.length] : null;
  return sourceImage(photo && photo.src);
}
function watchForImage(img, canvas) {
  if (!img || img.complete || !canvas || typeof img.addEventListener !== 'function') return;
  let seen = watchedImages.get(canvas);
  if (!seen) { seen = new WeakSet(); watchedImages.set(canvas, seen); }
  if (seen.has(img)) return;
  seen.add(img);
  img.addEventListener('load', () => {
    const latest = renderBindings.get(canvas);
    if (latest) renderPoster(canvas, latest);
  }, { once: true });
}
function drawPlaceholder(ctx, x, y, w, h, grade, index) {
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, grade.sky[0]); g.addColorStop(1, grade.sky[2]);
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  ctx.save(); ctx.globalAlpha = .24; ctx.fillStyle = '#fff';
  for (let i = 0; i < 5; i++) {
    const cx = x + w * (.12 + ((i * 37 + index * 13) % 73) / 100), cy = y + h * (.14 + i * .15);
    ctx.beginPath(); ctx.arc(cx, cy, Math.max(2, w * .012), 0, TAU); ctx.fill();
  }
  ctx.restore();
}
function tracePanel(ctx, x, y, w, h, slant = 0) {
  if (!slant) { ctx.rect(x, y, w, h); return; }
  const cut = w * slant; ctx.moveTo(x + cut, y); ctx.lineTo(x + w, y);
  ctx.lineTo(x + w - cut, y + h); ctx.lineTo(x, y + h); ctx.closePath();
}
function drawPanelImage(ctx, state, box, index, grade, W, H) {
  const x = box.x * W, y = box.y * H, w = box.w * W, h = box.h * H;
  const gap = Math.max(2, Math.min(W, H) * .006);
  ctx.save(); ctx.beginPath(); tracePanel(ctx, x, y, w, h, box.slant || 0); ctx.clip();
  ctx.fillStyle = '#25212c'; ctx.fillRect(x, y, w, h);
  const img = panelPhoto(state, state.panels && state.panels[index], index);
  watchForImage(img, ctx.canvas);
  if (img && img.complete && img.naturalWidth) {
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const p = (state.panels && state.panels[index]) || {};
    const scale = Math.max(w / iw, h / ih) * Math.max(1, Number(p.zoom) || 1);
    const dw = iw * scale, dh = ih * scale;
    const fx = unit(p.fx === undefined ? .5 : p.fx), fy = unit(p.fy === undefined ? .5 : p.fy);
    const ox = Number(p.ox) || 0, oy = Number(p.oy) || 0;
    const cx = x + w * .5 + ox * w, cy = y + h * .5 + oy * h;
    const dx = cx - fx * dw, dy = cy - fy * dh;
    ctx.filter = grade.filter;
    if (p.flip) { ctx.translate(2 * cx, 0); ctx.scale(-1, 1); }
    ctx.drawImage(img, dx, dy, dw, dh); ctx.filter = 'none';
  } else drawPlaceholder(ctx, x, y, w, h, grade, index);
  ctx.restore();
  ctx.save(); ctx.lineWidth = gap; ctx.strokeStyle = grade.frame; ctx.globalAlpha = .96;
  ctx.beginPath(); tracePanel(ctx, x, y, w, h, box.slant || 0); ctx.stroke(); ctx.restore();
  // Role and location form a compact, readable editorial caption in every frame.
  const p = (state.panels && state.panels[index]) || {};
  const roles = ['THE DRIVER', 'THE BOSS', 'THE INSIDER', 'THE RIDER', 'THE COURIER', 'THE LOOKOUT', 'THE MECHANIC', 'THE ANGLER', 'THE ANGLER'];
  const places = ['OCEAN DRIVE · 6:42 PM', 'CORAL CAUSEWAY · 7:15 PM', 'NEON AVENUE · 9:03 PM', 'THE PIER · 5:58 PM'];
  const pad = Math.max(5, Math.min(w, h) * .045), chipY = y + h - pad - Math.max(20, h * .15);
  ctx.save(); ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.font = '700 ' + Math.max(8, Math.min(16, h * .075)) + 'px Inter, sans-serif';
  const role = String(p.role || roles[index % roles.length]).toUpperCase();
  const chipW = Math.min(w - pad * 2, ctx.measureText(role).width + pad * 1.3), chipH = Math.max(18, h * .115);
  ctx.fillStyle = rgba('#10131a', .76); ctx.fillRect(x + pad, chipY, chipW, chipH);
  ctx.fillStyle = grade.frame; ctx.fillRect(x + pad, chipY, Math.max(3, pad * .18), chipH);
  ctx.fillStyle = '#fff8e9'; ctx.fillText(role, x + pad * 1.45, chipY + chipH * .52, chipW - pad * .4);
  const loc = String(p.location || places[index % places.length]).toUpperCase();
  ctx.font = '600 ' + Math.max(7, Math.min(12, h * .048)) + 'px Inter, sans-serif'; ctx.fillStyle = '#fff';
  ctx.shadowColor = '#000'; ctx.shadowBlur = 5; ctx.fillText(loc, x + pad, y + h - pad * 1.6, w - pad * 2);
  ctx.restore();
  if (box.popout) {
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.72)'; ctx.shadowBlur = Math.min(W, H) * .045;
    ctx.shadowOffsetX = W * .008; ctx.shadowOffsetY = H * .012; ctx.lineWidth = Math.max(5, W * .012);
    ctx.strokeStyle = '#fff1d0'; ctx.beginPath(); tracePanel(ctx, x, y, w, h, box.slant || 0); ctx.stroke(); ctx.restore();
  }
}

function drawSky(ctx, grade, W, H, band) {
  const rect = band ? { x: band.x * W, y: band.y * H, w: band.w * W, h: band.h * H } : { x: 0, y: 0, w: W, h: H };
  ctx.fillStyle = makeGradient(ctx, rect, grade.sky, true); ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  const sunX = W * .79, sunY = band ? rect.y + rect.h * .36 : H * .18, sunR = Math.min(W, H) * .105;
  const sun = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR);
  sun.addColorStop(0, 'rgba(255,245,205,.78)'); sun.addColorStop(.65, rgba(grade.frame, .34)); sun.addColorStop(1, rgba(grade.frame, 0));
  ctx.fillStyle = sun; ctx.fillRect(sunX - sunR, sunY - sunR, sunR * 2, sunR * 2);
  if (band) drawCity(ctx, rect.x, rect.y + rect.h * .56, rect.w, rect.h * .44, grade);
}
function drawCity(ctx, x, y, w, h, grade) {
  ctx.save(); ctx.fillStyle = 'rgba(20,24,39,.62)';
  const widths = [.065, .09, .055, .12, .07, .08, .065, .11, .075, .09, .07, .12];
  let at = x;
  widths.forEach((fraction, i) => {
    const bw = w * fraction, bh = h * (.35 + ((i * 29) % 57) / 100);
    ctx.fillRect(at, y + h - bh, bw, bh); ctx.fillStyle = rgba(grade.frame, .4);
    for (let wy = y + h - bh + 5; wy < y + h - 3; wy += Math.max(7, h * .13)) {
      for (let wx = at + 4; wx < at + bw - 2; wx += Math.max(7, bw * .24)) ctx.fillRect(wx, wy, Math.max(2, bw * .045), Math.max(2, h * .045));
    }
    ctx.fillStyle = 'rgba(20,24,39,.62)'; at += bw * .98;
  });
  ctx.restore();
}

function applyGradientMap(ctx, canvas, grade, strength) {
  const amount = clamp((Number(strength) || 0) / 100, 0, 1) * .42;
  if (!amount) return;
  const W = canvas.width, H = canvas.height;
  const map = document.createElement('canvas'); map.width = 256; map.height = 1;
  const mc = map.getContext('2d'), ramp = mc.createLinearGradient(0, 0, 256, 0);
  grade.sky.forEach((c, i) => ramp.addColorStop(i / (grade.sky.length - 1), c));
  mc.fillStyle = ramp; mc.fillRect(0, 0, 256, 1);
  const pixels = ctx.getImageData(0, 0, W, H).data, lut = mc.getImageData(0, 0, 256, 1).data;
  const tint = document.createElement('canvas'); tint.width = W; tint.height = H;
  const tc = tint.getContext('2d'), out = tc.createImageData(W, H), od = out.data;
  for (let i = 0; i < pixels.length; i += 4) {
    const lum = Math.round(.2126 * pixels[i] + .7152 * pixels[i + 1] + .0722 * pixels[i + 2]), k = (lum >> 2) * 4;
    od[i] = lut[k]; od[i + 1] = lut[k + 1]; od[i + 2] = lut[k + 2]; od[i + 3] = 255;
  }
  tc.putImageData(out, 0, 0); ctx.save(); ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = amount; ctx.drawImage(tint, 0, 0); ctx.restore();
}
function applyInk(ctx, canvas, strength) {
  const amount = clamp((Number(strength) || 0) / 100, 0, 1); if (!amount) return;
  const im = ctx.getImageData(0, 0, canvas.width, canvas.height), d = im.data, levels = Math.round(mix(16, 4, amount));
  for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) {
    const q = Math.round(d[i + c] / 255 * (levels - 1)) * 255 / (levels - 1); d[i + c] = mix(d[i + c], q, amount * .72);
  }
  ctx.putImageData(im, 0, 0);
}
function applyHalftone(ctx, canvas, strength) {
  const amount = clamp((Number(strength) || 0) / 100, 0, 1); if (!amount) return;
  const W = canvas.width, H = canvas.height, step = Math.max(5, Math.round(Math.min(W, H) / 95));
  const sw = Math.ceil(W / step), sh = Math.ceil(H / step), sample = document.createElement('canvas'); sample.width = sw; sample.height = sh;
  const sc = sample.getContext('2d', { willReadFrequently: true }); sc.drawImage(canvas, 0, 0, sw, sh);
  const lum = sc.getImageData(0, 0, sw, sh).data;
  ctx.save(); ctx.globalAlpha = amount * .25; ctx.fillStyle = '#17151d';
  for (let yy = 0; yy < sh; yy++) for (let xx = 0; xx < sw; xx++) {
    const i = (yy * sw + xx) * 4, l = (.2126 * lum[i] + .7152 * lum[i + 1] + .0722 * lum[i + 2]) / 255;
    const r = (1 - l) * step * .43; if (r > .7) { ctx.beginPath(); ctx.arc((xx + .5) * step, (yy + .5) * step, r, 0, TAU); ctx.fill(); }
  }
  ctx.restore();
}
function noiseTile(size = 128) {
  if (noiseCache.has(size)) return noiseCache.get(size);
  const c = document.createElement('canvas'); c.width = size; c.height = size; const x = c.getContext('2d');
  const im = x.createImageData(size, size); let seed = 0x49a22d;
  for (let i = 0; i < im.data.length; i += 4) { seed = (seed * 1664525 + 1013904223) >>> 0; const v = seed >>> 24; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
  x.putImageData(im, 0, 0); noiseCache.set(size, c); return c;
}
function applyGrain(ctx, canvas, strength) {
  const amount = clamp((Number(strength) || 0) / 100, 0, 1); if (!amount) return;
  const W = canvas.width, H = canvas.height, pat = ctx.createPattern(noiseTile(), 'repeat');
  ctx.save(); ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = amount * .22; ctx.fillStyle = pat; ctx.fillRect(0, 0, W, H); ctx.restore();
}

function applyGlow(ctx, W, H, grade, strength, titleZone) {
  const amount = clamp((Number(strength) || 0) / 100, 0, 1); if (!amount) return;
  const z = titleZone || { x: .1, y: .58, w: .8, h: .25 };
  const cx = (z.x + z.w * .48) * W, cy = (z.y + z.h * .55) * H, r = Math.max(W, H) * .48;
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  glow.addColorStop(0, rgba(grade.frame, amount * .34)); glow.addColorStop(.42, rgba(grade.frame, amount * .12)); glow.addColorStop(1, rgba(grade.frame, 0));
  ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
  const vignette = ctx.createRadialGradient(W * .5, H * .46, Math.min(W, H) * .23, W * .5, H * .46, Math.max(W, H) * .75);
  vignette.addColorStop(0, 'rgba(8,10,18,0)'); vignette.addColorStop(1, 'rgba(8,10,18,' + (amount * .48) + ')');
  ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = vignette; ctx.fillRect(0, 0, W, H); ctx.restore();
}
function roundedRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function fitFont(ctx, text, family, max, min, width, weight = 900) {
  for (let size = max; size > min; size -= 2) { ctx.font = weight + ' ' + size + 'px ' + family; if (ctx.measureText(text).width <= width) return size; }
  return min;
}
function splitTitle(ctx, title, font, maxWidth) {
  const words = String(title || 'PALM FEVER').trim().split(/\s+/).filter(Boolean); if (!words.length) return [''];
  let lines = [], line = '';
  words.forEach(word => {
    const next = line ? line + ' ' + word : word;
    if (ctx.measureText(next).width > maxWidth && line) { lines.push(line); line = word; } else line = next;
  });
  if (line) lines.push(line);
  if (lines.length > 2) { lines = [lines.slice(0, lines.length - 1).join(' '), lines[lines.length - 1]]; }
  return lines;
}
function drawRetroTitle(ctx, state, grade, W, H, zone) {
  const x = zone.x * W, y = zone.y * H, w = zone.w * W, h = zone.h * H;
  const base = clamp(Number(state.titleSize) || 100, 48, 190), title = String(state.title || 'PALM FEVER').toUpperCase();
  let size = Math.min(H * .17, W * .19, base * Math.min(W / 1080, H / 1080));
  ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const maxFont = Math.max(22, Math.min(size, h * .67));
  let lines, lineH;
  for (let f = maxFont; f >= 22; f -= 2) {
    ctx.font = '900 ' + f + 'px Anton, Bebas, Impact, sans-serif';
    lines = splitTitle(ctx, title, ctx.font, w * .96); lineH = f * .86;
    if (lines.length <= 2 && lineH * lines.length <= h * .78) { size = f; break; }
  }
  ctx.font = '900 ' + size + 'px Anton, Bebas, Impact, sans-serif';
  lines = splitTitle(ctx, title, ctx.font, w * .96); if (lines.length > 2) lines = [lines.slice(0, -1).join(' '), lines[lines.length - 1]];
  lineH = size * .86;
  const totalH = lineH * lines.length, firstY = y + h * .52 - (totalH - lineH) / 2;
  state.__titleBottom = (firstY + (lines.length - 1) * lineH + size * .5) / H;
  lines.forEach((line, i) => {
    const yy = firstY + i * lineH;
    // Offset color gives the title a printed, layered edge.
    ctx.font = '900 ' + size + 'px Anton, Bebas, Impact, sans-serif';
    ctx.lineWidth = Math.max(2, size * .09); ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(15,36,48,.9)';
    ctx.shadowColor = 'rgba(0,0,0,.8)'; ctx.shadowBlur = size * .2; ctx.shadowOffsetY = size * .09;
    ctx.strokeText(line, W * .502, yy, w * .98);
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.fillStyle = '#20c7c5'; ctx.fillText(line, W * .5 + size * .045, yy + size * .025, w * .98);
    const grad = ctx.createLinearGradient(0, yy - size * .5, 0, yy + size * .5);
    grade.title.forEach((c, j) => grad.addColorStop(j / (grade.title.length - 1), c));
    ctx.fillStyle = grad; ctx.fillText(line, W * .5, yy, w * .98);
    ctx.save(); ctx.beginPath(); ctx.rect(x, yy - size * .5, w, size); ctx.clip();
    ctx.globalAlpha = .42; ctx.fillStyle = '#fff9e3';
    const stripe = Math.max(2, size * .045);
    for (let sy = yy - size * .39; sy < yy + size * .46; sy += stripe * 2.25) ctx.fillRect(x, sy, w, stripe);
    ctx.restore();
  });
  ctx.restore();
}
function drawSubtitle(ctx, state, grade, W, H, zone) {
  const text = String(state.subtitle || 'one last summer').trim(); if (!text) return;
  const size = Math.max(13, Math.min(H * .039, W * .05));
  ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.font = '400 ' + size + 'px Satisfy, cursive';
  ctx.fillStyle = '#fff2d7'; ctx.shadowColor = '#17121d'; ctx.shadowBlur = 5;
  ctx.fillText(text, (zone.x + zone.w * .5) * W, state.__titleBottom * H + size * .35, zone.w * W * .9); ctx.restore();
}
function drawHeader(ctx, state, grade, W, H) {
  const margin = W * .045, y = H * .048, h = Math.max(25, H * .043);
  if (state.showQuote !== false && String(state.quote || '').trim()) {
    const stars = '★★★★★', quote = String(state.quote || 'A wild ride under neon skies.');
    ctx.save(); ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.font = '700 ' + Math.max(10, H * .018) + 'px Inter, sans-serif'; ctx.fillStyle = grade.frame; ctx.fillText(stars, margin, y + h * .35);
    ctx.font = '500 ' + Math.max(9, H * .014) + 'px Inter, sans-serif'; ctx.fillStyle = '#fff7e8';
    ctx.fillText('“' + quote + '”', margin, y + h * .79, W * .62);
    const outlet = String(state.outlet || 'THE SUNSET POST').toUpperCase(); ctx.textAlign = 'right'; ctx.font = '800 ' + Math.max(9, H * .014) + 'px Inter, sans-serif'; ctx.fillStyle = '#fff';
    ctx.fillText(outlet, W - margin, y + h * .79, W * .25); ctx.restore();
  }
  const ticket = String(state.ticket || 'VOL. 1').toUpperCase();
  ctx.save(); ctx.translate(W - margin - H * .078, y + H * .084); ctx.rotate(.055);
  const tw = H * .135, th = H * .083; ctx.fillStyle = grade.frame; ctx.strokeStyle = '#201923'; ctx.lineWidth = Math.max(2, H * .004);
  ctx.fillRect(-tw / 2, -th / 2, tw, th); ctx.strokeRect(-tw / 2, -th / 2, tw, th);
  ctx.fillStyle = '#201923'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '900 ' + Math.max(11, H * .021) + 'px Bebas, Anton, sans-serif'; ctx.fillText(ticket, 0, 0, tw * .88); ctx.restore();
}
function drawTagline(ctx, state, grade, W, H) {
  const text = String(state.tagline || 'A CITY THAT NEVER COOLS').trim(); if (!text) return;
  const fs = Math.max(9, H * .016), pad = H * .014; ctx.save(); ctx.font = '800 ' + fs + 'px Inter, sans-serif';
  const w = Math.min(W * .8, ctx.measureText(text).width + pad * 2), h = fs + pad * 1.15, x = (W - w) / 2, y = H * .888;
  roundedRect(ctx, x, y, w, h, h / 2); ctx.fillStyle = rgba('#11141d', .8); ctx.fill();
  ctx.strokeStyle = grade.frame; ctx.lineWidth = Math.max(1, H * .0018); ctx.stroke();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff4dd'; ctx.fillText(text.toUpperCase(), W / 2, y + h / 2); ctx.restore();
}
function drawSeal(ctx, grade, W, H) {
  const cx = W * .87, cy = H * .84, r1 = Math.min(W, H) * .068, r2 = r1 * .8;
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(-.11); ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = r1 * .25;
  ctx.beginPath(); for (let i = 0; i < 24; i++) { const a = -Math.PI / 2 + i * Math.PI / 12, r = i % 2 ? r2 : r1; const px = Math.cos(a) * r, py = Math.sin(a) * r; if (!i) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
  ctx.closePath(); ctx.fillStyle = grade.frame; ctx.fill(); ctx.lineWidth = Math.max(2, r1 * .07); ctx.strokeStyle = '#fff0be'; ctx.stroke();
  ctx.shadowBlur = 0; ctx.fillStyle = '#28202a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '900 ' + Math.max(8, r1 * .24) + 'px Inter, sans-serif';
  ctx.fillText('ORIGINAL', 0, -r1 * .18); ctx.font = '900 ' + Math.max(8, r1 * .2) + 'px Inter, sans-serif'; ctx.fillText('COVER ART', 0, r1 * .17); ctx.fillText('★', 0, r1 * .48); ctx.restore();
}
function drawBarcode(ctx, W, H) {
  const x = W * .82, y = H * .91, w = W * .14, h = H * .055; let seed = 0x6d2b79;
  ctx.save(); ctx.fillStyle = 'rgba(255,250,232,.9)'; ctx.fillRect(x - 4, y - 3, w + 8, h + 7);
  ctx.fillStyle = '#191821'; let at = x;
  while (at < x + w) { seed = (seed * 1664525 + 1013904223) >>> 0; const bw = 1 + (seed % 5) * W / 1080; ctx.fillRect(at, y, Math.min(bw, x + w - at), h); at += bw + (1 + ((seed >>> 8) % 3)) * W / 1080; }
  ctx.font = '600 ' + Math.max(6, H * .009) + 'px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText('6 021 984 197', x + w / 2, y + h + 1); ctx.restore();
}
function drawBilling(ctx, state, W, H) {
  const ending = String(state.ending || 'COMING SOON').toUpperCase();
  ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const fs = Math.max(8, H * .012); ctx.font = '800 ' + fs + 'px Inter, sans-serif'; ctx.fillStyle = '#fff4dd';
  ctx.fillText('A SUNSET REEL PICTURE  ·  STARRING  ·  ' + String(state.title || 'PALM FEVER').toUpperCase(), W * .5, H * .969, W * .84);
  ctx.font = '900 ' + Math.max(10, H * .018) + 'px Bebas, Anton, sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText(ending, W * .5, H * .935); ctx.restore();
}
function drawPalms(ctx, W, H, grade) {
  const base = H * .988, scale = Math.min(W, H);
  ctx.save(); ctx.fillStyle = 'rgba(15,19,27,.82)'; ctx.fillRect(0, base - H * .052, W, H * .064);
  // Repeating low buildings add a skyline silhouette beneath the credits.
  for (let i = 0; i < 11; i++) { const bw = W * (.045 + (i % 3) * .012), bh = H * (.025 + (i % 4) * .009), bx = i * W * .098; ctx.fillRect(bx, base - bh, bw, bh); }
  const palm = (px, py, height, lean) => {
    ctx.lineWidth = Math.max(3, scale * .009); ctx.strokeStyle = 'rgba(15,19,27,.94)'; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(px, py); ctx.quadraticCurveTo(px + lean * .5, py - height * .55, px + lean, py - height); ctx.stroke();
    const tx = px + lean, ty = py - height;
    for (let i = 0; i < 7; i++) { const a = Math.PI + i * Math.PI / 6; const len = height * (.33 + (i % 2) * .035); ctx.beginPath(); ctx.moveTo(tx, ty); ctx.quadraticCurveTo(tx + Math.cos(a) * len * .5, ty + Math.sin(a) * len * .4, tx + Math.cos(a) * len, ty + Math.sin(a) * len); ctx.lineWidth = Math.max(2, scale * .006); ctx.stroke(); }
  };
  palm(W * .075, base, H * .22, W * .03); palm(W * .93, base, H * .19, -W * .025);
  ctx.globalAlpha = .16; ctx.fillStyle = grade.frame; ctx.fillRect(0, base - 2, W, 2); ctx.restore();
}
function drawCoverDetails(ctx, state, grade, W, H) {
  drawHeader(ctx, state, grade, W, H);
  drawRetroTitle(ctx, state, grade, W, H, state.__titleZone);
  drawSubtitle(ctx, state, grade, W, H, state.__titleZone);
  drawTagline(ctx, state, grade, W, H);
  if (state.showPalm !== false) drawPalms(ctx, W, H, grade);
  if (state.showSeal !== false) drawSeal(ctx, grade, W, H);
  if (state.showBarcode !== false) drawBarcode(ctx, W, H);
  if (state.showBilling !== false) drawBilling(ctx, state, W, H);
}

export function renderPoster(canvas, state = {}) {
  const W = Math.max(1, canvas.width), H = Math.max(1, canvas.height), ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  renderBindings.set(canvas, state);
  const grade = gradeFor(state.grade), spec = layoutSpec(state.layout || 'hero');
  const titleZone = spec.title;
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H);
  // The grade sky provides a continuous field behind every layout. A title band
  // gets its own sunset skyline after the full poster field has been painted.
  ctx.fillStyle = makeGradient(ctx, { x: 0, y: 0, w: W, h: H }, grade.sky, true);
  ctx.fillRect(0, 0, W, H);
  drawSky(ctx, grade, W, H, spec.band);
  spec.panels.forEach((box, index) => drawPanelImage(ctx, state, box, index, grade, W, H));
  // Apply the grade map and print treatments to the assembled art before lettering.
  applyGradientMap(ctx, canvas, grade, state.gradeStrength === undefined ? 72 : state.gradeStrength);
  applyInk(ctx, canvas, state.ink === undefined ? 42 : state.ink);
  applyHalftone(ctx, canvas, state.halftone === undefined ? 18 : state.halftone);
  applyGrain(ctx, canvas, state.grain === undefined ? 16 : state.grain);
  applyGlow(ctx, W, H, grade, state.glow === undefined ? 34 : state.glow, titleZone);
  // A temporary property avoids threading a second title-zone argument through detail helpers.
  const details = Object.assign({}, state, { __titleZone: titleZone });
  drawCoverDetails(ctx, details, grade, W, H);
  ctx.restore(); return canvas;
}

export function drawCover(state, w, h) {
  const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(w)); canvas.height = Math.max(1, Math.round(h));
  return renderPoster(canvas, state);
}
const EXPORT_SIZES = { square: [1080, 1080], portrait: [1080, 1350], wide: [1920, 1080] };
export function exportPNG(state, size = 'portrait') {
  const [w, h] = EXPORT_SIZES[size] || EXPORT_SIZES.portrait;
  const photos = (state.photos || []).map(photo => sourceImage(photo && photo.src)).filter(Boolean);
  const ready = photos.map(img => {
    if (img.complete) return (img.naturalWidth || img.width) ? Promise.resolve() : Promise.reject(new Error('A poster photo could not be loaded.'));
    return new Promise((resolve, reject) => {
      img.addEventListener('load', resolve, { once: true });
      img.addEventListener('error', () => reject(new Error('A poster photo could not be loaded.')), { once: true });
    });
  });
  return Promise.all(ready).then(() => {
    const canvas = drawCover(state, w, h);
    return new Promise((resolve, reject) => {
      if (!canvas.toBlob) { reject(new Error('PNG export is not supported by this browser.')); return; }
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not encode the poster as PNG.')), 'image/png');
    });
  });
}

export function applyQueryParams(state, search = '') {
  const params = new URLSearchParams(String(search || '').replace(/^\?/, ''));
  const shot = params.get('shot');
  if (params.has('caption')) state.title = params.get('caption');
  const layout = params.get('layout'); if (layout && LAYOUTS.some(item => item.id === layout)) state.layout = layout;
  const grade = params.get('grade'); if (grade && GRADES.some(item => item.id === grade)) state.grade = grade;
  const photo = params.get('photo');
  if (photo && Array.isArray(state.photos)) {
    const index = state.photos.findIndex(item => item && (item.name === photo || String(item.src || '').split('/').pop().split('?')[0] === photo));
    if (index >= 0) {
      if (!Array.isArray(state.panels)) state.panels = [];
      if (!state.panels[0]) state.panels[0] = { photo: index, zoom: 1, ox: 0, oy: 0, flip: false, fx: .5, fy: .5 };
      else state.panels[0].photo = index;
    }
  }
  return shot === 'cover' ? 'cover' : 'editor';
}
