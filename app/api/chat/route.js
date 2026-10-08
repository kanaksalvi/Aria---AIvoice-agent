import { SYSTEM, TOOLS, runTool } from '../../../lib/agent';
import { MODEL, EXTRA, getClient, readStream } from '../../../lib/llm';

export const runtime = 'nodejs';
export const maxDuration = 30;

// Streams newline-delimited JSON events: {type:'text',delta} | {type:'tool',...} | {type:'error'}
export async function POST(req) {
  const { messages = [], overrides = {} } = await req.json();
  const client = getClient();
  const enc = new TextEncoder();
  // The chat must start with a user turn; the call opens with Aria's greeting.
  const history = messages[0]?.role === 'assistant' ? [{ role: 'user', content: '(Customer connected to the call.)' }, ...messages] : [...messages];
  const msgs = [{ role: 'system', content: SYSTEM }, ...history];

  const stream = new ReadableStream({
    async start(controller) {
      const send = (o) => controller.enqueue(enc.encode(JSON.stringify(o) + '\n'));
      try {
        for (let round = 0; round < 4; round++) {
          if (round > 0) send({ type: 'text', delta: ' ' });
          const completion = await client.chat.completions.create({ model: MODEL, messages: msgs, tools: TOOLS, stream: true, max_tokens: 300, ...EXTRA });
          const { text, calls } = await readStream(completion, (t) => send({ type: 'text', delta: t }));
          const withIds = calls.map((c, i) => ({ ...c, id: c.id || `call_${round}_${i}` }));
          msgs.push({
            role: 'assistant',
            content: text || null,
            ...(withIds.length ? { tool_calls: withIds.map((c) => ({
                id: c.id,
                type: 'function',
                function: { name: c.name, arguments: c.args || '{}' },
                ...(c.extra_content ? { extra_content: c.extra_content } : {}),
              })) } : {}),
          });
          if (!withIds.length) break;
          for (const c of withIds) {
            let input = {};
            try { input = JSON.parse(c.args || '{}'); } catch {}
            const output = runTool(c.name, input, overrides);
            send({ type: 'tool', name: c.name, input, output });
            msgs.push({ role: 'tool', tool_call_id: c.id, content: JSON.stringify(output) });
          }
        }
      } catch (e) {
        send({ type: 'error', message: e?.message || 'Agent error' });
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' } });
}
