// "Synthesize a missing performance" pipeline.
//
// For a setlist song with no fan footage, chain:
//   1. source audio   — YouTube concert/Music track -> audio (yt-dlp)   [STUB]
//   2. suno seed gen  — feed that audio to Suno (cover/extend) -> track  [STUB: needs paid Suno API w/ audio input]
//   3. visuals        — AI images from the BYOC pool (Meta/FLUX)         [LIVE — reuses /api/scene/generate]
//   4. assemble       — slideshow video spec (ffmpeg) now; true AI video later [spec-ready / planned]
//
// Blocked stages return {status:'stub', note} instead of failing, so the whole
// flow is visible end-to-end and the UI can show real progress today.

const GW = `http://127.0.0.1:${process.env.PORT || 5001}/api`;

// --- 1. Source audio -----------------------------------------------------
async function sourceAudio({ youtubeUrl, audioUrl }) {
  if (audioUrl) {
    return { stage: 'source-audio', status: 'ok', audioUrl, note: 'caller-provided audio' };
  }
  if (youtubeUrl) {
    // Real impl: yt-dlp -x --audio-format mp3 <url>. ToS-gray + copyright; wire
    // when we add a downloader service. For now expose the intent.
    return {
      stage: 'source-audio', status: 'stub', audioUrl: null, youtubeUrl,
      note: 'yt-dlp extraction not wired yet (ToS/copyright review needed)',
    };
  }
  return { stage: 'source-audio', status: 'skip', audioUrl: null, note: 'no source given' };
}

// --- 2. Suno seed generation --------------------------------------------
async function sunoSeedGen({ audioUrl, prompt, title }) {
  // Real impl: POST to the chosen PAID Suno API's cover/extend endpoint with the
  // source audio + a style prompt, poll until complete, return the new mp3.
  // The free gcui-art route is captcha-blocked, so this stays stubbed until the
  // paid provider is chosen. Pass the source audio through as a placeholder so
  // downstream stages still have something to assemble.
  return {
    stage: 'suno-seed-gen', status: 'stub',
    generatedAudioUrl: audioUrl || null,
    note: 'needs paid Suno API with audio input (cover/extend); passthrough for now',
    request: { prompt: prompt || title || '', seededFrom: audioUrl || null },
  };
}

// --- 3. Visuals via the BYOC pool ---------------------------------------
async function visuals({ prompt, showId, count = 4 }) {
  const n = Math.min(Math.max(count, 1), 8);
  const images = [];
  const providers = [];
  for (let i = 0; i < n; i++) {
    // Vary the prompt slightly per frame for visual variety.
    const framePrompt = `${prompt} — cinematic concert scene, frame ${i + 1}`;
    try {
      const res = await fetch(`${GW}/scene/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: framePrompt, showId }),
      });
      const j = await res.json();
      if (j.ok && j.imageUrl) { images.push(j.imageUrl); providers.push(j.provider); }
    } catch (e) {
      // skip a failed frame; the pool already falls back internally
    }
  }
  const status = images.length ? 'ok' : 'fail';
  return { stage: 'visuals', status, count: images.length, images, providers };
}

// --- 4. Assemble video ---------------------------------------------------
function assemble({ audioUrl, images, videoMode = 'slideshow', perImageSec = 4 }) {
  if (videoMode === 'ai-video') {
    return {
      stage: 'assemble', status: 'planned', mode: 'ai-video',
      note: 'true AI video (Meta Movie Gen / LTX / Kling) is a future pool provider',
    };
  }
  // Slideshow: emit a spec a renderer (myspot already has ffmpeg MP4 export) consumes.
  return {
    stage: 'assemble', status: images?.length ? 'spec-ready' : 'skip', mode: 'slideshow',
    spec: {
      audioUrl: audioUrl || null,
      images: images || [],
      perImageSec,
      transition: 'crossfade',
      kenBurns: true,
      resolution: '1280x720',
    },
    note: 'render with ffmpeg (myspot render.py) or any slideshow renderer',
  };
}

// --- Orchestrator --------------------------------------------------------
export async function synthesize({ song = {}, showId, youtubeUrl, audioUrl, imageCount, videoMode } = {}) {
  const prompt = song.prompt || [song.title, song.artist].filter(Boolean).join(' — ') || 'live performance';
  const stages = [];

  const s1 = await sourceAudio({ youtubeUrl, audioUrl });
  stages.push(s1);

  const s2 = await sunoSeedGen({ audioUrl: s1.audioUrl, prompt, title: song.title });
  stages.push(s2);

  const s3 = await visuals({ prompt, showId, count: imageCount ?? 4 });
  stages.push(s3);

  const s4 = assemble({ audioUrl: s2.generatedAudioUrl, images: s3.images, videoMode });
  stages.push(s4);

  return {
    ok: true,
    song: { title: song.title || null, prompt },
    showId: showId || null,
    stages,
    scene: {
      audioUrl: s2.generatedAudioUrl,
      images: s3.images,
      video: s4.spec || null,
    },
    // Surfaces which stages still need wiring, for the UI / dev.
    pending: stages.filter((s) => s.status === 'stub' || s.status === 'planned').map((s) => s.stage),
  };
}
