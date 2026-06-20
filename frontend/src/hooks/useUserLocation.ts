import { useCallback, useEffect, useRef, useState } from "react";

import type { UserLocation } from "../types/parking";

interface UseUserLocationResult {
  location: UserLocation | null;
  heading: number | null;
  error: string | null;
  loading: boolean;
  // True once we've given up on a real GPS fix and are showing FALLBACK_LOCATION.
  isApproximate: boolean;
  // True specifically when the browser reported PERMISSION_DENIED, so the
  // loading screen can show a targeted message + retry instead of a generic spinner.
  permissionDenied: boolean;
  // True when ?demo=1 is in the URL — trusts real GPS when it lands in a
  // known-good coverage area (Berkeley venue or SF's SFMTA dataset), and
  // falls back to a fixed Berkeley location otherwise, as a safety net for
  // live demos with unreliable venue GPS.
  isDemoMode: boolean;
  retry: () => void;
}

// San Francisco — used if geolocation is denied/unavailable in normal
// (non-demo) mode so the map always has something useful to show.
const FALLBACK_LOCATION: UserLocation = { lat: 37.7749, lng: -122.4194 };

// Downtown Berkeley — demo mode's fallback, since the live presentation venue
// is in Berkeley (used when GPS is unavailable/denied, or resolves somewhere
// outside both known-good coverage areas below).
const DEMO_FALLBACK_LOCATION: UserLocation = { lat: 37.8716, lng: -122.2727 };

interface LatLngBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

const BERKELEY_BOUNDS: LatLngBounds = { minLat: 37.85, maxLat: 37.91, minLng: -122.32, maxLng: -122.22 };
const SF_BOUNDS: LatLngBounds = { minLat: 37.70, maxLat: 37.84, minLng: -122.52, maxLng: -122.35 };

function isWithinBounds(loc: UserLocation, b: LatLngBounds): boolean {
  return loc.lat >= b.minLat && loc.lat <= b.maxLat && loc.lng >= b.minLng && loc.lng <= b.maxLng;
}

// Demo mode trusts a real GPS fix only inside areas the app has real
// coverage for; anywhere else, a "real" fix is more likely GPS drift/error
// than a genuine reason to abandon the rehearsed demo location.
function isInKnownDemoArea(loc: UserLocation): boolean {
  return isWithinBounds(loc, BERKELEY_BOUNDS) || isWithinBounds(loc, SF_BOUNDS);
}

// Hard ceiling on how long we wait for a real GPS fix before silently
// falling back. Covers both explicit permission denial and the common
// desktop case where there's no location hardware and the browser just
// never calls back.
const FALLBACK_TIMEOUT_MS = 8000;

function isDemoModeRequested(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("demo") === "1";
}

export function useUserLocation(): UseUserLocationResult {
  const [location, setLocation] = useState<UserLocation | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isApproximate, setIsApproximate] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [isDemoMode] = useState(isDemoModeRequested);

  const resolvedRef = useRef(false);

  useEffect(() => {
    resolvedRef.current = false;
    setPermissionDenied(false);

    // Demo mode still asks for real GPS — it just falls back to a fixed
    // Berkeley location instead of giving up, and is pickier about trusting
    // whatever fix comes back (see isInKnownDemoArea below).
    const fallbackLocation = isDemoMode ? DEMO_FALLBACK_LOCATION : FALLBACK_LOCATION;

    if (!("geolocation" in navigator)) {
      setError("Geolocation is not supported by this browser.");
      setLocation(fallbackLocation);
      setIsApproximate(!isDemoMode);
      setLoading(false);
      return;
    }

    const fallbackTimer = setTimeout(() => {
      if (resolvedRef.current) return;
      resolvedRef.current = true;
      setLocation((prev) => prev ?? fallbackLocation);
      setIsApproximate(!isDemoMode);
      setLoading(false);
    }, FALLBACK_TIMEOUT_MS);

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        resolvedRef.current = true;
        clearTimeout(fallbackTimer);

        const real: UserLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        // Outside demo mode, always trust the real fix. In demo mode, only
        // trust it inside a known-good coverage area — otherwise keep the
        // demo anchored to Berkeley rather than wherever GPS drifted to.
        const useReal = !isDemoMode || isInKnownDemoArea(real);
        setLocation(useReal ? real : fallbackLocation);

        if (
          position.coords.heading !== null &&
          !Number.isNaN(position.coords.heading)
        ) {
          setHeading(position.coords.heading);
        }

        setError(null);
        setIsApproximate(false);
        setPermissionDenied(false);
        setLoading(false);
      },
      (geoError) => {
        if (geoError.code === geoError.PERMISSION_DENIED) {
          setPermissionDenied(true);
        }
        setError(geoError.message);
        // Don't resolve immediately — let a real fix or the fallback timer
        // above decide, so a merely-slow fix still has a chance to arrive.
      },
      {
        enableHighAccuracy: true,
        timeout: FALLBACK_TIMEOUT_MS,
        maximumAge: 5000,
      }
    );

    return () => {
      clearTimeout(fallbackTimer);
      navigator.geolocation.clearWatch(watchId);
    };
  }, [attempt, isDemoMode]);

  const retry = useCallback(() => {
    setLoading(true);
    setPermissionDenied(false);
    setAttempt((a) => a + 1);
  }, []);

  return {
    location,
    heading,
    error,
    loading,
    isApproximate,
    permissionDenied,
    isDemoMode,
    retry,
  };
}
