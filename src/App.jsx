import React, { useEffect, useMemo, useState } from "react";

const DEFAULT_WEIGHTS = { liquidity: 0.5, fundamentals: 0.3, bitcoin: 0.2 };
const DEFAULT_FRED_KEY = import.meta.env.VITE_FRED_API_KEY || "4d7f73d268ae4c1f10e48a4a17203b0f";

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

const fmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
const pct = (v) => (v == null ? "—" : `${fmt.format(v)}%`);
const clamp01 = (n) => Math.max(0, Math.min(1, n));
const trendArrow = (v) => (v == null ? "" : v > 0 ? "↑" : v < 0 ? "↓" : "→");

function yoy(obs) {
  if (!obs || obs.length < 13) return null;
  const last = parseFloat(obs[obs.length - 1].value);
  const prev = parseFloat(obs[obs.length - 13].value);
  if (!isFinite(last) || !isFinite(prev) || prev === 0) return null;
  return ((last - prev) / prev) * 100;
}

function momentum(obs, lookback = 90) {
  if (!obs || obs.length < 2) return null;
  const last = parseFloat(obs[obs.length - 1].value);
  const idx = Math.max(0, obs.length - 1 - Math.min(lookback, obs.length - 1));
  const prev = parseFloat(obs[idx].value);
  if (!isFinite(last) || !isFinite(prev) || last === 0) return null;
  return ((last - prev) / Math.abs(last)) * 100;
}

function delta3m(obs) {
  if (!obs || obs.length < 2) return null;
  const last = parseFloat(obs[obs.length - 1].value);
  const idx = Math.max(0, obs.length - 1 - Math.min(60, obs.length - 1));
  const prev = parseFloat(obs[idx].value);
  if (!isFinite(last) || !isFinite(prev)) return null;
  return last - prev;
}

function normalize(metric, { goodHigh = true, low = -5, high = 5 } = {}) {
  if (metric == null) return null;
  const t = clamp01((metric - low) / (high - low));
  return goodHigh ? t : 1 - t;
}

async function fredObservations(seriesId, apiKey, params = {}) {
  const search = new URLSearchParams({
    series_id: seriesId,
    api_key: apiKey,
    file_type: "json",
    ...params,
  });

  // Force browser-side fetch through a public CORS proxy
  const url = `https://api.allorigins.win/raw?url=${encodeURIComponent(
    "https://api.stlouisfed.org/fred/series/observations?" + search.toString()
  )}`;

  const res = await fetch(url, { mode: "cors" });
  if (!res.ok) throw new Error(`FRED ${seriesId} HTTP ${res.status}`);
  const json = await res.json();
  return json?.observations || [];
}

async function coingeckoBTC() {
  const url = `https://api.coingecko.com/api/v3/coins/bitcoin?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
  return res.json();
}

export default function App() {
  const [apiKey, setApiKey] = useState(localStorage.getItem("FRED_API_KEY") || DEFAULT_FRED_KEY);
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
        fredObservations(FRED_SERIES.M2SL, apiKey, { observation_start: "2010-01-01" }),
        fredObservations(FRED_SERIES.RRP, apiKey, { observation_start: "2020-01-01" }),
        fredObservations(FRED_SERIES.DXY, apiKey, { observation_start: "2010-01-01" }),
        fredObservations(FRED_SERIES.TIPS10, apiKey, { observation_start: "2010-01-01" }),
        fredObservations(FRED_SERIES.VIX, apiKey, { observation_start: "2010-01-01" }),
        fredObservations(FRED_SERIES.PROD, apiKey, { observation_start: "2010-01-01" }),
        fredObservations(FRED_SERIES.GDP_REAL, apiKey, { observation_start: "2010-01-01" }),
        fredObservations(FRED_SERIES.DEBT, apiKey, { observation_start: "2010-01-01" }),
      ]);
      const btcJson = await coingeckoBTC();
      setSeries({ M2SL: m2, RRP: rrp, DXY: dxy, TIPS10: tips10, VIX: vix, PROD: prod, GDP_REAL: gdp, DEBT: debt });
      setBtc(btcJson);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (!localStorage.getItem("FRED_API_KEY")) localStorage.setItem("FRED_API_KEY", DEFAULT_FRED_KEY); loadAll(); }, []);

  const metrics = useMemo(() => {
    const M2_yoy = series.M2SL ? yoy(series.M2SL) : null;
    const GDP_yoy = series.GDP_REAL ? yoy(series.GDP_REAL) : null;
    const PROD_yoy = series.PROD ? yoy(series.PROD) : null;
    const btc_price = btc?.market_data?.current_price?.usd ?? null;
    return { M2_yoy, GDP_yoy, PROD_yoy, btc_price };
  }, [series, btc]);

  return (
    <div style={{ fontFamily: "system-ui", padding: 24 }}>
      <h1>Liquidity–Fundamentals Dashboard</h1>
      {error && <div style={{ color: "red" }}>{error}</div>}
      <button onClick={loadAll}>{loading ? "Refreshing…" : "Refresh"}</button>
      <pre>{JSON.stringify(metrics, null, 2)}</pre>
    </div>
  );
}
