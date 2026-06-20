import { useEffect, useRef, useState } from 'react';
import { supabase, supabaseEnabled } from '../live/supabase.js';

// Always-visible account control in the top bar. The email magic link is both
// sign-up and sign-in, so any visitor can create an account and have their
// passport follow them across devices. Hidden entirely when Supabase isn't
// configured (local-only guest mode).
export default function AccountButton() {
  const [session, setSession] = useState(null);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    if (!supabase) return undefined;
    let alive = true;
    supabase.auth.getSession().then(({ data }) => { if (alive) setSession(data.session || null); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => { alive = false; sub?.subscription?.unsubscribe?.(); };
  }, []);

  useEffect(() => {
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  if (!supabaseEnabled) return null;
  const user = session?.user && !session.user.is_anonymous ? session.user : null;

  async function sendLink(e) {
    e.preventDefault();
    if (!email.trim()) return;
    setMsg('Sending…');
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    setMsg(error ? error.message : 'Check your email for the sign-in link.');
  }

  async function signOut() {
    await supabase.auth.signOut();
    setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        className="cohear-icon-button"
        onClick={() => { setMsg(''); setOpen((v) => !v); }}
        title={user ? user.email : 'Sign in'}
        aria-label={user ? 'Account' : 'Sign in'}
      >
        {user ? (
          <span className="grid h-5 w-5 place-items-center rounded-full bg-amber-200/25 text-[11px] font-bold text-amber-100">
            {(user.email?.[0] || '?').toUpperCase()}
          </span>
        ) : (
          <UserIcon />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-50 w-64 rounded-lg border border-white/10 bg-zinc-900 p-3 shadow-xl">
          {user ? (
            <div className="space-y-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Signed in</div>
                <div className="truncate text-sm font-semibold text-white">{user.email}</div>
              </div>
              <p className="text-xs leading-5 text-zinc-500">Your passport syncs to this account on every device you sign in on.</p>
              <button className="cohear-secondary w-full justify-center" onClick={signOut}>Sign out</button>
            </div>
          ) : (
            <form onSubmit={sendLink} className="space-y-2">
              <p className="text-xs leading-5 text-zinc-400">Sign in or create an account — we’ll email you a one-tap link.</p>
              <input
                className="cohear-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
              />
              <button className="cohear-primary w-full justify-center" disabled={!email.trim()}>Email me a link</button>
              {msg && <p className="text-xs leading-5 text-zinc-500">{msg}</p>}
            </form>
          )}
        </div>
      )}
    </div>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}
