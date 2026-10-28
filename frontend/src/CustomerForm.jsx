import { useState } from 'react';

export default function CustomerForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    email: initial?.email ?? '',
    phone: initial?.phone ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return setError('Name is required');
    setSaving(true);
    setError('');
    try {
      await onSave(form);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>{initial ? 'Edit customer' : 'Add customer'}</h2>
        <label>Name *<input value={form.name} onChange={set('name')} autoFocus /></label>
        <label>Email<input type="email" value={form.email} onChange={set('email')} /></label>
        <label>Phone<input value={form.phone} onChange={set('phone')} /></label>
        {error && <p className="error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}
