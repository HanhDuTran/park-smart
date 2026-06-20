/**
 * GPS-based parking detection state machine.
 *
 * Idle → stationary >20 s within 30 m of a street spot → prompt_park
 *   → Yes → parked
 *   → No / 60 s timeout → idle (timeout auto-confirms via backend)
 * Parked → user moves >50 m → prompt_leave
 *   → Yes → idle
 *   → No → parked
 */

import { useCallback, useEffect, useRef, useState } from "react";

import type { ParkingSpotWithDistance, UserLocation } from "../types/parking";
import { haversineDistance } from "../utils/distance";

const STATIONARY_RADIUS_M = 15;
const STATIONARY_DURATION_MS = 20_000;
const NEAR_SPOT_M = 30;
const MOVING_THRESHOLD_M = 50;
const PARK_COUNTDOWN_S = 60;
const LEAVE_COUNTDOWN_S = 60;

interface PositionSample {
  lat: number;
  lng: number;
  ts: number;
}

export type DetectionPhase =
  | { phase: "idle" }
  | { phase: "prompting_park"; spot: ParkingSpotWithDistance }
  | { phase: "parked"; spotId: string; parkedAt: UserLocation }
  | { phase: "prompting_leave"; spotId: string; spot: ParkingSpotWithDistance | null };

export interface UseParkedDetectionResult {
  detectionPhase: DetectionPhase;
  countdown: number;
  confirm: () => void;
  deny: () => void;
}

export function useParkedDetection(
  location: UserLocation | null,
  spots: ParkingSpotWithDistance[],
  reportPark: (id: string) => Promise<boolean>,
  confirmPark: (id: string, parked: boolean) => Promise<boolean>,
  confirmLeave: (id: string, left: boolean) => Promise<boolean>
): UseParkedDetectionResult {
  const [detectionPhase, setPhase] = useState<DetectionPhase>({ phase: "idle" });
  const [countdown, setCountdown] = useState(0);

  const phaseRef = useRef<DetectionPhase>({ phase: "idle" });
  const positionHistory = useRef<PositionSample[]>([]);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const locationRef = useRef<UserLocation | null>(null);

  function syncPhase(p: DetectionPhase) {
    phaseRef.current = p;
    setPhase(p);
  }

  function stopCountdown() {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }

  function startCountdown(seconds: number, onExpire: () => void) {
    stopCountdown();
    setCountdown(seconds);
    let remaining = seconds;
    countdownRef.current = setInterval(() => {
      remaining -= 1;
      setCountdown(remaining);
      if (remaining <= 0) {
        stopCountdown();
        onExpire();
      }
    }, 1000);
  }

  // Track location history for stationarity detection.
  useEffect(() => {
    if (!location) return;
    locationRef.current = location;
    const now = Date.now();
    positionHistory.current.push({ lat: location.lat, lng: location.lng, ts: now });
    // Keep only the last 35 seconds.
    const cutoff = now - 35_000;
    positionHistory.current = positionHistory.current.filter((s) => s.ts > cutoff);
    // Depend on lat/lng primitives, not `location` itself, so a fresh object
    // with the same coordinates doesn't retrigger this on every render.
  }, [location?.lat, location?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // Main detection loop — runs on every location update.
  useEffect(() => {
    if (!location || spots.length === 0) return;
    const phase = phaseRef.current;

    // ---- Idle: look for stationarity near a street spot ----
    if (phase.phase === "idle") {
      const history = positionHistory.current;
      const now = Date.now();

      // Need at least one sample older than STATIONARY_DURATION_MS
      const hasOldEnough = history.some(
        (s) => now - s.ts >= STATIONARY_DURATION_MS
      );
      if (!hasOldEnough || history.length < 4) return;

      // Check all recent samples are within STATIONARY_RADIUS_M of each other
      const centroid = {
        lat: history.reduce((s, p) => s + p.lat, 0) / history.length,
        lng: history.reduce((s, p) => s + p.lng, 0) / history.length,
      };
      const allClose = history.every(
        (s) => haversineDistance(centroid, s) <= STATIONARY_RADIUS_M
      );
      if (!allClose) return;

      // Find the nearest street spot within NEAR_SPOT_M that isn't already taken
      const nearbySpot = spots.find(
        (s) => s.type === "street" && s.distance <= NEAR_SPOT_M && s.live_status !== "taken"
      );
      if (!nearbySpot) return;

      // Transition → prompting_park
      reportPark(nearbySpot.id);
      const next: DetectionPhase = { phase: "prompting_park", spot: nearbySpot };
      syncPhase(next);
      startCountdown(PARK_COUNTDOWN_S, () => {
        // Auto-confirm via backend (already scheduled server-side); go to parked.
        const parkedPhase: DetectionPhase = {
          phase: "parked",
          spotId: nearbySpot.id,
          parkedAt: locationRef.current ?? location,
        };
        syncPhase(parkedPhase);
      });
    }

    // ---- Parked: detect departure ----
    if (phase.phase === "parked") {
      const moved = haversineDistance(phase.parkedAt, location);
      if (moved < MOVING_THRESHOLD_M) return;

      stopCountdown();
      const spot = spots.find((s) => s.id === phase.spotId) ?? null;
      const { spotId } = phase;
      const next: DetectionPhase = { phase: "prompting_leave", spotId, spot };
      syncPhase(next);
      startCountdown(LEAVE_COUNTDOWN_S, () => {
        // No auto-action on leave timeout — user may have just driven nearby.
        syncPhase({ phase: "idle" });
      });
    }
  }, [location?.lat, location?.lng, spots]); // eslint-disable-line react-hooks/exhaustive-deps

  const confirm = useCallback(async () => {
    const phase = phaseRef.current;
    stopCountdown();
    if (phase.phase === "prompting_park") {
      await confirmPark(phase.spot.id, true);
      syncPhase({
        phase: "parked",
        spotId: phase.spot.id,
        parkedAt: locationRef.current ?? { lat: phase.spot.lat, lng: phase.spot.lng },
      });
    } else if (phase.phase === "prompting_leave") {
      await confirmLeave(phase.spotId, true);
      syncPhase({ phase: "idle" });
    }
  }, [confirmPark, confirmLeave]);

  const deny = useCallback(async () => {
    const phase = phaseRef.current;
    stopCountdown();
    if (phase.phase === "prompting_park") {
      await confirmPark(phase.spot.id, false);
      syncPhase({ phase: "idle" });
    } else if (phase.phase === "prompting_leave") {
      // User says they're still parked — restore parked state.
      syncPhase({
        phase: "parked",
        spotId: phase.spotId,
        parkedAt: locationRef.current ?? { lat: 0, lng: 0 },
      });
    }
  }, [confirmPark]);

  return { detectionPhase, countdown, confirm, deny };
}
