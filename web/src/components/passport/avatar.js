import { generateImage } from '../../api.js';

const SIZE = 320; // square avatar, kept small so it fits comfortably in localStorage

// Read an uploaded image file, center-crop to a square, downscale, and return a
// compact JPEG data URL.
export function fileToAvatar(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      reject(new Error('Please choose an image file.'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('That image could not be loaded.'));
      img.onload = () => {
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;
        const canvas = document.createElement('canvas');
        canvas.width = SIZE;
        canvas.height = SIZE;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, sx, sy, side, side, 0, 0, SIZE, SIZE);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// Generate a vintage passport-style portrait with free FLUX (Pollinations).
// `seed` (e.g. the traveller name) varies the result so re-rolling looks
// different. `gender` ('female' | 'male' | 'neutral') steers the subject so it
// isn't always read as one gender; 'neutral' leaves it androgynous.
export async function generateAvatar(seed = '', gender = 'neutral') {
  const subject = gender === 'male'
    ? 'a stylish man, a male music fan'
    : gender === 'female'
      ? 'a stylish woman, a female music fan'
      : 'a stylish androgynous person, a music fan of ambiguous gender';
  const flavor = seed ? `, inspired by the name ${seed}` : '';
  const variant = Math.floor(Math.random() * 100000);
  const prompt = [
    `Vintage passport photo portrait, head and shoulders of ${subject},`,
    'neutral studio backdrop, warm sepia tone, soft analog film grain, centered, 1970s ID photo aesthetic,',
    `no text, no border${flavor}. v${variant}`,
  ].join(' ');
  const res = await generateImage('pollinations', prompt, { label: 'passport-avatar' }).catch(() => null);
  if (res?.ok && res.image) return res.image;
  throw new Error(res?.error || 'Image generation is unavailable right now.');
}
