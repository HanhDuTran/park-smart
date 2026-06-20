# ParkSmart

A voice-first AI parking navigation web app. Day 1 delivers a production-quality
fullscreen dark map with real, live parking data (street parking + parking
lots) pulled from OpenStreetMap and Google Places.

## Tech stack

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS + Mapbox GL JS + Framer Motion
- **Backend**: FastAPI (Python 3.11) + httpx
- **Data**: OpenStreetMap Overpass API (street parking + lots) and Google Places API (lots)

## 1. Prerequisites

- [Node.js](https://nodejs.org/) 18 or newer (includes `npm`)
- [Python](https://www.python.org/downloads/) 3.11
- (Optional) [Docker Desktop](https://www.docker.com/products/docker-desktop/) if you want to run everything with `docker-compose`

## 2. Get your API keys

### Mapbox token (required — the map won't render without this)

1. Go to <https://account.mapbox.com/auth/signup/> and create a free account (or sign in).
2. Open <https://account.mapbox.com/access-tokens/>.
3. Copy your **default public token** (starts with `pk.`).

### Google Places API key (optional — adds parking lots from Google)

1. Go to <https://console.cloud.google.com/> and create a project (or pick an existing one).
2. Go to **APIs & Services → Library**, search for **Places API**, and click **Enable**.
3. Go to **APIs & Services → Credentials → Create Credentials → API key**.
4. Copy the key. (Optional: restrict it to the Places API.)

If you skip this, the app still works — you'll just see OpenStreetMap parking
data (which already includes many lots and on-street parking).

### Anthropic API key (for the voice AI assistant, used in later days)

1. Go to <https://console.anthropic.com/> and sign in.
2. Go to **API Keys → Create Key** and copy it.

## 3. Configure environment variables

From `C:\parkAI`, copy the example env file and fill in your keys:

```powershell
Copy-Item .env.example .env
```

Edit `C:\parkAI\.env`:

```ini
VITE_MAPBOX_TOKEN=pk.your_mapbox_token_here
GOOGLE_PLACES_API_KEY=your_google_places_key_here
ANTHROPIC_API_KEY=your_anthropic_key_here
```

Only `VITE_MAPBOX_TOKEN` is required to get the map running. The other two
can stay blank for now.

## 4. Run it

### Option A — Docker Compose (one command, recommended)

```powershell
cd C:\parkAI
docker-compose up --build
```

- Frontend: <http://localhost:5173>
- Backend: <http://localhost:8000> (docs at <http://localhost:8000/docs>)

Both services hot-reload on file changes. Stop with `Ctrl+C`, then
`docker-compose down` to remove the containers.

### Option B — Run locally without Docker

**Terminal 1 — backend:**

```powershell
cd C:\parkAI\backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

> If PowerShell blocks the activation script with an execution-policy error,
> run this once in that PowerShell window first:
> `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`

**Terminal 2 — frontend:**

```powershell
cd C:\parkAI\frontend
npm install
npm run dev
```

Then open <http://localhost:5173> in your browser.

## 5. Using the app

- Your browser will ask for **location permission** — allow it to see parking
  near you. If you deny it (or geolocation is unavailable), the app falls
  back to San Francisco.
- Nearby parking spots load automatically: blue glowing dots are street
  parking, green rounded squares are parking lots. The closest spot pulses.
- Click a spot (marker, sidebar card, or bottom sheet on mobile) to fly the
  camera to it and see details + rules.
- The **Navigate** button opens turn-by-turn directions to that spot in
  Google Maps.

## API reference

- `GET /health` — health check, returns `{"status": "ok"}`
- `GET /api/parking?lat={lat}&lng={lng}&radius={meters}` — returns nearby
  parking spots merged from OSM + Google Places. `radius` defaults to `1000`
  (meters), max `5000`.

## Project structure

```
/parkAI
  /frontend        React + TypeScript + Vite + Tailwind + Mapbox GL
    /src
      /components  Map, markers, sidebar, bottom sheet, top bar, loading screen
      /hooks       useUserLocation, useParkingData, useMapbox
      /types       Shared TypeScript types
      /utils       Distance + rules formatting helpers
      /styles      Tailwind + global styles
  /backend         FastAPI app
    /app
      /routes      /api/parking endpoint
      /services    Overpass + Google Places integrations
      /models      Pydantic response models
  docker-compose.yml
  .env.example
```

## Troubleshooting

- **Blank/gray map**: `VITE_MAPBOX_TOKEN` is missing or invalid. Check
  `C:\parkAI\.env`, then restart the frontend dev server (Vite only reads
  `.env` on startup).
- **No parking spots show up**: the Overpass API (`overpass-api.de`) is a
  shared public service and can be slow or rate-limited at times — try again
  after a few seconds, or check the backend terminal for warnings.
- **CORS errors in the browser console**: make sure the backend is running on
  port `8000` — the API URL defaults to `http://localhost:8000` and the
  backend only allows requests from `http://localhost:5173`.
