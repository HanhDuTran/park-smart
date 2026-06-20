import type { ParkingRules, ParkingSpot, ParkingTimeRule, ParkingType } from "../types/parking";

/** Turns a raw OSM `maxstay` value into a friendlier label. */
function formatMaxStay(maxStay: string): string {
  if (maxStay.toLowerCase() === "no") return "Unlimited stay";
  return `Max stay: ${maxStay}`;
}

/** Turns a raw `fee` string (e.g. "yes", "no", "yes - $2/hr") into a label. */
function formatFee(fee: string): string {
  const lower = fee.toLowerCase();
  if (lower === "yes") return "Paid";
  if (lower === "no") return "Free";
  if (lower.startsWith("yes")) return `Paid${fee.slice("yes".length)}`;
  if (lower.startsWith("no")) return `Free${fee.slice("no".length)}`;
  return fee;
}

/** One-line summary of a spot's rules, used in cards and the sidebar. */
export function formatRulesSummary(rules: ParkingRules): string {
  const parts: string[] = [];

  if (rules.max_stay) parts.push(formatMaxStay(rules.max_stay));
  if (rules.fee) parts.push(formatFee(rules.fee));
  if (rules.restriction) parts.push(rules.restriction);
  if (rules.street_cleaning) parts.push(`Street cleaning: ${rules.street_cleaning}`);

  if (parts.length === 0) return "No posted restrictions";

  return parts.join(" · ");
}

/** Short "Free" / "Paid" / "Unknown" badge text for a spot. */
export function formatFeeBadge(spot: ParkingSpot): string {
  if (spot.fee === false) return "Free";
  if (spot.fee === true) return "Paid";
  if (spot.rules.fee) return formatFee(spot.rules.fee);
  return "Unknown";
}

/** "N spaces" label, or null if capacity is unknown. */
export function formatCapacity(capacity: number | null): string | null {
  if (capacity === null) return null;
  return `${capacity} space${capacity === 1 ? "" : "s"}`;
}

/** Human label for a parking spot type. */
export function formatTypeLabel(type: ParkingType): string {
  return type === "street" ? "Street Parking" : "Parking Lot";
}

/** Parses a free-text OSM `maxstay` value (e.g. "2 hours", "2h", "90 min",
 * "1h 30m", bare "2") into a minute count for the parked-mode countdown.
 * Returns null when unparseable or explicitly unlimited. */
export function parseMaxStayMinutes(maxStay: string | null | undefined): number | null {
  if (!maxStay) return null;
  const s = maxStay.trim().toLowerCase();
  if (s === "no" || s === "unlimited" || s === "") return null;

  let totalMinutes = 0;
  let matched = false;

  const hourMatch = s.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/);
  if (hourMatch) {
    totalMinutes += parseFloat(hourMatch[1]) * 60;
    matched = true;
  }

  const minMatch = s.match(/(\d+(?:\.\d+)?)\s*(?:minutes?|mins?|m)\b/);
  if (minMatch && minMatch[0] !== hourMatch?.[0]) {
    totalMinutes += parseFloat(minMatch[1]);
    matched = true;
  }

  if (!matched) {
    // Bare number with no unit — OSM maxstay convention is typically hours
    // for street parking (e.g. maxstay=2 means "2 hours").
    const bare = s.match(/^(\d+(?:\.\d+)?)$/);
    if (bare) {
      totalMinutes = parseFloat(bare[1]) * 60;
      matched = true;
    }
  }

  return matched && totalMinutes > 0 ? Math.round(totalMinutes) : null;
}

/** Max-stay minutes to count down from in Parked mode — prefers a real,
 * currently-active SFMTA time-limit rule over the OSM-tag-derived fallback. */
export function pickActiveMaxStayMinutes(spot: ParkingSpot | null): number | null {
  if (!spot) return null;
  const activeLimits = spot.time_rules
    .filter((r) => r.rule_type === "time_limit" && r.is_active_now && r.max_stay_minutes != null)
    .map((r) => r.max_stay_minutes as number);
  if (activeLimits.length > 0) return Math.min(...activeLimits);
  return parseMaxStayMinutes(spot.rules.max_stay);
}

/** One-line sidebar summary built from real SFMTA time_rules, or null when
 * there's none (caller should fall back to formatRulesSummary). */
export function formatTimeRuleSidebarSummary(rules: ParkingTimeRule[]): string | null {
  if (rules.length === 0) return null;

  const timeLimit = rules.find((r) => r.rule_type === "time_limit");
  if (timeLimit) {
    const hrLabel = timeLimit.max_stay_minutes
      ? `${Math.round(timeLimit.max_stay_minutes / 60)}hr · `
      : "";
    return `${hrLabel}${timeLimit.days} ${timeLimit.hours}`;
  }

  const noParking = rules.find((r) => r.rule_type === "no_parking");
  if (noParking) return `🚫 No parking · ${noParking.days} ${noParking.hours}`;

  const cleaning = rules.find((r) => r.rule_type === "street_cleaning");
  if (cleaning) return `⚠️ Cleaning ${cleaning.cleaning_day ?? ""} ${cleaning.hours}`.trim();

  return rules[0].description;
}
