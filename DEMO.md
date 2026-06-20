# ParkSmart — Demo Script (Sunday Presentation)

**Works in both Berkeley and San Francisco.** Demo mode (`?demo=1`) trusts real
GPS whenever it lands in either city's coverage area, so judges in the room
see their actual position; if GPS is unavailable, denied, or resolves
somewhere outside both cities, it falls back to a fixed Downtown Berkeley
location (the venue) rather than guessing.

## Before Judges Arrive (2 minutes before)

1. Start backend: `cd C:\parkAI\backend && python -m uvicorn app.main:app --port 8000`
2. Start frontend: `cd C:\parkAI\frontend && npm run dev`
3. Run: `C:\parkAI\warm_cache.ps1` (warms Overpass cache for both Berkeley and SF — takes ~15-20 seconds)
4. Open in browser: `http://localhost:5173/?demo=1`
5. Confirm you see the map with parking markers and "🎯 Demo Mode" badge — centered on Berkeley if you're at the venue, or SF if GPS puts you there

## Demo Flow (~3-4 minutes)

### Step 1 — The Map (30 seconds)
**Say:** "ParkSmart is like Waze, but for finding street parking. Instead of showing accidents, it shows you real available parking spots."
**Show:** The map with 333 parking markers (blue circles = street, green squares = lots)
**Point out:** "This is real OpenStreetMap data, not Google — we're showing street-by-street parking availability"

### Step 2 — Search (30 seconds)
**Say:** "You can search for any destination, business, or address — just like Google Maps"
**Do:** Type "Ferry Building" in the search bar
**Show:** Autocomplete dropdown appears with real results
**Do:** Click the first result
**Show:** Map flies to Ferry Building area, parking spots update for that neighborhood
**Say:** "The parking data automatically updates to show spots near your destination"

### Step 3 — Spot Details + Crowdsourcing (45 seconds)
**Do:** Click any blue street parking marker
**Show:** BottomSheet slides up with spot info (distance, fee, rules, Est. badge if applicable)
**Say:** "Each spot shows parking rules extracted from OpenStreetMap — time limits, fees, restrictions"
**Point out:** "For estimated spots, we calculate available spaces from the road's actual length — like fitting 6.5m per car"
**Show:** "I parked here" and "I'm leaving" buttons
**Say:** "This is crowdsourced like Waze — users report when they take or leave a spot, updating availability in real time"

### Step 4 — Navigation (30 seconds)
**Do:** Tap "Navigate" button
**Show:** Glowing blue route line appears on map, NavigationPanel slides up with ETA and first instruction
**Say:** "Built-in turn-by-turn navigation using Mapbox Directions — no leaving the app"
**Do:** Tap "Cancel navigation"

### Step 5 — Voice AI (60 seconds — the wow moment)
**Say:** "But the real differentiator is hands-free Voice AI — you can find parking while driving without touching your phone"
**Do:** Tap the mic button (bottom right)
**Say out loud:** "Find me free parking near the Ferry Building"
**Show:** The app transcribes your voice, sends to Claude AI, Claude searches parking spots using real tools, responds with a spoken reply AND updates the map
**Say:** "Claude isn't just generating text — it's actually calling our parking search API, then our routing API, in real time"
**Do:** After response, tap mic again
**Say out loud:** "Navigate to the closest one"
**Show:** NavigationPanel launches automatically from a voice command
**Say:** "The AI controls the full app — the same as if you'd tapped the buttons manually"

### Step 6 — Technical Depth (for judges who ask)
**Architecture talking points:**
- "333 parking spots from OpenStreetMap + road geometry estimation — vs Google Maps' 5-10 lot results"
- "Claude Sonnet 4.6 with real tool use — find_parking_spots, get_directions, check_spot_status — calling our actual FastAPI backend"
- "Crowdsourced availability same mechanism as Waze accident reports — in-memory status store with 60-second auto-confirm"

## Fallback Plans

| Problem | Fix |
|---|---|
| Overpass slow/429 | "Cache was pre-warmed 2 minutes ago — this is showing real OSM data from our cache" |
| Voice assistant slow | "Claude is doing a real parking search across 333 spots — takes 2-3 seconds" |
| GPS wrong location | Demo mode trusts real GPS only inside Berkeley/SF; anywhere else it falls back to fixed Downtown Berkeley — should not happen |
| No microphone | Type query in search bar instead — same result, shows the search feature |
| Markers not showing | Pre-warm cache: run warm_cache.ps1, refresh page |
| NavigationPanel frozen | Click Cancel, re-select the spot, tap Navigate again |

## Starting Commands (copy-paste ready)
```powershell
# Terminal 1 — Backend
cd C:\parkAI\backend
python -m uvicorn app.main:app --port 8000

# Terminal 2 — Frontend  
cd C:\parkAI\frontend
npm run dev

# Terminal 3 — Warm cache (run 2 min before judges)
C:\parkAI\warm_cache.ps1
```

**Demo URL:** `http://localhost:5173/?demo=1`
