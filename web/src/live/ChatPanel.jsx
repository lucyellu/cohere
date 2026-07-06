import { useEffect, useRef, useState } from 'react';
import { useChat } from './chatChannel.js';
import { useVoice } from './voiceChannel.js';
import { guestId, guestName } from './liveApi.js';
import WaveformTile from './WaveformTile.jsx';
import SunoLibrary from './SunoLibrary.jsx';

const MAX_VOICE_PARTICIPANTS = 6;

// Combined chat + voice panel for a live room.
export default function ChatPanel({ eventId, voiceProp }) {
  const { messages, send, supported: chatSupported } = useChat(eventId);
  const myVoice = useVoice(eventId);
  const voice = voiceProp || myVoice;
  const [draft, setDraft] = useState('');
  const [showWaveforms, setShowWaveforms] = useState(true);
  const [showSubtitles, setShowSubtitles] = useState(true);
  const [showDJ, setShowDJ] = useState(false);
  const listRef = useRef(null);
  const myUid = guestId();
  const myName = guestName() || 'You';

  // Auto-scroll to latest message.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  function handleSend(e) {
    e.preventDefault();
    if (!draft.trim()) return;
    send(draft);
    setDraft('');
  }

  if (!chatSupported) {
    return (
      <div className="cohear-chat cohear-chat--disabled">
        <p className="cohear-chat__empty">
          Chat requires Supabase to be configured.<br />
          Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in your <code>.env</code>.
        </p>
      </div>
    );
  }

  // Build participant list for the voice grid (self first, then peers)
  const totalParticipants = voice.joined ? 1 + voice.peers.length : 0;
  const gridClass = gridLayoutClass(totalParticipants);

  return (
    <div className="cohear-chat">
      {/* ── Voice Call Grid ── */}
      {voice.joined && (
        <div className="cohear-voice-section">
          <div className={`cohear-voice-grid ${gridClass}`}>
            {/* Self tile */}
            <WaveformTile
              stream={voice.localStream}
              name={myName}
              transcript={voice.localTranscript}
              isSelf={true}
              muted={voice.muted}
              colorIdx={0}
              showWaveforms={showWaveforms}
              showSubtitles={showSubtitles}
            />
            {/* Peer tiles */}
            {voice.peers.map((peer, i) => (
              <WaveformTile
                key={peer.uid}
                stream={peer.stream}
                name={peer.name}
                transcript={peer.transcript}
                isSelf={false}
                muted={false}
                colorIdx={i + 1}
                showWaveforms={showWaveforms}
                showSubtitles={showSubtitles}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Voice controls bar ── */}
      <div className="cohear-chat__voice-bar">
        {voice.joined ? (
          <>
            <button
              className="cohear-chat__voice-btn cohear-chat__voice-btn--active"
              onClick={voice.leave}
              title="Leave voice chat"
            >
              🎙 Leave
            </button>
            <button
              className={`cohear-chat__voice-btn ${voice.muted ? 'cohear-chat__voice-btn--muted' : ''}`}
              onClick={voice.toggleMute}
              title={voice.muted ? 'Unmute' : 'Mute'}
            >
              {voice.muted ? '🔇 Muted' : '🔊 On'}
            </button>
            <span className="cohear-chat__voice-count">
              {totalParticipants}/{MAX_VOICE_PARTICIPANTS}
            </span>
            {voice.peers.length > 0 && (
              <span className="cohear-chat__voice-peers">
                {voice.peers.map((p) => p.name).join(', ')}
              </span>
            )}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
              <button
                className={`cohear-chat__voice-btn ${!showWaveforms ? 'cohear-chat__voice-btn--muted' : ''}`}
                onClick={() => setShowWaveforms((v) => !v)}
                title="Toggle visualizer"
              >
                {showWaveforms ? '〰️ Waves' : '〰️ Off'}
              </button>
              <button
                className={`cohear-chat__voice-btn ${!showSubtitles ? 'cohear-chat__voice-btn--muted' : ''}`}
                onClick={() => setShowSubtitles((v) => !v)}
                title="Toggle live subtitles"
              >
                {showSubtitles ? '💬 Subs' : '💬 Off'}
              </button>
            </div>
          </>
        ) : (
          <button
            className="cohear-chat__voice-btn"
            onClick={voice.join}
            title="Join voice chat"
          >
            🎤 Join voice
          </button>
        )}
        {voice.error && (
          <span className="cohear-chat__voice-error">{voice.error}</span>
        )}
      </div>

      {/* ── Message list ── */}
      <div className="cohear-chat__messages" ref={listRef}>
        {messages.length === 0 ? (
          <p className="cohear-chat__empty">
            No messages yet — say hello 👋
          </p>
        ) : (
          messages.map((msg) => {
            const isMe = msg.uid === myUid;
            return (
              <div
                key={msg.id}
                className={`cohear-chat__msg ${isMe ? 'cohear-chat__msg--me' : ''}`}
              >
                {!isMe && <span className="cohear-chat__author">{msg.name}</span>}
                <span className="cohear-chat__text">{msg.text}</span>
                <span className="cohear-chat__time">{fmtTime(msg.ts)}</span>
              </div>
            );
          })
        )}
      </div>

      {/* ── Input ── */}
      <form className="cohear-chat__form" onSubmit={handleSend}>
        <input
          className="cohear-chat__input"
          type="text"
          placeholder="Type a message…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={500}
        />
        <button
          type="submit"
          className="cohear-chat__send"
          disabled={!draft.trim()}
          title="Send message"
        >
          ➤
        </button>
      </form>
    </div>
  );
}

function fmtTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d)) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Returns the CSS modifier class for the voice grid based on participant count. */
function gridLayoutClass(count) {
  if (count <= 1) return 'cohear-voice-grid--1';
  if (count === 2) return 'cohear-voice-grid--2';
  if (count <= 4) return 'cohear-voice-grid--4';
  return 'cohear-voice-grid--6';
}
