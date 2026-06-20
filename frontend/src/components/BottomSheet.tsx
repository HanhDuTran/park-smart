import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

import type { LiveStatus, ParkingSpotWithDistance, ParkingTimeRule } from "../types/parking";
import { formatDistance } from "../utils/distance";
import {
  formatCapacity,
  formatFeeBadge,
  formatRulesSummary,
  formatTypeLabel,
} from "../utils/formatRules";

export interface ParkedCountdown {
  remainingSeconds: number | null;
  expired: boolean;
  parkedSinceLabel: string;
}

interface BottomSheetProps {
  spot: ParkingSpotWithDistance | null;
  onClose: () => void;
  onNavigate: (spot: ParkingSpotWithDistance) => void;
  onReportPark: (spotId: string) => Promise<boolean>;
  onConfirmLeave: (spotId: string, left: boolean) => Promise<boolean>;
  isParkedMode?: boolean;
  countdown?: ParkedCountdown | null;
  onFindNextSpot?: () => void;
}

type ActionState = "idle" | "loading" | "error";
type SheetPosition = "collapsed" | "half" | "full";
const ERROR_REVERT_MS = 2000;
const MOBILE_BREAKPOINT_PX = 768;
const DISMISS_THRESHOLD_PX = 100;
const EXPAND_THRESHOLD_PX = -60;
const COLLAPSE_THRESHOLD_PX = 60;

function InlineSpinner() {
  return (
    <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" strokeOpacity="0.3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function StatusButton({
  state,
  idleLabel,
  onClick,
  prominent,
}: {
  state: ActionState;
  idleLabel: React.ReactNode;
  onClick: () => void;
  prominent?: boolean;
}) {
  const isError = state === "error";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={state === "loading"}
      className={`flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-medium transition-colors disabled:opacity-70 ${
        prominent ? "py-3.5 text-sm font-bold" : "py-2.5"
      } ${
        isError
          ? "border-red-500/40 bg-red-500/15 text-red-400"
          : prominent
            ? "border-lot/40 bg-lot/15 text-lot hover:bg-lot/25"
            : "border-white/10 bg-white/5 text-textMuted hover:bg-white/10"
      }`}
    >
      {state === "loading" ? (
        <InlineSpinner />
      ) : isError ? (
        <span>Failed — tap to retry</span>
      ) : (
        idleLabel
      )}
    </button>
  );
}

function formatCountdown(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function ParkedCountdownDisplay({ countdown }: { countdown: ParkedCountdown }) {
  if (countdown.remainingSeconds == null) {
    return (
      <p className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5 text-center text-sm text-textMuted">
        Parked since {countdown.parkedSinceLabel}
      </p>
    );
  }

  if (countdown.expired) {
    return (
      <div className="rounded-xl border border-red-500/40 bg-red-500/15 px-3 py-3 text-center">
        <p className="text-sm font-bold text-red-400">⚠️ Time limit reached — you may get a ticket!</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-accent/30 bg-accent/10 px-3 py-3 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-accent-light">
        Time remaining
      </p>
      <p className="text-2xl font-bold tabular-nums text-accent-light">
        {formatCountdown(countdown.remainingSeconds)}
      </p>
    </div>
  );
}

export function BottomSheet({
  spot,
  onClose,
  onNavigate,
  onReportPark,
  onConfirmLeave,
  isParkedMode = false,
  countdown = null,
  onFindNextSpot,
}: BottomSheetProps) {
  const [parkState, setParkState] = useState<ActionState>("idle");
  const [leaveState, setLeaveState] = useState<ActionState>("idle");
  const [sheetPosition, setSheetPosition] = useState<SheetPosition>("half");
  const [dragY, setDragY] = useState(0);
  const parkRevertTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveRevertTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragStartYRef = useRef<number | null>(null);

  // A newly-selected spot starts with fresh button/position state.
  useEffect(() => {
    setParkState("idle");
    setLeaveState("idle");
    setSheetPosition("half");
    return () => {
      if (parkRevertTimer.current) clearTimeout(parkRevertTimer.current);
      if (leaveRevertTimer.current) clearTimeout(leaveRevertTimer.current);
    };
  }, [spot?.id]);

  const handleReportPark = async () => {
    if (!spot || parkState === "loading") return;
    if (parkRevertTimer.current) clearTimeout(parkRevertTimer.current);
    setParkState("loading");
    const ok = await onReportPark(spot.id);
    if (ok) {
      setParkState("idle");
    } else {
      setParkState("error");
      parkRevertTimer.current = setTimeout(() => setParkState("idle"), ERROR_REVERT_MS);
    }
  };

  const handleConfirmLeave = async () => {
    if (!spot || leaveState === "loading") return;
    if (leaveRevertTimer.current) clearTimeout(leaveRevertTimer.current);
    setLeaveState("loading");
    const ok = await onConfirmLeave(spot.id, true);
    if (ok) {
      setLeaveState("idle");
    } else {
      setLeaveState("error");
      leaveRevertTimer.current = setTimeout(() => setLeaveState("idle"), ERROR_REVERT_MS);
    }
  };

  // Drag-to-resize/dismiss — mobile only (desktop keeps the fixed panel).
  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (window.innerWidth >= MOBILE_BREAKPOINT_PX) return;
    dragStartYRef.current = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragStartYRef.current === null) return;
    setDragY(e.clientY - dragStartYRef.current);
  };

  const handlePointerUp = () => {
    if (dragStartYRef.current === null) return;
    const delta = dragY;
    dragStartYRef.current = null;
    setDragY(0);

    if (delta > DISMISS_THRESHOLD_PX) {
      onClose();
    } else if (delta < EXPAND_THRESHOLD_PX) {
      setSheetPosition((prev) => (prev === "collapsed" ? "half" : "full"));
    } else if (delta > COLLAPSE_THRESHOLD_PX) {
      setSheetPosition((prev) => (prev === "full" ? "half" : "collapsed"));
    }
  };

  return (
    <AnimatePresence>
      {spot && (
        <motion.div
          key={spot.id}
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: dragY, opacity: 1 }}
          exit={{ y: "100%", opacity: 0 }}
          transition={dragY !== 0 ? { duration: 0 } : { type: "spring", damping: 30, stiffness: 300 }}
          className={`fixed inset-x-0 bottom-0 z-40 rounded-t-3xl border-t border-white/10 bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl shadow-black/60 backdrop-blur-glass sm:inset-x-auto sm:bottom-6 sm:left-1/2 sm:w-[28rem] sm:-translate-x-1/2 sm:rounded-2xl sm:border sm:border-white/10 sm:p-6 md:left-[23rem] md:translate-x-0 ${
            sheetPosition === "full" ? "max-h-[85vh] overflow-y-auto" : ""
          }`}
        >
          <div
            className="mx-auto mb-4 flex h-6 w-full touch-none items-center justify-center sm:hidden"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            <div className="h-1 w-10 rounded-full bg-white/20" />
          </div>

          {sheetPosition === "collapsed" ? (
            <div className="flex items-center gap-3">
              <div
                className={
                  spot.type === "street"
                    ? "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-white/50 bg-street text-sm font-bold text-white"
                    : "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 border-white/50 bg-lot text-sm font-bold text-white"
                }
              >
                P
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-bold text-textPrimary">{spot.name}</p>
                <p className="text-sm text-textMuted">{formatDistance(spot.distance)} away</p>
              </div>
            </div>
          ) : (
            <>
              <SpotDetails spot={spot} />

              {isParkedMode ? (
                <div className="mt-4 flex flex-col gap-3">
                  {countdown && <ParkedCountdownDisplay countdown={countdown} />}
                  <div className="flex gap-2">
                    <StatusButton
                      state={leaveState}
                      onClick={handleConfirmLeave}
                      prominent
                      idleLabel={
                        <>
                          <span>🚗</span> I&apos;m leaving
                        </>
                      }
                    />
                  </div>
                  {onFindNextSpot && (
                    <button
                      type="button"
                      onClick={onFindNextSpot}
                      className="min-h-[44px] rounded-xl border border-white/10 bg-white/5 text-sm font-semibold text-textPrimary transition-colors hover:bg-white/10"
                    >
                      Find next spot
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {/* Manual test buttons for street spots */}
                  {spot.type === "street" && (
                    <div className="mt-4 flex gap-2">
                      <StatusButton
                        state={parkState}
                        onClick={handleReportPark}
                        idleLabel={
                          <>
                            <span>📍</span> I parked here
                          </>
                        }
                      />
                      <StatusButton
                        state={leaveState}
                        onClick={handleConfirmLeave}
                        idleLabel={
                          <>
                            <span>🚗</span> I&apos;m leaving
                          </>
                        }
                      />
                    </div>
                  )}

                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => onNavigate(spot)}
                      className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 text-center text-sm font-bold text-white shadow-glow transition-colors hover:bg-primary-dark"
                    >
                      <svg
                        width="15"
                        height="15"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path d="M3 11L21 3L13 21L11 13L3 11Z" fill="currentColor" />
                      </svg>
                      Navigate
                    </button>
                    <button
                      type="button"
                      onClick={onClose}
                      className="min-h-[44px] rounded-xl border border-white/10 bg-white/5 px-4 py-3.5 text-sm font-semibold text-textPrimary transition-colors hover:bg-white/10"
                    >
                      Close
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: LiveStatus }) {
  if (status === "available") {
    return (
      <span className="flex items-center gap-1.5 rounded-full border border-lot/40 bg-lot/15 px-3 py-1 text-xs font-bold text-lot">
        <span className="h-2 w-2 rounded-full bg-lot" />
        Available
      </span>
    );
  }
  if (status === "taken") {
    return (
      <span className="flex items-center gap-1.5 rounded-full border border-red-500/40 bg-red-500/15 px-3 py-1 text-xs font-bold text-red-400">
        <span className="h-2 w-2 rounded-full bg-red-400" />
        Taken
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/15 px-3 py-1 text-xs font-bold text-accent">
      <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
      Pending…
    </span>
  );
}

function InfoChip({
  icon,
  label,
  className = "",
}: {
  icon: React.ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <span
      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${className}`}
    >
      {icon}
      {label}
    </span>
  );
}

const TIME_RULE_STYLE: Record<
  ParkingTimeRule["rule_type"],
  { border: string; bg: string; text: string; icon: string; label: string }
> = {
  no_parking: { border: "border-red-500/40", bg: "bg-red-500/10", text: "text-red-400", icon: "🚫", label: "No Parking" },
  street_cleaning: { border: "border-accent/40", bg: "bg-accent/10", text: "text-accent-light", icon: "🧹", label: "Street Cleaning" },
  time_limit: { border: "border-lot/40", bg: "bg-lot/10", text: "text-lot", icon: "⏱️", label: "Time Limit" },
  permit: { border: "border-primary/30", bg: "bg-primary/10", text: "text-primary-light", icon: "🅿️", label: "Permit Required" },
  paid: { border: "border-primary/30", bg: "bg-primary/10", text: "text-primary-light", icon: "💳", label: "Paid" },
  paid_permit: { border: "border-primary/30", bg: "bg-primary/10", text: "text-primary-light", icon: "💳", label: "Paid / Permit" },
  oversized_vehicle: { border: "border-white/10", bg: "bg-white/5", text: "text-textMuted", icon: "🚛", label: "Oversized Vehicle" },
  other: { border: "border-white/10", bg: "bg-white/5", text: "text-textMuted", icon: "ℹ️", label: "Posted Sign" },
};

/** Top-of-sheet status pill — real SFMTA data lets us say definitively
 * whether parking is restricted right now, not just what the rules are. */
function TimeRuleStatusPill({ rules }: { rules: ParkingTimeRule[] }) {
  const activeNoParking = rules.find((r) => r.is_active_now && r.rule_type === "no_parking");
  const activeCleaning = rules.find((r) => r.is_active_now && r.rule_type === "street_cleaning");
  const activeLimit = rules
    .filter((r) => r.is_active_now && r.rule_type === "time_limit" && r.max_stay_minutes != null)
    .sort((a, b) => (a.max_stay_minutes ?? 0) - (b.max_stay_minutes ?? 0))[0];

  let text: string;
  let className: string;
  if (activeNoParking) {
    text = "🚫 No parking right now";
    className = "border-red-500/40 bg-red-500/15 text-red-400";
  } else if (activeCleaning) {
    text = "🧹 Street cleaning now";
    className = "border-accent/40 bg-accent/15 text-accent-light";
  } else if (activeLimit) {
    text = `✓ Parking OK — ${Math.round((activeLimit.max_stay_minutes ?? 0) / 60)}hr limit`;
    className = "border-lot/40 bg-lot/15 text-lot";
  } else if (rules.length === 0) {
    text = "Check posted signs";
    className = "border-white/10 bg-white/5 text-textMuted";
  } else {
    text = "✓ Parking available now";
    className = "border-lot/40 bg-lot/15 text-lot";
  }

  return (
    <span className={`mb-3 inline-flex items-center self-start rounded-full border px-3 py-1 text-xs font-bold ${className}`}>
      {text}
    </span>
  );
}

function TimeRuleCard({ rule }: { rule: ParkingTimeRule }) {
  const style = TIME_RULE_STYLE[rule.rule_type];
  return (
    <div className={`flex items-start justify-between gap-2 rounded-xl border px-3 py-2.5 ${style.border} ${style.bg}`}>
      <div className="flex items-start gap-2">
        <span className="text-sm">{style.icon}</span>
        <div>
          <p className={`text-xs font-bold ${style.text}`}>{style.label}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-textMuted">{rule.description}</p>
        </div>
      </div>
      {rule.is_active_now && (
        <span className="shrink-0 rounded-full border border-lot/40 bg-lot/15 px-2 py-0.5 text-[10px] font-bold text-lot">
          Active now
        </span>
      )}
    </div>
  );
}

function SpotDetails({ spot }: { spot: ParkingSpotWithDistance }) {
  const isStreet = spot.type === "street";
  const feeBadge = formatFeeBadge(spot);
  const capacity = formatCapacity(spot.capacity);
  const rules = formatRulesSummary(spot.rules);

  const feeChipClass =
    feeBadge === "Free"
      ? "border-lot/30 bg-lot/10 text-lot"
      : feeBadge === "Paid"
        ? "border-accent/30 bg-accent/10 text-accent-light"
        : "border-white/10 bg-white/5 text-textMuted";

  return (
    <div>
      {isStreet && (
        <div className="flex flex-col">
          <TimeRuleStatusPill rules={spot.time_rules} />
        </div>
      )}

      {/* Header row */}
      <div className="flex items-start gap-4">
        <div
          className={
            isStreet
              ? "flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-[3px] border-white/50 bg-street text-xl font-bold text-white shadow-glow-blue"
              : "flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border-[3px] border-white/50 bg-lot text-xl font-bold text-white shadow-glow-green"
          }
          style={{ filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.7))" }}
        >
          P
        </div>

        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-xl font-bold leading-tight text-textPrimary">
              {spot.name}
            </h3>
            {isStreet && spot.live_status && (
              <StatusBadge status={spot.live_status} />
            )}
          </div>
          {spot.address && (
            <p className="mt-0.5 truncate text-sm text-textMuted">{spot.address}</p>
          )}
        </div>
      </div>

      {spot.estimated && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-accent/40 bg-accent/15 px-3 py-2.5">
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="mt-0.5 shrink-0 text-accent"
          >
            <path
              d="M12 9V13M12 17H12.01M10.29 3.86L1.82 18A2 2 0 0 0 3.54 21H20.46A2 2 0 0 0 22.18 18L13.71 3.86A2 2 0 0 0 10.29 3.86Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <p className="text-xs leading-relaxed text-accent-light">
            <span className="font-bold">Estimated, not verified.</span> This spot is approximated
            from street layout, not a posted or confirmed space — always check signs before
            parking here.
          </p>
        </div>
      )}

      {/* Lot-specific: fee + hours prominently */}
      {!isStreet && spot.lot_info && (
        <div className="mt-4 flex gap-2">
          <div className="flex flex-1 flex-col gap-0.5 rounded-xl border border-white/8 bg-white/[0.03] p-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-textMuted">
              Fee
            </span>
            <span
              className={`text-base font-bold ${
                spot.lot_info.fee_display === "Free"
                  ? "text-lot"
                  : spot.lot_info.fee_display === "Fee unknown"
                    ? "text-textMuted"
                    : "text-accent-light"
              }`}
            >
              {spot.lot_info.fee_display}
            </span>
          </div>
          <div className="flex flex-1 flex-col gap-0.5 rounded-xl border border-white/8 bg-white/[0.03] p-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-textMuted">
              Hours
            </span>
            <span className="text-sm font-medium text-textPrimary leading-snug">
              {spot.lot_info.hours_display}
            </span>
          </div>
        </div>
      )}

      {/* Info chips row */}
      <div className="mt-4 flex flex-wrap gap-2">
        <InfoChip
          className="border-primary/30 bg-primary/10 text-primary-light text-sm"
          icon={
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M3 11L21 3L13 21L11 13L3 11Z" fill="currentColor" />
            </svg>
          }
          label={`${formatDistance(spot.distance)} away`}
        />
        <InfoChip
          className={
            isStreet
              ? "border-street/30 bg-street/10 text-street"
              : "border-lot/30 bg-lot/10 text-lot"
          }
          icon={
            isStreet ? (
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" />
              </svg>
            ) : (
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M3 9L12 4L21 9V20H15V14H9V20H3V9Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
              </svg>
            )
          }
          label={formatTypeLabel(spot.type)}
        />
        {/* Only show the generic fee chip for street spots (lots use the fee block above) */}
        {isStreet && (
          <InfoChip
            className={feeChipClass}
            icon={
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
                <path
                  d="M9 12h6M12 9v6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            }
            label={feeBadge}
          />
        )}
        {capacity && (
          <InfoChip
            className="border-white/10 bg-white/5 text-textMuted"
            icon={
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <rect
                  x="3"
                  y="11"
                  width="18"
                  height="10"
                  rx="1"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <path
                  d="M7 11V7C7 4.79086 8.79086 3 11 3H13C15.2091 3 17 4.79086 17 7V11"
                  stroke="currentColor"
                  strokeWidth="2"
                />
              </svg>
            }
            label={capacity}
          />
        )}
      </div>

      {/* Real SFMTA rule cards (street spots only) */}
      {isStreet && spot.time_rules.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          {spot.time_rules.map((rule, i) => (
            <TimeRuleCard key={i} rule={rule} />
          ))}
        </div>
      )}

      {isStreet && spot.time_rules.length === 0 && spot.estimated && (
        <div className="mt-3 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2.5 text-xs leading-relaxed text-accent-light">
          <span className="font-bold">⚠️ Estimated spot —</span> No official sign data available for
          this block. This parking space is approximated from street layout. Always check the actual
          posted signs before parking.
        </div>
      )}

      {isStreet && spot.time_rules.length === 0 && !spot.estimated && (
        <div className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs leading-relaxed text-textMuted">
          <span className="font-bold text-textPrimary">ℹ️ No posted restriction data found</span> for
          this block. Parking may be unrestricted — always verify with posted signs.
        </div>
      )}

      {/* Rules */}
      {rules && rules !== "No posted restrictions" && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5">
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="mt-0.5 shrink-0 text-accent"
          >
            <path
              d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z"
              stroke="currentColor"
              strokeWidth="2"
            />
            <path
              d="M12 8V12M12 16H12.01"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          <p className="text-xs leading-relaxed text-textMuted">{rules}</p>
        </div>
      )}
    </div>
  );
}
