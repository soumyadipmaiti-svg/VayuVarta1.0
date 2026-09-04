import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api/client';
import { useLoc } from '../contexts/LocContext';
import { useTheme } from '../contexts/ThemeContext';

import { AnimatedAIChat } from '../components/ui/animated-ai-chat';
import { Spotlight } from '../components/ui/spotlight';
import {
  Cloud, MapPin, Mic, Sun, Wind, Plus, MessageSquare, Trash2, Clock,
} from 'lucide-react';
import CosmicBG from '../components/ui/cosmic-bg';
import StarfieldBg from '../components/ui/starfield-bg';
import { useTypewriter } from '../hooks/useTypewriter';
import useSpeechRecognition from '../hooks/useSpeechRecognition';
import useSpeechSynthesis from '../hooks/useSpeechSynthesis';

interface Msg { role: string; message: string; created_at: string; }

interface Conversation {
  id: string;
  title: string;
  messages: Msg[];
  createdAt: string;
  updatedAt: string;
}

const SUGGESTIONS = [
  'Should I carry an umbrella today?',
  "What's the air quality like?",
  'Plan my outdoor weekend',
  'Explain why it feels so hot',
  'Compare weather in Kolkata vs Delhi',
  'Best time for a morning walk?',
];

const WEATHER_TIPS = [
  { icon: '🌧️', text: 'Rain prediction' },
  { icon: '🌡️', text: 'Temperature trends' },
  { icon: '💨', text: 'Wind & humidity' },
  { icon: '☀️', text: 'UV & sun safety' },
];

const VOICE_LANGUAGES = [
  { code: 'bn-BD', label: 'বাংলা' },
  { code: 'hi-IN', label: 'हिन्दी' },
  { code: 'en-US', label: 'English' },
  { code: 'ta-IN', label: 'தமிழ்' },
  { code: 'te-IN', label: 'తెలుగు' },
];

/** Detect if text is Bengali (Unicode or romanized Banglish) */
function isBengaliText(text: string): boolean {
  if (!text) return false;
  // Check for Bengali Unicode characters
  const bengaliChars = (text.match(/[\u0980-\u09FF]/g) || []).length;
  if (bengaliChars > text.length * 0.1) return true;
  // Check for common Banglish words
  const banglish = ['ami', 'tumi', 'kemon', 'ache', 'kothay', 'jai', 'khete', 'pani', 'bristi', 'mausam', 'gorom', 'thanda', 'bhalo', 'kharap', 'aschi', 'jacchi', 'korbo', 'hobe', 'ekhane', 'dupur', 'shokal', 'bikel', 'bolte', 'parbo', 'janina', 'sundi', 'bheeshon', 'khub', 'onek', 'ektu', 'shaon', 'nongor', 'mosla', 'bhat', 'mach', 'torkari', 'baarish', 'ghumiye', 'ghum', 'diner', 'raat', 'sokale', 'bikeler', 'phire', 'aaste', 'dharun', 'bujhte', 'parbo', 'laglo', 'lagche', 'hobe', 'hobena', 'korchhi', 'korchi', 'jachhi', 'jacchi', 'khabo', 'kheye', 'jaoya', 'nera', 'kora', 'kore', 'diye', 'niye'];
  const words = text.toLowerCase().split(/\s+/);
  const matches = words.filter(w => banglish.includes(w)).length;
  return matches >= 2;
}

const STORAGE_KEY = 'vayugpt_conversations';

// ─── Helpers ───────────────────────────────────────────────────────────────

function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveConversations(convos: Conversation[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(convos));
  } catch { /* ignore */ }
}

function genId(): string {
  return `conv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getTitleFromMessages(msgs: Msg[]): string {
  const firstUser = msgs.find((m) => m.role === 'user');
  if (!firstUser) return 'New Chat';
  const text = firstUser.message;
  return text.length > 40 ? text.slice(0, 40) + '…' : text;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ─── Component ─────────────────────────────────────────────────────────────

export default function Assistant() {
  const { activeId } = useLoc();
  const { theme } = useTheme();
  const [sending, setSending] = useState(false);
  const [showPills, setShowPills] = useState(false);
  const [voiceLang, setVoiceLang] = useState('en-US');
  const [readAloud, setReadAloud] = useState(true);
  const [voiceError, setVoiceError] = useState('');
  const lastInputWasVoice = useRef(false);

  // ── Conversation state ─────────────────────────────────────────────────
  const [conversations, setConversations] = useState<Conversation[]>(loadConversations);
  const [activeConvoId, setActiveConvoId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [input, setInput] = useState('');

  // Current conversation
  const activeConvo = conversations.find((c) => c.id === activeConvoId);
  const messages = activeConvo?.messages || [];

  const introText = "Hey there! I'm VayuGPT — your weather expert. Ask me anything about weather, forecasts, climate, or plan your day. What would you like to know?";
  const { displayed, done } = useTypewriter(introText, { speed: 25, startDelay: 600 });

  // ── Voice hooks ──────────────────────────────────────────────────────
  const {
    isSupported: speechSupported,
    isListening,
    interimTranscript,
    accumulatedTranscript,
    toggle: toggleListening,
  } = useSpeechRecognition({
    lang: voiceLang,
    continuous: true,
    onResult: (transcript) => {
      // Called when user clicks mic to STOP — send the accumulated text
      if (transcript.trim()) {
        setInput(transcript.trim());
        setVoiceError('');
        lastInputWasVoice.current = true;
        setTimeout(() => send(transcript.trim()), 100);
      }
    },
    onError: (err) => {
      console.warn('Speech recognition error:', err);
      if (err === 'language-not-supported') {
        setVoiceError(`${voiceLang} not available in your browser. Try English or Hindi.`);
      } else if (err === 'not-allowed') {
        setVoiceError('Microphone access denied. Please allow microphone in browser settings.');
      } else if (err !== 'no-speech') {
        setVoiceError('Voice input failed. Try again or type your question.');
      }
    },
  });

  const {
    isSupported: ttsSupported,
    isSpeaking,
    speak,
    stop: stopSpeaking,
  } = useSpeechSynthesis({ speed: 0.8 });

  useEffect(() => {
    const timer = setTimeout(() => setShowPills(true), 400);
    return () => clearTimeout(timer);
  }, []);

  // Save conversations to localStorage whenever they change
  useEffect(() => {
    saveConversations(conversations);
  }, [conversations]);

  // ── New Chat ───────────────────────────────────────────────────────────
  const startNewChat = useCallback(() => {
    const id = genId();
    const newConvo: Conversation = {
      id,
      title: 'New Chat',
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setConversations((prev) => [newConvo, ...prev]);
    setActiveConvoId(id);
    setShowHistory(false);
  }, []);

  // ── Select existing conversation ──────────────────────────────────────
  const selectConversation = useCallback((id: string) => {
    setActiveConvoId(id);
    setShowHistory(false);
  }, []);

  // ── Delete conversation ───────────────────────────────────────────────
  const deleteConversation = useCallback((id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeConvoId === id) {
      setActiveConvoId(null);
    }
  }, [activeConvoId]);

  // ── Update messages in active conversation ────────────────────────────
  const updateMessages = useCallback((updater: (prev: Msg[]) => Msg[]) => {
    setConversations((prev) =>
      prev.map((c) => {
        if (c.id !== activeConvoId) return c;
        const newMsgs = updater(c.messages);
        return {
          ...c,
          messages: newMsgs,
          title: c.title === 'New Chat' ? getTitleFromMessages(newMsgs) : c.title,
          updatedAt: new Date().toISOString(),
        };
      })
    );
  }, [activeConvoId]);

  // ── Send message (STREAMING) ──────────────────────────────────────────
  const send = useCallback(async (text?: string) => {
    const q = text || input.trim();
    if (!q || !activeId) return;
    setInput('');

    // Auto-create conversation if none active
    let targetConvoId = activeConvoId;
    if (!targetConvoId) {
      const id = genId();
      const userMsg: Msg = { role: 'user', message: q, created_at: new Date().toISOString() };
      setConversations((prev) => [{ id, title: getTitleFromMessages([userMsg]), messages: [userMsg], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, ...prev]);
      setActiveConvoId(id);
      targetConvoId = id;
    } else {
      const userMsg: Msg = { role: 'user', message: q, created_at: new Date().toISOString() };
      updateMessages((prev) => [...prev, userMsg]);
    }

    setSending(true);
    const convoId = targetConvoId!;
    let fullReply = '';

    // Add empty assistant message that we'll update as tokens stream in
    setConversations((prev) => prev.map((c) => c.id === convoId
      ? { ...c, messages: [...c.messages, { role: 'assistant', message: '', created_at: new Date().toISOString() }], updatedAt: new Date().toISOString() }
      : c));

    try {
      for await (const token of api.askAIStream({ location_id: activeId, message: q })) {
        fullReply += token;
        // Update the last assistant message with accumulated text
        const capturedReply = fullReply;
        setConversations((prev) => prev.map((c) => {
          if (c.id !== convoId) return c;
          const msgs = [...c.messages];
          const lastIdx = msgs.length - 1;
          msgs[lastIdx] = { ...msgs[lastIdx], message: capturedReply };
          return { ...c, messages: msgs, updatedAt: new Date().toISOString() };
        }));
      }
      // After streaming done: only speak if user sent via voice
      if (fullReply && lastInputWasVoice.current && ttsSupported) {
        speak(fullReply);
      }
      lastInputWasVoice.current = false;
    } catch {
      setConversations((prev) => prev.map((c) => {
        if (c.id !== convoId) return c;
        const msgs = [...c.messages];
        const lastIdx = msgs.length - 1;
        msgs[lastIdx] = { ...msgs[lastIdx], message: 'Sorry, something went wrong. Please try again. ⛅' };
        return { ...c, messages: msgs, updatedAt: new Date().toISOString() };
      }));
    }
    setSending(false);
  }, [input, activeId, activeConvoId, readAloud, ttsSupported, speak, updateMessages]);

  const isLight = theme === 'light';

  // ── No location → Hero Landing ──────────────────────────────────────────
  if (!activeId) {
    return (
      <div className="relative w-full h-full overflow-hidden" style={{ minHeight: 0 }}>
        <div className="absolute inset-0 z-0">
          <CosmicBG />
        </div>
        <div className="absolute inset-0 z-10 flex flex-col md:flex-row overflow-hidden">
          <div className="flex-1 flex flex-col justify-end px-5 sm:px-8 md:px-10 pb-4 pt-auto md:justify-center md:py-0 overflow-hidden min-h-0">
            <div className="max-w-xl w-full mx-auto md:mx-0">
              <div className="flex items-center gap-3 mb-5 sm:mb-6">
                <div className="w-12 h-12 rounded-full overflow-hidden shadow-lg shadow-accent-500/20 flex-shrink-0 ring-2 ring-white/10">
                  <img src="/logo.png" alt="Vayu GPT" className="w-full h-full object-cover" />
                </div>
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold text-white" style={{ fontFamily: 'var(--font-heading)' }}>VayuGPT</h1>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                    <p className="text-[11px] text-white/50">AI Weather Assistant · Online</p>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mb-3">
                {WEATHER_TIPS.map((tip) => (
                  <div key={tip.text} className="inline-flex items-center gap-1.5 bg-white/10 backdrop-blur-sm rounded-full px-3 py-1.5 text-white/80 text-xs">
                    <span>{tip.icon}</span>
                    <span>{tip.text}</span>
                  </div>
                ))}
                <div className="inline-flex items-center gap-1.5 bg-accent-500/20 backdrop-blur-sm rounded-full px-3 py-1.5 text-accent-300 text-xs border border-accent-500/30">
                  <Mic size={12} />
                  <span>Voice Chat</span>
                </div>
              </div>
              <p style={{ color: '#fff', fontSize: 'clamp(16px, 3.5vw, 24px)', lineHeight: 1.4, fontWeight: 400, minHeight: 54, marginBottom: 16 }}>
                {displayed}
                {!done && (
                  <span style={{ display: 'inline-block', width: 2, height: '1.1em', backgroundColor: '#fff', verticalAlign: 'middle', marginLeft: 2, animation: 'blink 1s step-end infinite' }} />
                )}
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', opacity: showPills ? 1 : 0, transform: showPills ? 'translateY(0)' : 'translateY(8px)', transition: 'opacity 0.5s ease, transform 0.5s ease' }}>
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => alert('Please select a location from the sidebar first, then ask me anything!')}
                    className="inline-flex items-center justify-center bg-white/90 text-black border border-white/20 rounded-full text-[13px] sm:text-[14px] px-4 py-2 hover:bg-white hover:scale-105 transition-all duration-200 cursor-pointer active:scale-95">
                    {s}
                  </button>
                ))}
              </div>
              <div className="mt-6 flex items-center gap-2 text-white/40 text-xs">
                <MapPin size={14} />
                <span>Select a location from the sidebar to start chatting</span>
              </div>
            </div>
          </div>
          <div className="flex-1 relative hidden md:flex items-center justify-center">
            <Spotlight className="-top-20 left-20" size={300} />
            <div className="relative w-full h-full max-w-[600px] max-h-[600px] flex items-center justify-center">
              {/* Clean hero — no 3D to avoid load glitch */}
              <div className="text-center" style={{ opacity: showPills ? 1 : 0, transform: showPills ? 'translateY(0)' : 'translateY(16px)', transition: 'opacity 0.8s ease 0.3s, transform 0.8s ease 0.3s' }}>
                <div className="w-24 h-24 rounded-full overflow-hidden mx-auto mb-6 shadow-2xl shadow-accent-500/30 ring-2 ring-white/10">
                  <img src="/logo.png" alt="VayuGPT" className="w-full h-full object-cover" />
                </div>
                <p className="text-white/40 text-sm">Ask me anything about the weather</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Chat view ────────────────────────────────────────────────────────────
  return (
    <div className="relative w-full h-full overflow-hidden flex flex-col" style={{ minHeight: 0 }}>
      {/* Background */}
      <div className="absolute inset-0 z-0">
        <StarfieldBg />
      </div>

      {/* Voice error banner */}
      {voiceError && (
        <div className="relative z-20 px-4 py-2 flex-shrink-0 bg-red-500/10 border-b border-red-500/20">
          <div className="flex items-center justify-center gap-2 text-red-400 text-xs">
            <span>{voiceError}</span>
            <button onClick={() => setVoiceError('')} className="text-ice-400 hover:text-white ml-1 underline">Dismiss</button>
          </div>
        </div>
      )}

      {/* Chat header — New Chat + History toggle */}
      <div className="relative z-20 flex items-center justify-between px-4 py-2 flex-shrink-0">
        <button
          onClick={startNewChat}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-white/80 text-xs font-medium transition-colors backdrop-blur-sm"
        >
          <Plus size={14} />
          New Chat
        </button>

        <button
          onClick={() => setShowHistory(!showHistory)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-white/80 text-xs font-medium transition-colors backdrop-blur-sm"
        >
          <Clock size={14} />
          History ({conversations.length})
        </button>
      </div>

      {/* History panel */}
      {showHistory && (
        <div className="relative z-20 mx-4 mb-2 max-h-[40vh] overflow-y-auto no-scrollbar rounded-xl bg-black/60 backdrop-blur-xl border border-white/[0.08] p-2">
          {conversations.length === 0 ? (
            <div className="text-center py-6 text-white/40 text-xs">
              <MessageSquare size={20} className="mx-auto mb-2 opacity-50" />
              No conversations yet
            </div>
          ) : (
            <div className="space-y-1">
              {conversations.map((c) => (
                <div
                  key={c.id}
                  onClick={() => selectConversation(c.id)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors group ${
                    c.id === activeConvoId
                      ? 'bg-accent-500/20 text-accent-400'
                      : 'text-white/70 hover:bg-white/5'
                  }`}
                >
                  <MessageSquare size={14} className="flex-shrink-0 opacity-50" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{c.title}</div>
                    <div className="text-[10px] text-white/40">
                      {c.messages.length} messages · {timeAgo(c.updatedAt)}
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteConversation(c.id); }}
                    className="p-1 text-white/20 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Animated AI Chat */}
      <div className="relative z-10 flex-1 min-h-0">
        <AnimatedAIChat
          messages={messages}
          sending={sending}
          onSend={send}
          isListening={isListening}
          isSpeaking={isSpeaking}
          onToggleMic={toggleListening}
          onStopSpeaking={stopSpeaking}
          onReadAloud={(text) => speak(text)}
          speechSupported={speechSupported}
          ttsSupported={ttsSupported}
          interimTranscript={interimTranscript}
          accumulatedTranscript={accumulatedTranscript}
          voiceLang={voiceLang}
          onVoiceLangChange={setVoiceLang}
          readAloud={readAloud}
          onReadAloudToggle={() => setReadAloud(!readAloud)}
        />
      </div>
    </div>
  );
}
