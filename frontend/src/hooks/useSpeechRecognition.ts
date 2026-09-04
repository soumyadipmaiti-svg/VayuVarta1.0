import { useState, useCallback, useRef, useEffect } from 'react';

interface UseSpeechRecognitionOptions {
  /** Language code e.g. 'en-US', 'bn-BD', 'hi-IN' */
  lang?: string;
  /** Keep listening after first result (default: true) */
  continuous?: boolean;
  /** Called with final transcript when user stops speaking */
  onResult?: (transcript: string) => void;
  /** Called on error */
  onError?: (error: string) => void;
  /** Ms of silence before auto-sending (default: 2500) */
  silenceTimeout?: number;
}

interface UseSpeechRecognitionReturn {
  isSupported: boolean;
  isListening: boolean;
  interimTranscript: string;
  accumulatedTranscript: string;
  start: () => void;
  stop: () => void;
  toggle: () => void;
  languages: string[];
}

/**
 * Web Speech API hook with silence auto-detection.
 *
 * Flow:
 *  1. User clicks mic → starts listening
 *  2. User speaks → text accumulates
 *  3. User stops talking → 2.5s silence timer starts
 *  4. If user speaks again → timer resets
 *  5. If silence continues → auto-stops and sends
 *  6. User can also click mic again to send immediately
 */
export default function useSpeechRecognition({
  lang = 'en-US',
  continuous = true,
  onResult,
  onError,
  silenceTimeout = 2500,
}: UseSpeechRecognitionOptions = {}): UseSpeechRecognitionReturn {
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [accumulatedTranscript, setAccumulatedTranscript] = useState('');
  const recognitionRef = useRef<any>(null);
  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);
  const accumulatedRef = useRef('');
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isListeningRef = useRef(false);

  useEffect(() => { onResultRef.current = onResult; }, [onResult]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  const SpeechRecognition =
    typeof window !== 'undefined'
      ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      : null;
  const isSupported = !!SpeechRecognition;

  const languages: string[] = isSupported
    ? [
        'en-US', 'en-GB', 'en-IN',
        'hi-IN', 'bn-BD', 'bn-IN',
        'ta-IN', 'te-IN', 'ml-IN', 'kn-IN',
        'mr-IN', 'gu-IN', 'pa-IN',
        'es-ES', 'fr-FR', 'de-DE', 'pt-BR',
        'zh-CN', 'ja-JP', 'ko-KR',
        'ar-SA', 'ru-RU',
      ]
    : [];

  // ── Clear silence timer ────────────────────────────────────────────────
  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  // ── Send accumulated text and stop ─────────────────────────────────────
  const sendAndStop = useCallback(() => {
    clearSilenceTimer();
    recognitionRef.current?.stop();
    isListeningRef.current = false;
    setIsListening(false);
    setInterimTranscript('');

    const final = accumulatedRef.current.trim();
    accumulatedRef.current = '';
    setAccumulatedTranscript('');

    if (final) {
      onResultRef.current?.(final);
    }
  }, [clearSilenceTimer]);

  // ── Start silence timer (auto-send after silence) ─────────────────────
  const startSilenceTimer = useCallback(() => {
    clearSilenceTimer();
    silenceTimerRef.current = setTimeout(() => {
      // Silence timeout — auto-send if we have text
      if (accumulatedRef.current.trim()) {
        sendAndStop();
      }
    }, silenceTimeout);
  }, [clearSilenceTimer, silenceTimeout, sendAndStop]);

  // ── Stop (manual — same as sendAndStop) ───────────────────────────────
  const stop = useCallback(() => {
    sendAndStop();
  }, [sendAndStop]);

  // ── Start listening ────────────────────────────────────────────────────
  const start = useCallback(() => {
    if (!SpeechRecognition) {
      onErrorRef.current?.('Speech recognition is not supported in this browser. Try Chrome or Edge.');
      return;
    }

    // Stop any existing session
    recognitionRef.current?.stop();
    clearSilenceTimer();

    // Reset
    accumulatedRef.current = '';
    setAccumulatedTranscript('');
    setInterimTranscript('');

    const recognition = new SpeechRecognition();
    recognition.lang = lang;
    recognition.continuous = continuous;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      isListeningRef.current = true;
      setIsListening(true);
      setInterimTranscript('');
    };

    recognition.onresult = (event: any) => {
      let interim = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          accumulatedRef.current += transcript + ' ';
          setAccumulatedTranscript(accumulatedRef.current.trim());
          // New speech detected → reset silence timer
          startSilenceTimer();
        } else {
          interim += transcript;
        }
      }

      setInterimTranscript(interim);
    };

    recognition.onerror = (event: any) => {
      if (event.error === 'no-speech') {
        // No speech detected — start/restart silence timer
        if (accumulatedRef.current.trim()) {
          startSilenceTimer();
        }
        return;
      }
      if (event.error === 'aborted') {
        // Manual stop or restart
        const final = accumulatedRef.current.trim();
        if (final) {
          isListeningRef.current = false;
          setIsListening(false);
          accumulatedRef.current = '';
          setAccumulatedTranscript('');
          setInterimTranscript('');
          onResultRef.current?.(final);
        }
        return;
      }
      let errorMsg = event.error || 'Speech recognition failed';
      if (event.error === 'language-not-supported' || event.error === 'language') {
        errorMsg = 'language-not-supported';
      } else if (event.error === 'not-allowed') {
        errorMsg = 'not-allowed';
      }
      onErrorRef.current?.(errorMsg);
      isListeningRef.current = false;
      setIsListening(false);
      setInterimTranscript('');
    };

    recognition.onend = () => {
      // Browser auto-stopped (common in non-continuous or after silence)
      // If we have accumulated text, auto-send
      const final = accumulatedRef.current.trim();
      if (final && isListeningRef.current) {
        isListeningRef.current = false;
        setIsListening(false);
        accumulatedRef.current = '';
        setAccumulatedTranscript('');
        setInterimTranscript('');
        clearSilenceTimer();
        onResultRef.current?.(final);
        return;
      }
      // No text yet — might be a brief pause, try to restart
      if (isListeningRef.current) {
        try {
          recognition.start();
        } catch {
          isListeningRef.current = false;
          setIsListening(false);
        }
      } else {
        setIsListening(false);
        setInterimTranscript('');
      }
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch {
      // Already started
    }
  }, [lang, continuous, SpeechRecognition, startSilenceTimer, clearSilenceTimer]);

  const toggle = useCallback(() => {
    if (isListening) {
      stop();
    } else {
      start();
    }
  }, [isListening, start, stop]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearSilenceTimer();
      recognitionRef.current?.stop();
    };
  }, [clearSilenceTimer]);

  return {
    isSupported,
    isListening,
    interimTranscript,
    accumulatedTranscript,
    start,
    stop,
    toggle,
    languages,
  };
}
