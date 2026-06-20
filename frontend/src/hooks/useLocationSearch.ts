import { useCallback, useEffect, useRef, useState } from "react";

import type { UserLocation } from "../types/parking";
import type { SearchResult, SearchSuggestion } from "../types/search";

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const DEBOUNCE_MS = 300;

interface UseLocationSearchResult {
  suggestions: SearchSuggestion[];
  loading: boolean;
  error: string | null;
  retrieve: (mapboxId: string) => Promise<SearchResult | null>;
}

export function useLocationSearch(
  query: string,
  location: UserLocation | null
): UseLocationSearchResult {
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // One session_token per search session (Mapbox bills suggest+retrieve as a
  // unit per session) - generated on first keystroke, cleared on selection
  // or when the input empties back out.
  const sessionTokenRef = useRef<string | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setLoading(false);
      setError(null);
      sessionTokenRef.current = null;
      return;
    }

    if (!sessionTokenRef.current) {
      sessionTokenRef.current = crypto.randomUUID();
    }
    const sessionToken = sessionTokenRef.current;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          query: trimmed,
          session_token: sessionToken,
        });
        if (location) {
          params.set("lat", location.lat.toString());
          params.set("lng", location.lng.toString());
        }

        const resp = await fetch(`${API_BASE_URL}/api/search?${params}`, {
          signal: controller.signal,
        });
        if (!resp.ok) {
          throw new Error(`Request failed (${resp.status})`);
        }

        const data: { suggestions: SearchSuggestion[] } = await resp.json();
        setSuggestions(data.suggestions);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Search failed");
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // Depend on lat/lng primitives, not `location` itself, so a fresh object
    // with the same coordinates doesn't retrigger the debounce/fetch cycle.
  }, [query, location?.lat, location?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const retrieve = useCallback(async (mapboxId: string): Promise<SearchResult | null> => {
    const sessionToken = sessionTokenRef.current;
    if (!sessionToken) return null;

    try {
      const params = new URLSearchParams({ session_token: sessionToken });
      const resp = await fetch(
        `${API_BASE_URL}/api/search/retrieve/${encodeURIComponent(mapboxId)}?${params}`
      );
      if (!resp.ok) return null;

      const data: SearchResult = await resp.json();
      sessionTokenRef.current = null; // selection ends the session
      return data;
    } catch {
      return null;
    }
  }, []);

  return { suggestions, loading, error, retrieve };
}
