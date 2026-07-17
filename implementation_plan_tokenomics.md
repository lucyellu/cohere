# Tokenomics & Collectibles System Plan

This plan outlines the rules and logic for issuing tickets, generating art, and tracking live engagement to make the Cohere passport feel like a realistic, scarce digital collectible system.

## 1. Ticket Stubs: Venue Capacity & Seating

### Hard Caps & The "Live" Requirement
We enforce the JamBase `capacity` on the Supabase registry. 
*Example:* A Calvin Harris concert started 29 minutes ago and is currently **ongoing**. The venue seats 7,000. 

### Dynamic Seating by Mint #
As users enter the room and claim their stubs, they are seated based on mint order:
- **Mints 1 - 50:** VIP / Front Row
- **Mints 51 - 500:** The Pit / GA Floor
- **Mints 501 - 2,000:** Lower Bowl 
- **Mints 2001 - 7,000:** Upper Balcony / Lawn
- **Mints 7,001+:** "Tailgate" / Waitlist Stamp (Venue is at capacity)

*(Note: We are pausing complex Visa processing rules based on country of origin for now, keeping entry simple.)*

## 2. Live Engagement Point System

To earn the rarest collectibles, simply joining the room is not enough. Users must actively participate in the **live** concert. We will track engagement using a points system:

**Points Criteria for Super Collectibles:**
1. **Time in Room:** Stay in the room for at least 10 minutes.
2. **Songs Listened:** Listen to at least 3 songs.
3. **Concurrent Listening:** Bonus points for listening to a song *while* it is the current song playing on the live setlist.

**Technical Implementation for Tracking:**
- The client-side player will emit heartbeats (e.g., every 30 seconds) logging the current `roomId`, `userId`, and `songId`.
- Supabase will maintain an `engagement_logs` table.
- A Supabase Edge Function (or database trigger) will calculate the total time spent and unique songs listened to per user, per concert.

## 3. Procedural Art & Special Ticket Tiers

Users who hit the engagement thresholds (e.g., 10 mins + 3 songs) unlock the ability to claim **Super Collectibles**. These are strictly capped based on the venue's total capacity.

Using the Calvin Harris example (Capacity: 7,000):

- **Top 1% (First 70 qualifying fans): Holographic Stubs/Stamps**
  - Extremely rare. 
  - **Assets:** We will integrate the UI effects from `pokemon-cards-holo-effect-v2-simey-abywjdx.html` or `parallax-techtrades-holographic-trading-card-jhey-eavnnxa.html` found in the `assets/codepens` folder.
- **Top 10% (Next 630 qualifying fans): Metal / Animated Stubs**
  - Rare tier.
  - **Assets:** We will use effects like `moving-stamp-codepenhagen-ryan-mulligan-prjgwm.html` or foil animations.
- **Remaining Capacity (up to 6,300 fans): Standard Paper Tickets**
  - Basic procedural art based on the Pollinations prompt.

## 4. Specific Badges & Achievements

We will introduce specific achievements tied to live attendance and dedication, tracked via the engagement system:

- **"I Was There" Badge:** Awarded exclusively for attending a concert while it is currently live.
- **"Front Row Camper":** Awarded for being in the room waiting before the concert officially begins.
- **"Encore Fan":** Awarded for staying in the room until the very end of the live set.
- **"In Sync":** Awarded for listening to at least 5 songs concurrently with the live setlist.

---

> [!IMPORTANT]
> ## User Review Required
> 
> **Are you happy with:**
> 1. Removing the complex Visa processing rules for now?
> 2. The specific thresholds for the Point System (10+ mins, 3+ songs) to qualify for special tiers?
> 3. The breakdown of Holographic (Top 1%) and Metal (Top 10%) tiers using the provided Codepen assets?
> 
> Once approved, we can start modifying the `api-gateway` registry and Supabase schema to support engagement tracking!
