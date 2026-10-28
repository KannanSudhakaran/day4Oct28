import { useEffect, useRef, useState } from 'react';
import { api } from './api';

const SUGGESTIONS = ['Show all customers', 'Find customer Kannan', 'Add customer Jane Doe, jane@example.com'];

export default function Chat({ onDataChanged }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hi! Ask me about your customers in plain English — I can list, search, add, update or delete them.' },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, busy]);

  const send = async (text) => {
    const message = text.trim();
    if (!message || busy) return;
    // Skip the greeting and error bubbles when sending history to the model
    const history = messages.slice(1).filter((m) => !m.error)
      .map(({ role, content }) => ({ role, content }));
    setMessages((m) => [...m, { role: 'user', content: message }]);
    setInput('');
    setBusy(true);
    try {
      const res = await api.ask(message, history);
      setMessages((m) => [...m, { role: 'assistant', content: res.reply, tools: res.toolCalls }]);
      if (res.dataChanged) onDataChanged();
    } catch (e) {
      setMessages((m) => [...m, { role: 'assistant', content: e.message, error: true }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card chat">
      <div className="card-head">
        <div>
          <h2>Assistant</h2>
          <p className="muted">Natural-language access to your data</p>
        </div>
      </div>

      <div className="messages">
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role}${m.error ? ' err' : ''}`}>
            {m.content}
            {m.tools?.length > 0 && (
              <div className="tools">{m.tools.map((t, j) => <span key={j} className="chip">{t.name}</span>)}</div>
            )}
          </div>
        ))}
        {busy && <div className="bubble assistant typing"><span /><span /><span /></div>}
        <div ref={endRef} />
      </div>

      {messages.length === 1 && (
        <div className="suggestions">
          {SUGGESTIONS.map((s) => <button key={s} className="chip btn-chip" onClick={() => send(s)}>{s}</button>)}
        </div>
      )}

      <form className="composer" onSubmit={(e) => { e.preventDefault(); send(input); }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask something…"
          disabled={busy}
        />
        <button className="btn primary" disabled={busy || !input.trim()}>Send</button>
      </form>
    </section>
  );
}
