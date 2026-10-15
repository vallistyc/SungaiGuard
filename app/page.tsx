"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  classifyNtu,
  getRiverColor,
  getTurbidityColor,
  isTurbidityStatus,
  TURBIDITY_LEVELS,
  TURBIDITY_THRESHOLDS,
  type TurbidityStatus,
} from "./turbidity";

const POLL_MS = 3000;
const OFFLINE_MS = 30000;

type Reading = {
  id: string;
  created_at: string;
  device_id: string;
  ntu: number | null;
  adc_raw: number;
  voltage: number;
  status: TurbidityStatus | null;
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

function parseRows(payload: unknown): Reading[] {
  if (!Array.isArray(payload)) {
    throw new Error("Format data dari Supabase tidak sesuai.");
  }

  return payload.flatMap((item: unknown, index: number) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const parsedNtu = row.ntu === null || row.ntu === undefined
      ? null
      : Number(row.ntu);
    const ntu = parsedNtu !== null && Number.isFinite(parsedNtu)
      ? parsedNtu
      : null;
    const adc = Number(row.adc_raw);
    const voltage = Number(row.voltage);

    if (
      !Number.isFinite(adc) ||
      !Number.isFinite(voltage) ||
      typeof row.created_at !== "string"
    ) {
      return [];
    }

    const status = classifyNtu(ntu) ??
      (isTurbidityStatus(row.status) ? row.status : null);
    return [
      {
        id:
          typeof row.id === "string" || typeof row.id === "number"
            ? String(row.id)
            : `${row.created_at}-${index}`,
        created_at: row.created_at,
        device_id: typeof row.device_id === "string" ? row.device_id : "",
        ntu,
        adc_raw: adc,
        voltage,
        status,
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
      25: 280,
      28: 300,
      33: 120,
      34: 125,
      35: 130,
    };
    const ntu = surgeValues[index] ?? Math.min(300, Math.max(2, 36 + wave));
    const voltage = Math.max(0, (3.9994 - 0.0008 * ntu) * 0.6);

    return {
      id: `demo-${index}`,
      created_at: new Date(now - elapsed).toISOString(),
      device_id: "sungai-01",
      ntu,
      adc_raw: Math.round((voltage / 3.3) * 4095),
      voltage,
      status: classifyNtu(ntu),
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
  const numericReadings = readingsDesc.filter(
    (reading): reading is Reading & { ntu: number } => reading.ntu !== null,
  );
  if (
    numericReadings.length <
    EVENT_MIN_BASELINE_POINTS + EVENT_CONSECUTIVE
  ) {
    return null;
  }

  const recent = numericReadings.slice(0, EVENT_CONSECUTIVE);
  const base = numericReadings
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

function RiverVisual({
  status,
  ntu,
}: {
  status: TurbidityStatus | null;
  ntu: number | null;
}) {
  const opacity =
    ntu === null ? 0.35 : 0.35 + (Math.min(ntu, 300) / 300) * 0.65;
  const waterColor = getRiverColor(status);

  return (
    <div
      className="river-visual"
      role="img"
      aria-label={`Ilustrasi sungai${status ? `, ${status}` : ""}`}
    >
      <svg viewBox="0 0 360 150" fill="none" aria-hidden="true">
        <rect width="360" height="150" rx="16" fill="#e4f3ed" />
        <path d="M0 0h360v47c-42 12-75 4-115-5S163 38 119 51 42 65 0 53V0Z" fill="#b6d8bd" />
        <path d="M0 91c47-15 83-11 124 2s77 16 117 1 76-17 119-4v60H0V91Z" fill="#7cab74" />
        <path
          d="M0 55c42 12 75 9 119-4s83-18 126-9 73 17 115 5v55c-43-13-79-11-119 4s-76 12-117-1S47 76 0 91V55Z"
          fill={waterColor}
          fillOpacity={opacity}
        />
        <path d="M20 70c34-8 56-5 84 3m67-18c28-8 54-8 80 0m30 43c22-7 40-8 61-3" stroke="#fff" strokeOpacity=".55" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <div className="river-state">
        <i style={{ backgroundColor: getTurbidityColor(status) }} />
        {status ?? "Data belum tersedia"}
      </div>
    </div>
  );
}

function TrendChart({
  readings,
  range,
}: {
  readings: Reading[];
  range: Range;
}) {
  const width = 760;
  const height = 236;
  const chartReadings = readings.filter(
    (reading): reading is Reading & { ntu: number } =>
      reading.ntu !== null && Number.isFinite(reading.ntu),
  );
  const maximum = Math.max(100, ...chartReadings.map((reading) => reading.ntu));
  const padding = { top: 18, right: 150, bottom: 28, left: 42 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const chartBottom = padding.top + chartHeight;
  const chartY = (value: number) =>
    padding.top + chartHeight - (value / maximum) * chartHeight;
  const ticks = [0, 1, 2, 3, 4].map((index) =>
    Math.round((maximum / 4) * index),
  );
  const bands = [
    { from: 0, to: TURBIDITY_THRESHOLDS.clear, color: getTurbidityColor("Jernih") },
    {
      from: TURBIDITY_THRESHOLDS.clear,
      to: TURBIDITY_THRESHOLDS.slightlyTurbid,
      color: getTurbidityColor("Agak Keruh"),
    },
    {
      from: TURBIDITY_THRESHOLDS.slightlyTurbid,
      to: TURBIDITY_THRESHOLDS.turbid,
      color: getTurbidityColor("Keruh"),
    },
    {
      from: TURBIDITY_THRESHOLDS.turbid,
      to: maximum,
      color: getTurbidityColor("Sangat Keruh"),
    },
  ];
  const boundaries = [
    {
      value: TURBIDITY_THRESHOLDS.clear,
      status: "Agak Keruh",
    },
    {
      value: TURBIDITY_THRESHOLDS.slightlyTurbid,
      status: "Keruh",
    },
    {
      value: TURBIDITY_THRESHOLDS.turbid,
      status: "Sangat Keruh",
    },
  ] as const;
  const points = chartReadings.map((reading, index) => ({
    x:
      chartReadings.length < 2
        ? padding.left + chartWidth / 2
        : padding.left + (index / (chartReadings.length - 1)) * chartWidth,
    y: chartY(reading.ntu),
    reading,
  }));
  const line = points.map(({ x, y }) => `${x},${y}`).join(" ");
  const area = `${padding.left},${chartBottom} ${line} ${padding.left + chartWidth},${chartBottom}`;
  const labels =
    chartReadings.length > 0
      ? [
          chartReadings[0],
          chartReadings[Math.floor((chartReadings.length - 1) / 2)],
          chartReadings[chartReadings.length - 1],
        ]
      : [];

  return (
    <div className="chart-wrap">
      {chartReadings.length === 0 ? (
        <div className="chart-empty">Belum ada data pada rentang waktu ini.</div>
      ) : (
        <svg
          className="trend-chart"
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`Grafik NTU ${range} terakhir`}
        >
          <defs>
            <linearGradient id="chart-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#42d5b5" stopOpacity=".24" />
              <stop offset="1" stopColor="#42d5b5" stopOpacity="0" />
            </linearGradient>
          </defs>
          {bands.map((band) => {
            const from = Math.min(band.from, maximum);
            const to = Math.min(band.to, maximum);
            if (to <= from) return null;
            return (
              <rect
                key={band.from}
                x={padding.left}
                y={chartY(to)}
                width={chartWidth}
                height={chartY(from) - chartY(to)}
                fill={band.color}
                fillOpacity=".09"
              />
            );
          })}
          {ticks.map((value) => {
            const y = chartY(value);
            return (
              <g key={value}>
                <line
                  x1={padding.left}
                  x2={padding.left + chartWidth}
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
          <text x="0" y="10" className="chart-axis-label">
            NTU
          </text>
          {boundaries.map(({ value, status }) => {
            if (value > maximum) return null;
            const y = chartY(value);
            return (
              <g key={value}>
                <line
                  x1={padding.left}
                  x2={padding.left + chartWidth}
                  y1={y}
                  y2={y}
                  className="chart-threshold"
                  stroke={getTurbidityColor(status)}
                />
                <text
                  x={padding.left + chartWidth + 6}
                  y={y + 3}
                  className="chart-threshold-label"
                  fill={getTurbidityColor(status)}
                >
                  {status} &gt; {value}
                </text>
              </g>
            );
          })}
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
          `${url}/rest/v1/readings?select=id,created_at,device_id,adc_raw,voltage,ntu,status&created_at=gte.${encodeURIComponent(since)}&order=created_at.desc&limit=${MAX_ROWS}`,
          { headers, cache: "no-store" },
        ),
        fetch(
          `${url}/rest/v1/readings?select=id,created_at,device_id,adc_raw,voltage,ntu,status&order=created_at.desc&limit=1`,
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
      .sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
  }, [now, readings, range]);
  const numericReadings = readings.filter(
    (reading): reading is Reading & { ntu: number } => reading.ntu !== null,
  );
  const average = numericReadings.length
    ? numericReadings.reduce((total, reading) => total + reading.ntu, 0) /
      numericReadings.length
    : 0;
  const maximumReading = numericReadings.length
    ? Math.max(...numericReadings.map((reading) => reading.ntu))
    : 0;
  const clearPercentage = numericReadings.length
    ? Math.round(
        (numericReadings.filter(
          (reading) => classifyNtu(reading.ntu) === "Jernih",
        ).length /
          numericReadings.length) *
          100,
      )
    : 0;
  const statusColor = getTurbidityColor(latest?.status ?? null);
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
      ["Waktu", "Device", "ADC", "Tegangan (V)", "NTU", "Status"],
      ...readings.map((reading) => [
        reading.created_at,
        reading.device_id,
        reading.adc_raw,
        reading.voltage,
        reading.ntu ?? "-",
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
                {latest?.status ?? "Data belum tersedia"}
              </h2>
              <p>
                {latest
                  ? "Klasifikasi mengikuti pembacaan NTU terkini."
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
              <RiverVisual
                status={latest?.status ?? null}
                ntu={latest?.ntu ?? null}
              />
              <div className="hero-reading">
                <div className="reading-label">KEKERUHAN TERKINI</div>
                <div className="ntu-value">
                  {latest?.ntu !== null && latest?.ntu !== undefined
                    ? latest.ntu.toFixed(1)
                    : "—"}
                  <span>NTU</span>
                </div>
                <span
                  className="status-tag hero-status"
                  style={{
                    color: statusColor,
                    background: `${statusColor}24`,
                  }}
                >
                  <i />
                  {latest?.status ?? "-"}
                </span>
                <div className="reading-technical">
                  <span>Tegangan <strong>{latest ? `${latest.voltage.toFixed(3)} V` : "—"}</strong></span>
                  <span>ADC <strong>{latest?.adc_raw ?? "—"}</strong></span>
                </div>
              </div>
            </div>
            <div className="hero-bottom-note">
              <Icon name="activity" size={14} /> Nilai sensor ditampilkan dalam NTU
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
                {latest?.ntu !== null && latest?.ntu !== undefined
                  ? latest.ntu.toFixed(1)
                  : "—"}{" "}
                <small>NTU</small>
              </div>
              <div className="stat-foot">
                <span
                  className="status-tag"
                  style={{ color: statusColor, background: `${statusColor}16` }}
                >
                  <i />
                  {latest?.status ?? "-"}
                </span>
                <span className="stat-muted">
                  {latest ? `${latest.voltage.toFixed(3)} V · ADC ${latest.adc_raw}` : "Data sensor belum tersedia"}
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
                {numericReadings.length ? average.toFixed(1) : "—"} <small>NTU</small>
              </div>
              <div className="stat-foot">
                <span className="stat-neutral">
                  <Icon name="clock" size={13} /> {RANGE_LABEL[range]}
                </span>
                <span className="stat-muted">
                  Puncak {numericReadings.length ? maximumReading.toFixed(1) : "—"} NTU
                </span>
              </div>
            </article>
            <article className="stat-card">
              <div className="stat-top">
                <span className="stat-icon green">
                  <Icon name="check" />
                </span>
                <span className="stat-caption">JERNIH · NTU ≤ {TURBIDITY_THRESHOLDS.clear}</span>
                <span className="stat-more">···</span>
              </div>
              <div className="stat-value">
                {numericReadings.length ? clearPercentage : 0}
                <small>%</small>
              </div>
              <div className="stat-foot">
                <div className="mini-progress">
                  <span style={{ width: `${clearPercentage}%` }} />
                </div>
                <span className="stat-muted">
                  dari {numericReadings.length} pembacaan bernilai
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
              </div>
              <TrendChart
                readings={shownReadings}
                range={range}
              />
              <div className="status-legend" aria-label="Legenda klasifikasi NTU">
                {TURBIDITY_LEVELS.map(({ status, range: levelRange, color }) => (
                  <span key={status}>
                    <i style={{ backgroundColor: color }} />
                    <strong>{status}</strong>
                    <small>{levelRange} NTU</small>
                  </span>
                ))}
              </div>
            </section>

            <section className="panel threshold-panel">
              <div className="panel-header">
                <div>
                  <h3>Klasifikasi NTU</h3>
                  <p>Status berdasarkan nilai sensor</p>
                </div>
              </div>
              <div className="threshold-list">
                {TURBIDITY_LEVELS.map(
                  ({ status, range: threshold, color, riverColor }) => (
                  <div className="threshold-item" key={status}>
                    <span
                      className="threshold-icon"
                      style={{
                        color,
                        backgroundColor: `${color}18`,
                      }}
                    >
                      <span
                        className="threshold-color"
                        style={{ backgroundColor: riverColor }}
                      />
                    </span>
                    <div className="threshold-info">
                      <strong>{status}</strong>
                      <span>
                        NTU{" "}
                        {status === "Jernih"
                          ? `≤ ${TURBIDITY_THRESHOLDS.clear}`
                          : status === "Agak Keruh"
                            ? `> ${TURBIDITY_THRESHOLDS.clear} sampai ${TURBIDITY_THRESHOLDS.slightlyTurbid}`
                            : status === "Keruh"
                              ? `> ${TURBIDITY_THRESHOLDS.slightlyTurbid} sampai ${TURBIDITY_THRESHOLDS.turbid}`
                              : `> ${TURBIDITY_THRESHOLDS.turbid}`}
                      </span>
                    </div>
                    <span className="threshold-range">
                      {threshold} <small>NTU</small>
                    </span>
                  </div>
                  ),
                )}
              </div>
              <p className="threshold-note">
                Batas status merupakan klasifikasi indikatif, bukan penetapan
                mutu resmi.
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
                    <th>DEVICE</th>
                    <th>ADC</th>
                    <th>TEGANGAN (V)</th>
                    <th>NTU</th>
                    <th>STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {readings.slice(0, 5).map((reading) => {
                    const color = getTurbidityColor(reading.status);
                    return (
                    <tr key={reading.id}>
                      <td>
                        <span className="table-time">
                          {formatTime(reading.created_at, true)}
                        </span>
                      </td>
                      <td>
                        <span className="table-secondary">
                          {reading.device_id || "-"}
                        </span>
                      </td>
                      <td className="table-secondary">{reading.adc_raw}</td>
                      <td className="table-secondary">
                        {reading.voltage.toFixed(3)} V
                      </td>
                      <td>
                        <strong className="table-ntu">
                          {reading.ntu !== null
                            ? `${reading.ntu.toFixed(1)} NTU`
                            : "-"}
                        </strong>
                      </td>
                      <td>
                        <span
                          className="table-status"
                          style={{
                            color,
                            background: `${color}16`,
                          }}
                        >
                          <i />
                          {reading.status ?? "-"}
                        </span>
                      </td>
                    </tr>
                    );
                  })}
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
          <p className="classification-note">
            Klasifikasi bersifat indikatif berdasarkan literatur kekeruhan air
            sungai (NTU), bukan baku mutu resmi. Data berasal dari simulasi.
          </p>
        </div>
      </section>
    </main>
  );
}
