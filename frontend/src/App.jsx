import { useEffect, useState } from 'react';
import Customers from './Customers';
import Chat from './Chat';
import Auth from './Auth';
import { api, getToken, clearToken, setUnauthorizedHandler, SWAGGER_URL } from './api';
import './App.css';

export default function App() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(() => !!getToken());

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    if (getToken()) {
      api.me().then(setUser).catch(() => {}).finally(() => setChecking(false));
    }
  }, []);

  const logout = () => { clearToken(); setUser(null); };

  if (checking) return null;
  if (!user) return <Auth onAuthed={setUser} />;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">C</span>
          <div>
            <strong>Customer Hub</strong>
            <span className="muted"> · {user.name}</span>
          </div>
        </div>
        <div>
          <a className="btn ghost small" href={SWAGGER_URL} target="_blank" rel="noreferrer">API docs ↗</a>{' '}
          <button className="btn ghost small" onClick={logout}>Log out</button>
        </div>
      </header>
      <main className="layout">
        <Customers refreshKey={refreshKey} />
        <Chat onDataChanged={() => setRefreshKey((k) => k + 1)} />
      </main>
    </div>
  );
}
