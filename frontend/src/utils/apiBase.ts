/** Backend base URL. Defaults to whatever host the page itself was loaded
 * from (same hostname, port 8000) rather than a hardcoded "localhost", so
 * API calls keep working when the app is opened from a phone via the
 * laptop's LAN IP (e.g. http://192.168.1.45:5173) instead of localhost. */
export const API_BASE_URL: string =
  import.meta.env.VITE_API_URL ?? `http://${window.location.hostname}:8000`;
