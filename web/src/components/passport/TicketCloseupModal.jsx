import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import TicketStub from './TicketStub.jsx';
import RubberStamp from './RubberStamp.jsx';
import SouvenirStamp from './SouvenirStamp.jsx';
import VisaStamp from './VisaStamp.jsx';
import Magnifier from './Magnifier.jsx';
import VenueMap from '../../live/VenueMap.jsx';
import { regionInk, countryEmoji } from './palette.js';
import { formatStampDate } from './EntryStamp.jsx';
import { cityCoords, haversineKm, visaRuleFor, optOutConcert } from '../../account.js';

export default function TicketCloseupModal({
  stub,
  open,
  onClose,
  entries = [],
  visas = [],
  stubs = [],
  art = {},
  artView = {},
  onToggleArt,
  onGenerate,
  generating = false,
  home = null,
  onOpenCity,
  onSyncLive,
  friends = [],
  youName = '',
}) {
  const [loupe, setLoupe] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  // Coordinates of the venue/city
  const coords = useMemo(() => {
    if (!stub) return null;
    return cityCoords(stub.city, stub.lat, stub.lng);
  }, [stub]);

  // Distance from passport home to this concert
  const distance = useMemo(() => {
    if (!home?.lat || !home?.lng || !coords?.lat || !coords?.lng) return null;
    const km = haversineKm(home, coords);
    const miles = km * 0.621371;
    return { km: Math.round(km), miles: Math.round(miles) };
  }, [home, coords]);

  // Relevant entry stamp matching this city/concert
  const matchingEntry = useMemo(() => {
    if (!stub) return null;
    return entries.find((e) => e.concertId === stub.id)
      || entries.find((e) => e.city && stub.city && e.city.toLowerCase() === stub.city.toLowerCase() && e.date === stub.date)
      || entries.find((e) => e.city && stub.city && e.city.toLowerCase() === stub.city.toLowerCase())
      || {
        id: `${stub.city || 'city'}:${stub.date || 'date'}`,
        city: stub.city || 'Live Arena',
        country: stub.country || '',
        date: stub.date || stub.issuedAt || new Date().toISOString(),
        artist: stub.artist,
        venue: stub.venue,
        concertId: stub.id,
      };
  }, [stub, entries]);

  // Relevant country visa matching this stub's country
  const matchingVisa = useMemo(() => {
    if (!stub?.country) return null;
    return visas.find((v) => v.country?.toLowerCase() === stub.country.toLowerCase() || v.id === stub.country.toLowerCase())
      || {
        id: stub.country.toLowerCase(),
        country: stub.country,
        rule: visaRuleFor(stub.country),
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        serial: `VI-${stub.country.slice(0, 3).toUpperCase()}-001`,
        verified: true,
      };
  }, [stub, visas]);

  // Other stubs by this artist or in this city
  const otherArtistStubs = useMemo(() => {
    if (!stub?.artist) return [];
    return stubs.filter((s) => s.artist === stub.artist && s.id !== stub.id);
  }, [stub, stubs]);

  const otherCityStubs = useMemo(() => {
    if (!stub?.city) return [];
    return stubs.filter((s) => s.city === stub.city && s.id !== stub.id && s.artist !== stub.artist);
  }, [stub, stubs]);

  if (!open || !stub) return null;

  const stubArt = art[stub.id];
  const showArt = Boolean(artView[stub.id]);
  const souvenirId = `${matchingEntry?.id}:souvenir`;
  const souvenirArt = art[souvenirId];
  const showSouvenirArt = Boolean(artView[souvenirId]);
  const formattedDate = formatFullConcertDate(stub.startDate || stub.date);
  const formattedTime = formatConcertTime(stub);
  const seat = stub.seat || {};

  const stubComponent = (
    <TicketStub
      stub={stub}
      art={stubArt}
      showArt={showArt}
      onToggleArt={() => onToggleArt?.(stub.id)}
      onGenerate={() => onGenerate?.(stub)}
      generating={generating}
      friends={friends}
      youName={youName}
      isCloseup
    />
  );

  return createPortal(
    <div
      className="cohear-stub-modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Concert stub closeup: ${stub.artist || 'Concert'}`}
    >
      <div
        className="cohear-stub-modal-container"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header Bar */}
        <header className="cohear-stub-modal-header">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-xl">🎟️</span>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-white tracking-wide truncate">
                Concert Stub Closeup
              </h3>
              <p className="text-xs text-zinc-400 truncate">
                Serial #{stub.serial || stub.id} · Mint No. #{String(stub.mintNo ?? stub.edition ?? 1).padStart(4, '0')}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="cohear-stub-modal-close"
            onClick={onClose}
            aria-label="Close closeup"
          >
            ✕
          </button>
        </header>

        {/* Main 2-Panel Body */}
        <div className="cohear-stub-modal-grid">
          {/* LEFT PANEL: The Concert Stub in high-definition closeup */}
          <section className="cohear-stub-left-panel">
            <div className="cohear-stub-stage">
              <Magnifier active={loupe} zoom={2.2} size={160} content={stubComponent}>
                <div className="cohear-stub-hero-wrapper">
                  {stubComponent}
                </div>
              </Magnifier>
            </div>

            {/* Stub inspection & verification toolbar */}
            <div className="cohear-stub-actions-strip">
              <button
                type="button"
                className={`cohear-secondary text-xs px-3 py-1.5 flex items-center gap-1.5 ${loupe ? 'border-amber-400/50 text-amber-300' : ''}`}
                onClick={() => setLoupe((v) => !v)}
                title="Inspect fine print with the magnifier loupe"
              >
                <span>🔍</span>
                <span>{loupe ? 'Put Loupe Away' : 'Inspect Loupe'}</span>
              </button>

              {stub.estTicketUsd > 0 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-950/60 border border-emerald-500/30 text-emerald-300 text-xs font-mono font-bold">
                  💸 est. ${Number(stub.estTicketUsd).toLocaleString()} face value
                </span>
              )}

              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/5 border border-white/10 text-[11px] text-zinc-400 font-mono">
                {stub.verified ? '✓ Verified Issue' : '• Registered Ticket'}
              </span>
            </div>
          </section>

          {/* RIGHT PANEL: Details, Venue Map, Time, and Relevant Stamps */}
          <section className="cohear-stub-right-panel">
            {/* 0. Who else was in the crowd — friends holding a stub for this show */}
            {friends.length > 0 && (
              <div className="cohear-panel p-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-teal-300">
                  In the crowd with you
                </div>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  <span className="cohear-friend-chip cohear-friend-chip--lg cohear-friend-chip--you">
                    <i aria-hidden="true">★</i>
                    <b>{youName || 'You'}</b>
                  </span>
                  {friends.map((friend) => (
                    <span key={friend.userKey} className="cohear-friend-chip cohear-friend-chip--lg" style={{ '--chip': friend.color }}>
                      <i aria-hidden="true">{friend.initials}</i>
                      <b>{friend.name}</b>
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-zinc-500">
                  {friends.length === 1 ? 'This friend' : `These ${friends.length} friends`} minted a stub for this same show.
                </p>
              </div>
            )}

            {/* 1. Artist & Concert Title */}
            <div className="cohear-panel p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-rose-400">
                    Live Performance
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-tight mt-0.5">
                    {stub.artist || 'Live Music Concert'}
                  </h2>
                  {stub.tour && (
                    <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mt-1">
                      {stub.tour}
                    </div>
                  )}
                </div>
                <div className="shrink-0 flex flex-col items-end gap-1">
                  <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/20 border border-rose-500/40 px-2.5 py-0.5 text-[11px] font-bold text-rose-200">
                    Admit One
                  </span>
                  {stub.status && (
                    <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-400">
                      ✓ {stub.status === 'attended' ? 'Attended' : stub.status}
                    </span>
                  )}
                </div>
              </div>

              {/* Date & Time Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-white/10 text-xs">
                <div className="flex items-center gap-2 rounded-lg bg-black/30 p-2.5 border border-white/5">
                  <span className="text-base">📅</span>
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Date</div>
                    <div className="font-semibold text-zinc-200 truncate" title={formattedDate}>{formattedDate}</div>
                  </div>
                </div>

                <div className="flex items-center gap-2 rounded-lg bg-black/30 p-2.5 border border-white/5">
                  <span className="text-base">⏰</span>
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Concert Time</div>
                    <div className="font-semibold text-zinc-200 truncate">{formattedTime || 'Doors 7:00 PM · Show 8:00 PM'}</div>
                  </div>
                </div>
              </div>

              {/* Location & Distance */}
              <div className="rounded-lg bg-black/30 p-2.5 border border-white/5 space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-base">📍</span>
                    <div>
                      <span className="font-bold text-white">{stub.venue || 'Concert Venue'}</span>
                      <span className="text-zinc-400"> · {[stub.city, stub.country].filter(Boolean).join(', ')}</span>
                    </div>
                  </div>
                  {countryEmoji(stub.country) && (
                    <span className="text-base">{countryEmoji(stub.country)}</span>
                  )}
                </div>
                {distance && (
                  <div className="text-[11px] text-cyan-300/80 font-mono pl-6">
                    ✈️ {distance.miles.toLocaleString()} mi ({distance.km.toLocaleString()} km) from your home {home?.city ? `(${home.city})` : ''}
                  </div>
                )}
              </div>

              {/* Seat Details Bar */}
              <div className="grid grid-cols-4 gap-2 rounded-lg bg-white/[0.03] p-2 border border-white/10 text-center font-mono">
                <div>
                  <div className="text-[9px] uppercase font-bold text-zinc-500">Sec</div>
                  <div className="text-xs font-bold text-zinc-200">{seat.section || 'GA'}</div>
                </div>
                <div>
                  <div className="text-[9px] uppercase font-bold text-zinc-500">Row</div>
                  <div className="text-xs font-bold text-zinc-200">{seat.row || '—'}</div>
                </div>
                <div>
                  <div className="text-[9px] uppercase font-bold text-zinc-500">Seat</div>
                  <div className="text-xs font-bold text-zinc-200">{seat.seat ?? '—'}</div>
                </div>
                <div>
                  <div className="text-[9px] uppercase font-bold text-zinc-500">Gate</div>
                  <div className="text-xs font-bold text-zinc-200">{seat.gate ?? 'Main'}</div>
                </div>
              </div>
            </div>

            {/* 2. Interactive Venue Map */}
            <div className="cohear-panel overflow-hidden">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm">🗺️</span>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-white">
                    Venue Location & Street View
                  </h4>
                </div>
                <span className="text-[11px] text-zinc-400">{stub.venue || stub.city}</span>
              </div>
              <div className="h-56 w-full relative bg-zinc-900">
                <VenueMap
                  venue={stub.venue}
                  city={stub.city}
                  lat={stub.lat || coords?.lat}
                  lng={stub.lng || coords?.lng}
                  live={stub.status === 'live'}
                  viewers={stub.viewers}
                />
              </div>
            </div>

            {/* 3. Relevant Other Stamps in Passport */}
            <div className="cohear-panel p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-1.5">
                    <span>📬</span>
                    <span>Relevant Passport Stamps</span>
                  </h4>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    Visas, city entry postmarks and souvenirs linked to this journey
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                {/* City Entry Stamp */}
                {matchingEntry && (
                  <div className="rounded-xl border border-white/10 bg-black/25 p-3 flex flex-col items-center text-center justify-between">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 mb-1">
                      Entry Stamp · {matchingEntry.city}
                    </div>
                    <div className="py-1">
                      <RubberStamp
                        id={matchingEntry.id}
                        city={matchingEntry.city}
                        date={formatStampDate(matchingEntry.date || matchingEntry.issuedAt)}
                        ink={regionInk(matchingEntry.country, matchingEntry.city)}
                        style={{ '--rot': '-2deg', maxWidth: 140 }}
                        title={`${matchingEntry.city} entry stamp`}
                      />
                    </div>
                    <div className="text-[10px] text-zinc-500 font-mono mt-1">
                      Stamped {formatStampDate(matchingEntry.date)}
                    </div>
                  </div>
                )}

                {/* City/Region Souvenir Stamp */}
                {matchingEntry && (
                  <div className="rounded-xl border border-white/10 bg-black/25 p-3 flex flex-col items-center text-center justify-between">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 mb-1">
                      Souvenir Stamp · {matchingEntry.city}
                    </div>
                    <div className="py-1 flex items-center justify-center">
                      <SouvenirStamp
                        entry={matchingEntry}
                        art={souvenirArt}
                        showArt={showSouvenirArt}
                        onToggleArt={() => onToggleArt?.(souvenirId)}
                        onGenerate={() => onGenerate?.({ ...matchingEntry, id: souvenirId, type: 'souvenir' })}
                        generating={generating}
                      />
                    </div>
                    <div className="text-[10px] text-zinc-500 font-mono mt-1">
                      City Souvenir Edition
                    </div>
                  </div>
                )}

                {/* Country Visa */}
                {matchingVisa && (
                  <div className="sm:col-span-2 rounded-xl border border-white/10 bg-black/25 p-3 flex flex-col items-center text-center">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-amber-400 mb-2">
                      Country Visa · {matchingVisa.country}
                    </div>
                    <div className="w-full max-w-sm py-1">
                      <VisaStamp
                        visa={matchingVisa}
                        entryCount={1}
                        art={art[matchingVisa.id]}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Other Concerts from this Artist / in this City */}
              {(otherArtistStubs.length > 0 || otherCityStubs.length > 0) && (
                <div className="pt-2 border-t border-white/10 space-y-1.5">
                  <div className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">
                    Other Passport Records
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-xs">
                    {otherArtistStubs.map((s) => (
                      <span key={s.id} className="rounded-md bg-white/5 border border-white/10 px-2 py-1 text-zinc-300 text-[11px]">
                        🎵 {s.artist} @ {s.city} ({s.date || 'TBA'})
                      </span>
                    ))}
                    {otherCityStubs.map((s) => (
                      <span key={s.id} className="rounded-md bg-white/5 border border-white/10 px-2 py-1 text-zinc-300 text-[11px]">
                        📍 {s.city} · {s.artist}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 4. Action Buttons Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2">
              <div className="flex flex-wrap gap-2">
                {onSyncLive && (
                  <button
                    type="button"
                    className="cohear-primary px-4 py-2 text-xs font-bold"
                    onClick={() => {
                      onSyncLive(stub);
                      onClose();
                    }}
                  >
                    ▶ Join Live Room
                  </button>
                )}

                {onOpenCity && stub.city && (
                  <button
                    type="button"
                    className="cohear-secondary px-3.5 py-2 text-xs font-semibold"
                    onClick={() => {
                      onOpenCity(stub.city, stub.country);
                      onClose();
                    }}
                  >
                    🏙️ Explore {stub.city}
                  </button>
                )}
              </div>

              <button
                type="button"
                className="cohear-secondary text-xs text-red-400 hover:text-red-300 px-3 py-2"
                onClick={() => {
                  optOutConcert(stub);
                  onClose();
                }}
                title="Remove this concert and stub from passport"
              >
                ✕ Delete Record
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function formatFullConcertDate(dateStr) {
  if (!dateStr) return 'Date TBA';
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

function formatConcertTime(stub) {
  if (stub.time) return stub.time;
  if (stub.startDate) {
    try {
      const d = new Date(stub.startDate);
      if (!isNaN(d.getTime())) {
        return d.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          timeZoneName: 'short',
        });
      }
    } catch {}
  }
  return '';
}
