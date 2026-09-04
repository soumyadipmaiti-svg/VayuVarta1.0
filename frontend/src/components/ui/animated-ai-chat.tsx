"use client";

import { useEffect, useRef, useCallback, useTransition } from "react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import {
    ImageIcon,
    MonitorIcon,
    Paperclip,
    SendIcon,
    XIcon,
    LoaderIcon,
    Sparkles,
    Command,
    Mic,
    MicOff,
    Volume2,
    VolumeX,
    Cloud,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import * as React from "react"

interface UseAutoResizeTextareaProps {
    minHeight: number;
    maxHeight?: number;
}

function useAutoResizeTextarea({
    minHeight,
    maxHeight,
}: UseAutoResizeTextareaProps) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const adjustHeight = useCallback(
        (reset?: boolean) => {
            const textarea = textareaRef.current;
            if (!textarea) return;

            if (reset) {
                textarea.style.height = `${minHeight}px`;
                return;
            }

            textarea.style.height = `${minHeight}px`;
            const newHeight = Math.max(
                minHeight,
                Math.min(
                    textarea.scrollHeight,
                    maxHeight ?? Number.POSITIVE_INFINITY
                )
            );

            textarea.style.height = `${newHeight}px`;
        },
        [minHeight, maxHeight]
    );

    useEffect(() => {
        const textarea = textareaRef.current;
        if (textarea) {
            textarea.style.height = `${minHeight}px`;
        }
    }, [minHeight]);

    useEffect(() => {
        const handleResize = () => adjustHeight();
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, [adjustHeight]);

    return { textareaRef, adjustHeight };
}

interface CommandSuggestion {
    icon: React.ReactNode;
    label: string;
    description: string;
    prefix: string;
}

interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  containerClassName?: string;
  showRing?: boolean;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, containerClassName, showRing = true, ...props }, ref) => {
    const [isFocused, setIsFocused] = React.useState(false);
    
    return (
      <div className={cn(
        "relative",
        containerClassName
      )}>
        <textarea
          className={cn(
            "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
            "transition-all duration-200 ease-in-out",
            "placeholder:text-muted-foreground",
            "disabled:cursor-not-allowed disabled:opacity-50",
            showRing ? "focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0" : "",
            className
          )}
          ref={ref}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          {...props}
        />
        
        {showRing && isFocused && (
          <motion.span 
            className="absolute inset-0 rounded-md pointer-events-none ring-2 ring-offset-0 ring-violet-500/30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />
        )}

        {props.onChange && (
          <div 
            className="absolute bottom-2 right-2 opacity-0 w-2 h-2 bg-violet-500 rounded-full"
            style={{
              animation: 'none',
            }}
            id="textarea-ripple"
          />
        )}
      </div>
    )
  }
)
Textarea.displayName = "Textarea"

// ─── VayuGPT Props ─────────────────────────────────────────────────────
interface AnimatedAIChatProps {
  messages?: { role: string; message: string; created_at: string }[];
  sending?: boolean;
  onSend?: (text: string) => void;
  isListening?: boolean;
  isSpeaking?: boolean;
  onToggleMic?: () => void;
  onStopSpeaking?: () => void;
  onReadAloud?: (text: string) => void;
  speechSupported?: boolean;
  ttsSupported?: boolean;
  interimTranscript?: string;
  accumulatedTranscript?: string;
  voiceLang?: string;
  onVoiceLangChange?: (lang: string) => void;
  readAloud?: boolean;
  onReadAloudToggle?: () => void;
}

export function AnimatedAIChat({
  messages = [],
  sending = false,
  onSend,
  isListening = false,
  isSpeaking = false,
  onToggleMic,
  onStopSpeaking,
  onReadAloud,
  speechSupported = false,
  ttsSupported = false,
  interimTranscript = "",
  accumulatedTranscript = "",
  voiceLang = "en-US",
  onVoiceLangChange,
  readAloud = true,
  onReadAloudToggle,
}: AnimatedAIChatProps) {
    const [value, setValue] = useState("");
    const [attachments, setAttachments] = useState<string[]>([]);
    const [isTyping, setIsTyping] = useState(false);
    const [isPending, startTransition] = useTransition();
    const [activeSuggestion, setActiveSuggestion] = useState<number>(-1);
    const [showCommandPalette, setShowCommandPalette] = useState(false);
    const [recentCommand, setRecentCommand] = useState<string | null>(null);
    const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
    const { textareaRef, adjustHeight } = useAutoResizeTextarea({
        minHeight: 60,
        maxHeight: 200,
    });
    const [inputFocused, setInputFocused] = useState(false);
    const commandPaletteRef = useRef<HTMLDivElement>(null);


    const commandSuggestions: CommandSuggestion[] = [
        { 
            icon: <Cloud className="w-4 h-4" />, 
            label: "Rain Forecast", 
            description: "Will it rain today?", 
            prefix: "/rain" 
        },
        { 
            icon: <Sparkles className="w-4 h-4" />, 
            label: "Weather AI", 
            description: "Ask anything about weather", 
            prefix: "/ask" 
        },
        { 
            icon: <MonitorIcon className="w-4 h-4" />, 
            label: "Plan Day", 
            description: "Plan your outdoor activities", 
            prefix: "/plan" 
        },
        { 
            icon: <ImageIcon className="w-4 h-4" />, 
            label: "UV Index", 
            description: "Sun safety recommendations", 
            prefix: "/uv" 
        },
    ];

    // Sync sending prop
    useEffect(() => {
        setIsTyping(sending);
    }, [sending]);

    // Scroll to bottom on new messages
    useEffect(() => {
        const el = document.getElementById("chat-scroll");
        if (el) el.scrollTop = el.scrollHeight;
    }, [messages, sending]);

    useEffect(() => {
        if (value.startsWith('/') && !value.includes(' ')) {
            setShowCommandPalette(true);
            
            const matchingSuggestionIndex = commandSuggestions.findIndex(
                (cmd) => cmd.prefix.startsWith(value)
            );
            
            if (matchingSuggestionIndex >= 0) {
                setActiveSuggestion(matchingSuggestionIndex);
            } else {
                setActiveSuggestion(-1);
            }
        } else {
            setShowCommandPalette(false);
        }
    }, [value]);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            setMousePosition({ x: e.clientX, y: e.clientY });
        };

        window.addEventListener('mousemove', handleMouseMove);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
        };
    }, []);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            const commandButton = document.querySelector('[data-command-button]');
            
            if (commandPaletteRef.current && 
                !commandPaletteRef.current.contains(target) && 
                !commandButton?.contains(target)) {
                setShowCommandPalette(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (showCommandPalette) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActiveSuggestion(prev => 
                    prev < commandSuggestions.length - 1 ? prev + 1 : 0
                );
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActiveSuggestion(prev => 
                    prev > 0 ? prev - 1 : commandSuggestions.length - 1
                );
            } else if (e.key === 'Tab' || e.key === 'Enter') {
                e.preventDefault();
                if (activeSuggestion >= 0) {
                    const selectedCommand = commandSuggestions[activeSuggestion];
                    setValue(selectedCommand.prefix + ' ');
                    setShowCommandPalette(false);
                    
                    setRecentCommand(selectedCommand.label);
                    setTimeout(() => setRecentCommand(null), 3500);
                }
            } else if (e.key === 'Escape') {
                e.preventDefault();
                setShowCommandPalette(false);
            }
        } else if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (value.trim()) {
                handleSendMessage();
            }
        }
    };

    const handleSendMessage = () => {
        if (value.trim()) {
            if (onSend) {
                onSend(value.trim());
                setValue("");
                adjustHeight(true);
            } else {
                startTransition(() => {
                    setIsTyping(true);
                    setTimeout(() => {
                        setIsTyping(false);
                        setValue("");
                        adjustHeight(true);
                    }, 3000);
                });
            }
        }
    };

    const handleAttachFile = () => {
        const mockFileName = `file-${Math.floor(Math.random() * 1000)}.pdf`;
        setAttachments(prev => [...prev, mockFileName]);
    };

    const removeAttachment = (index: number) => {
        setAttachments(prev => prev.filter((_, i) => i !== index));
    };
    
    const selectCommandSuggestion = (index: number) => {
        const selectedCommand = commandSuggestions[index];
        setValue(selectedCommand.prefix + ' ');
        setShowCommandPalette(false);
        
        setRecentCommand(selectedCommand.label);
        setTimeout(() => setRecentCommand(null), 2000);
    };

    return (
        <div className="h-full flex flex-col w-full items-center bg-transparent text-white p-4 sm:p-6 relative overflow-hidden">
        <div className="absolute inset-0 w-full h-full overflow-hidden">
                <div className="absolute top-0 left-1/4 w-96 h-96 bg-violet-500/10 rounded-full mix-blend-normal filter blur-[128px] animate-pulse" />
                <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-indigo-500/10 rounded-full mix-blend-normal filter blur-[128px] animate-pulse delay-700" />
                <div className="absolute top-1/4 right-1/3 w-64 h-64 bg-fuchsia-500/10 rounded-full mix-blend-normal filter blur-[96px] animate-pulse delay-1000" />
            </div>
            <div className="w-full max-w-2xl mx-auto relative flex flex-col h-full">
                <motion.div 
                    className="relative z-10 space-y-6 flex-1 flex flex-col min-h-0"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                >
                    <div className="text-center space-y-3">
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.2, duration: 0.5 }}
                            className="inline-block"
                        >
                            <h1 className="text-3xl font-medium tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white/90 to-white/40 pb-1">
                                How can I help today?
                            </h1>
                            <motion.div 
                                className="h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"
                                initial={{ width: 0, opacity: 0 }}
                                animate={{ width: "100%", opacity: 1 }}
                                transition={{ delay: 0.5, duration: 0.8 }}
                            />
                        </motion.div>
                        <motion.p 
                            className="text-sm text-white/40"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.3 }}
                        >
                            Type a command or ask a question
                        </motion.p>
                    </div>

                    {/* ─── Messages ─── */}
                    {messages.length > 0 && (
                        <div className="space-y-4 flex-1 overflow-y-auto no-scrollbar px-2 min-h-0" id="chat-scroll">
                            {messages.map((m, i) => (
                                <motion.div
                                    key={i}
                                    className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.3 }}
                                >
                                    <div className={cn("max-w-[80%]", m.role === "user" ? "order-1" : "order-1")}>
                                        {m.role === "assistant" && (
                                            <div className="flex items-center gap-1.5 mb-1 ml-1">
                                                <Cloud size={12} className="text-violet-400" />
                                                <span className="text-[10px] text-violet-400 font-medium">VayuGPT</span>
                                            </div>
                                        )}
                                        <div className={cn(
                                            "p-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap",
                                            m.role === "user"
                                                ? "bg-violet-500/20 border border-violet-500/30 text-white/90"
                                                : "bg-black/30 border border-white/[0.08] text-white/80"
                                        )}>
                                            {m.message}
                                            {m.role === "assistant" && sending && i === messages.length - 1 && !m.message && (
                                                <span className="inline-block w-2 h-4 bg-violet-400 animate-pulse ml-0.5 align-middle" />
                                            )}
                                            {m.role === "assistant" && sending && i === messages.length - 1 && m.message && (
                                                <span className="inline-block w-1.5 h-3.5 bg-violet-400/70 animate-pulse ml-0.5 align-middle rounded-sm" />
                                            )}
                                        </div>
                                        {m.role === "assistant" && ttsSupported && (
                                            <button
                                                onClick={() => isSpeaking ? onStopSpeaking?.() : onReadAloud?.(m.message)}
                                                className="ml-1 mt-1 text-[10px] text-white/30 hover:text-violet-400 transition-colors flex items-center gap-1"
                                            >
                                                {isSpeaking ? <VolumeX size={10} /> : <Volume2 size={10} />}
                                                {isSpeaking ? "Stop" : "Read aloud"}
                                            </button>
                                        )}
                                    </div>
                                </motion.div>
                            ))}
                            {sending && (
                                <div className="flex justify-start">
                                    <div className="max-w-[80%]">
                                        <div className="flex items-center gap-1.5 mb-1 ml-1">
                                            <Cloud size={12} className="text-violet-400" />
                                            <span className="text-[10px] text-violet-400 font-medium">VayuGPT</span>
                                        </div>
                                        <div className="p-3 rounded-2xl bg-black/30 border border-white/[0.08]">
                                            <div className="flex items-center gap-2 text-sm text-white/70">
                                                <span>Thinking</span>
                                                <TypingDots />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ─── Voice status bar ─── */}
                    {(isListening || isSpeaking) && (
                        <motion.div 
                            className="backdrop-blur-2xl bg-white/[0.02] rounded-full px-4 py-2 shadow-lg border border-white/[0.05] mx-auto w-fit"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 10 }}
                        >
                            <div className="flex items-center gap-3">
                                {isListening ? (
                                    <>
                                        <div className="w-8 h-7 rounded-full bg-red-500/20 flex items-center justify-center">
                                            <Mic className="w-3.5 h-3.5 text-red-400 animate-pulse" />
                                        </div>
                                        <div className="flex items-center gap-2 text-sm text-white/70">
                                            <span>Listening</span>
                                            <TypingDots />
                                            {interimTranscript && (
                                                <span className="text-white/40 italic text-xs max-w-[150px] truncate">
                                                    "{interimTranscript}"
                                                </span>
                                            )}
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="w-8 h-7 rounded-full bg-violet-500/20 flex items-center justify-center">
                                            <Volume2 className="w-3.5 h-3.5 text-violet-400 animate-pulse" />
                                        </div>
                                        <div className="flex items-center gap-2 text-sm text-white/70">
                                            <span>Speaking</span>
                                            <TypingDots />
                                            <button onClick={onStopSpeaking} className="text-white/40 hover:text-white ml-1 underline text-xs">
                                                Stop
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        </motion.div>
                    )}

                    <motion.div 
                        className="relative backdrop-blur-3xl bg-black/60 rounded-2xl border border-white/[0.1] shadow-2xl shadow-black/40 flex-shrink-0"
                        initial={{ scale: 0.98 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.1 }}
                    >
                        <AnimatePresence>
                            {showCommandPalette && (
                                <motion.div 
                                    ref={commandPaletteRef}
                                    className="absolute left-4 right-4 bottom-full mb-2 backdrop-blur-xl bg-black/90 rounded-lg z-50 shadow-lg border border-white/10 overflow-hidden"
                                    initial={{ opacity: 0, y: 5 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: 5 }}
                                    transition={{ duration: 0.15 }}
                                >
                                    <div className="py-1 bg-black/95">
                                        {commandSuggestions.map((suggestion, index) => (
                                            <motion.div
                                                key={suggestion.prefix}
                                                className={cn(
                                                    "flex items-center gap-2 px-3 py-2 text-xs transition-colors cursor-pointer",
                                                    activeSuggestion === index 
                                                        ? "bg-white/10 text-white" 
                                                        : "text-white/70 hover:bg-white/5"
                                                )}
                                                onClick={() => selectCommandSuggestion(index)}
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                transition={{ delay: index * 0.03 }}
                                            >
                                                <div className="w-5 h-5 flex items-center justify-center text-white/60">
                                                    {suggestion.icon}
                                                </div>
                                                <div className="font-medium">{suggestion.label}</div>
                                                <div className="text-white/40 text-xs ml-1">
                                                    {suggestion.prefix}
                                                </div>
                                            </motion.div>
                                        ))}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <div className="p-4">
                            {isListening ? (
                                /* Live transcript view while listening */
                                <div className="w-full min-h-[60px] px-4 py-3 rounded-md">
                                    {accumulatedTranscript && (
                                        <p className="text-white/90 text-sm leading-relaxed">{accumulatedTranscript}</p>
                                    )}
                                    {interimTranscript && (
                                        <p className="text-white/50 text-sm leading-relaxed italic">{interimTranscript}<span className="inline-block w-1.5 h-3.5 bg-violet-400 animate-pulse ml-0.5 align-middle rounded-sm" /></p>
                                    )}
                                    {!accumulatedTranscript && !interimTranscript && (
                                        <p className="text-violet-400/60 text-sm flex items-center gap-2">
                                            <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
                                            Listening... speak freely, auto-sends when you pause
                                        </p>
                                    )}
                                </div>
                            ) : (
                                <Textarea
                                    ref={textareaRef}
                                    value={value}
                                    onChange={(e) => {
                                        setValue(e.target.value);
                                        adjustHeight();
                                    }}
                                    onKeyDown={handleKeyDown}
                                    onFocus={() => setInputFocused(true)}
                                    onBlur={() => setInputFocused(false)}
                                    placeholder="Ask VayuGPT a question..."
                                    containerClassName="w-full"
                                    className={cn(
                                        "w-full px-4 py-3",
                                        "resize-none",
                                        "bg-transparent",
                                        "border-none",
                                        "text-white/90 text-sm",
                                        "focus:outline-none",
                                        "placeholder:text-white/30",
                                        "min-h-[60px]"
                                    )}
                                    style={{
                                        overflow: "hidden",
                                    }}
                                    showRing={false}
                                />
                            )}
                        </div>

                        <AnimatePresence>
                            {attachments.length > 0 && (
                                <motion.div 
                                    className="px-4 pb-3 flex gap-2 flex-wrap"
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: "auto" }}
                                    exit={{ opacity: 0, height: 0 }}
                                >
                                    {attachments.map((file, index) => (
                                        <motion.div
                                            key={index}
                                            className="flex items-center gap-2 text-xs bg-white/[0.03] py-1.5 px-3 rounded-lg text-white/70"
                                            initial={{ opacity: 0, scale: 0.9 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            exit={{ opacity: 0, scale: 0.9 }}
                                        >
                                            <span>{file}</span>
                                            <button 
                                                onClick={() => removeAttachment(index)}
                                                className="text-white/40 hover:text-white transition-colors"
                                            >
                                                <XIcon className="w-3 h-3" />
                                            </button>
                                        </motion.div>
                                    ))}
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <div className="p-4 border-t border-white/[0.08] flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                {/* Mic button */}
                                {speechSupported && (
                                    <motion.button
                                        type="button"
                                        onClick={onToggleMic}
                                        whileTap={{ scale: 0.94 }}
                                    className={cn(
                                        "p-2 rounded-lg transition-colors relative group",
                                        isListening
                                            ? "bg-red-500/20 text-red-400 ring-2 ring-red-500/40 animate-pulse"
                                            : "text-white/40 hover:text-white/90"
                                    )}
                                >
                                    {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                                    {isListening && (
                                        <span className="absolute -top-7 left-1/2 -translate-x-1/2 text-[9px] text-violet-400 whitespace-nowrap bg-black/60 px-1.5 py-0.5 rounded">
                                            Listening · auto-sends when you stop
                                        </span>
                                    )}
                                    <motion.span
                                        className="absolute inset-0 bg-white/[0.05] rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                                        layoutId="button-highlight"
                                    />
                                </motion.button>
                                )}

                                <motion.button
                                    type="button"
                                    onClick={handleAttachFile}
                                    whileTap={{ scale: 0.94 }}
                                    className="p-2 text-white/40 hover:text-white/90 rounded-lg transition-colors relative group"
                                >
                                    <Paperclip className="w-4 h-4" />
                                    <motion.span
                                        className="absolute inset-0 bg-white/[0.05] rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                                        layoutId="button-highlight"
                                    />
                                </motion.button>
                                <motion.button
                                    type="button"
                                    data-command-button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setShowCommandPalette(prev => !prev);
                                    }}
                                    whileTap={{ scale: 0.94 }}
                                    className={cn(
                                        "p-2 text-white/40 hover:text-white/90 rounded-lg transition-colors relative group",
                                        showCommandPalette && "bg-white/10 text-white/90"
                                    )}
                                >
                                    <Command className="w-4 h-4" />
                                    <motion.span
                                        className="absolute inset-0 bg-white/[0.05] rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                                        layoutId="button-highlight"
                                    />
                                </motion.button>

                                {/* Voice mode indicator */}
                                {ttsSupported && (
                                    <div className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] text-white/30 bg-white/[0.03]">
                                        <Mic className="w-3 h-3" />
                                        <span className="hidden sm:inline">Speak → AI speaks back</span>
                                    </div>
                                )}
                            </div>
                            
                            <motion.button
                                type="button"
                                onClick={handleSendMessage}
                                whileHover={{ scale: 1.01 }}
                                whileTap={{ scale: 0.98 }}
                                disabled={isTyping || !value.trim()}
                                className={cn(
                                    "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                                    "flex items-center gap-2",
                                    value.trim()
                                        ? "bg-white text-[#0A0A0B] shadow-lg shadow-white/10"
                                        : "bg-white/[0.05] text-white/40"
                                )}
                            >
                                {isTyping ? (
                                    <LoaderIcon className="w-4 h-4 animate-[spin_2s_linear_infinite]" />
                                ) : (
                                    <SendIcon className="w-4 h-4" />
                                )}
                                <span>Send</span>
                            </motion.button>
                        </div>
                    </motion.div>

                    {/* ─── Quick suggestion chips ─── */}
                    {messages.length === 0 && (
                        <div className="flex flex-wrap items-center justify-center gap-2">
                            {commandSuggestions.map((suggestion, index) => (
                                <motion.button
                                    key={suggestion.prefix}
                                    onClick={() => {
                                        const text = `Tell me about the weather`;
                                        if (onSend) {
                                            onSend(text);
                                        } else {
                                            setValue(text);
                                        }
                                    }}
                                    className="flex items-center gap-2 px-3 py-2 bg-white/[0.02] hover:bg-white/[0.05] rounded-lg text-sm text-white/60 hover:text-white/90 transition-all relative group"
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: index * 0.1 }}
                                >
                                    {suggestion.icon}
                                    <span>{suggestion.label}</span>
                                    <motion.div
                                        className="absolute inset-0 border border-white/[0.05] rounded-lg"
                                        initial={false}
                                        animate={{
                                            opacity: [0, 1],
                                            scale: [0.98, 1],
                                        }}
                                        transition={{
                                            duration: 0.3,
                                            ease: "easeOut",
                                        }}
                                    />
                                </motion.button>
                            ))}
                        </div>
                    )}
                </motion.div>
            </div>

            <AnimatePresence>
                {isTyping && (
                    <motion.div 
                        className="fixed bottom-8 mx-auto transform -translate-x-1/2 backdrop-blur-2xl bg-white/[0.02] rounded-full px-4 py-2 shadow-lg border border-white/[0.05]"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-7 rounded-full bg-white/[0.05] flex items-center justify-center text-center">
                                <span className="text-xs font-medium text-white/90 mb-0.5">Vayu</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-white/70">
                                <span>Thinking</span>
                                <TypingDots />
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {inputFocused && (
                <motion.div 
                    className="fixed w-[50rem] h-[50rem] rounded-full pointer-events-none z-0 opacity-[0.02] bg-gradient-to-r from-violet-500 via-fuchsia-500 to-indigo-500 blur-[96px]"
                    animate={{
                        x: mousePosition.x - 400,
                        y: mousePosition.y - 400,
                    }}
                    transition={{
                        type: "spring",
                        damping: 25,
                        stiffness: 150,
                        mass: 0.5,
                    }}
                />
            )}
        </div>
    );
}

function TypingDots() {
    return (
        <div className="flex items-center ml-1">
            {[1, 2, 3].map((dot) => (
                <motion.div
                    key={dot}
                    className="w-1.5 h-1.5 bg-white/90 rounded-full mx-0.5"
                    initial={{ opacity: 0.3 }}
                    animate={{ 
                        opacity: [0.3, 0.9, 0.3],
                        scale: [0.85, 1.1, 0.85]
                    }}
                    transition={{
                        duration: 1.2,
                        repeat: Infinity,
                        delay: dot * 0.15,
                        ease: "easeInOut",
                    }}
                    style={{
                        boxShadow: "0 0 4px rgba(255, 255, 255, 0.3)"
                    }}
                />
            ))}
        </div>
    );
}

interface ActionButtonProps {
    icon: React.ReactNode;
    label: string;
}

function ActionButton({ icon, label }: ActionButtonProps) {
    const [isHovered, setIsHovered] = useState(false);
    
    return (
        <motion.button
            type="button"
            whileHover={{ scale: 1.05, y: -2 }}
            whileTap={{ scale: 0.97 }}
            onHoverStart={() => setIsHovered(true)}
            onHoverEnd={() => setIsHovered(false)}
            className="flex items-center gap-2 px-4 py-2 bg-neutral-900 hover:bg-neutral-800 rounded-full border border-neutral-800 text-neutral-400 hover:text-white transition-all relative overflow-hidden group"
        >
            <div className="relative z-10 flex items-center gap-2">
                {icon}
                <span className="text-xs relative z-10">{label}</span>
            </div>
            
            <AnimatePresence>
                {isHovered && (
                    <motion.div 
                        className="absolute inset-0 bg-gradient-to-r from-violet-500/10 to-indigo-500/10"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                    />
                )}
            </AnimatePresence>
            
            <motion.span 
                className="absolute bottom-0 left-0 w-full h-0.5 bg-gradient-to-r from-violet-500 to-indigo-500"
                initial={{ width: 0 }}
                whileHover={{ width: "100%" }}
                transition={{ duration: 0.3 }}
            />
        </motion.button>
    );
}

const rippleKeyframes = `
@keyframes ripple {
  0% { transform: scale(0.5); opacity: 0.6; }
  100% { transform: scale(2); opacity: 0; }
}
`;

if (typeof document !== 'undefined') {
    const style = document.createElement('style');
    style.innerHTML = rippleKeyframes;
    document.head.appendChild(style);
}
