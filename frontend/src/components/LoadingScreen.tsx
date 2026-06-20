import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

interface LoadingScreenProps {
  message?: string;
  subMessage?: string;
  onRetry?: () => void;
}

const CYCLE_PHASES = [
  { message: "Finding your location...", subMessage: "Hold tight — locating nearby parking for you" },
  { message: "Loading parking data...", subMessage: "Pulling real-time spots from OpenStreetMap" },
  { message: "Almost ready...", subMessage: "Just a few more seconds" },
];
const PHASE_DURATION_MS = 3000;

export function LoadingScreen({ message, subMessage, onRetry }: LoadingScreenProps) {
  const [phaseIndex, setPhaseIndex] = useState(0);

  // An explicit message override (e.g. permission-denied) skips the cycle
  // entirely; otherwise advance through the phases and hold on the last one.
  useEffect(() => {
    if (message) return;
    if (phaseIndex >= CYCLE_PHASES.length - 1) return;
    const timer = setTimeout(() => setPhaseIndex((i) => i + 1), PHASE_DURATION_MS);
    return () => clearTimeout(timer);
  }, [phaseIndex, message]);

  const displayMessage = message ?? CYCLE_PHASES[phaseIndex].message;
  const displaySubMessage = subMessage ?? CYCLE_PHASES[phaseIndex].subMessage;

  return (
    <motion.div
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(20,30,48,0.85),transparent_60%)]" />

      <motion.div
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="relative flex flex-col items-center gap-6"
      >
        <div className="relative flex h-24 w-24 items-center justify-center">
          <motion.div
            className="absolute inset-0 rounded-3xl bg-primary/20"
            animate={{ scale: [1, 1.6, 1], opacity: [0.6, 0, 0.6] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="absolute inset-0 rounded-3xl bg-primary/10"
            animate={{ scale: [1, 2.1, 1], opacity: [0.4, 0, 0.4] }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 0.4,
            }}
          />
          <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-primary shadow-glow">
            <svg
              width="32"
              height="32"
              viewBox="0 0 32 32"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M11 24V8H17C20.3137 8 23 10.6863 23 14C23 17.3137 20.3137 20 17 20H11"
                stroke="white"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>

        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-3xl font-extrabold tracking-tight text-textPrimary">
            Park<span className="text-primary">Smart</span>
          </h1>
          <AnimatePresence mode="wait">
            <motion.div
              key={message ?? phaseIndex}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="flex flex-col items-center gap-2"
            >
              <p className="text-sm font-medium text-textPrimary/80">{displayMessage}</p>
              <p className="max-w-xs text-xs text-textMuted">{displaySubMessage}</p>
            </motion.div>
          </AnimatePresence>
        </div>

        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white shadow-glow transition-colors hover:bg-primary-dark active:scale-95"
          >
            Try Again
          </button>
        ) : (
          <div className="flex items-center gap-1.5">
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="h-1.5 w-1.5 rounded-full bg-primary"
                animate={{ opacity: [0.25, 1, 0.25] }}
                transition={{
                  duration: 1.2,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: i * 0.2,
                }}
              />
            ))}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
