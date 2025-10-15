// trigger redeploy to include /api routes

import React, { useEffect, useMemo, useState } from "react";

// --- Configuration ---
const DEFAULT_WEIGHTS = { liquidity: 0.5, fundamentals: 0.3, bitcoin: 0.2 };
const DEFAULT_FRED_KEY =
  import.meta.env.VITE_FRED_API_KEY || "4d7f73d268ae4c1f10e48a4a17203b0f";

const FRED_SERIES = {
  M2SL: "M2SL",
  RRP: "RRPONTSYD",
  DXY: "DTWEXBGS",
  TIPS10: "DFII10",
  VIX: "VIXCLS",
  PROD: "OPHNFB",
  GDP_REAL: "GDPC1",
  DEBT: "GFDEBTN",
};

// --- Helpers ---
const fmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
const pct = (v) => (v == null ? "—" : `${fmt.format(v)}%`);
const arrow = (v) =>
  v == null ? "" : v > 0 ? "↑" : v < 0 ? "↓" : "→";

// --- Data Functions ---
function yoy(obs) {
  if (!obs || obs.length < 13) return null;
  const last = parseFloat(obs[obs.length - 1].value);
  const prev = parseFloat(obs[obs.length - 13].value);
  if (!isFinite(last) || !isFinite(prev) || prev === 0) return null;
  return ((last - prev) / prev) * 100;
}

// FRED fetch via your Vercel proxy
async function fredObservations(seriesId, apiKey, params = {}) {
  const search = new URLSearchParams({
    series_id: seriesId,
    api_key: apiKey,
    file_type: "json",
    ...params,
  });
  const url = `/api/fred?${search.toString()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`FRED ${seriesId} HTTP ${res.status}`);
  const json = await res.json();
  return json?.observations || [];
}

// CoinGecko via your proxy
async function coingeckoBTC() {
  const res = await fetch("/api/coingecko");
  if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
  return res.json();
}

// --- Main Component ---
export default function App() {
  const [apiKey, setApiKey] = useState(
    localStorage.getItem("FRED_API_KEY") || DEFAULT_FRED_KEY
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [series, setSeries] = useState({});
  const [btc, setBtc] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  // Load all datasets
  async function loadAll() {
    setError(null);
    if (!apiKey) return setError("Missing FRED key");
    setLoading(true);
    try {
      const [m2, prod, gdp] = await Promise.all([
        fredObservations(FRED_SERIES.M2SL, apiKey, {
          observation_start: "2010-01-01",
        }),
        fredObservations(FRED_SERIES.PROD, apiKey, {
          observation_start: "2010-01-01",
        }),
        fredObservations(FRED_SERIES.GDP_REAL, apiKey, {
          observation_start: "2010-01-01",
        }),
      ]);
      const btcJson = await coingeckoBTC();
      setSeries({ M2SL: m2, PROD: prod, GDP_REAL: gdp });
      setBtc(btcJson);
      setLastUpdated(new Date().toLocaleString());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!localStorage.getItem("FRED_API_KEY"))
      localStorage.setItem("FRED_API_KEY", DEFAULT_FRED_KEY);
    loadAll();
  }, []);

  // Compute metrics
  const metrics = useMemo(() => {
    const M2_yoy = series.M2SL ? yoy(series.M2SL) : null;
    const GDP_yoy = series.GDP_REAL ? yoy(series.GDP_REAL) : null;
    const PROD_yoy = series.PROD ? yoy(series.PROD) : null;
    const btc_price = btc?.market_data?.current_price?.usd ?? null;
    return { M2_yoy, GDP_yoy, PROD_yoy, btc_price };
  }, [series, btc]);

  // --- UI ---
  return (
    <div
      style={{
        fontFamily: "system-ui",
        padding: 24,
        maxWidth: 600,
        margin: "0 auto",
        color: "#111",
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
        }}
      >
        {loading ? "Refreshing…" : "Refresh"}
      </button>

      {lastUpdated && (
        <div
          style={{
            fontSize: 12,
            color: "#555",
            marginBottom: 10,
          }}
        >
          Last updated: {lastUpdated}
        </div>
      )}

      {error && (
        <div
          style={{
            color: "red",
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

      <div
        style={{
          display: "grid",
          gap: 10,
          background: "#f8f9fa",
          padding: 12,
          borderRadius: 10,
          border: "1px solid #e5e7eb",
        }}
      >
        <Metric label="M2 YoY" value={metrics.M2_yoy} />
        <Metric label="GDP YoY" value={metrics.GDP_yoy} />
        <Metric label="Productivity YoY" value={metrics.PROD_yoy} />
        <Metric
          label="Bitcoin Price"
          value={
            metrics.btc_price ? `$${fmt.format(metrics.btc_price)}` : "—"
          }
        />
      </div>
    </div>
  );
}

// --- Small metric subcomponent ---
function Metric({ label, value }) {
  const dir = arrow(value);
  const color =
    value == null
      ? "#666"
      : value > 0
      ? "#16a34a"
      : value < 0
      ? "#dc2626"
      : "#111";
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #eee",
        borderRadius: 8,
        padding: "8px 10px",
      }}
    >
      <div
        style={{
          fontSize: 13,
          color: "#555",
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 18,
          fontWeight: 600,
          color,
        }}
      >
        {value == null ? "—" : pct(value)} {dir}
      </div>
    </div>
  );
}

