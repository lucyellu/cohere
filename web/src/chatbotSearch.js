// Intelligent concert search service for chatbot
// Combines JamBase database search with Google Custom Search fallback

import { fetchConcerts } from './concerts.js';
import { readApiKey } from './settings.js';

/**
 * Search concerts using natural language query
 * First searches local JamBase cache, then falls back to Google Custom Search
 */
export async function searchConcerts(query, options = {}) {
  const {
    location = null,
    timeFrame = 'week',
    artistFilter = null,
    limit = 10
  } = options;

  // Parse the query to extract search parameters
  const parsedQuery = parseSearchQuery(query);

  // Search parameters
  const searchArtist = parsedQuery.artist || artistFilter;
  const searchLocation = parsedQuery.location || location;
  const searchTimeFrame = parsedQuery.timeFrame || timeFrame;

  try {
    // First, try searching the local JamBase cache
    const localResults = await searchLocalCache(searchArtist, searchLocation, searchTimeFrame, limit);

    if (localResults.length > 0) {
      return {
        results: localResults,
        source: 'JamBase',
        fallback: false,
        total: localResults.length
      };
    }

    // If no local results, try Google Custom Search as fallback
    if (readApiKey('googleCse')) {
      const webResults = await searchGoogleCustomSearch(query, limit);
      return {
        results: webResults,
        source: 'Google Custom Search',
        fallback: true,
        total: webResults.length
      };
    }

    // No results and no Google CSE key
    return {
      results: [],
      source: 'none',
      fallback: false,
      total: 0
    };

  } catch (error) {
    console.error('Concert search error:', error);
    return {
      results: [],
      source: 'error',
      fallback: false,
      total: 0,
      error: error.message
    };
  }
}

/**
 * Parse natural language query to extract structured search parameters
 */
function parseSearchQuery(query) {
  const lowerQuery = query.toLowerCase();

  // Extract location mentions
  const locations = [
    'toronto', 'vancouver', 'montreal', 'calgary', 'edmonton', 'ottawa',
    'new york', 'los angeles', 'chicago', 'houston', 'phoenix', 'san diego',
    'london', 'paris', 'berlin', 'amsterdam', 'tokyo', 'sydney',
    'canada', 'us', 'usa', 'uk', 'united states', 'united kingdom'
  ];

  const detectedLocation = locations.find(loc => lowerQuery.includes(loc));

  // Extract timeframe mentions
  const timeFrames = {
    'tonight': 'tonight',
    'today': 'tonight',
    'tomorrow': 'tomorrow',
    'this week': 'week',
    'weekend': 'week',
    'this weekend': 'week',
    'next week': 'week',
    'this month': 'upcoming',
    'upcoming': 'upcoming'
  };

  let detectedTimeFrame = 'week';
  for (const [phrase, frame] of Object.entries(timeFrames)) {
    if (lowerQuery.includes(phrase)) {
      detectedTimeFrame = frame;
      break;
    }
  }

  // Extract artist names (capitalized words that might be artists)
  const potentialArtists = query.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g) || [];

  // Filter out common non-artist words
  const nonArtistWords = ['Tonight', 'Today', 'Tomorrow', 'This', 'Week', 'Shows', 'Concerts', 'What', 'Where', 'When', 'How', 'Much', 'Many', 'Biggest', 'Best', 'Top', 'Canadian', 'American', 'British'];
  const detectedArtists = potentialArtists.filter(artist =>
    !nonArtistWords.includes(artist) && !locations.some(loc => artist.toLowerCase().includes(loc))
  );

  return {
    location: detectedLocation || null,
    timeFrame: detectedTimeFrame,
    artist: detectedArtists.length > 0 ? detectedArtists[0] : null,
    rawQuery: query
  };
}

/**
 * Search local JamBase cache in Supabase
 */
async function searchLocalCache(artist, location, timeFrame, limit) {
  try {
    // Fetch concerts from local cache
    const { concerts, sources } = await fetchConcerts(artist || '', 'live', timeFrame, { force: false });

    if (!concerts || concerts.length === 0) {
      return [];
    }

    // Filter by location if specified
    let filtered = concerts;
    if (location) {
      const locationLower = location.toLowerCase();
      filtered = concerts.filter(concert =>
        concert.city?.toLowerCase().includes(locationLower) ||
        concert.region?.toLowerCase().includes(locationLower) ||
        concert.country?.toLowerCase().includes(locationLower)
      );
    }

    // Sort by capacity (biggest first) and limit results
    const sorted = filtered
      .sort((a, b) => (b.capacity || 0) - (a.capacity || 0))
      .slice(0, limit);

    return sorted.map(concert => ({
      artist: concert.artist,
      venue: concert.venue,
      city: concert.city,
      region: concert.region,
      country: concert.country,
      date: concert.date,
      capacity: concert.capacity,
      startDate: concert.startDate,
      timeZone: concert.timeZone,
      source: 'JamBase'
    }));

  } catch (error) {
    console.error('Local cache search error:', error);
    return [];
  }
}

/**
 * Search Google Custom Search API as fallback
 */
async function searchGoogleCustomSearch(query, limit) {
  try {
    const apiKey = readApiKey('googleCse');
    const searchEngineId = readSettings()?.searchEngineIds?.googleCse || '';

    if (!apiKey || !searchEngineId) {
      console.warn('Google Custom Search not configured');
      return [];
    }

    // Build search query focused on concerts
    const searchQuery = `${query} concerts tickets`;
    const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${searchEngineId}&q=${encodeURIComponent(searchQuery)}&num=${limit}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Google CSE API error: ${response.status}`);
    }

    const data = await response.json();

    if (!data.items || data.items.length === 0) {
      return [];
    }

    // Parse Google results into concert format
    return data.items.map(item => ({
      artist: extractArtistFromTitle(item.title),
      venue: extractVenueFromTitle(item.title),
      city: null,
      region: null,
      country: null,
      date: null, // Would need more sophisticated parsing
      capacity: null,
      startDate: null,
      timeZone: null,
      source: 'Google Custom Search',
      url: item.link,
      snippet: item.snippet
    }));

  } catch (error) {
    console.error('Google Custom Search error:', error);
    return [];
  }
}

/**
 * Extract artist name from Google search result title
 */
function extractArtistFromTitle(title) {
  // Common patterns: "Artist at Venue", "Artist - Venue", "Artist: Venue"
  const patterns = [
    /^(.+?)\s+(?:at|@|-|:)\s+/i,
    /^(.+?)\s+(?:concert|show|live|tickets)/i
  ];

  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match) return match[1].trim();
  }

  return title.split(/\s+(?:at|@|-|:)\s+/)[0]?.trim() || title;
}

/**
 * Extract venue name from Google search result title
 */
function extractVenueFromTitle(title) {
  // Common patterns: "Artist at Venue", "Artist - Venue", "Artist: Venue"
  const patterns = [
    /(?:at|@|-|:)\s+(.+?)\s+(?:concert|show|live|tickets)?$/i,
    /(?:at|@|-|:)\s+(.+)$/i
  ];

  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match) return match[1].trim();
  }

  return null;
}

/**
 * Get AI-friendly summary of search results
 */
export function formatResultsForAI(results, query) {
  if (!results || results.length === 0) {
    return `No concerts found matching "${query}". Try specifying a city, artist name, or timeframe like "tonight" or "this weekend".`;
  }

  const summary = [];
  summary.push(`Found ${results.length} concert${results.length > 1 ? 's' : ''} matching "${query}":\n`);

  results.forEach((concert, index) => {
    const location = [concert.city, concert.region, concert.country].filter(Boolean).join(', ');
    const date = concert.date || 'Date TBD';

    if (concert.source === 'JamBase') {
      summary.push(`${index + 1}. ${concert.artist} at ${concert.venue} in ${location} on ${date} (${concert.capacity ? Math.round(concert.capacity).toLocaleString() + ' capacity' : 'capacity TBD'})`);
    } else {
      summary.push(`${index + 1}. ${concert.artist} (search result)${location ? ' in ' + location : ''}${concert.url ? ' - ' + concert.url : ''}`);
    }
  });

  if (results.some(r => r.source !== 'JamBase')) {
    summary.push('\nNote: Some results are from web search. Click links for more details.');
  }

  return summary.join('\n');
}

/**
 * Format concert data for natural language responses
 */
export function formatConcertNatural(concert, userTimeZone = 'America/Toronto') {
  if (!concert) return '';

  const location = [concert.city, concert.region, concert.country].filter(Boolean).join(', ');
  const date = concert.date || 'Date TBD';
  const time = concert.startDate ? new Date(concert.startDate).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: concert.timeZone || userTimeZone
  }) : 'Time TBD';

  return `${concert.artist} at ${concert.venue} in ${location} on ${date} at ${time}${concert.capacity ? ` (${Math.round(concert.capacity).toLocaleString()} capacity)` : ''}`;
}

function readSettings() {
  try {
    return JSON.parse(localStorage.getItem('cohear_settings_v1') || '{}');
  } catch {
    return {};
  }
}

export const SEARCH_EXAMPLES = [
  "What concerts are happening tonight in Toronto?",
  "Show me the biggest concerts this weekend",
  "Canadian artists performing this week",
  "Concerts in Vancouver tomorrow",
  "What's happening in Montreal this weekend?",
  "Biggest shows in New York tonight",
  "Drake concerts upcoming",
  "Taylor Swift shows this month"
];