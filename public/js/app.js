// METARAY — client app. Runs entirely in the browser; no backend.
import { DEVICES, BRANDS, CAM_LABEL } from './devices.js';
import { PLACES } from './places.js';
import { buildTags, summarize, kindOf, jitterPoint } from './tags.js';
import { readMeta, writeFile, onEngine } from './exif.js';
import * as geo from './geo.js';
import { deviceFileName, addSeconds, randomCounter } from './names.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const pad = (n) => String(n).padStart(2, '0');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const fmtSize = (b) => (b > 1e9 ? (b / 1e9).toFixed(2) + ' GB' : b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.round(b / 1e3) + ' KB');
const parseDay = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const dayStr = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
// Formats Chrome/Firefox can draw natively; HEIC only renders in Safari.
const BROWSER_IMG = new Set(['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'heic', 'heif']);

const now = new Date();
const S = {
  files: [], // { id, file, name, ext, kind, size, meta, summary, url, out, outUrl }
  sel: new Set(),
  focus: null,
  lat: null, lon: null, alt: null,
  place: null,
  zone: null, offset: null,
  date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
  time: `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
  tlCenter: null,
  brand: 'Apple',
  device: null, cam: 'main',
  activeCity: null, activeDistrict: null,
};
S.tlCenter = S.date;
let nextId = 1;

// Per-batch randomness, kept stable so the preview matches what gets written. "Shuffle" rerolls it.
let batchSeed = { counter: randomCounter(), steps: [] };
function seedAt(i) {
  while (batchSeed.steps.length <= i) {
    // Gap to the previous shot: mostly a few seconds, sometimes a minute or two
    const gap = Math.random() < 0.8 ? 2 + Math.floor(Math.random() * 20) : 30 + Math.floor(Math.random() * 120);
    batchSeed.steps.push({ gap, ms: Math.floor(Math.random() * 1000) });
  }
  return batchSeed.steps[i];
}

// ---------- utils ----------
let toastT;
function toast(msg, err) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.toggle('err', !!err);
  t.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), 2800);
}
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

onEngine((state) => {
  const el = $('#engine');
  el.className = `engine ${state}`;
  el.querySelector('span').textContent = state === 'loading' ? 'Loading ExifTool…' : state === 'ready' ? 'ExifTool ready' : 'ExifTool';
});

// ---------- tabs ----------
$('#tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-tab]');
  if (b) setTab(b.dataset.tab);
});
function setTab(name) {
  $$('#tabs button').forEach((x) => x.classList.toggle('on', x.dataset.tab === name));
  $$('.pane').forEach((p) => p.classList.toggle('on', p.dataset.pane === name));
  if (name === 'export') renderDist();
}

// ---------- map ----------
const map = new maplibregl.Map({
  container: 'map',
  style: 'https://tiles.openfreemap.org/styles/dark',
  center: [-118.2475, 34.0505],
  zoom: 15.2,
  pitch: 58,
  bearing: -24,
  maxPitch: 75,
  fadeDuration: 0,
  pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
  attributionControl: { compact: true },
});
map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');

// Short hint for the zoom/compass buttons: shows on hover, fades out after a couple of seconds.
{
  const ctrl = map.getContainer().querySelector('.maplibregl-ctrl-bottom-right .maplibregl-ctrl-group');
  const hint = document.createElement('div');
  hint.className = 'ctrl-hint';
  hint.innerHTML = '<div><b>＋ −</b> zoom</div><div><b>◭</b> drag to rotate &amp; tilt, click to face north</div><div class="sub">or right-drag on the map</div>';
  document.querySelector('.frame').appendChild(hint);
  let t;
  ctrl.addEventListener('mouseenter', () => {
    const fr = document.querySelector('.frame').getBoundingClientRect();
    const r = ctrl.getBoundingClientRect();
    hint.style.right = `${fr.right - r.left + 10}px`;
    hint.style.bottom = `${fr.bottom - r.bottom}px`;
    hint.classList.add('show');
    clearTimeout(t);
    t = setTimeout(() => hint.classList.remove('show'), 2500);
  });
}

// Below this zoom the street heatmap and 3D buildings are skipped: they are the expensive part when zoomed out.
const HEAT_MIN_ZOOM = 12.5;
const roadLayers = [];
const fc = (features) => ({ type: 'FeatureCollection', features });

map.on('load', () => {
  const style = map.getStyle();
  for (const l of style.layers) {
    if (l.type === 'symbol') {
      // Muted labels, as in the reference
      try {
        map.setPaintProperty(l.id, 'text-color', l.id.startsWith('place') ? '#9aa3a8' : '#5d666b');
        map.setPaintProperty(l.id, 'text-halo-color', 'rgba(8,9,10,.9)');
      } catch {}
      if (/poi|housenum/.test(l.id)) map.setLayoutProperty(l.id, 'visibility', 'none');
    }
    if (l.type === 'line' && l['source-layer'] === 'transportation') roadLayers.push(l.id);
  }
  map.setPaintProperty('background', 'background-color', '#0b0d0f');
  if (map.getLayer('building')) map.setLayoutProperty('building', 'visibility', 'none');
  const firstSymbol = style.layers.find((l) => l.type === 'symbol')?.id;

  // Glow along major roads
  map.addLayer({
    id: 'road-glow', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', minzoom: 10,
    filter: ['match', ['get', 'class'], ['motorway', 'trunk', 'primary', 'secondary'], true, false],
    paint: {
      'line-color': '#2ce6d4',
      'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 10, 1, 16, 9, 18, 22],
      'line-blur': ['interpolate', ['linear'], ['zoom'], 10, 2, 16, 8],
      'line-opacity': 0.18,
    },
  }, firstSymbol);
  map.addLayer({
    id: 'road-core', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', minzoom: 10,
    filter: ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], true, false],
    paint: {
      'line-color': '#7ff5ea',
      'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 10, 0.4, 16, 1.4, 18, 3],
      'line-opacity': 0.55,
    },
  }, firstSymbol);

  // Heatmap along the streets around the selected point
  map.addSource('heat', { type: 'geojson', data: fc([]) });
  map.addLayer({
    id: 'heat', type: 'heatmap', source: 'heat', minzoom: HEAT_MIN_ZOOM - 0.5,
    paint: {
      'heatmap-weight': ['get', 'w'],
      'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 11, 0.8, 16, 1.9],
      'heatmap-radius': ['interpolate', ['exponential', 1.7], ['zoom'], 11, 6, 15, 22, 18, 60],
      'heatmap-opacity': 0.85,
      'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'],
        0, 'rgba(0,0,0,0)', 0.08, 'rgba(20,40,255,0.25)', 0.25, 'rgba(30,110,255,0.55)', 0.45, '#16d6ff',
        0.62, '#3dff8f', 0.8, '#ffe247', 0.92, '#ff8a1f', 1, '#ff2a1a'],
    },
  }, firstSymbol);

  map.addLayer({
    id: 'building-3d', type: 'fill-extrusion', source: 'openmaptiles', 'source-layer': 'building', minzoom: 14,
    paint: {
      'fill-extrusion-color': ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 6],
        0, '#23272b', 30, '#353b40', 80, '#495055', 200, '#5c646a'],
      'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 14, 0, 15, ['coalesce', ['get', 'render_height'], 6]],
      'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
      'fill-extrusion-opacity': 0.92,
      'fill-extrusion-vertical-gradient': true,
    },
  }, firstSymbol);
  map.setLight({ anchor: 'map', color: '#dfe9ee', intensity: 0.3, position: [1.3, 210, 35] });

  // Where the loaded files were originally shot
  map.addSource('orig', { type: 'geojson', data: fc([]) });
  map.addLayer({ id: 'orig', type: 'circle', source: 'orig', paint: {
    'circle-radius': 5, 'circle-color': '#ff8a3c', 'circle-stroke-color': 'rgba(5,6,7,.9)', 'circle-stroke-width': 2,
  } });
  updateOrig();
});

// Sample road vertices on screen and weight them by distance to the point: gives the street glow from the reference.
function buildHeat(center) {
  const src = map.getSource('heat');
  if (!src || !roadLayers.length) return;
  if (map.getZoom() < HEAT_MIN_ZOOM) { src.setData(fc([])); return; }
  const feats = map.queryRenderedFeatures({ layers: roadLayers.filter((id) => map.getLayer(id)) })
    .sort(() => Math.random() - 0.5); // so the point cap thins streets evenly instead of dropping whole areas
  const cp = map.project(center);
  const reach = Math.max(map.getCanvas().clientWidth, 600) * 0.45;
  const pts = [];
  outer: for (const f of feats) {
    const g = f.geometry;
    const lines = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
    const boost = { motorway: 1, trunk: 1, primary: 0.9, secondary: 0.75, tertiary: 0.6 }[f.properties.class] || 0.35;
    for (const line of lines) {
      for (let i = 1; i < line.length; i++) {
        const a = line[i - 1], b = line[i];
        for (let s = 0; s < 3; s++) {
          const c = [a[0] + ((b[0] - a[0]) * s) / 3, a[1] + ((b[1] - a[1]) * s) / 3];
          const p = map.project(c);
          const d = Math.hypot(p.x - cp.x, p.y - cp.y);
          if (d > reach) continue;
          const w = boost * Math.exp(-d / (reach * 0.35)) * (0.35 + Math.random() * 0.9);
          if (w < 0.05 || Math.random() > 0.55) continue;
          pts.push({ type: 'Feature', properties: { w }, geometry: { type: 'Point', coordinates: c } });
          if (pts.length > 3000) break outer;
        }
      }
    }
  }
  pts.push({ type: 'Feature', properties: { w: 3 }, geometry: { type: 'Point', coordinates: [center.lng, center.lat] } });
  src.setData(fc(pts));
}
const heatCenter = () => (S.lat != null ? { lng: S.lon, lat: S.lat } : map.getCenter());
// Rebuild once the map settles and tiles are in; before that the streets are not on screen yet.
let heatDirty = true;
map.on('moveend', () => { heatDirty = true; });
map.on('idle', () => {
  if (!heatDirty) return;
  heatDirty = false;
  buildHeat(heatCenter());
});

function updateOrig() {
  const src = map.getSource('orig');
  if (!src) return;
  src.setData(fc(S.files.filter((x) => x.summary?.lat != null)
    .map((x) => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [x.summary.lon, x.summary.lat] } }))));
}

// Selected point marker
const pinEl = document.createElement('div');
pinEl.className = 'pin';
pinEl.innerHTML = '<div class="ring"></div><div class="ring b"></div><div class="core"></div><div class="tag" id="pinTag"></div>';
const marker = new maplibregl.Marker({ element: pinEl, draggable: true });
marker.on('dragend', () => { const ll = marker.getLngLat(); setPoint(ll.lat, ll.lng, { fly: false }); });
map.on('click', (e) => setPoint(e.lngLat.lat, e.lngLat.lng, { fly: false }));

// ---------- point selection ----------
// Nominatim allows at most ~1 request per second.
const reverseLookup = debounce(async (lat, lon) => {
  try {
    const place = await geo.reverse(lat, lon);
    if (S.lat !== lat) return;
    S.place = place;
  } catch { S.place = null; }
  renderPlace();
}, 1000);

const lookupElevation = debounce(async (lat, lon) => {
  try {
    const e = await geo.elevation(lat, lon);
    if (S.lat !== lat || e == null) return;
    // Phones report altitude with some noise; add a couple of meters so it doesn't look like a DEM lookup.
    S.alt = +(e + rand(1.2, 6)).toFixed(3);
    $('#alt').value = S.alt;
    renderAll();
  } catch {}
}, 400);

function updateTz() {
  if (S.lat == null) return;
  try {
    const r = geo.timezone(S.lat, S.lon, `${S.date}T${S.time}`);
    S.zone = r.zone; S.offset = r.offset;
  } catch { S.zone = null; S.offset = '+00:00'; }
}

function setPoint(lat, lon, { fly = true, zoom } = {}) {
  S.lat = +lat.toFixed(6); S.lon = +lon.toFixed(6);
  $('#lat').value = S.lat; $('#lon').value = S.lon;
  marker.setLngLat([S.lon, S.lat]).addTo(map);
  if (fly) map.flyTo({ center: [S.lon, S.lat], zoom: zoom ?? Math.max(map.getZoom(), 15.4), pitch: 58, speed: 1.4, essential: true });
  else heatDirty = true;
  S.place = null;
  $('#placeText').textContent = 'looking up address…';
  reverseLookup(S.lat, S.lon);
  lookupElevation(S.lat, S.lon);
  updateTz();
  renderAll();
}

const randomAround = (lat, lon, r) => jitterPoint(lat, lon, r);

['lat', 'lon'].forEach((id) => $('#' + id).addEventListener('change', () => {
  const la = parseFloat($('#lat').value.replace(',', '.')), lo = parseFloat($('#lon').value.replace(',', '.'));
  if (Number.isFinite(la) && Number.isFinite(lo)) setPoint(la, lo);
}));
$('#alt').addEventListener('change', (e) => { const v = parseFloat(e.target.value); S.alt = Number.isFinite(v) ? v : null; renderAll(); });

// ---------- cities and districts ----------
function renderCities() {
  $('#cities').innerHTML = PLACES.map((p, i) => `<button class="chip ${S.activeCity === i ? 'on' : ''}" data-i="${i}">${esc(p.city)}</button>`).join('');
  const c = PLACES[S.activeCity];
  $('#distTitle').hidden = !c;
  $('#districts').innerHTML = c ? c.d.map(([n], j) => `<button class="chip ${S.activeDistrict === j ? 'on' : ''}" data-j="${j}">${esc(n)}</button>`).join('') : '';
}
$('#cities').addEventListener('click', (e) => {
  const b = e.target.closest('[data-i]'); if (!b) return;
  S.activeCity = +b.dataset.i; S.activeDistrict = null;
  const c = PLACES[S.activeCity];
  renderCities();
  map.flyTo({ center: [c.d[0][2], c.d[0][1]], zoom: 13.2, pitch: 50, speed: 1.4 });
});
$('#districts').addEventListener('click', (e) => {
  const b = e.target.closest('[data-j]'); if (!b) return;
  S.activeDistrict = +b.dataset.j;
  const c = PLACES[S.activeCity];
  const [name, la, lo] = c.d[S.activeDistrict];
  let [lat, lon] = [la, lo];
  if ($('#randomPick').checked) [lat, lon] = randomAround(la, lo, +$('#radius').value || 500);
  renderCities();
  setPoint(lat, lon, { zoom: 15.6 });
  toast(`${c.city} · ${name}`);
});

// Search
let results = [];
const doSearch = debounce(async (q) => {
  if (q.trim().length < 2) { $('#results').innerHTML = ''; return; }
  try {
    results = await geo.search(q);
    $('#results').innerHTML = results.map((r, i) => `<li data-i="${i}"><b>${esc(r.name)}</b><span>${esc(r.detail)}${r.type ? ' · ' + esc(r.type) : ''}</span></li>`).join('')
      || '<li><span>nothing found</span></li>';
  } catch (e) { toast('Search unavailable: ' + e.message, true); }
}, 350);
$('#q').addEventListener('input', (e) => doSearch(e.target.value));
$('#q').addEventListener('keydown', (e) => { if (e.key === 'Escape') $('#results').innerHTML = ''; });
$('#results').addEventListener('click', (e) => {
  const li = e.target.closest('li[data-i]'); if (!li) return;
  const r = results[+li.dataset.i];
  $('#results').innerHTML = '';
  $('#q').value = r.name;
  let { lat, lon } = r;
  let zoom = 15.4;
  if (r.bbox) {
    const span = Math.max(r.bbox.n - r.bbox.s, r.bbox.e - r.bbox.w);
    if (span > 0) zoom = Math.max(11, Math.min(16.5, Math.log2(360 / span) - 0.5));
    if ($('#randomPick').checked && span > 0.002) {
      // Random point inside the middle half of the bounding box
      lat = r.bbox.s + (r.bbox.n - r.bbox.s) * rand(0.25, 0.75);
      lon = r.bbox.w + (r.bbox.e - r.bbox.w) * rand(0.25, 0.75);
      zoom = Math.max(zoom, 15);
    }
  }
  S.activeCity = null; S.activeDistrict = null; renderCities();
  setPoint(lat, lon, { zoom });
});
document.addEventListener('click', (e) => { if (!e.target.closest('.search')) $('#results').innerHTML = ''; });

const placeLabel = () => (S.place ? [S.place.district, S.place.city, S.place.country].filter(Boolean).join(', ') : '');
function renderPlace() {
  $('#placeText').textContent = S.place ? (S.place.display || placeLabel()) : (S.lat != null ? 'address not found' : '—');
  renderAll();
}

// ---------- date and timeline ----------
function renderTimeline() {
  const c = parseDay(S.tlCenter);
  const html = [];
  for (let i = -7; i <= 7; i++) {
    const d = new Date(c.getTime() + i * 864e5);
    const ds = dayStr(d);
    const wk = d.getUTCDay() === 0 || d.getUTCDay() === 6;
    html.push(`<button class="tl-day ${wk ? 'wk' : ''} ${ds === S.date ? 'on' : ''}" data-d="${ds}"><i></i><span>${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}</span></button>`);
  }
  $('#tl').innerHTML = html.join('');
  $('#dateIn').value = S.date;
  $('#timeIn').value = S.time;
}
const dateChanged = () => { renderTimeline(); updateTz(); renderAll(); };
$('#tl').addEventListener('click', (e) => {
  const b = e.target.closest('[data-d]'); if (!b) return;
  S.date = b.dataset.d; dateChanged();
});
$('#tlPrev').onclick = () => { S.tlCenter = dayStr(new Date(parseDay(S.tlCenter).getTime() - 7 * 864e5)); renderTimeline(); };
$('#tlNext').onclick = () => { S.tlCenter = dayStr(new Date(parseDay(S.tlCenter).getTime() + 7 * 864e5)); renderTimeline(); };
$('#dateIn').addEventListener('change', (e) => { if (!e.target.value) return; S.date = S.tlCenter = e.target.value; dateChanged(); });
$('#timeIn').addEventListener('change', (e) => {
  let v = e.target.value; if (!v) return;
  if (v.length === 5) v += ':' + pad(Math.floor(Math.random() * 60));
  S.time = v; updateTz(); renderAll();
});

// ---------- devices ----------
function renderBrands() {
  $('#brands').innerHTML = BRANDS.map((b) => `<button class="chip ${b === S.brand ? 'on' : ''}" data-b="${esc(b)}">${esc(b)}</button>`).join('');
}
$('#brands').addEventListener('click', (e) => {
  const b = e.target.closest('[data-b]'); if (!b) return;
  S.brand = b.dataset.b; renderBrands(); renderDevices();
  $('[data-pane="device"]').scrollTop = 0;
});
$('#devQ').addEventListener('input', renderDevices);
function renderDevices() {
  const q = $('#devQ').value.trim().toLowerCase();
  const list = DEVICES.filter((d) => (q ? `${d.brand} ${d.name} ${d.model}`.toLowerCase().includes(q) : d.brand === S.brand));
  $('#devices').innerHTML = list.map((d, i) => {
    // Bar length reflects how recent the model is
    const pct = Math.max(12, Math.min(100, ((d.year - 2017) / (2025 - 2017)) * 100));
    const sub = d.os === 'android' && d.model !== d.name ? `<em>${esc(d.model)}</em>` : '';
    return `<li data-k="${DEVICES.indexOf(d)}" class="${S.device === d ? 'on' : ''}">
      <div class="r-top"><span class="r-n">${i + 1}. ${esc(d.name)} ${sub}</span><span class="r-y">${d.year}</span></div>
      <div class="r-bar"><i style="width:${pct}%"></i></div></li>`;
  }).join('') || '<div class="empty">no matches</div>';
}
$('#devices').addEventListener('click', (e) => {
  const li = e.target.closest('[data-k]'); if (!li) return;
  selectDevice(DEVICES[+li.dataset.k]);
});
function selectDevice(d) {
  S.device = d;
  S.cam = d.cams.main ? 'main' : Object.keys(d.cams)[0];
  $('#software').value = d.software[d.software.length - 1] || '';
  $('#swList').innerHTML = d.software.filter(Boolean).map((v) => `<option value="${esc(v)}">`).join('');
  $('#swLabel').textContent = d.os === 'ios' ? 'iOS version (Software)' : 'Firmware (Software)';
  rollExposure();
  renderDevices(); renderDevice(); renderAll();
}
function renderDevice() {
  const d = S.device;
  if (!d) {
    $('#devBig').innerHTML = '<span class="muted">Pick a phone in the Device tab</span>';
    $('#cams').innerHTML = '';
    return;
  }
  $('#devBig').innerHTML = `${esc(d.name)}<small>${esc(d.make)} · ${esc(d.model)}</small>`;
  $('#cams').innerHTML = Object.keys(d.cams).map((k) => `<button class="chip ${k === S.cam ? 'on' : ''}" data-c="${k}">${CAM_LABEL[k]}</button>`).join('');
}
$('#cams').addEventListener('click', (e) => {
  const b = e.target.closest('[data-c]'); if (!b) return;
  S.cam = b.dataset.c; $('#fNumber').value = S.device.cams[S.cam].fNumber; renderDevice(); renderAll();
});
$('#software').addEventListener('input', renderAll);

// Plausible exposure for the time of day
function rollExposure() {
  const h = +S.time.slice(0, 2);
  const cam = S.device?.cams[S.cam];
  let shutter, iso;
  if (h >= 9 && h < 17) { shutter = pick([60, 100, 120, 160, 200, 250, 320, 400, 500, 640, 800, 1000, 1250, 1600, 2000]); iso = pick([32, 40, 50, 64, 80, 100]); }
  else if ((h >= 7 && h < 9) || (h >= 17 && h < 20)) { shutter = pick([30, 40, 50, 60, 100, 120]); iso = pick([80, 100, 125, 160, 200, 250, 320, 400]); }
  else { shutter = pick([4, 8, 10, 15, 17, 20, 25, 30]); iso = pick([500, 640, 800, 1000, 1250, 1600, 2000, 2500]); }
  $('#fNumber').value = cam ? cam.fNumber : '';
  $('#exposure').value = `1/${shutter}`;
  $('#iso').value = iso;
  renderAll();
}
$('#rollExp').onclick = rollExposure;
['fNumber', 'exposure', 'iso'].forEach((id) => $('#' + id).addEventListener('input', renderAll));

// ---------- files ----------
const drop = $('#drop');
['dragenter', 'dragover'].forEach((ev) => document.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((ev) => document.addEventListener(ev, (e) => { e.preventDefault(); if (ev === 'drop' || !e.relatedTarget) drop.classList.remove('over'); }));
document.addEventListener('drop', (e) => { if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files); });
$('#fileInput').addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; });

async function addFiles(list) {
  const incoming = [...list].filter((f) => kindOf(f.name) !== 'other');
  if (incoming.length < list.length) toast('Some files were skipped: unsupported format', true);
  if (!incoming.length) return;
  setTab('media');
  let ok = 0;
  for (const file of incoming) {
    const ext = file.name.split('.').pop().toLowerCase();
    const entry = { id: String(nextId++), file, name: file.name, ext, kind: kindOf(file.name), size: file.size, meta: {}, summary: {}, url: URL.createObjectURL(file), out: null, outUrl: null, loading: true };
    S.files.push(entry); S.sel.add(entry.id);
    if (!S.focus) S.focus = entry.id;
    renderFiles(); renderPreview();
    toast(`Reading ${file.name}…`);
    try {
      entry.meta = await readMeta(file);
      entry.summary = summarize(entry.meta);
      ok++;
    } catch (e) {
      entry.error = String(e.message || e);
      toast(`${file.name}: ${entry.error}`, true);
    }
    entry.loading = false;
    renderFiles();
  }
  // If a file already has GPS and no point is picked yet, show where it was shot
  const g = S.files.find((r) => r.summary?.lat != null);
  if (g && S.lat == null) map.flyTo({ center: [g.summary.lon, g.summary.lat], zoom: 15, speed: 1.4 });
  updateOrig(); renderFiles(); renderPreview(); renderAll();
  toast(`Loaded ${plural(ok, 'file', 'files')}`);
}

function thumbHtml(f) {
  if (f.kind === 'video') return `<div class="th vid"><video src="${f.url}#t=0.4" muted preload="metadata"></video></div>`;
  if (BROWSER_IMG.has(f.ext)) return `<div class="th"><img src="${f.url}" alt="" /></div>`;
  return `<div class="th ph">${esc(f.ext)}</div>`;
}
function renderFiles() {
  const ul = $('#files');
  if (!S.files.length) ul.innerHTML = '<li class="empty">nothing here yet — add some media</li>';
  else ul.innerHTML = S.files.map((f) => {
    const s = f.summary || {};
    const dev = f.loading ? 'reading metadata…' : f.error ? 'unreadable' : [s.make, s.model].filter(Boolean).join(' ') || 'no device info';
    const st = f.out ? 'done' : s.lat != null ? 'gps' : '';
    const title = f.out ? 'written' : s.lat != null ? 'has GPS' : 'no GPS';
    return `<li class="file ${S.sel.has(f.id) ? 'sel' : ''} ${S.focus === f.id ? 'focus' : ''}" data-id="${f.id}">
      <span class="ck" data-act="ck"></span>${thumbHtml(f)}
      <div class="nm"><b>${esc(f.name)}</b><span>${esc(dev)} · ${fmtSize(f.size)}</span></div>
      <div class="fa"><span class="st ${st}" title="${title}"></span><button class="x" data-act="rm" title="Remove">×</button></div>
    </li>`;
  }).join('');
  const withGps = S.files.filter((f) => f.summary?.lat != null).length;
  $('#kFiles').textContent = S.files.length;
  $('#kGps').textContent = S.files.length ? Math.round((withGps / S.files.length) * 100) + '%' : '0%';
  $('#applyCount').textContent = plural(S.sel.size, 'file', 'files');
  $('#apply').disabled = !S.sel.size;
}
// Browsers that can't decode a format (e.g. HEIC outside Safari) get an extension badge instead.
document.addEventListener('error', (e) => {
  const img = e.target;
  if (img.tagName !== 'IMG' || !img.closest('.th, .ins-prev')) return;
  const box = img.parentElement;
  const f = S.files.find((x) => x.url === img.getAttribute('src') || x.outUrl === img.getAttribute('src'));
  box.classList.add('ph');
  box.innerHTML = box.classList.contains('ins-prev') ? `<div class="ph-t">No preview for .${esc(f?.ext || '')} in this browser</div>` : esc(f?.ext || '?');
}, true);

$('#files').addEventListener('click', (e) => {
  const li = e.target.closest('[data-id]'); if (!li) return;
  const id = li.dataset.id;
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'ck') {
    if (S.sel.has(id)) S.sel.delete(id); else S.sel.add(id);
  } else if (act === 'rm') {
    const f = S.files.find((x) => x.id === id);
    if (f) { URL.revokeObjectURL(f.url); if (f.outUrl) URL.revokeObjectURL(f.outUrl); }
    S.files = S.files.filter((x) => x.id !== id); S.sel.delete(id);
    if (S.focus === id) S.focus = S.files[0]?.id || null;
    updateOrig();
  } else {
    S.focus = id;
    const f = S.files.find((x) => x.id === id);
    if (f?.summary?.lat != null) map.flyTo({ center: [f.summary.lon, f.summary.lat], speed: 1.4 });
  }
  renderFiles(); renderPreview(); renderAll();
});
$('#selAll').onclick = () => {
  if (S.sel.size === S.files.length) S.sel.clear(); else S.files.forEach((f) => S.sel.add(f.id));
  renderFiles(); renderAll();
};

// Right panel: the focused file, or a short how-to while nothing is loaded.
function renderPreview() {
  const f = S.files.find((x) => x.id === S.focus);
  const box = $('#prev');
  box.className = 'ins-prev';
  if (!f) {
    box.classList.add('empty');
    const p = payload();
    box.innerHTML = `<ol class="steps">
      <li class="${S.files.length ? 'done' : ''}"><span><b>Add photos or videos</b> — drop them anywhere or click here</span></li>
      <li class="${p.lat != null ? 'done' : ''}"><span><b>Pick the location</b> — click the map or choose a city</span></li>
      <li class="${p.make ? 'done' : ''}"><span><b>Choose the phone</b> in the Device tab</span></li>
      <li><span><b>Set the date</b> on the timeline, then <b>Export</b></span></li>
    </ol>
    <div class="privacy">Everything runs in your browser. Files are never uploaded.</div>`;
    $('#prevName').textContent = '';
    return;
  }
  const url = f.outUrl || f.url;
  if (f.kind === 'video') box.innerHTML = `<video src="${url}" muted loop autoplay playsinline></video>`;
  else if (BROWSER_IMG.has(f.ext)) box.innerHTML = `<img src="${url}" alt="" />`;
  else { box.classList.add('ph'); box.innerHTML = `<div class="ph-t">No preview for .${esc(f.ext)}</div>`; }
  $('#prevName').textContent = f.out ? `${f.name} → ${f.out.name}` : f.name;
}
$('#prev').addEventListener('click', () => { if (!S.files.length) $('#fileInput').click(); });

// ---------- payload ----------
function payload() {
  const d = S.device;
  const cam = d?.cams[S.cam];
  const num = (id) => { const v = parseFloat($('#' + id).value.replace(',', '.')); return Number.isFinite(v) ? v : undefined; };
  return {
    make: d?.make, model: d?.model,
    software: $('#software').value.trim() || undefined,
    androidVersion: d?.android?.[d.android.length - 1],
    lensMake: d?.lensMake || undefined,
    lensModel: cam?.lensModel || undefined,
    focalLength: cam?.focalLength, focal35: cam?.focal35,
    fNumber: num('fNumber'),
    exposureTime: $('#exposure').value.trim() || undefined,
    iso: num('iso') ? Math.round(num('iso')) : undefined,
    date: S.offset ? `${S.date.replace(/-/g, ':')} ${S.time}` : undefined,
    offset: S.offset || undefined,
    lat: S.lat ?? undefined, lon: S.lon ?? undefined,
    alt: S.alt ?? undefined,
    accuracy: num('acc'),
    place: S.place || undefined,
    placeLabel: placeLabel() || undefined,
    writePlace: $('#writePlace').checked,
    stripAll: $('#stripAll').checked,
    jitter: $('#jitterOn').checked ? num('jitter') : 0,
    artist: $('#artist').value.trim() || undefined,
    copyright: $('#copyright').value.trim() || undefined,
    description: $('#description').value.trim() || undefined,
  };
}

// Until a point is picked, fall back to the computer's own UTC offset.
function ensureOffset() {
  if (S.offset) return;
  const m = -new Date(`${S.date}T${S.time}`).getTimezoneOffset();
  S.offset = `${m >= 0 ? '+' : '-'}${pad(Math.floor(Math.abs(m) / 60))}:${pad(Math.abs(m) % 60)}`;
}

// Capture time and output name for every selected file, in list order.
function plan() {
  const base = payload();
  const rename = $('#rename').checked && S.device;
  const stagger = $('#stagger').checked;
  const out = new Map();
  let secs = 0;
  S.files.filter((f) => S.sel.has(f.id)).forEach((f, i) => {
    const seed = seedAt(i);
    if (i > 0 && stagger) secs += seed.gap;
    const date = base.date ? addSeconds(base.date, secs) : undefined;
    const name = rename && date ? deviceFileName(S.device, f.kind, f.ext, date, base.offset, batchSeed.counter + i, seed.ms) : null;
    out.set(f.id, { date, name: name || f.name });
  });
  return out;
}

// ---------- readiness / summaries ----------
function readiness() {
  const p = payload();
  return [
    ['Files selected', S.sel.size ? 1 : 0],
    ['Location', p.lat != null ? (p.alt != null ? 1 : 0.7) : 0],
    ['Device', p.make ? (p.software ? 1 : 0.7) : 0],
    ['Date & time zone', S.zone ? 1 : 0.5],
    ['Lens & exposure', [p.fNumber, p.exposureTime, p.iso].filter(Boolean).length / 3],
    ['Place address', S.place ? 1 : 0],
  ];
}
function renderDist() {
  $('#dist').innerHTML = readiness().map(([n, v]) => `<div class="d-row"><div class="d-top"><span>${n}</span><span>${Math.round(v * 100)}%</span></div><div class="d-bar"><i class="${v < 1 ? 'warn' : ''}" style="width:${Math.max(v * 100, 2)}%"></i></div></div>`).join('');
}
function renderGauge() {
  const parts = readiness();
  const v = parts.reduce((s, [, x]) => s + x, 0) / parts.length;
  $('#gVal').textContent = Math.round(v * 100) + '%';
  $('#gArc').style.strokeDashoffset = 276.5 * (1 - v);
}

const ICON_SUN = '<svg viewBox="0 0 24 20" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="12" cy="10" r="4"/><path d="M12 1v2M12 17v2M3 10h2M19 10h2M5.6 3.6l1.4 1.4M17 15l1.4 1.4M5.6 16.4 7 15M17 5l1.4-1.4"/></svg>';
const ICON_MOON = '<svg viewBox="0 0 24 20" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M16 14.5A7 7 0 0 1 9.5 3a7 7 0 1 0 6.5 11.5z"/><path d="M18 3v3M16.5 4.5h3"/></svg>';
const ICON_DUSK = '<svg viewBox="0 0 24 20" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M3 16h18M6 16a6 6 0 0 1 12 0M12 4v3M4.5 8.5l1.8 1.3M19.5 8.5l-1.8 1.3"/></svg>';

function renderHead() {
  const d = parseDay(S.date);
  const [y, m, dd] = S.date.split('-');
  $('#mlDate').innerHTML = `<b>${m}/${dd}/${y}</b><span class="sep">|</span>${WEEK[d.getUTCDay()]}<span class="sep">|</span><span class="mono">${S.time}</span>`;
  const h = +S.time.slice(0, 2);
  $('#mlIcon').innerHTML = h >= 8 && h < 18 ? ICON_SUN : (h >= 6 && h < 8) || (h >= 18 && h < 21) ? ICON_DUSK : ICON_MOON;
  const where = S.place ? [S.place.district, S.place.city].filter(Boolean).join(', ') : S.lat != null ? 'point selected' : 'click the map to pick a location';
  $('#mlSub').textContent = `${where}${S.zone ? ' · ' + S.zone : ''}`;
  $('#tz').textContent = `UTC${S.offset || ''}`;
  $('#coords').textContent = S.lat != null
    ? `${Math.abs(S.lat).toFixed(4)}° ${S.lat >= 0 ? 'N' : 'S'}   ${Math.abs(S.lon).toFixed(4)}° ${S.lon >= 0 ? 'E' : 'W'}${S.alt != null ? '   ↑' + S.alt.toFixed(1) + ' m' : ''}`
    : '';
  const tag = $('#pinTag');
  if (tag) tag.textContent = S.place?.district || S.place?.city || `${S.lat?.toFixed(4)}, ${S.lon?.toFixed(4)}`;
}

function renderDiff() {
  const f = S.files.find((x) => x.id === S.focus) || S.files.find((x) => S.sel.has(x.id));
  const s = f?.summary || {};
  const p = payload();
  const fmtD = (v) => (v ? String(v).replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3') : '');
  const planned = f ? plan().get(f.id) : null;
  const rows = [
    ['File name', f?.name || '', planned?.name],
    ['Device', [s.make, s.model].filter(Boolean).join(' '), p.make ? `${p.make} ${p.model}` : null],
    ['Software', s.software, p.software],
    ['Lens', s.lens, f?.kind === 'video' ? null : p.lensModel],
    ['Date', fmtD(s.date), (planned?.date || p.date) ? `${fmtD(planned?.date || p.date)}${p.offset}` : null],
    ['GPS', s.lat != null ? `${(+s.lat).toFixed(5)}, ${(+s.lon).toFixed(5)}` : '', p.lat != null ? `${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}` : null],
    ['Altitude', s.alt != null ? `${(+s.alt).toFixed(1)} m` : '', p.alt != null ? `${p.alt.toFixed(1)} m` : null],
    ['Exposure', '', f?.kind === 'video' ? null : [p.fNumber && `f/${p.fNumber}`, p.exposureTime, p.iso && `ISO ${p.iso}`].filter(Boolean).join(' · ') || null],
  ];
  $('#diff').innerHTML = rows.map(([k, o, n]) => {
    if (n == null || n === '' || n === String(o)) return `<tr><td>${k}</td><td><span class="same">${esc(o || '—')}</span></td></tr>`;
    return `<tr><td>${k}</td><td>${o ? `<span class="old">${esc(o)}</span>` : ''}<span class="new">${esc(n)}</span></td></tr>`;
  }).join('');
}

function renderAll() {
  ensureOffset();
  renderHead(); renderGauge(); renderDiff();
  if (!S.focus) renderPreview();
  if ($('[data-pane="export"]').classList.contains('on')) renderDist();
}

// ---------- write & download ----------
const downloaded = new Set();
function download(file) {
  downloaded.add(file.name);
  showWhereFromHint([...downloaded]);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

$('#apply').onclick = async () => {
  const targets = S.files.filter((f) => S.sel.has(f.id) && !f.error);
  if (!targets.length) return;
  const base = payload();
  if (!base.make && base.lat == null && !base.date) return toast('Nothing to write', true);
  const btn = $('#apply');
  btn.disabled = true;
  const log = [];
  let ok = 0;
  const planned = plan();
  for (const [i, f] of targets.entries()) {
    btn.firstElementChild.textContent = `Writing ${i + 1}/${targets.length}…`;
    try {
      const pl = planned.get(f.id);
      const p = { ...base, date: pl?.date ?? base.date, direction: +rand(0, 359.99).toFixed(4) };
      if (p.jitter && Number.isFinite(p.lat)) [p.lat, p.lon] = jitterPoint(p.lat, p.lon, p.jitter);
      const tags = buildTags(f.kind, p, p.stripAll ? {} : f.meta);
      const written = await writeFile(f.file, tags, { stripAll: p.stripAll });
      const out = new File([written], pl?.name || f.name, { type: written.type, lastModified: written.lastModified });
      if (f.outUrl) URL.revokeObjectURL(f.outUrl);
      f.out = out;
      f.outUrl = URL.createObjectURL(out);
      f.summary = summarize(await readMeta(out));
      ok++;
      const label = out.name === f.name ? esc(f.name) : `${esc(f.name)} → ${esc(out.name)}`;
      log.push(`<li><span>✓ ${label} · ${Object.keys(tags).length} tags</span><button class="link" data-dl="${f.id}">download</button></li>`);
    } catch (e) {
      log.push(`<li class="err"><span>${esc(f.name)}</span><span>${esc(e.message || e)}</span></li>`);
    }
  }
  $('#log').innerHTML = log.join('');
  $('#dlAll').hidden = S.files.filter((f) => f.out).length < 2;
  toast(`Done: ${ok} of ${targets.length}`, ok < targets.length);
  btn.disabled = !S.sel.size;
  btn.firstElementChild.textContent = 'Write metadata';
  if (ok === 1 && targets.length === 1) download(targets[0].out);
  updateOrig(); renderFiles(); renderPreview(); renderAll();
};

['rename', 'stagger'].forEach((id) => $('#' + id).addEventListener('change', renderAll));
$('#reroll').onclick = () => { batchSeed = { counter: randomCounter(), steps: [] }; renderAll(); };

// Shell-quote for the copyable xattr command
const shq = (s) => `'${s.replace(/'/g, `'\\''`)}'`;
function showWhereFromHint(names) {
  if (!/Mac/i.test(navigator.platform || navigator.userAgent) || !names.length) return;
  $('#xattrCmd').textContent = `cd ~/Downloads && xattr -d com.apple.metadata:kMDItemWhereFroms ${names.map(shq).join(' ')}`;
  $('#whereFrom').hidden = false;
}
$('#copyCmd').onclick = async () => {
  try { await navigator.clipboard.writeText($('#xattrCmd').textContent); toast('Command copied'); }
  catch { toast('Copy failed — select the text manually', true); }
};

$('#log').addEventListener('click', (e) => {
  const b = e.target.closest('[data-dl]'); if (!b) return;
  const f = S.files.find((x) => x.id === b.dataset.dl);
  if (f?.out) download(f.out);
});

$('#dlAll').onclick = async () => {
  const done = S.files.filter((f) => f.out);
  if (!done.length) return;
  const { zipSync } = await import('fflate');
  const entries = {};
  for (const f of done) {
    let name = f.out.name, n = 1;
    while (entries[name]) name = f.out.name.replace(/(\.[^.]+)$/, ` (${n++})$1`);
    // level 0: media is already compressed, so just store it
    entries[name] = [new Uint8Array(await f.out.arrayBuffer()), { level: 0 }];
  }
  download(new File([zipSync(entries)], 'metaray-export.zip', { type: 'application/zip' }));
};

// ---------- start ----------
renderCities(); renderBrands(); renderDevices(); renderDevice(); renderTimeline(); renderFiles(); renderPreview(); renderAll();
