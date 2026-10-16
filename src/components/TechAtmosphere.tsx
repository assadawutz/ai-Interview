/** Decorative vector layer; animation is CSS-only and honors reduced motion. */
export function TechAtmosphere() {
  return (
    <div className="tech-atmosphere" aria-hidden="true">
      <div className="tech-gradient tech-gradient-blue" />
      <div className="tech-gradient tech-gradient-acid" />
      <div className="tech-circuit">
        <svg viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice" focusable="false">
          <defs>
            <linearGradient id="pulse-edge" x1="0" x2="1">
              <stop stopColor="#3662ff" />
              <stop offset=".5" stopColor="#bcff39" />
              <stop offset="1" stopColor="#ee55be" />
            </linearGradient>
          </defs>
          <g className="circuit-lines" fill="none" stroke="url(#pulse-edge)" strokeWidth="1.5">
            <path d="M70 160H300L380 240H650L760 130H1130" />
            <path d="M150 680L300 530H540L650 640H890L1050 480" />
            <path d="M380 240V400L540 530M760 130V340L890 470V640" />
          </g>
          <path
            className="circuit-morph"
            d="M960 260C1010 210 1100 220 1120 280C1140 340 1060 370 1010 340C960 310 920 310 960 260Z"
            fill="none"
            stroke="#cb46b0"
            strokeWidth="1.5"
          />
          <g
            className="circuit-charge"
            fill="none"
            stroke="#315bff"
            strokeWidth="3"
            strokeDasharray="14 360"
          >
            <path d="M70 160H300L380 240H650L760 130H1130" />
            <path d="M150 680L300 530H540L650 640H890L1050 480" />
          </g>
          <g className="circuit-nodes" fill="#caff45" stroke="#111827" strokeWidth="2">
            <circle cx="380" cy="240" r="6" />
            <circle cx="760" cy="130" r="6" />
            <circle cx="540" cy="530" r="6" />
            <circle cx="890" cy="640" r="6" />
          </g>
        </svg>
      </div>
      <div className="tech-scanlines" />
    </div>
  );
}
