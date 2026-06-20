import type { AppMode } from "../hooks/useAppMode";

interface ModeTabBarProps {
  mode: AppMode;
  onModeChange: (mode: AppMode) => void;
}

const TABS: { mode: AppMode; icon: string; label: string }[] = [
  { mode: "driving", icon: "🚗", label: "Driving" },
  { mode: "parked", icon: "🅿️", label: "Parked" },
  { mode: "walking", icon: "🚶", label: "Walking" },
];

/** Fixed bottom mode switcher — full-width tab bar on mobile, a floating
 * pill on desktop. Sits above the iPhone home-bar safe area. */
export function ModeTabBar({ mode, onModeChange }: ModeTabBarProps) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-white/10 bg-surface pb-[env(safe-area-inset-bottom)] shadow-2xl shadow-black/60 backdrop-blur-glass sm:inset-x-auto sm:bottom-6 sm:left-1/2 sm:w-auto sm:-translate-x-1/2 sm:rounded-full sm:border sm:pb-0"
    >
      {TABS.map((tab) => {
        const active = tab.mode === mode;
        return (
          <button
            key={tab.mode}
            type="button"
            onClick={() => onModeChange(tab.mode)}
            aria-pressed={active}
            className={`flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 px-4 transition-colors duration-200 sm:min-h-[44px] sm:min-w-[5.5rem] sm:flex-row sm:gap-1.5 sm:rounded-full sm:py-2.5 ${
              active
                ? "bg-primary text-white sm:shadow-glow"
                : "text-textMuted hover:text-textPrimary"
            }`}
          >
            <span className="text-lg sm:text-base">{tab.icon}</span>
            <span className="text-[11px] font-semibold sm:text-xs">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
