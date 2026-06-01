import { initializeApp }
    from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getDatabase, ref, query, orderByKey, limitToLast, onValue }
    from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';

// ── Firebase ──────────────────────────────────────────────
const db = getDatabase(initializeApp({
    databaseURL: 'https://iot-egg-incubator-monitor-default-rtdb.europe-west1.firebasedatabase.app'
}));

// ── DOM refs ──────────────────────────────────────────────
const statusDot   = document.getElementById('statusDot');
const statusLabel = document.getElementById('statusLabel');
const lastSeen    = document.getElementById('lastSeen');

// ── Connection state ──────────────────────────────────────
onValue(ref(db, '.info/connected'), snap => {
    const live = snap.val() === true;
    statusDot.className     = 'status-dot ' + (live ? 'live' : 'error');
    statusLabel.textContent = live ? 'Live' : 'Disconnected';
});

// ── Time helpers ──────────────────────────────────────────

// Wall-clock: how long ago did we last receive Firebase data
let lastReceived = null;

function wallAgo(ts) {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 10) return 'just now';
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    return `${Math.floor(m / 60)}h ${m % 60}m ago`;
}

// Boot time: format ms-since-boot into "Xm Ys" / "Xh Ym" string
function bootTime(ms) {
    const totalSec = Math.round(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0)  return `${h}h ${m}m`;
    if (m > 0)  return `${m}m ${s}s`;
    return `${s}s`;
}

// Refresh "ago" labels every 15 s between Firebase updates
setInterval(() => {
    if (!lastReceived) return;
    const a = wallAgo(lastReceived);
    lastSeen.textContent = `Updated ${a}`;
    document.querySelectorAll('.card-time').forEach(el => {
        const parts = el.textContent.split(' · ');
        if (parts.length >= 2) el.textContent = `${parts[0]} · ${a}`;
    });
}, 15000);

// ── Shared chart defaults ─────────────────────────────────
function baseOptions(yLabel, yColor) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 400, easing: 'easeInOutQuart' },
        interaction: { mode: 'index', intersect: false },
        plugins: {
            legend: {
                position: 'top',
                align: 'end',
                labels: {
                    usePointStyle: true,
                    pointStyleWidth: 14,
                    padding: 18,
                    color: '#475569',
                    font: { size: 12 }
                }
            },
            tooltip: {
                backgroundColor: '#ffffff',
                titleColor: '#0f172a',
                bodyColor: '#475569',
                borderColor: '#e2e8f0',
                borderWidth: 1,
                padding: 12,
                boxPadding: 4,
                callbacks: { title: items => `${items[0].label} since boot` }
            }
        },
        scales: {
            x: {
                grid: { color: '#f1f5f9' },
                ticks: { color: '#94a3b8', font: { size: 11 }, maxTicksLimit: 10, maxRotation: 0 },
                border: { color: '#e2e8f0' }
            },
            y: {
                grid: { color: '#f1f5f9' },
                ticks: { color: yColor, font: { size: 11 }, padding: 6 },
                title: { display: true, text: yLabel, color: yColor, font: { size: 11 } },
                border: { color: '#e2e8f0' }
            }
        }
    };
}

// ── Temperature & Heat Index chart ────────────────────────
const tempChart = new Chart(
    document.getElementById('tempChart').getContext('2d'),
    {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Temperature (°C)',
                    data: [],
                    borderColor: '#dc2626',
                    backgroundColor: 'rgba(220,38,38,0.07)',
                    borderWidth: 2,
                    pointRadius: 3,
                    pointHoverRadius: 6,
                    pointBackgroundColor: '#dc2626',
                    tension: 0.35,
                    fill: true
                },
                {
                    label: 'Heat Index (°C)',
                    data: [],
                    borderColor: '#d97706',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    borderDash: [5, 4],
                    pointRadius: 3,
                    pointHoverRadius: 6,
                    pointBackgroundColor: '#d97706',
                    tension: 0.35,
                    fill: false
                }
            ]
        },
        options: baseOptions('°C', '#94a3b8')
    }
);

// ── Humidity chart ────────────────────────────────────────
const humChart = new Chart(
    document.getElementById('humChart').getContext('2d'),
    {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Humidity (%)',
                    data: [],
                    borderColor: '#2563eb',
                    backgroundColor: 'rgba(37,99,235,0.07)',
                    borderWidth: 2,
                    pointRadius: 3,
                    pointHoverRadius: 6,
                    pointBackgroundColor: '#2563eb',
                    tension: 0.35,
                    fill: true
                }
            ]
        },
        options: baseOptions('%', '#2563eb')
    }
);

// ── Readings listener ─────────────────────────────────────
onValue(
    query(ref(db, '/readings'), orderByKey(), limitToLast(50)),
    snap => {
        const raw = snap.val();
        if (!raw) return;

        document.getElementById('chartEmptyTemp').style.display = 'none';
        document.getElementById('chartEmptyHum').style.display  = 'none';

        // Sort by Firebase push key (lexicographic = chronological)
        const entries  = Object.entries(raw).sort(([a], [b]) => a < b ? -1 : 1);
        const readings = entries.map(([, v]) => v);
        const latest   = readings[readings.length - 1];

        // Derived arrays
        const labels = readings.map(r => bootTime(r.timestamp));
        const temps  = readings.map(r => r.temperature_c);
        const hums   = readings.map(r => r.humidity);
        const his    = readings.map(r => r.heat_index_c);

        // Update current-reading cards
        document.getElementById('val-temp').textContent = latest.temperature_c.toFixed(1);
        document.getElementById('val-hum').textContent  = latest.humidity.toFixed(1);
        document.getElementById('val-hi').textContent   = latest.heat_index_c.toFixed(1);

        // Min / max range from loaded readings
        const fmt = v => v.toFixed(1);
        document.getElementById('range-temp').innerHTML =
            `<b>${fmt(Math.min(...temps))}</b> – <b>${fmt(Math.max(...temps))}</b> °C`;
        document.getElementById('range-hum').innerHTML  =
            `<b>${fmt(Math.min(...hums))}</b> – <b>${fmt(Math.max(...hums))}</b> %`;
        document.getElementById('range-hi').innerHTML   =
            `<b>${fmt(Math.min(...his))}</b> – <b>${fmt(Math.max(...his))}</b> °C`;

        // Card sub-text: boot time of latest reading + wall-clock age
        lastReceived = Date.now();
        const a       = wallAgo(lastReceived);
        const bootStr = bootTime(latest.timestamp);
        lastSeen.textContent = `Updated ${a}`;
        ['meta-temp', 'meta-hum', 'meta-hi'].forEach(id => {
            document.getElementById(id).textContent = `+${bootStr} since boot · ${a}`;
        });

        // Update temperature & heat index chart
        tempChart.data.labels           = labels;
        tempChart.data.datasets[0].data = temps;
        tempChart.data.datasets[1].data = his;
        tempChart.update();

        // Update humidity chart
        humChart.data.labels           = labels;
        humChart.data.datasets[0].data = hums;
        humChart.update();
    }
);
