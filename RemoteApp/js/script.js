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

/* Returnează valoarea unui input text, raw */
function getInputRaw(id) {
  const el = document.getElementById(id);
  return el ? String(el.value).trim() : '';
}

const ROMANIA_CITY_PRESETS = [
  { key: 'alba', label: 'Alba', lat: 46.0734, lon: 23.5780 },
  { key: 'arad', label: 'Arad', lat: 46.1866, lon: 21.3123 },
  { key: 'arges', label: 'Arges', lat: 44.8565, lon: 24.8692 },
  { key: 'bacau', label: 'Bacau', lat: 46.5670, lon: 26.9144 },
  { key: 'bihor', label: 'Bihor', lat: 47.0465, lon: 21.9190 },
  { key: 'bistrita-nasaud', label: 'Bistrita Nasaud', lat: 47.1332, lon: 24.4833 },
  { key: 'botosani', label: 'Botosani', lat: 47.7485, lon: 26.6698 },
  { key: 'brasov', label: 'Brasov', lat: 45.6579, lon: 25.6012 },
  { key: 'braila', label: 'Braila', lat: 45.2603, lon: 27.9485 },
  { key: 'bucharest', label: 'Bucuresti', lat: 44.4268, lon: 26.1025 },
  { key: 'buzau', label: 'Buzau', lat: 45.1511, lon: 26.8183 },
  { key: 'caras-severin', label: 'Caras Severin', lat: 45.2938, lon: 21.8845 },
  { key: 'calarasi', label: 'Calarasi', lat: 44.1956, lon: 27.3328 },
  { key: 'cluj', label: 'Cluj', lat: 46.7712, lon: 23.5856 },
  { key: 'constanta', label: 'Constanta', lat: 44.1737, lon: 28.6518 },
  { key: 'covasna', label: 'Covasna', lat: 45.8587, lon: 25.7854 },
  { key: 'dambovita', label: 'Dambovita', lat: 44.9333, lon: 25.4500 },
  { key: 'dolj', label: 'Dolj', lat: 44.3303, lon: 23.8052 },
  { key: 'galati', label: 'Galati', lat: 45.4353, lon: 28.0514 },
  { key: 'giurgiu', label: 'Giurgiu', lat: 43.8967, lon: 25.9654 },
  { key: 'gorj', label: 'Gorj', lat: 45.0373, lon: 23.2721 },
  { key: 'harghita', label: 'Harghita', lat: 46.3606, lon: 25.8039 },
  { key: 'hunedoara', label: 'Hunedoara', lat: 45.8735, lon: 22.9015 },
  { key: 'ialomita', label: 'Ialomita', lat: 44.5638, lon: 27.3627 },
  { key: 'iasi', label: 'Iasi', lat: 47.1585, lon: 27.5809 },
  { key: 'ilfov', label: 'Ilfov', lat: 44.5621, lon: 25.9555 },
  { key: 'maramures', label: 'Maramures', lat: 47.6591, lon: 23.5700 },
  { key: 'mehedinti', label: 'Mehedinti', lat: 44.6269, lon: 22.6599 },
  { key: 'mures', label: 'Mures', lat: 46.5362, lon: 24.5587 },
  { key: 'neamt', label: 'Neamt', lat: 46.9275, lon: 26.3712 },
  { key: 'olt', label: 'Olt', lat: 44.4333, lon: 24.3667 },
  { key: 'prahova', label: 'Prahova', lat: 44.9453, lon: 26.0153 },
  { key: 'satu-mare', label: 'Satu Mare', lat: 47.7983, lon: 22.8838 },
  { key: 'salaj', label: 'Salaj', lat: 47.1764, lon: 23.0569 },
  { key: 'sibiu', label: 'Sibiu', lat: 45.7983, lon: 24.1256 },
  { key: 'suceava', label: 'Suceava', lat: 47.6514, lon: 26.2558 },
  { key: 'teleorman', label: 'Teleorman', lat: 43.9667, lon: 25.3333 },
  { key: 'timis', label: 'Timis', lat: 45.7537, lon: 21.2257 },
  { key: 'tulcea', label: 'Tulcea', lat: 45.1833, lon: 28.8000 },
  { key: 'vaslui', label: 'Vaslui', lat: 46.6333, lon: 27.7333 },
  { key: 'valcea', label: 'Valcea', lat: 45.1036, lon: 24.3662 },
  { key: 'vrancea', label: 'Vrancea', lat: 45.6967, lon: 27.1853 }
];

function populateCityPresetSelect() {
  const select = document.getElementById('weather-city-select');
  if (!select || select.options.length > 0) return;
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Select City';
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
let sourceHealthRequestId = 0;

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

function applyLocalUi() {
  const stored = loadLocalUi();
  if (!stored) return;

  const greetingInput = document.getElementById('greeting-input');
  if (greetingInput && stored.greeting) greetingInput.value = stored.greeting;

  const tickerInput = document.getElementById('custom-ticker');
  if (tickerInput && stored.ticker) tickerInput.value = stored.ticker;
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
      const clientCount = Math.max(0, Math.round(data.clients));
      setText('net-clients', clientCount);
      setMirrorStatus(clientCount > 0);
    }
  } catch (e) {
    wsLog('[!] Status fetch failed: ' + sanitize(e.message || 'error'), 'err');
    throw e;
  }
}

function connectWS(options = {}) {
  const now = Date.now();
  if (!options.skipThrottle && now - lastConnectAttempt < 2000) {
    showToast('⚠ Wait 2 seconds between attempts', true);
    return;
  }
  lastConnectAttempt = now;

  const host = options.host || getInputRaw('ws-ip');
  const portInput = options.port || getInputRaw('ws-port');
  const port = portInput || getDefaultPortFromProtocol();

  if (!isValidHost(host)) {
    showToast('⚠ IP/host invalid! Use 192.168.x.x or localhost', true);
    wsLog('[✗] IP/host invalid introduced.', 'err');
    return;
  }
  if (!isValidPort(port)) {
    showToast('⚠ Port invalid! (1–65535)', true);
    wsLog('[✗] Port invalid introduced.', 'err');
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
  sourceHealthRequestId += 1;
  clearConnection();
  if (state.statusTimer) {
    clearInterval(state.statusTimer);
    state.statusTimer = null;
  }
  setConnStatus(false);
  wsLog('[—] Disconnected manually.', 'info');
}

/* Trimitem comenzi ca JSON */
async function sendCommand(obj) {
  if (!state.connected || !state.apiBase) {
    wsLog('[!] You are not connected to the mirror. Press Connect.', 'err');
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
    wsLog('[!] You are not connected to the mirror. Press Connect.', 'err');
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
  if (!result || !result.ok) {
    const errMsg = result && result.error ? String(result.error) : 'Update failed';
    showToast(errMsg, true);
    return false;
  }
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

function getPrimaryCalendarUrl(config) {
  const urls = getCalendarUrls(config);
  return urls.length > 0 ? urls[0] : '';
}

function parseHostnameFromUrl(url) {
  if (typeof url !== 'string' || !url.trim()) return '';
  try {
    return new URL(url).hostname.replace(/^www\./i, '').trim();
  } catch (e) {
    return '';
  }
}

function normalizeFeed(feed) {
  if (typeof feed === 'string' && feed.trim()) {
    return { title: '', url: feed.trim() };
  }
  if (!feed || typeof feed !== 'object' || typeof feed.url !== 'string') return null;
  const url = feed.url.trim();
  if (!url) return null;
  const title = typeof feed.title === 'string'
    ? feed.title.trim()
    : (typeof feed.name === 'string' ? feed.name.trim() : '');
  return { title, url };
}

function getNewsFeeds(config) {
  if (!config || !Array.isArray(config.modules)) return [];
  const newsModule = config.modules.find((mod) => mod && mod.module === 'newsfeed' && mod.config && Array.isArray(mod.config.feeds));
  if (!newsModule) return [];
  return newsModule.config.feeds
    .map(normalizeFeed)
    .filter((feed) => feed && /^https?:\/\//.test(feed.url));
}

function getCalendarUrls(config) {
  if (!config || !Array.isArray(config.modules)) return [];

  const urls = [];
  for (const mod of config.modules) {
    if (!mod || mod.module !== 'calendar' || !mod.config || !Array.isArray(mod.config.calendars)) continue;
    for (const cal of mod.config.calendars) {
      if (!cal || typeof cal.url !== 'string') continue;
      const url = cal.url.trim();
      if (url) urls.push(url);
    }
  }
  return urls;
}

function getFeedLabel(feed, index) {
  if (feed && typeof feed.title === 'string' && feed.title.trim()) {
    return feed.title.trim();
  }
  const host = feed && typeof feed.url === 'string' ? parseHostnameFromUrl(feed.url) : '';
  if (host) return host;
  return `Feed ${index + 1}`;
}

function buildSourceHealthMap(results) {
  const healthByUrl = Object.create(null);
  if (!Array.isArray(results)) return healthByUrl;

  results.forEach((entry) => {
    if (!entry || typeof entry.url !== 'string') return;
    const key = entry.url.trim();
    if (!key) return;
    healthByUrl[key] = {
      available: Boolean(entry.available),
      status: Number.isInteger(entry.status) ? entry.status : null,
      error: typeof entry.error === 'string' ? entry.error : ''
    };
  });

  return healthByUrl;
}

function buildNewsAvailability(config, healthByUrl = null) {
  if (!config || !Array.isArray(config.modules)) return 'Waiting for mirror config';

  const feeds = getNewsFeeds(config);
  if (feeds.length === 0) return 'No feeds configured';

  if (healthByUrl && typeof healthByUrl === 'object') {
    const unavailableFeeds = feeds
      .map((feed, idx) => ({ feed, idx }))
      .filter((entry) => {
        const status = healthByUrl[entry.feed.url];
        return status && status.available === false;
      });

    if (unavailableFeeds.length > 0) {
      if (unavailableFeeds.length === 1) {
        const only = unavailableFeeds[0];
        return `Error: ${getFeedLabel(only.feed, only.idx)} unavailable`;
      }
      return `Error: ${unavailableFeeds.length}/${feeds.length} feeds unavailable`;
    }
  }

  const feedLabels = feeds.map((feed, idx) => {
    return getFeedLabel(feed, idx);
  });

  if (feedLabels.length === 1) return `1 feed: ${feedLabels[0]}`;
  if (feedLabels.length === 2) return `2 feeds: ${feedLabels[0]}, ${feedLabels[1]}`;
  return `${feedLabels.length} feeds: ${feedLabels[0]}, ${feedLabels[1]} +${feedLabels.length - 2} more`;
}

function getCalendarSourceLabel(url) {
  const host = parseHostnameFromUrl(url);
  if (!host) return 'Custom calendar URL';

  if (host.endsWith('google.com')) return 'Google Calendar';
  if (host.endsWith('icloud.com')) return 'Apple iCloud Calendar';
  if (host.endsWith('outlook.com') || host.endsWith('office365.com') || host.endsWith('live.com')) {
    return 'Microsoft Calendar';
  }
  return host;
}

function buildCalendarAvailability(config, healthByUrl = null) {
  if (!config || !Array.isArray(config.modules)) return 'Waiting for mirror config';

  const uniqueUrls = Array.from(new Set(getCalendarUrls(config)));
  if (uniqueUrls.length === 0) return 'No calendar configured';

  if (healthByUrl && typeof healthByUrl === 'object') {
    const unavailableUrls = uniqueUrls.filter((url) => {
      const status = healthByUrl[url];
      return status && status.available === false;
    });
    if (unavailableUrls.length > 0) {
      if (unavailableUrls.length === 1) {
        return `Error: ${getCalendarSourceLabel(unavailableUrls[0])} unavailable`;
      }
      return `Error: ${unavailableUrls.length}/${uniqueUrls.length} sources unavailable`;
    }
  }

  const labels = Array.from(new Set(uniqueUrls.map(getCalendarSourceLabel)));
  if (uniqueUrls.length === 1) return `1 source: ${labels[0]}`;
  if (labels.length === 1) return `${uniqueUrls.length} sources: ${labels[0]}`;
  return `${uniqueUrls.length} sources: ${labels[0]} +${labels.length - 1} more`;
}

function updateOverviewStatsFromConfig(config) {
  if (!config || !Array.isArray(config.modules)) {
    setText('stat-weather', 'Not set');
    setText('stat-news', buildNewsAvailability(config));
    setText('stat-calendar', buildCalendarAvailability(config));
    return;
  }

  let weatherText = 'Not set';
  const weatherModule = config.modules.find((mod) => mod.module === 'weather' && mod.config);
  if (weatherModule && weatherModule.config) {
    const lat = Number(weatherModule.config.lat);
    const lon = Number(weatherModule.config.lon);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      weatherText = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    }
  }
  setText('stat-weather', weatherText);
  setText('stat-news', buildNewsAvailability(config));
  setText('stat-calendar', buildCalendarAvailability(config));
}

async function refreshOverviewSourceHealth(config) {
  if (!state.connected || !state.apiBase) return;
  if (!config || !Array.isArray(config.modules)) return;

  const newsUrls = getNewsFeeds(config).map((feed) => feed.url);
  const calendarUrls = getCalendarUrls(config);
  if (newsUrls.length === 0 && calendarUrls.length === 0) return;

  const requestId = ++sourceHealthRequestId;
  try {
    const res = await fetch(state.apiBase + 'remote/source-health', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newsUrls, calendarUrls })
    });
    if (!res.ok) throw new Error('source health ' + res.status);

    const data = await res.json();
    if (requestId !== sourceHealthRequestId) return;

    const healthByUrl = buildSourceHealthMap(data && Array.isArray(data.results) ? data.results : []);
    setText('stat-news', buildNewsAvailability(config, healthByUrl));
    setText('stat-calendar', buildCalendarAvailability(config, healthByUrl));
  } catch (e) {
    if (requestId !== sourceHealthRequestId) return;
  }
}

function applyConfigToUI(config) {
  updateOverviewStatsFromConfig(config);
  refreshOverviewSourceHealth(config);
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

  const calInput = document.getElementById('cal-url');
  if (calInput) {
    const calUrl = getPrimaryCalendarUrl(config);
    if (typeof calUrl === 'string') calInput.value = calUrl;
  }

  const complimentsModule = config.modules.find((mod) => mod.module === 'compliments');
  const complimentsConfig = complimentsModule && complimentsModule.config && typeof complimentsModule.config === 'object'
    ? complimentsModule.config
    : null;
  if (complimentsConfig && complimentsConfig.compliments && typeof complimentsConfig.compliments === 'object') {
    const setGroupValue = (id, values) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.value = Array.isArray(values)
        ? values
          .map((entry) => (entry == null ? '' : String(entry)))
          .filter((entry) => entry.trim().length > 0)
          .join('\n')
        : '';
    };
    const groups = complimentsConfig.compliments;
    setGroupValue('compliments-anytime', groups.anytime);
    setGroupValue('compliments-morning', groups.morning);
    setGroupValue('compliments-afternoon', groups.afternoon);
    setGroupValue('compliments-evening', groups.evening);
  }
  const complimentsIntervalInput = document.getElementById('compliments-update-interval-seconds');
  if (complimentsIntervalInput) {
    const rawInterval = complimentsConfig ? Number(complimentsConfig.updateInterval) : NaN;
    if (Number.isFinite(rawInterval) && rawInterval > 0) {
      const intervalSec = Math.max(1, Math.round(rawInterval / 1000));
      complimentsIntervalInput.value = String(intervalSec);
    } else if (!String(complimentsIntervalInput.value || '').trim()) {
      complimentsIntervalInput.value = '90';
    }
  }

  const newsModule = config.modules.find((mod) => mod.module === 'newsfeed' && mod.config && Array.isArray(mod.config.feeds));
  if (newsModule) {
    const feeds = newsModule.config.feeds.map((feed) => {
      if (typeof feed === 'string') {
        return { url: feed, title: '' };
      }
      if (feed && typeof feed.url === 'string') {
        return { url: feed.url, title: typeof feed.title === 'string' ? feed.title : '' };
      }
      return null;
    }).filter(Boolean);
    const rssMain = document.getElementById('rss-main');
    const rssSecondary = document.getElementById('rss-secondary');
    const rssMainTitle = document.getElementById('rss-main-title');
    const rssSecondaryTitle = document.getElementById('rss-secondary-title');
    if (rssMain) rssMain.value = feeds[0] ? feeds[0].url : '';
    if (rssSecondary) rssSecondary.value = feeds[1] ? feeds[1].url : '';
    if (rssMainTitle) rssMainTitle.value = feeds[0] ? feeds[0].title : '';
    if (rssSecondaryTitle) rssSecondaryTitle.value = feeds[1] ? feeds[1].title : '';
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

function wsLog(msg, cls) {
  const log = document.getElementById('ws-log');
  if (!log) return;
  if (log.children.length > 400) {
    log.removeChild(log.firstChild);
    log.removeChild(log.firstChild);
  }
  const line = document.createElement('span');
  if (cls) line.className = 'log-' + cls;
  line.textContent = msg; 
  log.appendChild(line);
  log.appendChild(document.createElement('br'));
  log.scrollTop = log.scrollHeight;
}

function setConnStatus(on, ip) {
  const dot = document.getElementById('conn-dot');
  const lbl = document.getElementById('conn-label');
  if (on) {
    if (dot) dot.style.background = 'var(--success)';
    if (lbl) {
      lbl.textContent = 'Connected · RPi4';
      lbl.style.color = 'var(--success)';
    }
  } else {
    if (dot) dot.style.background = '#f87171';
    if (lbl) {
      lbl.textContent = 'Disconnected';
      lbl.style.color = '#f87171';
    }
    setMirrorStatus(false);
  }
}

function setMirrorStatus(on) {
  const stat = document.getElementById('stat-status');
  if (!stat) return;
  if (on) {
    stat.textContent = 'Online';
    stat.style.color = 'var(--success)';
  } else {
    stat.textContent = 'Offline';
    stat.style.color = '#f87171';
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

async function applyCompliments() {
  const readComplimentsGroup = (id) => {
    const el = document.getElementById(id);
    if (!el) return [];
    const raw = String(el.value || '').trim();
    if (!raw) return [];
    return raw
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .slice(0, 50); // Cap at 50 messages per group
  };

  const compliments = {
    anytime: readComplimentsGroup('compliments-anytime'),
    morning: readComplimentsGroup('compliments-morning'),
    afternoon: readComplimentsGroup('compliments-afternoon'),
    evening: readComplimentsGroup('compliments-evening')
  };

  const intervalInput = document.getElementById('compliments-update-interval-seconds');
  const intervalRaw = intervalInput ? String(intervalInput.value || '').trim() : '';
  const intervalSeconds = Number(intervalRaw);
  if (!Number.isFinite(intervalSeconds) || !Number.isInteger(intervalSeconds) || intervalSeconds < 1 || intervalSeconds > 86400) {
    showToast('Please enter a valid update interval (1-86400 sec)', true);
    return;
  }

  const hasData = Object.values(compliments).some(arr => arr.length > 0);
  const complimentsPayload = { updateIntervalSeconds: intervalSeconds };
  if (hasData) {
    complimentsPayload.anytime = compliments.anytime;
    complimentsPayload.morning = compliments.morning;
    complimentsPayload.afternoon = compliments.afternoon;
    complimentsPayload.evening = compliments.evening;
  }

  const result = await updateConfig({ compliments: complimentsPayload });
  if (handleApplyResult(result)) {
    fetchConfigSnapshot().then(function(cfg) {
      applyConfigToUI(cfg);
      const savedComplimentsModule = cfg && Array.isArray(cfg.modules)
        ? cfg.modules.find((mod) => mod.module === 'compliments' && mod.config && typeof mod.config === 'object')
        : null;
      const savedIntervalMs = savedComplimentsModule ? Number(savedComplimentsModule.config.updateInterval) : NaN;
      if (!Number.isFinite(savedIntervalMs) || Math.round(savedIntervalMs) !== intervalSeconds * 1000) {
        if (intervalInput) intervalInput.value = String(intervalSeconds);
        showToast('Interval not saved to config. Restart MagicMirror and try again.', true);
      }
    });
  }
}

async function applyNews() {
  const rssMain = document.getElementById('rss-main')?.value.trim() || '';
  const rssSecondary = document.getElementById('rss-secondary')?.value.trim() || '';
  const mainTitleRaw = document.getElementById('rss-main-title')?.value.trim() || '';
  const secondaryTitleRaw = document.getElementById('rss-secondary-title')?.value.trim() || '';
  const mainTitle = mainTitleRaw.substring(0, 60);
  const secondaryTitle = secondaryTitleRaw.substring(0, 60);
  const feeds = [];
  if (rssMain && /^https?:\/\//.test(rssMain)) {
    feeds.push({ title: mainTitle, url: rssMain });
  }
  if (rssSecondary && /^https?:\/\//.test(rssSecondary)) {
    feeds.push({ title: secondaryTitle, url: rssSecondary });
  }
  if (feeds.length === 0) {
    showToast('RSS URL is required', true);
    return;
  }
  const result = await updateConfig({ newsfeed: { feeds } });
  if (handleApplyResult(result)) {
    fetchConfigSnapshot().then(function(cfg) {
      applyConfigToUI(cfg);
    });
  }
}

async function applyWeather() {
  const lat = parseFloat(document.getElementById('weather-latitude').value.trim());
  const lon = parseFloat(document.getElementById('weather-longitude').value.trim());

  if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    showToast('Please enter valid coordinates.', 'err');
    return;
  }

  const result = await updateConfig({ weather: { lat, lon } });
  if (handleApplyResult(result)) {
    fetchConfigSnapshot().then(function(cfg) {
      applyConfigToUI(cfg);
    });
  }
}

async function applyCalendar() {
  const raw = document.getElementById('cal-url').value.trim();
  if (raw && !raw.startsWith('http://') && !raw.startsWith('https://') && raw !== '') {
    showToast('⚠ Invalid calendar URL!', true);
    return;
  }
  const nextUrl = raw.substring(0, 300);
  const result = await updateConfig({ calendar: { url: nextUrl } });
  if (handleApplyResult(result)) {
    fetchConfigSnapshot().then(function(cfg) {
      applyConfigToUI(cfg);
      const savedUrl = getPrimaryCalendarUrl(cfg);
      if (String(savedUrl || '') !== nextUrl) {
        const input = document.getElementById('cal-url');
        if (input) input.value = nextUrl;
        showToast('Calendar URL not saved to config. Restart MagicMirror and try again.', true);
      }
    });
  }
}

async function applyLocale() {
  const langEl = document.getElementById('set-lang');
  const tfEl = document.getElementById('set-timeformat');
  const allowedLangs = ['ro','en','de', 'fr','hu', 'ru', 'it', 'es'];
  const lang = (langEl && allowedLangs.includes(langEl.value)) ? langEl.value : 'ro';
  const tf = (tfEl && tfEl.value === '12') ? '12' : '24';
  const result = await updateConfig({ locale: { language: lang, timeFormat: parseInt(tf) } });
  handleApplyResult(result);
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
