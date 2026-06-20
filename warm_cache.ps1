Write-Host "Warming ParkSmart cache for demo..." -ForegroundColor Cyan

# Check backend is running
try {
    $health = Invoke-RestMethod "http://localhost:8000/health" -TimeoutSec 3
    Write-Host "Backend: OK" -ForegroundColor Green
} catch {
    Write-Host "Backend not running! Start it first:" -ForegroundColor Red
    Write-Host "  cd C:\parkAI\backend && python -m uvicorn app.main:app --port 8000" -ForegroundColor Yellow
    exit 1
}

# Warm parking data cache (the big one — hits Overpass) — both demo cities
Write-Host "Warming parking data cache (San Francisco)..." -ForegroundColor Yellow
$r = Invoke-RestMethod "http://localhost:8000/api/parking?lat=37.7749&lng=-122.4194&radius=1000" -TimeoutSec 45
Write-Host "  SF: $($r.count) spots cached" -ForegroundColor Green

Write-Host "Warming parking data cache (Berkeley)..." -ForegroundColor Yellow
$rb = Invoke-RestMethod "http://localhost:8000/api/parking?lat=37.8716&lng=-122.2727&radius=1000" -TimeoutSec 45
Write-Host "  Berkeley: $($rb.count) spots cached" -ForegroundColor Green

# Warm search
Write-Host "Warming search cache..." -ForegroundColor Yellow
$s = Invoke-RestMethod "http://localhost:8000/api/search?query=Ferry+Building&session_token=warmup&lat=37.7749&lng=-122.4194" -TimeoutSec 10
Write-Host "  Search: OK ($($s.suggestions.Count) suggestions for 'Ferry Building')" -ForegroundColor Green

# Warm route
Write-Host "Warming route cache..." -ForegroundColor Yellow
$rt = Invoke-RestMethod "http://localhost:8000/api/route?start_lat=37.7749&start_lng=-122.4194&end_lat=37.7956&end_lng=-122.3933" -TimeoutSec 10
Write-Host "  Route: OK (ETA $([math]::Round($rt.duration_seconds/60, 1)) min)" -ForegroundColor Green

Write-Host ""
Write-Host "Cache warmed! Ready for demo." -ForegroundColor Cyan
Write-Host "Open: http://localhost:5173/?demo=1" -ForegroundColor Cyan
