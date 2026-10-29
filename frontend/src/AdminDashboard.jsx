import { useEffect, useMemo, useState } from 'react';
import { api } from './api';

const COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'email', label: 'Email' },
  { key: 'created_at', label: 'Registered' },
  { key: 'customer_count', label: 'Customers' },
];

export default function AdminDashboard() {
  const [users, setUsers] = useState(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState({ key: 'customer_count', dir: 'desc' });

  const load = () => {
    setError('');
    setUsers(null);
    api.adminUsers().then(setUsers).catch((e) => setError(e.message));
  };
  useEffect(load, []);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = (users || []).filter((u) => !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
    const sign = sort.dir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const x = a[sort.key], y = b[sort.key];
      return (typeof x === 'number' ? x - y : String(x).localeCompare(String(y))) * sign;
    });
  }, [users, search, sort]);

  const toggleSort = (key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'customer_count' ? 'desc' : 'asc' }));

  const totalCustomers = (users || []).reduce((n, u) => n + u.customer_count, 0);

  return (
    <main className="admin">
      <div className="stat-row">
        <div className="card stat"><span className="muted">Sales users</span><strong>{users ? users.length : '–'}</strong></div>
        <div className="card stat"><span className="muted">Total customers</span><strong>{users ? totalCustomers : '–'}</strong></div>
      </div>
      <section className="card">
        <div className="card-head">
          <h2>Sales users</h2>
          <input className="search" placeholder="Search name or email" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {error ? (
          <p className="error">{error} <button className="btn ghost small" onClick={load}>Retry</button></p>
        ) : !users ? (
          <p className="empty">Loading…</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {COLUMNS.map((c) => (
                    <th key={c.key} onClick={() => toggleSort(c.key)} className="sortable">
                      {c.label}{sort.key === c.key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={COLUMNS.length} className="empty">No sales users found.</td></tr>
                ) : rows.map((u) => (
                  <tr key={u.user_id}>
                    <td>{u.name}</td>
                    <td>{u.email}</td>
                    <td>{new Date(u.created_at).toLocaleDateString()}</td>
                    <td>{u.customer_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
