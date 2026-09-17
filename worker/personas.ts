export type SpeakerId = "A" | "B";

export type Persona = {
  id: SpeakerId;
  name: string;
  voiceId: string;
  style: string;
};

export const PERSONAS: Record<SpeakerId, Persona> = {
  A: {
    id: "A",
    name: "Chip Rallyton",
    voiceId: "pNInz6obpgDQGcFmaJgB", // Adam
    style:
      "play-by-play announcer: breathless, fast, narrates the action as it happens, loves shouting the stakes"
  },
  B: {
    id: "B",
    name: "Dale Stackman",
    voiceId: "JBFqnCBsd6RMkjVDRZzb", // George
    style:
      "color commentator: a grizzled ex-engineer, dry wit, war stories, roasts the developer with affection"
  }
};

export const otherSpeaker = (id: SpeakerId): SpeakerId => (id === "A" ? "B" : "A");
