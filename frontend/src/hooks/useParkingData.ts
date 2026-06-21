import { useCallback, useEffect, useRef, useState } from "react";

import type {
  ParkingResponse,
  ParkingSpotWithDistance,
  UserLocation,
} from "../types/parking";
import { haversineDistance, sortByDistance } from "../utils/distance";

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
// 1000m was pulling in every individually-tagged OSM parking lot node near
// dense areas like the UC Berkeley campus, flooding the map with markers —
// 350m keeps results walking-distance-relevant and the marker count sane.
const DEFAULT_RADIUS = 350;
const REFETCH_DISTANCE_M = 100;
const POLL_INTERVAL_MS = 15_000;

interface UseParkingDataResult {
  spots: ParkingSpotWithDistance[];
  loading: boolean;
  error: string | null;
  streetDataUnavailable: boolean;
  refetch: () => void;
  reportPark: (spotId: string) => Promise<boolean>;
  confirmPark: (spotId: string, parked: boolean) => Promise<boolean>;
  confirmLeave: (spotId: string, left: boolean) => Promise<boolean>;
}

interface FetchKey {
  location: UserLocation;
  radius: number;
  reloadKey: number;
}

export function useParkingData(
  location: UserLocation | null,
  radius: number = DEFAULT_RADIUS
): UseParkingDataResult {
  const [spots, setSpots] = useState<ParkingSpotWithDistance[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streetDataUnavailable, setStreetDataUnavailable] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const lastFetchRef = useRef<FetchKey | null>(null);

  const refetch = useCallback(() => setReloadKey((k) => k + 1), []);

  // 15-second polling to refresh live statuses from other users' reports.
  useEffect(() => {
    if (!location) return;
    const id = setInterval(() => setReloadKey((k) => k + 1), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [location != null]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!location) return;

    const last = lastFetchRef.current;
    const shouldFetch =
      !last ||
      last.radius !== radius ||
      last.reloadKey !== reloadKey ||
      haversineDistance(last.location, location) > REFETCH_DISTANCE_M;

    if (!shouldFetch) return;

    lastFetchRef.current = { location, radius, reloadKey };

    const controller = new AbortController();

    async function fetchParking() {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          lat: location!.lat.toString(),
          lng: location!.lng.toString(),
          radius: radius.toString(),
        });

        const response = await fetch(
          `${API_BASE_URL}/api/parking?${params}`,
          { signal: controller.signal }
        );

        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }

        const data: ParkingResponse = await response.json();
        setSpots(sortByDistance(data.spots, location!));
        setStreetDataUnavailable(data.street_data_unavailable);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(
          err instanceof Error ? err.message : "Failed to load parking data"
        );
        setStreetDataUnavailable(false);
      } finally {
        setLoading(false);
      }
    }

    fetchParking();
    return () => controller.abort();
    // Depend on lat/lng primitives, not `location` itself, so a fresh object
    // with the same coordinates doesn't retrigger a fetch.
  }, [location?.lat, location?.lng, radius, reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Crowdsourced status actions
  // ---------------------------------------------------------------------------

  // Each returns whether the report actually reached the backend, so callers
  // (e.g. BottomSheet's buttons) can show a real failure state instead of
  // assuming success — best-effort only for the GPS auto-detection flow,
  // which doesn't have a UI to react to a `false`.
  const reportPark = useCallback(async (spotId: string): Promise<boolean> => {
    try {
      const resp = await fetch(`${API_BASE_URL}/api/parking/${spotId}/prompt-park`, {
        method: "POST",
      });
      if (!resp.ok) throw new Error(`Request failed (${resp.status})`);
      setReloadKey((k) => k + 1);
      return true;
    } catch {
      return false;
    }
  }, []);

  const confirmPark = useCallback(async (spotId: string, parked: boolean): Promise<boolean> => {
    try {
      const resp = await fetch(`${API_BASE_URL}/api/parking/${spotId}/confirm-park`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parked }),
      });
      if (!resp.ok) throw new Error(`Request failed (${resp.status})`);
      setReloadKey((k) => k + 1);
      return true;
    } catch {
      return false;
    }
  }, []);

  const confirmLeave = useCallback(async (spotId: string, left: boolean): Promise<boolean> => {
    try {
      const resp = await fetch(`${API_BASE_URL}/api/parking/${spotId}/confirm-leave`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ left }),
      });
      if (!resp.ok) throw new Error(`Request failed (${resp.status})`);
      setReloadKey((k) => k + 1);
      return true;
    } catch {
      return false;
    }
  }, []);

  return {
    spots,
    loading,
    error,
    streetDataUnavailable,
    refetch,
    reportPark,
    confirmPark,
    confirmLeave,
  };
}
