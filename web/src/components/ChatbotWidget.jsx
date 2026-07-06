import { useState, useRef, useEffect } from 'react';
import { fetchConcerts } from '../concerts.js';
import { searchConcerts, formatResultsForAI, formatConcertNatural, SEARCH_EXAMPLES } from '../chatbotSearch.js';

const CHAT_STORAGE_KEY = 'cohear_chat_history_v1';
const SESSION_STORAGE_KEY = 'cohear_chat_session_v1';

// DeepSeek API configuration
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

export default function ChatbotWidget({ settings }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationContext, setConversationContext] = useState({});
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Load chat history on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(CHAT_STORAGE_KEY);
      const session = sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (saved) {
        setMessages(JSON.parse(saved));
      }
      if (session) {
        setConversationContext(JSON.parse(session));
      }
    } catch (e) {
      console.warn('Failed to load chat history:', e);
    }
  }, []);

  // Save chat history
  useEffect(() => {
    try {
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(conversationContext));
    } catch (e) {
      console.warn('Failed to save chat history:', e);
    }
  }, [messages, conversationContext]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const deepSeekApiKey = settings?.apiKeys?.deepseek || '';

  async function handleSendMessage() {
    const userMessage = input.trim();
    if (!userMessage || isLoading) return;

    const newMessages = [...messages, { role: 'user', content: userMessage }];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      // First, try to fetch recent concerts for context
      let concertContext = '';
      try {
        const concerts = await fetchConcerts('', 'live', 'week');
        if (concerts?.concerts?.length > 0) {
          concertContext = `\nRecent concerts:\n${concerts.concerts.slice(0, 10).map(c =>
            `- ${c.artist} at ${c.venue} in ${c.city} on ${c.date}`
          ).join('\n')}`;
        }
      } catch (e) {
        console.warn('Failed to fetch concert context:', e);
      }

      // Perform intelligent concert search
      let searchResults = null;
      let searchContext = '';
      try {
        searchResults = await searchConcerts(userMessage, {
          location: conversationContext.location,
          timeFrame: conversationContext.timeframe,
          artistFilter: conversationContext.artists?.[0],
          limit: 10
        });

        if (searchResults && searchResults.total > 0) {
          searchContext = `\n\nConcert search results (${searchResults.source}):\n${formatResultsForAI(searchResults.results, userMessage)}`;
        } else if (searchResults && searchResults.total === 0) {
          searchContext = `\n\nNo concerts found matching "${userMessage}". Try different search terms or check back later.`;
        }
      } catch (e) {
        console.warn('Concert search failed:', e);
      }

      // Build conversation context with search results
      const contextMessages = [
        {
          role: 'system',
          content: `You are a helpful concert assistant for Cohere, a live concert discovery app. Your knowledge base includes:
- Real-time concert data from Jambase (upcoming shows)
- Historical concert data from setlist.fm (past shows)
- The user's search history and preferences
- Google Custom Search fallback for broader coverage

Current conversation context:
- Location: ${conversationContext.location || 'not specified'}
- Timeframe: ${conversationContext.timeframe || 'not specified'}
- Favorite artists: ${conversationContext.artists?.join(', ') || 'none specified'}
- Previous queries: ${conversationContext.previousQueries?.slice(-3).join(', ') || 'none'}
${concertContext}
${searchContext}

When users ask about concerts:
1. Use the search results above to provide specific, actionable information (artist, venue, date, location)
2. If search results are provided, always include the specific details from the search
3. Suggest alternatives if exact matches aren't found
4. Remember user preferences for follow-up questions
5. Be conversational and helpful but concise

Example responses:
- "Tonight in Toronto: Drake at Scotiabank Arena (7:30 PM), The Weeknd at Budweiser Stage (8 PM)"
- "This weekend for Canadian artists: Shawn Mendes in Montreal, Justin Bieber in Vancouver"
- "Found 3 concerts matching your query: [list them]"

Keep responses concise (2-3 sentences max) and always include specific concert details when available. If no search results are shown, suggest trying different search terms.`
        },
        ...newMessages.map(m => ({ role: m.role, content: m.content }))
      ];

      if (!deepSeekApiKey) {
        // Fallback to rule-based responses if no API key
        const fallbackResponse = generateFallbackResponse(userMessage, conversationContext);
        setMessages([...newMessages, { role: 'assistant', content: fallbackResponse }]);
        return;
      }

      const response = await fetch(DEEPSEEK_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${deepSeekApiKey}`
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: contextMessages,
          temperature: 0.7,
          max_tokens: 500,
          stream: false
        })
      });

      if (!response.ok) {
        throw new Error(`DeepSeek API error: ${response.status}`);
      }

      const data = await response.json();
      const assistantMessage = data.choices?.[0]?.message?.content || generateFallbackResponse(userMessage, conversationContext);

      // Update conversation context based on the query
      const updatedContext = analyzeQueryContext(userMessage, conversationContext);
      setConversationContext(updatedContext);

      setMessages([...newMessages, { role: 'assistant', content: assistantMessage }]);

    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage = 'Sorry, I had trouble processing that. Try asking about specific artists, venues, or cities!';
      setMessages([...newMessages, { role: 'assistant', content: errorMessage }]);
    } finally {
      setIsLoading(false);
    }
  }

  function handleKeyPress(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  }

  function clearChat() {
    setMessages([]);
    setConversationContext({});
    try {
      localStorage.removeItem(CHAT_STORAGE_KEY);
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    } catch (e) {
      console.warn('Failed to clear chat storage:', e);
    }
  }

  return (
    <>
      {/* Floating Chat Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent)] text-white shadow-lg transition-transform hover:scale-110 hover:shadow-xl"
          title="Ask about concerts"
        >
          <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </button>
      )}

      {/* Chat Panel */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 z-50 flex w-[calc(100vw-2rem)] flex-col rounded-lg border border-white/10 bg-black/95 shadow-2xl md:w-96 max-h-[600px]">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent)]">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Concert Search</h3>
                <p className="text-xs text-zinc-400">Powered by DeepSeek</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={clearChat}
                className="rounded p-1.5 text-zinc-400 hover:text-white transition-colors"
                title="Clear conversation"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                </svg>
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="rounded p-1.5 text-zinc-400 hover:text-white transition-colors"
                title="Close chat"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[300px] max-h-[400px]">
            {messages.length === 0 && (
              <div className="text-center py-8">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent)]/20">
                  <svg viewBox="0 0 24 24" className="h-6 w-6 text-[var(--accent)]" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <h4 className="text-sm font-semibold text-white mb-1">Ask about concerts</h4>
                <p className="text-xs text-zinc-400">{`Try "${SEARCH_EXAMPLES[Math.floor(Math.random() * SEARCH_EXAMPLES.length)]}"`}</p>
              </div>
            )}

            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                    message.role === 'user'
                      ? 'bg-[var(--accent)] text-white'
                      : 'bg-white/10 text-zinc-200'
                  }`}
                >
                  {message.content}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start">
                <div className="rounded-lg bg-white/10 px-3 py-2 text-sm text-zinc-400">
                  <div className="flex items-center gap-1">
                    <div className="h-2 w-2 animate-bounce rounded-full bg-zinc-400" />
                    <div className="h-2 w-2 animate-bounce rounded-full bg-zinc-400 [animation-delay:-0.1s]" />
                    <div className="h-2 w-2 animate-bounce rounded-full bg-zinc-400 [animation-delay:-0.2s]" />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-white/10 p-3">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask about concerts..."
                className="flex-1 rounded-md border border-white/20 bg-white/5 px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-[var(--accent)] transition-colors"
                disabled={isLoading}
              />
              <button
                onClick={handleSendMessage}
                disabled={isLoading || !input.trim()}
                className="rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white opacity-90 hover:opacity-100 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
              >
                {isLoading ? (
                  <svg viewBox="0 0 24 24" className="h-4 w-4 animate-spin" fill="none" stroke="currentColor">
                    <circle cx="12" cy="12" r="10" strokeWidth="4" className="opacity-25" />
                    <path className="opacity-75" strokeWidth="2" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Fallback response generator when DeepSeek API is unavailable
function generateFallbackResponse(query, context) {
  const lowerQuery = query.toLowerCase();

  // Extract potential artists, venues, cities from query
  const words = lowerQuery.split(/\s+/);
  const timeFrames = ['tonight', 'today', 'tomorrow', 'week', 'weekend', 'month'];
  const detectedTimeFrame = timeFrames.find(tf => lowerQuery.includes(tf));

  // Check for location keywords
  const locations = ['toronto', 'vancouver', 'montreal', 'new york', 'los angeles', 'london', 'chicago'];
  const detectedLocation = locations.find(loc => lowerQuery.includes(loc));

  if (detectedLocation && detectedTimeFrame) {
    return `I found concerts in ${detectedLocation} ${detectedTimeFrame}! For specific results, try searching for artists or venues. I can provide more detailed information when connected to DeepSeek API.`;
  }

  if (detectedLocation) {
    return `I can search for concerts in ${detectedLocation}. Add your DeepSeek API key in settings for intelligent concert recommendations!`;
  }

  if (detectedTimeFrame) {
    return `I can help you find concerts ${detectedTimeFrame}. Add your location or preferred artists for better results!`;
  }

  return `I can help you find concerts! Try asking about "concerts tonight in Toronto" or "weekend shows for Canadian artists". Add your DeepSeek API key in Settings for full functionality.`;
}

// Analyze query and update conversation context
function analyzeQueryContext(query, existingContext) {
  const lowerQuery = query.toLowerCase();
  const updated = { ...existingContext };

  // Detect location mentions
  const locations = ['toronto', 'vancouver', 'montreal', 'new york', 'los angeles', 'london', 'chicago', 'canada', 'us', 'uk'];
  for (const loc of locations) {
    if (lowerQuery.includes(loc)) {
      updated.location = loc;
      break;
    }
  }

  // Detect timeframe mentions
  const timeFrames = ['tonight', 'today', 'tomorrow', 'this week', 'weekend', 'this month'];
  for (const tf of timeFrames) {
    if (lowerQuery.includes(tf)) {
      updated.timeframe = tf;
      break;
    }
  }

  // Detect artist names (capitalized words in query)
  const potentialArtists = query.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g) || [];
  if (potentialArtists.length > 0) {
    updated.artists = [...(updated.artists || []), ...potentialArtists].filter((v, i, a) => a.indexOf(v) === i);
  }

  // Track previous queries
  updated.previousQueries = [...(updated.previousQueries || []), query].slice(-5);

  return updated;
}