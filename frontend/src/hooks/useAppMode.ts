import { useCallback, useState } from "react";

export type AppMode = "driving" | "parked" | "walking";

interface UseAppModeResult {
  mode: AppMode;
  setMode: (mode: AppMode) => void;
  parkedAt: Date | null;
}

/** Tracks the active app mode (driving/parked/walking) and when the user
 * entered "parked" mode, so a countdown can be timed from that moment. */
export function useAppMode(): UseAppModeResult {
  const [mode, setModeState] = useState<AppMode>("driving");
  const [parkedAt, setParkedAt] = useState<Date | null>(null);

  const setMode = useCallback(
    (next: AppMode) => {
      if (next === "parked" && mode !== "parked") {
        setParkedAt(new Date());
      } else if (next !== "parked") {
        setParkedAt(null);
      }
      setModeState(next);
    },
    [mode]
  );

  return { mode, setMode, parkedAt };
}
