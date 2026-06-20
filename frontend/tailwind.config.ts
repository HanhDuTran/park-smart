import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#080c14",
        surface: "rgba(10,14,22,0.88)",
        primary: {
          DEFAULT: "#00b4ff",
          dark: "#0090d4",
          light: "#60d4ff",
        },
        accent: {
          DEFAULT: "#f59e0b",
          light: "#fcd34d",
        },
        street: "#3b82f6",
        lot: "#10b981",
        textPrimary: "#f1f5f9",
        textMuted: "#64748b",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      backdropBlur: {
        glass: "16px",
      },
      boxShadow: {
        glow: "0 0 20px rgba(0, 180, 255, 0.45)",
        "glow-lg": "0 0 36px rgba(0, 180, 255, 0.4)",
        "glow-blue": "0 0 18px rgba(59, 130, 246, 0.6)",
        "glow-green": "0 0 18px rgba(16, 185, 129, 0.6)",
        "glow-amber": "0 0 18px rgba(245, 158, 11, 0.5)",
        "glow-red": "0 0 18px rgba(239, 68, 68, 0.5)",
        marker: "0 4px 12px rgba(0,0,0,0.7), 0 1px 3px rgba(0,0,0,0.5)",
      },
      keyframes: {
        "pulse-ring": {
          "0%": { transform: "scale(0.8)", opacity: "0.8" },
          "70%": { transform: "scale(2.2)", opacity: "0" },
          "100%": { transform: "scale(0.8)", opacity: "0" },
        },
        "radar-ring": {
          "0%": { transform: "scale(1)", opacity: "0.6" },
          "100%": { transform: "scale(3.5)", opacity: "0" },
        },
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "glow-pulse-blue": {
          "0%, 100%": {
            boxShadow:
              "0 0 10px 2px rgba(59,130,246,0.5), 0 0 22px rgba(59,130,246,0.2), 0 4px 12px rgba(0,0,0,0.6)",
          },
          "50%": {
            boxShadow:
              "0 0 20px 5px rgba(59,130,246,0.85), 0 0 40px rgba(59,130,246,0.35), 0 4px 12px rgba(0,0,0,0.6)",
          },
        },
        "glow-pulse-green": {
          "0%, 100%": {
            boxShadow:
              "0 0 10px 2px rgba(16,185,129,0.5), 0 0 22px rgba(16,185,129,0.2), 0 4px 12px rgba(0,0,0,0.6)",
          },
          "50%": {
            boxShadow:
              "0 0 20px 5px rgba(16,185,129,0.85), 0 0 40px rgba(16,185,129,0.35), 0 4px 12px rgba(0,0,0,0.6)",
          },
        },
        // Status ring animations
        "available-ring": {
          "0%": { transform: "scale(1)", opacity: "0.5" },
          "60%": { transform: "scale(1.8)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "0" },
        },
        "taken-ring": {
          "0%, 100%": { opacity: "0.8", transform: "scale(1)" },
          "50%": { opacity: "0.4", transform: "scale(1.05)" },
        },
        "pending-ring": {
          "0%": { transform: "scale(0.9)", opacity: "0.9" },
          "50%": { transform: "scale(1.7)", opacity: "0.3" },
          "100%": { transform: "scale(0.9)", opacity: "0" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "eq-bar": {
          "0%, 100%": { height: "4px" },
          "50%": { height: "16px" },
        },
      },
      animation: {
        "pulse-ring": "pulse-ring 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "radar-ring": "radar-ring 2.5s ease-out infinite",
        "radar-ring-mid": "radar-ring 2.5s ease-out 0.8s infinite",
        "radar-ring-outer": "radar-ring 2.5s ease-out 1.6s infinite",
        "fade-in-up": "fade-in-up 0.4s ease-out forwards",
        "glow-pulse-blue": "glow-pulse-blue 2.4s ease-in-out infinite",
        "glow-pulse-green": "glow-pulse-green 2.4s ease-in-out infinite",
        "available-ring": "available-ring 2.5s ease-out infinite",
        "taken-ring": "taken-ring 1.5s ease-in-out infinite",
        "pending-ring": "pending-ring 1.2s ease-out infinite",
        shimmer: "shimmer 1.6s ease-in-out infinite",
        "eq-bar": "eq-bar 0.8s ease-in-out infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
