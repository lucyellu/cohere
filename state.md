# DeepSeek Chatbot Implementation State

**Current Status**: 80% Complete - Ready for testing and refinement

## What We're Building
A DeepSeek-powered AI chatbot for the Cohere concert app that allows users to search for concerts using natural language queries like "biggest concerts tonight for Canadian artists."

## Implementation Summary

### ✅ Completed Tasks
1. **Branch Created**: `deepseek-chatbot` branch
2. **Core Components Built**:
   - `ChatbotWidget.jsx` - Floating chat interface with multi-step conversation support
   - `chatbotSearch.js` - Intelligent search engine combining JamBase + Google CSE fallback
3. **API Integration**: 
   - DeepSeek API client with proper authentication
   - Updated Jambase API key: `jbd_trial_Kcj2SiBNdrO2_ZBvANaJOW1Di9GL7Y4Sad5NiMjZ3mZGT`
   - Google Custom Search fallback integration
4. **Settings Updated**: Added DeepSeek API key field to settings drawer
5. **App Integration**: Chatbot widget added to main App.jsx

### 🔨 Files Modified
- `web/src/components/ChatbotWidget.jsx` (NEW)
- `web/src/chatbotSearch.js` (NEW) 
- `web/src/App.jsx` (import added + widget mounted)
- `web/src/settings.js` (deepseek key added to DEFAULT_SETTINGS)
- `web/src/components/SettingsDrawer.jsx` (DeepSeek API key field added)
- `api-gateway/src/cron-jambase.js` (updated Jambase API key)

### 🎯 Key Features Implemented
- **Natural Language Processing**: Parses queries to extract artists, locations, timeframes
- **Smart Search**: Searches JamBase cache first, falls back to Google Custom Search
- **Context Memory**: Remembers location, timeframe, favorite artists across conversations
- **Multi-step Conversations**: Maintains conversation context for follow-up questions
- **Floating Widget**: Accessible chat button in bottom-right corner
- **Fallback Responses**: Works even without DeepSeek API key

### ⚠️ Known Issues/Todo
- ChatbotWidget.jsx line 337-362: Fallback response function needs updating with better examples
- Testing required for JamBase search functionality
- User needs to provide their own DeepSeek API key

## Next Steps

### 1. Add Your DeepSeek API Key
Users need to add their DeepSeek API key in Settings:
- Open the app
- Click Settings (gear icon)
- Go to "API keys" tab
- Add your DeepSeek API key

### 2. Test the Chatbot
- Click the floating chat button (bottom-right)
- Try queries like:
  - "What concerts are happening tonight in Toronto?"
  - "Show me the biggest concerts this weekend"
  - "Canadian artists performing this week"

### 3. Optional Enhancements
- Add more sophisticated error handling
- Implement streaming responses from DeepSeek API
- Add concert recommendations based on user preferences
- Integrate with existing passport/attendance data

## Technical Notes

### Search Flow
1. User enters natural language query
2. Chatbot parses query (extracts location, timeframe, artists)
3. Searches local JamBase cache in Supabase
4. If no results, falls back to Google Custom Search API
5. Formats results for AI consumption
6. DeepSeek generates natural language response
7. Updates conversation context for follow-up questions

### Data Sources
- **Primary**: JamBase API → Supabase cache (15 pages × 100 = 1,500 concerts)
- **Fallback**: Google Custom Search API (if configured)
- **Context**: User preferences, location, previous queries

### Conversation Memory
- Location preferences
- Timeframe mentions
- Favorite artists
- Last 5 queries for context

---

**User provided DeepSeek API key**: (To be added in Settings)
**Jambase API key updated**: ✅ `jbd_trial_Kcj2SiBNdrO2_ZBvANaJOW1Di9GL7Y4Sad5NiMjZ3mZGT`
**Branch**: `deepseek-chatbot`

**Status**: Ready for user testing with their DeepSeek API key.
