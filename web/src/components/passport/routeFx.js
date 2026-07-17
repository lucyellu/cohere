// Map plumbing shared by the journey map and the tour map: the dashed route
// polyline (click it to set the dashes marching along the route), and
// city-level pin stacking so five nights in Toronto read as one badged pin
// instead of an unreadable smear of overlapping markers.

const DASH_REPEAT = 12; // px between dashes — the animation cycles over this

export function makeRouteLine(maps, map, points, { geodesic = true, visible = true } = {}) {
  const dash = { path: 'M 0,-1 0,1', strokeOpacity: 1, strokeColor: '#5b4a2a', scale: 2 };
  const line = new maps.Polyline({
    path: points.map((p) => ({ lat: Number(p.lat), lng: Number(p.lng) })),
    geodesic,
    strokeOpacity: 0,
    icons: [{ icon: dash, offset: '0px', repeat: `${DASH_REPEAT}px` }],
    map: visible ? map : null,
  });
  line.addListener('click', () => toggleRouteAnimation(line));
  return line;
}

function toggleRouteAnimation(line) {
  if (line.__anim) {
    clearInterval(line.__anim);
    line.__anim = null;
    return;
  }
  let t = 0;
  line.__anim = setInterval(() => {
    t = (t + 0.75) % DASH_REPEAT;
    const icons = line.get('icons');
    if (!icons?.length) return;
    icons[0].offset = `${t}px`;
    line.set('icons', icons);
  }, 50);
}

export function disposeRouteLine(line) {
  if (!line) return;
  if (line.__anim) {
    clearInterval(line.__anim);
    line.__anim = null;
  }
  line.setMap(null);
}

// Group route points into one pin per city (the home bookends collapse into a
// single home pin too). Visits keep route order; the most recent visit's exact
// coords position the pin, so the "top of the stack" is the latest one.
export function groupStops(points) {
  const groups = new Map();
  for (const p of points) {
    const key = p.home ? '⌂home' : cityKey(p.city) || `${Number(p.lat).toFixed(3)},${Number(p.lng).toFixed(3)}`;
    let g = groups.get(key);
    if (!g) {
      g = { key, city: p.city, home: Boolean(p.home), lat: 0, lng: 0, visits: [] };
      groups.set(key, g);
    }
    if (!p.home) g.visits.push(p);
    g.lat = Number(p.lat);
    g.lng = Number(p.lng);
  }
  return [...groups.values()];
}

function cityKey(city) {
  return String(city || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// InfoWindow body for a pin: every visit at that city, most recent first.
export function visitsHtml(group) {
  const count = group.visits.length;
  const rows = [...group.visits]
    .reverse()
    .map((v) => {
      const bits = [v.date, v.artist || v.venue].filter(Boolean).map(esc).join(' · ');
      return `<div style="padding:2px 0">${v.n != null ? `<b>#${esc(v.n)}</b> ` : ''}${bits || esc(group.city)}</div>`;
    })
    .join('');
  return (
    `<div style="font:12px/1.45 ui-monospace,Menlo,monospace;color:#2b2115;max-width:230px">` +
    `<div style="font-weight:800;letter-spacing:.06em;text-transform:uppercase;margin-bottom:2px">${esc(group.city)}${count > 1 ? ` · ${count} visits` : ''}</div>` +
    rows +
    `</div>`
  );
}

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
