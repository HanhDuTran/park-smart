import { useCallback, useEffect, useRef, useState } from "react";

import { useSpeechRecognition } from "./useSpeechRecognition";
import { useSpeechSynthesis } from "./useSpeechSynthesis";

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const MAX_HISTORY_TURNS = 10;
const REQUEST_TIMEOUT_MS = 15_000;
// When TTS isn't supported at all, hold a synthetic "speaking" state for this
// long so the transcript overlay doesn't immediately start its fade-out
// countdown the instant the reply arrives — see useVoiceAssistant 1E(d).
const SIMULATED_SPEAKING_MS = 3_000;

export type VoiceStatus = "idle" | "listening" | "thinking" | "speaking";

export type VoiceAction =
  | { action: "none" }
  | { action: "select_spot"; spot_id: string; lat: number; lng: number }
  | { action: "start_navigation"; spot_id: string; lat: number; lng: number };

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

interface UseVoiceAssistantOptions {
  lat: number | null;
  lng: number | null;
  mode?: "driving" | "parked" | "walking";
  onAction?: (action: VoiceAction) => void;
}

interface UseVoiceAssistantResult {
  status: VoiceStatus;
  liveTranscript: string;
  lastUserMessage: string | null;
  lastReply: string | null;
  error: string | null;
  isSupported: boolean;
  micPermissionDenied: boolean;
  toggleMic: () => void;
}

export function useVoiceAssistant({
  lat,
  lng,
  mode = "driving",
  onAction,
}: UseVoiceAssistantOptions): UseVoiceAssistantResult {
  const recognition = useSpeechRecognition();
  const synthesis = useSpeechSynthesis();

  const [isThinking, setIsThinking] = useState(false);
  const [lastUserMessage, setLastUserMessage] = useState<string | null>(null);
  const [lastReply, setLastReply] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [simulatedSpeaking, setSimulatedSpeaking] = useState(false);

  const historyRef = useRef<ConversationMessage[]>([]);
  const wasListeningRef = useRef(false);

  const isSupported = recognition.isSupported && synthesis.isSupported;

  // Derived, not stored — avoids races between "we just asked it to speak"
  // and "isSpeaking caught up", since onstart fires asynchronously.
  const status: VoiceStatus = recognition.isListening
    ? "listening"
    : isThinking
      ? "thinking"
      : synthesis.isSpeaking || simulatedSpeaking
        ? "speaking"
        : "idle";

  const submit = useCallback(
    async (message: string) => {
      if (lat == null || lng == null) {
        setError("Still finding your location — try again in a moment.");
        return;
      }

      setIsThinking(true);
      setLastUserMessage(message);
      setError(null);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        const response = await fetch(`${API_BASE_URL}/api/voice`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message,
            conversation_history: historyRef.current,
            lat,
            lng,
            mode,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.detail ?? `Request failed (${response.status})`);
        }

        const data: { reply_text: string; action: VoiceAction | null } = await response.json();

        const newMessages: ConversationMessage[] = [
          { role: "user", content: message },
          { role: "assistant", content: data.reply_text },
        ];
        historyRef.current = [...historyRef.current, ...newMessages].slice(
          -MAX_HISTORY_TURNS * 2
        );

        setLastReply(data.reply_text);
        if (data.action && data.action.action !== "none") {
          onAction?.(data.action);
        }

        if (synthesis.isSupported) {
          synthesis.speak(data.reply_text);
        } else {
          // No TTS engine at all — hold a synthetic "speaking" beat so the
          // reply is visible for a moment instead of vanishing instantly.
          setSimulatedSpeaking(true);
          setTimeout(() => setSimulatedSpeaking(false), SIMULATED_SPEAKING_MS);
        }
      } catch (err) {
        const isTimeout = err instanceof DOMException && err.name === "AbortError";
        const rawMessage = err instanceof Error ? err.message : "";

        // Reset straight to idle on failure — don't speak a fallback or
        // linger in "thinking"/"speaking"; the overlay text is the signal.
        setLastReply(null);
        if (isTimeout) {
          setError("Couldn't reach the assistant — try again");
        } else if (/api[ _-]?key/i.test(rawMessage)) {
          setError("Voice assistant is currently unavailable");
        } else {
          setError("Couldn't reach the assistant — try again");
        }
      } finally {
        clearTimeout(timeoutId);
        setIsThinking(false);
      }
    },
    [lat, lng, mode, onAction, synthesis]
  );

  // When recognition finishes naturally (not cancelled), submit what was heard.
  useEffect(() => {
    if (wasListeningRef.current && !recognition.isListening && recognition.transcript.trim()) {
      submit(recognition.transcript.trim());
    }
    wasListeningRef.current = recognition.isListening;
  }, [recognition.isListening, recognition.transcript, submit]);

  // Surface recognition errors (no-speech, mic denied, etc).
  useEffect(() => {
    if (recognition.error) setError(recognition.error);
  }, [recognition.error]);

  const toggleMic = useCallback(() => {
    if (status === "idle") {
      if (!isSupported) {
        setError("Voice search isn't supported in this browser.");
        return;
      }
      setError(null);
      setLastReply(null);
      recognition.startListening();
    } else if (status === "listening") {
      recognition.stopListening();
    } else if (status === "speaking") {
      synthesis.stop();
      setSimulatedSpeaking(false);
    }
  }, [status, isSupported, recognition, synthesis]);

  return {
    status,
    liveTranscript: recognition.transcript,
    lastUserMessage,
    lastReply,
    error,
    isSupported,
    micPermissionDenied: recognition.permissionDenied,
    toggleMic,
  };
}
