"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAgent } from "agents/react";
import type { BroadcastAgent, BroadcastClip, BroadcastState, Segment } from "../worker";
import { MOCK_EVENTS } from "./mockEvents";

const BAR_COUNT = 48;
const MIN_GAP_MS = 10_000;
const MAX_GAP_MS = 15_000;

type TerminalLine = { id: string; text: string; at: number };

const clock = (at: number) =>
  new Date(at).toLocaleTimeString("en-US", { hour12: false });

export default function Page() {
  const [live, setLive] = useState(false);
  const [lines, setLines] = useState<TerminalLine[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [nowPlaying, setNowPlaying] = useState<Segment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [levels, setLevels] = useState<number[]>(() => new Array(BAR_COUNT).fill(0));

  const queue = useRef<BroadcastClip[]>([]);
  const playing = useRef(false);
  const audioCtx = useRef<AudioContext | null>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const terminalEnd = useRef<HTMLDivElement | null>(null);
  const broadcastEnd = useRef<HTMLDivElement | null>(null);
  const eventIndex = useRef(0);

  const playNext = useCallback(async () => {
    if (playing.current) return;
    const clip = queue.current.shift();
    if (!clip) {
      setNowPlaying(null);
      return;
    }
    playing.current = true;
    setNowPlaying(clip);
    try {
      const ctx = audioCtx.current;
      const blob = new Blob([Uint8Array.from(atob(clip.audio), (c) => c.charCodeAt(0))], {
        type: clip.mimeType
      });
      const url = URL.createObjectURL(blob);
      const el = new Audio(url);
      el.crossOrigin = "anonymous";
      if (ctx && analyser.current) {
        const source = ctx.createMediaElementSource(el);
        source.connect(analyser.current);
        analyser.current.connect(ctx.destination);
        await ctx.resume();
      }
      await new Promise<void>((resolve) => {
        el.onended = () => resolve();
        el.onerror = () => resolve();
        void el.play().catch((e) => {
          setError(`Autoplay blocked: ${String(e)}`);
          resolve();
        });
      });
      URL.revokeObjectURL(url);
    } finally {
      playing.current = false;
      void playNext();
    }
  }, []);

  const agent = useAgent<BroadcastAgent, BroadcastState>({
    agent: "BroadcastAgent",
    name: "studio",
    onStateUpdate: (state) => setSegments(state.transcript),
    onMessage: (message) => {
      try {
        const data = JSON.parse(message.data as string) as
          | { type: "clip"; clip: BroadcastClip }
          | { type: string };
        if (data.type === "clip") {
          queue.current.push((data as { clip: BroadcastClip }).clip);
          void playNext();
        }
      } catch {
        /* non-JSON frames (state sync) are handled by the SDK */
      }
    },
    onError: (e) => setError(String(e))
  });

  // Retro visualizer driven by the WebAudio analyser.
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const node = analyser.current;
      if (node) {
        const data = new Uint8Array(node.frequencyBinCount);
        node.getByteFrequencyData(data);
        const step = Math.floor(data.length / BAR_COUNT) || 1;
        setLevels(
          Array.from({ length: BAR_COUNT }, (_, i) => {
            let sum = 0;
            for (let j = 0; j < step; j++) sum += data[i * step + j] ?? 0;
            return Math.round((sum / step / 255) * 100);
          })
        );
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  // "The Pitch": push a mock coding event to the agent every 10-15s.
  useEffect(() => {
    if (!live) return;
    let timer: ReturnType<typeof setTimeout>;
    const fire = async () => {
      const text = MOCK_EVENTS[eventIndex.current % MOCK_EVENTS.length];
      eventIndex.current += 1;
      setLines((prev) => [
        ...prev,
        { id: crypto.randomUUID(), text, at: Date.now() }
      ]);
      try {
        await agent.stub.processEvent(text);
      } catch (e) {
        setError(String(e));
      }
      timer = setTimeout(fire, MIN_GAP_MS + Math.random() * (MAX_GAP_MS - MIN_GAP_MS));
    };
    timer = setTimeout(fire, 1_000);
    return () => clearTimeout(timer);
  }, [live, agent]);

  useEffect(() => {
    terminalEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  useEffect(() => {
    broadcastEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [segments]);

  const goLive = async () => {
    const ctx = new AudioContext();
    await ctx.resume();
    const node = ctx.createAnalyser();
    node.fftSize = 256;
    audioCtx.current = ctx;
    analyser.current = node;
    setLive(true);
  };

  return (
    <div className="shell">
      <header className="topbar">
        <span className="logo">DEVINCAST</span>
        <span className="live">
          <span className={`dot${live ? "" : " off"}`} />
          {live ? "ON AIR" : "OFF AIR"}
        </span>
        <span className="pane-sub">two-host commentary for autonomous coding agents</span>
        <span style={{ marginLeft: "auto" }}>
          {live ? (
            <span className="pane-sub">{segments.length} calls made</span>
          ) : (
            <button onClick={goLive}>▶ GO LIVE</button>
          )}
        </span>
      </header>

      <div className="split">
        <section className="pane">
          <div className="pane-head">
            <span className="pane-title">THE PITCH</span>
            <span className="pane-sub">simulated coding session</span>
          </div>
          <div className="scroll">
            {lines.length === 0 && (
              <div className="line" style={{ color: "var(--dim)" }}>
                waiting for the developer to do something regrettable...
              </div>
            )}
            {lines.map((line) => (
              <div className="line" key={line.id}>
                <span className="ts">{clock(line.at)}</span>
                <span className="prompt">$</span> {line.text}
              </div>
            ))}
            <div className="line">
              <span className="prompt">$</span> <span className="cursor" />
            </div>
            <div ref={terminalEnd} />
          </div>
        </section>

        <section className="pane">
          <div className="pane-head">
            <span className="pane-title">THE BROADCAST</span>
            <span className="pane-sub">
              {nowPlaying ? `on air: ${nowPlaying.speakerName}` : "standing by"}
            </span>
          </div>
          <div className="scroll">
            {segments.length === 0 && (
              <div className="line" style={{ color: "var(--dim)" }}>
                the booth is warming up...
              </div>
            )}
            {segments.map((seg) => (
              <div
                className={`seg ${seg.speaker === "A" ? "a" : "b"}`}
                key={seg.id}
              >
                <div className="seg-head">
                  <span className="who">{seg.speakerName.toUpperCase()}</span>
                  <span className="tag">
                    {seg.kind === "dead-air" ? "DEAD AIR" : "PLAY-BY-PLAY"}
                  </span>
                  <span className="tag">{clock(seg.at)}</span>
                </div>
                <div className="seg-text">{seg.text}</div>
              </div>
            ))}
            <div ref={broadcastEnd} />
          </div>
          <div className="viz">
            {levels.map((level, i) => (
              <div
                className="bar"
                key={i}
                style={{ height: `${Math.max(2, level)}%` }}
              />
            ))}
          </div>
          <div className="footer">
            <span>{error ? <span className="err">{error}</span> : "elevenlabs · stream ok"}</span>
            <span>{queue.current.length} clip(s) queued</span>
          </div>
        </section>
      </div>
    </div>
  );
}
