import { useEffect, useState } from "react";

import type { VoiceStatus } from "../hooks/useVoiceAssistant";

interface VoiceAssistantButtonProps {
  status: VoiceStatus;
  isSupported: boolean;
  micPermissionDenied: boolean;
  onToggle: () => void;
}

const TOOLTIP_SESSION_KEY = "voice_tooltip_shown";
const TOOLTIP_SHOW_DELAY_MS = 2000;
const TOOLTIP_AUTO_DISMISS_MS = 5000;

function MicIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Z"
        fill={active ? "#fff" : "currentColor"}
      />
      <path
        d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v3M9 21h6"
        stroke={active ? "#fff" : "currentColor"}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Spinner() {
  return (
    <svg
      className="h-5 w-5 animate-spin text-primary"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" strokeOpacity="0.3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function EqualizerBars() {
  return (
    <div className="flex h-4 items-center gap-1">
      <span className="w-1 rounded-full bg-primary animate-eq-bar [animation-delay:0ms]" />
      <span className="w-1 rounded-full bg-primary animate-eq-bar [animation-delay:150ms]" />
      <span className="w-1 rounded-full bg-primary animate-eq-bar [animation-delay:300ms]" />
    </div>
  );
}

/** Floating mic button — stacked above LocateButton so the two never overlap. */
export function VoiceAssistantButton({
  status,
  isSupported,
  micPermissionDenied,
  onToggle,
}: VoiceAssistantButtonProps) {
  const isListening = status === "listening";
  const isThinking = status === "thinking";
  const isSpeaking = status === "speaking";
  const isIdle = status === "idle";

  const [showFirstUseTooltip, setShowFirstUseTooltip] = useState(false);

  useEffect(() => {
    if (!isSupported) return;
    if (sessionStorage.getItem(TOOLTIP_SESSION_KEY)) return;

    let dismissTimer: ReturnType<typeof setTimeout> | undefined;
    const showTimer = setTimeout(() => {
      setShowFirstUseTooltip(true);
      sessionStorage.setItem(TOOLTIP_SESSION_KEY, "1");
      dismissTimer = setTimeout(() => setShowFirstUseTooltip(false), TOOLTIP_AUTO_DISMISS_MS);
    }, TOOLTIP_SHOW_DELAY_MS);

    return () => {
      clearTimeout(showTimer);
      if (dismissTimer) clearTimeout(dismissTimer);
    };
  }, [isSupported]);

  // Any real interaction supersedes the hint immediately.
  useEffect(() => {
    if (!isIdle) setShowFirstUseTooltip(false);
  }, [isIdle]);

  const stateClasses = isListening
    ? "border-red-400/60 bg-red-500/90 text-white"
    : isSpeaking
      ? "border-primary/50 bg-primary/90 text-white"
      : "border-white/10 bg-surface text-primary-light hover:text-primary";

  const tooltipVisible = micPermissionDenied || (isIdle && showFirstUseTooltip);

  return (
    <div className="absolute bottom-[calc(56px_+_env(safe-area-inset-bottom)_+_64px)] right-16 z-30 sm:bottom-24 sm:right-20">
      {tooltipVisible && (
        <div
          role="tooltip"
          className="absolute bottom-full right-0 mb-3 w-56 rounded-xl border border-white/10 bg-surface px-3 py-2.5 text-xs leading-relaxed text-textPrimary shadow-2xl shadow-black/60 backdrop-blur-glass"
        >
          {micPermissionDenied
            ? "Enable microphone in your browser settings to use voice search."
            : "🎤 Tap to ask about parking"}
          <div className="absolute -bottom-1.5 right-5 h-3 w-3 rotate-45 border-b border-r border-white/10 bg-surface" />
        </div>
      )}

      <button
        type="button"
        onClick={onToggle}
        aria-label={
          isListening ? "Stop listening" : isSpeaking ? "Stop speaking" : "Ask the parking assistant"
        }
        disabled={!isSupported}
        className={`relative flex h-14 w-14 items-center justify-center rounded-full border shadow-2xl shadow-black/50 backdrop-blur-glass transition-transform duration-150 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100 ${stateClasses}`}
      >
        {isListening && (
          <>
            <span className="absolute inset-0 rounded-full bg-red-500/50 animate-radar-ring" />
            <span className="absolute inset-0 rounded-full bg-red-500/35 animate-radar-ring-mid" />
            <span className="absolute inset-0 rounded-full bg-red-500/20 animate-radar-ring-outer" />
          </>
        )}

        {isSpeaking && (
          <span className="absolute inset-0 rounded-full bg-primary/50 animate-pulse-ring" />
        )}

        {isThinking ? (
          <Spinner />
        ) : isSpeaking ? (
          <EqualizerBars />
        ) : (
          <MicIcon active={isListening} />
        )}
      </button>
    </div>
  );
}
