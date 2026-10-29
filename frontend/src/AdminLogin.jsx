import { useState } from 'react';
import { api, setToken } from './api';

export default function AdminLogin({ onAuthed, onBack }) {
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { token, user } = await api.adminLogin(form);
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
        <h2>Admin sign in</h2>
        <label>Email<input type="email" value={form.email} onChange={set('email')} required /></label>
        <label>Password<input type="password" value={form.password} onChange={set('password')} required /></label>
        {error && <p className="error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onBack}>Sales login</button>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Please wait…' : 'Sign in'}</button>
        </div>
      </form>
    </div>
  );
}
