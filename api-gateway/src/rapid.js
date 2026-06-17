// RapidAPI social search — TikTok / Instagram / X fan footage of the event.
//
// YouTube has a free search API (see routes.js); these three don't, so we use
// the user's RapidAPI subscriptions. Each adapter returns the SAME normalized
// shape so the live feed can merge + embed them with a source badge:
//   { source, url, title, author, views, ts }
// The canonical `url` is what the browser embeds (TikTok player / IG /embed /
// X tweet-frame), so all embed logic stays on the client.
//
// Providers (per the user's RapidAPI app):
//   • TikTok    tiktok-api23  — GET /api/search/video?keyword=  (real search) ✅
//   • X/Twitter twitter241    — GET /search?type=Latest&query=  (real search) ✅
//   • Instagram instagram120  — POST /api/instagram/posts {username}
//       (no hashtag/search endpoint on this provider, so we pull a handle's
//        recent posts — e.g. the artist's official account)

const HOSTS = {
  tiktok: 'tiktok-api23.p.rapidapi.com',
  instagram: 'instagram120.p.rapidapi.com',
  x: 'twitter241.p.rapidapi.com',
};

const key = () => process.env.RAPIDAPI_KEY || '';
export const hasRapid = () => Boolean(key().trim());

async function call(host, path, { method = 'GET', body } = {}) {
  const headers = { 'x-rapidapi-host': host, 'x-rapidapi-key': key() };
  if (body) headers['Content-Type'] = 'application/json';
  const r = await fetch(`https://${host}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    /* non-JSON */
  }
  return { ok: r.ok, status: r.status, data };
}

// ---- TikTok: keyword video search --------------------------------------
export async function searchTikTok(q, limit = 12) {
  const { ok, data } = await call(HOSTS.tiktok, `/api/search/video?keyword=${encodeURIComponent(q)}&cursor=0&search_id=0`);
  if (!ok || !data?.item_list) return [];
  return data.item_list
    .filter((it) => it?.id && it?.author?.uniqueId)
    .slice(0, limit)
    .map((it) => ({
      source: 'tiktok',
      url: `https://www.tiktok.com/@${it.author.uniqueId}/video/${it.id}`,
      title: (it.desc || '').slice(0, 140),
      author: it.author.uniqueId,
      views: Number(it.stats?.playCount) || null,
      ts: it.createTime ? it.createTime * 1000 : 0,
    }));
}

// ---- X / Twitter: latest search ----------------------------------------
export async function searchX(q, limit = 12) {
  const { ok, data } = await call(HOSTS.x, `/search?type=Latest&count=20&query=${encodeURIComponent(q)}`);
  if (!ok) return [];
  const out = [];
  const insts = data?.result?.timeline?.instructions || [];
  for (const ins of insts) {
    for (const e of ins.entries || []) {
      const r = e?.content?.itemContent?.tweet_results?.result;
      const tweet = r?.tweet || r; // unwrap TweetWithVisibilityResults
      const legacy = tweet?.legacy;
      const id = tweet?.rest_id || legacy?.id_str;
      const user =
        tweet?.core?.user_results?.result?.legacy?.screen_name ||
        tweet?.core?.user_results?.result?.core?.screen_name;
      if (!legacy || !id || !user) continue;
      const media = legacy.extended_entities?.media || legacy.entities?.media || [];
      out.push({
        source: 'x',
        url: `https://x.com/${user}/status/${id}`,
        title: (legacy.full_text || '').replace(/https:\/\/t\.co\/\w+/g, '').slice(0, 140),
        author: user,
        views: Number(tweet.views?.count) || null,
        ts: legacy.created_at ? Date.parse(legacy.created_at) : 0,
        _media: media.length > 0,
      });
    }
  }
  // Tweets with photo/video first (they embed richer), then by recency.
  out.sort((a, b) => (b._media ? 1 : 0) - (a._media ? 1 : 0));
  return out.slice(0, limit).map(({ _media, ...x }) => x);
}

// ---- Instagram: a handle's recent posts --------------------------------
export async function searchInstagram(username, limit = 12) {
  if (!username) return [];
  const { ok, data } = await call(HOSTS.instagram, '/api/instagram/posts', {
    method: 'POST',
    body: { username, maxId: '' },
  });
  const edges = data?.result?.edges;
  if (!ok || !Array.isArray(edges)) return [];
  return edges
    .map((e) => e.node)
    .filter((n) => n?.code)
    .slice(0, limit)
    .map((n) => ({
      source: 'instagram',
      url: `https://www.instagram.com/p/${n.code}/`,
      title: (n.caption?.text || '').slice(0, 140),
      author: n.user?.username || username,
      views: Number(n.play_count || n.view_count) || null,
      ts: n.taken_at ? n.taken_at * 1000 : 0,
    }));
}

// ---- Unified entry point ------------------------------------------------
export async function searchSocial(platform, { q, username } = {}) {
  if (!hasRapid()) return { ok: false, error: 'no RapidAPI key', items: [] };
  try {
    let items = [];
    if (platform === 'tiktok') items = await searchTikTok(q);
    else if (platform === 'x') items = await searchX(q);
    else if (platform === 'instagram') items = await searchInstagram(username || igHandle(q));
    else return { ok: false, error: `unknown platform: ${platform}`, items: [] };
    return { ok: true, items };
  } catch (e) {
    return { ok: false, error: e.message, items: [] };
  }
}

// Best-guess IG handle from an artist name ("Post Malone" -> "postmalone").
export function igHandle(artist) {
  return String(artist || '').toLowerCase().replace(/[^a-z0-9._]/g, '');
}
