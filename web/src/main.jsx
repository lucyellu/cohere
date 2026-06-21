import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './live/supabase.js'; // self-registers Realtime presence when configured
import { loadPublicConfig } from './live/maps.js';
import App from './App.jsx';

function render() {
  createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

// Pull the runtime Maps key from the gateway first (cheap, 2.5s-capped) so the
// maps know whether they can render on the very first paint; never block on it.
loadPublicConfig().finally(render);
