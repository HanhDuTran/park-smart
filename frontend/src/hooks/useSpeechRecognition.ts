import { useCallback, useEffect, useRef, useState } from "react";

interface UseSpeechRecognitionResult {
  isListening: boolean;
  transcript: string;
  startListening: () => void;
  stopListening: () => void;
  isSupported: boolean;
  error: string | null;
  // Specifically true on a "not-allowed"/"service-not-allowed" error, so
  // callers can show a targeted mic-permission prompt instead of generic text.
  permissionDenied: boolean;
}

// Absolute backstop in case onspeechend/onend never fire (flaky browser
// implementations) — without this a stuck "listening" state would hang forever.
const SILENCE_TIMEOUT_MS = 8000;

function getRecognitionConstructor(): SpeechRecognitionConstructor | null {
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

export function useSpeechRecognition(): UseSpeechRecognitionResult {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isSupported = getRecognitionConstructor() !== null;

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const startListening = useCallback(() => {
    const Ctor = getRecognitionConstructor();
    if (!Ctor) {
      setError("Speech recognition isn't supported in this browser.");
      return;
    }

    setError(null);
    setPermissionDenied(false);
    setTranscript("");

    const recognition = new Ctor();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let combined = "";
      for (let i = 0; i < event.results.length; i++) {
        combined += event.results[i][0].transcript;
      }
      setTranscript(combined);
    };

    recognition.onerror = (event) => {
      if (event.error === "aborted") return; // our own cancel — not a real error
      if (event.error === "no-speech") {
        setError("Didn't catch that — try again.");
      } else if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setPermissionDenied(true);
        setError("Enable microphone in your browser settings to use voice search.");
      } else {
        setError("Speech recognition error — please try again.");
      }
    };

    recognition.onspeechend = () => recognition.stop();

    recognition.onend = () => {
      clearSilenceTimer();
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    setIsListening(true);
    recognition.start();

    silenceTimerRef.current = setTimeout(() => recognition.stop(), SILENCE_TIMEOUT_MS);
  }, [clearSilenceTimer]);

  // Explicit cancel (e.g. user tapped the mic again) — clears the transcript
  // so callers can tell this apart from a normal finished utterance.
  const stopListening = useCallback(() => {
    clearSilenceTimer();
    setTranscript("");
    recognitionRef.current?.abort();
  }, [clearSilenceTimer]);

  useEffect(() => {
    return () => {
      clearSilenceTimer();
      recognitionRef.current?.abort();
    };
  }, [clearSilenceTimer]);

  return {
    isListening,
    transcript,
    startListening,
    stopListening,
    isSupported,
    error,
    permissionDenied,
  };
}
