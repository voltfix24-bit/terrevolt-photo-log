// TerreVoltLoader.tsx — plaats in src/components/ en gebruik: <TerreVoltLoader size={64} />
type Props = { size?: number; label?: string; className?: string };

const css = `
.tv-bolt{transform-box:fill-box;transform-origin:50% 50%;animation:tv-strike 2.4s infinite}
.tv-fill{animation:tv-charge 2.4s infinite}
.tv-ground{transform-box:fill-box;transform-origin:50% 50%;animation:tv-wave 2.4s infinite}
.tv-g{opacity:.2;animation:tv-glow 2.4s infinite}
.tv-g2{animation-delay:.05s}.tv-g3{animation-delay:.1s}.tv-g4{animation-delay:.15s}
@keyframes tv-charge{0%{transform:translateY(340px);opacity:1;animation-timing-function:cubic-bezier(.65,0,.35,1)}50%{transform:translateY(0);opacity:1}82%{opacity:1}96%{transform:translateY(0);opacity:0}100%{transform:translateY(340px);opacity:0}}
@keyframes tv-strike{0%{transform:none;animation-timing-function:cubic-bezier(.4,0,.6,1)}47%{transform:translateY(-16px) rotate(-4deg) scale(.96,1.03);animation-timing-function:cubic-bezier(.7,0,1,.5)}55%{transform:translateY(9px) rotate(3deg) scale(1.07,.93);animation-timing-function:cubic-bezier(0,.5,.5,1)}62%{transform:translateY(-3px) rotate(-1deg) scale(.98,1.02)}70%,100%{transform:none}}
@keyframes tv-wave{0%,55%{transform:none}60%{transform:scaleX(1.18);animation-timing-function:cubic-bezier(.4,0,.6,1)}72%,100%{transform:none}}
@keyframes tv-glow{0%,54%{opacity:.2}57%,80%{opacity:1}94%,100%{opacity:.2}}
@media (prefers-reduced-motion:reduce){.tv-bolt,.tv-ground{animation:none}}
`;

const BOLT =
  "M235 166 L244 167 L252 173 L255 187 L224 280 L331 282 L340 288 L344 296 L344 308 L338 319 L240 418 L181 477 L175 480 L163 479 L155 472 L153 461 L187 357 L87 356 L76 348 L72 338 L77 320 L227 169 L234 167 Z M217 216 L196 281 L198 296 L204 303 L214 308 L312 308 L203 419 L191 429 L215 359 L215 345 L207 334 L197 330 L104 330 L216 217 Z";

export default function TerreVoltLoader({ size = 64, label = "Laden…", className }: Props) {
  return (
    <div role="status" aria-label={label} className={className} style={{ display: "inline-flex" }}>
      <style>{css}</style>
      <svg width={size} height={size} viewBox="47 125 360 380" style={{ overflow: "visible" }} aria-hidden="true">
        <defs>
          <clipPath id="tv-clip">
            <path d={BOLT} clipRule="evenodd" />
          </clipPath>
        </defs>
        <g className="tv-bolt">
          <path d={BOLT} fillRule="evenodd" fill="#18A84A" opacity={0.2} />
          <g clipPath="url(#tv-clip)">
            <rect className="tv-fill" x={47} y={160} width={360} height={330} fill="#18A84A" />
          </g>
        </g>
        <g className="tv-ground" stroke="#F5B400" strokeLinecap="round" fill="none">
          <path className="tv-g" d="M334 385 L334 406" strokeWidth={19} />
          <path className="tv-g tv-g2" d="M295 424 L373 424" strokeWidth={18} />
          <path className="tv-g tv-g3" d="M310 450 L358 450" strokeWidth={18} />
          <path className="tv-g tv-g4" d="M331 477 L337 477" strokeWidth={18} />
        </g>
      </svg>
    </div>
  );
}
