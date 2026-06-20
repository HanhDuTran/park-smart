export interface RouteStep {
  instruction: string;
  distance_meters: number;
  duration_seconds: number;
  maneuver_type: string;
}

export interface RouteData {
  distance_meters: number;
  duration_seconds: number;
  geometry: {
    type: "LineString";
    coordinates: [number, number][];
  };
  steps: RouteStep[];
}
