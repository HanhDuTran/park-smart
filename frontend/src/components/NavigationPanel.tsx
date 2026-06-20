import { AnimatePresence, motion } from "framer-motion";

import type { ParkingSpotWithDistance } from "../types/parking";
import type { RouteData } from "../types/route";

interface NavigationPanelProps {
  spot: ParkingSpotWithDistance;
  route: RouteData | null;
  loading: boolean;
  error: string | null;
  onCancel: () => void;
  onGoBack: () => void;
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  const mi = meters / 1609.34;
  return mi < 10 ? `${mi.toFixed(1)} mi` : `${Math.round(mi)} mi`;
}

function formatETA(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

function maneuverIcon(type: string): string {
  switch (type) {
    case "depart": return "🚦";
    case "arrive": return "🅿️";
    case "turn": return "↩";
    case "merge": return "↘";
    case "fork": return "⑂";
    case "roundabout":
    case "rotary": return "🔄";
    default: return "→";
  }
}

export function NavigationPanel({
  spot,
  route,
  loading,
  error,
  onCancel,
  onGoBack,
}: NavigationPanelProps) {
  const currentStep = route?.steps[0] ?? null;
  const gmapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${spot.lat},${spot.lng}&travelmode=driving`;

  return (
    <AnimatePresence>
      <motion.div
        key="nav-panel"
        initial={{ y: "100%", opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: "100%", opacity: 0 }}
        transition={{ type: "spring", damping: 32, stiffness: 320 }}
        className="fixed inset-x-0 bottom-0 z-40 sm:inset-x-auto sm:bottom-6 sm:left-1/2 sm:w-[28rem] sm:-translate-x-1/2 sm:rounded-2xl md:left-[23rem] md:translate-x-0"
      >
        {/* Main panel */}
        <div className="rounded-t-3xl border-t border-white/10 bg-surface pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-2xl shadow-black/60 backdrop-blur-glass sm:rounded-2xl sm:border sm:border-white/10">

          {/* Header strip: ETA + distance + cancel */}
          <div className="flex items-center gap-3 border-b border-white/8 px-5 py-3.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/20">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 11L21 3L13 21L11 13L3 11Z" fill="#00b4ff" />
              </svg>
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-textMuted">
                Navigating to
              </p>
              <p className="truncate text-sm font-bold text-textPrimary">{spot.name}</p>
            </div>

            {route && (
              <div className="shrink-0 text-right">
                <p className="text-lg font-bold text-primary leading-none">
                  {formatETA(route.duration_seconds)}
                </p>
                <p className="text-xs text-textMuted">
                  {formatDistance(route.distance_meters)}
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={onCancel}
              aria-label="Cancel navigation"
              className="ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-textMuted transition-colors hover:bg-white/10 hover:text-textPrimary"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {/* Current step */}
          <div className="px-5 py-4">
            {loading && (
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 shrink-0 animate-pulse rounded-xl bg-white/10" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-3/4 animate-pulse rounded bg-white/10" />
                  <div className="h-3 w-1/2 animate-pulse rounded bg-white/10" />
                </div>
              </div>
            )}

            {error && (
              <div className="flex flex-col items-center gap-3 py-1 text-center">
                <p className="text-sm font-semibold text-red-400">
                  Couldn&apos;t find a route to this spot
                </p>
                <div className="flex w-full gap-2">
                  <a
                    href={gmapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 rounded-xl bg-primary py-2.5 text-center text-sm font-bold text-white shadow-glow transition-colors hover:bg-primary-dark active:scale-95"
                  >
                    Try Google Maps
                  </a>
                  <button
                    type="button"
                    onClick={onGoBack}
                    className="flex-1 rounded-xl border border-white/10 bg-white/5 py-2.5 text-sm font-semibold text-textPrimary transition-colors hover:bg-white/10 active:scale-95"
                  >
                    Go Back
                  </button>
                </div>
              </div>
            )}

            {!loading && !error && currentStep && (
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/15 text-xl">
                  {maneuverIcon(currentStep.maneuver_type)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-bold leading-snug text-textPrimary">
                    {currentStep.instruction}
                  </p>
                  <p className="mt-0.5 text-xs text-textMuted">
                    {formatDistance(currentStep.distance_meters)}
                  </p>
                </div>
              </div>
            )}

            {!loading && !error && !currentStep && !route && (
              <p className="text-sm text-textMuted">Calculating route…</p>
            )}
          </div>

          {/* Footer: route preview disclaimer + Google Maps fallback */}
          <div className="flex items-center justify-between border-t border-white/8 px-5 py-2.5">
            <p className="text-[11px] text-textMuted">
              Route preview — GPS following not active
            </p>
            <a
              href={gmapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[11px] font-medium text-primary-light underline-offset-2 hover:underline"
            >
              Open in Maps
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M18 13v6a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h6M15 3h6v6M10 14L21 3" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
