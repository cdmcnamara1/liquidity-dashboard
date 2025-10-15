import React, { useEffect, useMemo, useState } from "react";

/* ==================== CONFIG ==================== */
const DEFAULT_FRED_KEY =
  import.meta.env.VITE_FRED_API_KEY || "4d7f73d268ae4c1f10e48a4a17203b0f";

const FRED_SERIES = {
  M2SL: "M2SL",          // Liquidity (monthly)
  PROD: "OPHNFB",        // Productivity (quarterly)
  GDP_REAL: "GDPC1",     // GDP (quarterly)
  CPI: "CPIAUCSL",       // CPI (monthly)
  DGS10: "DGS10",        // 10-year yield (daily)
  FEDFUNDS: "FEDFUNDS",  // Fed Funds (monthly)
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
  const last = parseFloat(obs.at(-1).value);
  const prev = parseFloat(obs.at(-13).value);
  if (!isFinite(last) || !isFinite(prev) || prev === 0) return null;
  return ((last - prev) / prev) * 100;
}
function latestNum(obs) {
  if (!obs || !obs.length) return null;
  for (let i = obs.length - 1; i >= 0; i--) {
    const v = parseFloat(obs[i].value);
    if (isFinite(v)) return v;
  }
  return null;
}

/* ==================== DATA PROXIES ==================== */
async function fred(series, key, params = {}) {
  const qs = new URLSearchParams({ series_id: series, api_key: key, file_type: "json", ...params });
  const res = await fetch(`/api/fred?${qs}`);
  if (!res.ok) throw new Error(`FRED ${series} ${res.status}`);
  const j = await res.json();
  return j.observations || [];
}
async function coingeckoBTC() {
  const r = await fetch("/api/coingecko");
  if (!r.ok) throw new Error(`CoinGecko ${r.status}`);
  const j = await r.json();
  return j.bitcoin?.usd ?? j.market_data?.current_price?.usd ?? null;
}

/* ==================== UI BITS ==================== */
function Card({ children, style }) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 10,
        padding: 10,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/* --- Mini sparkline (no deps) --- */
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

/* --- Horizontal bar for tide/wave/floor strength --- */
function TideBar({ label, value, tooltip }) {
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
            width: `${value * 100}%`,
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

/* ==================== MAIN APP ==================== */
export default function App() {
  const [apiKey] = useState(localStorage.getItem("FRED_API_KEY") || DEFAULT_FRED_KEY);
  const [series, setSeries] = useState({});
  const [btc, setBtc] = useState(null);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [loading, setLoading] = useState(false);

  async function loadAll() {
    setError(null);
    setLoading(true);
    try {
      const [m2, prod, gdp, cpi, dgs10, fed, btcp] = await Promise.all([
        fred(FRED_SERIES.M2SL, apiKey, { observation_start: "2010-01-01" }),
        fred(FRED_SERIES.PROD, apiKey, { observation_start: "2010-01-01" }),
        fred(FRED_SERIES.GDP_REAL, apiKey, { observation_start: "2010-01-01" }),
        fred(FRED_SERIES.CPI, apiKey, { observation_start: "2010-01-01" }),
        fred(FRED_SERIES.DGS10, apiKey, { observation_start: "2010-01-01" }),
        fred(FRED_SERIES.FEDFUNDS, apiKey, { observation_start: "2010-01-01" }),
        coingeckoBTC(),
      ]);
      setSeries({ M2SL: m2, PROD: prod, GDP_REAL: gdp, CPI: cpi, DGS10: dgs10, FEDFUNDS: fed });
      setBtc(btcp);
      setLastUpdated(new Date().toLocaleString());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!localStorage.getItem("FRED_API_KEY")) localStorage.setItem("FRED_API_KEY", DEFAULT_FRED_KEY);
    loadAll();
  }, []);

  /* ==================== METRICS ==================== */
  const metrics = useMemo(() => {
    const M2_yoy = yoy(series.M2SL);
    const GDP_yoy = yoy(series.GDP_REAL);
    const CPI_yoy = yoy(series.CPI);
    const PROD_yoy = yoy(series.PROD);
    const dgs10 = latestNum(series.DGS10);
    const fed = latestNum(series.FEDFUNDS);
    const btc_price = btc;

    const realRate = dgs10 != null && CPI_yoy != null ? dgs10 - CPI_yoy : null;
    const policyGap = fed != null && CPI_yoy != null ? fed - CPI_yoy : null;
    const realGrowth = GDP_yoy != null && CPI_yoy != null ? GDP_yoy - CPI_yoy : null;

    /* === Tides / Waves / Seafloor scores === */
    const tidesScore =
      0.6 * normalize(M2_yoy, { low: -5, high: 10 }) +
      0.4 * normalize(-realRate, { low: -3, high: 3 });

    const wavesScore =
      0.5 * normalize(realGrowth, { low: -5, high: 5 }) +
      0.5 * normalize(-policyGap, { low: -5, high: 5 });

    const seafloorScore = normalize(PROD_yoy, { low: -2, high: 4 });

    const compositeDepth =
      0.5 * tidesScore + 0.35 * wavesScore + 0.15 * seafloorScore;

    const regime =
      compositeDepth >= 0.7
        ? "Risk-On"
        : compositeDepth >= 0.4
        ? "Neutral"
        : "Risk-Off";

    const current =
      tidesScore > 0.5 && wavesScore > 0.5
        ? "Rising Tide"
        : tidesScore > 0.5 && wavesScore < 0.5
        ? "Tide Rising / Waves Fading"
        : tidesScore < 0.5 && wavesScore > 0.5
        ? "Short-Term Rebound"
        : "Ebb Tide";

    const narrative = `
Liquidity ${pct(M2_yoy)}, real growth ${pct(realGrowth)}, productivity ${pct(
      PROD_yoy
    )}. Real rate ${fmt2.format(realRate ?? 0)}%. Policy gap ${fmt2.format(
      policyGap ?? 0
    )}.
Tides ${tidesScore > 0.5 ? "rising" : "falling"}, waves ${
      wavesScore > 0.5 ? "supportive" : "muted"
    }, seafloor ${seafloorScore > 0.5 ? "stable" : "soft"}.
Market current: ${current}.
    `;

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
      tidesScore,
      wavesScore,
      seafloorScore,
      compositeDepth,
      regime,
      current,
      narrative,
    };
  }, [series, btc]);

  /* ==================== UI ==================== */
  const prefersDark =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  const bg = prefersDark ? "#1f1f1f" : "#fff";
  const text = prefersDark ? "#f3f4f6" : "#111";

  return (
    <div
      style={{
        fontFamily: "system-ui",
        padding: 24,
        maxWidth: 800,
        margin: "0 auto",
        color: text,
        background: bg,
        transition: "background .3s,color .3s",
      }}
    >
      <h1 style={{ fontSize: "1.4rem", marginBottom: 8 }}>
        Liquidity–Fundamentals Dashboard
      </h1>
      <button
        onClick={loadAll}
        style={{
          marginBottom: 10,
          padding: "6px 12px",
          borderRadius: 6,
          border: "1px solid #ccc",
          cursor: "pointer",
          background: prefersDark ? "#2a2a2a" : "#fafafa",
          color: text,
        }}
      >
        {loading ? "Refreshing…" : "Refresh"}
      </button>

      {lastUpdated && (
        <div style={{ fontSize: 12, color: "#777", marginBottom: 10 }}>
          Last updated: {lastUpdated}
        </div>
      )}

      {error && (
        <div
          style={{
            color: "#7f1d1d",
            marginBottom: 12,
            background: "#fee2e2",
            padding: 8,
            borderRadius: 8,
            border: "1px solid #fca5a5",
          }}
        >
          {error}
        </div>
      )}

      {/* === Tides / Waves / Seafloor Bars === */}
      <Card style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 13, color: "#555", marginBottom: 4 }}>
          Ocean Depth Forces
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <TideBar
            label="🌊 Tides"
            value={metrics.tidesScore}
            tooltip="Long-term liquidity & real-rate driver"
          />
          <TideBar
            label="🌬 Waves"
            value={metrics.wavesScore}
            tooltip="Cyclical policy & growth impulse"
          />
          <TideBar
            label="🪨 Seafloor"
            value={metrics.seafloorScore}
            tooltip="Structural productivity foundation"
          />
        </div>
      </Card>

      {/* === Summary metrics === */}
      <Card>
        <div style={{ fontSize: 13, color: "#555", marginBottom: 4 }}>
          Composite Current
        </div>
        <div
          style={{
            fontWeight: 700,
            fontSize: 16,
            color:
              metrics.compositeDepth > 0.7
                ? "#16a34a"
                : metrics.compositeDepth > 0.4
                ? "#f59e0b"
                : "#dc2626",
          }}
        >
          {metrics.regime} — {metrics.current} (Score{" "}
          {fmt2.format(metrics.compositeDepth)})
        </div>
      </Card>

      {/* === Core indicators === */}
      <div
        style={{
          display: "grid",
          gap: 10,
          marginTop: 10,
          background: prefersDark ? "#111" : "#f8f9fa",
          padding: 12,
          borderRadius: 10,
          border: "1px solid #e5e7eb",
        }}
      >
        <Metric label="M2 YoY" value={metrics.M2_yoy} />
        <Metric label="GDP YoY" value={metrics.GDP_yoy} />
        <Metric label="CPI YoY" value={metrics.CPI_yoy} />
        <Metric label="Productivity YoY" value={metrics.PROD_yoy} />
        <Card>
          <div style={{ fontSize: 13, color: "#555", marginBottom: 2 }}>
            10Y / Fed Funds / Real Rate
          </div>
          <div style={{ fontSize: 14 }}>
            {fmt2.format(metrics.dgs10 ?? 0)}% / {fmt2.format(metrics.fed ?? 0)}%
            / {fmt2.format(metrics.realRate ?? 0)}%
          </div>
        </Card>
        <Metric label="Bitcoin Price (USD)" value={metrics.btc_price} isPrice />
      </div>

      {/* === Narrative === */}
      <div style={{ marginTop: 14 }}>
        <Card>
          <div style={{ fontSize: 13, color: "#555", marginBottom: 6 }}>
            Investor Narrative
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.4 }}>
            {metrics.narrative}
          </div>
        </Card>
      </div>

      {/* === Export === */}
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
      </button>
    </div>
  );
}






