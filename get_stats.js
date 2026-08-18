import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const filePath = path.join(__dirname, 'assets/cohere/cohere_old/cohear-passport-lucy.json');

try {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  
  const cities = new Set();
  const countries = new Set();
  const venues = new Set();
  const artists = new Set();
  
  // Parse history
  if (data.history) {
    data.history.forEach(item => {
      if (item.city) cities.add(item.city);
      if (item.country) countries.add(item.country);
      if (item.venue) venues.add(item.venue);
      if (item.artist) artists.add(item.artist);
    });
  }
  
  console.log("=== CITIES ===");
  console.log(Array.from(cities).sort().join('\n'));
  
  console.log("\n=== COUNTRIES ===");
  console.log(Array.from(countries).sort().join('\n'));
  
  console.log("\n=== VENUES ===");
  console.log(Array.from(venues).sort().join('\n'));
  
  console.log("\n=== ARTISTS ===");
  console.log(Array.from(artists).sort().join('\n'));
  
} catch(e) {
  console.error("Error reading passport json:", e);
}
