import { useState } from 'react';
import { setGuestName, guestName } from '../live/liveApi.js';
import { readProfile, writeProfile } from '../account.js';
import { supabase, supabaseEnabled } from '../live/supabase.js';

// First-run welcome. Explains the one idea that makes Cohere click ("a shared
// clock puts you in the crowd with everyone — and your friends"), captures a
// name for the passport + crowd, offers account creation, and points at the
// first action. Shown once (localStorage flag); skippable.

const SEEN_KEY = 'cohear_onboarded_v1';

export function shouldOnboard() {
  try {
    return !localStorage.getItem(SEEN_KEY);
  } catch {
    return false;
  }
}

export default function Onboarding({ onClose }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState(() => guestName() || readProfile().name || '');
  const [email, setEmail] = useState('');
  const [authMsg, setAuthMsg] = useState('');
  const [authSending, setAuthSending] = useState(false);

  function finish() {
    const clean = name.trim().slice(0, 24);
    if (clean) {
      setGuestName(clean);
      writeProfile({ name: clean });
    }
    try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* ignore */ }
    onClose?.();
  }

  async function sendMagicLink(e) {
    e.preventDefault();
    if (!email.trim() || !supabase) return;
    setAuthSending(true);
    setAuthMsg('Sending…');
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: window.location.origin },
      });
      setAuthMsg(error ? error.message : '✓ Check your email for the sign-in link!');
    } catch (err) {
      setAuthMsg(err.message || 'Something went wrong.');
    } finally {
      setAuthSending(false);
    }
  }

  // Build step list — conditionally include the auth step only when Supabase is available
  const steps = [
    {
      id: 'intro',
      art: '🌍',
      title: 'Be in the crowd — from anywhere',
      body: 'Pick any concert and step into its live room. A shared clock keeps you, your friends, and thousands of fans worldwide on the exact same moment of the show.',
    },
    {
      id: 'name',
      art: '🛂',
      title: 'What should the crowd call you?',
      body: 'This names you in the room and on your concert passport. You can change it anytime.',
      input: 'name',
    },
    // Account creation step — only shown when Supabase is configured
    ...(supabaseEnabled ? [{
      id: 'auth',
      art: '🔐',
      title: 'Save your passport across devices',
      body: 'Enter your email to create an account or sign in. We\'ll send a one-tap magic link — no password needed.',
      input: 'email',
    }] : []),
    {
      id: 'crew',
      art: '🎟',
      title: 'Bring your crew',
      body: 'Open a show in Discover → Join → tap "Invite crew" to send a link that drops your friends into the same room. Every show you attend stamps your passport.',
    },
  ];

  const s = steps[step];
  const last = step === steps.length - 1;

  function handleNext() {
    if (last) {
      finish();
    } else {
      setStep((p) => p + 1);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="cohear-panel w-full max-w-md overflow-hidden">
        <div className="flex flex-col items-center gap-3 px-7 pt-8 text-center">
          <div className="text-5xl">{s.art}</div>
          <h2 className="text-xl font-bold text-white">{s.title}</h2>
          <p className="max-w-sm text-sm leading-6 text-zinc-400">{s.body}</p>

          {/* Name input */}
          {s.input === 'name' && (
            <input
              className="cohear-input mt-1 w-full max-w-xs text-center"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              maxLength={24}
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleNext()}
            />
          )}

          {/* Email sign-up / sign-in */}
          {s.input === 'email' && (
            <form onSubmit={sendMagicLink} className="mt-2 w-full max-w-xs space-y-2">
              <input
                className="cohear-input w-full text-center"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && email.trim() && sendMagicLink(e)}
              />
              <button
                type="submit"
                className="cohear-primary w-full justify-center"
                disabled={!email.trim() || authSending}
              >
                {authSending ? 'Sending…' : '✉ Send me a sign-in link'}
              </button>
              {authMsg && (
                <p className={`text-xs leading-5 ${authMsg.startsWith('✓') ? 'text-emerald-400' : 'text-zinc-500'}`}>
                  {authMsg}
                </p>
              )}
            </form>
          )}
        </div>

        <div className="mt-7 flex items-center justify-center gap-1.5">
          {steps.map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? 'w-5 bg-cyan-300' : 'w-1.5 bg-white/20'}`} />
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between gap-3 border-t border-white/10 px-6 py-4">
          <button className="text-xs text-zinc-500 hover:text-zinc-300" onClick={finish}>
            {s.input === 'email' ? 'Skip — stay as guest' : 'Skip'}
          </button>
          <div className="flex gap-2">
            {step > 0 && (
              <button className="cohear-secondary min-h-9 px-4 text-sm" onClick={() => setStep((p) => p - 1)}>
                Back
              </button>
            )}
            <button
              className="cohear-primary min-h-9 px-5 text-sm"
              onClick={handleNext}
            >
              {last ? 'Start exploring' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
