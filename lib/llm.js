import OpenAI from 'openai';

// Provider-agnostic: any OpenAI-compatible endpoint works (Gemini, Groq, OpenRouter, OpenAI...).
// Defaults to Google Gemini's free tier. Change via env vars, no code changes needed.
export const MODEL = process.env.LLM_MODEL || 'gemini-3.1-flash-lite';
export const EXTRA = process.env.LLM_REASONING_EFFORT ? { reasoning_effort: process.env.LLM_REASONING_EFFORT } : {};

export function getClient() {
  return new OpenAI({
    apiKey: process.env.LLM_API_KEY || 'missing',
    baseURL: process.env.LLM_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai/',
  });
}

// Reads a streamed chat completion; forwards text deltas as they arrive and
// reassembles tool calls (their name/arguments arrive in fragments).
export async function readStream(stream, onText) {
  let text = '';
  const calls = [];
  for await (const chunk of stream) {
    const d = chunk.choices?.[0]?.delta;
    if (!d) continue;
    if (d.content) { text += d.content; onText(d.content); }
    for (const tc of d.tool_calls || []) {
      // A fragment carrying a function name starts a new call; others append arguments.
      if (tc.function?.name || !calls.length) calls.push({ id: tc.id || '', name: tc.function?.name || '', args: '', extra_content: undefined });
      const c = calls[calls.length - 1];
      if (tc.id && !c.id) c.id = tc.id;
      if (tc.function?.arguments) c.args += tc.function.arguments;
      // Gemini 3 attaches a thought_signature here. Keep it so it can be sent back.
      if (tc.extra_content) c.extra_content = tc.extra_content;
    }
  }
  return { text, calls };
}