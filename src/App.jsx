import React, { useEffect, useMemo, useState } from "react";

// Default weights and API key (reads securely from environment)
const DEFAULT_WEIGHTS = { liquidity: 0.5, fundamentals: 0.3, bitcoin: 0.2 };
const DEFAULT_FRED_KEY =
  import.meta.env.VITE_FRED_API_KEY || "4d7f73d268ae4c1f10e48a4a17203b0f";

// FRED series codes
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

// Utility helpers
const fmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
const pct = (v) => (v == null ? "—" : `${fmt.format(v)}%`);
const clamp01 = (n) => Math.max(0, Math.min(1, n));
const trendArrow = (v) => (v == null ? "" : v > 0 ? "↑" : v < 0 ? "↓" : "→");

// Year-over-year change
function yoy(obs) {
  if (!obs || obs.length < 13) return null;
  const last = parseFloat(obs[obs.length - 1].value);
  const prev = parseFloat(obs[obs.length - 13].value);
  if (!isFinite(last) || !isFinite(prev) || prev === 0) return null;
  return ((last - prev) / prev) * 100;
}

// 3-month delta
function delta3m(obs) {
  if (!obs || obs.length < 2) return null;
  const last = parseFloat(obs[obs.length - 1].value);
  const idx = Math.max(0, obs.length - 1 - Math.min(60, obs.length - 1));
  const prev = parseFloat(obs[idx].value);
  if (!isFinite(last) || !isFinite(prev)) return null;
  return last - prev;
}

// ✅ FRED fetch function using your own serverless proxy
async function fredObservations(seriesId, apiKey, params = {}) {
  const search = new URLSearchParams({
    series_id: seriesId,
    api_key: apiKey,
    file_type: "json",
    ...params,
  });

  // Call your own Vercel API endpoint (no CORS issues)
  const url = `/api/fred?${search.toString()}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`FRED ${seriesId} HTTP ${res.status}`);
    const json = await res.json();
    return json?.observations || [];
  } catch (err) {
    console.error("FRED fetch error:", err);
    throw err;
  }
}

// CoinGecko Bitcoin data fetch
async function coingeckoBTC() {
  const res = await fetch("/api/coingecko");
  if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
  return res.json();
}

// ----------------------------------------------------------

export default function App() {
  const [apiKey, setApiKey] = useState(
    localStorage.getItem("FRED_API_KEY") || DEFAULT_FRED_KEY
  );
  const [weights, setWeights] = useState(DEFAULT_WEIGHTS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [series, setSeries] = useState({});
  const [btc, setBtc] = useState(null);

  async function loadAll() {
    setError(null);
    if (!apiKey) return setError("Missing FRED key");
    setLoading(true);
    try {
      const [m2, rrp, dxy, tips10, vix, prod, gdp, debt] = await Promise.all([
        fredObservations(FRED_SERIES.M2SL, apiKey, {
          observation_start: "2010-01-01",
        }),
        fredObservations(FRED_SERIES.RRP, apiKey, {
          observation_start: "2020-01-01",
        }),
        fredObservations(FRED_SERIES.DXY, apiKey, {
          observation_start: "2010-01-01",
        }),
        fredObservations(FRED_SERIES.TIPS10, apiKey, {
          observation_start: "2010-01-01",
        }),
        fredObservations(FRED_SERIES.VIX, apiKey, {
          observation_start: "2010-01-01",
        }),
        fredObservations(FRED_SERIES.PROD, apiKey, {
          observation_start: "2010-01-01",
        }),
        fredObservations(FRED_SERIES.GDP_REAL, apiKey, {
          observation_start: "2010-01-01",
        }),
        fredObservations(FRED_SERIES.DEBT, apiKey, {
          observation_start: "2010-01-01",
        }),
      ]);

      const btcJson = await coingeckoBTC();
      setSeries({
        M2SL: m2,
        RRP: rrp,
        DXY: dxy,
        TIPS10: tips10,
        VIX: vix,
        PROD: prod,
        GDP_REAL: gdp,
        DEBT: debt,
      });
      setBtc(btcJson);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  // On mount → set FRED key if missing, then load data
  useEffect(() => {
    if (!localStorage.getItem("FRED_API_KEY"))
      localStorage.setItem("FRED_API_KEY", DEFAULT_FRED_KEY);
    loadAll();
  }, []);

  // Derive metrics
  const metrics = useMemo(() => {
    const M2_yoy = series.M2SL ? yoy(series.M2SL) : null;
    const GDP_yoy = series.GDP_REAL ? yoy(series.GDP_REAL) : null;
    const PROD_yoy = series.PROD ? yoy(series.PROD) : null;
    const btc_price = btc?.market_data?.current_price?.usd ?? null;
    return { M2_yoy, GDP_yoy, PROD_yoy, btc_price };
  }, [series, btc]);

  // ----------------------------------------------------------

  return (
    <div style={{ fontFamily: "system-ui", padding: 24 }}>
      <h1>Liquidity–Fundamentals Dashboard</h1>

      {error && <div style={{ color: "red", marginBottom: 8 }}>{error}</div>}

      <button
        onClick={loadAll}
        style={{
          marginBottom: 12,
          padding: "6px 12px",
          borderRadius: 6,
          border: "1px solid #ccc",
        }}
      >
        {loading ? "Refreshing…" : "Refresh"}
      </button>

      <pre
        style={{
          background: "#f7f7f9",
          borderRadius: 8,
          padding: 12,
          fontSize: 14,
        }}
      >
        {JSON.stringify(metrics, null, 2)}
      </pre>
    </div>
  );
}

