import { useEffect, useState, type ReactNode } from 'react';
import { useAuth } from './auth';

const card: React.CSSProperties = {
  width: 340,
  border: '1px solid var(--clr-border)',
  borderRadius: 14,
  background: 'var(--clr-surface)',
  padding: 24,
  boxShadow: '0 8px 30px rgba(0,0,0,.06)',
};

const centered: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 20,
};

function friendlyError(code: string): string {
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found'))
    return 'Incorrect email or password.';
  if (code.includes('popup-closed')) return 'Sign-in was cancelled.';
  if (code.includes('network')) return 'Network error — check your connection.';
  return 'Sign-in failed. Please try again.';
}

function LoginScreen() {
  const { signInWithGoogle, signInWithEmail } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(friendlyError(e instanceof Error ? (e as { code?: string }).code ?? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={centered}>
      <div style={card}>
        <h1 style={{ margin: '0 0 4px', fontSize: 20 }}>Geocat Assistant</h1>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--clr-muted)' }}>Sign in to continue.</p>

        <button
          onClick={() => run(signInWithGoogle)}
          disabled={busy}
          style={{
            width: '100%',
            padding: '10px 12px',
            borderRadius: 10,
            border: '1px solid var(--clr-border)',
            background: '#fff',
            fontSize: 14,
            fontWeight: 600,
            cursor: busy ? 'default' : 'pointer',
            opacity: busy ? 0.6 : 1,
          }}
        >
          Continue with Google
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '18px 0' }}>
          <div style={{ flex: 1, height: 1, background: 'var(--clr-border)' }} />
          <span style={{ fontSize: 11, color: 'var(--clr-muted)' }}>or email</span>
          <div style={{ flex: 1, height: 1, background: 'var(--clr-border)' }} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (email && password) run(() => signInWithEmail(email, password));
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
        >
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            style={inputStyle}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            style={inputStyle}
          />
          <button
            type="submit"
            disabled={busy || !email || !password}
            style={{
              padding: '10px 12px',
              borderRadius: 10,
              border: 'none',
              background: 'var(--clr-primary)',
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              cursor: busy || !email || !password ? 'default' : 'pointer',
              opacity: busy || !email || !password ? 0.5 : 1,
            }}
          >
            Sign in
          </button>
        </form>

        {error && <p style={{ margin: '14px 0 0', fontSize: 13, color: '#c0392b' }}>{error}</p>}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid var(--clr-border)',
  fontSize: 14,
  outline: 'none',
};

function DeniedScreen({ email, onSignOut }: { email?: string; onSignOut: () => void }) {
  return (
    <div style={centered}>
      <div style={{ ...card, textAlign: 'center' }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>🔒</div>
        <h1 style={{ margin: '0 0 6px', fontSize: 18 }}>Access not authorized</h1>
        <p style={{ margin: '0 0 18px', fontSize: 13, color: 'var(--clr-muted)' }}>
          {email ? <><code>{email}</code> is</> : 'Your account is'} not on the allowlist for this application.
          Ask an admin to grant access.
        </p>
        <button
          onClick={onSignOut}
          style={{ padding: '9px 16px', borderRadius: 10, border: '1px solid var(--clr-border)', background: 'var(--clr-surface)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

/** Gates the app: Firebase sign-in + backend allowlist check via /api/me. */
export default function AuthGate({ children }: { children: ReactNode }) {
  const { user, loading, getToken, signOut } = useAuth();
  const [access, setAccess] = useState<'checking' | 'allowed' | 'denied' | 'error'>('checking');
  const [detail, setDetail] = useState('');

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setAccess('checking');
    (async () => {
      try {
        const token = await getToken();
        const res = await fetch('/api/me', { headers: { Authorization: `Bearer ${token}` } });
        if (cancelled) return;
        if (res.ok) {
          setAccess('allowed');
          return;
        }
        let msg = '';
        try {
          msg = ((await res.json()) as { error?: string })?.error ?? '';
        } catch {
          /* non-JSON */
        }
        setDetail(msg || `HTTP ${res.status}`);
        setAccess(res.status === 403 ? 'denied' : 'error');
      } catch {
        if (!cancelled) {
          setDetail('Network error — is the backend running on port 8080?');
          setAccess('error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, getToken]);

  if (loading) return <Splash text="Loading…" />;
  if (!user) return <LoginScreen />;
  if (access === 'checking') return <Splash text="Checking access…" />;
  if (access === 'denied') return <DeniedScreen email={user.email ?? undefined} onSignOut={signOut} />;
  if (access === 'error')
    return (
      <div style={centered}>
        <div style={{ ...card, textAlign: 'center' }}>
          <p style={{ fontSize: 14, margin: '0 0 6px' }}>Couldn't verify access.</p>
          {detail && <p style={{ fontSize: 12, color: 'var(--clr-muted)', margin: '0 0 14px', wordBreak: 'break-word' }}>{detail}</p>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button onClick={() => location.reload()} style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid var(--clr-border)', background: 'var(--clr-surface)', cursor: 'pointer' }}>
              Retry
            </button>
            <button onClick={() => signOut()} style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid var(--clr-border)', background: 'var(--clr-surface)', cursor: 'pointer' }}>
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  return <>{children}</>;
}

function Splash({ text }: { text: string }) {
  return (
    <div style={centered}>
      <p style={{ color: 'var(--clr-muted)', fontSize: 14 }}>{text}</p>
    </div>
  );
}
