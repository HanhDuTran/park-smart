import { useEffect, useState } from "react";

import type { UserLocation } from "../types/parking";
import type { RouteData } from "../types/route";

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const ROUTE_TIMEOUT_MS = 10_000;

interface UseRouteResult {
  route: RouteData | null;
  loading: boolean;
  error: string | null;
}

export function useRoute(
  start: UserLocation | null,
  end: UserLocation | null,
  profile: "driving" | "walking" = "driving"
): UseRouteResult {
  const [route, setRoute] = useState<RouteData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!start || !end) {
      setRoute(null);
      setError(null);
      return;
    }

    const controller = new AbortController();
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, ROUTE_TIMEOUT_MS);

    async function fetchRoute() {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          start_lat: start!.lat.toString(),
          start_lng: start!.lng.toString(),
          end_lat: end!.lat.toString(),
          end_lng: end!.lng.toString(),
          profile,
        });

        const resp = await fetch(`${API_BASE_URL}/api/route?${params}`, {
          signal: controller.signal,
        });

        if (!resp.ok) {
          const body = await resp.json().catch(() => ({}));
          throw new Error(body.detail ?? `Request failed (${resp.status})`);
        }

        const data: RouteData = await resp.json();
        setRoute(data);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          // Only a real failure if WE aborted via the timeout — a cleanup
          // abort (deps changed / unmount) should stay silent.
          if (timedOut) setError("Request timed out");
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load route");
      } finally {
        clearTimeout(timeoutId);
        setLoading(false);
      }
    }

    fetchRoute();
    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
    // Re-fetch when start/end change (new nav target or location update).
    // Depend on lat/lng primitives, not the objects, so a fresh object with
    // the same coordinates doesn't retrigger the fetch.
  }, [start?.lat, start?.lng, end?.lat, end?.lng, profile]); // eslint-disable-line react-hooks/exhaustive-deps

  return { route, loading, error };
}
