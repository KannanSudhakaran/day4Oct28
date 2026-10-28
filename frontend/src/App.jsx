import { useState } from 'react';
import Customers from './Customers';
import Chat from './Chat';
import { SWAGGER_URL } from './api';
import './App.css';

export default function App() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">C</span>
          <div>
            <strong>Customer Hub</strong>
            <span className="muted"> · CRM dashboard</span>
          </div>
        </div>
        <a className="btn ghost small" href={SWAGGER_URL} target="_blank" rel="noreferrer">API docs ↗</a>
      </header>
      <main className="layout">
        <Customers refreshKey={refreshKey} />
        <Chat onDataChanged={() => setRefreshKey((k) => k + 1)} />
      </main>
    </div>
  );
}
