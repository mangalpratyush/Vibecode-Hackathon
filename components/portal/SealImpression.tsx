/**
 * The seal, drawn as a seal.
 *
 * A registry seal is a physical thing an advocate already recognises: a milled
 * ring, the issuing body's name curved around it, and something short and
 * quotable stamped in the middle. Drawing it that way costs nothing and says
 * what the feature is far faster than a heading can, so the panel leads with
 * the impression rather than with a button.
 *
 * The ring carries its own disclaimer. PARAM issues an integrity seal, not a
 * digital signature under s.3 of the IT Act, and that distinction matters
 * enough that it belongs on the face of the mark and not only in a footnote
 * somebody can crop away.
 */

const TICKS = Array.from({ length: 72 }, (_, i) => i * 5);
const OUTER = "PRE ASSESSMENT REGISTRY AND AUDIT MITRA";
const INNER = "INTEGRITY SEAL · NOT A DIGITAL SIGNATURE";

export default function SealImpression({ sealed, busy, code }: {
  sealed: boolean;
  busy?: boolean;
  /** Short form of the bundle digest, stamped in the centre once issued. */
  code?: string;
}) {
  const state = busy ? "working" : sealed ? "sealed" : "idle";
  return (
    <div className="param-seal" data-state={state} aria-hidden>
      <svg viewBox="0 0 168 168" role="presentation">
        <defs>
          <linearGradient id="sealFoil" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f4dcae" />
            <stop offset="42%" stopColor="#d8b273" />
            <stop offset="63%" stopColor="#f7e6c4" />
            <stop offset="100%" stopColor="#c69c58" />
          </linearGradient>
          <path id="sealArcTop" d="M 20 84 A 64 64 0 0 1 148 84" fill="none" />
          <path id="sealArcBottom" d="M 30 84 A 54 54 0 0 0 138 84" fill="none" />
        </defs>

        {/* Milled edge. Seventy-two marks, the way a die-struck seal is cut. */}
        <g className="param-seal-mill">
          {TICKS.map((deg) => (
            <line key={deg} x1="84" y1="4" x2="84" y2={deg % 15 === 0 ? 12 : 9}
              transform={`rotate(${deg} 84 84)`} />
          ))}
        </g>

        <circle className="param-seal-ring" cx="84" cy="84" r="76" />
        <circle className="param-seal-ring param-seal-ring-hair" cx="84" cy="84" r="71" />
        <circle className="param-seal-ring param-seal-ring-inner" cx="84" cy="84" r="47" />

        <text className="param-seal-legend">
          <textPath href="#sealArcTop" startOffset="50%" textAnchor="middle">{OUTER}</textPath>
        </text>
        <text className="param-seal-legend param-seal-legend-fine">
          <textPath href="#sealArcBottom" startOffset="50%" textAnchor="middle">{INNER}</textPath>
        </text>

        <text className="param-seal-word" x="84" y="82" textAnchor="middle">परम</text>
        <line className="param-seal-rule" x1="63" y1="93" x2="105" y2="93" />
        <text className="param-seal-code" x="84" y="108" textAnchor="middle">
          {sealed && code ? code : "UNSEALED"}
        </text>
      </svg>
    </div>
  );
}
