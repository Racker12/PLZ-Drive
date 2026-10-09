/** An illustrative map on the landing page. The actual game uses OSM data. */
export function RoutePreview() {
  return (
    <div className="route-preview" aria-hidden="true">
      <div className="preview-top">
        <span className="live-dot" /> DEUTSCHLAND · ENTDECKEN
      </div>
      <svg viewBox="0 0 640 570" fill="none" className="preview-map">
        <defs>
          <pattern
            id="map-grid"
            width="56"
            height="56"
            patternUnits="userSpaceOnUse"
          >
            <path d="M56 0H0V56" stroke="#34413f" strokeOpacity=".16" />
          </pattern>
          <linearGradient
            id="river"
            x1="0"
            y1="480"
            x2="640"
            y2="210"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#163c42" />
            <stop offset="1" stopColor="#24494a" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="8" />
          </filter>
        </defs>
        <rect width="640" height="570" fill="url(#map-grid)" />
        <path
          d="M0 416c108-42 122 60 230 24s125-154 218-168 132 4 202-54"
          stroke="url(#river)"
          strokeWidth="35"
        />
        <g fill="#1c2c24" opacity=".8">
          <path d="m62 120 95-20 36 87-102 34Z" />
          <path d="m472 397 119-22 24 92-114 30Z" />
          <path d="m395 65 119 22-19 63-110-21Z" />
        </g>
        <g
          stroke="#35403f"
          strokeWidth="9"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M-40 196 690 354M76-40 125 235 184 615M234-40 312 278 340 610M470-30 433 170 532 580M640 96 29 340M-30 497 332 365 684 478M27 37 300 130 650 157" />
        </g>
        <g stroke="#45504a" strokeWidth="2.2" opacity=".85">
          <path d="m37 121 571 155M73 282l525 117M166 48l104 386M354 25l-34 247 97 309M562 10l-39 182 104 360M-20 561l548-197M11 394l498-137M143-12l17 128M276 147l151-27M384 466l-213 90M208 320l-14 104M431 340l-83 26" />
        </g>
        <path
          d="m184 479-27-171 153-59 91 20 32-99"
          stroke="#d5f87b"
          strokeWidth="16"
          opacity=".15"
          filter="url(#glow)"
        />
        <path
          d="m184 479-27-171 153-59 91 20 32-99"
          stroke="#d5f87b"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle
          cx="184"
          cy="479"
          r="8"
          fill="#152016"
          stroke="#d5f87b"
          strokeWidth="3"
        />
        <circle cx="418" cy="219" r="37" fill="#d5f87b" opacity=".07" />
        <g transform="translate(418 219) rotate(18)">
          <rect x="-11" y="-20" width="22" height="40" rx="6" fill="#d5f87b" />
          <path d="m-7-9 2-6H5l2 6ZM-7 9H7v5H-7Z" fill="#243421" />
          <rect x="-15" y="-12" width="4" height="9" rx="1" fill="#9aab94" />
          <rect x="11" y="-12" width="4" height="9" rx="1" fill="#9aab94" />
          <rect x="-15" y="8" width="4" height="9" rx="1" fill="#9aab94" />
          <rect x="11" y="8" width="4" height="9" rx="1" fill="#9aab94" />
        </g>
        <g
          fill="#7e8a85"
          fontSize="10"
          fontFamily="monospace"
          letterSpacing="2"
        >
          <text x="77" y="93">
            DEIN VIERTEL
          </text>
          <text x="432" y="473">
            NEUE WEGE
          </text>
        </g>
      </svg>
      <div className="preview-coordinate">
        <span className="coordinate-cross">+</span>
        <span>
          Einfach losfahren.
          <br />
          <strong>Die Straße gehört dir.</strong>
        </span>
      </div>
      <div className="preview-caption">
        ILLUSTRATIVE VORSCHAU <span>01 — FREE DRIVE</span>
      </div>
    </div>
  );
}
