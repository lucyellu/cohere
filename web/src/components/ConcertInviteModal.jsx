import { useState, useRef, useEffect } from 'react';
import { readProfile } from '../account.js';
import { roomUrl } from '../live/roomShare.js';
import html2canvas from 'html2canvas';

export default function ConcertInviteModal({ concert, open, onClose, onEnterShow, onAddCalendar, userZone }) {
  const [profile] = useState(() => readProfile());
  const [hostName, setHostName] = useState(() => profile.name || 'A Friend');
  const [customNote, setCustomNote] = useState('');
  const [copied, setCopied] = useState(false);
  const [copiedLinkOnly, setCopiedLinkOnly] = useState(false);
  const [showFullUrl, setShowFullUrl] = useState(false);
  const [savingImg, setSavingImg] = useState(false);
  const [rsvpState, setRsvpState] = useState(null);
  const cardRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !concert) return null;

  const url = roomUrl(concert);
  const formattedDate = formatConcertDate(concert.startDate || concert.date);
  const timeStr = formatConcertTime(concert, userZone);
  const locationStr = [concert.venue, concert.city, concert.country].filter(Boolean).join(', ');

  // Clean title for embedding
  const cleanLinkTitle = `${concert.artist || 'Concert'} - Live at ${concert.venue || 'Concert Arena'} - ${formattedDate}${timeStr ? ` (${timeStr})` : ''}`;

  const defaultNote = `Hey! I'm attending ${concert.artist || 'this concert'} at ${concert.venue || 'the venue'} and would love for you to join me. Check out the details, RSVP, or join the live room with me!`;
  const noteToUse = customNote || defaultNote;

  // Copy full rich invitation (Plain text + Rich HTML for Mail/Slack/Notion)
  async function copyInviteText() {
    const plainText = `💌 CONCERT INVITATION\n═════════════════════════════════════════\n${hostName} cordially invites you to experience:\n\n🎵 ${concert.artist || 'Live Music'}\n📍 ${locationStr}\n📅 ${formattedDate}${timeStr ? ` · ${timeStr}` : ''}\n\n"${noteToUse}"\n\n👉 Attend: ${cleanLinkTitle}\n${url}\n\n(Direct link: ${url})`;

    const htmlText = `<div style="font-family: sans-serif; max-width: 500px; padding: 20px; border: 2px solid #c8ab7e; border-radius: 16px; background: #fdfbf7; color: #141416;">
      <p style="font-size: 11px; text-transform: uppercase; color: #8f6834; font-weight: bold; letter-spacing: 2px;">✦ Official Concert Invitation ✦</p>
      <p style="font-size: 13px; font-style: italic; color: #7a6d59;"><strong>${hostName}</strong> cordially invites you to experience:</p>
      <h2 style="font-size: 26px; margin: 8px 0; color: #141416;">${concert.artist || 'Live Concert'}</h2>
      <p style="font-size: 13px; margin: 4px 0;">📅 <strong>Date:</strong> ${formattedDate}${timeStr ? ` · ${timeStr}` : ''}</p>
      <p style="font-size: 13px; margin: 4px 0;">📍 <strong>Venue:</strong> ${locationStr}</p>
      <p style="font-size: 13px; margin: 16px 0; padding: 10px; background: #f4ece1; border-radius: 8px; font-style: italic;">"${noteToUse}"</p>
      <div style="margin-top: 18px;">
        <a href="${url}" style="display: inline-block; background: #d9351f; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 999px; font-weight: bold; font-size: 14px;">🎟️ Attend: ${concert.artist || 'Concert'} Live</a>
      </div>
      <p style="margin-top: 20px; font-size: 11px; color: #888;">Direct URL fallback: <a href="${url}" style="color: #666;">${url}</a></p>
    </div>`;

    try {
      if (navigator.clipboard && window.ClipboardItem) {
        const textBlob = new Blob([plainText], { type: 'text/plain' });
        const htmlBlob = new Blob([htmlText], { type: 'text/html' });
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/plain': textBlob,
            'text/html': htmlBlob,
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(plainText);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      await navigator.clipboard.writeText(plainText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  }

  // Copy just the clean embedded link
  async function copyCleanLinkOnly() {
    const plain = `[Attend: ${cleanLinkTitle}](${url})`;
    const html = `<a href="${url}">🎟️ Attend: ${cleanLinkTitle}</a>`;
    try {
      if (navigator.clipboard && window.ClipboardItem) {
        const textBlob = new Blob([plain], { type: 'text/plain' });
        const htmlBlob = new Blob([html], { type: 'text/html' });
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/plain': textBlob,
            'text/html': htmlBlob,
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(plain);
      }
      setCopiedLinkOnly(true);
      setTimeout(() => setCopiedLinkOnly(false), 2500);
    } catch {
      await navigator.clipboard.writeText(plain);
      setCopiedLinkOnly(true);
      setTimeout(() => setCopiedLinkOnly(false), 2500);
    }
  }

  async function downloadCardImage() {
    if (!cardRef.current) return;
    setSavingImg(true);
    try {
      const canvas = await html2canvas(cardRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#fbf7ee',
      });
      const link = document.createElement('a');
      link.download = `Invite-${(concert.artist || 'concert').replace(/\s+/g, '_')}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error('Failed to export card image', err);
    } finally {
      setSavingImg(false);
    }
  }

  function handleRsvp() {
    setRsvpState('accepted');
    if (onAddCalendar) onAddCalendar(concert);
  }

  function handleAttendNow() {
    if (onEnterShow) {
      onEnterShow(concert);
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/75 backdrop-blur-md transition-opacity" onClick={onClose} />

      <div className="relative w-full max-w-xl my-auto z-10">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 z-20 h-9 w-9 rounded-full bg-[#141416] border border-white/20 text-white flex items-center justify-center shadow-xl hover:scale-110 transition-transform cursor-pointer"
          aria-label="Close modal"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* ── OFFICIAL CONCERT INVITATION CARD ── */}
        <div
          ref={cardRef}
          className="relative rounded-3xl p-7 sm:p-10 shadow-2xl overflow-hidden text-[#141416] select-none"
          style={{
            background: 'linear-gradient(135deg, #fdfbf7 0%, #f7efe1 50%, #f0e4cf 100%)',
            border: '2px solid #c8ab7e',
            boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.6), inset 0 0 0 4px rgba(200, 171, 126, 0.3)',
          }}
        >
          {/* Ornate Corner Accents */}
          <div className="absolute top-3 left-3 text-[#c8ab7e] font-serif text-sm opacity-80 select-none">✦ ❖ ✦</div>
          <div className="absolute top-3 right-3 text-[#c8ab7e] font-serif text-sm opacity-80 select-none">✦ ❖ ✦</div>
          <div className="absolute bottom-3 left-3 text-[#c8ab7e] font-serif text-sm opacity-80 select-none">✦ ❖ ✦</div>
          <div className="absolute bottom-3 right-3 text-[#c8ab7e] font-serif text-sm opacity-80 select-none">✦ ❖ ✦</div>

          {/* Card Header & Seal */}
          <div className="text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#c8ab7e]/50 bg-[#c8ab7e]/15 text-[#8f6834] text-[10px] font-bold uppercase tracking-[0.25em]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#d9351f]" />
              Official Concert Invitation
            </div>

            <div className="mt-4 text-xs font-serif italic tracking-widest text-[#7a6d59] uppercase">
              <input
                type="text"
                value={hostName}
                onChange={(e) => setHostName(e.target.value)}
                placeholder="Your Name"
                className="text-center bg-transparent border-b border-[#c8ab7e]/40 focus:border-[#d9351f] outline-none px-1 text-sm font-semibold text-[#141416] w-36 sm:w-48 placeholder:text-[#a09480]"
                title="Click to edit your name"
              />
              <span className="block mt-1">cordially invites you to experience</span>
            </div>

            {/* Headliner Artist Title */}
            <h2 className="mt-3 text-3xl sm:text-4xl font-extrabold tracking-tight text-[#141416] font-sans leading-tight">
              {concert.artist || 'Live Music Concert'}
            </h2>

            {concert.tour && (
              <div className="mt-1 text-xs uppercase font-semibold tracking-wider text-[#d9351f]">
                {concert.tour}
              </div>
            )}
          </div>

          {/* Decorative Divider */}
          <div className="my-5 flex items-center justify-center gap-3 text-[#c8ab7e]">
            <div className="h-[1px] w-16 bg-gradient-to-r from-transparent to-[#c8ab7e]" />
            <span className="text-xs">✦ ❖ ✦</span>
            <div className="h-[1px] w-16 bg-gradient-to-l from-transparent to-[#c8ab7e]" />
          </div>

          {/* Event Details Grid */}
          <div className="rounded-2xl bg-white/75 backdrop-blur-sm border border-[#c8ab7e]/30 p-4 sm:p-5 shadow-sm text-xs leading-relaxed space-y-2.5">
            <div className="flex items-start gap-3">
              <span className="text-base shrink-0">📅</span>
              <div>
                <span className="font-bold text-[#141416]">Date & Time: </span>
                <span className="text-[#3b352b]">{formattedDate}{timeStr ? ` · ${timeStr}` : ''}</span>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="text-base shrink-0">📍</span>
              <div>
                <span className="font-bold text-[#141416]">Venue: </span>
                <span className="text-[#3b352b]">{locationStr || 'Live Arena / Stadium'}</span>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="text-base shrink-0">🎟️</span>
              <div>
                <span className="font-bold text-[#141416]">Admission: </span>
                <span className="text-[#3b352b]">VIP Guest Pass · Real-Time Audio & Crowd Sync</span>
              </div>
            </div>

            {concert.capacity && (
              <div className="flex items-start gap-3">
                <span className="text-base shrink-0">👥</span>
                <div>
                  <span className="font-bold text-[#141416]">Capacity: </span>
                  <span className="text-[#3b352b]">{Number(concert.capacity).toLocaleString()} Attendance</span>
                </div>
              </div>
            )}
          </div>

          {/* Personal Note Box */}
          <div className="mt-4">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-[#7a6d59] mb-1">
              Personal Note from {hostName}:
            </label>
            <textarea
              rows={2}
              value={customNote}
              onChange={(e) => setCustomNote(e.target.value)}
              placeholder={defaultNote}
              className="w-full text-xs text-[#2b2721] bg-white/60 border border-[#c8ab7e]/35 rounded-xl p-2.5 outline-none focus:border-[#d9351f] resize-none leading-relaxed placeholder:text-[#8f8576]"
            />
          </div>

          {/* ── CLEAN EMBEDDED ATTEND LINK PREVIEW ── */}
          <div className="mt-4 p-3.5 rounded-2xl bg-[#efe5d3]/60 border border-[#c8ab7e]/40 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] uppercase font-bold tracking-wider text-[#7a6d59]">
                Clean Embedded Invite Link:
              </span>
              <button
                type="button"
                onClick={copyCleanLinkOnly}
                className="text-[11px] font-semibold text-[#d9351f] hover:underline cursor-pointer"
              >
                {copiedLinkOnly ? '✓ Link Copied!' : 'Copy Clean Link'}
              </button>
            </div>

            <a
              href={url}
              onClick={(e) => { e.preventDefault(); handleAttendNow(); }}
              className="inline-flex items-center gap-2 p-2.5 rounded-xl bg-white border border-[#c8ab7e]/50 text-xs font-semibold text-[#141416] hover:border-[#d9351f] transition-colors shadow-xs group"
              title="Click to open or copy this clean attendee link"
            >
              <span className="text-sm">🎟️</span>
              <span className="truncate group-hover:text-[#d9351f]">
                Attend: {cleanLinkTitle}
              </span>
            </a>

            {/* Direct fallback link toggle */}
            <div className="mt-1">
              <button
                type="button"
                onClick={() => setShowFullUrl(!showFullUrl)}
                className="text-[10px] text-[#8c806d] hover:text-[#141416] transition underline cursor-pointer"
              >
                {showFullUrl ? 'Hide direct raw URL' : 'Direct URL fallback (in case clean link does not work)'}
              </button>
              {showFullUrl && (
                <div className="mt-1.5 p-2 rounded-lg bg-white/80 border border-[#dad2bf] text-[10px] font-mono break-all select-all text-zinc-600">
                  {url}
                </div>
              )}
            </div>
          </div>

          {/* RSVP Status Banner */}
          {rsvpState === 'accepted' && (
            <div className="mt-4 p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-800 text-center text-xs font-bold animate-pulse">
              ✓ RSVP Confirmed! Show added to your calendar & stamped in your passport.
            </div>
          )}

          {/* ── CARD CALL-TO-ACTIONS ── */}
          <div className="mt-5 pt-4 border-t border-[#c8ab7e]/30 flex flex-wrap gap-2.5 justify-center sm:justify-between items-center">
            <button
              onClick={handleAttendNow}
              className="cohear-attend-btn"
            >
              <PlayIcon className="h-3.5 w-3.5 fill-white" />
              <span>Attend Now / Join Room</span>
            </button>

            <div className="flex items-center gap-2 flex-wrap justify-center">
              <button
                onClick={handleRsvp}
                className="inline-flex items-center gap-1.5 bg-[#141416] hover:bg-black text-[#fafaf7] px-4 py-2.5 rounded-full text-xs font-semibold shadow transition cursor-pointer"
              >
                <span>✉️</span>
                <span>{rsvpState === 'accepted' ? 'RSVP Confirmed' : 'RSVP Yes'}</span>
              </button>

              <button
                onClick={copyInviteText}
                className="inline-flex items-center gap-1.5 bg-white hover:bg-zinc-50 text-[#141416] border border-[#c8ab7e]/60 px-3.5 py-2.5 rounded-full text-xs font-semibold shadow-sm transition cursor-pointer"
                title="Copy formatted invitation message & clean link"
              >
                <span>{copied ? '✓ Copied Invite!' : '📋 Copy Invite'}</span>
              </button>

              <button
                onClick={downloadCardImage}
                disabled={savingImg}
                className="inline-flex items-center gap-1.5 bg-white hover:bg-zinc-50 text-[#141416] border border-[#c8ab7e]/60 px-3 py-2.5 rounded-full text-xs font-semibold shadow-sm transition cursor-pointer"
                title="Download this invite card as an image"
              >
                <span>{savingImg ? 'Saving…' : '🖼️ Save Card'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PlayIcon({ className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <polygon points="6 4 20 12 6 20 6 4" />
    </svg>
  );
}

function formatConcertDate(dateStr) {
  if (!dateStr) return 'Upcoming Tour Date';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function formatConcertTime(concert, userZone) {
  if (concert.time) return concert.time;
  if (concert.startDate) {
    try {
      const d = new Date(concert.startDate);
      if (!isNaN(d.getTime())) {
        return d.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          timeZoneName: 'short',
          timeZone: userZone || undefined,
        });
      }
    } catch {}
  }
  return '';
}

