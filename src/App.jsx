import React, { useEffect, useMemo, useRef, useState } from "react";

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

const RETRY_INTERVAL_MS = 15000;
const MAX_RETRIES = 6;
const CACHE_PREFIX = "LD_CACHE_";

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
function cKey(id) {
  return `${CACHE_PREFIX}${id}`;
}
function saveCache(id, data) {
  try {
    localStorage.setItem(cKey(id), JSON.stringify(data || []));
  } catch {}
}
function loadCache(id) {
  try {
    const s = localStorage.getItem(cKey(id));
    return s ? JSON.parse(s) : [];
  } catch {
    return [];
  }
}

/* ==================== FETCH HELPERS ==================== */
async function safeJson(url, label) {
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${label} HTTP ${r.status}`);
    const t = await r.text();
    if (t.trim().startsWith("<")) throw new Error(`${label} returned HTML`);
    return JSON.parse(t);
  } catch (e) {
    console.error(label, e.message);
    return null;
  }
}
async function fred(id, key) {
  const q = new URLSearchParams({
    series_id: id,
    api_key: key,
    file_type: "json",
  });
  const j = await safeJson(`/api/fred?${q}`, `FRED ${id}`);
  return j?.observations || null;
}
async function coingeckoBTC() {
  try {
    const r = await fetch("/api/coingecko");
    const t = await r.text();
    if (t.trim().startsWith("<")) throw new Error("HTML from CoinGecko");
    const j = JSON.parse(t);
    return j.bitcoin?.usd ?? j.market_data?.current_price?.usd ?? null;
  } catch (e) {
    console.error("BTC", e.message);
    return null;
  }
}

/* ==================== UI PIECES ==================== */
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
            transition: "width .6s ease",
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
    <svg width={width} height={height}>
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
function StatusDot({ status }) {
  const color =
    status === "ok"
      ? "#16a34a"
      : status === "cache"
      ? "#facc15"
      : "#dc2626";
  return (
    <span
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: color,
        marginRight: 6,
      }}
    />
  );
}
function Metric({ label, value, isPrice = false, trend, status = "ok" }) {
  const dir = isPrice ? "" : arrow(value);
  const color =
    value == null ? "#666" : isPrice ? "#111" : value > 0 ? "#16a34a" : "#dc2626";
  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 13, color: "#555", marginBottom: 2 }}>
            <StatusDot status={status} />
            {label}
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color }}>
            {value == null ? "—" : isPrice ? money0(value) : pct(value)} {dir}
          </div>
        </div>
        {trend && <Sparkline data={trend} color={color} />}
      </div>
    </Card>
  );
}

/* ==================== MAIN APP ==================== */
export default function App() {
  const [apiKey] = useState(localStorage.getItem("FRED_API_KEY") || DEFAULT_FRED_KEY);
  const [series, setSeries] = useState({});
  const [btc, setBtc] = useState(null);
  const [statusMap, setStatusMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const retryCounts = useRef({});
  const retryTimer = useRef(null);

  function scheduleRetry() {
    if (retryTimer.current) return;
    retryTimer.current = setTimeout(retryFailed, RETRY_INTERVAL_MS);
  }

  async function retryFailed() {
    retryTimer.current = null;
    const fails = Object.entries(statusMap)
      .filter(([_, s]) => s === "fail")
      .map(([id]) => id);
    if (!fails.length) return;
    const next = { ...statusMap };
    for (const id of fails) {
      const count = (retryCounts.current[id] || 0) + 1;
      retryCounts.current[id] = count;
      if (count > MAX_RETRIES) continue;
      if (id === "BTC") {
        const p = await coingeckoBTC();
        if (p) {
          setBtc(p);
          next.BTC = "ok";
        } else next.BTC = "fail";
      } else {
        const obs = await fred(id, apiKey);
        if (obs) {
          setSeries((prev) => ({ ...prev, [id]: obs }));
          saveCache(id, obs);
          next[id] = "ok";
        } else {
          const c = loadCache(id);
          next[id] = c.length ? "cache" : "fail";
        }
      }
    }
    setStatusMap(next);
    if (Object.values(next).includes("fail")) scheduleRetry();
  }

  async function loadAll() {
    setError(null);
    setLoading(true);
    retryCounts.current = {};
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
      const next = { ...statusMap };
      const s = {};
      for (const [id, data] of [
        [FRED_SERIES.M2SL, m2],
        [FRED_SERIES.PROD, prod],
        [FRED_SERIES.GDP_REAL, gdp],
        [FRED_SERIES.CPI, cpi],
        [FRED_SERIES.DGS10, dgs10],
        [FRED_SERIES.FEDFUNDS, fed],
      ]) {
        if (data) {
          s[id] = data;
          saveCache(id, data);
          next[id] = "ok";
        } else {
          const c = loadCache(id);
          s[id] = c;
          next[id] = c.length ? "cache" : "fail";
        }
      }
      if (btcP) {
        setBtc(btcP);
        next.BTC = "ok";
      } else next.BTC = "fail";
      setSeries(s);
      setStatusMap(next);
      setLastUpdated(new Date().toLocaleString());
      if (Object.values(next).includes("fail")) scheduleRetry();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    const id = setInterval(loadAll, 3600_000);
    return () => clearInterval(id);
  }, []);

  const metrics = useMemo(() => {
    const hasAll =
      series.M2SL && series.GDP_REAL && series.CPI && series.PROD &&
      series.M2SL.length && series.GDP_REAL.length && series.CPI.length && series.PROD.length;
    if (!hasAll) return null;
    const M2_yoy = yoy(series.M2SL);
    const GDP_yoy = yoy(series.GDP_REAL);
    const CPI_yoy = yoy(series.CPI);
    const PROD_yoy = yoy(series.PROD);
    const dgs10 = latestNum(series.DGS10);
    const fed = latestNum(series.FEDFUNDS);
    const btc_price = btc ?? null;

    const realRate = dgs10 && CPI_yoy ? dgs10 - CPI_yoy : 0;
    const policyGap = fed && CPI_yoy ? fed - CPI_yoy : 0;
    const realGrowth = GDP_yoy && CPI_yoy ? GDP_yoy - CPI_yoy : 0;

    const tides = 0.6 * normalize(M2_yoy, { low: -5, high: 10 }) +
      0.4 * normalize(-realRate, { low: -3, high: 3 });
    const waves = 0.5 * normalize(realGrowth, { low: -5, high: 5 }) +
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

    // Bubble Stress Index
    const bubbleStress = normalize(M2_yoy - GDP_yoy, { low: -5, high: 15 });

    return {
      M2_yoy, GDP_yoy, CPI_yoy, PROD_yoy,
      dgs10, fed, btc_price,
      realRate, policyGap, realGrowth,
      tides, waves, seafloor, composite, regime, current,
      bubbleStress,
      M2_trend: lastN(series.M2SL),
      GDP_trend: lastN(series.GDP_REAL),
      CPI_trend: lastN(series.CPI),
      PROD_trend: lastN(series.PROD),
    };
  }, [series, btc]);

  const feedHealth = useMemo(() => {
    const vals = Object.values(statusMap);
    const t = vals.length;
    if (!t) return { label: "Unknown", color: "#9ca3af" };
    const fail = vals.filter((v) => v === "fail").length;
    const cache = vals.filter((v) => v === "cache").length;
    if (fail === 0 && cache === 0) return { label: "Stable", color: "#16a34a" };
    if (fail < t) return { label: "Degraded", color: "#facc15" };
    return { label: "Outage", color: "#dc2626" };
  }, [statusMap]);

  const prefersDark =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  const bg = prefersDark ? "#1f1f1f" : "#fff";
  const text = prefersDark ? "#f3f4f6" : "#111";

  if (loading)
    return <div style={{ padding: 50, fontFamily: "system-ui" }}>Loading data…</div>;
  if (error)
    return <div style={{ padding: 50, color: "red", fontFamily: "system-ui" }}>{error}</div>;
  if (!metrics)
    return <div style={{ padding: 50, fontFamily: "system-ui" }}>Waiting for data…</div>;

  return (
    <div style={{ fontFamily: "system-ui", padding: 24, maxWidth: 940, margin: "0 auto", color: text, background: bg }}>
      <h1 style={{ fontSize: "1.4rem", marginBottom: 8 }}>Liquidity–Fundamentals Dashboard</h1>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <div style={{
          background: feedHealth.color,
          borderRadius: 999,
          padding: "4px 10px",
          fontSize: 12,
          fontWeight: 700,
          color: "#0b0b0b",
        }}>
          Feed: {feedHealth.label}
        </div>
        <div style={{ fontSize: 12, color: "#777" }}>Last updated: {lastUpdated}</div>
        <button
          onClick={loadAll}
          style={{
            marginLeft: "auto",
            padding: "6px 12px",
            borderRadius: 6,
            border: "1px solid #ccc",
            cursor: "pointer",
            background: prefersDark ? "#2a2a2a" : "#fafafa",
            color: text,
          }}
        >
          Refresh
        </button>
      </div>

      {/* Ocean Bars */}
      <Card>
        <div style={{ fontSize: 13, color: "#555", marginBottom: 4 }}>Ocean Depth Forces</div>
        <div style={{ display: "flex", gap: 6 }}>
          <Bar label="🌊 Tides" value={metrics.tides} tooltip="Liquidity & real-rate trend" />
          <Bar label="🌬 Waves" value={metrics.waves} tooltip="Cyclical policy & growth impulse" />
          <Bar label="🪨 Seafloor" value={metrics.seafloor} tooltip="Structural productivity foundation" />
        </div>
      </Card>

      {/* Bubble Stress Index */}
      <Card>
        <div style={{ fontSize: 13, color: "#555", marginBottom: 4 }}>Bubble Stress Index</div>
        <div style={{
          fontSize: 16,
          fontWeight: 700,
          color:
            metrics.bubbleStress > 0.7
              ? "#dc2626"
              : metrics.bubbleStress > 0.4
              ? "#facc15"
              : "#16a34a",
        }}>
          {fmt2.format(metrics.bubbleStress * 100)}%
          {metrics.bubbleStress > 0.7
            ? " – Liquidity bubble forming"
            : metrics.bubbleStress > 0.4
            ? " – Elevated monetary distortion"
            : " – Balanced"}
        </div>
      </Card>

      {/* Regime */}
      <Card>
        <div style={{ fontSize: 13, color: "#555", marginBottom: 4 }}>Market Current</div>
        <div style={{ fontSize: 16, fontWeight: 700 }}>
          {metrics.regime} — {metrics.current} (Score {fmt2.format(metrics.composite)})
        </div>
      </Card>

      {/* Metrics Grid */}
      <div style={{
        display: "grid",
        gap: 10,
        background: prefersDark ? "#111" : "#f8f9fa",
        padding: 12,
        borderRadius: 10,
        border: "1px solid #e5e7eb",
      }}>
        <Metric label="M2 YoY" value={metrics.M2_yoy} trend={metrics.M2_trend} status={statusMap.M2SL} />
        <Metric label="GDP YoY" value={metrics.GDP_yoy} trend={metrics.GDP_trend} status={statusMap.GDP_REAL} />
        <Metric label="CPI YoY" value={metrics.CPI_yoy} trend={metrics.CPI_trend} status={statusMap.CPI} />
        <Metric label="Productivity YoY" value={metrics.PROD_yoy} trend={metrics.PROD_trend} status={statusMap.PROD} />
        <Card>
          <div style={{ fontSize: 13, color: "#555", marginBottom: 2 }}>10Y / Fed Funds / Real Rate</div>
          <div style={{ fontSize: 14 }}>
            {fmt2.format(metrics.dgs10 ?? 0)}% / {fmt2.format(metrics.fed ?? 0)}% / {fmt2.format(metrics.realRate ?? 0)}%
          </div>
        </Card>
        <Metric label="Bitcoin Price (USD)" value={metrics.btc_price} isPrice status={statusMap.BTC} />
      </div>

      {/* Narrative */}
      <Card>
        <div style={{ fontSize: 13, color: "#555", marginBottom: 6 }}>Investor Narrative</div>
        <div style={{ fontSize: 14, lineHeight: 1.4 }}>
          Liquidity {pct(metrics.M2_yoy)}, growth {pct(metrics.GDP_yoy)}, inflation {pct(metrics.CPI_yoy)}, productivity {pct(metrics.PROD_yoy)}.
          <br />
          Real rate {fmt2.format(metrics.realRate)}%, policy gap {fmt2.format(metrics.policyGap)}%.
          <br />
          Tides {metrics.tides > 0.5 ? "rising" : "falling"}, waves {metrics.waves > 0.5 ? "supportive" : "muted"}, seafloor {metrics.seafloor > 0.5 ? "stable" : "soft"}.
          <br />
          {metrics.bubbleStress > 0.7
            ? "Excess liquidity relative to output is inflating financial assets — consistent with a 'bubble in money' regime."
            : metrics.bubbleStress > 0.4
            ? "Monetary expansion is outpacing real growth, suggesting moderate distortion."
            : "Monetary growth and output remain aligned — limited bubble risk so far."}
        </div>
      </Card>

      {/* Export */}
      <button onClick={() => window.print()} style={{
        marginTop: 12,
        padding: "6px 12px",
        borderRadius: 6,
        border: "1px solid #ccc",
        cursor: "pointer",
        background: prefersDark ? "#2a2a2a" : "#fafafa",
        color: text,
      }}>
        Export / Print PDF
      </button>
    </div>
  );
}



     









