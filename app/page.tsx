"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";

const NTU_CLEAR = 3;
const NTU_CLOUDY = 25;
const POLL_MS = 3000;
const OFFLINE_MS = 30000;
const COLORS: Record<string, string> = {
  Jernih: "#26c5a3",
  "Agak Keruh": "#f2b84b",
  Keruh: "#fa806e",
};

type Reading = {
  id: string;
  created_at: string;
  ntu: number;
  adc_raw: number;
  voltage: number;
  status: string;
};

type Range = "1H" | "6H" | "24H" | "7D";

function getStatus(ntu: number) {
  if (ntu <= NTU_CLEAR) return "Jernih";
  if (ntu <= NTU_CLOUDY) return "Agak Keruh";
  return "Keruh";
}

function makeDemoReadings(): Reading[] {
  const now = Date.now();
  return Array.from({ length: 36 }, (_, index) => {
    const elapsed = (35 - index) * 40 * 60 * 1000;
    const wave = Math.sin(index * 0.66) * 1.7 + Math.cos(index * 0.23) * 1.1;
    const ntu = Math.max(0.8, Number((4.8 + wave + (index > 25 ? 1.2 : 0)).toFixed(1)));
    return {
      id: `demo-${index}`,
      created_at: new Date(now - elapsed).toISOString(),
      ntu,
      adc_raw: Math.round(1830 - ntu * 17 + Math.sin(index) * 16),
      voltage: Number((3.3 - ntu * 0.028).toFixed(2)),
      status: getStatus(ntu),
    };
  });
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
  name: "grid" | "droplet" | "chart" | "history" | "settings" | "download" | "refresh" | "arrow" | "check" | "warning" | "wifi" | "clock" | "activity" | "chevron";
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
    grid: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></>,
    droplet: <><path d="M12 3.5S5.5 11 5.5 15.1a6.5 6.5 0 0 0 13 0C18.5 11 12 3.5 12 3.5Z" /><path d="M9 15.5a3 3 0 0 0 3 3" /></>,
    chart: <><path d="M4 19.5V4.5" /><path d="M4 19.5h16" /><path d="m7 15 4-4 3 2 5-6" /><path d="M16 7h3v3" /></>,
    history: <><path d="M3.5 12a8.5 8.5 0 1 0 2.3-5.8L3.5 8.5" /><path d="M3.5 4.5v4h4" /><path d="M12 7v5l3.2 2" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1a1.7 1.7 0 1 1-2.4 2.4l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.3a1.7 1.7 0 1 1-3.4 0v-.2A1.7 1.7 0 0 0 7.8 17l-.1.1a1.7 1.7 0 1 1-2.4-2.4l.1-.1a1.7 1.7 0 0 0-1.2-2.9h-.3a1.7 1.7 0 1 1 0-3.4h.2A1.7 1.7 0 0 0 5.3 5.8l-.1-.1a1.7 1.7 0 1 1 2.4-2.4l.1.1a1.7 1.7 0 0 0 2.9-1.2v-.3a1.7 1.7 0 1 1 3.4 0v.2A1.7 1.7 0 0 0 16.2 4l.1-.1a1.7 1.7 0 1 1 2.4 2.4l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.3a1.7 1.7 0 1 1 0 3.4h-.2a1.7 1.7 0 0 0-.5 2.3Z" transform="translate(0 1)" /></>,
    download: <><path d="M12 3.5v11" /><path d="m8 10.5 4 4 4-4" /><path d="M4 17.5v3h16v-3" /></>,
    refresh: <><path d="M20 7v5h-5" /><path d="M4.8 9A7.5 7.5 0 0 1 18 6l2 2" /><path d="M4 17v-5h5" /><path d="M19.2 15A7.5 7.5 0 0 1 6 18l-2-2" /></>,
    arrow: <><path d="M7 17 17 7" /><path d="M8 7h9v9" /></>,
    check: <><path d="m5 12 4 4L19 6" /></>,
    warning: <><path d="m10.3 4.2-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-2.8l-8-14a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></>,
    wifi: <><path d="M5 9.5a11 11 0 0 1 14 0" /><path d="M8 12.5a6.5 6.5 0 0 1 8 0" /><path d="M11 15.5a2 2 0 0 1 2 0" /><path d="M12 19h.01" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    activity: <><path d="M3 12h4l3-8 4 16 3-8h4" /></>,
    chevron: <><path d="m7 10 5 5 5-5" /></>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

function DigitalTwinTank({ status }: { status: string }) {
  const waterColors: Record<string, [string, string]> = {
    Jernih: ["#8ff0d7", "#18a984"],
    "Agak Keruh": ["#ffe19a", "#d69a22"],
    Keruh: ["#ffb19a", "#e45f4a"],
  };
  const [waterHighlight, waterShadow] = waterColors[status] ?? waterColors.Jernih;

  return (
    <div className="tank-visual" role="img" aria-label={`Toren digital twin, status kualitas air ${status}`}>
      <svg viewBox="0 0 240 250" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="tank-shell" x1="50" y1="80" x2="190" y2="155" gradientUnits="userSpaceOnUse">
            <stop stopColor="#DDF3EF" />
            <stop offset=".2" stopColor="#9BCFC4" />
            <stop offset=".48" stopColor="#6BA99E" />
            <stop offset=".8" stopColor="#47877D" />
            <stop offset="1" stopColor="#32695F" />
          </linearGradient>
          <linearGradient id="tank-lid" x1="70" y1="40" x2="169" y2="73" gradientUnits="userSpaceOnUse">
            <stop stopColor="#EFFBF8" />
            <stop offset=".5" stopColor="#A8D9D0" />
            <stop offset="1" stopColor="#5F9A90" />
          </linearGradient>
          <linearGradient id="tank-liquid" x1="77" y1="115" x2="163" y2="190" gradientUnits="userSpaceOnUse">
            <stop stopColor={waterHighlight} />
            <stop offset="1" stopColor={waterShadow} />
          </linearGradient>
          <linearGradient id="tank-glass" x1="78" y1="100" x2="162" y2="183" gradientUnits="userSpaceOnUse">
            <stop stopColor="#E9FFFA" stopOpacity=".48" />
            <stop offset=".48" stopColor="#B6EAE0" stopOpacity=".13" />
            <stop offset="1" stopColor="#143D3A" stopOpacity=".4" />
          </linearGradient>
          <clipPath id="tank-window-clip">
            <rect x="78" y="96" width="84" height="91" rx="17" />
          </clipPath>
        </defs>
        <ellipse cx="120" cy="224" rx="74" ry="10" fill="#071F1D" fillOpacity=".34" />
        <path d="M169 54V38c0-6 5-11 11-11h12" stroke="#77B2A6" strokeWidth="8" strokeLinecap="round" />
        <path d="M169 54V38c0-6 5-11 11-11h12" stroke="#D0EEE7" strokeWidth="3" strokeLinecap="round" />
        <path d="M113 33V22c0-5 4-9 9-9h14" stroke="#79B2A7" strokeWidth="8" strokeLinecap="round" />
        <path d="M113 33V22c0-5 4-9 9-9h14" stroke="#D7F1EB" strokeWidth="3" strokeLinecap="round" />
        <path d="M55 65c0-13 29-23 65-23s65 10 65 23v137c0 13-29 23-65 23s-65-10-65-23V65Z" fill="url(#tank-shell)" stroke="#C4E7DF" strokeOpacity=".8" strokeWidth="2" />
        <path d="M164 53c13 4 21 8 21 13v137c0 10-15 18-37 21V62c0-4 6-7 16-9Z" fill="#164D46" fillOpacity=".18" />
        <path d="M57 81c0 10 28 18 63 18s63-8 63-18M57 113c0 10 28 18 63 18s63-8 63-18M57 177c0 10 28 18 63 18s63-8 63-18M57 204c0 10 28 18 63 18s63-8 63-18" stroke="#E2F8F3" strokeOpacity=".3" strokeWidth="2" />
        <g clipPath="url(#tank-window-clip)">
          <rect x="78" y="96" width="84" height="91" fill="#123F3C" fillOpacity=".52" />
          <path d="M78 128c13-5 23 4 36 0s21-4 34 0 10 0 14-2v61H78v-59Z" fill="url(#tank-liquid)" />
          <path d="M78 128c13-5 23 4 36 0s21-4 34 0 10 0 14-2" stroke={waterHighlight} strokeWidth="2.5" />
          <path d="M89 142v35M151 140v38" stroke="white" strokeOpacity=".16" strokeWidth="2" strokeLinecap="round" />
          <circle cx="105" cy="151" r="2.3" fill="white" fillOpacity=".63" />
          <circle cx="133" cy="162" r="1.7" fill="white" fillOpacity=".55" />
          <circle cx="119" cy="145" r="1.4" fill="white" fillOpacity=".55" />
          <path d="M78 96h84v91H78z" fill="url(#tank-glass)" />
        </g>
        <rect x="78" y="96" width="84" height="91" rx="17" stroke="#ECFFFA" strokeOpacity=".72" strokeWidth="2.5" />
        <path d="M86 102h67M86 181h67" stroke="white" strokeOpacity=".2" strokeWidth="1.5" />
        <path d="M64 63c0-9 25-17 56-17s56 8 56 17-25 17-56 17-56-8-56-17Z" fill="url(#tank-lid)" stroke="#E5F9F4" strokeWidth="2" />
        <path d="M91 62c4-5 15-8 29-8s25 3 29 8" stroke="white" strokeOpacity=".55" strokeWidth="2" strokeLinecap="round" />
        <path d="M105 46v-6c0-4 7-7 15-7s15 3 15 7v6" fill="#76AFA3" stroke="#D6F1EA" strokeWidth="2" />
        <path d="M84 224v6m72-6v6" stroke="#BCDCD4" strokeWidth="4" strokeLinecap="round" />
      </svg>
      <div className="tank-state"><i style={{ backgroundColor: COLORS[status] ?? COLORS[getStatus(0)] }} />Kualitas air · {status}</div>
    </div>
  );
}

function TrendChart({ readings, range }: { readings: Reading[]; range: Range }) {
  const width = 760;
  const height = 236;
  const padding = { top: 18, right: 14, bottom: 28, left: 38 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const maximum = Math.max(30, ...readings.map((reading) => reading.ntu));
  const points = readings.map((reading, index) => {
    const x = readings.length < 2 ? width / 2 : padding.left + (index / (readings.length - 1)) * chartWidth;
    const y = padding.top + chartHeight - (reading.ntu / maximum) * chartHeight;
    return { x, y, reading };
  });
  const line = points.map(({ x, y }) => `${x},${y}`).join(" ");
  const area = `${padding.left},${padding.top + chartHeight} ${line} ${padding.left + chartWidth},${padding.top + chartHeight}`;
  const thresholdY = (value: number) => padding.top + chartHeight - (value / maximum) * chartHeight;
  const labels = readings.length > 0
    ? [readings[0], readings[Math.floor((readings.length - 1) / 2)], readings[readings.length - 1]]
    : [];

  return (
    <div className="chart-wrap">
      {readings.length === 0 ? (
        <div className="chart-empty">Belum ada data pada rentang waktu ini.</div>
      ) : (
        <svg className="trend-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Grafik kekeruhan ${range} terakhir`}>
          <defs>
            <linearGradient id="chart-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#42d5b5" stopOpacity=".24" />
              <stop offset="1" stopColor="#42d5b5" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0, 10, 20, 30].map((value) => {
            const y = thresholdY(value);
            return <g key={value}><line x1={padding.left} x2={width - padding.right} y1={y} y2={y} className="chart-grid" /><text x="0" y={y + 4} className="chart-axis-label">{value}</text></g>;
          })}
          <line x1={padding.left} x2={width - padding.right} y1={thresholdY(NTU_CLEAR)} y2={thresholdY(NTU_CLEAR)} className="chart-threshold" />
          {maximum > NTU_CLOUDY && <line x1={padding.left} x2={width - padding.right} y1={thresholdY(NTU_CLOUDY)} y2={thresholdY(NTU_CLOUDY)} className="chart-threshold chart-threshold-high" />}
          <polygon points={area} fill="url(#chart-area)" />
          <polyline points={line} className="chart-line" />
          {points.length > 0 && <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="4.5" className="chart-dot" />}
          {labels.map((reading, index) => <text key={`${reading.id}-${index}`} x={padding.left + (index / Math.max(1, labels.length - 1)) * chartWidth} y={height - 4} textAnchor={index === 0 ? "start" : index === labels.length - 1 ? "end" : "middle"} className="chart-axis-label">{formatTime(reading.created_at, range === "7D")}</text>)}
        </svg>
      )}
    </div>
  );
}

export default function Home() {
  const isConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [range, setRange] = useState<Range>("24H");
  const [connection, setConnection] = useState<"loading" | "online" | "offline" | "preview">("loading");
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(0);

  const loadReadings = useCallback(async () => {
    if (!isConfigured) {
      setReadings((current) => current.length ? current : makeDemoReadings());
      setConnection("preview");
      setLastUpdated(new Date());
      setError("");
      return;
    }
    setRefreshing(true);
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, "");
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
      const response = await fetch(`${url}/rest/v1/readings?select=*&order=created_at.desc&limit=100`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`Supabase merespons dengan status ${response.status}.`);
      const payload: unknown = await response.json();
      if (!Array.isArray(payload)) throw new Error("Format data dari Supabase tidak sesuai.");
      const nextReadings = payload.flatMap((item: unknown, index: number) => {
        if (!item || typeof item !== "object") return [];
        const row = item as Record<string, unknown>;
        const ntu = Number(row.ntu);
        const adc = Number(row.adc_raw);
        const voltage = Number(row.voltage);
        if (!Number.isFinite(ntu) || !Number.isFinite(adc) || !Number.isFinite(voltage) || typeof row.created_at !== "string") return [];
        return [{
          id: typeof row.id === "string" || typeof row.id === "number" ? String(row.id) : `${row.created_at}-${index}`,
          created_at: row.created_at,
          ntu,
          adc_raw: adc,
          voltage,
          status: typeof row.status === "string" ? row.status : getStatus(ntu),
        }];
      });
      setReadings(nextReadings);
      setConnection("online");
      setLastUpdated(new Date());
      setError("");
    } catch (cause) {
      setConnection("offline");
      setError(cause instanceof Error ? cause.message : "Data gagal dimuat. Periksa koneksi dan konfigurasi Supabase.");
    } finally {
      setRefreshing(false);
    }
  }, [isConfigured]);

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

  const latest = readings[0];
  const deviceOnline = latest ? now - new Date(latest.created_at).getTime() <= OFFLINE_MS : false;
  const shownReadings = useMemo(() => {
    const cutoff = now - ({ "1H": 1, "6H": 6, "24H": 24, "7D": 168 }[range] * 60 * 60 * 1000);
    return readings.filter((reading) => new Date(reading.created_at).getTime() >= cutoff).reverse();
  }, [now, readings, range]);
  const average = readings.length ? readings.reduce((total, reading) => total + reading.ntu, 0) / readings.length : 0;
  const clearPercentage = readings.length ? Math.round((readings.filter((reading) => reading.ntu <= NTU_CLEAR).length / readings.length) * 100) : 0;
  const statusColor = latest ? COLORS[latest.status] ?? COLORS[getStatus(latest.ntu)] : COLORS.Jernih;

  function exportCsv() {
    const rows = [["Waktu", "NTU", "ADC", "Tegangan", "Status"], ...readings.map((reading) => [reading.created_at, reading.ntu, reading.adc_raw, reading.voltage, reading.status])];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    link.download = `toren-guard-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return (
    <main className="app-shell">
      <section className="main-content" id="overview">
        <header className="topbar">
          <div className="brand-group">
            <a className="brand" href="#overview" aria-label="Toren Guard beranda">
              <span className="brand-mark"><Icon name="droplet" size={21} /></span>
              <span className="brand-copy"><strong>toren<span>guard</span></strong><small>WATER MONITORING</small></span>
            </a>
            <span className="brand-divider" aria-hidden="true" />
            <div className="institution-brand">
              <Image src="/itslogo.png" alt="Logo Institut Teknologi Sepuluh Nopember" width={40} height={40} priority />
              <span><strong>Institut Teknologi Sepuluh Nopember</strong><small>PROYEK KULIAH</small></span>
            </div>
          </div>
          <div className="topbar-actions">
            <div className={`connection-pill ${connection === "online" && deviceOnline ? "is-online" : connection === "preview" ? "is-preview" : "is-offline"}`}>
              <span className="connection-dot" />
              {connection === "preview" ? "Mode preview" : connection === "loading" ? "Menghubungkan" : connection === "online" && deviceOnline ? "Perangkat aktif" : "Perangkat offline"}
            </div>
            <div className="topbar-divider" />
            <span className="topbar-date"><Icon name="clock" size={16} /> {new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short" }).format(new Date(now))}</span>
          </div>
        </header>

        <div className="page-body">
          {!isConfigured && <div className="preview-banner"><span><Icon name="activity" size={16} /> Pratinjau interaktif</span><p>Menampilkan data simulasi. Atur <code>NEXT_PUBLIC_SUPABASE_URL</code> dan <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> untuk menghubungkan database.</p><button onClick={loadReadings} aria-label="Muat ulang pratinjau"><Icon name="refresh" size={16} /></button></div>}
          {error && <div className="error-banner" role="alert"><Icon name="warning" size={17} /><span><strong>Koneksi database bermasalah.</strong> {error}</span><button onClick={loadReadings}>Coba lagi</button></div>}

          <div className="page-heading">
            <div><div className="eyebrow"><span className="eyebrow-line" /> SISTEM PEMANTAUAN AIR</div><h1>Selamat pagi <span className="wave">✦</span></h1><p>Berikut kondisi air toren Anda saat ini.</p></div>
            <div className="heading-actions">
              <span className="updated-at">{lastUpdated ? `Diperbarui ${formatTime(lastUpdated.toISOString())}` : "Menyiapkan data..."}</span>
              <button className={`button button-secondary ${refreshing ? "is-refreshing" : ""}`} onClick={() => void loadReadings()} disabled={refreshing}><Icon name="refresh" size={16} /> Segarkan</button>
              <button className="button button-primary" onClick={exportCsv} disabled={!readings.length}><Icon name="download" size={16} /> Ekspor data</button>
            </div>
          </div>

          <section className="hero-card" id="quality">
            <div className="hero-text">
              <div className="hero-kicker"><span className="pulse-dot" /> KONDISI AIR SAAT INI</div>
              <h2>{latest?.status ?? "Menunggu data"}</h2>
              <p>{latest?.status === "Jernih" ? "Kualitas air dalam kondisi baik dan jernih." : latest?.status === "Keruh" ? "Perlu perhatian — kekeruhan melewati ambang batas." : latest ? "Air sedikit keruh. Tetap pantau kualitasnya." : "Pembacaan terbaru akan muncul di sini."}</p>
              <div className="hero-metrics">
                <div><span className="hero-metric-icon"><Icon name="activity" size={16} /></span><span>Sensor</span><strong>{connection === "preview" ? "Pratinjau" : deviceOnline ? "Terhubung" : "Terputus"}</strong></div>
                <div><span className="hero-metric-icon"><Icon name="clock" size={16} /></span><span>Pembacaan</span><strong>{latest ? formatTime(latest.created_at) : "—"}</strong></div>
              </div>
            </div>
            <div className="hero-visual">
              <DigitalTwinTank status={latest?.status ?? "Jernih"} />
              <div className="hero-reading">
                <div className="reading-label">TINGKAT KEKERUHAN</div>
                <div className="ntu-value">{latest ? latest.ntu.toFixed(1) : "—"}<span>NTU</span></div>
                <div className="reading-scale"><span>0</span><div className="scale-track"><div className="scale-fill" style={{ width: `${Math.min(100, ((latest?.ntu ?? 0) / 40) * 100)}%`, background: statusColor }} /><i className="scale-tick tick-one" /><i className="scale-tick tick-two" /></div><span>40+</span></div>
                <div className="scale-legend"><span><i className="legend-dot clear" />Jernih &lt; 3</span><span><i className="legend-dot murky" />Keruh &gt; 25</span></div>
              </div>
            </div>
            <div className="hero-bottom-note"><Icon name="check" size={14} /> Standar kualitas air rumah tangga</div>
          </section>

          <section className="stat-grid" aria-label="Statistik kualitas air">
            <article className="stat-card">
              <div className="stat-top"><span className="stat-icon turquoise"><Icon name="activity" /></span><span className="stat-caption">PEMBACAAN TERAKHIR</span><span className="stat-more">···</span></div>
              <div className="stat-value">{latest ? latest.ntu.toFixed(1) : "—"} <small>NTU</small></div>
              <div className="stat-foot"><span className="status-tag" style={{ color: statusColor, background: `${statusColor}16` }}><i />{latest?.status ?? "Belum tersedia"}</span><span className="stat-muted">dari sensor</span></div>
            </article>
            <article className="stat-card">
              <div className="stat-top"><span className="stat-icon blue"><Icon name="chart" /></span><span className="stat-caption">RATA-RATA PEMBACAAN</span><span className="stat-more">···</span></div>
              <div className="stat-value">{readings.length ? average.toFixed(1) : "—"} <small>NTU</small></div>
              <div className="stat-foot"><span className="stat-neutral"><Icon name="clock" size={13} /> 24 jam terakhir</span><span className="stat-muted">{readings.length} data</span></div>
            </article>
            <article className="stat-card">
              <div className="stat-top"><span className="stat-icon green"><Icon name="check" /></span><span className="stat-caption">KONDISI JERNIH</span><span className="stat-more">···</span></div>
              <div className="stat-value">{readings.length ? clearPercentage : 0}<small>%</small></div>
              <div className="stat-foot"><div className="mini-progress"><span style={{ width: `${clearPercentage}%` }} /></div><span className="stat-muted">dari {readings.length} pembacaan</span></div>
            </article>
            <article className="stat-card">
              <div className="stat-top"><span className={`stat-icon ${deviceOnline ? "green" : "amber"}`}><Icon name={deviceOnline ? "wifi" : "warning"} /></span><span className="stat-caption">STATUS PERANGKAT</span><span className="stat-more">···</span></div>
              <div className="stat-device">{deviceOnline ? "Online" : "Offline"}<span className={`device-status-dot ${deviceOnline ? "good" : "bad"}`} /></div>
              <div className="stat-foot"><span className="stat-muted">{latest ? `Data terakhir ${formatTime(latest.created_at)}` : "Menunggu koneksi sensor"}</span></div>
            </article>
          </section>

          <div className="dashboard-grid">
            <section className="panel chart-panel">
              <div className="panel-header">
                <div><div className="panel-title-row"><h3>Tren kekeruhan</h3><span className="live-tag"><span /> LIVE</span></div><p>Perubahan kadar NTU dari waktu ke waktu</p></div>
                <div className="range-switch" aria-label="Rentang waktu grafik">{(["1H", "6H", "24H", "7D"] as Range[]).map((item) => <button key={item} onClick={() => setRange(item)} className={range === item ? "selected" : ""} aria-pressed={range === item}>{item}</button>)}</div>
              </div>
              <TrendChart readings={shownReadings} range={range} />
              <div className="chart-legend"><span><i className="chart-legend-line" /> Tingkat kekeruhan</span><span><i className="chart-legend-dash" /> Ambang jernih · 3 NTU</span></div>
            </section>

            <section className="panel threshold-panel">
              <div className="panel-header"><div><h3>Ambang kualitas</h3><p>Panduan tingkat kekeruhan air</p></div><button className="icon-button panel-menu" aria-label="Opsi ambang"><span>···</span></button></div>
              <div className="threshold-list">
                <div className="threshold-item"><span className="threshold-icon threshold-clear"><Icon name="check" size={16} /></span><div className="threshold-info"><strong>Jernih</strong><span>Air dalam kondisi baik</span></div><span className="threshold-range">&lt; 3 <small>NTU</small></span></div>
                <div className="threshold-item"><span className="threshold-icon threshold-mid"><Icon name="activity" size={16} /></span><div className="threshold-info"><strong>Agak keruh</strong><span>Pantau secara berkala</span></div><span className="threshold-range">3 – 25 <small>NTU</small></span></div>
                <div className="threshold-item"><span className="threshold-icon threshold-high"><Icon name="warning" size={16} /></span><div className="threshold-info"><strong>Keruh</strong><span>Perlu pemeriksaan</span></div><span className="threshold-range">&gt; 25 <small>NTU</small></span></div>
              </div>
            </section>
          </div>

          <section className="panel history-panel" id="history">
            <div className="panel-header history-header"><div><h3>Riwayat pembacaan</h3><p>Data sensor terbaru yang tercatat</p></div><button className="text-button" onClick={exportCsv}>Unduh semua <Icon name="arrow" size={14} /></button></div>
            <div className="table-scroll"><table><thead><tr><th>WAKTU</th><th>TINGKAT NTU</th><th>ADC RAW</th><th>TEGANGAN</th><th>STATUS AIR</th><th /></tr></thead>
              <tbody>{readings.slice(0, 5).map((reading) => <tr key={reading.id}><td><span className="table-time">{formatTime(reading.created_at, true)}</span></td><td><strong className="table-ntu">{reading.ntu.toFixed(1)} <small>NTU</small></strong></td><td className="table-secondary">{reading.adc_raw}</td><td className="table-secondary">{reading.voltage.toFixed(2)} V</td><td><span className="table-status" style={{ color: COLORS[reading.status] ?? COLORS[getStatus(reading.ntu)], background: `${COLORS[reading.status] ?? COLORS[getStatus(reading.ntu)]}16` }}><i />{reading.status}</span></td><td><button className="row-menu" aria-label={`Opsi pembacaan ${formatTime(reading.created_at)}`}>···</button></td></tr>)}</tbody>
            </table>{readings.length === 0 && <div className="table-empty">Belum ada pembacaan yang tersedia.</div>}</div>
            <div className="table-footer"><span>Menampilkan <strong>{Math.min(5, readings.length)}</strong> dari <strong>{readings.length}</strong> pembacaan</span><span className="auto-refresh"><span /> Pembaruan otomatis aktif</span></div>
          </section>

          <footer className="footer"><span>© 2026 Toren Guard <i /> Sistem Pemantauan Kualitas Air Toren</span><span>Dibuat untuk memenuhi tugas mata kuliah</span></footer>
        </div>
      </section>
    </main>
  );
}
