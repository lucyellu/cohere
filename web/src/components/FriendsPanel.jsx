import { useEffect, useMemo, useState } from 'react';
import {
  FRIENDS_EVENT,
  addFriendByCode,
  dismissInvite,
  friendInviteUrl,
  myFriendCode,
  readFriends,
  readFriendShows,
  readInvites,
  refreshFriendTags,
  removeFriend,
  renameFriend,
  decorate,
} from '../friends.js';

// Friends: swap codes, then see who went to what. The panel leads with the
// answer — a dated list of every show your friends have a ticket for, marked
// with whether you were there too — and keeps the plumbing (your code, adding
// people, the roster) tucked underneath.
export default function FriendsPanel({ stubIds = [], onRefreshed }) {
  const [friends, setFriends] = useState(() => readFriends());
  const [invites, setInvites] = useState(() => readInvites());
  const [shows, setShows] = useState(() => readFriendShows());
  const [input, setInput] = useState('');
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState('');
  const [busy, setBusy] = useState(false);
  const [focus, setFocus] = useState(''); // userKey filter, '' = everyone
  const [togetherOnly, setTogetherOnly] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);

  useEffect(() => {
    function refresh() {
      const next = readFriends();
      setFriends(next);
      setInvites(readInvites());
      setShows(readFriendShows(next));
    }
    window.addEventListener(FRIENDS_EVENT, refresh);
    return () => window.removeEventListener(FRIENDS_EVENT, refresh);
  }, []);

  const decorated = useMemo(() => friends.map(decorate), [friends]);
  const mine = useMemo(() => new Set(stubIds), [stubIds]);

  // How many shows each friend turns up on, and how many of those you share.
  const counts = useMemo(() => {
    const out = {};
    for (const show of shows) {
      for (const person of show.friends) {
        const row = (out[person.userKey] ||= { total: 0, together: 0 });
        row.total += 1;
        if (mine.has(show.concertId)) row.together += 1;
      }
    }
    return out;
  }, [shows, mine]);

  const visibleShows = useMemo(() => shows.filter((s) => {
    if (focus && !s.friends.some((f) => f.userKey === focus)) return false;
    if (togetherOnly && !mine.has(s.concertId)) return false;
    return true;
  }), [shows, focus, togetherOnly, mine]);
  const togetherCount = shows.filter((s) => mine.has(s.concertId)).length;

  async function handleRefresh() {
    setBusy(true);
    try {
      await refreshFriendTags({ force: true });
      setShows(readFriendShows());
      onRefreshed?.();
    } finally {
      setBusy(false);
    }
  }

  async function handleAdd(e) {
    e.preventDefault();
    const result = addFriendByCode(input);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    setInput('');
    setMessage(result.already ? `${result.friend.name} is already on your list.` : `Added ${result.friend.name}.`);
    await handleRefresh();
  }

  async function acceptInvite(invite) {
    const result = addFriendByCode(invite.code);
    setMessage(result.ok ? `Added ${result.friend.name}.` : result.error);
    if (result.ok) await handleRefresh();
  }

  async function copy(text, label) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(''), 2000);
    } catch {
      setMessage('Copy failed — select the code and copy it manually.');
    }
  }

  return (
    <section className="cohear-panel overflow-hidden" id="pp-friends">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
        <div>
          <h3 className="text-sm font-semibold text-white">Friends</h3>
          <p className="text-xs text-zinc-500">
            {decorated.length
              ? `${shows.length} ${shows.length === 1 ? 'show' : 'shows'} across ${decorated.length} ${decorated.length === 1 ? 'friend' : 'friends'} · ${togetherCount} with you`
              : 'Swap codes and every show you both attended prints their name on your ticket stub.'}
          </p>
        </div>
        <div className="flex gap-2">
          <button className="cohear-secondary min-h-8 px-3 text-xs" onClick={handleRefresh} disabled={busy}>
            {busy ? 'Checking…' : '↻ Refresh'}
          </button>
          <button className="cohear-secondary min-h-8 px-3 text-xs" onClick={() => setManageOpen((v) => !v)}>
            {manageOpen ? 'Done' : '＋ Add / manage'}
          </button>
        </div>
      </div>

      <div className="space-y-4 p-4">
        {/* Pending invites from a ?friend=… link — always surfaced */}
        {invites.map((invite) => (
          <div key={invite.userKey} className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-300/25 bg-amber-300/10 px-3 py-2">
            <span className="min-w-0 flex-1 text-xs text-amber-100">
              <b className="font-semibold">{invite.name || 'Someone'}</b> shared their passport code with you.
            </span>
            <button className="cohear-primary min-h-8 px-2.5 text-xs" onClick={() => acceptInvite(invite)}>Add friend</button>
            <button className="cohear-secondary min-h-8 px-2.5 text-xs" onClick={() => dismissInvite(invite.userKey)}>Dismiss</button>
          </div>
        ))}

        {!decorated.length ? (
          <div className="grid min-h-24 place-items-center rounded-lg border border-white/10 bg-black/20 p-6 text-center text-sm text-zinc-500">
            <p className="max-w-sm leading-6">
              No friends yet — send someone your invite link and their name starts showing up on the stubs for shows you both caught.
            </p>
          </div>
        ) : (
          <>
            {/* Filter rail: everyone, or one friend at a time */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={`cohear-friend-filter${focus || togetherOnly ? '' : ' is-on'}`}
                onClick={() => { setFocus(''); setTogetherOnly(false); }}
              >
                Everyone
              </button>
              {togetherCount > 0 && (
                <button
                  type="button"
                  className={`cohear-friend-filter cohear-friend-filter--together${togetherOnly ? ' is-on' : ''}`}
                  onClick={() => setTogetherOnly((v) => !v)}
                  title="Only the shows you were at too"
                >
                  <i aria-hidden="true">✓</i>
                  <span>With you</span>
                  <b>{togetherCount}</b>
                </button>
              )}
              {decorated.map((friend) => (
                <button
                  key={friend.userKey}
                  type="button"
                  className={`cohear-friend-filter${focus === friend.userKey ? ' is-on' : ''}`}
                  style={{ '--chip': friend.color }}
                  onClick={() => setFocus(focus === friend.userKey ? '' : friend.userKey)}
                  title={`${counts[friend.userKey]?.total || 0} shows · ${counts[friend.userKey]?.together || 0} with you`}
                >
                  <i aria-hidden="true">{friend.initials}</i>
                  <span>{friend.name}</span>
                  <b>{counts[friend.userKey]?.total || 0}</b>
                </button>
              ))}
            </div>

            {/* The answer: who went to what */}
            {!visibleShows.length ? (
              <p className="rounded-lg border border-white/10 bg-black/20 px-3 py-4 text-center text-xs text-zinc-500">
                {togetherOnly
                  ? "No shows in common yet — clear the filter to see everywhere they've been."
                  : "Nothing on their passports yet — hit Refresh once they've been to a show."}
              </p>
            ) : (
              <div className="cohear-friend-shows">
                {visibleShows.map((show) => {
                  const together = mine.has(show.concertId);
                  return (
                    <div key={show.concertId} className={`cohear-friend-show${together ? ' is-together' : ''}`}>
                      <span className="cohear-friend-show__date">{fmtDate(show.date)}</span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-white">
                          {show.artist || show.venue || show.concertId}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-zinc-500">
                          {[show.venue, show.city].filter(Boolean).join(' · ') || '—'}
                        </span>
                      </span>
                      <span className="flex flex-wrap gap-1">
                        {show.friends.map((friend) => (
                          <span key={friend.userKey} className="cohear-friend-chip" style={{ '--chip': friend.color }}>
                            <i aria-hidden="true">{friend.initials}</i>
                            <b>{friend.name}</b>
                          </span>
                        ))}
                      </span>
                      <span className={together ? 'cohear-friend-show__tag is-you' : 'cohear-friend-show__tag'}>
                        {together ? '✓ You were there' : 'You missed it'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* Plumbing: your code, adding people, renaming/removing */}
        {(manageOpen || !decorated.length) && (
          <div className="space-y-4 rounded-lg border border-white/10 bg-black/20 p-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">Your passport code</div>
              <code className="mt-2 block break-all rounded bg-black/40 px-2 py-1.5 font-mono text-[11px] text-zinc-300">
                {myFriendCode()}
              </code>
              <div className="mt-2 flex flex-wrap gap-2">
                <button className="cohear-secondary min-h-8 px-2.5 text-xs" onClick={() => copy(myFriendCode(), 'code')}>
                  {copied === 'code' ? '✓ Copied' : 'Copy code'}
                </button>
                <button className="cohear-secondary min-h-8 px-2.5 text-xs" onClick={() => copy(friendInviteUrl(), 'link')}>
                  {copied === 'link' ? '✓ Copied' : 'Copy invite link'}
                </button>
              </div>
              <p className="mt-2 text-[11px] leading-5 text-zinc-600">
                Anyone with this code can see which shows you both attended — nothing else, and nobody can search for you.
              </p>
            </div>

            <form onSubmit={handleAdd} className="flex flex-wrap items-center gap-2">
              <input
                className="cohear-input h-9 flex-1"
                value={input}
                onChange={(e) => { setInput(e.target.value); setMessage(''); }}
                placeholder="Paste a friend's code or invite link"
              />
              <button className="cohear-primary min-h-9 px-3 text-xs" disabled={!input.trim()}>Add friend</button>
              {message && <p className="w-full text-xs text-zinc-500">{message}</p>}
            </form>

            {decorated.length > 0 && (
              <div className="grid gap-2 sm:grid-cols-2">
                {decorated.map((friend) => (
                  <div key={friend.userKey} className="flex items-center gap-3 rounded-lg border border-white/10 bg-black/25 p-3">
                    <span className="cohear-friend-avatar" style={{ '--chip': friend.color }}>{friend.initials}</span>
                    <div className="min-w-0 flex-1">
                      <input
                        className="w-full truncate border-none bg-transparent p-0 text-sm font-semibold text-white outline-none focus:underline"
                        value={friend.name}
                        onChange={(e) => renameFriend(friend.userKey, e.target.value)}
                        title="Rename — just for your own passport"
                      />
                      <div className="mt-0.5 text-xs text-zinc-500">
                        {counts[friend.userKey]?.total || 0} shows · {counts[friend.userKey]?.together || 0} with you
                      </div>
                    </div>
                    <button
                      className="cohear-secondary min-h-8 px-2.5 text-xs text-red-400"
                      onClick={() => removeFriend(friend.userKey)}
                      title="Remove this friend — their name comes off your stubs"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
