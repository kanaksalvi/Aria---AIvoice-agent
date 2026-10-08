'use client';
import { useEffect, useRef, useState } from 'react';
import { ORDERS } from '../lib/orders';

const GREETING = 'Namaste! This is Aria from Aura Skincare. How can I help you today?';
const LABEL = { idle: 'Not in a call', listening: 'Listening', thinking: 'Thinking', speaking: 'Speaking' };
const HINT = { idle: 'Press Start call to begin.', listening: 'Go ahead, I am listening.', thinking: 'Aria is working on a reply.', speaking: 'Aria is talking.' };
const TRY = ['Where is my order ORD-101?', 'Cancel order ORD-103', 'I bought ORD-102 and opened it. Can I return it?', 'Can you book me a flight to Goa?', 'Where is order ORD-999?', 'What is your shipping policy?'];
const RATE = 1.12;
const GRACE_MS = 2500;

export default function Page() {
  const [phase, setPhase] = useState('idle');
  const [agent, setAgent] = useState('idle');
  const [log, setLog] = useState([]);
  const [toolLog, setToolLog] = useState([]);
  const [overrides, setOverrides] = useState({});
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');
  const [supported, setSupported] = useState(true);
  const [debug, setDebug] = useState(false);
  const [headphones, setHeadphones] = useState(false);

  const live = useRef(false), stateRef = useRef('idle'), rec = useRef(null), voice = useRef(null);
  const history = useRef([]), logRef = useRef([]), toolRef = useRef([]), ovRef = useRef({});
  const q = useRef({ pending: 0, done: true, gen: 0 }), ctrl = useRef(null), logEnd = useRef(null);
  const hp = useRef(false), spoken = useRef(''), lastSpeechEnd = useRef(0);

  const setS = (s) => { stateRef.current = s; setAgent(s); };
  const addLog = (role, text) => { logRef.current = [...logRef.current, { role, text }]; setLog(logRef.current); return logRef.current.length - 1; };
  const editLog = (i, text) => { logRef.current = logRef.current.map((m, j) => (j === i ? { ...m, text } : m)); setLog(logRef.current); };

  useEffect(() => {
    setSupported(!!(window.SpeechRecognition || window.webkitSpeechRecognition) && 'speechSynthesis' in window);
    setDebug(new URLSearchParams(window.location.search).has('debug'));
    const pick = () => {
      const vs = window.speechSynthesis?.getVoices() || [];
      const inVoices = vs.filter((v) => v.lang.replace('_', '-') === 'en-IN');
      voice.current =
          inVoices.find((v) => /natural/i.test(v.name)) ||
          inVoices.find((v) => /neerja|veena|heera|google/i.test(v.name)) ||
          inVoices[0] || vs.find((v) => v.lang.startsWith('en')) || null;
    };
    pick();
    window.speechSynthesis?.addEventListener?.('voiceschanged', pick);
    return () => { window.speechSynthesis?.cancel(); };
  }, []);
  useEffect(() => { logEnd.current?.scrollIntoView({ block: 'nearest' }); }, [log]);



  const letters = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const noteSpoken = (text) => {
    const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
    spoken.current = (spoken.current + ' ' + words.join(' ')).trim().split(/\s+/).slice(-80).join(' ');
  };
  const editDistance = (a, b) => {
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[b.length];
  };
  const isEcho = (text) => {
    const heard = letters(text);
    if (heard.length < 8) return false;
    const words = spoken.current.split(/\s+/).filter(Boolean);
    let best = 1;
    for (let s = 0; s < words.length; s++) {
      let acc = '';
      for (let e = s; e < words.length; e++) {
        acc += words[e];
        if (acc.length < heard.length * 0.7) continue;
        if (acc.length > heard.length * 1.4) break;
        best = Math.min(best, editDistance(heard, acc) / Math.max(heard.length, acc.length));
      }
    }
    return best <= 0.35;
  };

  const speak = (text, gen) => {
    if (!text || gen !== q.current.gen) return;
    noteSpoken(text);
    const u = new SpeechSynthesisUtterance(text);
    if (voice.current) u.voice = voice.current;
    u.lang = voice.current?.lang || 'en-IN';
    u.rate = RATE;
    q.current.pending++;
    setS('speaking');
    const finish = () => {
      if (gen !== q.current.gen) return;
      q.current.pending--;
      if (q.current.pending <= 0) lastSpeechEnd.current = Date.now();
      maybeListen(gen);
    };
    u.onend = finish; u.onerror = finish;
    window.speechSynthesis.speak(u);
  };
  const flush = (buf, final, gen) => {
    let m;
    while ((m = buf.match(/^([\s\S]*?[.!?]+)\s+/))) { speak(m[1].trim(), gen); buf = buf.slice(m[0].length); }
    if (final && buf.trim()) { speak(buf.trim(), gen); buf = ''; }
    return buf;
  };

  const maybeListen = (gen) => {
    if (gen === q.current.gen && q.current.pending <= 0 && q.current.done && live.current) setS('listening');
  };


  const bargeIn = () => {
    ctrl.current?.abort();
    window.speechSynthesis.cancel();
    q.current = { pending: 0, done: true, gen: q.current.gen + 1 };
    setS('listening');
  };


  const startRec = () => {
    if (!live.current || rec.current) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const r = new SR();
    r.lang = 'en-IN'; r.continuous = true; r.interimResults = true;
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const text = res[0].transcript.trim();
        if (!text) continue;
        const s = stateRef.current;
        const ariaBusy = s === 'speaking' || s === 'thinking';

        if (ariaBusy && !hp.current) continue;

        if ((ariaBusy || Date.now() - lastSpeechEnd.current < GRACE_MS) && isEcho(text)) continue;
        if (ariaBusy) {
          if (text.split(/\s+/).length < 2) continue;
          bargeIn();
        }
        if (res.isFinal) sendTurn(text, res[0].confidence > 0 && res[0].confidence < 0.5);
      }
    };
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { setError('Microphone access is blocked. Allow it in your browser settings, then start a new call.'); endCall(); }
    };

    r.onend = () => { rec.current = null; if (live.current) setTimeout(startRec, 200); };
    rec.current = r;
    try { r.start(); } catch { rec.current = null; }
  };


  const sendTurn = async (text, lowConf) => {
    setS('thinking');
    addLog('customer', text);
    history.current.push({ role: 'user', content: lowConf ? `${text} [low-confidence transcription]` : text });
    const gen = ++q.current.gen;
    q.current.pending = 0; q.current.done = false;
    const c = (ctrl.current = new AbortController());
    const idx = addLog('agent', '');
    let buf = '', full = '';
    try {
      const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: history.current, overrides: ovRef.current }), signal: c.signal });
      if (!res.ok || !res.body) throw new Error('Agent unavailable');
      const reader = res.body.getReader(), dec = new TextDecoder();
      let carry = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        const lines = (carry + dec.decode(value, { stream: true })).split('\n');
        carry = lines.pop();
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line);
          if (ev.type === 'text') { full += ev.delta; editLog(idx, full); buf = flush(buf + ev.delta, false, gen); }
          else if (ev.type === 'tool') {
            toolRef.current = [...toolRef.current, ev]; setToolLog(toolRef.current);
            if (ev.output?.updated_status) { ovRef.current = { ...ovRef.current, [ev.output.order_id]: ev.output.updated_status }; setOverrides(ovRef.current); }
          } else if (ev.type === 'error') throw new Error(ev.message);
        }
      }
      flush(buf, true, gen);
    } catch (e) {
      if (e.name === 'AbortError') { if (full) history.current.push({ role: 'assistant', content: full }); return; }
      const apology = 'Sorry, I am having trouble right now. Could you please say that again?';
      full = full || apology; editLog(idx, full); setError(e.message); speak(apology, gen);
    }
    if (full) history.current.push({ role: 'assistant', content: full });
    if (gen === q.current.gen) { q.current.done = true; maybeListen(gen); }
  };

  const startCall = async () => {
    setError(''); setSummary(null); setOverrides({}); setToolLog([]); setLog([]);
    logRef.current = []; toolRef.current = []; ovRef.current = {}; history.current = []; spoken.current = '';
    try { (await navigator.mediaDevices.getUserMedia({ audio: true })).getTracks().forEach((t) => t.stop()); }
    catch { setError('Microphone access is blocked. Allow it in your browser settings, then press Start call again.'); return; }
    live.current = true; setPhase('live');
    addLog('agent', GREETING); history.current.push({ role: 'assistant', content: GREETING });
    const gen = ++q.current.gen; q.current = { pending: 0, done: true, gen };
    speak(GREETING, gen);
    startRec();
  };

  const endCall = async () => {
    if (!live.current) return;
    live.current = false;
    ctrl.current?.abort(); rec.current?.abort(); rec.current = null; window.speechSynthesis.cancel();
    q.current = { pending: 0, done: true, gen: q.current.gen + 1 };
    setS('idle'); setPhase('ended'); setSummary(null);
    try {
      const res = await fetch('/api/summary', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transcript: logRef.current.filter((m) => m.text), toolCalls: toolRef.current }) });
      setSummary(await res.json());
    } catch { setSummary({ call_summary: 'Summary could not be generated.', resolution_status: 'UNRESOLVED' }); }
  };

  const inCall = phase === 'live';
  return (
      <main>
        <header>
          <h1>Aria, Aura Skincare support</h1>
          <p>Talk to our AI voice agent. Use Edge or Chrome with a microphone. Wearing headphones? Tick the box below to interrupt Aria just by speaking.</p>
        </header>
        {!supported && <p className="error">This browser does not support speech recognition. Please open this page in Chrome or Edge.</p>}
        <div className="grid">
          <section className="card" aria-label="Call">
            <div className="stage" aria-live="polite">
              <span className={`dot ${agent}`} />
              <div><strong>{LABEL[agent]}</strong><span>{agent === 'speaking' && headphones ? 'Aria is talking. Speak to interrupt her.' : HINT[agent]}</span></div>
            </div>
            <div className="actions">
              <button className="primary" onClick={startCall} disabled={inCall || !supported}>Start call</button>
              <button className="end" onClick={endCall} disabled={!inCall}>End call</button>
            </div>
            <label style={{ display: 'block', margin: '8px 0', fontSize: '0.85rem' }}>
              <input type="checkbox" checked={headphones} onChange={(e) => { hp.current = e.target.checked; setHeadphones(e.target.checked); }} />{' '}
              I am wearing headphones (lets me interrupt Aria by speaking)
            </label>
            {error && <p className="error" role="alert">{error}</p>}
            <div className="log" role="log">
              {log.length === 0 && <p className="empty">The transcript appears here once the call starts.</p>}
              {log.filter((m) => m.text).map((m, i) => (
                  <div key={i} className={`msg ${m.role}`}><small>{m.role === 'agent' ? 'Aria' : 'Customer'}</small>{m.text}</div>
              ))}
              <div ref={logEnd} />
            </div>
            {debug && toolLog.length > 0 && (
                <div className="chips">{toolLog.map((t, i) => <span className="chip" key={i} title={JSON.stringify(t.output)}>{t.name}({t.input?.order_id}) {t.output?.found === false ? 'not found' : t.output?.success === false ? 'refused' : 'ok'}</span>)}</div>
            )}
          </section>

          <aside className="card" aria-label="Test orders">
            <h2>Test orders</h2>
            {Object.values(ORDERS).map((o) => (
                <div className="order" key={o.order_id}>
                  <b>{o.order_id}</b>
                  <dl>
                    <dt>Customer</dt><dd>{o.customer}</dd>
                    <dt>Product</dt><dd>{o.product}</dd>
                    <dt>Value</dt><dd>Rs {o.value_inr}</dd>
                    <dt>Status</dt><dd>{overrides[o.order_id] || o.status}</dd>
                    <dt>Notes</dt><dd>{[o.carrier && `${o.carrier} ${o.tracking_id}`, o.note].filter(Boolean).join('. ')}</dd>
                  </dl>
                </div>
            ))}
            <h2 style={{ marginTop: 16 }}>Try saying</h2>
            <ul className="try">{TRY.map((t) => <li key={t}>{t}</li>)}</ul>
          </aside>
        </div>

        {phase === 'ended' && (
            <section className="card summary" aria-label="Call summary">
              <h2>Call summary</h2>
              {summary ? <pre>{JSON.stringify(summary, null, 2)}</pre> : <p>Preparing summary...</p>}
            </section>
        )}
      </main>
  );
}