import { useEffect, useRef, useState, type RefObject } from "react";
import mapboxgl from "mapbox-gl";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN ?? "";

interface UseMapboxOptions {
  center: [number, number];
  zoom?: number;
}

interface UseMapboxResult {
  containerRef: RefObject<HTMLDivElement>;
  map: mapboxgl.Map | null;
}

/**
 * Creates a single Mapbox GL map instance bound to a container ref.
 * The map is created once on mount and torn down on unmount; callers
 * should use `map.flyTo` / `map.easeTo` etc. for subsequent camera moves
 * rather than recreating the map.
 */
export function useMapbox({ center, zoom = 15 }: UseMapboxOptions): UseMapboxResult {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [map, setMap] = useState<mapboxgl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const mapInstance = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/traffic-night-v2",
      center,
      zoom,
      pitch: 45,
      attributionControl: false,
    });

    mapInstance.addControl(new mapboxgl.AttributionControl({ compact: true }));
    mapInstance.addControl(
      new mapboxgl.NavigationControl({ visualizePitch: true }),
      "top-right"
    );

    mapRef.current = mapInstance;

    // Wait for style to fully load before exposing the map to React effects.
    // Markers created before this point get wrong pixel coordinates from project().
    mapInstance.once("load", () => {
      mapInstance.resize();
      setMap(mapInstance);
    });

    return () => {
      mapInstance.remove();
      mapRef.current = null;
    };
    // Map is created once on mount; `center`/`zoom` only set the initial view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { containerRef, map };
}
