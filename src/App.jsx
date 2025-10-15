import React, { useEffect, useMemo, useState } from "react";

/* ---------------- Config ---------------- */
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
const pct = (v) => (v == null ? "—" : `${fmt2.format(v)}%`);
const clamp01 = (n) => Math.max(0, Math.min(1, n));
const normalize = (v, { low, high }) =>
  v == null ? 0.5 : clamp01((v - low) / (high - low));
const arrow = (v) => (v == null ? "" : v > 0 ? "↑" : v < 0 ? "↓" : "→");

/* ---------------- Helpers ---------------- */
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

/* ---------------- Data Fetch ---------------- */
async function fred(id, key, params = {}) {
  const q = new URLSearchParams({
    series_id: id,
    api_key: key,
    file_type: "json",
    ...params,
  });
  const res = await fetch(`/api/fred?${q}`);
  if (!res.ok) throw new Error(`FRED ${id} HTTP ${res.status}`);
  const j = await res.json();
  return j.observations || [];
}
async function coingeckoBTC() {
  const r = await fetch("/api/coingecko");
  if (!r.ok) throw new Error(`CoinGecko ${r.status}`);
  const j = await r.json();
  return j.bitcoin?.usd ?? j.market_data?.current_price?.usd ?? null;
}

/* ---------------- Small Components ---------------- */
function Card({ children }) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #eee",
        borderRadius: 10,
        padding: 10,
        marginBottom: 8,
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
            transition: "width 0.5s ease",
          }}
        />
      </div>
      <div style={{ fontSize: 11, marginTop: 2 }}>{label}</div>
    </div>
  );
}

/* ---------------- Main App ---------------- */
export default function App() {
  const [apiKey] = useState(
    localStorage.getItem("FRED_API_KEY") || DEFAULT_FRED_KEY
  );
  const [series, setSeries] = useState({});
  const [btc, setBtc] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  async function load() {
    setError(null);
    setLoading(true);
    try {
      const [m2, prod, gdp, cpi, dgs10, fed, btcPrice] = await Promise.all([
        fred(FRED_SERIES.M2SL, apiKey, { observation_start: "2010-01-01" }),
        fred(FRED_SERIES.PROD, apiKey, { observation_start: "2010-01-01" }),
        fred(FRED_SERIES.GDP_REAL, apiKey, { observation_start: "2010-01-01" }),
        fred(FRED_SERIES.CPI, apiKey, { observation_start: "2010-01-01" }),
        fred(FRED_SERIES.DGS10, apiKey, { observation_start: "2010-01-01" }),
        fred(FRED_SERIES.FEDFUNDS, apiKey, { observation_start: "2010-01-01" }),
        coingeckoBTC(),
      ]);
      setSeries({ M2SL: m2, PROD: prod, GDP_REAL: gdp, CPI: cpi, DGS10: dgs10, FEDFUNDS: fed });
      setBtc(btcPrice);
      setLastUpdated(new Date().toLocaleString());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const metrics = useMemo(() => {
    if (
      !series.M2SL ||
      !series.GDP_REAL ||
      !series.CPI ||
      !series.PROD
    )
      return null;

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

    const tides = 0.6 * normalize(M2_yoy, { low: -5, high: 10 }) +
      0.4 * normalize(-realRate, { low: -3, high: 3 });
    const waves = 0.5 * normalize(realGrowth, { low: -5, high: 5 }) +
      0.5 * normalize(-policyGap, { low: -5, high: 5 });
    const seafloor = normalize(PROD_yoy, { low: -2, high: 4 });
    const composite = 0.5 * tides + 0.35 * waves + 0.15 * seafloor;

    const regime = composite >= 0.7 ? "Risk-On" : composite >= 0.4 ? "Neutral" : "Risk-Off";
    const current =
      tides > 0.5 && waves > 0.5
        ? "Rising Tide"
        : tides > 0.5 && waves < 0.5
        ? "Tide Rising / Waves Fading"
        : tides < 0.5 && waves > 0.5
        ? "Short-Term Rebound"
        : "Ebb Tide";

    return {
      M2_yoy, GDP_yoy, CPI_yoy, PROD_yoy,
      dgs10, fed, btc_price,
      realRate, policyGap, realGrowth,
      tides, waves, seafloor, composite,
      regime, current
    };
  }, [series, btc]);

  const prefersDark =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  const bg = prefersDark ? "#1f1f1f" : "#fff";
  const text = prefersDark ? "#f3f4f6" : "#111";

  if (loading) return <div style={{padding:50,fontFamily:"system-ui"}}>Loading data...</div>;
  if (error) return <div style={{padding:50,color:"red"}}>{error}</div>;
  if (!metrics) return <div style={{padding:50}}>No data available.</div>;

  return (
    <div
      style={{
        fontFamily: "system-ui",
        padding: 24,
        maxWidth: 820,
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

      <Card>
        <div style={{ fontSize: 13, color: "#555", marginBottom: 4 }}>
          Ocean Depth Forces
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <Bar label="🌊 Tides" value={metrics.tides} tooltip="Liquidity & real rate trend" />
          <Bar label="🌬 Waves" value={metrics.waves} tooltip="Cyclical growth & policy impulse" />
          <Bar label="🪨 Seafloor" value={metrics.seafloor} tooltip="Structural productivity base" />
        </div>
      </Card>

      <Card>
        <div style={{ fontSize: 13, color: "#555", marginBottom: 4 }}>
          Market Current
        </div>
        <div style={{ fontSize: 16, fontWeight: 700 }}>
          {metrics.regime} — {metrics.current} (Score {fmt2.format(metrics.composite)})
        </div>
      </Card>

      <Card>
        <div style={{ fontSize: 13, color: "#555", marginBottom: 4 }}>
          Investor Narrative
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.4 }}>
          Liquidity {pct(metrics.M2_yoy)}, growth {pct(metrics.GDP_yoy)}, inflation {pct(metrics.CPI_yoy)}, productivity {pct(metrics.PROD_yoy)}.<br />
          Real rate {fmt2.format(metrics.realRate)}%, policy gap {fmt2.format(metrics.policyGap)}%.<br />
          Tides {metrics.tides > 0.5 ? "rising" : "falling"}, waves {metrics.waves > 0.5 ? "supportive" : "muted"}, seafloor {metrics.seafloor > 0.5 ? "stable" : "soft"}.
        </div>
      </Card>
    </div>
  );
}







