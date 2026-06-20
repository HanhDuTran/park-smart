export type ParkingType = "street" | "lot";

export type ParkingSource = "overpass" | "google_places" | "estimated";

export type LiveStatus = "available" | "taken" | "pending";

export interface ParkingRules {
  max_stay: string | null;
  fee: string | null;
  restriction: string | null;
  street_cleaning: string | null;
  hours: string | null;
  notes: string | null;
}

export interface LotInfo {
  fee_display: string;   // "Free" | "$3/hr" | "Paid" | "Fee unknown"
  hours_display: string; // "Mon-Fri 06:00-22:00" | "24/7" | "Hours unknown"
}

export type ParkingTimeRuleType =
  | "time_limit"
  | "no_parking"
  | "permit"
  | "paid"
  | "paid_permit"
  | "oversized_vehicle"
  | "street_cleaning"
  | "other";

/** A single real posted rule sourced from the official SFMTA parking
 * regulations / street sweeping datasets (street spots in SF only). */
export interface ParkingTimeRule {
  rule_type: ParkingTimeRuleType;
  days: string;
  hours: string;
  max_stay_minutes: number | null;
  description: string;
  cleaning_day: string | null;
  is_active_now: boolean;
}

export interface ParkingSpot {
  id: string;
  name: string;
  type: ParkingType;
  lat: number;
  lng: number;
  address: string | null;
  rules: ParkingRules;
  capacity: number | null;
  fee: boolean | null;
  source: ParkingSource;
  live_status: LiveStatus | null;
  lot_info: LotInfo | null;
  estimated: boolean;
  time_rules: ParkingTimeRule[];
}

export interface ParkingSpotWithDistance extends ParkingSpot {
  distance: number;
}

export interface ParkingResponse {
  spots: ParkingSpot[];
  count: number;
  street_data_unavailable: boolean;
}

export interface UserLocation {
  lat: number;
  lng: number;
}
