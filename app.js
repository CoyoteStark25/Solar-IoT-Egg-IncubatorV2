import { initializeApp }
    from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getDatabase, ref, query, orderByKey, limitToLast, onValue }
    from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';

// ── Firebase ──────────────────────────────────────────────
const db = getDatabase(initializeApp({
    databaseURL: 'https://iot-egg-incubator-monitor-default-rtdb.europe-west1.firebasedatabase.app'
}));

// ── Target ranges — adjust to your incubation requirements ─
// scaleMin/scaleMax = range shown on the bar
// lo/hi = target band (green zone)
const TARGETS = {
    temp: { scaleMin: 20, scaleMax: 45,  lo: 37.0, hi: 38.0, unit: '°C', label: 'target 37–38°'  },
    hum:  { scaleMin: 20, scaleMax: 100, lo: 50,   hi: 65,   unit: '%',  label: 'target 50–65%'  },
    hi:   { scaleMin: 20, scaleMax: 65,  lo: 37,   hi: 42,   unit: '°C', label: 'comfort 37–42°' }
};

// ── Chart colours per theme (canvas cannot read oklch vars) ─
const PALETTE = {
    light: {
        temp: '#be5c38', tempFill: 'rgba(190,92,56,0.09)',
        humid: '#4571ab', humidFill: 'rgba(69,113,171,0.09)',
        heat: '#b8922c',
        safeFill: 'rgba(55,148,95,0.13)', safeLine: 'rgba(55,148,95,0.40)',
        grid: '#e8ddd3', text: '#9a8a7a',
        card: '#fefdf9',
        ttBg: '#fefdf9', ttTitle: '#3d2f20', ttBody: '#7a6d60', ttBorder: '#e5dbd0'
    },
    dark: {
        temp: '#d4784c', tempFill: 'rgba(212,120,76,0.13)',
        humid: '#5a8ec8', humidFill: 'rgba(90,142,200,0.13)',
        heat: '#d4a84c',
        safeFill: 'rgba(84,180,120,0.15)', safeLine: 'rgba(84,180,120,0.40)',
        grid: '#3a332a', text: '#7a6d62',
        card: '#2d2620',
        ttBg: '#2d2620', ttTitle: '#e8d8c0', ttBody: '#9a8a7a', ttBorder: '#4a4038'
    }
};

function theme() { return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'; }
function pal()   { return PALETTE[theme()]; }

// ── Dark-mode toggle ──────────────────────────────────────
const root = document.documentElement;
const saved = localStorage.getItem('inc-theme');
if (saved) root.dataset.theme = saved;

document.getElementById('themeBtn').addEventListener('click', () => {
    const next = theme() === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    localStorage.setItem('inc-theme', next);
    refreshChartColors();
});

// ── DOM refs ──────────────────────────────────────────────
const devicePill  = document.getElementById('devicePill');
const deviceLabel = document.getElementById('deviceLabel');
const stripDot    = document.getElementById('stripDot');
const stripConn   = document.getElementById('stripConn');
const stripUptime = document.getElementById('stripUptime');
const stripSynced = document.getElementById('stripSynced');
const lastSeen    = document.getElementById('lastSeen');

// ── Connection state ──────────────────────────────────────
onValue(ref(db, '.info/connected'), snap => {
    const live = snap.val() === true;
    stripDot.className    = 'chip-dot' + (live ? '' : ' off');
    stripConn.textContent = live ? 'Firebase connected' : 'Disconnected';
});

// ── Time helpers ──────────────────────────────────────────
let lastReceived = null;
let latestDeviceTs = null;

function fmtTime(unixSec) {
    if (!unixSec) return '—';
    return new Date(unixSec * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

function wallAgo(ts) {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 10) return 'just now';
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    return `${Math.floor(m / 60)}h ${m % 60}m ago`;
}

function updateDeviceBadge() {
    if (latestDeviceTs == null) return;
    const ageSec = (Date.now() / 1000) - latestDeviceTs;
    const online = ageSec <= 900;
    devicePill.className      = 'live-pill' + (online ? '' : ' off');
    deviceLabel.textContent   = online ? 'Online' : 'Offline';
}

setInterval(() => {
    if (!lastReceived) return;
    const a = wallAgo(lastReceived);
    lastSeen.textContent    = `Updated ${a}`;
    stripSynced.textContent = `Synced ${a}`;
}, 15000);

setInterval(updateDeviceBadge, 30000);

// ── Range bar updater ─────────────────────────────────────
function pct(v, min, max) { return Math.min(100, Math.max(0, (v - min) / (max - min) * 100)); }

function updateRangeBar(key, value, minObs, maxObs) {
    const t = TARGETS[key];
    const unitChar = t.unit === '°C' ? '°' : t.unit;
    const inRange  = value >= t.lo && value <= t.hi;

    document.getElementById(`band-${key}`).style.cssText =
        `left:${pct(t.lo, t.scaleMin, t.scaleMax)}%;right:${100 - pct(t.hi, t.scaleMin, t.scaleMax)}%`;
    document.getElementById(`marker-${key}`).style.left =
        `${pct(value, t.scaleMin, t.scaleMax)}%`;

    document.getElementById(`rscale-min-${key}`).textContent = t.scaleMin + unitChar;
    document.getElementById(`rscale-tgt-${key}`).textContent = t.label;
    document.getElementById(`rscale-max-${key}`).textContent = t.scaleMax + unitChar;

    const pill = document.getElementById(`status-${key}`);
    pill.className = 'status-pill' + (inRange ? '' : ' out');
    pill.querySelector('span:last-child').textContent = inRange ? 'In range' : 'Out of range';

    document.getElementById(`minmax-${key}`).innerHTML =
        `Range <b>${minObs.toFixed(1)}</b>&thinsp;–&thinsp;<b>${maxObs.toFixed(1)} ${t.unit}</b>`;
}

// ── Target band plugin ────────────────────────────────────
Chart.register({
    id: 'targetBand',
    beforeDatasetsDraw(chart, _, opts) {
        const { lo, hi } = opts;
        if (lo == null) return;
        const { ctx, chartArea: { left, right }, scales: { y } } = chart;
        const p = pal();
        const yTop = y.getPixelForValue(hi);
        const yBot = y.getPixelForValue(lo);
        ctx.save();
        ctx.fillStyle = p.safeFill;
        ctx.fillRect(left, yTop, right - left, yBot - yTop);
        ctx.strokeStyle = p.safeLine;
        ctx.setLineDash([3, 5]);
        ctx.lineWidth = 1;
        [yTop, yBot].forEach(y => {
            ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
        });
        ctx.restore();
    }
});

// ── Chart factory ─────────────────────────────────────────
function sharedOptions(targetLo, targetHi, yLabel) {
    const p = pal();
    return {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 400, easing: 'easeInOutQuart' },
        interaction: { mode: 'index', intersect: false },
        plugins: {
            legend: { display: false },
            targetBand: { lo: targetLo, hi: targetHi },
            tooltip: {
                backgroundColor: p.ttBg,
                titleColor: p.ttTitle,
                bodyColor: p.ttBody,
                borderColor: p.ttBorder,
                borderWidth: 1, padding: 12, boxPadding: 4,
                callbacks: { title: items => items[0].label }
            }
        },
        scales: {
            x: {
                grid: { color: p.grid },
                ticks: { color: p.text, font: { family: 'Hanken Grotesque, system-ui', size: 11 }, maxTicksLimit: 10, maxRotation: 0 },
                border: { color: p.grid }
            },
            y: {
                grid: { color: p.grid },
                ticks: { color: p.text, font: { family: 'Hanken Grotesque, system-ui', size: 11 }, padding: 6 },
                title: { display: true, text: yLabel, color: p.text, font: { size: 11 } },
                border: { color: p.grid }
            }
        }
    };
}

function makeDatasets() {
    const p = pal();
    return {
        temp: [
            {
                label: 'Temperature (°C)', data: [],
                borderColor: p.temp, backgroundColor: p.tempFill,
                borderWidth: 2.6, tension: 0.3, fill: true,
                pointRadius: [], pointHoverRadius: 6,
                pointBackgroundColor: p.card, pointBorderColor: p.temp, pointBorderWidth: 2
            },
            {
                label: 'Heat Index (°C)', data: [],
                borderColor: p.heat, backgroundColor: 'transparent',
                borderWidth: 2.2, borderDash: [6, 5], tension: 0.3, fill: false,
                pointRadius: [], pointHoverRadius: 6,
                pointBackgroundColor: p.card, pointBorderColor: p.heat, pointBorderWidth: 2
            }
        ],
        hum: [
            {
                label: 'Humidity (%)', data: [],
                borderColor: p.humid, backgroundColor: p.humidFill,
                borderWidth: 2.6, tension: 0.3, fill: true,
                pointRadius: [], pointHoverRadius: 6,
                pointBackgroundColor: p.card, pointBorderColor: p.humid, pointBorderWidth: 2
            }
        ]
    };
}

const tempChart = new Chart(
    document.getElementById('tempChart').getContext('2d'),
    { type: 'line', data: { labels: [], datasets: makeDatasets().temp }, options: sharedOptions(TARGETS.temp.lo, TARGETS.temp.hi, '°C') }
);
const humChart = new Chart(
    document.getElementById('humChart').getContext('2d'),
    { type: 'line', data: { labels: [], datasets: makeDatasets().hum  }, options: sharedOptions(TARGETS.hum.lo,  TARGETS.hum.hi,  '%') }
);

// ── Refresh chart colours on theme change ─────────────────
function refreshChartColors() {
    const p = pal();
    const ds = makeDatasets();

    [tempChart, humChart].forEach((ch, ci) => {
        const src = ci === 0 ? ds.temp : ds.hum;
        ch.data.datasets.forEach((d, di) => {
            Object.assign(d, {
                borderColor: src[di].borderColor,
                backgroundColor: src[di].backgroundColor,
                pointBackgroundColor: p.card,
                pointBorderColor: src[di].pointBorderColor
            });
        });
        const sc = ch.options.scales;
        sc.x.grid.color = sc.x.border.color = p.grid;
        sc.x.ticks.color = p.text;
        sc.y.grid.color = sc.y.border.color = p.grid;
        sc.y.ticks.color = sc.y.title.color = p.text;
        const tt = ch.options.plugins.tooltip;
        Object.assign(tt, { backgroundColor: p.ttBg, titleColor: p.ttTitle, bodyColor: p.ttBody, borderColor: p.ttBorder });
        ch.update();
    });
}

// ── Sparse point radii ────────────────────────────────────
function sparseRadii(n) {
    return Array.from({ length: n }, (_, i) =>
        i === n - 1 ? 5 : i % 5 === 0 ? 3.2 : 0
    );
}

// ── Readings listener ─────────────────────────────────────
onValue(
    query(ref(db, '/readings'), orderByKey(), limitToLast(50)),
    snap => {
        const raw = snap.val();
        if (!raw) return;

        document.getElementById('emptyTemp').style.display = 'none';
        document.getElementById('emptyHum').style.display  = 'none';

        const entries  = Object.entries(raw).sort(([a], [b]) => a < b ? -1 : 1);
        const readings = entries.map(([, v]) => v);
        const latest   = readings[readings.length - 1];
        const n        = readings.length;

        const labels = readings.map(r => fmtTime(r.last_update));
        const temps  = readings.map(r => r.temperature_c);
        const hums   = readings.map(r => r.humidity);
        const his    = readings.map(r => r.heat_index_c);
        const radii  = sparseRadii(n);

        // Cards
        document.getElementById('val-temp').textContent = latest.temperature_c.toFixed(1);
        document.getElementById('val-hum').textContent  = latest.humidity.toFixed(1);
        document.getElementById('val-hi').textContent   = latest.heat_index_c.toFixed(1);

        // Range bars
        updateRangeBar('temp', latest.temperature_c, Math.min(...temps), Math.max(...temps));
        updateRangeBar('hum',  latest.humidity,      Math.min(...hums),  Math.max(...hums));
        updateRangeBar('hi',   latest.heat_index_c,  Math.min(...his),   Math.max(...his));

        // Status strip timestamps
        lastReceived   = Date.now();
        latestDeviceTs = latest.last_update;
        const a = wallAgo(lastReceived);
        lastSeen.textContent    = `Updated ${a}`;
        stripSynced.textContent = `Synced ${a}`;
        stripUptime.textContent = fmtTime(latest.last_update);
        updateDeviceBadge();

        // Temp + Heat Index chart
        tempChart.data.labels = labels;
        tempChart.data.datasets[0].data        = temps;
        tempChart.data.datasets[0].pointRadius = radii;
        tempChart.data.datasets[1].data        = his;
        tempChart.data.datasets[1].pointRadius = radii;
        tempChart.update();

        // Humidity chart
        humChart.data.labels = labels;
        humChart.data.datasets[0].data        = hums;
        humChart.data.datasets[0].pointRadius = radii;
        humChart.update();
    }
);
