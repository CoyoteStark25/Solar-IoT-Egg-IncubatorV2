# IoT Egg Incubator Monitor

A real-time web dashboard for monitoring temperature, humidity, and heat index inside an egg incubator. Sensor data is collected by an ESP32 microcontroller and streamed live to the browser via Firebase Realtime Database.

## Features

- **Live readings** — temperature, humidity, and heat index cards that update in real time via Firebase's push listener (no polling)
- **Historical charts** — temperature & heat index on one chart, humidity on a separate chart; both plotted against elapsed time since ESP32 boot
- **Min / max range** — each card shows the range across the last 50 readings
- **Connection status** — live/disconnected badge driven by Firebase's `.info/connected`
- **Responsive** — works on desktop, tablet, and mobile

## Hardware

| Component | Detail |
|-----------|--------|
| Microcontroller | ESP32 |
| Sensor | AM2302 (DHT22) — temperature + humidity |
| Backend | Firebase Realtime Database (europe-west1) |
| Push interval | Every 15 seconds |

## Project structure

```
index.html   — page markup
styles.css   — styles and responsive layout
app.js       — Firebase + Chart.js logic (ES module)
```

## Running the dashboard

The app is a plain static site with no build step. Because `app.js` uses ES module imports it must be served over HTTP, not opened directly as a `file://` URL.

**Option 1 — Node `serve` (recommended)**
```bash
npx serve .
```
Then open `http://localhost:3000` in a browser.

**Option 2 — VS Code Live Server**
Install the [Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) extension, right-click `index.html`, and choose **Open with Live Server**.

**Option 3 — Python**
```bash
python -m http.server 8000
```
Then open `http://localhost:8000`.

## Firebase data format

The ESP32 pushes readings to `/readings/{autoKey}`:

```json
{
  "temperature_c": 32.6,
  "humidity": 99.9,
  "heat_index_c": 57.35,
  "timestamp": 204256
}
```

`timestamp` is milliseconds since the ESP32 last booted — not a Unix timestamp. The dashboard uses it to label the chart X-axis as elapsed time (e.g. "3m 24s").

## Dependencies (CDN, no install needed)

| Library | Version | Purpose |
|---------|---------|---------|
| Firebase JS SDK | 10.12.0 | Realtime Database listener |
| Chart.js | 4.4.4 | Line charts |
