/** An illustrative chase-camera preview; the game itself renders OSM roads in WebGL. */
export function RoutePreview() {
  return (
    <div className="route-preview preview-3d" aria-hidden="true">
      <div className="preview-top">
        <span className="live-dot" /> DEINE STRASSEN · JETZT IN 3D
      </div>
      <svg viewBox="0 0 640 570" fill="none" className="preview-map">
        <defs>
          <linearGradient
            id="sky3d"
            x1="320"
            y1="0"
            x2="320"
            y2="350"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#304c55" />
            <stop offset="1" stopColor="#9caf8e" />
          </linearGradient>
          <linearGradient
            id="road3d"
            x1="320"
            y1="160"
            x2="320"
            y2="570"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#3a4941" />
            <stop offset="1" stopColor="#182522" />
          </linearGradient>
          <linearGradient
            id="car3d"
            x1="320"
            y1="340"
            x2="320"
            y2="482"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#e3ff9b" />
            <stop offset="1" stopColor="#a3c759" />
          </linearGradient>
        </defs>
        <rect width="640" height="570" fill="url(#sky3d)" />
        <circle cx="426" cy="99" r="39" fill="#e4e7b6" opacity=".3" />
        <path
          d="M0 157h52v-44h34v61h42v-23h23v45h30v-64h33v65h37v-35h37v36h59v-54h26v44h47v-70h31v73h35v-42h29v34h63v-65h30v63h57v-48h38v86H0Z"
          fill="#60786b"
          opacity=".6"
        />
        <path d="M0 190h640v380H0Z" fill="#52654e" />
        <path d="m310 177-380 393h780L330 177Z" fill="url(#road3d)" />
        <path
          d="m302 190-366 380M338 190l366 380"
          stroke="#9baa8a"
          strokeWidth="5"
        />
        <g fill="#b7bf9f" opacity=".55">
          <path d="m319 230-2 22h6l-2-22Z" />
          <path d="m317 279-3 33h12l-3-33Z" />
          <path d="m314 351-6 55h24l-6-55Z" />
          <path d="m308 469-9 78h42l-9-78Z" />
        </g>
        <path d="M-10 46 177 98v215L-10 457Z" fill="#314d44" />
        <path d="m177 98 48 51v129l-48 35Z" fill="#516d57" />
        <path d="m-10 46 48-19 187 122-48-51Z" fill="#6a8063" />
        <g stroke="#7d9779" strokeWidth="8" opacity=".3">
          <path d="M20 88v316M60 101v272M102 115v226M144 128v181" />
          <path d="m0 156 171 42M0 234l171-10M0 321l171-67" />
        </g>
        <path d="m210 154 46 18v93l-46 50Z" fill="#4b6553" />
        <path d="m256 172 23 18v57l-23 18Z" fill="#627b62" />
        <path d="m640 49-147 51v215l147 142Z" fill="#506952" />
        <path d="m493 100-47 49v129l47 37Z" fill="#2d4b3e" />
        <path d="m640 49-36-26-158 126 47-49Z" fill="#72856a" />
        <g stroke="#94a680" strokeWidth="7" opacity=".3">
          <path d="M521 131v177M561 115v226M601 101v272" />
          <path d="m507 180 133-47M507 223l133 11M507 259l133 72" />
        </g>
        <path d="m428 156-41 17v92l41 50Z" fill="#425b48" />
        <path d="m387 173-24 17v57l24 18Z" fill="#678068" />
        <g stroke="#b5c499" strokeLinecap="round">
          <path d="M124 413V283l53-27" strokeWidth="5" />
          <path d="M509 413V283l-52-27" strokeWidth="5" />
          <path
            d="m173 256 16-5m-10 8 16-5M463 256l-16-5m10 8-16-5"
            strokeWidth="7"
          />
        </g>
        <ellipse
          cx="320"
          cy="489"
          rx="95"
          ry="19"
          fill="#061613"
          opacity=".6"
        />
        <path
          d="m229 417-10 22v34h23v-48Zm182 0 10 22v34h-23v-48Z"
          fill="#0c1817"
        />
        <path
          d="m255 389 23-52h84l23 52 25 24-5 64H235l-5-64Z"
          fill="url(#car3d)"
        />
        <path d="m281 345-18 43h114l-18-43Z" fill="#203e38" />
        <path d="M263 388h114l-9 31h-96Z" fill="#43624b" />
        <path d="m242 428 28 1m100 0 28-1" stroke="#e08368" strokeWidth="8" />
        <path d="M277 451h86" stroke="#435537" strokeWidth="12" />
        <path d="M257 471h126" stroke="#344c2c" strokeWidth="5" />
        <path
          d="m246 397-18-3m166 3 18-3"
          stroke="#9fb75b"
          strokeWidth="8"
          strokeLinecap="round"
        />
        <path d="M0 550h640v20H0Z" fill="#111c16" opacity=".5" />
      </svg>
      <div className="preview-coordinate">
        <span className="coordinate-cross">↗</span>
        <span>
          Aus der Karte wird deine Straße.
          <br />
          <strong>Einsteigen. Losfahren. Entdecken.</strong>
        </span>
      </div>
      <div className="preview-caption">
        ILLUSTRATIVE VORSCHAU <span>02 — 3D FREE DRIVE</span>
      </div>
    </div>
  );
}
