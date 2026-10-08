import { MODEL, EXTRA, getClient } from '../../../lib/llm';

export const runtime = 'nodejs';
export const maxDuration = 30;

const SYSTEM = `You summarise customer support calls for Aura Skincare. Return ONLY a JSON object, no markdown, with keys:
"customer_intent": one of ORDER_TRACKING, CANCELLATION, RETURN_REFUND, PRODUCT_INFO, SHIPPING_POLICY, PAYMENT_COD, OUT_OF_SCOPE, OTHER;
"order_id": the order ID discussed (e.g. "ORD-101") or null;
"resolution_status": one of RESOLVED, PARTIALLY_RESOLVED, UNRESOLVED, OUT_OF_SCOPE;
"call_summary": 1-2 factual sentences in the third person, covering what was asked and the outcome (including any policy limits explained);
"follow_up_needed": true or false.
Base it only on the transcript and tool results.`;

export async function POST(req) {
  const { transcript = [], toolCalls = [] } = await req.json();
  if (!transcript.some((m) => m.role === 'customer'))
    return Response.json({ customer_intent: 'OTHER', order_id: null, resolution_status: 'UNRESOLVED', call_summary: 'The customer did not say anything before the call ended.', follow_up_needed: false });
  try {
    const text = transcript.map((m) => `${m.role === 'customer' ? 'Customer' : 'Aria'}: ${m.text}`).join('\n');
    const tools = toolCalls.map((t) => `${t.name}(${JSON.stringify(t.input)}) -> ${JSON.stringify(t.output)}`).join('\n');
    const res = await getClient().chat.completions.create({ model: MODEL, max_tokens: 400, ...EXTRA, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: `TRANSCRIPT:\n${text}\n\nTOOL CALLS:\n${tools || 'none'}` }] });
    const raw = res.choices?.[0]?.message?.content || '';
    return Response.json(JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)));
  } catch (e) {
    return Response.json({ customer_intent: 'OTHER', order_id: null, resolution_status: 'UNRESOLVED', call_summary: 'Summary could not be generated automatically.', follow_up_needed: true, error: String(e?.message || e) });
  }
}
