const EARTH_RADIUS_M = 6371000;

interface LatLng {
  lat: number;
  lng: number;
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Great-circle distance between two points, in meters. */
export function haversineDistance(from: LatLng, to: LatLng): number {
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);

  const a =
    sinDLat * sinDLat +
    Math.cos(toRadians(from.lat)) *
      Math.cos(toRadians(to.lat)) *
      sinDLng *
      sinDLng;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_M * c;
}

/** Formats a distance in meters as a short human-readable string. */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

/** Returns items annotated with `distance` from `origin`, nearest first. */
export function sortByDistance<T extends LatLng>(
  items: T[],
  origin: LatLng
): (T & { distance: number })[] {
  return items
    .map((item) => ({ ...item, distance: haversineDistance(origin, item) }))
    .sort((a, b) => a.distance - b.distance);
}
