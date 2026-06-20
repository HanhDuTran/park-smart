import { useEffect, useMemo, useRef } from "react";
import mapboxgl from "mapbox-gl";

import type { AppMode } from "../hooks/useAppMode";
import { useMapbox } from "../hooks/useMapbox";
import type { ParkingSpotWithDistance, UserLocation } from "../types/parking";
import type { RouteData } from "../types/route";
import { LocateButton } from "./LocateButton";
import {
  createParkingMarkerElement,
  createUserLocationElement,
  updateParkingMarkerState,
} from "./ParkingMarker";

export interface SearchTarget {
  lat: number;
  lng: number;
  zoom: number;
  nonce: number; // forces the flyTo effect to re-fire even for a repeat selection
}

interface MapProps {
  location: UserLocation | null;
  spots: ParkingSpotWithDistance[];
  selectedSpotId: string | null;
  onSelectSpot: (id: string) => void;
  route: RouteData | null;
  searchTarget: SearchTarget | null;
  mode: AppMode;
  // The nearest street spot, highlighted + isolated while in Parked mode.
  parkedSpotId: string | null;
}

const DEFAULT_CENTER: [number, number] = [-122.4194, 37.7749];
const SOURCE_ID = "parksmart-route";
const LAYER_GLOW = "parksmart-route-glow";
const LAYER_LINE = "parksmart-route-line";

function addRouteLayers(map: mapboxgl.Map, coordinates: [number, number][]) {
  const geojson: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates },
      },
    ],
  };

  if (map.getSource(SOURCE_ID)) {
    (map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource).setData(geojson);
    return;
  }

  map.addSource(SOURCE_ID, { type: "geojson", data: geojson });

  // Wide dark halo layer — gives the glow effect
  map.addLayer({
    id: LAYER_GLOW,
    type: "line",
    source: SOURCE_ID,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#003a66",
      "line-width": 14,
      "line-opacity": 0.85,
      "line-blur": 4,
    },
  });

  // Bright electric-blue line on top
  map.addLayer({
    id: LAYER_LINE,
    type: "line",
    source: SOURCE_ID,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#00b4ff",
      "line-width": 5,
      "line-opacity": 1,
    },
  });
}

function removeRouteLayers(map: mapboxgl.Map) {
  if (map.getLayer(LAYER_LINE)) map.removeLayer(LAYER_LINE);
  if (map.getLayer(LAYER_GLOW)) map.removeLayer(LAYER_GLOW);
  if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
}

export function MapView({
  location,
  spots,
  selectedSpotId,
  onSelectSpot,
  route,
  searchTarget,
  mode,
  parkedSpotId,
}: MapProps) {
  const { containerRef, map } = useMapbox({
    center: location ? [location.lng, location.lat] : DEFAULT_CENTER,
    zoom: 15,
  });

  const userMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const hasCenteredRef = useRef(false);
  const spotMarkersRef = useRef<Record<string, mapboxgl.Marker>>({});
  const prevModeRef = useRef<AppMode>(mode);

  // Parked mode isolates the one spot the user is presumably parked at;
  // walking mode still shows everything (lots stay prominent, street spots
  // are de-emphasized below, not hidden).
  const visibleSpots = useMemo(
    () => (mode === "parked" ? spots.filter((s) => s.id === parkedSpotId) : spots),
    [mode, spots, parkedSpotId]
  );

  // User location marker + initial camera centering.
  useEffect(() => {
    if (!map || !location) return;

    if (!userMarkerRef.current) {
      const el = createUserLocationElement();
      userMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: "center" })
        .setLngLat([location.lng, location.lat])
        .addTo(map);
    } else {
      userMarkerRef.current.setLngLat([location.lng, location.lat]);
    }

    if (!hasCenteredRef.current) {
      map.jumpTo({ center: [location.lng, location.lat], zoom: 15 });
      hasCenteredRef.current = true;
    }
  }, [map, location]);

  // Parking spot markers.
  useEffect(() => {
    if (!map) return;

    const currentIds = new Set(visibleSpots.map((s) => s.id));
    const markers = spotMarkersRef.current;

    for (const [id, marker] of Object.entries(markers)) {
      if (!currentIds.has(id)) {
        marker.remove();
        delete markers[id];
      }
    }

    for (const spot of visibleSpots) {
      if (markers[spot.id]) continue;

      const el = createParkingMarkerElement(spot, {
        isBest: false,
        isSelected: false,
        liveStatus: spot.live_status,
        estimated: spot.estimated,
        isParked: mode === "parked" && spot.id === parkedSpotId,
        deemphasized: mode === "walking" && spot.type === "street",
        onClick: () => onSelectSpot(spot.id),
      });

      markers[spot.id] = new mapboxgl.Marker({ element: el, anchor: "center" })
        .setLngLat([spot.lng, spot.lat])
        .addTo(map);
    }
  }, [map, visibleSpots, mode, parkedSpotId, onSelectSpot]);

  // Selection + live-status + mode-highlight reconciliation.
  useEffect(() => {
    if (!map) return;
    const bestSpotId = visibleSpots[0]?.id ?? null;

    for (const spot of visibleSpots) {
      const marker = spotMarkersRef.current[spot.id];
      if (!marker) continue;
      updateParkingMarkerState(marker.getElement(), {
        isBest: spot.id === bestSpotId,
        isSelected: spot.id === selectedSpotId,
        liveStatus: spot.live_status,
        isParked: mode === "parked" && spot.id === parkedSpotId,
        deemphasized: mode === "walking" && spot.type === "street",
      });
    }
  }, [map, visibleSpots, selectedSpotId, mode, parkedSpotId]);

  // Fly to a searched location (address/POI/neighborhood selected in TopBar).
  useEffect(() => {
    if (!map || !searchTarget) return;
    map.flyTo({
      center: [searchTarget.lng, searchTarget.lat],
      zoom: searchTarget.zoom,
      duration: 1400,
      essential: true,
    });
  }, [map, searchTarget]);

  // Fly to selected spot (only when not navigating, and not in Parked mode —
  // parked mode owns the camera via the effect below instead).
  useEffect(() => {
    if (!map || !selectedSpotId || route || mode === "parked") return;
    const spot = spots.find((s) => s.id === selectedSpotId);
    if (!spot) return;
    map.flyTo({
      center: [spot.lng, spot.lat],
      zoom: 17,
      pitch: 60,
      duration: 1200,
      essential: true,
    });
  }, [map, selectedSpotId, spots, route, mode]);

  // Parked mode: zoom into the user's own location, flatten to a top-down
  // view. Leaving parked mode restores the normal driving pitch/zoom.
  useEffect(() => {
    if (!map || !location) return;
    const prevMode = prevModeRef.current;

    if (mode === "parked" && prevMode !== "parked") {
      map.flyTo({
        center: [location.lng, location.lat],
        zoom: 18,
        pitch: 0,
        duration: 1200,
        essential: true,
      });
    } else if (mode !== "parked" && prevMode === "parked") {
      map.flyTo({
        center: [location.lng, location.lat],
        zoom: 15,
        pitch: 45,
        duration: 1200,
        essential: true,
      });
    }
    prevModeRef.current = mode;
  }, [map, mode, location]);

  // Route line rendering + fit-bounds camera.
  useEffect(() => {
    if (!map) return;

    if (!route) {
      // Navigation ended — clean up layers when style is ready.
      const cleanup = () => removeRouteLayers(map);
      if (map.isStyleLoaded()) {
        cleanup();
      } else {
        map.once("style.load", cleanup);
      }
      return;
    }

    const coords = route.geometry.coordinates as [number, number][];

    const apply = () => {
      addRouteLayers(map, coords);

      // Fit camera to route bounding box.
      const lngs = coords.map((c) => c[0]);
      const lats = coords.map((c) => c[1]);
      const sw: [number, number] = [Math.min(...lngs), Math.min(...lats)];
      const ne: [number, number] = [Math.max(...lngs), Math.max(...lats)];

      map.fitBounds([sw, ne], {
        padding: { top: 140, bottom: 200, left: 60, right: 60 },
        pitch: 40,
        duration: 1400,
        essential: true,
      });
    };

    if (map.isStyleLoaded()) {
      apply();
    } else {
      map.once("style.load", apply);
    }
  }, [map, route]);

  return (
    <>
      <div ref={containerRef} className="absolute inset-0 h-full w-full" />
      <LocateButton map={map} location={location} />
    </>
  );
}
