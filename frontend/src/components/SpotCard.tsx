import type { ParkingSpotWithDistance } from "../types/parking";
import { formatDistance } from "../utils/distance";
import {
  formatFeeBadge,
  formatRulesSummary,
  formatTimeRuleSidebarSummary,
  formatTypeLabel,
} from "../utils/formatRules";

interface SpotCardProps {
  spot: ParkingSpotWithDistance;
  isSelected: boolean;
  isBest: boolean;
  onClick: () => void;
}

function DistanceIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
      <path d="M3 11L21 3L13 21L11 13L3 11Z" fill="currentColor" />
    </svg>
  );
}

function TypeIcon({ isStreet }: { isStreet: boolean }) {
  if (isStreet) {
    return (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
        <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" />
        <path d="M12 7V17M8 7H14C15.1046 7 16 7.89543 16 9C16 10.1046 15.1046 11 14 11H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
      <path d="M3 9L12 4L21 9V20H15V14H9V20H3V9Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

export function SpotCard({ spot, isSelected, isBest, onClick }: SpotCardProps) {
  const isStreet = spot.type === "street";
  const feeBadge = formatFeeBadge(spot);

  const feeColor =
    feeBadge === "Free"
      ? "text-lot"
      : feeBadge === "Paid"
        ? "text-accent"
        : "text-textMuted";

  const borderColorClass = isSelected ? "border-primary/50" : "border-white/5";
  const bgClass = isSelected
    ? "bg-primary/10"
    : "bg-white/[0.04] hover:bg-white/[0.08]";
  const leftBorderClass = isStreet ? "border-l-street" : "border-l-lot";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-xl border-y border-r border-l-4 ${leftBorderClass} ${borderColorClass} ${bgClass} p-3 text-left transition-colors duration-150`}
    >
      <div className="flex items-start gap-3">
        <div
          className={
            isStreet
              ? "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-[2.5px] border-white/50 bg-street text-sm font-bold text-white shadow-glow-blue"
              : "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-[2.5px] border-white/50 bg-lot text-sm font-bold text-white shadow-glow-green"
          }
          style={{ filter: "drop-shadow(0 3px 8px rgba(0,0,0,0.6))" }}
        >
          P
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="truncate text-sm font-bold text-textPrimary">
              {spot.name}
            </h3>
            <div className="flex shrink-0 items-center gap-1">
              {spot.estimated && (
                <span className="rounded-full border border-accent/40 bg-accent/15 px-2 py-0.5 text-[10px] font-bold text-accent-light">
                  Est.
                </span>
              )}
              {isBest && !spot.estimated && (
                <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-bold text-accent-light">
                  Best
                </span>
              )}
            </div>
          </div>

          {spot.address && (
            <p className="truncate text-xs text-textMuted mt-0.5">{spot.address}</p>
          )}

          <div className="mt-2 flex items-center gap-2 text-xs text-textMuted">
            <span className="flex items-center gap-1 font-semibold text-primary-light">
              <DistanceIcon />
              {formatDistance(spot.distance)}
            </span>
            <span className="text-white/20">·</span>
            <span className="flex items-center gap-1">
              <TypeIcon isStreet={isStreet} />
              {formatTypeLabel(spot.type)}
            </span>
            <span className="text-white/20">·</span>
            <span className={`font-medium ${feeColor}`}>{feeBadge}</span>
          </div>

          <p className="mt-1 truncate text-xs text-textMuted">
            {formatTimeRuleSidebarSummary(spot.time_rules) ?? formatRulesSummary(spot.rules)}
          </p>
        </div>
      </div>
    </button>
  );
}
