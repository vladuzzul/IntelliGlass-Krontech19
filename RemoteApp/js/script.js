/* Sanitizează un string */
function sanitize(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
    .trim();
}

/* Setează textContent (sigur */
function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = typeof val === 'string' ? val : String(val);
}

/* Validează că un string este IP valid */
function isValidIP(ip) {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(ip) &&
    ip.split('.').every(n => parseInt(n) >= 0 && parseInt(n) <= 255);
}

/* Validează că un port este valid */
function isValidPort(p) {
  const n = parseInt(p);
  return !isNaN(n) && n >= 1 && n <= 65535;
}

/* Validează că un host este valid */
function isValidHost(host) {
  if (isValidIP(host)) return true;
  if (host === 'localhost') return true;
  return /^[a-zA-Z0-9.-]+$/.test(host) && host.length > 0 && host.length <= 253 && !host.endsWith('.');
}

function getDefaultPortFromProtocol() {
  return window.location.protocol === 'https:' ? '443' : '80';
}

/* Returnează valoarea unui input text, sanitizată */
function getInput(id) {
  const el = document.getElementById(id);
  return el ? sanitize(el.value) : '';
}

/* Returnează valoarea unui input text, raw */
function getInputRaw(id) {
  const el = document.getElementById(id);
  return el ? String(el.value).trim() : '';
}

const ROMANIA_CITY_PRESETS = [
  { key: 'bucharest', label: 'Bucuresti', lat: 44.4268, lon: 26.1025 },
  { key: 'cluj-napoca', label: 'Cluj-Napoca', lat: 46.7712, lon: 23.6236 },
  { key: 'iasi', label: 'Iasi', lat: 47.1585, lon: 27.6014 },
  { key: 'timisoara', label: 'Timisoara', lat: 45.7489, lon: 21.2087 },
  { key: 'constanta', label: 'Constanta', lat: 44.1598, lon: 28.6348 },
  { key: 'brasov', label: 'Brasov', lat: 45.6579, lon: 25.6012 },
  { key: 'sibiu', label: 'Sibiu', lat: 45.7983, lon: 24.1256 },
  { key: 'oradea', label: 'Oradea', lat: 47.0465, lon: 21.9189 },
  { key: 'craiova', label: 'Craiova', lat: 44.3302, lon: 23.7949 },
  { key: 'galati', label: 'Galati', lat: 45.4353, lon: 28.008 },
  { key: 'baia-mare', label: 'Baia Mare', lat: 47.6596, lon: 23.5833 },
  { key: 'arad', label: 'Arad', lat: 46.1866, lon: 21.3123 },
  { key: 'ploiesti', label: 'Ploiesti', lat: 44.9462, lon: 26.0365 }
];

function populateCityPresetSelect() {
  const select = document.getElementById('weather-city-select');
  if (!select || select.options.length > 0) return;
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Selecteaza oras';
  select.appendChild(placeholder);

  ROMANIA_CITY_PRESETS.forEach((preset) => {
    const opt = document.createElement('option');
    opt.value = preset.key;
    opt.textContent = preset.label;
    select.appendChild(opt);
  });
}

function applyCityPreset(cityKey) {
  if (!cityKey) return;
  const preset = ROMANIA_CITY_PRESETS.find((item) => item.key === cityKey);
  if (!preset) return;

  const latInput = document.getElementById('weather-latitude');
  const lonInput = document.getElementById('weather-longitude');
  if (latInput) latInput.value = preset.lat;
  if (lonInput) lonInput.value = preset.lon;

  const cityLabel = document.getElementById('weather-city-label');
  if (cityLabel) cityLabel.textContent = preset.label;
}

function getPresetKeyForCoords(lat, lon) {
  const latFixed = Number(lat).toFixed(4);
  const lonFixed = Number(lon).toFixed(4);
  const preset = ROMANIA_CITY_PRESETS.find((item) => item.lat.toFixed(4) === latFixed && item.lon.toFixed(4) === lonFixed);
  return preset ? preset.key : '';
}

/* MOBILE SIDEBAR TOGGLE */
function toggleSidebar() {
  const sidebar = document.getElementById('main-sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  const btn = document.getElementById('hamburger-btn');
  const isOpen = sidebar.classList.contains('open');
  if (isOpen) {
    sidebar.classList.remove('open');
    overlay.classList.remove('show');
    btn.classList.remove('open');
  } else {
    sidebar.classList.add('open');
    overlay.classList.add('show');
    btn.classList.add('open');
  }
}

function closeSidebar() {
  document.getElementById('main-sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('show');
  document.getElementById('hamburger-btn').classList.remove('open');
}

/* STATE */
const state = {
  apiBase: '',
  connected: false,
  statusTimer: null,
  config: {
    city: 'Brașov',
    greeting: 'Great to see you!',
    brightness: 75,
    ticker: '',
    widget_positions: {},
  }
};

const CONNECTION_STORAGE_KEY = 'intelliglass-remote-connection';
const LOCAL_UI_STORAGE_KEY = 'intelliglass-remote-ui';

function loadConnection() {
  try {
    const raw = localStorage.getItem(CONNECTION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const host = typeof parsed.host === 'string' ? parsed.host : '';
    const port = typeof parsed.port === 'string' ? parsed.port : '';
    if (!host || !port) return null;
    return { host, port };
  } catch (e) {
    return null;
  }
}

function saveConnection(host, port) {
  try {
    localStorage.setItem(CONNECTION_STORAGE_KEY, JSON.stringify({ host, port }));
  } catch (e) {}
}

function clearConnection() {
  try {
    localStorage.removeItem(CONNECTION_STORAGE_KEY);
  } catch (e) {}
}

function loadLocalUi() {
  try {
    const raw = localStorage.getItem(LOCAL_UI_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      greeting: typeof parsed.greeting === 'string' ? parsed.greeting : '',
      ticker: typeof parsed.ticker === 'string' ? parsed.ticker : ''
    };
  } catch (e) {
    return null;
  }
}

function saveLocalUi(updates) {
  try {
    const current = loadLocalUi() || {};
    const next = Object.assign({}, current, updates);
    localStorage.setItem(LOCAL_UI_STORAGE_KEY, JSON.stringify(next));
  } catch (e) {}
}

function applyLocalUi() {
  const stored = loadLocalUi();
  if (!stored) return;

  const greetingInput = document.getElementById('greeting-input');
  if (greetingInput && stored.greeting) greetingInput.value = stored.greeting;

  const tickerInput = document.getElementById('custom-ticker');
  if (tickerInput && stored.ticker) tickerInput.value = stored.ticker;
}

/* NAVIGATION */
function showSection(name, pillEl) {
  if (!/^[a-z_]+$/.test(name)) return;
  document.querySelectorAll('.section').forEach(s => s.classList.remove('visible'));
  const el = document.getElementById('sec-' + name);
  if (el) el.classList.add('visible');
  if (pillEl) {
    document.querySelectorAll('.nav-pill').forEach(p => p.classList.remove('active'));
    pillEl.classList.add('active');
  }
  closeSidebar();
}

function setSideActive(btn) {
  document.querySelectorAll('.sidebar-item').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

/* CONNECTION */
let lastConnectAttempt = 0;

function getBasePathFromLocation() {
  const path = window.location.pathname || '/';
  const marker = '/RemoteApp/';
  const idx = path.toLowerCase().indexOf(marker.toLowerCase());
  if (idx === -1) return '/';
  const base = path.slice(0, idx + 1);
  return base === '' ? '/' : base;
}

async function fetchStatus() {
  if (!state.apiBase) return;
  try {
    const res = await fetch(state.apiBase + 'remote/status', { cache: 'no-store' });
    if (!res.ok) throw new Error('status ' + res.status);
    const data = await res.json();
    if (data && typeof data.clients === 'number') {
      setText('net-clients', Math.max(0, Math.round(data.clients)));
    }
  } catch (e) {
    wsLog('[!] Status fetch failed: ' + sanitize(e.message || 'error'), 'err');
    throw e;
  }
}

function connectWS(options = {}) {
  const now = Date.now();
  if (!options.skipThrottle && now - lastConnectAttempt < 2000) {
    showToast('⚠ Asteaptă 2 secunde între încercări!', true);
    return;
  }
  lastConnectAttempt = now;

  const host = options.host || getInputRaw('ws-ip');
  const portInput = options.port || getInputRaw('ws-port');
  const port = portInput || getDefaultPortFromProtocol();

  if (!isValidHost(host)) {
    showToast('⚠ IP/host invalid! Folosește 192.168.x.x sau localhost', true);
    wsLog('[✗] IP/host invalid introdus.', 'err');
    return;
  }
  if (!isValidPort(port)) {
    showToast('⚠ Port invalid! (1–65535)', true);
    wsLog('[✗] Port invalid introdus.', 'err');
    return;
  }

  const protocol = window.location.protocol === 'https:' ? 'https://' : 'http://';
  const basePath = getBasePathFromLocation();
  state.apiBase = protocol + host + ':' + port + basePath;
  wsLog('[→] Connecting to ' + state.apiBase + ' ...', 'info');

  fetchStatus().then(function() {
    state.connected = true;
    setConnStatus(true, host);
    wsLog('[✓] Connected to IntelliGlass Mirror ' + state.apiBase, 'ok');
    setText('net-ip', host);
    setText('net-url', state.apiBase);
    setText('sidebar-ip', host + ':' + port);
    const ipInput = document.getElementById('ws-ip');
    if (ipInput) ipInput.value = host;
    const portInput = document.getElementById('ws-port');
    if (portInput) portInput.value = port;
    saveConnection(host, port);
    fetchConfigSnapshot().then(function(cfg) {
      applyConfigToUI(cfg);
    });
    if (state.statusTimer) clearInterval(state.statusTimer);
    state.statusTimer = setInterval(function() {
      fetchStatus().catch(function() {});
    }, 10000);
  }).catch(function(err) {
    state.connected = false;
    setConnStatus(false);
    wsLog('[✗] Connection failed: ' + sanitize(err.message || 'error'), 'err');
  });
}

function disconnectWS() {
  state.connected = false;
  state.apiBase = '';
  clearConnection();
  if (state.statusTimer) {
    clearInterval(state.statusTimer);
    state.statusTimer = null;
  }
  setConnStatus(false);
  wsLog('[—] Deconectat manual.', 'info');
}

/* Trimitem comenzi ca JSON */
async function sendCommand(obj) {
  if (!state.connected || !state.apiBase) {
    wsLog('[!] Nu ești conectat la oglindă. Apasă Conectează.', 'err');
    return { ok: false, error: 'Not connected' };
  }
  const type = obj && obj.type ? String(obj.type) : '';
  if (type !== 'reload' && type !== 'apply_all') {
    wsLog('[!] Unsupported command: ' + type, 'err');
    return { ok: false, error: 'Unsupported command' };
  }
  const payload = JSON.stringify({ type: type === 'apply_all' ? 'reload' : type });
  wsLog('[→] ' + payload, 'info');
  try {
    const res = await fetch(state.apiBase + 'remote/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload
    });
    const contentType = res.headers.get('content-type') || '';
    let data = null;
    if (contentType.includes('application/json')) {
      data = await res.json();
    } else {
      data = await res.text();
    }
    if (!res.ok) {
      const errorMsg = data && typeof data === 'object' && data.error
        ? String(data.error)
        : `command ${res.status}`;
      wsLog('[!] Command failed: ' + sanitize(errorMsg), 'err');
      if (data && typeof data === 'object' && typeof data.clients === 'number') {
        wsLog('[i] Clients connected: ' + data.clients, 'info');
      }
      return { ok: false, error: errorMsg, clients: data && typeof data === 'object' ? data.clients : null };
    }
    if (data && typeof data === 'object' && typeof data.clients === 'number') {
      wsLog('[i] Clients connected: ' + data.clients, 'info');
    }
    return { ok: true, clients: data && typeof data === 'object' ? data.clients : null };
  } catch (error) {
    wsLog('[!] Error sending command: ' + sanitize(error.message || 'error'), 'err');
    return { ok: false, error: error.message || 'error' };
  }
}

function runCommand(obj, successMsg) {
  if (!state.connected || !state.apiBase) {
    showToast('Connect to the mirror first', true);
    return;
  }
  const type = obj && obj.type ? String(obj.type) : '';
  if (type !== 'reload' && type !== 'apply_all') {
    showToast('Command not supported in LAN mode', true);
    return;
  }
  sendCommand(obj).then((result) => {
    if (result && result.ok) {
      if (successMsg) showToast(successMsg);
      return;
    }
    const errMsg = result && result.error ? result.error : 'Command failed';
    showToast(errMsg, true);
  });
}

async function updateConfig(payload) {
  if (!state.connected || !state.apiBase) {
    wsLog('[!] Nu ești conectat la oglindă. Apasă Conectează.', 'err');
    return { ok: false, error: 'Not connected' };
  }
  try {
    const res = await fetch(state.apiBase + 'remote/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const contentType = res.headers.get('content-type') || '';
    let data = null;
    if (contentType.includes('application/json')) {
      data = await res.json();
    } else {
      data = await res.text();
    }
    if (!res.ok) {
      const errorMsg = data && typeof data === 'object' && data.error
        ? String(data.error)
        : `config ${res.status}`;
      wsLog('[!] Error updating config: ' + sanitize(errorMsg), 'err');
      return { ok: false, error: errorMsg };
    }
    wsLog('[→] remote/config updated', 'info');
    return {
      ok: true,
      reloaded: data && typeof data === 'object' ? Boolean(data.reloaded) : false,
      clients: data && typeof data === 'object' && typeof data.clients === 'number' ? data.clients : null
    };
  } catch (e) {
    wsLog('[!] Error updating config: ' + sanitize(e.message || 'error'), 'err');
    return { ok: false, error: e.message || 'error' };
  }
}

function handleApplyResult(result) {
  if (!result || !result.ok) return false;
  if (result.reloaded) {
    showToast((translations[currentLang] || translations.ro).toast_reload);
    return true;
  }
  if (typeof result.clients === 'number' && result.clients === 0) {
    showToast('No clients connected', true);
    return true;
  }
  return true;
}

async function fetchConfigSnapshot() {
  if (!state.apiBase) return null;
  try {
    const res = await fetch(state.apiBase + 'config', { cache: 'no-store' });
    if (!res.ok) throw new Error('config ' + res.status);
    return await res.json();
  } catch (e) {
    wsLog('[!] Error loading config: ' + sanitize(e.message || 'error'), 'err');
    return null;
  }
}

function applyConfigToUI(config) {
  if (!config || !Array.isArray(config.modules)) return;

  const weatherModule = config.modules.find((mod) => mod.module === 'weather' && mod.config);
  if (weatherModule && weatherModule.config) {
    const latInput = document.getElementById('weather-latitude');
    const lonInput = document.getElementById('weather-longitude');
    if (latInput && Number.isFinite(Number(weatherModule.config.lat))) {
      latInput.value = weatherModule.config.lat;
    }
    if (lonInput && Number.isFinite(Number(weatherModule.config.lon))) {
      lonInput.value = weatherModule.config.lon;
    }
    const cityLabel = document.getElementById('weather-city-label');
    if (cityLabel && Number.isFinite(Number(weatherModule.config.lat)) && Number.isFinite(Number(weatherModule.config.lon))) {
      const lat = Number(weatherModule.config.lat).toFixed(4);
      const lon = Number(weatherModule.config.lon).toFixed(4);
      cityLabel.textContent = `Lat ${lat}, Lon ${lon}`;
    }
    const presetSelect = document.getElementById('weather-city-select');
    if (presetSelect && Number.isFinite(Number(weatherModule.config.lat)) && Number.isFinite(Number(weatherModule.config.lon))) {
      const presetKey = getPresetKeyForCoords(Number(weatherModule.config.lat), Number(weatherModule.config.lon));
      presetSelect.value = presetKey;
    }
  }

  const calendarModule = config.modules.find((mod) => mod.module === 'calendar' && mod.config && Array.isArray(mod.config.calendars));
  if (calendarModule && calendarModule.config.calendars.length > 0) {
    const calInput = document.getElementById('cal-url');
    const calUrl = calendarModule.config.calendars[0].url;
    if (calInput && typeof calUrl === 'string') calInput.value = calUrl;
  }

  const newsModule = config.modules.find((mod) => mod.module === 'newsfeed' && mod.config && Array.isArray(mod.config.feeds));
  if (newsModule) {
    const feeds = newsModule.config.feeds.map((feed) => feed && feed.url).filter(Boolean);
    const rssMain = document.getElementById('rss-main');
    const rssSecondary = document.getElementById('rss-secondary');
    if (rssMain && feeds[0]) rssMain.value = feeds[0];
    if (rssSecondary) rssSecondary.value = feeds[1] || '';
  }

  const langEl = document.getElementById('set-lang');
  if (langEl && typeof config.language === 'string') {
    langEl.value = config.language;
  }
  const tfEl = document.getElementById('set-timeformat');
  if (tfEl && (config.timeFormat === 12 || config.timeFormat === 24)) {
    tfEl.value = String(config.timeFormat);
  }
}

function handleMessage(data) {
  wsLog('[←] tip: ' + sanitize(String(data.type || '?')), 'ok');

  if (data.type === 'status') {
    if (typeof data.brightness === 'number' && data.brightness >= 0 && data.brightness <= 100) {
      const bv = Math.round(data.brightness);
      const sl = document.getElementById('bright-slider');
      if (sl) sl.value = bv;
      setText('bright-label', bv + '%');
      setText('bright-stat', bv + '%');
    }
    if (typeof data.clients === 'number') {
      setText('net-clients', Math.max(0, Math.round(data.clients)));
    }
  }
  if (data.type === 'weather') {
    if (typeof data.temp === 'number') {
      const t = Math.round(data.temp);
      setText('mirror-temp-display', t + '°C');
      setText('stat-temp', t + '°');
    }
    if (typeof data.desc === 'string') {
      setText('mirror-weather-sub', sanitize(data.desc).substring(0, 80));
    }
  }
}

function wsLog(msg, cls) {
  const log = document.getElementById('ws-log');
  if (!log) return;
  if (log.children.length > 400) {
    log.removeChild(log.firstChild);
    log.removeChild(log.firstChild);
  }
  const line = document.createElement('span');
  if (cls) line.className = 'log-' + cls;
  line.textContent = msg; // textContent, niciodată innerHTML
  log.appendChild(line);
  log.appendChild(document.createElement('br'));
  log.scrollTop = log.scrollHeight;
}

function setConnStatus(on, ip) {
  const dot = document.getElementById('conn-dot');
  const lbl = document.getElementById('conn-label');
  const stat = document.getElementById('stat-status');
  if (on) {
    if (dot) dot.style.background = 'var(--success)';
    if (lbl) {
      lbl.textContent = 'Connected · RPi4';
      lbl.style.color = 'var(--success)';
    }
    if (stat) {
      stat.textContent = 'Online';
      stat.style.color = 'var(--success)';
    }
  } else {
    if (dot) dot.style.background = '#f87171';
    if (lbl) {
      lbl.textContent = 'Disconnected';
      lbl.style.color = '#f87171';
    }
    if (stat) {
      stat.textContent = 'Offline';
      stat.style.color = '#f87171';
    }
  }
}

/* CLOCK */
function updateClock() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  setText('mirror-clock', h + ':' + m);

  const days = ['Duminică','Luni','Marți','Miercuri','Joi','Vineri','Sâmbătă'];
  const months = ['ianuarie','februarie','martie','aprilie','mai','iunie','iulie','august','septembrie','octombrie','noiembrie','decembrie'];
  setText('mirror-date-label', days[now.getDay()] + ', ' + now.getDate() + ' ' + months[now.getMonth()] + ' ' + now.getFullYear());
}
setInterval(updateClock, 1000);
updateClock();

function setBrightness(val) {
  const n = Math.max(0, Math.min(100, parseInt(val) || 0));
  setText('bright-label', n + '%');
  setText('bright-stat', n + '%');
}

function toggleSwitch(el, key) {
  if (!/^[a-z_]+$/.test(key)) return;
  el.classList.toggle('on');
  showToast('Toggle not supported in LAN mode', true);
}

function applyGreeting() {
  const raw = document.getElementById('greeting-input').value;
  const val = sanitize(raw).substring(0, 120) || 'Bun venit!';
  setText('mirror-greeting-text', val);
  state.config.greeting = val;
  showToast('Greeting update not supported in LAN mode', true);
}

function setGreeting(txt) {
  const el = document.getElementById('greeting-input');
  if (el) el.value = sanitize(txt);
}

function applyTicker() {
  const raw = document.getElementById('custom-ticker').value;
  const val = sanitize(raw).substring(0, 500);
  if (val) {
    setText('mirror-ticker', val + '   ');
    showToast('Ticker update not supported in LAN mode', true);
  }
}

async function applyNews() {
  const rssMain = document.getElementById('rss-main')?.value.trim() || '';
  const rssSecondary = document.getElementById('rss-secondary')?.value.trim() || '';
  const feeds = [rssMain, rssSecondary].filter((url) => url && /^https?:\/\//.test(url));
  if (feeds.length === 0) {
    showToast('RSS URL is required', true);
    return;
  }
  const result = await updateConfig({ newsfeed: { feeds } });
  handleApplyResult(result);
}

async function applyWeather() {
  const lat = parseFloat(document.getElementById('weather-latitude').value.trim());
  const lon = parseFloat(document.getElementById('weather-longitude').value.trim());

  if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    showToast('Please enter valid coordinates.', 'err');
    return;
  }

  const result = await updateConfig({ weather: { lat, lon } });
  handleApplyResult(result);
}

async function applyCalendar() {
  const raw = document.getElementById('cal-url').value.trim();
  if (raw && !raw.startsWith('http://') && !raw.startsWith('https://') && raw !== '') {
    showToast('⚠ Invalid calendar URL!', true);
    return;
  }
  const result = await updateConfig({ calendar: { url: sanitize(raw).substring(0, 300) } });
  handleApplyResult(result);
}

async function applyLocale() {
  const langEl = document.getElementById('set-lang');
  const tfEl = document.getElementById('set-timeformat');
  const allowedLangs = ['ro','en','de','hu'];
  const lang = (langEl && allowedLangs.includes(langEl.value)) ? langEl.value : 'ro';
  const tf = (tfEl && tfEl.value === '12') ? '12' : '24';
  const result = await updateConfig({ locale: { language: lang, timeFormat: parseInt(tf) } });
  handleApplyResult(result);
}

function saveAPIKeys() {
  const owm = document.getElementById('owm-key').value.trim();
  const gcal = document.getElementById('gcal-key').value.trim();
  const news = document.getElementById('news-key').value.trim();
  if (owm && owm.length < 10) { showToast('⚠ Cheia OWM pare prea scurtă!', true); return; }
  showToast('API key updates not supported in LAN mode', true);
}

function applyPosition() {
  const widgetEl = document.getElementById('widget-selector');
  const widget = widgetEl ? sanitize(widgetEl.value).substring(0, 30) : '';
  const selected = document.querySelector('.pos-cell.selected');
  const pos = selected ? sanitize(selected.dataset.poskey || '') : 'center';
  showToast('Widget positioning not supported in LAN mode', true);
}

function applyStyle() {
  const widget = sanitize(document.getElementById('widget-selector')?.value || '').substring(0, 30);
  const sizeEl = document.getElementById('font-size');
  const opEl = document.getElementById('opacity-val');
  const colorEl = document.getElementById('widget-color');
  const size = Math.max(12, Math.min(120, parseInt(sizeEl?.value) || 48));
  const opacity = Math.max(10, Math.min(100, parseInt(opEl?.value) || 85));
  const rawColor = colorEl ? colorEl.value : 'F7ECE1';
  const color = /^[0-9A-Fa-f]{6}$/.test(rawColor) ? rawColor : 'F7ECE1';
  showToast('Style updates not supported in LAN mode', true);
}

function selectPos(cell, key, label) {
  document.querySelectorAll('.pos-cell').forEach(c => c.classList.remove('selected'));
  cell.classList.add('selected');
  cell.dataset.poskey = key;
  setText('pos-label', label + ' selectat');
}

function updatePosLabel() {}

function confirmReset() {
  if (confirm((translations[currentLang] || translations.ro).confirm_reset)) {
    showToast('Factory reset not supported in LAN mode', true);
  }
}



/* TOAST */
let toastTimer;
function showToast(msg, isErr) {
  const t = document.getElementById('toast');
  const icon = document.getElementById('toast-icon');
  const msgEl = document.getElementById('toast-msg');
  if (!t || !icon || !msgEl) return;
  msgEl.textContent = typeof msg === 'string' ? msg.substring(0, 120) : '';
  t.style.borderColor = isErr ? 'rgba(248,113,113,0.4)' : 'rgba(74,222,128,0.3)';
  icon.textContent = isErr ? '' : '';
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function() { t.classList.remove('show'); }, 3000);
}



function autoConnectIfPossible() {
  const stored = loadConnection();
  let host = stored ? stored.host : '';
  let port = stored ? stored.port : '';

  if (!host) {
    const locHost = window.location.hostname;
    if (locHost) {
      host = locHost;
      port = window.location.port || getDefaultPortFromProtocol();
    }
  }

  if (!host || !port) return;

  const ipInput = document.getElementById('ws-ip');
  if (ipInput) ipInput.value = host;
  const portInput = document.getElementById('ws-port');
  if (portInput) portInput.value = port;

  connectWS({ host, port, skipThrottle: true });
}

autoConnectIfPossible();
applyLocalUi();
populateCityPresetSelect();
renderFeedsList();