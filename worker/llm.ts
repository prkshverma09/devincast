import type { Persona } from "./personas";

type Env = {
  OPENROUTER_API_KEY?: string;
  OPENAI_API_KEY?: string;
  LLM_MODEL?: string;
};

type ChatMessage = { role: "system" | "user"; content: string };

const SYSTEM = (persona: Persona) =>
  `You are ${persona.name}, one of two hosts of "DevinCast", a live sports-style broadcast covering an autonomous AI agent writing code.
Your style: ${persona.style}.
Rules:
- Reply with ONE spoken line, 12-30 words, no stage directions, no emoji, no markdown, no speaker label.
- Hyper-enthusiastic sports commentary energy. Use coding details from the event.
- Never repeat a line you already said.`;

async function chat(env: Env, messages: ChatMessage[]): Promise<string> {
  const openrouter = env.OPENROUTER_API_KEY || undefined;
  const endpoint = openrouter
    ? "https://openrouter.ai/api/v1/chat/completions"
    : "https://api.openai.com/v1/chat/completions";
  const apiKey = openrouter || env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("No OPENROUTER_API_KEY or OPENAI_API_KEY configured");

  const model = env.LLM_MODEL ?? (openrouter ? "openai/gpt-4o-mini" : "gpt-4o-mini");

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({ model, messages, max_tokens: 120, temperature: 0.9 })
  });

  if (!res.ok) {
    throw new Error(`LLM request failed: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("LLM returned an empty completion");
  return text.replace(/^["']|["']$/g, "");
}

export function commentOnEvent(
  env: Env,
  persona: Persona,
  eventText: string,
  recentTranscript: string[]
): Promise<string> {
  return chat(env, [
    { role: "system", content: SYSTEM(persona) },
    {
      role: "user",
      content: `Recent broadcast:\n${recentTranscript.join("\n") || "(broadcast just started)"}\n\nNew event from the coding session:\n${eventText}\n\nYour line:`
    }
  ]);
}

export function deadAirBanter(
  env: Env,
  persona: Persona,
  recentTranscript: string[]
): Promise<string> {
  return chat(env, [
    { role: "system", content: SYSTEM(persona) },
    {
      role: "user",
      content: `Recent broadcast:\n${recentTranscript.join("\n") || "(broadcast just started)"}\n\nNothing has happened in the coding session for a while. Fill the dead air with banter: speculate, tell a short war story, or needle your co-host.\n\nYour line:`
    }
  ]);
}
