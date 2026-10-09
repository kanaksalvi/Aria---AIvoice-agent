# Aria - AI Voice Support Agent for Aura Skincare

Browser-based voice agent. Click **Start call**, talk to Aria, click **End call** to get the transcript and a structured JSON summary.
Live Working URL link: https://aria-a-ivoice-agent.vercel.app/

## Setup
1. Clone the repo and run `npm install`
2. Copy `.env.example` to `.env.local` and fill in your values
3. Run `npm run dev` and open http://localhost:3000 in Chrome or Edge

   
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
- 
**Design Questions**
1. Why this architecture and stack?
I used Next.js because I could build the frontend and the backend API in one project and deploy it easily on Vercel. The browser handles the voice (speech to text and back), and the server talks to the Gemini model, so the API key stays hidden. The model can call an order lookup function, so order answers come from the actual data and not from guesses.

2. Most difficult part and how I solved it
Latency. Some Gemini models took 6 to 15 seconds to reply, which made the call feel slow and even timed out on Vercel. I tested a few models on the same prompt and switched to the fastest one (about 1 second). I also had to stop Aria from hearing her own voice, so I added a headphones option and an echo filter for interruptions.

3. What I’d improve first with one more week
Customer verification. Right now Aria could share an order’s details just from the order number. I’d make her check the customer’s name against the order first, because it’s personal data. After that, I’d improve the voice quality and start the replies faster by streaming them.

4. Changes needed for 1,000 conversations a day
Use a real database for orders and store call summaries.
Move to a paid LLM plan with retries and a backup model.
Add logging and monitoring for speed, cost and errors.
Add login and data protection for customer information.
Pass difficult calls to a human agent along with the summary.

