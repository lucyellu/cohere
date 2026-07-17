import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

// Renders `value` as a QR code <img>. Transparent module background by default
// so the code sits directly on the passport paper like printed ink; pass
// `light` (e.g. '#ffffff') for an opaque backing where blend safety matters
// (the html2canvas export path).
export default function QrBadge({ value, size = 84, dark = '#241708', light = '#ffffff00', className, title }) {
  const [url, setUrl] = useState('');

  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(String(value || 'cohear'), {
      errorCorrectionLevel: 'M',
      margin: 1, // slim quiet zone — enough for phone scanners without reading as a white sticker

      width: size * 3, // oversampled so it stays crisp under the loupe / in exports
      color: { dark, light },
    })
      .then((u) => { if (alive) setUrl(u); })
      .catch(() => { if (alive) setUrl(''); });
    return () => { alive = false; };
  }, [value, size, dark, light]);

  if (!url) return <div className={className} style={{ width: size, height: size }} aria-hidden="true" />;
  return <img src={url} width={size} height={size} className={className} alt="Passport QR code" title={title} />;
}
