import { useState, useCallback, useRef, useEffect } from 'react';

interface UseSpeechSynthesisOptions {
  speed?: number;
}

interface UseSpeechSynthesisReturn {
  isSupported: boolean;
  isSpeaking: boolean;
  /** Speak text aloud using Fish Audio TTS */
  speak: (text: string) => void;
  /** Stop current speech */
  stop: () => void;
}

/**
 * Hook for Fish Audio TTS via backend API.
 * Converts text to natural speech using Fish Audio's S2.1 Pro model.
 * Fish Audio auto-detects language from the text content —
 * Hindi text → Hindi voice, Bengali text → Bengali voice, etc.
 * Falls back to browser speechSynthesis if the backend is unavailable.
 */
export default function useSpeechSynthesis({ speed = 0.8 }: UseSpeechSynthesisOptions = {}): UseSpeechSynthesisReturn {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

  const getToken = useCallback(() => {
    try {
      const stored = localStorage.getItem('vv_auth');
      if (stored) {
        const parsed = JSON.parse(stored);
        return parsed?.state?.token || parsed?.token || null;
      }
    } catch {}
    return null;
  }, []);

  /** Clean text for TTS — remove markdown, emojis, extra whitespace */
  const cleanText = useCallback((text: string): string => {
    return text
      .replace(/[*_`~#]/g, '')
      // Remove common weather/UI emojis but keep text in all languages
      .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')
      .replace(/\n{2,}/g, '. ')
      .replace(/\n/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }, []);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    // Also stop browser TTS
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  }, []);

  const speak = useCallback(async (text: string) => {
    if (!text) return;

    stop();

    const cleaned = cleanText(text);
    if (!cleaned) return;

    const token = getToken();

    // Try Fish Audio TTS via backend
    if (token) {
      try {
        abortRef.current = new AbortController();
        setIsSpeaking(true);

        const response = await fetch(`${API_BASE}/api/v1/tts`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            text: cleaned,
            speed: speed,
          }),
          signal: abortRef.current.signal,
        });

        if (response.ok) {
          const audioBlob = await response.blob();
          const audioUrl = URL.createObjectURL(audioBlob);
          const audio = new Audio(audioUrl);

          audio.onended = () => {
            setIsSpeaking(false);
            URL.revokeObjectURL(audioUrl);
            audioRef.current = null;
          };
          audio.onerror = () => {
            setIsSpeaking(false);
            URL.revokeObjectURL(audioUrl);
            audioRef.current = null;
            fallbackBrowserTTS(cleaned);
          };

          audioRef.current = audio;
          await audio.play();
          return;
        } else {
          console.warn('Fish Audio TTS returned', response.status);
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
        console.warn('Fish Audio TTS failed, falling back to browser TTS:', err);
      }
    }

    // Fallback: browser speechSynthesis
    fallbackBrowserTTS(cleaned);
  }, [stop, cleanText, getToken, API_BASE, speed]);

  const fallbackBrowserTTS = useCallback((text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setIsSpeaking(false);
      return;
    }

    // Detect language from text for browser TTS fallback
    let lang = 'en-US';
    if (/[\u0900-\u097F]/.test(text)) lang = 'hi-IN';       // Devanagari
    else if (/[\u0980-\u09FF]/.test(text)) lang = 'bn-IN';   // Bengali
    else if (/[\u0B80-\u0BFF]/.test(text)) lang = 'ta-IN';   // Tamil
    else if (/[\u0C00-\u0C7F]/.test(text)) lang = 'te-IN';   // Telugu

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    const matchingVoice = window.speechSynthesis.getVoices().find(
      v => v.lang.startsWith(lang.split('-')[0])
    );
    if (matchingVoice) utterance.voice = matchingVoice;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
  }, []);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      abortRef.current?.abort();
    };
  }, []);

  return {
    isSupported: true,
    isSpeaking,
    speak,
    stop,
  };
}
