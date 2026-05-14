'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import styles from './VoicePlayground.module.css';
import DotGrid from './DotGrid';

/* ──────────────────────────────────────────────────────────────
   CONSTANTS
   ────────────────────────────────────────────────────────────── */
const NUM_BARS     = 5;
const MIN_H        = 2;
const MAX_H        = 40;
const FREQ_TOP_BIN = 56;
const ATTACK       = 0.45;
const DECAY        = 0.12;

const LATENCY_POINTS = 24;
const LATENCY_TICK_MS = 90;
const LATENCY_BASE_MS = 3.4;
const LATENCY_SPIKE_MIN_MS = 6.8;
const LATENCY_SPIKE_MAX_MS = 9.2;
const COST_STEPS = [0, 34, 64, 89];
const COST_TARGET_PERCENT = 89;
const COST_OVERFLOW_DB_MIN = -1.4;
const COST_OVERFLOW_DB_MAX = -3.6;
const STREAM_TEXT_MS = 24;

// STT: cycling filler phrases shown when "Talk to Moss" is pressed
const STT_PHRASES = [
  'how fast is Moss?',
  'how does Moss work?',
  'what is Moss?',
  'how does Moss retrieve context?',
  'how does Moss compare to traditional RAG?',
];
// Per-word delay (ms). Slight jitter makes it feel like real recognition.
const STT_WORD_BASE   = 230;
const STT_WORD_JITTER = 90;
// Pause after last word before auto-submitting
const STT_SUBMIT_DELAY = 480;

// Streaming: one character every N ms
// Simulated retrieval pause before first streaming character
const RETRIEVAL_MS   = 110;

// CSS-animation fallback heights / durations
const CSS_BAR_HEIGHTS: [number, number][] = [
  [12,38],[6,24],[8,32],[4,22],[4,18],
  [4,14],[2,12],[2,10],[4,18],[4,22],
  [6,24],[6,24],[2,6],[4,18],[2,10],
  [2,10],[2,2],[2,2],[2,2],[2,2],
  [2,2],[2,2],[2,2],[2,2],[4,32],
];
const CSS_DURATIONS = [
  0.70,0.90,0.60,1.10,0.80,0.95,0.65,1.00,
  0.75,0.85,0.70,0.90,1.20,0.80,0.65,1.00,
  0.70,0.90,0.80,0.75,1.10,0.60,0.85,0.95,0.70,
];

/* ──────────────────────────────────────────────────────────────
   TYPES
   ────────────────────────────────────────────────────────────── */
type PlaygroundState = 'idle' | 'active';
type WaveformMode    = 'idle' | 'audio' | 'css';

interface Message {
  id:        string;
  role:      'user' | 'agent';
  text:      string;
  streaming?: boolean; // true while agent response is still streaming in
}

/* ──────────────────────────────────────────────────────────────
   RESPONSES
   ────────────────────────────────────────────────────────────── */
const GREETING_KEY = '__greeting__';

const RESPONSES: Record<string, string> = {
  [GREETING_KEY]:
    "Hi, I'm Moss — real-time context retrieval in under 10ms, built for voice AI. What would you like to know?",
  'how does Moss work?':
    "Moss is a real-time semantic search runtime built for conversational AI. It runs locally alongside your agent — built in Rust and WebAssembly — and returns results in under 10ms with zero infrastructure to set up. You point it at your data and it handles the rest.",
  'how fast is Moss?':
    "Under 10ms, every time. The average cloud retrieval round-trip runs around 350ms. Moss eliminates that gap by running locally with your agent, so it never stalls mid-sentence waiting for context. Sub-10ms, always.",
  'how do I get started?':
    "Just npm install moss-runtime, point it at your data source, and you're done. No vector database, no embedding pipeline, no cloud infrastructure to spin up.",
};
const FALLBACK_RESPONSE =
  "Moss gives your voice AI agent real-time context retrieval in under 10ms — no cloud round-trips, no pipeline overhead. Just point it at your data and go.";

const SUGGESTION_CHIPS = ['how does Moss work?', 'how fast is Moss?', 'how do I get started?'];

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

/* ──────────────────────────────────────────────────────────────
   ICONS
   ────────────────────────────────────────────────────────────── */
function MicIcon({ className }: { className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="9" y="2" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 10a7 7 0 0 0 14 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="12" y1="17" x2="12" y2="22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="8"  y1="22" x2="16" y2="22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function MicMutedIcon({ className }: { className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="9" y="2" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 10a7 7 0 0 0 14 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="12" y1="17" x2="12" y2="22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="8"  y1="22" x2="16" y2="22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="3"  y1="3"  x2="21" y2="21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function EndCallIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z" fill="currentColor" />
    </svg>
  );
}

function SpeakerIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <polygon points="11,5 6,9 2,9 2,15 6,15 11,19" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" fill="none" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function SpeakerMutedIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <polygon points="11,5 6,9 2,9 2,15 6,15 11,19" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" fill="none" />
      <line x1="23" y1="9"  x2="17" y2="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="17" y1="9"  x2="23" y2="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/* ──────────────────────────────────────────────────────────────
   WAVEFORM
   Bar heights driven via DOM refs in audio mode; CSS animation
   in fallback mode. No React re-renders in the animation loop.
   ────────────────────────────────────────────────────────────── */
interface WaveformProps {
  mode:    WaveformMode;
  muted:   boolean;
  barRefs: React.MutableRefObject<(HTMLDivElement | null)[]>;
}

function Waveform({ mode, muted, barRefs }: WaveformProps) {
  return (
    <div className={styles.waveformBars} aria-hidden="true">
      {Array.from({ length: NUM_BARS }, (_, i) => {
        const isLast      = i === NUM_BARS - 1;
        const useCssFallback = mode === 'css' && !muted;
        const [hMin, hMax] = CSS_BAR_HEIGHTS[i];
        const dur          = CSS_DURATIONS[i];

        const classNames = [
          styles.bar,
          isLast && !muted    ? styles.barPurple : '',
          muted               ? styles.barMuted  : '',
          useCssFallback      ? styles.barCss    : '',
        ].filter(Boolean).join(' ');

        return (
          <div
            key={i}
            ref={(el) => { barRefs.current[i] = el; }}
            className={classNames}
            style={
              useCssFallback
                ? {
                    ['--h-min' as string]: `${hMin}px`,
                    ['--h-max' as string]: `${hMax}px`,
                    ['--dur'   as string]: `${dur}s`,
                    animationDelay: `${(i * 0.07).toFixed(2)}s`,
                  }
                : { height: `${MIN_H}px` }
            }
          />
        );
      })}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   GRAPHS
   ────────────────────────────────────────────────────────────── */
function buildLatencyPath(values: number[]) {
  const baseY = 45;
  return values
    .map((value, index) => {
      const x = (index * 240) / (values.length - 1);
      const y = baseY - Math.min(1, value / 10) * 20;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
}

function buildCostPaths(percent: number) {
  const totalWidth = 280;
  const base = 52.5;
  const incline = Math.min(1, percent / 100);
  const eased = (t: number) => 1 - Math.pow(2, -8 * t);
  const normalize = (t: number) => eased(t) / eased(1);

  const points = Array.from({ length: 8 }, (_, idx) => {
    const x = (idx * totalWidth) / 7;
    const t = x / totalWidth;
    const y = base - normalize(t) * 36 * incline;
    return { x, y };
  });

  const linePath = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(' ');
  const fillPath = `${linePath} L280 56 L0 56 Z`;
  return { linePath, fillPath };
}

function LatencyGraph({ values }: { values: number[] }) {
  const pathD = buildLatencyPath(values);

  return (
    <div className={styles.latencyGraphWrapper}>
      <svg viewBox="0 0 240 48" preserveAspectRatio="none" fill="none">
        <path d="M0 8 H240" stroke="var(--color-text-dim)" strokeWidth="1" strokeDasharray="4 4" opacity="0.55" />
        <path
          d={pathD}
          stroke="var(--color-accent-purple)"
          strokeWidth="1.5"
          strokeLinecap="round"
          fill="none"
          className="latency-line"
        />
      </svg>
    </div>
  );
}

function CostGraph({ percent }: { percent: number }) {
  const { linePath, fillPath } = buildCostPaths(percent);

  return (
    <svg viewBox="0 0 280 56" preserveAspectRatio="none" fill="none">
      <defs>
        <linearGradient id="cg-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="10%"   stopColor="var(--color-accent-purple)" stopOpacity="0.25" />
          <stop offset="100%" stopColor="var(--color-accent-purple)" stopOpacity="0"    />
        </linearGradient>
      </defs>
      {/* Full-width horizontal grid lines */}
      <line x1="0" y1="14" x2="280" y2="14" stroke="var(--color-bg-surface-2)" strokeWidth="0.8" />
      <line x1="0" y1="28" x2="280" y2="28" stroke="var(--color-bg-surface-2)" strokeWidth="0.8" />
      <line x1="0" y1="42" x2="280" y2="42" stroke="var(--color-bg-surface-2)" strokeWidth="0.8" />
      {/* Area fill under rising curve */}
      <path d={fillPath} fill="url(#cg-fill)" />
      {/* Rising line */}
      <path
        d={linePath}
        stroke="var(--color-accent-purple)"
        strokeWidth="1.5"
        strokeLinecap="round"
        className="cost-line"
      />
    </svg>
  );
}

/* ──────────────────────────────────────────────────────────────
   MAIN COMPONENT
   ────────────────────────────────────────────────────────────── */

// Module-level STT phrase index so each session cycles to the next question
let sttCycleIndex = 0;

export default function VoicePlayground() {
  const [playState,        setPlayState]        = useState<PlaygroundState>('idle');
  const [waveMode,         setWaveMode]         = useState<WaveformMode>('idle');
  const [messages,         setMessages]         = useState<Message[]>([]);
  const [micMuted,         setMicMuted]         = useState(false);
  const [speakerMuted,     setSpeakerMuted]     = useState(false);
  const [permDenied,       setPermDenied]       = useState(false);
  const [entryMode,        setEntryMode]        = useState<'chip' | 'voice' | null>(null);
  const [showFollowUpChips, setShowFollowUpChips] = useState(false);
  const [chipsExpanded,    setChipsExpanded]    = useState(false);

  const [latencyValues, setLatencyValues] = useState<number[]>(new Array(LATENCY_POINTS).fill(LATENCY_BASE_MS));
  const [costPercent, setCostPercent] = useState(0);
  const [costDb, setCostDb] = useState(0);
  const [responseStep, setResponseStep] = useState(0);
  const costIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const latencyTickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // STT simulation state
  const [isListening,  setIsListening]  = useState(false);
  const [partialText,  setPartialText]  = useState('');

  // Refs — no re-renders
  const hoverTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const barRefs          = useRef<(HTMLDivElement | null)[]>([]);
  const audioCtxRef      = useRef<AudioContext | null>(null);
  const analyserRef      = useRef<AnalyserNode | null>(null);
  const streamRef        = useRef<MediaStream | null>(null);
  const rafRef           = useRef<number | null>(null);
  const smoothedRef      = useRef<Float32Array>(new Float32Array(NUM_BARS).fill(MIN_H));
  const micMutedRef      = useRef(false);
  const transcriptRef    = useRef<HTMLDivElement>(null);
  // Timer refs for cleanup
  const sttTimerRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamIntervalRef= useRef<ReturnType<typeof setInterval> | null>(null);
  const retrievalTimerRef= useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { micMutedRef.current = micMuted; }, [micMuted]);

  useEffect(() => {
    return () => {
      clearAllTimers();
      stopAudio();
      if (costIntervalRef.current) {
        clearInterval(costIntervalRef.current);
        costIntervalRef.current = null;
      }
      if (latencyTickRef.current) {
        clearInterval(latencyTickRef.current);
        latencyTickRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (playState === 'active') {
      if (!latencyTickRef.current) {
        latencyTickRef.current = setInterval(() => {
          setLatencyValues(prev => [...prev.slice(1), LATENCY_BASE_MS]);
        }, LATENCY_TICK_MS);
      }
    } else if (latencyTickRef.current) {
      clearInterval(latencyTickRef.current);
      latencyTickRef.current = null;
    }

    return () => {
      if (latencyTickRef.current) {
        clearInterval(latencyTickRef.current);
        latencyTickRef.current = null;
      }
    };
  }, [playState]);

  /* ── Timer cleanup ─────────────────────────────────────────── */
  function clearAllTimers() {
    if (sttTimerRef.current)       clearTimeout(sttTimerRef.current);
    if (retrievalTimerRef.current) clearTimeout(retrievalTimerRef.current);
    if (streamIntervalRef.current) clearInterval(streamIntervalRef.current);
    sttTimerRef.current = null;
    retrievalTimerRef.current = null;
    streamIntervalRef.current = null;
  }

  /* ── Audio pipeline ────────────────────────────────────────── */
  async function startAudio(): Promise<boolean> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const AudioCtx = window.AudioContext ??
        (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) throw new Error('no Web Audio');
      const ctx = new AudioCtx();
      await ctx.resume();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.55;
      ctx.createMediaStreamSource(stream).connect(analyser);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      streamRef.current   = stream;
      return true;
    } catch {
      return false;
    }
  }

  function startAnimationLoop() {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const freqData = new Uint8Array(analyser.frequencyBinCount);
    const smoothed = smoothedRef.current;
    const _analyser = analyser;

    function frame() {
      rafRef.current = requestAnimationFrame(frame);
      _analyser.getByteFrequencyData(freqData);

      if (micMutedRef.current) {
        for (let i = 0; i < NUM_BARS; i++) {
          smoothed[i] = smoothed[i] * 0.85 + MIN_H * 0.15;
          const el = barRefs.current[i];
          if (el) el.style.height = `${smoothed[i].toFixed(1)}px`;
        }
        return;
      }

      for (let i = 0; i < NUM_BARS - 1; i++) {
        const bin     = Math.floor((i / (NUM_BARS - 2)) * FREQ_TOP_BIN) + 1;
        const raw     = freqData[bin] / 255;
        const target  = MIN_H + raw * (MAX_H - MIN_H);
        const alpha   = target > smoothed[i] ? ATTACK : DECAY;
        smoothed[i]   = smoothed[i] * (1 - alpha) + target * alpha;
        const el = barRefs.current[i];
        if (el) el.style.height = `${smoothed[i].toFixed(1)}px`;
      }

      let sumSq = 0;
      for (let b = 1; b <= FREQ_TOP_BIN; b++) sumSq += (freqData[b] / 255) ** 2;
      const rms    = Math.sqrt(sumSq / FREQ_TOP_BIN);
      const targetL = MIN_H + rms * (MAX_H - MIN_H);
      const alphaL  = targetL > smoothed[NUM_BARS - 1] ? ATTACK : DECAY;
      smoothed[NUM_BARS - 1] = smoothed[NUM_BARS - 1] * (1 - alphaL) + targetL * alphaL;
      const lastEl = barRefs.current[NUM_BARS - 1];
      if (lastEl) lastEl.style.height = `${smoothed[NUM_BARS - 1].toFixed(1)}px`;
    }
    frame();
  }

  function stopAudio() {
    if (rafRef.current)      { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (streamRef.current)   { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (audioCtxRef.current) { audioCtxRef.current.close(); audioCtxRef.current = null; }
    analyserRef.current = null;
    smoothedRef.current.fill(MIN_H);
  }

  /* ── STT simulation ────────────────────────────────────────── */
  /*
    Returns a Promise that resolves with the final phrase once
    all words have appeared and the auto-submit pause has elapsed.
  */
  function runSTT(): Promise<string> {
    const phrase = STT_PHRASES[sttCycleIndex % STT_PHRASES.length];
    sttCycleIndex++;
    const words = phrase.split(' ');

    return new Promise((resolve) => {
      setIsListening(true);
      setPartialText('');

      let wordIndex = 0;

      function showNextWord() {
        wordIndex++;
        setPartialText(words.slice(0, wordIndex).join(' '));

        if (wordIndex < words.length) {
          // Small jitter makes it feel like real recognition confidence
          const delay = STT_WORD_BASE + Math.random() * STT_WORD_JITTER;
          sttTimerRef.current = setTimeout(showNextWord, delay);
        } else {
          // All words shown — pause, then commit
          sttTimerRef.current = setTimeout(() => {
            // Commit: swap partial bubble for real message in one batch
            setMessages(prev => [...prev, { id: uid(), role: 'user', text: phrase }]);
            setPartialText('');
            setIsListening(false);
            resolve(phrase);
          }, STT_SUBMIT_DELAY);
        }
      }

      // Brief mic-warmup pause before first word
      sttTimerRef.current = setTimeout(showNextWord, 380);
    });
  }

  /* ── Text streaming ────────────────────────────────────────── */
  /*
    Appends an empty agent message then fills it word by word.
    Drives React state from a setInterval — each call is a small
    update; React 18 batching keeps this smooth.
  */
  function getRandomLatencyMs() {
    return Math.round((LATENCY_SPIKE_MIN_MS + Math.random() * (LATENCY_SPIKE_MAX_MS - LATENCY_SPIKE_MIN_MS)) * 10) / 10;
  }

  function getRandomCostDb() {
    return Math.round((COST_OVERFLOW_DB_MIN + Math.random() * (COST_OVERFLOW_DB_MAX - COST_OVERFLOW_DB_MIN)) * 10) / 10;
  }

  function enqueueGraphUpdates() {
    const spike = getRandomLatencyMs();
    setLatencyValues(prev => [...prev.slice(1), spike]);
    setResponseStep(prevStep => {
      const nextStep = Math.min(prevStep + 1, COST_STEPS.length - 1);
      const nextPercent = COST_STEPS[nextStep];
      setCostPercent(nextPercent);
      if (nextStep >= COST_STEPS.length - 1) {
        setCostDb(getRandomCostDb());
      }
      return nextStep;
    });
  }

  function startStreamingResponse(question: string) {
    enqueueGraphUpdates();
    const agentId = uid();
    // Add the agent message slot immediately (empty, cursor visible)
    setMessages(prev => [...prev, { id: agentId, role: 'agent', text: '', streaming: true }]);

    retrievalTimerRef.current = setTimeout(() => {
      const fullText = RESPONSES[question] ?? FALLBACK_RESPONSE;
      let charIndex = 0;

      streamIntervalRef.current = setInterval(() => {
        charIndex += 1;
        const text = fullText.slice(0, charIndex);
        const done = charIndex >= fullText.length;
        setMessages(prev =>
          prev.map(m =>
            m.id === agentId
              ? { ...m, text, streaming: !done }
              : m
          )
        );
        if (done) {
          clearInterval(streamIntervalRef.current!);
          streamIntervalRef.current = null;
          setShowFollowUpChips(true);
        }
      }, STREAM_TEXT_MS);
    }, RETRIEVAL_MS);
  }

  /* ── Session control ───────────────────────────────────────── */
  function activateSession() {
    setPlayState('active');
    setEntryMode('voice');
    setMessages([]);
    setShowFollowUpChips(false);
    setResponseStep(0);
    setCostPercent(0);
    setCostDb(0);
    setLatencyValues(new Array(LATENCY_POINTS).fill(LATENCY_BASE_MS));

    startAudio().then((granted) => {
      if (granted) {
        setWaveMode('audio');
        setPermDenied(false);
        startAnimationLoop();
      } else {
        setWaveMode('css');
        setPermDenied(true);
      }
    });

    // Stream a greeting — chips appear after it finishes
    startStreamingResponse(GREETING_KEY);
  }

  function handleTalkToMoss() {
    activateSession();
  }

  function handleAsk(question: string) {
    if (playState === 'idle') {
      setPlayState('active');
      setEntryMode('chip');
      setShowFollowUpChips(false);
      setMessages([{ id: uid(), role: 'user', text: question }]);
      startAudio().then((granted) => {
        if (granted) { setWaveMode('audio'); setPermDenied(false); startAnimationLoop(); }
        else         { setWaveMode('css');   setPermDenied(true); }
      });
      startStreamingResponse(question);
      return;
    }
    if (isListening) return;
    setShowFollowUpChips(false);
    setMessages(prev => [...prev, { id: uid(), role: 'user', text: question }]);
    startStreamingResponse(question);
  }

  function handleEndChat() {
    clearAllTimers();
    stopAudio();
    setPlayState('idle');
    setWaveMode('idle');
    setMessages([]);
    setMicMuted(false);
    setSpeakerMuted(false);
    setPermDenied(false);
    setIsListening(false);
    setPartialText('');
    setEntryMode(null);
    setShowFollowUpChips(false);
    setChipsExpanded(false);
    setResponseStep(0);
    setCostPercent(0);
    setCostDb(0);
    setLatencyValues(new Array(LATENCY_POINTS).fill(LATENCY_BASE_MS));
    barRefs.current.forEach(el => { if (el) el.style.height = `${MIN_H}px`; });
  }

  function handleChipHoverEnter() {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    setChipsExpanded(true);
  }

  function handleChipHoverLeave() {
    hoverTimerRef.current = setTimeout(() => setChipsExpanded(false), 120);
  }

  function handleMicToggle() {
    const next = !micMuted;
    setMicMuted(next);
    streamRef.current?.getAudioTracks().forEach(t => { t.enabled = !next; });
  }

  /* ── RENDER ────────────────────────────────────────────────── */
  return (
    <div className={styles.playground}>
      {/* Three.js Dot Grid Background */}
      <DotGrid
        className={styles.dotGrid}
        onClick={handleTalkToMoss}
        activeFormation={playState === 'active'}
      />

      {/* ── IDLE ─────────────────────────────────────────────── */}
      {playState === 'idle' && (
        <>
          <div className={styles.idleContent}>
            <span className={styles.idleLabel} style={{ opacity: 0 }} aria-hidden="true">ask Moss</span>
            <div
              className={styles.suggestionGroup}
              onMouseEnter={handleChipHoverEnter}
              onMouseLeave={handleChipHoverLeave}
            >
              <span className={styles.idleLabel}>test search latency by asking</span>
              <div className={`${styles.ticker} ${chipsExpanded ? styles.tickerPaused : ''}`}>
                <div className={styles.tickerTrack}>
                  {[...SUGGESTION_CHIPS, SUGGESTION_CHIPS[0]].map((chip, i) => (
                    <button key={i} className={styles.chip} onClick={() => handleAsk(chip)}>
                      {chip}
                    </button>
                  ))}
                </div>
              </div>
              {chipsExpanded && (
                <div
                  className={styles.chipGrid}
                  onMouseEnter={handleChipHoverEnter}
                  onMouseLeave={handleChipHoverLeave}
                >
                  {SUGGESTION_CHIPS.map(chip => (
                    <button key={chip} className={styles.chip} onClick={() => handleAsk(chip)}>
                      {chip}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div style={{ height: 52 }} />
          </div>

          <div className={styles.centeredRow}>
            <button className={styles.talkBtn} onClick={handleTalkToMoss} aria-label="Start talking to Moss">
              <MicIcon />
              Talk to Moss
            </button>
          </div>
        </>
      )}

      {/* ── ACTIVE ───────────────────────────────────────────── */}
      {playState === 'active' && (
        <div className={`${styles.activeContent} ${styles.fadeIn}`}>
          {/* Scrollable transcript */}
          <div className={styles.transcript} ref={transcriptRef}>
            <div className={styles.transcriptInner}>

              {/* Committed messages */}
              {messages.map(msg => (
                <div
                  key={msg.id}
                  className={`${styles.messageRow} ${msg.role === 'user' ? styles.messageRowUser : styles.messageRowAgent}`}
                >
                  {msg.role === 'user' ? (
                    <div className={styles.bubbleUser}>{msg.text}</div>
                  ) : (
                    <div className={styles.bubbleAgent}>
                      {msg.text}
                      {msg.streaming && <span className={styles.cursor} aria-hidden="true" />}
                    </div>
                  )}
                </div>
              ))}

              {/* Partial STT bubble — visible while user is "speaking" */}
              {isListening && (
                <div className={`${styles.messageRow} ${styles.messageRowUser}`}>
                  <div className={styles.bubblePartial}>
                    {partialText || ' '}
                    <span className={styles.cursor} aria-hidden="true" />
                  </div>
                </div>
              )}

              {/* Follow-up chips — appear after each Moss response */}
              {showFollowUpChips && (
                <div className={styles.followUpChips}>
                  {SUGGESTION_CHIPS.map(chip => (
                    <button key={chip} className={styles.chip} onClick={() => handleAsk(chip)}>
                      {chip}
                    </button>
                  ))}
                </div>
              )}

            </div>
          </div>

          {/* Controls */}
          <div className={styles.controls}>
            {/* Cards appear as soon as the user message is committed; skeleton until answer completes */}
            {messages.some(m => m.role === 'user') && (() => {
              const answered = messages.some(m => m.role === 'agent' && !m.streaming && m.text.length > 0);
              return (
                <div className={`${styles.cards} ${styles.fadeIn}`}>
                  <div className={styles.card}>
                    <div>
                      <div className={styles.cardLabel}>Search Latency</div>
                      <div className={styles.cardValueRow}>
                        {answered ? (
                          <>
                            <span className={styles.cardValue}>{`${Math.max(LATENCY_BASE_MS, latencyValues[latencyValues.length - 1] ?? LATENCY_BASE_MS).toFixed(1)}ms`}</span>
                            <span className={styles.cardCompare}>vs avg cloud ~ 350ms</span>
                          </>
                        ) : (
                          <>
                            <div className={`${styles.skeleton} ${styles.skeletonValue}`} />
                            <div className={`${styles.skeleton} ${styles.skeletonCompare}`} />
                          </>
                        )}
                      </div>
                    </div>
                    <div className={styles.cardGraph}>
                      {answered ? <LatencyGraph values={latencyValues} /> : <div className={`${styles.skeleton} ${styles.skeletonGraph}`} />}
                    </div>
                  </div>
                  <div className={styles.card}>
                    <div>
                      <div className={styles.cardLabel}>Cost Savings</div>
                      <div className={styles.cardValueRow}>
                        {answered ? (
                          <>
                            <span className={styles.cardValue}>{`${costPercent}%`}</span>
                            <span className={styles.cardCompare}>
                              {costPercent < COST_STEPS[COST_STEPS.length - 1]
                                ? 'vs cloud RAG pipeline'
                                : `vs cloud RAG pipeline`}
                              <span className={styles.cardCompareDim}>(vectorDB + embedding API)</span>
                            </span>
                          </>
                        ) : (
                          <>
                            <div className={`${styles.skeleton} ${styles.skeletonValue}`} />
                            <div className={`${styles.skeleton} ${styles.skeletonCompare}`} />
                          </>
                        )}
                      </div>
                    </div>
                    <div className={styles.cardGraph}>
                      {answered ? <CostGraph percent={costPercent} /> : <div className={`${styles.skeleton} ${styles.skeletonGraph}`} />}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Waveform row */}
            <div className={styles.waveformRow}>
              <Waveform mode={waveMode} muted={micMuted} barRefs={barRefs} />
            </div>

            {/* Centered controls row */}
            <div className={styles.centeredRow}>
              <div className={styles.controlBar}>
                <button
                  className={`${styles.ctrlBtn} ${micMuted ? styles.ctrlBtnMuted : ''}`}
                  onClick={handleMicToggle}
                  aria-label={micMuted ? 'Unmute microphone' : 'Mute microphone'}
                >
                  {micMuted
                    ? <MicMutedIcon />
                    : <MicIcon className={waveMode === 'audio' ? styles.micActive : undefined} />
                  }
                </button>

                <button className={styles.ctrlBtnEnd} onClick={handleEndChat} aria-label="End chat">
                  <EndCallIcon />
                  End Chat
                </button>

                <button
                  className={`${styles.ctrlBtn} ${speakerMuted ? styles.ctrlBtnMuted : ''}`}
                  onClick={() => setSpeakerMuted(v => !v)}
                  aria-label={speakerMuted ? 'Unmute speaker' : 'Mute speaker'}
                >
                  {speakerMuted ? <SpeakerMutedIcon /> : <SpeakerIcon />}
                </button>
              </div>
            </div>

            {permDenied && (
              <p className={styles.permissionNote}>Mic access denied — showing simulated waveform</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
