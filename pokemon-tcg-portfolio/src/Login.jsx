import { useState } from 'react';
import { api } from './api.js';

export default function Login({ onLoggedIn }) {
  const [password, setPassword] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api.login(password);
      onLoggedIn();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <form className="card login-card" onSubmit={submit}>
        <span className="logo big" aria-hidden="true" />
        <h1>TCG Portfolio</h1>
        <p className="muted">Voer je wachtwoord in om je portfolio te openen.</p>
        <input
          className="input"
          type="password"
          autoComplete="current-password"
          placeholder="Wachtwoord"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
        />
        {err && <div className="banner warn">{err}</div>}
        <button className="btn primary big" disabled={busy || !password}>{busy ? 'Bezig…' : 'Inloggen'}</button>
      </form>
    </div>
  );
}
