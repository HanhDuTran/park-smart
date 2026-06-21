import type { LiveStatus, ParkingSpotWithDistance } from "../types/parking";

interface MarkerState {
  isBest: boolean;
  isSelected: boolean;
  liveStatus: LiveStatus | null;
  estimated?: boolean;
  // Parked mode's "this is the spot you're presumably parked at" highlight.
  isParked?: boolean;
  // Walking mode de-emphasizes street parking (still visible, less prominent).
  deemphasized?: boolean;
}

interface CreateMarkerOptions extends MarkerState {
  onClick: () => void;
}

function glowDelay(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) % 24;
  }
  return `${(hash / 10).toFixed(1)}s`;
}

/** Returns icon background color based on live status (street spots only). */
function streetIconStyle(liveStatus: LiveStatus | null): {
  bg: string;
  border: string;
  opacity: string;
} {
  if (liveStatus === "available") {
    return { bg: "#10b981", border: "rgba(255,255,255,0.6)", opacity: "1" };
  }
  if (liveStatus === "pending") {
    return { bg: "#f59e0b", border: "rgba(255,255,255,0.6)", opacity: "1" };
  }
  if (liveStatus === "taken") {
    return { bg: "#ef4444", border: "rgba(255,255,255,0.6)", opacity: "1" };
  }
  return { bg: "#3b82f6", border: "rgba(255,255,255,0.6)", opacity: "1" };
}

/** Pulsing glow class matching the icon's fill color — pending/taken stay
 * still since a pulsing "come park here" glow would contradict their meaning. */
function glowPulseClass(liveStatus: LiveStatus | null, estimated?: boolean): string | null {
  if (estimated) return null;
  if (liveStatus === "available") return "animate-glow-pulse-green";
  if (liveStatus == null) return "animate-glow-pulse-blue";
  return null;
}

export function createParkingMarkerElement(
  spot: ParkingSpotWithDistance,
  { isBest, isSelected, liveStatus, estimated, isParked, deemphasized, onClick }: CreateMarkerOptions
): HTMLDivElement {
  const wrapper = document.createElement("div");
  wrapper.dataset.spotType = spot.type;
  if (estimated) wrapper.dataset.estimated = "true";
  // animate-fade-in-up uses transform keyframes which override Mapbox's inline
  // transform: translate(x,y), putting all markers at pixel (0,0). Skip it.
  //
  // No `relative`/`transform`/`transition-transform` here either: Mapbox's
  // .mapboxgl-marker CSS already sets `position: absolute` on this element and
  // writes `transform: translate(x,y)` to it every render-loop frame. A
  // same-specificity `relative` class can win that cascade and silently drop
  // the marker back into normal flow, where it stacks on prior markers'
  // layout height instead of sitting at the map-relative coordinate Mapbox
  // intends (the actual cause of the positions drifting away from their
  // streets). A `transition-transform` class would separately fight those
  // per-frame writes and visibly lag the map during pan/zoom. Hover/selection
  // scaling is applied to the inner `icon` element instead, which Mapbox
  // never touches.
  wrapper.className = "flex items-center justify-center w-11 h-11 cursor-pointer";

  const isStreet = spot.type === "street";
  const icon = document.createElement("div");

  if (isStreet) {
    const { bg, border, opacity } = streetIconStyle(liveStatus);
    icon.className =
      `relative flex items-center justify-center rounded-full ${estimated ? "w-8 h-8" : "w-11 h-11"} ` +
      "font-bold text-base text-white transition-transform duration-200 ease-out hover:scale-110";
    icon.style.background = bg;
    // Estimated spots get a dashed border + lower opacity — a clearly
    // secondary hint, not mistakable for a verified spot.
    icon.style.border = estimated ? `2px dashed ${border}` : `3px solid ${border}`;
    icon.style.opacity = estimated ? "0.45" : opacity;
    icon.style.filter = "drop-shadow(0 4px 10px rgba(0,0,0,0.7))";
    icon.style.animationDelay = glowDelay(spot.id);
    const pulseClass = glowPulseClass(liveStatus, estimated);
    if (pulseClass) icon.classList.add(pulseClass);
  } else {
    icon.className =
      "relative flex items-center justify-center w-11 h-11 rounded-xl " +
      "font-bold text-base text-white border-[3px] border-white/60 bg-lot animate-glow-pulse-green " +
      "transition-transform duration-200 ease-out hover:scale-110";
    icon.style.filter = "drop-shadow(0 4px 10px rgba(0,0,0,0.7))";
    icon.style.animationDelay = glowDelay(spot.id);
  }

  // Dashed outer ring for estimated street spots
  if (isStreet && estimated) {
    const estimatedRing = document.createElement("div");
    estimatedRing.dataset.estimatedRing = "true";
    estimatedRing.style.cssText =
      "position:absolute;inset:-5px;border-radius:50%;border:2px dashed rgba(59,130,246,0.5);pointer-events:none;";
    wrapper.appendChild(estimatedRing);
  }

  icon.textContent = "P";
  wrapper.appendChild(icon);

  wrapper.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick();
  });

  updateParkingMarkerState(wrapper, { isBest, isSelected, liveStatus, estimated, isParked, deemphasized });
  return wrapper;
}

export function updateParkingMarkerState(
  element: HTMLElement,
  { isBest, isSelected, liveStatus, isParked, deemphasized }: MarkerState
): void {
  element.classList.toggle("scale-125", isSelected);
  element.classList.toggle("z-20", isSelected);
  element.classList.toggle("z-10", !isSelected);

  // ---- Walking-mode de-emphasis (street spots only, still tappable) ----
  element.classList.toggle("opacity-40", !!deemphasized);
  element.classList.toggle("scale-75", !!deemphasized && !isSelected);

  // ---- Parked-mode highlight ring — "this is the spot you're parked at" ----
  const existingParked = element.querySelector<HTMLElement>("[data-parked-ring]");
  if (isParked && !existingParked) {
    const ring = document.createElement("div");
    ring.dataset.parkedRing = "true";
    ring.className = "absolute inset-[-8px] rounded-full pointer-events-none";
    ring.style.border = "3px solid rgba(34,197,94,0.9)";
    ring.style.boxShadow = "0 0 14px rgba(34,197,94,0.7)";
    element.prepend(ring);
  } else if (!isParked && existingParked) {
    existingParked.remove();
  }

  // ---- Best-spot pulse ring ----
  const existingBest = element.querySelector<HTMLElement>("[data-pulse]");
  if (isBest && !existingBest) {
    const pulse = document.createElement("div");
    pulse.dataset.pulse = "true";
    pulse.className =
      "absolute inset-0 rounded-full animate-pulse-ring opacity-70 " +
      (element.dataset.spotType === "street" ? "bg-street" : "bg-lot");
    element.prepend(pulse);
  } else if (!isBest && existingBest) {
    existingBest.remove();
  }

  // ---- Live-status ring (street spots only) ----
  const existingStatus = element.querySelector<HTMLElement>("[data-status-ring]");
  if (existingStatus) existingStatus.remove();

  if (element.dataset.spotType === "street" && liveStatus) {
    const ring = document.createElement("div");
    ring.dataset.statusRing = liveStatus;

    if (liveStatus === "available") {
      ring.className = "absolute inset-[-6px] rounded-full animate-available-ring";
      ring.style.border = "2px solid rgba(16,185,129,0.7)";
      ring.style.background = "rgba(16,185,129,0.15)";
    } else if (liveStatus === "taken") {
      ring.className = "absolute inset-[-6px] rounded-full animate-taken-ring";
      ring.style.border = "2.5px dashed rgba(239,68,68,0.85)";
      ring.style.background = "rgba(239,68,68,0.08)";
    } else if (liveStatus === "pending") {
      ring.className = "absolute inset-[-8px] rounded-full animate-pending-ring";
      ring.style.border = "2px solid rgba(245,158,11,0.9)";
      ring.style.background = "rgba(245,158,11,0.12)";
    }

    element.prepend(ring);
  }

  // Update icon visual state in sync (opacity + border for taken)
  const icon = element.querySelector<HTMLElement>(
    "div:not([data-pulse]):not([data-status-ring]):not([data-estimated-ring]):not([data-parked-ring])"
  );
  if (icon && element.dataset.spotType === "street") {
    const isEstimated = element.dataset.estimated === "true";
    const { bg, border, opacity } = streetIconStyle(liveStatus);
    icon.style.background = bg;
    icon.style.border = isEstimated ? `2px dashed ${border}` : `3px solid ${border}`;
    icon.style.opacity = isEstimated ? "0.45" : opacity;
    icon.classList.remove("animate-glow-pulse-blue", "animate-glow-pulse-green");
    const pulseClass = glowPulseClass(liveStatus, isEstimated);
    if (pulseClass) icon.classList.add(pulseClass);
  }
}

export function createUserLocationElement(): HTMLDivElement {
  const wrapper = document.createElement("div");
  wrapper.className = "relative flex items-center justify-center w-7 h-7";

  const ring1 = document.createElement("div");
  ring1.className = "absolute inset-0 rounded-full bg-primary/40 animate-radar-ring";
  wrapper.appendChild(ring1);

  const ring2 = document.createElement("div");
  ring2.className = "absolute inset-0 rounded-full bg-primary/30 animate-radar-ring-mid";
  wrapper.appendChild(ring2);

  const ring3 = document.createElement("div");
  ring3.className = "absolute inset-0 rounded-full bg-primary/20 animate-radar-ring-outer";
  wrapper.appendChild(ring3);

  const dot = document.createElement("div");
  dot.className =
    "relative w-5 h-5 rounded-full bg-primary border-[3px] border-white shadow-glow";
  dot.style.filter = "drop-shadow(0 0 6px rgba(0, 180, 255, 0.9))";
  wrapper.appendChild(dot);

  return wrapper;
}
