import { Agent, callable, routeAgentRequest } from "agents";
import { synthesize, toBase64 } from "./elevenlabs";
import { commentOnEvent, deadAirBanter } from "./llm";
import { PERSONAS, otherSpeaker, type SpeakerId } from "./personas";

const DEAD_AIR_INTERVAL_SECONDS = 30;
const DEAD_AIR_SILENCE_MS = 25_000;
const TRANSCRIPT_CONTEXT = 6;
const HISTORY_LIMIT = 50;

export type CodingEvent = {
  id: string;
  text: string;
  at: number;
};

export type Segment = {
  id: string;
  speaker: SpeakerId;
  speakerName: string;
  text: string;
  kind: "event" | "dead-air";
  eventText?: string;
  at: number;
};

export type BroadcastState = {
  eventHistory: CodingEvent[];
  transcript: Segment[];
  nextSpeaker: SpeakerId;
  lastEventAt: number;
  onAir: boolean;
};

export type BroadcastClip = Segment & {
  /** base64-encoded mp3 from ElevenLabs */
  audio: string;
  mimeType: "audio/mpeg";
};

export class BroadcastAgent extends Agent<Env, BroadcastState> {
  initialState: BroadcastState = {
    eventHistory: [],
    transcript: [],
    nextSpeaker: "A",
    lastEventAt: 0,
    onAir: false
  };

  async onStart() {
    // Idempotent: one interval survives hibernation and restarts.
    await this.scheduleEvery(DEAD_AIR_INTERVAL_SECONDS, "checkDeadAir");
  }

  @callable()
  async processEvent(eventText: string): Promise<BroadcastClip> {
    const event: CodingEvent = {
      id: crypto.randomUUID(),
      text: eventText,
      at: Date.now()
    };
    this.setState({
      ...this.state,
      eventHistory: [...this.state.eventHistory, event].slice(-HISTORY_LIMIT),
      lastEventAt: event.at
    });

    return this.keepAliveWhile(() => this.produce("event", eventText));
  }

  @callable()
  getTranscript(): Segment[] {
    return this.state.transcript;
  }

  async checkDeadAir() {
    const idleFor = Date.now() - Math.max(this.state.lastEventAt, lastSegmentAt(this.state));
    if (!this.state.onAir || idleFor < DEAD_AIR_SILENCE_MS) return;
    await this.keepAliveWhile(() => this.produce("dead-air"));
  }

  onConnect() {
    if (!this.state.onAir) this.setState({ ...this.state, onAir: true });
  }

  private async produce(
    kind: "event" | "dead-air",
    eventText?: string
  ): Promise<BroadcastClip> {
    const speaker = this.state.nextSpeaker;
    const persona = PERSONAS[speaker];
    const context = this.state.transcript
      .slice(-TRANSCRIPT_CONTEXT)
      .map((s) => `${s.speakerName}: ${s.text}`);

    const text =
      kind === "event"
        ? await commentOnEvent(this.env, persona, eventText!, context)
        : await deadAirBanter(this.env, persona, context);

    const audio = toBase64(await synthesize(this.env, persona.voiceId, text));

    const segment: Segment = {
      id: crypto.randomUUID(),
      speaker,
      speakerName: persona.name,
      text,
      kind,
      eventText,
      at: Date.now()
    };

    this.setState({
      ...this.state,
      transcript: [...this.state.transcript, segment].slice(-HISTORY_LIMIT),
      nextSpeaker: otherSpeaker(speaker)
    });

    const clip: BroadcastClip = { ...segment, audio, mimeType: "audio/mpeg" };
    this.broadcast(JSON.stringify({ type: "clip", clip }));
    return clip;
  }
}

function lastSegmentAt(state: BroadcastState): number {
  return state.transcript.at(-1)?.at ?? 0;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return (
      (await routeAgentRequest(request, env)) ??
      env.ASSETS.fetch(request)
    );
  }
} satisfies ExportedHandler<Env>;
