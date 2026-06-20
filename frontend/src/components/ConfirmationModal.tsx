import { AnimatePresence, motion } from "framer-motion";

interface ConfirmationModalProps {
  visible: boolean;
  title: string;
  spotName?: string;
  subtitle?: string;
  countdown: number;
  confirmLabel?: string;
  denyLabel?: string;
  onConfirm: () => void;
  onDeny: () => void;
}

export function ConfirmationModal({
  visible,
  title,
  spotName,
  subtitle,
  countdown,
  confirmLabel = "Yes",
  denyLabel = "No",
  onConfirm,
  onDeny,
}: ConfirmationModalProps) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" />

          {/* Card */}
          <motion.div
            className="relative z-10 w-full max-w-[22rem] rounded-2xl border border-white/10 bg-surface p-6 shadow-2xl shadow-black/70"
            initial={{ scale: 0.88, y: 24, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.88, y: 24, opacity: 0 }}
            transition={{ type: "spring", damping: 26, stiffness: 320 }}
          >
            {/* Icon */}
            <div className="mb-4 flex justify-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full border border-primary/30 bg-primary/15">
                <svg
                  width="26"
                  height="26"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M12 22C12 22 20 15.5 20 10C20 5.58172 16.4183 2 12 2C7.58172 2 4 5.58172 4 10C4 15.5 12 22 12 22Z"
                    stroke="#00b4ff"
                    strokeWidth="2"
                    strokeLinejoin="round"
                  />
                  <circle cx="12" cy="10" r="2.5" stroke="#00b4ff" strokeWidth="2" />
                </svg>
              </div>
            </div>

            <h2 className="text-center text-xl font-bold leading-snug text-textPrimary">
              {title}
            </h2>

            {spotName && (
              <p className="mt-1 text-center text-sm font-medium text-primary-light">
                {spotName}
              </p>
            )}

            {subtitle && (
              <p className="mt-1 text-center text-sm text-textMuted">{subtitle}</p>
            )}

            {/* Countdown bar */}
            <div className="mt-4 flex flex-col items-center gap-1.5">
              <p className="text-xs text-textMuted">
                Auto-confirming in{" "}
                <span className="font-semibold text-accent">{countdown}s</span>
              </p>
              <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-1000 ease-linear"
                  style={{ width: `${(countdown / 60) * 100}%` }}
                />
              </div>
            </div>

            {/* Buttons */}
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={onDeny}
                className="flex-1 rounded-xl border border-white/10 bg-white/5 py-3.5 text-sm font-semibold text-textPrimary transition-colors hover:bg-white/10 active:scale-95"
              >
                {denyLabel}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className="flex-1 rounded-xl bg-primary py-3.5 text-sm font-bold text-white shadow-glow transition-all hover:bg-primary-dark active:scale-95"
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
