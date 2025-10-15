import React, { useEffect, useMemo, useState } from "react";

/* ==================== CONFIG ==================== */
const DEFAULT_FRED_KEY =
  import.meta.env.VITE_FRED_API_KEY || "4d7f73d268ae4c1f10e48a4a17203b0f";

const FRED_SERIES = {
  M2SL: "M2SL",
  PROD: "OPHNFB",
  GDP_REAL: "GDPC1",
  CPI: "CPIAUCSL",
  DGS10: "DGS10",
  FEDFUNDS: "FEDFUNDS",
};

const fmt2 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
const fmt0 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const pct = (v) => (v == null ? "—" : `${fmt2.format(v)}%`);
const money0 = (v) => (v == null ? "—" : `$${fmt0.format(v)}`);
const clamp01 = (n) => Math.max(0, Math.min(1, n));
const normalize = (v, { low, high }) =>
  v == null ? 0.5 : clamp01((v - low) / (high - low));
const arrow = (v) => (v == null ? "" : v > 0 ? "↑" : v < 0 ? "↓" : "→");

/* ==================== HELPERS ==================== */
function yoy(obs) {
  if (!obs || obs.length < 13) return null;
  const last = parseFloat(obs.at(-1)?.value);
  const prev = parseFloat(obs.at(-13)?.value);
  if (!isFinite(last) || !isFinite(prev) || prev === 0) return null;
  return ((last - prev) / prev) * 100;
}
function latestNum(obs) {
  if (!obs || !obs.length) return null;
  for (let i = obs.length - 1; i >= 0; i--) {
    const v = parseFloat(obs[i]?.value);
    if (isFinite(v)) return v;
  }
  return null;
}
function lastN(obs, n = 12) {
  if (!obs) return null;
  return obs
    .slice(-n)
    .map((o) => parseFloat(o.value))
    .filter((v) => isFinite(v));
}

/* ==================== HARDENED DATA FETCH ==================== */
async function safeJsonFetch(url, label) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${label} HTTP ${res.status}`);
    const text = await res.text();
    if (text.trim().startsWith("<")) {
      throw new Error(`${label} returned HTML`);
    }
    const json = JSON.parse(text);
    return json;
  } catch (err) {
    console.error(`${label} fetch error:`, err.message);
    return null;
  }
}
async function fred(id, key, params = {}) {
  const q = new URLSearchParams({
    series_id: id,
    api_key: key,
    file_type: "json",
    ...params,
  });
  const url = `/api/fred?${q}`;
  const j = await safeJsonFetch(url, `FRED ${id}`);
  return j?.observations || [];
}
async function coingeckoBTC() {
  try {
    const r = await fetch("/api/coingecko");
    const t = await r.text();
    if (t.trim().startsWith("<")) throw new Error("HTML from CoinGecko");
    const j = JSON.parse(t);
    return j.bitcoin?.usd ?? j.market_data?.current_price?.usd ?? null;
  } catch (err) {
    console.error("BTC fetch error:", err.message);
    return null;
  }
}

/* ==================== UI COMPONENTS ==================== */
function Card({ children, style }) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #eee",
        borderRadius: 10,
        padding: 10,
        marginBottom: 8,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
function Bar({ label, value, tooltip }) {
  const color =
    value > 0.66 ? "#16a34a" : value > 0.33 ? "#facc15" : "#dc2626";
  return (
    <div title={tooltip} style={{ flex: 1, textAlign: "center" }}>
      <div
        style={{
          background: "#f3f4f6",
          borderRadius: 8,
          overflow: "hidden",
          height: 8,
        }}
      >
        <div
          style={{
            width: `${(value || 0) * 100}%`,
            height: "100%",
            background: color,
            transition: "width 0.6s ease",
          }}
        />
      </div>
      <div style={{ fontSize: 11, marginTop: 2 }}>{label}</div>
    </div>
  );
}
function Sparkline({ data, color = "#16a34a", width = 100, height = 28 }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data),
    max = Math.max(...data);
  const dx = width / (data.length - 1 || 1);
  const scaleY = (v) =>
    height - ((v - min) / (max - min || 1)) * (height - 2) - 1;
  const pts = data.map((v, i) => `${i * dx},${scaleY(v)}`).join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        points={pts}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
function StatusDot({ ok }) {
  const color = ok ? "#16a34a" : "#facc15";
  return (
    <span
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: color,
        marginRight: 4,
      }}
    />
  );
}
function Metric({ label, value, isPrice = false, trend, ok = true }) {
  const dir = isPrice ? "" : arrow(value);
  const color =
    value == null ? "#666" : isPrice ? "#111" : value > 0 ? "#16a34a" : "#dc2626";
  return (
    <Card>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <div style={{ fontSize: 13, color: "#555", marginBottom: 2 }}>
            <StatusDot ok={ok} />
            {label}
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color }}>
            {value == null
              ? "—"
              : isPrice
              ? money0(value)
              : pct(value)}{" "}
            {dir}
          </div>
        </div>
        {trend && <Sparkline data={trend} color={color} />}
      </div>
    </Card>
  );
}

/* ==================== MAIN ==================== */
export default function App() {
  const [apiKey] = useState(
    localStorage.getItem("FRED_API_KEY") || DEFAULT_FRED_KEY
  );
  const [series, setSeries] = useState({});
  const [btc, setBtc] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [status, setStatus] = useState({});

  async function loadAll() {
    setError(null);
    setLoading(true);
    try {
      const [m2, prod, gdp, cpi, dgs10, fed, btcP] = await Promise.all([
        fred(FRED_SERIES.M2SL, apiKey),
        fred(FRED_SERIES.PROD, apiKey),
        fred(FRED_SERIES.GDP_REAL, apiKey),
        fred(FRED_SERIES.CPI, apiKey),
        fred(FRED_SERIES.DGS10, apiKey),
        fred(FRED_SERIES.FEDFUNDS, apiKey),
        coingeckoBTC(),
      ]);
      setSeries({
        M2SL: m2,
        PROD: prod,
        GDP_REAL: gdp,
        CPI: cpi,
        DGS10: dgs10,
        FEDFUNDS: fed,
      });
      setBtc(btcP);
      setStatus({
        M2SL: !!m2.length,
        PROD: !!prod.length,
        GDP_REAL: !!gdp.length,
        CPI: !!cpi.length,
        DGS10: !!dgs10.length,
        FEDFUNDS: !!fed.length,
        BTC: btcP != null,
      });
      setLastUpdated(new Date().toLocaleString());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  const metrics = useMemo(() => {
    if (!series.M2SL || !series.GDP_REAL || !series.CPI || !series.PROD) return null;

    const M2_yoy = yoy(series.M2SL);
    const GDP_yoy = yoy(series.GDP_REAL);
    const CPI_yoy = yoy(series.CPI);
    const PROD_yoy = yoy(series.PROD);
    const dgs10 = latestNum(series.DGS10);
    const fed = latestNum(series.FEDFUNDS);
    const btc_price = btc;

    const realRate = dgs10 && CPI_yoy ? dgs10 - CPI_yoy : 0;
    const policyGap = fed && CPI_yoy ? fed - CPI_yoy : 0;
    const realGrowth = GDP_yoy && CPI_yoy ? GDP_yoy - CPI_yoy : 0;

    const tides =
      0.6 * normalize(M2_yoy, { low: -5, high: 10 }) +
      0.4 * normalize(-realRate, { low: -3, high: 3 });
    const waves =
      0.5 * normalize(realGrowth, { low: -5, high: 5 }) +
      0.5 * normalize(-policyGap, { low: -5, high: 5 });
    const seafloor = normalize(PROD_yoy, { low: -2, high: 4 });
    const composite = 0.5 * tides + 0.35 * waves + 0.15 * seafloor;

    const regime =
      composite >= 0.7 ? "Risk-On" : composite >= 0.4 ? "Neutral" : "Risk-Off";
    const current =
      tides > 0.5 && waves > 0.5
        ? "Rising Tide"
        : tides > 0.5 && waves < 0.5
        ? "Tide Rising / Waves Fading"
        : tides < 0.5 && waves > 0.5
        ? "Short-Term Rebound"
        : "Ebb Tide";

    return {
      M2_yoy,
      GDP_yoy,
      CPI_yoy,
      PROD_yoy,
      dgs10,
      fed,
      btc_price,
      realRate,
      policyGap,
      realGrowth,
      tides,
      waves,
      seafloor,
      composite,
      regime,
      current,
      M2_trend: lastN(series.M2SL),
      GDP_trend: lastN(series.GDP_REAL),
      CPI_trend: lastN(series.CPI),
      PROD_trend: lastN(series.PROD),
    };
  }, [series, btc]);

  const prefersDark =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  const bg = prefersDark ? "#1f1f1f" : "#fff";
  const text = prefersDark ? "#f3f4f6" : "#111";

  if (loading)
    return (
      <div style={{ padding: 50, fontFamily: "system-ui" }}>Loading data...</div>
    );
  if (error)
    return (
      <div style={{ padding: 50, color: "red", fontFamily: "system-ui" }}>
        {error}
      </div>
    );
  if (!metrics)
    return (
      <div style={{ padding: 50, fontFamily: "system-ui" }}>
        Waiting for data...
      </div>
    );

  /* ==================== RENDER ==================== */
  return (
    <div
      style={{
        fontFamily: "system-ui",
        padding: 24,
        maxWidth: 900,
        margin: "0 auto",
        color: text,
        background: bg,
      }}
    >
      <h1 style={{ fontSize: "1.4rem", marginBottom: 8 }}>
        Liquidity–Fundamentals Dashboard
      </h1>
      <div style={{ fontSize: 12, color: "#777", marginBottom: 10 }}>
        Last updated: {lastUpdated}
      </div>

      {/* Ocean Depth Bars */}
      <Card>
        <div style={{ fontSize: 13, color: "#555", marginBottom: 4 }}>
          Ocean Depth Forces
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <Bar
            label="🌊 Tides"
            value={metrics.tides}
            tooltip="Liquidity & real-rate trend"
          />
          <Bar
            label="🌬 Waves"
            value={metrics.waves}
            tooltip="Cyclical policy & growth impulse"
          />
          <Bar
            label="🪨 Seafloor"
            value={metrics.seafloor}
            tooltip="Structural productivity foundation"
          />
        </div>
      </Card>

      {/* Regime */}
      <Card>
        <div style={{ fontSize: 13, color: "#555", marginBottom: 4 }}>
          Market Current
        </div>
        <div style={{ fontSize: 16, fontWeight: 700 }}>
          {metrics.regime} — {metrics.current} (Score{" "}
          {fmt2.format(metrics.composite)})
        </div>
      </Card>

      {/* Core Indicators */}
      <div
        style={{
          display: "grid",
          gap: 10,
          background: prefersDark ? "#111" : "#f8f9fa",
          padding: 12,
          borderRadius: 10,
          border: "1px solid #e5e7eb",
        }}
      >
        <Metric
          label="M2 YoY"
          value={metrics.M2_yoy}
          trend={metrics.M2_trend}
          ok={status.M2SL}
        />
        <Metric
          label="GDP YoY"
          value={metrics.GDP_yoy}
          trend={metrics.GDP_trend}
          ok={status.GDP_REAL}
        />
        <Metric
          label="CPI YoY"
          value={metrics.CPI_yoy}
          trend={metrics.CPI_trend}
          ok={status.CPI}
        />
        <Metric
          label="Productivity YoY"
          value={metrics.PROD_yoy}
          trend={metrics.PROD_trend}
          ok={status.PROD}
        />
        <Card>
          <div style={{ fontSize: 13, color: "#555", marginBottom: 2 }}>
            10Y / Fed Funds / Real Rate
          </div>
          <div style={{ fontSize: 14 }}>
            {fmt2.format(metrics.dgs10 ?? 0)}% /{" "}
            {fmt2.format(metrics.fed ?? 0)}% /{" "}
            {fmt2.format(metrics.realRate ?? 0)}%
          </div>
        </Card>
        <Metric
          label="Bitcoin Price (USD)"
          value={metrics.btc_price}
          isPrice
          ok={status.BTC}
        />
      </div>

      {/* Narrative */}
      <Card>
        <div style={{ fontSize: 13, color: "#555", marginBottom: 6 }}>
          Investor Narrative
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.4 }}>
          Liquidity {pct(metrics.M2_yoy)}, growth {pct(metrics.GDP_yoy)}, inflation{" "}
          {pct(metrics.CPI_yoy)}, productivity {pct(metrics.PROD_yoy)}. <br />
          Real rate {fmt2.format(metrics.realRate)}%, policy gap{" "}
          {fmt2.format(metrics.policyGap)}%. <br />
          Tides {metrics.tides > 0.5 ? "rising" : "falling"}, waves{" "}
          {metrics.waves > 0.5 ? "supportive" : "muted"}, seafloor{" "}
          {metrics.seafloor > 0.5 ? "stable" : "soft"}.
        </div>
      </Card>

      {/* Export */}
      <button
        onClick={() => window.print()}
        style={{
          marginTop: 12,
          padding: "6px 12px",
          borderRadius: 6,
          border: "1px solid #ccc",
          cursor: "pointer",
          background: prefersDark ? "#2a2a2a" : "#fafafa",
          color: text,
        }}
      >
        Export / Print PDF
     









