import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";

import { BottomSheet } from "./components/BottomSheet";
import { ConfirmationModal } from "./components/ConfirmationModal";
import { LoadingScreen } from "./components/LoadingScreen";
import { MapView } from "./components/Map";
import type { SearchTarget } from "./components/Map";
import { ModeTabBar } from "./components/ModeTabBar";
import { NavigationPanel } from "./components/NavigationPanel";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { VoiceAssistantButton } from "./components/VoiceAssistantButton";
import { VoiceTranscriptOverlay } from "./components/VoiceTranscriptOverlay";
import type { AppMode } from "./hooks/useAppMode";
import { useAppMode } from "./hooks/useAppMode";
import { useParkingData } from "./hooks/useParkingData";
import { useParkedDetection } from "./hooks/useParkedDetection";
import { useParkedTimer } from "./hooks/useParkedTimer";
import { useRoute } from "./hooks/useRoute";
import { getCoverageAreaLabel, useUserLocation } from "./hooks/useUserLocation";
import type { VoiceAction } from "./hooks/useVoiceAssistant";
import { useVoiceAssistant } from "./hooks/useVoiceAssistant";
import type { ParkingSpotWithDistance, UserLocation } from "./types/parking";
import type { SearchResult } from "./types/search";
import { pickActiveMaxStayMinutes } from "./utils/formatRules";

interface PendingVoiceSelection {
  spotId: string;
  mode: "select" | "navigate";
}

const MODE_SEARCH_PLACEHOLDER: Record<AppMode, string> = {
  driving: "Search for parking…",
  parked: "Search for parking…",
  walking: "Search destination or transit stop",
};

const POI_OR_ADDRESS_ZOOM = 16;
const AREA_ZOOM = 13;

export default function App() {
  const {
    location,
    loading: locationLoading,
    isApproximate,
    permissionDenied,
    isDemoMode,
    retry: retryLocation,
  } = useUserLocation();
  const [approximateBannerDismissed, setApproximateBannerDismissed] = useState(false);
  const demoAreaLabel = getCoverageAreaLabel(location);

  // Browsing a searched place re-centers the parking-data fetch (so "nearby
  // parking" reflects the searched area) without touching the real GPS
  // `location`, which still drives the user's own blue dot on the map.
  const [searchCenter, setSearchCenter] = useState<UserLocation | null>(null);
  const [searchTarget, setSearchTarget] = useState<SearchTarget | null>(null);
  const effectiveLocation = searchCenter ?? location;

  const {
    spots,
    loading: dataLoading,
    error: dataError,
    streetDataUnavailable,
    refetch: refetchParkingData,
    reportPark,
    confirmPark,
    confirmLeave,
  } = useParkingData(effectiveLocation);

  const [selectedSpotId, setSelectedSpotId] = useState<string | null>(null);
  const [navigatingSpotId, setNavigatingSpotId] = useState<string | null>(null);
  const [searchFocusSignal, setSearchFocusSignal] = useState(0);
  const handleSearchNearby = () => setSearchFocusSignal((s) => s + 1);

  const { mode, setMode, parkedAt } = useAppMode();
  // The spot the user is presumably parked at — nearest STREET spot, snapshotted
  // once on entering Parked mode (not constantly re-picked on every poll refresh).
  const [parkedSpotId, setParkedSpotId] = useState<string | null>(null);
  const prevModeRef = useRef<AppMode>(mode);

  useEffect(() => {
    if (mode === "parked" && prevModeRef.current !== "parked") {
      const nearestStreet = spots.find((s) => s.type === "street") ?? null;
      setParkedSpotId(nearestStreet?.id ?? null);
      setSelectedSpotId(nearestStreet?.id ?? null);
    } else if (mode !== "parked" && prevModeRef.current === "parked") {
      setParkedSpotId(null);
    }
    prevModeRef.current = mode;
    // Only react to mode transitions, not every spots/selection change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Demo-day safety net: as soon as real spot data loads, auto-open the
  // nearest spot with real SFMTA time_rules so judges see colored rule cards
  // immediately instead of needing to click around. Fires once per session —
  // closing the sheet afterward must not bring it back.
  const demoAutoOpenedRef = useRef(false);
  useEffect(() => {
    if (!isDemoMode || demoAutoOpenedRef.current || spots.length === 0) return;
    const candidate = spots.find((s) => s.time_rules.length > 0);
    if (!candidate) return;
    demoAutoOpenedRef.current = true;
    setSelectedSpotId(candidate.id);
  }, [isDemoMode, spots]);

  const handleSelectSearchResult = (result: SearchResult) => {
    const zoom =
      result.place_type === "address" || result.place_type === "poi"
        ? POI_OR_ADDRESS_ZOOM
        : AREA_ZOOM;
    setSearchCenter({ lat: result.lat, lng: result.lng });
    setSearchTarget({ lat: result.lat, lng: result.lng, zoom, nonce: Date.now() });
  };

  // Voice assistant — drives the same state a manual tap/search would.
  const [pendingVoiceSelection, setPendingVoiceSelection] =
    useState<PendingVoiceSelection | null>(null);

  const handleVoiceAction = (action: VoiceAction) => {
    if (action.action === "none") return;

    setSearchCenter({ lat: action.lat, lng: action.lng });
    setSearchTarget({ lat: action.lat, lng: action.lng, zoom: POI_OR_ADDRESS_ZOOM, nonce: Date.now() });
    setPendingVoiceSelection({
      spotId: action.spot_id,
      mode: action.action === "start_navigation" ? "navigate" : "select",
    });
  };

  const voice = useVoiceAssistant({
    lat: location?.lat ?? null,
    lng: location?.lng ?? null,
    mode,
    onAction: handleVoiceAction,
  });

  // Once the re-centered fetch picks up the spot the voice assistant named,
  // apply the actual selection/navigation. Falls back to clearing the pending
  // state after a timeout if the spot never shows up (e.g. id mismatch).
  useEffect(() => {
    if (!pendingVoiceSelection) return;

    const match = spots.find((s) => s.id === pendingVoiceSelection.spotId);
    if (match) {
      if (pendingVoiceSelection.mode === "navigate") {
        setNavigatingSpotId(match.id);
        setSelectedSpotId(null);
      } else {
        setSelectedSpotId(match.id);
      }
      setPendingVoiceSelection(null);
      return;
    }

    const timer = setTimeout(() => setPendingVoiceSelection(null), 8000);
    return () => clearTimeout(timer);
  }, [spots, pendingVoiceSelection]);

  const navigatingSpot = spots.find((s) => s.id === navigatingSpotId) ?? null;

  const routeEnd = navigatingSpot
    ? { lat: navigatingSpot.lat, lng: navigatingSpot.lng }
    : null;

  const { route, loading: routeLoading, error: routeError } = useRoute(
    navigatingSpot ? location : null,
    routeEnd,
    mode === "walking" ? "walking" : "driving"
  );

  const { detectionPhase, countdown, confirm, deny } = useParkedDetection(
    location,
    spots,
    reportPark,
    confirmPark,
    confirmLeave
  );

  const parkedSpot = spots.find((s) => s.id === parkedSpotId) ?? null;
  const parkedMaxStayMinutes = pickActiveMaxStayMinutes(parkedSpot);
  const parkedCountdown = useParkedTimer(parkedAt, parkedMaxStayMinutes);

  const showLoadingScreen = locationLoading || !location;

  const selectedSpot = spots.find((s) => s.id === selectedSpotId) ?? null;

  const handleNavigate = (spot: ParkingSpotWithDistance) => {
    setNavigatingSpotId(spot.id);
    setSelectedSpotId(null);
  };

  const handleCancelNavigation = () => {
    setNavigatingSpotId(null);
  };

  const handleGoBackFromNavigation = () => {
    if (navigatingSpot) {
      setSelectedSpotId(navigatingSpot.id);
    }
    setNavigatingSpotId(null);
  };

  const handleExitDemoMode = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("demo");
    window.location.href = url.toString();
  };

  const modalVisible =
    detectionPhase.phase === "prompting_park" ||
    detectionPhase.phase === "prompting_leave";

  const modalTitle =
    detectionPhase.phase === "prompting_park"
      ? "Did you park here?"
      : detectionPhase.phase === "prompting_leave"
        ? "Are you leaving this spot?"
        : "";

  const modalSpotName =
    detectionPhase.phase === "prompting_park"
      ? detectionPhase.spot.name
      : detectionPhase.phase === "prompting_leave" && detectionPhase.spot
        ? detectionPhase.spot.name
        : undefined;

  return (
    <>
      <AnimatePresence>
        {showLoadingScreen && (
          <LoadingScreen
            key="loading-screen"
            message={permissionDenied ? "Location access needed" : undefined}
            subMessage={
              permissionDenied
                ? "ParkSmart needs your location to find nearby parking. We'll show an approximate area shortly if you'd rather not allow it."
                : undefined
            }
            onRetry={permissionDenied ? retryLocation : undefined}
          />
        )}
      </AnimatePresence>

    <div className="relative h-[100dvh] w-screen overflow-hidden bg-background font-sans text-textPrimary">
      <MapView
        location={location}
        spots={spots}
        selectedSpotId={selectedSpotId}
        onSelectSpot={setSelectedSpotId}
        route={route}
        searchTarget={searchTarget}
        mode={mode}
        parkedSpotId={parkedSpotId}
      />

      <TopBar
        location={location}
        onSelectResult={handleSelectSearchResult}
        focusSignal={searchFocusSignal}
        placeholder={MODE_SEARCH_PLACEHOLDER[mode]}
      />

      {isDemoMode && (
        <div className="absolute left-4 top-24 z-30 flex items-center gap-2 rounded-full border border-primary/30 bg-surface px-3 py-1.5 text-xs font-semibold text-primary-light shadow-2xl shadow-black/60 backdrop-blur-glass">
          <span>🎯 Demo Mode{demoAreaLabel ? ` — ${demoAreaLabel}` : ""}</span>
          <button
            type="button"
            onClick={handleExitDemoMode}
            className="text-primary-light/70 transition-colors hover:text-primary-light"
          >
            ✕ Exit
          </button>
        </div>
      )}

      {mode !== "parked" && (
        <VoiceAssistantButton
          status={voice.status}
          isSupported={voice.isSupported}
          micPermissionDenied={voice.micPermissionDenied}
          onToggle={voice.toggleMic}
        />
      )}
      <VoiceTranscriptOverlay
        status={voice.status}
        liveTranscript={voice.liveTranscript}
        lastUserMessage={voice.lastUserMessage}
        lastReply={voice.lastReply}
        error={voice.error}
      />

      {mode !== "parked" && (
        <Sidebar
          spots={spots}
          selectedSpotId={selectedSpotId}
          onSelectSpot={setSelectedSpotId}
          loading={dataLoading}
          error={dataError}
          streetDataUnavailable={streetDataUnavailable}
          onRetry={refetchParkingData}
          onSearchNearby={handleSearchNearby}
        />
      )}

      {!navigatingSpotId && (
        <BottomSheet
          spot={selectedSpot}
          onClose={() => setSelectedSpotId(null)}
          onNavigate={handleNavigate}
          onReportPark={reportPark}
          onConfirmPark={confirmPark}
          onConfirmLeave={confirmLeave}
          isParkedMode={mode === "parked"}
          countdown={mode === "parked" ? parkedCountdown : null}
          onFindNextSpot={mode === "parked" ? () => setMode("driving") : undefined}
        />
      )}

      <ModeTabBar mode={mode} onModeChange={setMode} />

      {navigatingSpot && (
        <NavigationPanel
          spot={navigatingSpot}
          route={route}
          loading={routeLoading}
          error={routeError}
          onCancel={handleCancelNavigation}
          onGoBack={handleGoBackFromNavigation}
        />
      )}

      <ConfirmationModal
        visible={modalVisible}
        title={modalTitle}
        spotName={modalSpotName}
        countdown={countdown}
        confirmLabel="Yes"
        denyLabel="No"
        onConfirm={confirm}
        onDeny={deny}
      />

      {isApproximate && !approximateBannerDismissed && (
        <div className="absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-surface px-4 py-2 text-xs text-textMuted backdrop-blur-glass md:bottom-6">
          <span>Using approximate location — GPS unavailable</span>
          <button
            type="button"
            onClick={() => setApproximateBannerDismissed(true)}
            aria-label="Dismiss"
            className="shrink-0 text-textMuted transition-colors hover:text-textPrimary"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      )}
    </div>
    </>
  );
}
