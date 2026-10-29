import { useState } from 'react';
import { api, setToken } from './api';

export default function Auth({ onAuthed }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'register') {
        await api.register(form);
      }
      const { token, user } = await api.login({ email: form.email, password: form.password });
      setToken(token);
      onAuthed(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <form className="modal" onSubmit={submit}>
        <h2>{mode === 'login' ? 'Log in' : 'Create account'}</h2>
        {mode === 'register' && (
          <label>Name<input value={form.name} onChange={set('name')} required /></label>
        )}
        <label>Email<input type="email" value={form.email} onChange={set('email')} required /></label>
        <label>
          Password
          <input type="password" value={form.password} onChange={set('password')} minLength={8} required />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="modal-actions">
          <button
            type="button"
            className="btn ghost"
            onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
          >
            {mode === 'login' ? 'Register instead' : 'Log in instead'}
          </button>
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Register'}
          </button>
        </div>
      </form>
    </div>
  );
}
