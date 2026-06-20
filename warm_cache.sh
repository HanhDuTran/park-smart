#!/bin/bash
echo "Warming ParkSmart cache for demo..."
curl -sf http://localhost:8000/health > /dev/null || { echo "Backend not running!"; exit 1; }
curl -sf "http://localhost:8000/api/parking?lat=37.7749&lng=-122.4194&radius=1000" > /dev/null && echo "Parking cache (SF): OK"
curl -sf "http://localhost:8000/api/parking?lat=37.8716&lng=-122.2727&radius=1000" > /dev/null && echo "Parking cache (Berkeley): OK"
curl -sf "http://localhost:8000/api/search?query=Ferry+Building&session_token=warmup&lat=37.7749&lng=-122.4194" > /dev/null && echo "Search: OK"
curl -sf "http://localhost:8000/api/route?start_lat=37.7749&start_lng=-122.4194&end_lat=37.7956&end_lng=-122.3933" > /dev/null && echo "Route: OK"
echo "Ready! Open: http://localhost:5173/?demo=1"
