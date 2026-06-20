import { useEffect, useState } from "react";

interface UseParkedTimerResult {
  // null when max_stay is unknown — caller falls back to parkedSinceLabel.
  remainingSeconds: number | null;
  expired: boolean;
  parkedSinceLabel: string;
}

/** Ticks a 1-second countdown from `parkedAt` against a known max-stay limit
 * (in minutes). Falls back to a plain "parked since" label when the spot's
 * max_stay rule is unknown. */
export function useParkedTimer(
  parkedAt: Date | null,
  maxStayMinutes: number | null
): UseParkedTimerResult {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!parkedAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [parkedAt]);

  if (!parkedAt) {
    return { remainingSeconds: null, expired: false, parkedSinceLabel: "" };
  }

  const parkedSinceLabel = parkedAt.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  if (maxStayMinutes == null) {
    return { remainingSeconds: null, expired: false, parkedSinceLabel };
  }

  const elapsedSeconds = Math.floor((now - parkedAt.getTime()) / 1000);
  const totalSeconds = maxStayMinutes * 60;
  const remainingSeconds = Math.max(0, totalSeconds - elapsedSeconds);

  return { remainingSeconds, expired: remainingSeconds <= 0, parkedSinceLabel };
}
