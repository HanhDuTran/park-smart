import type { Map as MapboxMap } from "mapbox-gl";

import type { UserLocation } from "../types/parking";

interface LocateButtonProps {
  map: MapboxMap | null;
  location: UserLocation | null;
}

/** Floating button that flies the camera back to the user's live location. */
export function LocateButton({ map, location }: LocateButtonProps) {
  const handleClick = () => {
    if (!map || !location) return;

    map.flyTo({
      center: [location.lng, location.lat],
      zoom: 16,
      pitch: 45,
      bearing: 0,
      duration: 1000,
      essential: true,
    });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Center map on my location"
      className="absolute bottom-[calc(56px_+_env(safe-area-inset-bottom)_+_8px)] right-4 z-30 flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-surface text-primary-light shadow-2xl shadow-black/50 backdrop-blur-glass transition-transform duration-150 hover:scale-105 hover:text-primary active:scale-95 sm:bottom-6 sm:right-6"
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
        <path d="M12 1.5V4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M12 19.5V22.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M22.5 12H19.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M4.5 12H1.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M15.5 8.5L10.8 10.8L8.5 15.5L13.2 13.2L15.5 8.5Z" fill="currentColor" />
      </svg>
    </button>
  );
}
