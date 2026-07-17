import { useState } from 'react';
import { stampRotation, countryEmoji } from './palette.js';
import VisaStamp from './VisaStamp.jsx';
import Magnifier from './Magnifier.jsx';

// Per-country visa, presented as a landscape perforated postage stamp
// (VisaStamp) with hover tools: generate/toggle the pollinations art face and
// a philatelist's loupe. The stamp itself carries all the visa data — country,
// class, entry terms, validity, serial and the visit count as denomination.
export default function VisaCard({ visa, entryCount = 1, art, showArt, onToggleArt, onGenerate, generating }) {
  const [loupe, setLoupe] = useState(false);
  const rot = stampRotation(visa.id, 3);
  const stamp = <VisaStamp visa={visa} entryCount={entryCount} art={art && showArt ? art : null} />;

  return (
    <div className="cohear-postage cohear-postage--visa" style={{ '--rot': `${rot}deg` }}>
      <Magnifier active={loupe} content={stamp}>
        {stamp}
      </Magnifier>
      <div className="cohear-postage__tools">
        <button
          type="button"
          className={loupe ? 'is-on' : ''}
          onClick={() => setLoupe((v) => !v)}
          title={loupe ? 'Put the loupe away' : 'Inspect with the loupe'}
        >
          🔍
        </button>
        {onGenerate && art && (
          <button type="button" onClick={onToggleArt} title={showArt ? 'Show the printed visa' : 'Show the art visa'}>
            {showArt ? 'Plain' : '✨'}
          </button>
        )}
        {onGenerate && (
          <button type="button" onClick={onGenerate} disabled={generating} title={art ? 'Regenerate the art' : 'Generate visa art'}>
            {generating ? '…' : art ? '↻' : '✨ Art'}
          </button>
        )}
      </div>
    </div>
  );
}

export { countryEmoji };
