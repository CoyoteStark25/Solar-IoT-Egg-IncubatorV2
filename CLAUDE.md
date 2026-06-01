# IoT Egg Incubator Monitor — Claude Context

## Project overview

A static web dashboard that displays live sensor readings from an ESP32 + AM2302 (DHT22) setup. The ESP32 writes to Firebase Realtime Database every 15 seconds; the web app subscribes with a real-time listener and renders the data.

No build step, no framework, no server — open `index.html` via a local HTTP server.

## File structure

```
index.html   — markup only (no inline CSS or JS)
styles.css   — all styling, CSS custom properties, responsive breakpoints
app.js       — Firebase listener, Chart.js instances, DOM updates (ES module)
```

## Tech stack

| Concern     | Library / version                          |
|-------------|--------------------------------------------|
| Realtime DB | Firebase JS SDK v10.12.0 (modular, CDN)    |
| Charts      | Chart.js v4.4.4 (UMD, CDN)                |
| Language    | Vanilla JS (ES modules), HTML5, CSS3       |

## Firebase

- **Project:** `iot-egg-incubator-monitor`
- **Database URL:** `https://iot-egg-incubator-monitor-default-rtdb.europe-west1.firebasedatabase.app`
- **Data path:** `/readings`
- **Auth:** test mode — no API key or auth token required
- **Query:** `orderByKey() + limitToLast(50)` — last 50 readings, sorted chronologically

## Data schema

Each reading is pushed by the ESP32 under `/readings/{pushKey}`:

```json
{
  "temperature_c": 32.6,
  "humidity": 99.9,
  "heat_index_c": 57.35,
  "timestamp": 204256
}
```

> `timestamp` is **milliseconds since ESP32 boot**, not a Unix timestamp. It is used for chart X-axis labels (formatted as elapsed boot time, e.g. "3m 24s"). Firebase push keys are used for chronological ordering because they are lexicographically time-ordered.

## Key design decisions

- **No polling.** `onValue` on `/readings` gives a real-time push listener. `.info/connected` drives the Live/Disconnected badge separately.
- **Two charts, not one.** Temperature and Heat Index share a chart (same °C scale). Humidity has its own chart (% scale) to avoid a dual-axis layout.
- **Min/max range** shown in each card footer is derived from the current 50-reading window, not the full database history.
- **`app.js` must be served over HTTP** — ES module `import` statements are blocked on `file://`. Use `npx serve .` or VS Code Live Server.

## Running locally

```bash
npx serve .
# then open http://localhost:3000
```

## What to change

| Task | Where |
|------|-------|
| Change reading limit (50) | `app.js` — `limitToLast(50)` |
| Change refresh-label interval (15 s) | `app.js` — `setInterval(..., 15000)` |
| Change chart height | `styles.css` — `.chart-wrap { height }` |
| Add a new metric card | `index.html` + `app.js` (add dataset + DOM update) |
| Point to a different Firebase project | `app.js` — `databaseURL` in `initializeApp` |
