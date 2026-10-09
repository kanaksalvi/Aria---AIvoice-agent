# Aria - AI Voice Support Agent for Aura Skincare

Browser-based voice agent. Click **Start call**, talk to Aria, click **End call** to get the transcript and a structured JSON summary.
Live Working URL link: https://aria-a-ivoice-agent.vercel.app/

## Architecture
```
Browser mic -> Web Speech API (STT, en-IN) -> POST /api/chat (streaming NDJSON)
                                                  |-> LLM (default Gemini 3.5 Flash-Lite, any OpenAI-compatible API) + tool loop
                                                  |     get_order_details / cancel_order -> lib/orders.js (policy in code)
Browser speaker <- speechSynthesis (en-IN voice) <- text deltas, spoken sentence by sentence
End call -> POST /api/summary -> JSON {customer_intent, order_id, resolution_status, call_summary}
```
- State indicator: `listening -> thinking -> speaking -> listening`, driven by the speech and stream events in `app/page.js`.
- Latency: the reply streams from the server and each sentence is spoken as soon as it completes, so Aria starts talking before the full answer exists. The model may also say "let me check that" before a tool call.
- Tool calling: the model decides when to call `get_order_details` from the tool description plus a system-prompt rule ("always call it for order questions"). The server runs the tool and feeds the result back, up to 4 rounds.
- Guardrails, in two layers:
  1. `lib/orders.js` computes eligibility (cancellable only while Processing, return window of 7 days, COD limit, shipping fee) so the LLM reads a verdict instead of doing date math.
  2. The system prompt (`lib/agent.js`) restricts facts to the brand info, forbids promises outside policy, and handles out-of-scope requests.
- Edge cases: spoken IDs ("order one oh one") are normalised to `ORD-101`; unknown or missing IDs return explicit errors that tell the model to ask the customer to verify; low-confidence transcriptions are tagged so Aria asks for a repeat.



