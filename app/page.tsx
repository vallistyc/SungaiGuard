"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const POLL_MS = 3000;
const OFFLINE_MS = 30000;

// Estimasi TSS: TSS (mg/L) = TSS_A * NTU + TSS_B. Samakan dengan firmware (placeholder simulasi).
const TSS_A: number = 1.0;
const TSS_B: number = 0.0;
const TSS_LIMITS = { k1: 40, k2: 50, k3: 100, k4: 400 } as const;

type Kelas = "Kelas I" | "Kelas II" | "Kelas III" | "Kelas IV" | "Melampaui";

const COLORS: Record<Kelas, string> = {
  "Kelas I": "#26c5a3",
  "Kelas II": "#8fd14f",
  "Kelas III": "#f2b84b",
  "Kelas IV": "#f28c4b",
  Melampaui: "#fa6e5e",
};

const HERO_MESSAGE: Record<Kelas, string> = {
  "Kelas I": "Estimasi TSS berada dalam batas Kelas I.",
  "Kelas II": "Estimasi TSS berada dalam batas Kelas II.",
  "Kelas III": "Estimasi TSS berada dalam batas Kelas III. Pantau secara berkala.",
  "Kelas IV": "Estimasi TSS berada dalam batas Kelas IV. Perlu perhatian.",
  Melampaui: "Estimasi TSS melampaui batas Kelas IV. Perlu pemeriksaan.",
};

type Reading = {
  id: string;
  created_at: string;
  ntu: number;
  tss: number;
  adc_raw: number;
  voltage: number;
  status: Kelas;
};

type Range = "1H" | "6H" | "24H" | "7D";

const MAX_ROWS = 1000;
const RANGE_MS: Record<Range, number> = {
  "1H": 60 * 60 * 1000,
  "6H": 6 * 60 * 60 * 1000,
  "24H": 24 * 60 * 60 * 1000,
  "7D": 7 * 24 * 60 * 60 * 1000,
};
const RANGE_LABEL: Record<Range, string> = {
  "1H": "1 jam terakhir",
  "6H": "6 jam terakhir",
  "24H": "24 jam terakhir",
  "7D": "7 hari terakhir",
};

function toTSS(ntu: number): number {
  return Math.max(0, TSS_A * ntu + TSS_B);
}

function tssToNtu(tss: number): number {
  return TSS_A === 0 ? 0 : (tss - TSS_B) / TSS_A;
}

function getKelas(tss: number): Kelas {
  if (tss <= TSS_LIMITS.k1) return "Kelas I";
  if (tss <= TSS_LIMITS.k2) return "Kelas II";
  if (tss <= TSS_LIMITS.k3) return "Kelas III";
  if (tss <= TSS_LIMITS.k4) return "Kelas IV";
  return "Melampaui";
}

function parseRows(payload: unknown): Reading[] {
  if (!Array.isArray(payload)) {
    throw new Error("Format data dari Supabase tidak sesuai.");
  }

  return payload.flatMap((item: unknown, index: number) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const ntu = Number(row.ntu);
    const adc = Number(row.adc_raw);
    const voltage = Number(row.voltage);

    if (
      !Number.isFinite(ntu) ||
      !Number.isFinite(adc) ||
      !Number.isFinite(voltage) ||
      typeof row.created_at !== "string"
    ) {
      return [];
    }

    const tss = toTSS(ntu);
    return [
      {
        id:
          typeof row.id === "string" || typeof row.id === "number"
            ? String(row.id)
            : `${row.created_at}-${index}`,
        created_at: row.created_at,
        ntu,
        tss,
        adc_raw: adc,
        voltage,
        status: getKelas(tss),
      },
    ];
  });
}

function makeDemoReadings(): Reading[] {
  const now = Date.now();
  const chronologicalReadings = Array.from({ length: 36 }, (_, index) => {
    const elapsed = (35 - index) * 40 * 60 * 1000;
    const wave = Math.sin(index * 0.66) * 8 + Math.cos(index * 0.23) * 6;
    const surgeValues: Record<number, number> = {
      5: 45,
      12: 80,
      19: 200,
      25: 350,
      28: 450,
      33: 120,
      34: 125,
      35: 130,
    };
    const ntu = surgeValues[index] ?? Math.max(20, 36 + wave);
    const tss = toTSS(ntu);
    const voltage = Math.max(0, (3.9994 - 0.0008 * ntu) * 0.6);

    return {
      id: `demo-${index}`,
      created_at: new Date(now - elapsed).toISOString(),
      ntu,
      tss,
      adc_raw: Math.round((voltage / 3.3) * 4095),
      voltage,
      status: getKelas(tss),
    };
  });

  return chronologicalReadings.reverse();
}

const EVENT_MIN_BASELINE_POINTS = 10;
const EVENT_CONSECUTIVE = 3;
const EVENT_DELTA_NTU = 8;
const EVENT_BACKGROUND_SPLIT = 80;
const EVENT_RATIO_HIGH = 1.1;

function detectSurge(readingsDesc: Reading[]) {
  if (
    readingsDesc.length <
    EVENT_MIN_BASELINE_POINTS + EVENT_CONSECUTIVE
  ) {
    return null;
  }

  const recent = readingsDesc.slice(0, EVENT_CONSECUTIVE);
  const base = readingsDesc
    .slice(EVENT_CONSECUTIVE)
    .map((reading) => reading.ntu)
    .sort((a, b) => a - b);
  const mid = Math.floor(base.length / 2);
  const baseline =
    base.length % 2 ? base[mid] : (base[mid - 1] + base[mid]) / 2;
  const limit =
    baseline <= EVENT_BACKGROUND_SPLIT
      ? baseline + EVENT_DELTA_NTU
      : baseline * EVENT_RATIO_HIGH;
  const surge = recent.every((reading) => reading.ntu > limit);

  return surge ? { baseline, current: recent[0].ntu, limit } : null;
}

function formatTime(value: string, includeDate = false) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("id-ID", {
    ...(includeDate ? { day: "2-digit", month: "short" } : {}),
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function Icon({
  name,
  size = 20,
}: {
  name:
    | "grid"
    | "droplet"
    | "chart"
    | "history"
    | "settings"
    | "download"
    | "refresh"
    | "arrow"
    | "check"
    | "warning"
    | "wifi"
    | "clock"
    | "activity"
    | "chevron";
  size?: number;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };
  const paths: Record<typeof name, React.ReactNode> = {
    grid: (
      <>
        <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
        <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
        <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
        <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
      </>
    ),
    droplet: (
      <>
        <path d="M12 3.5S5.5 11 5.5 15.1a6.5 6.5 0 0 0 13 0C18.5 11 12 3.5 12 3.5Z" />
        <path d="M9 15.5a3 3 0 0 0 3 3" />
      </>
    ),
    chart: (
      <>
        <path d="M4 19.5V4.5" />
        <path d="M4 19.5h16" />
        <path d="m7 15 4-4 3 2 5-6" />
        <path d="M16 7h3v3" />
      </>
    ),
    history: (
      <>
        <path d="M3.5 12a8.5 8.5 0 1 0 2.3-5.8L3.5 8.5" />
        <path d="M3.5 4.5v4h4" />
        <path d="M12 7v5l3.2 2" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path
          d="m19.4 15 .1.1a1.7 1.7 0 1 1-2.4 2.4l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.3a1.7 1.7 0 1 1-3.4 0v-.2A1.7 1.7 0 0 0 7.8 17l-.1.1a1.7 1.7 0 1 1-2.4-2.4l.1-.1a1.7 1.7 0 0 0-1.2-2.9h-.3a1.7 1.7 0 1 1 0-3.4h.2A1.7 1.7 0 0 0 5.3 5.8l-.1-.1a1.7 1.7 0 1 1 2.4-2.4l.1.1a1.7 1.7 0 0 0 2.9-1.2v-.3a1.7 1.7 0 1 1 3.4 0v.2A1.7 1.7 0 0 0 16.2 4l.1-.1a1.7 1.7 0 1 1 2.4 2.4l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.3a1.7 1.7 0 1 1 0 3.4h-.2a1.7 1.7 0 0 0-.5 2.3Z"
          transform="translate(0 1)"
        />
      </>
    ),
    download: (
      <>
        <path d="M12 3.5v11" />
        <path d="m8 10.5 4 4 4-4" />
        <path d="M4 17.5v3h16v-3" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 7v5h-5" />
        <path d="M4.8 9A7.5 7.5 0 0 1 18 6l2 2" />
        <path d="M4 17v-5h5" />
        <path d="M19.2 15A7.5 7.5 0 0 1 6 18l-2-2" />
      </>
    ),
    arrow: (
      <>
        <path d="M7 17 17 7" />
        <path d="M8 7h9v9" />
      </>
    ),
    check: (
      <>
        <path d="m5 12 4 4L19 6" />
      </>
    ),
    warning: (
      <>
        <path d="m10.3 4.2-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-2.8l-8-14a2 2 0 0 0-3.4 0Z" />
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
      </>
    ),
    wifi: (
      <>
        <path d="M5 9.5a11 11 0 0 1 14 0" />
        <path d="M8 12.5a6.5 6.5 0 0 1 8 0" />
        <path d="M11 15.5a2 2 0 0 1 2 0" />
        <path d="M12 19h.01" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    activity: (
      <>
        <path d="M3 12h4l3-8 4 16 3-8h4" />
      </>
    ),
    chevron: (
      <>
        <path d="m7 10 5 5 5-5" />
      </>
    ),
  };
  return <svg {...common}>{paths[name]}</svg>;
}

function RiverVisual({ status }: { status: Kelas }) {
  const waterColors: Record<Kelas, [string, string]> = {
    "Kelas I": ["#79d8c5", "#167b83"],
    "Kelas II": ["#b5d987", "#4e8f68"],
    "Kelas III": ["#f1d17d", "#9a8d50"],
    "Kelas IV": ["#e9ae79", "#9c6649"],
    Melampaui: ["#e99d82", "#9f574e"],
  };
  const [waterHighlight, waterShadow] = waterColors[status];

  return (
    <div
      className="river-visual"
      role="img"
      aria-label={`Ilustrasi sungai, estimasi kelas ${status}`}
    >
      <svg viewBox="0 0 360 250" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="river-sky" x1="180" y1="0" x2="180" y2="145" gradientUnits="userSpaceOnUse">
            <stop stopColor="#D4F0E8" />
            <stop offset="1" stopColor="#86CBB9" />
          </linearGradient>
          <linearGradient id="river-water" x1="100" y1="105" x2="246" y2="250" gradientUnits="userSpaceOnUse">
            <stop stopColor={waterHighlight} />
            <stop offset="1" stopColor={waterShadow} />
          </linearGradient>
          <linearGradient id="river-bank" x1="0" y1="80" x2="180" y2="200" gradientUnits="userSpaceOnUse">
            <stop stopColor="#85B99A" />
            <stop offset="1" stopColor="#326F62" />
          </linearGradient>
          <clipPath id="river-water-clip">
            <path d="M151 91C174 92 203 103 210 120c9 21-12 34-32 51-23 20-5 45 54 79H115c-39-37-53-59-20-82 30-21 55-35 43-53-9-13-2-22 13-24Z" />
          </clipPath>
        </defs>
        <rect width="360" height="250" rx="18" fill="url(#river-sky)" />
        <circle cx="295" cy="39" r="18" fill="#FFF1C2" fillOpacity=".8" />
        <path d="M0 105 54 57l38 31 48-55 56 62 44-41 66 54v47H0v-50Z" fill="#77AD98" fillOpacity=".72" />
        <path d="m0 118 52-35 43 29 51-42 48 48 51-33 62 45v31H0v-43Z" fill="#4D8D79" fillOpacity=".68" />
        <path d="M0 132c47-21 74-25 111-23 15 1 27 3 40 7-13 13-29 26-56 44-33 23-17 48 20 90H0V132Z" fill="url(#river-bank)" />
        <path d="M210 116c45-17 91-13 150 9v125H232c-59-34-77-59-54-79 20-17 41-30 32-55Z" fill="url(#river-bank)" />
        <path d="M151 91C174 92 203 103 210 120c9 21-12 34-32 51-23 20-5 45 54 79H115c-39-37-53-59-20-82 30-21 55-35 43-53-9-13-2-22 13-24Z" fill="url(#river-water)" />
        <g clipPath="url(#river-water-clip)">
          <path d="M129 119c24 9 54 10 80 4M105 151c30 10 62 9 94-2M99 187c34 9 73 8 105-4M125 221c34 8 64 7 96-1" stroke="#E9FFF7" strokeOpacity=".36" strokeWidth="2" strokeLinecap="round" />
          <path d="M143 133c17 5 37 5 52 1M112 171c19 4 38 4 54 1M139 205c18 4 35 3 49 0" stroke="#E9FFF7" strokeOpacity=".2" strokeWidth="1.4" strokeLinecap="round" />
          <circle cx="156" cy="157" r="2" fill="white" fillOpacity=".55" />
          <circle cx="188" cy="190" r="1.6" fill="white" fillOpacity=".52" />
          <circle cx="149" cy="211" r="1.4" fill="white" fillOpacity=".46" />
        </g>
        <path d="M0 132c47-21 74-25 111-23M210 116c45-17 91-13 150 9" stroke="#D3E8B1" strokeOpacity=".72" strokeWidth="2" />
        <path d="M260 77v53m0-53-15 7m15-7 15 7" stroke="#E6F5E8" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M242 79h36l-5-13h-26l-5 13Z" fill="#244E4B" stroke="#E6F5E8" strokeWidth="2" strokeLinejoin="round" />
        <path d="M252 130c0-5 4-9 9-9s9 4 9 9v6h-18v-6Z" fill="#D7ECE1" stroke="#477F72" strokeWidth="2" />
        <circle cx="261" cy="132" r="3" fill={waterHighlight} />
        <path d="M32 151v-17m0 9-8-7m8 10 8-8m256 10v-19m0 10-8-8m8 12 9-9m21 12v-15m0 7-7-6" stroke="#C5DEAA" strokeWidth="3" strokeLinecap="round" />
        <path d="M17 250c25-16 47-19 75-17m216 17c15-10 32-14 52-13" stroke="#B6D7A4" strokeOpacity=".65" strokeWidth="2" />
      </svg>
      <div className="river-state">
        <i style={{ backgroundColor: COLORS[status] }} />
        Kualitas air · {status}
      </div>
    </div>
  );
}

function TrendChart({
  readings,
  range,
  logScale,
}: {
  readings: Reading[];
  range: Range;
  logScale: boolean;
}) {
  const width = 760;
  const height = 236;
  const maximum = Math.max(60, ...readings.map((reading) => reading.ntu));
  const padding = {
    top: 18,
    right: 62,
    bottom: 28,
    left: maximum >= 1000 ? 48 : 38,
  };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const ticks = logScale
    ? [0, 10, 100, 1000].filter((value) => value <= maximum)
    : [0, 1, 2, 3].map((index) => Math.round((maximum / 3) * index));
  const chartY = (value: number) =>
    padding.top +
    chartHeight -
    (logScale
      ? (Math.log10(1 + value) / Math.log10(1 + maximum)) * chartHeight
      : (value / maximum) * chartHeight);
  const thresholdLines: Array<{
    value: number;
    status: Kelas;
    label: string;
  }> = [
    { value: TSS_LIMITS.k1, status: "Kelas I", label: "Kelas I" },
    { value: TSS_LIMITS.k2, status: "Kelas II", label: "Kelas II" },
    { value: TSS_LIMITS.k3, status: "Kelas III", label: "Kelas III" },
    { value: TSS_LIMITS.k4, status: "Kelas IV", label: "Kelas IV" },
  ];
  const points = readings.map((reading, index) => {
    const x =
      readings.length < 2
        ? width / 2
        : padding.left + (index / (readings.length - 1)) * chartWidth;
    const y = chartY(reading.ntu);
    return { x, y, reading };
  });
  const line = points.map(({ x, y }) => `${x},${y}`).join(" ");
  const area = `${padding.left},${padding.top + chartHeight} ${line} ${padding.left + chartWidth},${padding.top + chartHeight}`;
  const visibleThresholds = thresholdLines
    .map((threshold) => ({ ...threshold, y: chartY(tssToNtu(threshold.value)) }))
    .filter((threshold) => tssToNtu(threshold.value) <= maximum)
    .sort((a, b) => a.y - b.y);
  const annotatedThresholds = visibleThresholds.reduce<
    Array<(typeof visibleThresholds)[number] & { labelY: number }>
  >((annotations, threshold) => {
    const previousLabelY =
      annotations[annotations.length - 1]?.labelY ??
      Number.NEGATIVE_INFINITY;
    const labelY = Math.max(threshold.y + 3, previousLabelY + 11);
    return [...annotations, { ...threshold, labelY }];
  }, []);
  const labelOverflow =
    annotatedThresholds.length > 0
      ? Math.max(
          0,
          annotatedThresholds[annotatedThresholds.length - 1].labelY -
            (padding.top + chartHeight - 2),
        )
      : 0;
  const labels =
    readings.length > 0
      ? [
          readings[0],
          readings[Math.floor((readings.length - 1) / 2)],
          readings[readings.length - 1],
        ]
      : [];

  return (
    <div className="chart-wrap">
      {readings.length === 0 ? (
        <div className="chart-empty">
          Belum ada data pada rentang waktu ini.
        </div>
      ) : (
        <svg
          className="trend-chart"
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`Grafik kekeruhan ${range} terakhir dengan skala ${logScale ? "logaritmik" : "linear"}`}
        >
          <defs>
            <linearGradient id="chart-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#42d5b5" stopOpacity=".24" />
              <stop offset="1" stopColor="#42d5b5" stopOpacity="0" />
            </linearGradient>
          </defs>
          {ticks.map((value) => {
            const y = chartY(value);
            return (
              <g key={value}>
                <line
                  x1={padding.left}
                  x2={width - padding.right}
                  y1={y}
                  y2={y}
                  className="chart-grid"
                />
                <text x="0" y={y + 4} className="chart-axis-label">
                  {value}
                </text>
              </g>
            );
          })}
          {annotatedThresholds.map((threshold) => (
            <g key={threshold.status}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={threshold.y}
                y2={threshold.y}
                className="chart-threshold"
                stroke={COLORS[threshold.status]}
              />
              <text
                x={width - padding.right + 5}
                y={threshold.labelY - labelOverflow}
                className="chart-threshold-label"
                fill={COLORS[threshold.status]}
              >
                {threshold.label}
              </text>
            </g>
          ))}
          <polygon points={area} fill="url(#chart-area)" />
          <polyline points={line} className="chart-line" />
          {points.length > 0 && (
            <circle
              cx={points[points.length - 1].x}
              cy={points[points.length - 1].y}
              r="4.5"
              className="chart-dot"
            />
          )}
          {labels.map((reading, index) => (
            <text
              key={`${reading.id}-${index}`}
              x={
                padding.left +
                (index / Math.max(1, labels.length - 1)) * chartWidth
              }
              y={height - 4}
              textAnchor={
                index === 0
                  ? "start"
                  : index === labels.length - 1
                    ? "end"
                    : "middle"
              }
              className="chart-axis-label"
            >
              {formatTime(reading.created_at, range === "7D")}
            </text>
          ))}
        </svg>
      )}
    </div>
  );
}

export default function Home() {
  const isConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  const [readings, setReadings] = useState<Reading[]>([]);
  const [latestReading, setLatestReading] = useState<Reading | null>(null);
  const [range, setRange] = useState<Range>("24H");
  const [connection, setConnection] = useState<
    "loading" | "online" | "offline" | "preview"
  >("loading");
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(0);
  const [logScale, setLogScale] = useState(false);
  const requestId = useRef(0);

  const loadReadings = useCallback(async () => {
    const id = ++requestId.current;

    if (!isConfigured) {
      if (id !== requestId.current) return;
      setReadings((current) => (current.length ? current : makeDemoReadings()));
      setLatestReading(null);
      setConnection("preview");
      setLastUpdated(new Date());
      setError("");
      return;
    }
    setRefreshing(true);
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, "");
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
      const headers = { apikey: key, Authorization: `Bearer ${key}` };
      const since = new Date(Date.now() - RANGE_MS[range]).toISOString();
      const [rangeRes, latestRes] = await Promise.all([
        fetch(
          `${url}/rest/v1/readings?select=*&created_at=gte.${encodeURIComponent(since)}&order=created_at.desc&limit=${MAX_ROWS}`,
          { headers, cache: "no-store" },
        ),
        fetch(
          `${url}/rest/v1/readings?select=*&order=created_at.desc&limit=1`,
          { headers, cache: "no-store" },
        ),
      ]);
      if (!rangeRes.ok) {
        throw new Error(
          `Supabase merespons dengan status ${rangeRes.status}.`,
        );
      }
      if (!latestRes.ok) {
        throw new Error(
          `Supabase merespons dengan status ${latestRes.status}.`,
        );
      }

      const nextReadings = parseRows(await rangeRes.json());
      const nextLatest = parseRows(await latestRes.json())[0] ?? null;
      if (id !== requestId.current) return;

      setReadings(nextReadings);
      setLatestReading(nextLatest);
      setConnection("online");
      setLastUpdated(new Date());
      setError("");
    } catch (cause) {
      if (id !== requestId.current) return;
      setConnection("offline");
      setError(
        cause instanceof Error
          ? cause.message
          : "Data gagal dimuat. Periksa koneksi dan konfigurasi Supabase.",
      );
    } finally {
      if (id === requestId.current) setRefreshing(false);
    }
  }, [isConfigured, range]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadReadings(), 0);
    const polling = window.setInterval(() => void loadReadings(), POLL_MS);
    const initialClock = window.setTimeout(() => setNow(Date.now()), 0);
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearTimeout(initialClock);
      window.clearInterval(polling);
      window.clearInterval(clock);
    };
  }, [loadReadings]);

  const latest = latestReading ?? readings[0];
  const surge = useMemo(() => detectSurge(readings), [readings]);
  const deviceOnline = latest
    ? now - new Date(latest.created_at).getTime() <= OFFLINE_MS
    : false;
  const shownReadings = useMemo(() => {
    const cutoff = now - RANGE_MS[range];
    return readings
      .filter((reading) => new Date(reading.created_at).getTime() >= cutoff)
      .reverse();
  }, [now, readings, range]);
  const average = readings.length
    ? readings.reduce((total, reading) => total + reading.ntu, 0) /
      readings.length
    : 0;
  const maximumReading = readings.length
    ? Math.max(...readings.map((reading) => reading.ntu))
    : 0;
  const classIIPercentage = readings.length
    ? Math.round(
        (readings.filter((reading) => reading.tss <= TSS_LIMITS.k2).length /
          readings.length) *
          100,
      )
    : 0;
  const statusColor = latest ? COLORS[latest.status] : COLORS["Kelas I"];
  const greetingHour = now ? new Date(now).getHours() : null;
  const greeting =
    greetingHour === null
      ? "Selamat datang"
      : greetingHour < 11
        ? "Selamat pagi"
        : greetingHour < 15
          ? "Selamat siang"
          : greetingHour < 18
            ? "Selamat sore"
            : "Selamat malam";

  function exportCsv() {
    const rows = [
      ["Waktu", "NTU", "TSS Estimasi (mg/L)", "ADC", "Tegangan", "Kelas"],
      ...readings.map((reading) => [
        reading.created_at,
        reading.ntu,
        reading.tss,
        reading.adc_raw,
        reading.voltage,
        reading.status,
      ]),
    ];
    const csv = rows
      .map((row) =>
        row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","),
      )
      .join("\r\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(
      new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }),
    );
    link.download = `river-guard-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return (
    <main className="app-shell">
      <section className="main-content" id="overview">
        <header className="topbar">
          <div className="brand-group">
            <a
              className="brand"
              href="#overview"
              aria-label="River Guard beranda"
            >
              <span className="brand-mark">
                <Icon name="droplet" size={21} />
              </span>
              <span className="brand-copy">
                <strong>
                  river<span>guard</span>
                </strong>
                <small>WATER MONITORING</small>
              </span>
            </a>
            <span className="brand-divider" aria-hidden="true" />
            <div className="institution-brand">
              <Image
                src="/itslogo.png"
                alt="Logo Institut Teknologi Sepuluh Nopember"
                width={40}
                height={40}
                priority
              />
              <span>
                <strong>Institut Teknologi Sepuluh Nopember</strong>
                <small>PROYEK KULIAH</small>
              </span>
            </div>
          </div>
          <div className="topbar-actions">
            <div
              className={`connection-pill ${connection === "online" && deviceOnline ? "is-online" : connection === "preview" ? "is-preview" : "is-offline"}`}
            >
              <span className="connection-dot" />
              {connection === "preview"
                ? "Mode preview"
                : connection === "loading"
                  ? "Menghubungkan"
                  : connection === "online" && deviceOnline
                    ? "Perangkat aktif"
                    : "Perangkat offline"}
            </div>
            <div className="topbar-divider" />
            <span className="topbar-date">
              <Icon name="clock" size={16} />{" "}
              {new Intl.DateTimeFormat("id-ID", {
                weekday: "short",
                day: "numeric",
                month: "short",
              }).format(new Date(now))}
            </span>
          </div>
        </header>

        <div className="page-body">
          {!isConfigured && (
            <div className="preview-banner">
              <span>
                <Icon name="activity" size={16} /> Pratinjau interaktif
              </span>
              <p>
                Menampilkan data simulasi. Atur{" "}
                <code>NEXT_PUBLIC_SUPABASE_URL</code> dan{" "}
                <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> untuk menghubungkan
                database.
              </p>
              <button onClick={loadReadings} aria-label="Muat ulang pratinjau">
                <Icon name="refresh" size={16} />
              </button>
            </div>
          )}
          {error && (
            <div className="error-banner" role="alert">
              <Icon name="warning" size={17} />
              <span>
                <strong>Koneksi database bermasalah.</strong> {error}
              </span>
              <button onClick={loadReadings}>Coba lagi</button>
            </div>
          )}
          {surge && (
            <div className="event-banner" role="alert">
              <Icon name="warning" size={17} />
              <span>
                <strong>Kenaikan kekeruhan mendadak.</strong> Saat ini{" "}
                {surge.current.toFixed(1)} NTU, kondisi dasar sekitar{" "}
                {surge.baseline.toFixed(1)} NTU.
              </span>
            </div>
          )}

          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <span className="eyebrow-line" /> SISTEM PEMANTAUAN SUNGAI
              </div>
              <h1>
                {greeting} <span className="wave">✦</span>
              </h1>
              <p>Berikut kondisi air sungai saat ini.</p>
            </div>
            <div className="heading-actions">
              <span className="updated-at">
                {lastUpdated
                  ? `Diperbarui ${formatTime(lastUpdated.toISOString())}`
                  : "Menyiapkan data..."}
              </span>
              <button
                className={`button button-secondary ${refreshing ? "is-refreshing" : ""}`}
                onClick={() => void loadReadings()}
                disabled={refreshing}
              >
                <Icon name="refresh" size={16} /> Segarkan
              </button>
              <button
                className="button button-primary"
                onClick={exportCsv}
                disabled={!readings.length}
              >
                <Icon name="download" size={16} /> Ekspor data
              </button>
            </div>
          </div>

          <section className="hero-card" id="quality">
            <div className="hero-text">
              <div className="hero-kicker">
                <span className="pulse-dot" /> KONDISI SUNGAI SAAT INI
              </div>
              <h2 style={{ color: statusColor }}>
                {latest?.status ?? "Menunggu data"}
              </h2>
              <p>
                {latest
                  ? HERO_MESSAGE[latest.status]
                  : "Pembacaan terbaru akan muncul di sini."}
              </p>
              <div className="hero-metrics">
                <div>
                  <span className="hero-metric-icon">
                    <Icon name="activity" size={16} />
                  </span>
                  <span>Sensor</span>
                  <strong>
                    {connection === "preview"
                      ? "Pratinjau"
                      : deviceOnline
                        ? "Terhubung"
                        : "Terputus"}
                  </strong>
                </div>
                <div>
                  <span className="hero-metric-icon">
                    <Icon name="clock" size={16} />
                  </span>
                  <span>Pembacaan</span>
                  <strong>
                    {latest ? formatTime(latest.created_at) : "—"}
                  </strong>
                </div>
              </div>
            </div>
            <div className="hero-visual">
              <RiverVisual status={latest?.status ?? "Kelas I"} />
              <div className="hero-reading">
                <div className="reading-label">TINGKAT KEKERUHAN</div>
                <div className="ntu-value">
                  {latest ? latest.ntu.toFixed(1) : "—"}
                  <span>NTU</span>
                </div>
                <div className="tss-estimate">
                  Estimasi TSS: {latest ? latest.tss.toFixed(1) : "—"} mg/L
                </div>
                <div className="reading-scale">
                  <span>0</span>
                  <div className="scale-track">
                    <div
                      className="scale-fill"
                      style={{
                        width: `${Math.min(100, ((latest?.tss ?? 0) / 500) * 100)}%`,
                        background: statusColor,
                      }}
                    />
                    <i className="scale-tick" style={{ left: "20%" }} />
                    <i className="scale-tick" style={{ left: "80%" }} />
                  </div>
                  <span>500+</span>
                </div>
                <div className="scale-legend">
                  <span>
                    <i
                      className="legend-dot"
                      style={{ backgroundColor: COLORS["Kelas I"] }}
                    />
                    Kelas I ≤ 40 mg/L
                  </span>
                  <span>
                    <i
                      className="legend-dot"
                      style={{ backgroundColor: COLORS.Melampaui }}
                    />
                    Melampaui &gt; 400 mg/L
                  </span>
                </div>
              </div>
            </div>
            <div className="hero-bottom-note">
              <Icon name="check" size={14} /> Indikator mengacu PP 22/2021 (TSS)
            </div>
          </section>

          <section className="stat-grid" aria-label="Statistik kualitas air">
            <article className="stat-card">
              <div className="stat-top">
                <span
                  className="stat-icon turquoise"
                  style={{ color: statusColor, backgroundColor: `${statusColor}18` }}
                >
                  <Icon name="activity" />
                </span>
                <span className="stat-caption">PEMBACAAN TERAKHIR</span>
                <span className="stat-more">···</span>
              </div>
              <div className="stat-value">
                {latest ? latest.ntu.toFixed(1) : "—"} <small>NTU</small>
              </div>
              <div className="stat-foot">
                <span
                  className="status-tag"
                  style={{ color: statusColor, background: `${statusColor}16` }}
                >
                  <i />
                  {latest?.status ?? "Belum tersedia"}
                </span>
                <span className="stat-muted">
                  TSS ≈ {latest ? latest.tss.toFixed(1) : "—"} mg/L
                </span>
              </div>
            </article>
            <article className="stat-card">
              <div className="stat-top">
                <span className="stat-icon blue">
                  <Icon name="chart" />
                </span>
                <span className="stat-caption">RATA-RATA PEMBACAAN</span>
                <span className="stat-more">···</span>
              </div>
              <div className="stat-value">
                {readings.length ? average.toFixed(1) : "—"} <small>NTU</small>
              </div>
              <div className="stat-foot">
                <span className="stat-neutral">
                  <Icon name="clock" size={13} /> {RANGE_LABEL[range]}
                </span>
                <span className="stat-muted">
                  Puncak {maximumReading.toFixed(1)} NTU
                </span>
              </div>
            </article>
            <article className="stat-card">
              <div className="stat-top">
                <span className="stat-icon green">
                  <Icon name="check" />
                </span>
                <span className="stat-caption">MEMENUHI KELAS II</span>
                <span className="stat-more">···</span>
              </div>
              <div className="stat-value">
                {readings.length ? classIIPercentage : 0}
                <small>%</small>
              </div>
              <div className="stat-foot">
                <div className="mini-progress">
                  <span style={{ width: `${classIIPercentage}%` }} />
                </div>
                <span className="stat-muted">
                  dari {readings.length} pembacaan
                </span>
              </div>
            </article>
            <article className="stat-card">
              <div className="stat-top">
                <span
                  className={`stat-icon ${deviceOnline ? "green" : "amber"}`}
                >
                  <Icon name={deviceOnline ? "wifi" : "warning"} />
                </span>
                <span className="stat-caption">STATUS PERANGKAT</span>
                <span className="stat-more">···</span>
              </div>
              <div className="stat-device">
                {deviceOnline ? "Online" : "Offline"}
                <span
                  className={`device-status-dot ${deviceOnline ? "good" : "bad"}`}
                />
              </div>
              <div className="stat-foot">
                <span className="stat-muted">
                  {latest
                    ? `Data terakhir ${formatTime(latest.created_at)}`
                    : "Menunggu koneksi sensor"}
                </span>
              </div>
            </article>
          </section>

          <div className="dashboard-grid">
            <section className="panel chart-panel">
              <div className="panel-header">
                <div>
                  <div className="panel-title-row">
                    <h3>Tren kekeruhan</h3>
                    <span className="live-tag">
                      <span /> LIVE
                    </span>
                  </div>
                  <p>Perubahan kadar NTU dari waktu ke waktu</p>
                </div>
                <div className="chart-controls">
                  <div className="range-switch" aria-label="Rentang waktu grafik">
                    {(["1H", "6H", "24H", "7D"] as Range[]).map((item) => (
                      <button
                        key={item}
                        onClick={() => setRange(item)}
                        className={range === item ? "selected" : ""}
                        aria-pressed={range === item}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                  <button
                    className={`log-toggle ${logScale ? "selected" : ""}`}
                    onClick={() => setLogScale((current) => !current)}
                    aria-pressed={logScale}
                  >
                    Skala log
                  </button>
                </div>
              </div>
              <TrendChart
                readings={shownReadings}
                range={range}
                logScale={logScale}
              />
              <div className="chart-legend">
                <span>
                  <i className="chart-legend-line" /> Tingkat kekeruhan (NTU)
                </span>
                <span>
                  <i className="chart-legend-dash" /> Garis putus: batas TSS PP 22/2021 (setara NTU)
                </span>
              </div>
            </section>

            <section className="panel threshold-panel">
              <div className="panel-header">
                <div>
                  <h3>Ambang kualitas</h3>
                  <p>Estimasi TSS dari NTU (PP 22/2021)</p>
                </div>
                <button
                  className="icon-button panel-menu"
                  aria-label="Opsi ambang"
                >
                  <span>···</span>
                </button>
              </div>
              <div className="threshold-list">
                {[
                  {
                    status: "Kelas I" as const,
                    description: "Air baku air minum",
                    range: "≤ 40",
                    icon: "check" as const,
                  },
                  {
                    status: "Kelas II" as const,
                    description: "Rekreasi air, budidaya ikan, peternakan, irigasi",
                    range: "> 40 - 50",
                    icon: "activity" as const,
                  },
                  {
                    status: "Kelas III" as const,
                    description: "Budidaya ikan, peternakan, irigasi",
                    range: "> 50 - 100",
                    icon: "activity" as const,
                  },
                  {
                    status: "Kelas IV" as const,
                    description: "Irigasi",
                    range: "> 100 - 400",
                    icon: "warning" as const,
                  },
                  {
                    status: "Melampaui" as const,
                    description: "Di atas batas Kelas IV",
                    range: "> 400",
                    icon: "warning" as const,
                  },
                ].map(({ status, description, range: threshold, icon }) => (
                  <div className="threshold-item" key={status}>
                    <span
                      className="threshold-icon"
                      style={{
                        color: COLORS[status],
                        backgroundColor: `${COLORS[status]}18`,
                      }}
                    >
                      <Icon name={icon} size={16} />
                    </span>
                    <div className="threshold-info">
                      <strong>{status}</strong>
                      <span>{description}</span>
                    </div>
                    <span className="threshold-range">
                      {threshold} <small>mg/L</small>
                    </span>
                  </div>
                ))}
              </div>
              <p className="threshold-note">
                Batas mengacu pada parameter TSS pada PP No. 22 Tahun 2021
                Lampiran VI (baku mutu air sungai). Peraturan tersebut tidak
                menetapkan batas NTU, sehingga TSS diestimasi dari NTU dengan
                TSS = {TSS_A} × NTU + {TSS_B} (koefisien placeholder simulasi).
                Ini adalah indikator berdasarkan satu parameter, bukan
                penetapan status mutu air.
              </p>
            </section>
          </div>

          <section className="panel history-panel" id="history">
            <div className="panel-header history-header">
              <div>
                <h3>Riwayat pemantauan</h3>
                <p>Pembacaan sensor terbaru di titik pantau sungai</p>
              </div>
              <button className="text-button" onClick={exportCsv}>
                Unduh semua <Icon name="arrow" size={14} />
              </button>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>WAKTU</th>
                    <th>TINGKAT NTU</th>
                    <th>TSS EST.</th>
                    <th>ADC RAW</th>
                    <th>TEGANGAN</th>
                    <th>KELAS</th>
                  </tr>
                </thead>
                <tbody>
                  {readings.slice(0, 5).map((reading) => (
                    <tr key={reading.id}>
                      <td>
                        <span className="table-time">
                          {formatTime(reading.created_at, true)}
                        </span>
                      </td>
                      <td>
                        <strong className="table-ntu">
                          {reading.ntu.toFixed(1)} <small>NTU</small>
                        </strong>
                      </td>
                      <td className="table-secondary">
                        {reading.tss.toFixed(1)} mg/L
                      </td>
                      <td className="table-secondary">{reading.adc_raw}</td>
                      <td className="table-secondary">
                        {reading.voltage.toFixed(3)} V
                      </td>
                      <td>
                        <span
                          className="table-status"
                          style={{
                            color: COLORS[reading.status],
                            background: `${COLORS[reading.status]}16`,
                          }}
                        >
                          <i />
                          {reading.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {readings.length === 0 && (
                <div className="table-empty">
                  Belum ada pembacaan yang tersedia.
                </div>
              )}
            </div>
            <div className="table-footer">
              <span>
                Menampilkan <strong>{Math.min(5, readings.length)}</strong> dari{" "}
                <strong>{readings.length}</strong> pembacaan
              </span>
              <span className="auto-refresh">
                <span /> Pembaruan otomatis aktif
              </span>
            </div>
          </section>

          <footer className="footer">
            <span>
              © 2026 River Guard <i /> Sistem Pemantauan Kekeruhan Sungai
            </span>
            <span>Dibuat untuk memenuhi tugas mata kuliah</span>
          </footer>
        </div>
      </section>
    </main>
  );
}
