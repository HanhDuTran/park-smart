import type { ParkingSpotWithDistance } from "../types/parking";
import { SpotCard } from "./SpotCard";

interface SidebarProps {
  spots: ParkingSpotWithDistance[];
  selectedSpotId: string | null;
  onSelectSpot: (id: string) => void;
  loading: boolean;
  error: string | null;
  streetDataUnavailable: boolean;
  onRetry: () => void;
  onSearchNearby: () => void;
}

function SkeletonCard() {
  const shimmer =
    "rounded bg-gradient-to-r from-white/5 via-white/15 to-white/5 bg-[length:200%_100%] animate-shimmer";
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.04] p-3">
      <div className="flex items-start gap-3">
        <div className={`h-10 w-10 shrink-0 rounded-xl ${shimmer}`} />
        <div className="flex-1 space-y-2 pt-0.5">
          <div className={`h-3.5 w-3/4 ${shimmer}`} />
          <div className={`h-3 w-1/2 ${shimmer}`} />
          <div className={`h-3 w-2/3 ${shimmer}`} />
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onSearchNearby }: { onSearchNearby: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-10 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-textMuted/30 text-2xl font-bold text-textMuted/50">
        P
      </div>
      <p className="text-sm font-semibold text-textMuted">No parking found in this area</p>
      <p className="max-w-[14rem] text-xs text-textMuted/70">
        Try searching a nearby street or expanding the area
      </p>
      <button
        type="button"
        onClick={onSearchNearby}
        className="mt-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-textPrimary transition-colors hover:bg-white/10"
      >
        Search Nearby
      </button>
    </div>
  );
}

export function Sidebar({
  spots,
  selectedSpotId,
  onSelectSpot,
  loading,
  error,
  streetDataUnavailable,
  onRetry,
  onSearchNearby,
}: SidebarProps) {
  const bestSpotId = spots[0]?.id ?? null;
  const realDataCount = spots.filter((s) => s.time_rules.length > 0).length;

  const showSkeleton = loading && spots.length === 0 && !error;
  const showBigError = !loading && (!!error || (streetDataUnavailable && spots.length === 0));
  const showPartialNotice = !showBigError && streetDataUnavailable && spots.length > 0;
  const showEmpty = !showBigError && !loading && !streetDataUnavailable && spots.length === 0;

  return (
    <aside className="absolute bottom-4 left-4 top-28 z-20 hidden w-80 flex-col overflow-hidden rounded-2xl border border-white/8 bg-surface shadow-2xl shadow-black/60 backdrop-blur-glass md:flex">
      <div className="border-b border-white/8 bg-white/[0.02] px-4 py-3.5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/20 text-primary-light">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M12 22C12 22 20 15.5 20 10C20 5.58172 16.4183 2 12 2C7.58172 2 4 5.58172 4 10C4 15.5 12 22 12 22Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinejoin="round"
              />
              <circle cx="12" cy="10" r="2.5" stroke="currentColor" strokeWidth="2" />
            </svg>
          </div>
          <h2 className="text-sm font-bold text-textPrimary">
            Nearby Parking
          </h2>
        </div>
        <p className="mt-1.5 text-xs text-textMuted">
          {loading
            ? "Searching nearby..."
            : `${spots.length} spot${spots.length === 1 ? "" : "s"} — ${realDataCount} with real sign data`}
        </p>
      </div>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3">
        {showSkeleton && (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        )}

        {showBigError && (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/10 p-5 text-center">
            <p className="text-sm font-semibold text-red-400">
              Couldn&apos;t load parking data near you
            </p>
            <button
              type="button"
              onClick={onRetry}
              className="w-full rounded-xl bg-primary py-2.5 text-sm font-bold text-white shadow-glow transition-colors hover:bg-primary-dark active:scale-95"
            >
              Retry
            </button>
          </div>
        )}

        {showPartialNotice && (
          <p className="rounded-xl border border-accent/30 bg-accent/10 px-3 py-2 text-xs text-accent-light">
            Street parking data temporarily unavailable
          </p>
        )}

        {showEmpty && <EmptyState onSearchNearby={onSearchNearby} />}

        {spots.map((spot) => (
          <SpotCard
            key={spot.id}
            spot={spot}
            isSelected={spot.id === selectedSpotId}
            isBest={spot.id === bestSpotId}
            onClick={() => onSelectSpot(spot.id)}
          />
        ))}
      </div>
    </aside>
  );
}
