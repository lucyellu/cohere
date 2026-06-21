import { useEffect, useRef, useState } from 'react';
import { useChat } from './chatChannel.js';
import { useVoice } from './voiceChannel.js';
import { guestId } from './liveApi.js';

// Combined chat + voice panel for a live room.
export default function ChatPanel({ eventId }) {
  const { messages, send, supported: chatSupported } = useChat(eventId);
  const voice = useVoice(eventId);
  const [draft, setDraft] = useState('');
  const listRef = useRef(null);
  const myUid = guestId();

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

  return (
    <div className="cohear-chat">
      {/* Voice bar */}
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
            {voice.peers.length > 0 && (
              <span className="cohear-chat__voice-peers">
                {voice.peers.map((p) => p.name).join(', ')}
              </span>
            )}
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

      {/* Message list */}
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

      {/* Input */}
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
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
