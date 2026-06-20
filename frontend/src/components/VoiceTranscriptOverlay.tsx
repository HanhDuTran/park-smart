import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import type { VoiceStatus } from "../hooks/useVoiceAssistant";

interface VoiceTranscriptOverlayProps {
  status: VoiceStatus;
  liveTranscript: string;
  lastUserMessage: string | null;
  lastReply: string | null;
  error: string | null;
}

const AUTO_FADE_MS = 6000;

export function VoiceTranscriptOverlay({
  status,
  liveTranscript,
  lastUserMessage,
  lastReply,
  error,
}: VoiceTranscriptOverlayProps) {
  const [pinned, setPinned] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // A fresh utterance always reopens the overlay.
  useEffect(() => {
    if (status === "listening") {
      setDismissed(false);
      setPinned(false);
    }
  }, [status]);

  // Auto-fade a few seconds after the assistant goes quiet, unless pinned.
  useEffect(() => {
    if (status !== "idle" || pinned || !lastReply) return;
    const timer = setTimeout(() => setDismissed(true), AUTO_FADE_MS);
    return () => clearTimeout(timer);
  }, [status, pinned, lastReply]);

  const hasContent = status === "listening" || status === "thinking" || !!lastReply || !!error;
  const visible = hasContent && !dismissed;

  const label = status === "listening" ? "Listening" : status === "thinking" ? "You said" : "ParkSmart";

  const bodyText =
    status === "listening"
      ? liveTranscript || "Listening…"
      : status === "thinking"
        ? lastUserMessage ?? "Thinking…"
        : error ?? lastReply ?? "";

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="voice-overlay"
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -20, opacity: 0 }}
          transition={{ type: "spring", damping: 28, stiffness: 320 }}
          onClick={() => setPinned(true)}
          // Anchored under TopBar rather than near the bottom so it never
          // collides with BottomSheet/NavigationPanel, which can grow tall
          // enough to cover a bottom-anchored toast entirely.
          className="absolute inset-x-4 top-24 z-40 mx-auto max-w-sm cursor-pointer rounded-2xl border border-white/10 bg-surface px-4 py-3 text-left shadow-2xl shadow-black/60 backdrop-blur-glass sm:top-28"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-textMuted">
                {label}
              </p>
              <p
                className={`mt-0.5 text-sm leading-snug ${
                  error ? "text-red-400" : "text-textPrimary"
                }`}
              >
                {bodyText}
              </p>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setDismissed(true);
              }}
              aria-label="Dismiss"
              className="shrink-0 rounded-full p-1 text-textMuted transition-colors hover:text-textPrimary"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M18 6L6 18M6 6L18 18"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
