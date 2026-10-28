import { useEffect, useMemo, useState } from 'react';
import { api } from './api';
import CustomerForm from './CustomerForm';

export default function Customers({ refreshKey }) {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(null); // null | 'new' | customer

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setCustomers(await api.list());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [refreshKey]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) =>
      [c.name, c.email, c.phone].some((v) => v?.toLowerCase().includes(q)));
  }, [customers, query]);

  const save = async (data) => {
    if (editing === 'new') await api.create(data);
    else await api.update(editing.customer_id, data);
    setEditing(null);
    load();
  };

  const remove = async (c) => {
    if (!window.confirm(`Delete ${c.name}?`)) return;
    try {
      await api.remove(c.customer_id);
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2>Customers</h2>
          <p className="muted">{customers.length} total</p>
        </div>
        <div className="toolbar">
          <input
            className="search"
            placeholder="Search name, email, phone…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="btn primary" onClick={() => setEditing('new')}>+ Add customer</button>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>ID</th><th>Name</th><th>Email</th><th>Phone</th><th>Created</th><th /></tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan="6" className="empty">Loading…</td></tr>}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan="6" className="empty">No customers found</td></tr>
            )}
            {!loading && filtered.map((c) => (
              <tr key={c.customer_id}>
                <td className="muted">#{c.customer_id}</td>
                <td>
                  <span className="avatar">{c.name?.[0]?.toUpperCase()}</span>
                  {c.name}
                </td>
                <td>{c.email || '—'}</td>
                <td>{c.phone || '—'}</td>
                <td className="muted">{new Date(c.created_at).toLocaleDateString()}</td>
                <td className="row-actions">
                  <button className="btn small ghost" onClick={() => setEditing(c)}>Edit</button>
                  <button className="btn small danger" onClick={() => remove(c)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <CustomerForm
          initial={editing === 'new' ? null : editing}
          onSave={save}
          onCancel={() => setEditing(null)}
        />
      )}
    </section>
  );
}
