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

/* Returnează valoarea unui input text, sanitizată */
function getInput(id) {
  const el = document.getElementById(id);
  return el ? sanitize(el.value) : '';
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
  ws: null,
  connected: false,
  config: {
    city: 'Brașov',
    greeting: 'Great to see you!',
    brightness: 75,
    ticker: '',
    widget_positions: {},
  }
};

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

/* WEBSOCKET */
let lastConnectAttempt = 0;

function connectWS() {
  const now = Date.now();
  if (now - lastConnectAttempt < 2000) {
    showToast('⚠ Asteaptă 2 secunde între încercări!', true);
    return;
  }
  lastConnectAttempt = now;

  const ip = document.getElementById('ws-ip').value.trim();
  const port = document.getElementById('ws-port').value.trim();

  if (!isValidIP(ip)) {
    showToast('⚠ IP invalid! Folosește formatul 192.168.x.x', true);
    wsLog('[✗] IP invalid introdus.', 'err');
    return;
  }
  if (!isValidPort(port)) {
    showToast('⚠ Port invalid! (1–65535)', true);
    wsLog('[✗] Port invalid introdus.', 'err');
    return;
  }

  wsLog('[→] Se conectează la ws://' + ip + ':' + port + ' ...', 'info');

  try {
    if (state.ws) { state.ws.close(); state.ws = null; }
    state.ws = new WebSocket('ws://' + ip + ':' + port);

    state.ws.onopen = function() {
      state.connected = true;
      setConnStatus(true, ip);
      wsLog('[✓] Conectat la IntelliGlass Mirror ws://' + ip + ':' + port, 'ok');
      setText('net-ip', ip);
      setText('net-url', 'http://' + ip + ':' + port);
      setText('sidebar-ip', ip + ':' + port);
      sendCommand({ type: 'get_status' });
    };

    state.ws.onmessage = function(evt) {
      try {
        const raw = evt.data;
        if (typeof raw !== 'string' || raw.length > 65536) {
          wsLog('[!] Mesaj prea mare sau invalid. Ignorat.', 'err');
          return;
        }
        const data = JSON.parse(raw);
        if (typeof data !== 'object' || data === null || Array.isArray(data)) {
          wsLog('[!] Format mesaj neașteptat. Ignorat.', 'err');
          return;
        }
        handleMessage(data);
      } catch (e) {
        wsLog('[←] (mesaj non-JSON ignorat)', 'info');
      }
    };

    state.ws.onerror = function() {
      wsLog('[✗] Eroare conexiune. Verifică IP-ul și că serverul rulează pe RPi.', 'err');
    };

    state.ws.onclose = function() {
      state.connected = false;
      setConnStatus(false);
      wsLog('[✗] Conexiune închisă.', 'err');
    };
  } catch (e) {
    wsLog('[✗] ' + sanitize(e.message), 'err');
  }
}

function disconnectWS() {
  if (state.ws) { state.ws.close(); state.ws = null; }
  setConnStatus(false);
  wsLog('[—] Deconectat manual.', 'info');
}

/* Trimitem comenzi ca JSON */
function sendCommand(obj) {
	if (state.ws && state.ws.readyState === WebSocket.OPEN) {
		const payload = JSON.stringify(obj);
		state.ws.send(payload);
		wsLog("[→] " + payload, "info");

		// also send a post request to /config
		fetch("/config", {
			method: "POST",
			headers: {
				"Content-Type": "application/json"
			},
			body: payload
		}).catch((error) => {
			wsLog("[!] Error updating config: " + error, "err");
		});
	} else {
		wsLog("[!] Nu ești conectat la oglindă. Apasă Conectează.", "err");
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
    dot.style.background = 'var(--success)';
    lbl.textContent = 'Conectat · RPi4';
    lbl.style.color = 'var(--success)';
    stat.textContent = 'Online';
    stat.style.color = 'var(--success)';
  } else {
    dot.style.background = '#f87171';
    lbl.textContent = 'Deconectat';
    lbl.style.color = '#f87171';
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
  sendCommand({ type: 'brightness', value: n });
}

function toggleSwitch(el, key) {
  if (!/^[a-z_]+$/.test(key)) return;
  el.classList.toggle('on');
  const on = el.classList.contains('on');
  sendCommand({ type: 'toggle', key: key, value: on });
  showToast((on ? '✓ Activat: ' : '✗ Dezactivat: ') + key.replace(/_/g, ' '));
}

function applyGreeting() {
  const raw = document.getElementById('greeting-input').value;
  const val = sanitize(raw).substring(0, 120) || 'Bun venit!';
  setText('mirror-greeting-text', val);
  state.config.greeting = val;
  sendCommand({ type: 'set_greeting', text: val });
  showToast('✓ Mesaj actualizat pe oglindă!');
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
    sendCommand({ type: 'set_ticker', text: val });
    showToast('✓ Ticker actualizat pe oglindă!');
  }
}

function applyWeather() {
  const lat = parseFloat(document.getElementById('weather-latitude').value.trim());
  const lon = parseFloat(document.getElementById('weather-longitude').value.trim());

  if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    showToast('✗ Vă rugăm introduceți coordonate valide.', 'err');
    return;
  }

  sendCommand({ type: 'set_weather', lat, lon });
  showToast('Setări vreme actualizate!');
}

function applyCalendar() {
  const raw = document.getElementById('cal-url').value.trim();
  if (raw && !raw.startsWith('http://') && !raw.startsWith('https://') && raw !== '') {
    showToast('⚠ URL calendar invalid!', true);
    return;
  }
  sendCommand({ type: 'set_calendar', url: sanitize(raw).substring(0, 300) });
  showToast('✓ Calendar salvat!');
}

function applyLocale() {
  const langEl = document.getElementById('set-lang');
  const tfEl = document.getElementById('set-timeformat');
  const allowedLangs = ['ro','en','de','hu'];
  const lang = (langEl && allowedLangs.includes(langEl.value)) ? langEl.value : 'ro';
  const tf = (tfEl && tfEl.value === '12') ? '12' : '24';
  sendCommand({ type: 'set_locale', lang, timeformat: tf });
  showToast('✓ Limbă și regiune salvate!');
}

function saveAPIKeys() {
  const owm = document.getElementById('owm-key').value.trim();
  const gcal = document.getElementById('gcal-key').value.trim();
  const news = document.getElementById('news-key').value.trim();
  if (owm && owm.length < 10) { showToast('⚠ Cheia OWM pare prea scurtă!', true); return; }
  sendCommand({
    type: 'set_apikeys',
    owm: owm ? '***set***' : '',
    gcal: gcal ? '***set***' : '',
    news: news ? '***set***' : ''
  });
  showToast('🔑 Chei API salvate pe RPi!');
}

function applyPosition() {
  const widgetEl = document.getElementById('widget-selector');
  const widget = widgetEl ? sanitize(widgetEl.value).substring(0, 30) : '';
  const selected = document.querySelector('.pos-cell.selected');
  const pos = selected ? sanitize(selected.dataset.poskey || '') : 'center';
  sendCommand({ type: 'set_position', widget, position: pos });
  showToast('✓ Poziție salvată: ' + widget);
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
  sendCommand({ type: 'set_style', widget, size, opacity, color });
  showToast('✓ Stil aplicat pe oglindă!');
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
    sendCommand({ type: 'factory_reset' });
    showToast('⚠ Reset inițiat!');
  }
}

/* i18n */
const translations = {
  ro: {
    nav_dashboard: 'Dashboard', nav_layout: 'Layout', nav_widgets: 'Widget-uri', nav_settings: 'Setări',
    conn_disconnected: 'Deconectat', conn_connected: 'Conectat · RPi4',
    side_mirror: 'Oglindiță', side_customize: 'Personalizare', side_system: 'Sistem',
    side_overview: 'Prezentare', side_layout: 'Aranjament', side_widgets: 'Widget-uri',
    side_weather: 'Vreme', side_news: 'Știri', side_calendar: 'Calendar',
    side_network: 'Rețea / Wi-Fi', side_settings: 'Setări',
    dash_greeting: 'Bun venit! 👋', dash_sub: 'Oglinda ta smart este monitorizată în timp real.',
    stat_status_lbl: 'Status RPi', stat_temp_lbl: 'Temperatură', stat_widgets_lbl: 'Widget-uri Active',
    stat_bright_lbl: 'Luminozitate', stat_on_mirror: 'Pe oglindă', stat_adjustable: 'Reglabilă',
    card_preview: 'Previzualizare Oglindă', card_quickcontrol: 'Control Rapid',
    mirror_loading: 'Se încarcă...',
    lbl_brightness: 'Luminozitate Ecran',
    tog_nightmode: 'Modul Noapte', tog_nightmode_sub: 'Reduce luminozitatea după 22:00',
    tog_clock: 'Afișare Ceas', tog_clock_sub: 'Ora digitală pe oglindă',
    tog_ticker: 'Ticker Știri', tog_ticker_sub: 'Bandă derulantă în josul oglinzii',
    tog_weather: 'Afișare Vreme', tog_weather_sub: 'Prognoză meteo pe oglindă',
    tog_calendar: 'Afișare Calendar', tog_calendar_sub: 'Evenimente Google Calendar',
    btn_apply_mirror: 'Aplică pe Oglindă', btn_reload: 'Reîncarcă',
    card_ws: 'Conexiune WebSocket cu Raspberry Pi',
    lbl_ip: 'IP Raspberry Pi', lbl_port: 'Port WebSocket',
    btn_connect: 'Conectează', btn_disconnect: 'Deconectează',
    ws_hint: 'Introdu IP-ul Raspberry Pi și apasă Conectează.',
    page_layout: 'Aranjament Widget-uri', page_layout_sub: 'Selectează poziția și stilizarea fiecărui widget pe suprafața oglinzii.',
    card_position: 'Poziție Widget', lbl_widget_select: 'Widget de configurat',
    wopt_clock: '🕐 Ceas Digital', wopt_weather: '☁ Vreme', wopt_calendar: '📅 Calendar',
    wopt_ticker: '📰 Ticker Știri', wopt_greeting: '💬 Mesaj de Bun Venit', wopt_sysinfo: '📊 Statistici Sistem',
    btn_save_pos: 'Salvează Poziția', card_style: 'Stilizare Widget',
    lbl_font: 'Font Afișaj', lbl_fontsize: 'Mărime Font (px)', lbl_opacity: 'Opacitate (%)', lbl_color: 'Culoare Text',
    col_warmwhite: 'Alb Cald #F7ECE1', col_purewhite: 'Alb Pur #FFFFFF',
    tog_fadein: 'Animație Fade-in', tog_fadein_sub: 'La pornire și refresh',
    tog_glow: 'Efect Glow', tog_glow_sub: 'Luminos subtil în jurul textului',
    btn_apply_style: 'Aplică Stil',
    page_widgets: 'Gestionare Widget-uri', page_widgets_sub: 'Activează, dezactivează și configurează modulele afișate pe oglindă.',
    wdesc_clock: 'Oră și dată în timp real. Actualizare la 1 secundă.',
    wdesc_weather: 'Prognoză 5 zile, temperatură curentă, vânt.',
    wdesc_calendar: 'Afișează evenimentele din calendarul Google.',
    wdesc_ticker: 'Bandă derulantă cu știri RSS sau text custom.',
    wdesc_greeting: 'Text personalizat în centrul oglinzii.',
    wdesc_sysinfo: 'CPU, RAM, temperatură procesor.',
    badge_active: 'Activ', badge_inactive: 'Inactiv',
    btn_configure: 'Configurează', btn_activate: 'Activează',
    page_weather: 'Configurare Vreme', page_weather_sub: 'Setează locația și modul de afișare al prognozei meteo pe oglindă.',
    card_location: 'Locație & Setări', lbl_city: 'Orașul tău', lbl_country: 'Cod țară (ISO)',
    lbl_tempunit: 'Unitate temperatură', opt_celsius: 'Celsius (°C)', opt_fahrenheit: 'Fahrenheit (°F)',
    lbl_forecastdays: 'Zile prognoză afișate', opt_3days: '3 zile', opt_5days: '5 zile', opt_7days: '7 zile',
    tog_wind: 'Afișare Vânt', tog_humidity: 'Afișare Umiditate', tog_autoupdate: 'Actualizare automată (15 min)',
    btn_apply_weather: 'Aplică Setări Vreme', btn_refresh_weather: 'Actualizează Previzualizare',
    page_news: 'Configurare Știri', page_news_sub: 'Personalizează sursa și conținutul banderolei derulante de pe oglindă.',
    card_rss: 'Surse RSS', lbl_rss_main: 'Feed RSS Principal', lbl_rss_secondary: 'Feed RSS Secundar (opțional)',
    lbl_news_cat: 'Categorie Știri', opt_all: 'Toate', opt_politics: 'Politică', opt_sport: 'Sport',
    opt_tech: 'Tech', opt_economy: 'Economie',
    lbl_ticker_speed: 'Viteză ticker', opt_slow: 'Lentă', opt_normal: 'Normală', opt_fast: 'Rapidă',
    card_ticker_manual: 'Ticker Manual (înlocuiește RSS)', lbl_ticker_custom: 'Text personalizat pentru banderoló',
    btn_apply_ticker: 'Aplică Ticker pe Oglindă', btn_clear: 'Golește',
    page_calendar: 'Calendar & Mesaj', page_calendar_sub: 'Configurează Google Calendar și mesajul personal afișat pe oglindă.',
    card_cal_settings: 'Setări Calendar', cal_device_sub: 'Configurează URL-ul CalDAV sau integrarea Google',
    badge_notconnected: 'Neconectat', lbl_cal_url: 'URL Calendar (iCal / CalDAV)',
    lbl_events_shown: 'Evenimente afișate', lbl_cal_range: 'Interval',
    opt_today: 'Azi', opt_today_tomorrow: 'Azi + Mâine', opt_this_week: 'Săptămâna asta',
    btn_save_calendar: 'Salvează Calendar', card_greeting: 'Mesaj de Bun Venit',
    lbl_greeting: 'Mesajul afișat în centrul oglinzii',
    tog_timegreet: 'Salut bazat pe oră', tog_timegreet_sub: 'Dimineața / Ziua / Seara',
    tog_username: 'Afișare nume utilizator', tog_username_sub: 'Recunoaștere facială necesară',
    btn_apply_greeting: 'Aplică Mesajul',
    page_network: 'Rețea & Conectivitate', page_network_sub: 'Gestionează conexiunea Wi-Fi și dispozitivele conectate la oglinda smart.',
    card_server: 'Server Web — Raspberry Pi 4', card_devices: 'Dispozitive Conectate',
    card_wifi: 'Setări Wi-Fi Oglindă', lbl_ssid: 'Nume Rețea (SSID)', lbl_wifipass: 'Parolă Wi-Fi',
    btn_save_wifi: 'Salvează & Aplică Wi-Fi',
    page_settings: 'Setări Aplicație', page_settings_sub: 'Configurări globale pentru IntelliGlass, oglinda smart și integrările externe.',
    card_lang: 'Limbă & Regiune', lbl_lang: 'Limbă interfață', lbl_dateformat: 'Format dată oglindă',
    lbl_timeformat: 'Format oră', lbl_timezone: 'Fus orar', btn_save_lang: 'Salvează Limbă & Regiune',
    card_apikeys: 'API Keys', lbl_owm: 'OpenWeatherMap API Key', lbl_gcal: 'Google Calendar API Key',
    lbl_newsapi: 'NewsAPI Key (opțional)', btn_save_apikeys: 'Salvează Cheile API',
    card_security: 'Securitate & Access', tog_password: 'Parolă acces interfață web',
    tog_password_sub: 'Protejează panoul de control', tog_localonly: 'Numai rețea locală',
    tog_localonly_sub: 'Blochează accesul din internet', tog_log: 'Log activitate utilizatori',
    tog_log_sub: 'Salvează acțiunile pe oglindă', tog_autoupdate2: 'Actualizări automate',
    tog_autoupdate2_sub: 'Actualizare MagicMirror²', card_system: 'Control Sistem RPi4',
    btn_restart_mm: 'Repornire MM²', btn_reboot: 'Repornire RPi', btn_shutdown: 'Oprire RPi',
    btn_factory_reset: 'Reset Fabrică', card_about: 'Despre IntelliGlass',
    sub_rpi4: 'Raspberry Pi 4',
    wname_clock: 'Ceas Digital',
    wname_weather: 'Vreme',
    wname_calendar: 'Google Calendar',
    wname_ticker: 'Ticker Știri',
    wname_greeting: 'Mesaj Bun Venit',
    info_weather_api: 'Datele meteo sunt preluate via API OpenWeatherMap. Configurează cheia API în Setări → API Keys.',
    info_network_hint: 'Conectează-te din orice browser în aceeași rețea Wi-Fi la',
    info_wifi_warning: 'Modificarea credențialelor Wi-Fi va reporni modulul wireless. Verificați datele înainte de salvare.',
    info_apikeys: 'Cheile API sunt stocate criptat pe Raspberry Pi și nu sunt transmise în rețea.',
    about_version: 'Versiune',
    about_hardware: 'Hardware',
    about_framework: 'Framework Oglindă',
    about_project: 'Proiect',
    about_protocol: 'Protocol comunicare',
    net_ip_label: 'IP Oglindă',
    net_port_label: 'Port',
    net_protocol_label: 'Protocol',
    net_clients_label: 'Clienți activi',
    net_no_devices: 'Niciun dispozitiv conectat. Conectează oglinda pentru a vedea clienții activi.',
    suggest1: 'Bun venit acasă!',
    suggest2: 'Zi bună!',
    suggest3: 'Have a great day!',
    toast_applied: '✓ Modificări trimise la oglindă!', toast_reload: '↺ Oglinda reîncarcă...',
    toast_lang: '✓ Limbă schimbată!', toast_wifi: '📶 Configurare Wi-Fi trimisă la RPi!',
    toast_widget_active: '✓ Widget activat!', confirm_reset: 'Ești sigur că vrei să resetezi oglinda la setările implicite? Toate configurările vor fi șterse.',
  },
  en: {
    nav_dashboard: 'Dashboard', nav_layout: 'Layout', nav_widgets: 'Widgets', nav_settings: 'Settings',
    conn_disconnected: 'Disconnected', conn_connected: 'Connected · RPi4',
    side_mirror: 'Mirror', side_customize: 'Customize', side_system: 'System',
    side_overview: 'Overview', side_layout: 'Layout', side_widgets: 'Widgets',
    side_weather: 'Weather', side_news: 'News', side_calendar: 'Calendar',
    side_network: 'Network / Wi-Fi', side_settings: 'Settings',
    dash_greeting: 'Welcome! 👋', dash_sub: 'Your smart mirror is being monitored in real time.',
    stat_status_lbl: 'RPi Status', stat_temp_lbl: 'Temperature', stat_widgets_lbl: 'Active Widgets',
    stat_bright_lbl: 'Brightness', stat_on_mirror: 'On mirror', stat_adjustable: 'Adjustable',
    card_preview: 'Mirror Preview', card_quickcontrol: 'Quick Controls',
    mirror_loading: 'Loading...',
    lbl_brightness: 'Screen Brightness',
    tog_nightmode: 'Night Mode', tog_nightmode_sub: 'Reduces brightness after 10 PM',
    tog_clock: 'Show Clock', tog_clock_sub: 'Digital time on mirror',
    tog_ticker: 'News Ticker', tog_ticker_sub: 'Scrolling banner at the bottom',
    tog_weather: 'Show Weather', tog_weather_sub: 'Weather forecast on mirror',
    tog_calendar: 'Show Calendar', tog_calendar_sub: 'Google Calendar events',
    btn_apply_mirror: 'Apply to Mirror', btn_reload: 'Reload',
    card_ws: 'WebSocket Connection to Raspberry Pi',
    lbl_ip: 'Raspberry Pi IP', lbl_port: 'WebSocket Port',
    btn_connect: 'Connect', btn_disconnect: 'Disconnect',
    ws_hint: 'Enter the Raspberry Pi IP and press Connect.',
    page_layout: 'Widget Layout', page_layout_sub: 'Select the position and style of each widget on the mirror surface.',
    card_position: 'Widget Position', lbl_widget_select: 'Widget to configure',
    wopt_clock: '🕐 Digital Clock', wopt_weather: '☁ Weather', wopt_calendar: '📅 Calendar',
    wopt_ticker: '📰 News Ticker', wopt_greeting: '💬 Welcome Message', wopt_sysinfo: '📊 System Stats',
    btn_save_pos: 'Save Position', card_style: 'Widget Style',
    lbl_font: 'Display Font', lbl_fontsize: 'Font Size (px)', lbl_opacity: 'Opacity (%)', lbl_color: 'Text Color',
    col_warmwhite: 'Warm White #F7ECE1', col_purewhite: 'Pure White #FFFFFF',
    tog_fadein: 'Fade-in Animation', tog_fadein_sub: 'On startup and refresh',
    tog_glow: 'Glow Effect', tog_glow_sub: 'Subtle glow around text',
    btn_apply_style: 'Apply Style',
    page_widgets: 'Manage Widgets', page_widgets_sub: 'Enable, disable and configure modules displayed on the mirror.',
    wdesc_clock: 'Real-time hour and date. Updates every second.',
    wdesc_weather: '5-day forecast, current temperature, wind.',
    wdesc_calendar: 'Displays events from Google Calendar.',
    wdesc_ticker: 'Scrolling banner with RSS news or custom text.',
    wdesc_greeting: 'Custom text in the center of the mirror.',
    wdesc_sysinfo: 'CPU, RAM, processor temperature.',
    badge_active: 'Active', badge_inactive: 'Inactive',
    btn_configure: 'Configure', btn_activate: 'Activate',
    page_weather: 'Weather Settings', page_weather_sub: 'Set the location and display mode for the weather forecast.',
    card_location: 'Location & Settings', lbl_city: 'Your city', lbl_country: 'Country code (ISO)',
    lbl_tempunit: 'Temperature unit', opt_celsius: 'Celsius (°C)', opt_fahrenheit: 'Fahrenheit (°F)',
    lbl_forecastdays: 'Forecast days shown', opt_3days: '3 days', opt_5days: '5 days', opt_7days: '7 days',
    tog_wind: 'Show Wind', tog_humidity: 'Show Humidity', tog_autoupdate: 'Auto update (15 min)',
    btn_apply_weather: 'Apply Weather Settings', btn_refresh_weather: 'Refresh Preview',
    page_news: 'News Settings', page_news_sub: 'Customize the source and content of the scrolling banner.',
    card_rss: 'RSS Sources', lbl_rss_main: 'Primary RSS Feed', lbl_rss_secondary: 'Secondary RSS Feed (optional)',
    lbl_news_cat: 'News Category', opt_all: 'All', opt_politics: 'Politics', opt_sport: 'Sport',
    opt_tech: 'Tech', opt_economy: 'Economy',
    lbl_ticker_speed: 'Ticker speed', opt_slow: 'Slow', opt_normal: 'Normal', opt_fast: 'Fast',
    card_ticker_manual: 'Manual Ticker (replaces RSS)', lbl_ticker_custom: 'Custom text for the banner',
    btn_apply_ticker: 'Apply Ticker to Mirror', btn_clear: 'Clear',
    page_calendar: 'Calendar & Message', page_calendar_sub: 'Configure Google Calendar and the personal message shown on the mirror.',
    card_cal_settings: 'Calendar Settings', cal_device_sub: 'Configure the CalDAV URL or Google integration',
    badge_notconnected: 'Not connected', lbl_cal_url: 'Calendar URL (iCal / CalDAV)',
    lbl_events_shown: 'Events shown', lbl_cal_range: 'Range',
    opt_today: 'Today', opt_today_tomorrow: 'Today + Tomorrow', opt_this_week: 'This week',
    btn_save_calendar: 'Save Calendar', card_greeting: 'Welcome Message',
    lbl_greeting: 'Message shown in the center of the mirror',
    tog_timegreet: 'Time-based greeting', tog_timegreet_sub: 'Morning / Afternoon / Evening',
    tog_username: 'Show username', tog_username_sub: 'Face recognition required',
    btn_apply_greeting: 'Apply Message',
    page_network: 'Network & Connectivity', page_network_sub: 'Manage Wi-Fi connection and devices connected to the smart mirror.',
    card_server: 'Web Server — Raspberry Pi 4', card_devices: 'Connected Devices',
    card_wifi: 'Mirror Wi-Fi Settings', lbl_ssid: 'Network Name (SSID)', lbl_wifipass: 'Wi-Fi Password',
    btn_save_wifi: 'Save & Apply Wi-Fi',
    page_settings: 'App Settings', page_settings_sub: 'Global configuration for IntelliGlass, the smart mirror and external integrations.',
    card_lang: 'Language & Region', lbl_lang: 'Interface language', lbl_dateformat: 'Mirror date format',
    lbl_timeformat: 'Time format', lbl_timezone: 'Time zone', btn_save_lang: 'Save Language & Region',
    card_apikeys: 'API Keys', lbl_owm: 'OpenWeatherMap API Key', lbl_gcal: 'Google Calendar API Key',
    lbl_newsapi: 'NewsAPI Key (optional)', btn_save_apikeys: 'Save API Keys',
    card_security: 'Security & Access', tog_password: 'Web interface password',
    tog_password_sub: 'Protects the control panel', tog_localonly: 'Local network only',
    tog_localonly_sub: 'Blocks access from the internet', tog_log: 'Activity log',
    tog_log_sub: 'Saves user actions on the mirror', tog_autoupdate2: 'Auto updates',
    tog_autoupdate2_sub: 'MagicMirror² update', card_system: 'RPi4 System Control',
    btn_restart_mm: 'Restart MM²', btn_reboot: 'Restart RPi', btn_shutdown: 'Shutdown RPi',
    btn_factory_reset: 'Factory Reset', card_about: 'About IntelliGlass',
    sub_rpi4: 'Raspberry Pi 4',
    wname_clock: 'Digital Clock',
    wname_weather: 'Weather',
    wname_calendar: 'Google Calendar',
    wname_ticker: 'News Ticker',
    wname_greeting: 'Welcome Message',
    
    info_weather_api: 'Weather data is fetched via OpenWeatherMap API. Configure the API key in Settings → API Keys.',
    info_network_hint: 'Connect from any browser on the same Wi-Fi network at',
    info_wifi_warning: 'Changing Wi-Fi credentials will restart the wireless module. Verify data before saving.',
    info_apikeys: 'API keys are stored encrypted on the Raspberry Pi and are not transmitted over the network.',
    about_version: 'Version',
    about_hardware: 'Hardware',
    about_framework: 'Mirror Framework',
    about_project: 'Project',
    about_protocol: 'Communication protocol',
    net_ip_label: 'Mirror IP',
    net_port_label: 'Port',
    net_protocol_label: 'Protocol',
    net_clients_label: 'Active clients',
    net_no_devices: 'No devices connected. Connect the mirror to see active clients.',
    suggest1: 'Welcome home!',
    suggest2: 'Have a nice day!',
    suggest3: 'Have a great day!',
    toast_applied: '✓ Changes sent to mirror!', toast_reload: '↺ Mirror reloading...',
    toast_lang: '✓ Language changed!', toast_wifi: '📶 Wi-Fi config sent to RPi!',
    toast_widget_active: '✓ Widget activated!', confirm_reset: 'Are you sure you want to reset the mirror to factory settings? All configurations will be deleted.',
  },
  de: {
    nav_dashboard: 'Dashboard', nav_layout: 'Layout', nav_widgets: 'Widgets', nav_settings: 'Einstellungen',
    conn_disconnected: 'Getrennt', conn_connected: 'Verbunden · RPi4',
    side_mirror: 'Spiegel', side_customize: 'Anpassung', side_system: 'System',
    side_overview: 'Übersicht', side_layout: 'Layout', side_widgets: 'Widgets',
    side_weather: 'Wetter', side_news: 'Nachrichten', side_calendar: 'Kalender',
    side_network: 'Netzwerk / WLAN', side_settings: 'Einstellungen',
    dash_greeting: 'Willkommen! 👋', dash_sub: 'Dein Smart-Spiegel wird in Echtzeit überwacht.',
    stat_bright_lbl: 'Helligkeit', stat_on_mirror: 'Auf Spiegel', stat_adjustable: 'Einstellbar',
    card_preview: 'Spiegelvorschau', card_quickcontrol: 'Schnellsteuerung',
    mirror_loading: 'Wird geladen...',
    lbl_brightness: 'Bildschirmhelligkeit',
    tog_nightmode: 'Nachtmodus', tog_nightmode_sub: 'Helligkeit nach 22 Uhr reduzieren',
    tog_clock: 'Uhr anzeigen', tog_clock_sub: 'Digitaluhr auf Spiegel',
    tog_ticker: 'Nachrichten-Ticker', tog_ticker_sub: 'Laufband unten am Spiegel',
    tog_weather: 'Wetter anzeigen', tog_weather_sub: 'Wettervorhersage auf Spiegel',
    tog_calendar: 'Kalender anzeigen', tog_calendar_sub: 'Google Kalender Ereignisse',
    btn_apply_mirror: 'Auf Spiegel anwenden', btn_reload: 'Neu laden',
    card_ws: 'WebSocket-Verbindung zum Raspberry Pi',
    lbl_ip: 'Raspberry Pi IP', lbl_port: 'WebSocket-Port',
    btn_connect: 'Verbinden', btn_disconnect: 'Trennen',
    ws_hint: 'Raspberry Pi IP eingeben und auf Verbinden drücken.',
    page_layout: 'Widget-Layout', page_layout_sub: 'Position und Stil jedes Widgets auf der Spiegelfläche auswählen.',
    card_position: 'Widget-Position', lbl_widget_select: 'Zu konfigurierendes Widget',
    wopt_clock: '🕐 Digitaluhr', wopt_weather: '☁ Wetter', wopt_calendar: '📅 Kalender',
    wopt_ticker: '📰 Nachrichten-Ticker', wopt_greeting: '💬 Willkommensnachricht', wopt_sysinfo: '📊 Systeminfo',
    btn_save_pos: 'Position speichern', card_style: 'Widget-Stil',
    lbl_font: 'Schriftart', lbl_fontsize: 'Schriftgröße (px)', lbl_opacity: 'Deckkraft (%)', lbl_color: 'Textfarbe',
    col_warmwhite: 'Warmweiß #F7ECE1', col_purewhite: 'Reinweiß #FFFFFF',
    tog_fadein: 'Einblend-Animation', tog_fadein_sub: 'Beim Start und Aktualisieren',
    tog_glow: 'Glow-Effekt', tog_glow_sub: 'Subtiles Leuchten um den Text',
    btn_apply_style: 'Stil anwenden',
    page_widgets: 'Widgets verwalten', page_widgets_sub: 'Module auf dem Spiegel aktivieren, deaktivieren und konfigurieren.',
    wdesc_clock: 'Echtzeit-Uhrzeit und Datum. Aktualisierung jede Sekunde.',
    wdesc_weather: '5-Tage-Vorhersage, aktuelle Temperatur, Wind.',
    wdesc_calendar: 'Zeigt Ereignisse aus Google Kalender an.',
    wdesc_ticker: 'Laufband mit RSS-Nachrichten oder benutzerdefiniertem Text.',
    wdesc_greeting: 'Benutzerdefinierter Text in der Spiegelmitte.',
    wdesc_sysinfo: 'CPU, RAM, Prozessortemperatur.',
    badge_active: 'Aktiv', badge_inactive: 'Inaktiv',
    btn_configure: 'Konfigurieren', btn_activate: 'Aktivieren',
    page_weather: 'Wettereinstellungen', page_weather_sub: 'Standort und Anzeigemodus für die Wettervorhersage festlegen.',
    card_location: 'Standort & Einstellungen', lbl_city: 'Deine Stadt', lbl_country: 'Ländercode (ISO)',
    lbl_tempunit: 'Temperatureinheit', opt_celsius: 'Celsius (°C)', opt_fahrenheit: 'Fahrenheit (°F)',
    lbl_forecastdays: 'Angezeigte Vorhersagetage', opt_3days: '3 Tage', opt_5days: '5 Tage', opt_7days: '7 Tage',
    tog_wind: 'Wind anzeigen', tog_humidity: 'Luftfeuchtigkeit anzeigen', tog_autoupdate: 'Auto-Aktualisierung (15 Min)',
    btn_apply_weather: 'Wettereinstellungen anwenden', btn_refresh_weather: 'Vorschau aktualisieren',
    page_news: 'Nachrichteneinstellungen', page_news_sub: 'Quelle und Inhalt des Laufbands anpassen.',
    card_rss: 'RSS-Quellen', lbl_rss_main: 'Primärer RSS-Feed', lbl_rss_secondary: 'Sekundärer RSS-Feed (optional)',
    lbl_news_cat: 'Nachrichtenkategorie', opt_all: 'Alle', opt_politics: 'Politik', opt_sport: 'Sport',
    opt_tech: 'Tech', opt_economy: 'Wirtschaft',
    lbl_ticker_speed: 'Ticker-Geschwindigkeit', opt_slow: 'Langsam', opt_normal: 'Normal', opt_fast: 'Schnell',
    card_ticker_manual: 'Manueller Ticker (ersetzt RSS)', lbl_ticker_custom: 'Benutzerdefinierter Text für das Banner',
    btn_apply_ticker: 'Ticker auf Spiegel anwenden', btn_clear: 'Leeren',
    page_calendar: 'Kalender & Nachricht', page_calendar_sub: 'Google Kalender und persönliche Nachricht auf dem Spiegel konfigurieren.',
    card_cal_settings: 'Kalendereinstellungen', cal_device_sub: 'CalDAV-URL oder Google-Integration konfigurieren',
    badge_notconnected: 'Nicht verbunden', lbl_cal_url: 'Kalender-URL (iCal / CalDAV)',
    lbl_events_shown: 'Angezeigte Ereignisse', lbl_cal_range: 'Zeitraum',
    opt_today: 'Heute', opt_today_tomorrow: 'Heute + Morgen', opt_this_week: 'Diese Woche',
    btn_save_calendar: 'Kalender speichern', card_greeting: 'Willkommensnachricht',
    lbl_greeting: 'Nachricht in der Spiegelmitte angezeigt',
    tog_timegreet: 'Zeitbasierter Gruß', tog_timegreet_sub: 'Morgens / Mittags / Abends',
    tog_username: 'Benutzername anzeigen', tog_username_sub: 'Gesichtserkennung erforderlich',
    btn_apply_greeting: 'Nachricht anwenden',
    page_network: 'Netzwerk & Konnektivität', page_network_sub: 'WLAN-Verbindung und mit dem Smart-Spiegel verbundene Geräte verwalten.',
    card_server: 'Webserver — Raspberry Pi 4', card_devices: 'Verbundene Geräte',
    card_wifi: 'Spiegel WLAN-Einstellungen', lbl_ssid: 'Netzwerkname (SSID)', lbl_wifipass: 'WLAN-Passwort',
    btn_save_wifi: 'Speichern & WLAN anwenden',
    page_settings: 'App-Einstellungen', page_settings_sub: 'Globale Konfiguration für IntelliGlass, den Smart-Spiegel und externe Integrationen.',
    card_lang: 'Sprache & Region', lbl_lang: 'Oberflächensprache', lbl_dateformat: 'Spiegeldatumsformat',
    lbl_timeformat: 'Zeitformat', lbl_timezone: 'Zeitzone', btn_save_lang: 'Sprache & Region speichern',
    card_apikeys: 'API-Schlüssel', lbl_owm: 'OpenWeatherMap API-Schlüssel', lbl_gcal: 'Google Kalender API-Schlüssel',
    lbl_newsapi: 'NewsAPI-Schlüssel (optional)', btn_save_apikeys: 'API-Schlüssel speichern',
    card_security: 'Sicherheit & Zugang', tog_password: 'Webinterface-Passwort',
    tog_password_sub: 'Schützt das Steuerfeld', tog_localonly: 'Nur lokales Netzwerk',
    tog_localonly_sub: 'Sperrt den Zugang aus dem Internet', tog_log: 'Aktivitätsprotokoll',
    tog_log_sub: 'Speichert Benutzeraktionen am Spiegel', tog_autoupdate2: 'Automatische Updates',
    tog_autoupdate2_sub: 'MagicMirror²-Update', card_system: 'RPi4 Systemsteuerung',
    btn_restart_mm: 'MM² neu starten', btn_reboot: 'RPi neu starten', btn_shutdown: 'RPi herunterfahren',
    btn_factory_reset: 'Werksreset', card_about: 'Über IntelliGlass',
    sub_rpi4: 'Raspberry Pi 4',
    wname_clock: 'Digitaluhr',
    wname_weather: 'Wetter',
    wname_calendar: 'Google Kalender',
    wname_ticker: 'Nachrichten-Ticker',
    wname_greeting: 'Willkommensnachricht',
    wname_sysinfo: 'RPi Statistiken',
    info_weather_api: 'Wetterdaten werden über OpenWeatherMap API abgerufen. API-Schlüssel in Einstellungen → API Keys eingeben.',
    info_network_hint: 'Verbinde dich mit jedem Browser im selben WLAN-Netzwerk unter',
    info_wifi_warning: 'Das Ändern der WLAN-Zugangsdaten startet das Wireless-Modul neu. Daten vor dem Speichern prüfen.',
    info_apikeys: 'API-Schlüssel werden verschlüsselt auf dem Raspberry Pi gespeichert und nicht übertragen.',
    about_version: 'Version',
    about_hardware: 'Hardware',
    about_framework: 'Spiegel-Framework',
    about_project: 'Projekt',
    about_protocol: 'Kommunikationsprotokoll',
    net_ip_label: 'Spiegel IP',
    net_port_label: 'Port',
    net_protocol_label: 'Protokoll',
    net_clients_label: 'Aktive Clients',
    net_no_devices: 'Keine Geräte verbunden. Spiegel verbinden um aktive Clients zu sehen.',
    suggest1: 'Willkommen zu Hause!',
    suggest2: 'Schönen Tag!',
    suggest3: 'Have a great day!',
    toast_applied: '✓ Änderungen an Spiegel gesendet!', toast_reload: '↺ Spiegel lädt neu...',
    toast_lang: '✓ Sprache geändert!', toast_wifi: '📶 WLAN-Konfiguration an RPi gesendet!',
    toast_widget_active: '✓ Widget aktiviert!', confirm_reset: 'Möchten Sie den Spiegel wirklich auf die Werkseinstellungen zurücksetzen? Alle Konfigurationen werden gelöscht.',
  },
  hu: {
    nav_dashboard: 'Vezérlőpult', nav_layout: 'Elrendezés', nav_widgets: 'Widgetek', nav_settings: 'Beállítások',
    conn_disconnected: 'Leválasztva', conn_connected: 'Csatlakozva · RPi4',
    side_mirror: 'Tükör', side_customize: 'Testreszabás', side_system: 'Rendszer',
    side_overview: 'Áttekintés', side_layout: 'Elrendezés', side_widgets: 'Widgetek',
    side_weather: 'Időjárás', side_news: 'Hírek', side_calendar: 'Naptár',
    side_network: 'Hálózat / Wi-Fi', side_settings: 'Beállítások',
    dash_greeting: 'Üdvözlöm! 👋', dash_sub: 'Az okostükröd valós időben figyelhető.',
    stat_status_lbl: 'RPi Állapot', stat_temp_lbl: 'Hőmérséklet', stat_widgets_lbl: 'Aktív widgetek',
    stat_bright_lbl: 'Fényerő', stat_on_mirror: 'A tükrön', stat_adjustable: 'Állítható',
    card_preview: 'Tükör előnézet', card_quickcontrol: 'Gyors vezérlés',
    mirror_loading: 'Betöltés...',
    lbl_brightness: 'Képernyő fényereje',
    tog_nightmode: 'Éjszakai mód', tog_nightmode_sub: 'Fényerő csökkentése 22:00 után',
    tog_clock: 'Óra megjelenítése', tog_clock_sub: 'Digitális óra a tükrön',
    tog_ticker: 'Hírek tickere', tog_ticker_sub: 'Görgetősáv a tükör alján',
    tog_weather: 'Időjárás megjelenítése', tog_weather_sub: 'Időjárás-előrejelzés a tükrön',
    tog_calendar: 'Naptár megjelenítése', tog_calendar_sub: 'Google Naptár eseményei',
    btn_apply_mirror: 'Alkalmazás a tükörre', btn_reload: 'Újratöltés',
    card_ws: 'WebSocket-kapcsolat a Raspberry Pi-hez',
    lbl_ip: 'Raspberry Pi IP', lbl_port: 'WebSocket port',
    btn_connect: 'Csatlakozás', btn_disconnect: 'Leválasztás',
    ws_hint: 'Adja meg a Raspberry Pi IP-jét, majd kattintson a Csatlakozás gombra.',
    page_layout: 'Widget-elrendezés', page_layout_sub: 'Válassza ki az egyes widgetek pozícióját és stílusát a tükör felületén.',
    card_position: 'Widget pozíciója', lbl_widget_select: 'Konfigurálandó widget',
    wopt_clock: '🕐 Digitális óra', wopt_weather: '☁ Időjárás', wopt_calendar: '📅 Naptár',
    wopt_ticker: '📰 Hírek tickere', wopt_greeting: '💬 Üdvözlő üzenet', wopt_sysinfo: '📊 Rendszeradatok',
    btn_save_pos: 'Pozíció mentése', card_style: 'Widget stílusa',
    lbl_font: 'Megjelenítési betűtípus', lbl_fontsize: 'Betűméret (px)', lbl_opacity: 'Átlátszatlanság (%)', lbl_color: 'Szöveg színe',
    col_warmwhite: 'Meleg fehér #F7ECE1', col_purewhite: 'Tiszta fehér #FFFFFF',
    tog_fadein: 'Fade-in animáció', tog_fadein_sub: 'Indításkor és frissítéskor',
    tog_glow: 'Ragyogás effekt', tog_glow_sub: 'Finom fény a szöveg körül',
    btn_apply_style: 'Stílus alkalmazása',
    page_widgets: 'Widgetek kezelése', page_widgets_sub: 'Aktiválja, deaktiválja és konfigurálja a tükrön megjelenő modulokat.',
    wdesc_clock: 'Valós idejű óra és dátum. Másodpercenként frissül.',
    wdesc_weather: '5 napos előrejelzés, jelenlegi hőmérséklet, szél.',
    wdesc_calendar: 'A Google Naptár eseményeit jeleníti meg.',
    wdesc_ticker: 'Görgetősáv RSS hírekhez vagy egyéni szöveghez.',
    wdesc_greeting: 'Egyéni szöveg a tükör közepén.',
    wdesc_sysinfo: 'CPU, RAM, processzor hőmérséklete.',
    badge_active: 'Aktív', badge_inactive: 'Inaktív',
    btn_configure: 'Konfigurálás', btn_activate: 'Aktiválás',
    page_weather: 'Időjárás beállítások', page_weather_sub: 'Állítsa be a helyszínt és az időjárás-előrejelzés megjelenítési módját.',
    card_location: 'Helyszín & beállítások', lbl_city: 'A városod', lbl_country: 'Országkód (ISO)',
    lbl_tempunit: 'Hőmérséklet egység', opt_celsius: 'Celsius (°C)', opt_fahrenheit: 'Fahrenheit (°F)',
    lbl_forecastdays: 'Megjelenített előrejelzési napok', opt_3days: '3 nap', opt_5days: '5 nap', opt_7days: '7 nap',
    tog_wind: 'Szél megjelenítése', tog_humidity: 'Páratartalom megjelenítése', tog_autoupdate: 'Automatikus frissítés (15 perc)',
    btn_apply_weather: 'Időjárás beállítások alkalmazása', btn_refresh_weather: 'Előnézet frissítése',
    page_news: 'Hírek beállítása', page_news_sub: 'Szabja testre a görgetősáv forrását és tartalmát.',
    card_rss: 'RSS-források', lbl_rss_main: 'Elsődleges RSS-hírcsatorna', lbl_rss_secondary: 'Másodlagos RSS-hírcsatorna (nem kötelező)',
    lbl_news_cat: 'Hírkategória', opt_all: 'Mind', opt_politics: 'Politika', opt_sport: 'Sport',
    opt_tech: 'Tech', opt_economy: 'Gazdaság',
    lbl_ticker_speed: 'Ticker sebessége', opt_slow: 'Lassú', opt_normal: 'Normál', opt_fast: 'Gyors',
    card_ticker_manual: 'Manuális ticker (RSS helyett)', lbl_ticker_custom: 'Egyéni szöveg a sávhoz',
    btn_apply_ticker: 'Ticker alkalmazása a tükörre', btn_clear: 'Törlés',
    page_calendar: 'Naptár & Üzenet', page_calendar_sub: 'Konfigurálja a Google Naptárt és a tükrön megjelenő személyes üzenetet.',
    card_cal_settings: 'Naptár beállítások', cal_device_sub: 'Konfigurálja a CalDAV URL-t vagy a Google integrációt',
    badge_notconnected: 'Nincs csatlakozva', lbl_cal_url: 'Naptár URL (iCal / CalDAV)',
    lbl_events_shown: 'Megjelenített események', lbl_cal_range: 'Időtartomány',
    opt_today: 'Ma', opt_today_tomorrow: 'Ma + Holnap', opt_this_week: 'Ezen a héten',
    btn_save_calendar: 'Naptár mentése', card_greeting: 'Üdvözlő üzenet',
    lbl_greeting: 'A tükör közepén megjelenő üzenet',
    tog_timegreet: 'Időalapú üdvözlet', tog_timegreet_sub: 'Reggel / Napközben / Este',
    tog_username: 'Felhasználónév megjelenítése', tog_username_sub: 'Arcfelismerés szükséges',
    btn_apply_greeting: 'Üzenet alkalmazása',
    page_network: 'Hálózat & Kapcsolat', page_network_sub: 'Wi-Fi kapcsolat és az okostükörhöz csatlakozó eszközök kezelése.',
    card_server: 'Webszerver — Raspberry Pi 4', card_devices: 'Csatlakoztatott eszközök',
    card_wifi: 'Tükör Wi-Fi beállítások', lbl_ssid: 'Hálózat neve (SSID)', lbl_wifipass: 'Wi-Fi jelszó',
    btn_save_wifi: 'Mentés & Wi-Fi alkalmazása',
    page_settings: 'Alkalmazás beállítások', page_settings_sub: 'Globális konfiguráció az IntelliGlass-hoz, az okostükörhöz és a külső integrációkhoz.',
    card_lang: 'Nyelv & Régió', lbl_lang: 'Felület nyelve', lbl_dateformat: 'Tükör dátumformátuma',
    lbl_timeformat: 'Időformátum', lbl_timezone: 'Időzóna', btn_save_lang: 'Nyelv & Régió mentése',
    card_apikeys: 'API-kulcsok', lbl_owm: 'OpenWeatherMap API-kulcs', lbl_gcal: 'Google Naptár API-kulcs',
    lbl_newsapi: 'NewsAPI-kulcs (nem kötelező)', btn_save_apikeys: 'API-kulcsok mentése',
    card_security: 'Biztonság & Hozzáférés', tog_password: 'Webes felület jelszava',
    tog_password_sub: 'Védi a vezérlőpultot', tog_localonly: 'Csak helyi hálózat',
    tog_localonly_sub: 'Blokkolja az internetről való hozzáférést', tog_log: 'Tevékenységnapló',
    tog_log_sub: 'Elmenti a felhasználói műveleteket a tükrön', tog_autoupdate2: 'Automatikus frissítések',
    tog_autoupdate2_sub: 'MagicMirror² frissítés', card_system: 'RPi4 rendszervezérlés',
    btn_restart_mm: 'MM² újraindítása', btn_reboot: 'RPi újraindítása', btn_shutdown: 'RPi leállítása',
    btn_factory_reset: 'Gyári visszaállítás', card_about: 'Az IntelliGlass-ról',
    sub_rpi4: 'Raspberry Pi 4',
    wname_clock: 'Digitális óra',
    wname_weather: 'Időjárás',
    wname_calendar: 'Google Naptár',
    wname_ticker: 'Hírek tickere',
    wname_greeting: 'Üdvözlő üzenet',
    wname_sysinfo: 'RPi Statisztikák',
    info_weather_api: 'Az időjárási adatok az OpenWeatherMap API-n keresztül kerülnek lekérésre. API-kulcsot a Beállítások → API Keys menüpontban adja meg.',
    info_network_hint: 'Csatlakozzon ugyanazon Wi-Fi hálózaton bármely böngészőből a következő címen:',
    info_wifi_warning: 'A Wi-Fi adatok módosítása újraindítja a wireless modult. Ellenőrizze az adatokat mentés előtt.',
    info_apikeys: 'Az API-kulcsok titkosítva tárolódnak a Raspberry Pi-n és nem kerülnek hálózati átvitelre.',
    about_version: 'Verzió',
    about_hardware: 'Hardver',
    about_framework: 'Tükör keretrendszer',
    about_project: 'Projekt',
    about_protocol: 'Kommunikációs protokoll',
    net_ip_label: 'Tükör IP',
    net_port_label: 'Port',
    net_protocol_label: 'Protokoll',
    net_clients_label: 'Aktív kliensek',
    net_no_devices: 'Nincs csatlakoztatott eszköz. Csatlakoztassa a tükröt az aktív kliensek megtekintéséhez.',
    suggest1: 'Üdvözlöm otthon!',
    suggest2: 'Szép napot!',
    suggest3: 'Have a great day!',
    toast_applied: '✓ Változások elküldve a tükörnek!', toast_reload: '↺ Tükör újratölt...',
    toast_lang: '✓ Nyelv megváltoztatva!', toast_wifi: '📶 Wi-Fi konfiguráció elküldve RPi-nek!',
    toast_widget_active: '✓ Widget aktiválva!', confirm_reset: 'Biztosan vissza szeretné állítani a tükröt a gyári beállításokra? Minden konfiguráció törlődik.',
  }
};

let currentLang = 'en';

/* Aplică traducerile pe toate elementele cu data-i18 */
function applyTranslations(lang) {
  const t = translations[lang] || translations.ro;
  document.querySelectorAll('[data-i18n]').forEach(function(el) {
    const key = el.getAttribute('data-i18n');
    if (t[key] !== undefined) {
      el.textContent = t[key];
    }
  });
  document.querySelectorAll('[data-i18n-prefix]').forEach(function(el) {
    const key = el.getAttribute('data-i18n-prefix');
    if (t[key] !== undefined) {
      const span = el.querySelector('span');
      const val = span ? span.textContent : '';
      el.textContent = t[key] + ' — ';
      if (span) {
        const newSpan = document.createElement('span');
        newSpan.id = span.id;
        newSpan.textContent = val;
        el.appendChild(newSpan);
      }
    }
  });
  document.title = 'IntelliGlass — ' + (lang === 'ro' ? 'Control Oglindă Smart' : lang === 'en' ? 'Smart Mirror Control' : lang === 'de' ? 'Smart-Spiegel Steuerung' : 'Okostükör Vezérlés');
  document.documentElement.setAttribute('lang', lang);
}

/* LANGUAGE */
function changeLang(lang) {
  const allowedLangs = ['ro', 'en', 'de', 'hu'];
  if (!allowedLangs.includes(lang)) return;
  currentLang = lang;

  ['set-lang'].forEach(function(id) {
    const el = document.getElementById(id);
    if (el) el.value = lang;
  });
  document.querySelectorAll('.lang-select').forEach(function(el) { el.value = lang; });

  applyTranslations(lang);

  const t = translations[lang];
  setText('conn-label', state.connected ? t.conn_connected : t.conn_disconnected);
  if (state.connected) {
    document.getElementById('conn-label').style.color = 'var(--success)';
  }

  sendCommand({ type: 'set_language', lang });
  showToast(t.toast_lang);
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
  icon.textContent = isErr ? '⚠' : '✓';
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function() { t.classList.remove('show'); }, 3000);
}

applyTranslations('en');