import React, { useEffect, useMemo, useState } from "react";

/* ==================== Config ==================== */
const DEFAULT_FRED_KEY =
  import.meta.env.VITE_FRED_API_KEY || "4d7f73d268ae4c1f10e48a4a17203b0f";

// FRED series (all via your /api/fred proxy)
const FRED_SERIES = {
  M2SL: "M2SL",                 // M2 (monthly)
  PROD: "OPHNFB",               // Productivity (quarterly)
  GDP_REAL: "GDPC1",            // Real GDP (quarterly)
  CPI: "CPIAUCSL",              // CPI (monthly)
  DGS10: "DGS10",               // 10y UST (daily)
  FEDFUNDS: "FEDFUNDS",         // Fed Funds (monthly)
  SP500: "SP500",               // S&P500 index (daily)
  GOLD: "GOLDAMGBD228NLBM",     // Gold USD London fix (daily)
};

const fmt2 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
const fmt0 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

/* ==================== Small helpers ==================== */
const pct = (v) => (v == null ? "—" : `${fmt2.format(v)}%`);
const money0 = (v) => (v == null ? "—" : `$${fmt0.format(v)}`);
const arrow = (v) => (v == null ? "" : v > 0 ? "↑" : v < 0 ? "↓" : "→");
const clamp01 = (n) => Math.max(0, Math.min(1, n));
const normalize = (v, { low, high }) =>
  v == null ? 0.5 : clamp01((v - low) / (high - low));

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
function changePct(obs, daysBack = 63) { // ~3 months (trading days)
  if (!obs || obs.length < daysBack + 1) return null;
  const last = parseFloat(obs.at(-1).value);
  // step back to a non-NaN prior value
  let idx = obs.length - 1 - daysBack;
  while (idx > 0 && !isFinite(parseFloat(obs[idx].value))) idx--;
  const prev = parseFloat(obs[idx].value);
  if (!isFinite(last) || !isFinite(prev) || prev === 0) return null;
  return ((last - prev) / prev) * 100;
}
function lastN(obs, n = 12, mapper = (o) => parseFloat(o.value)) {
  if (!obs) return null;
  const arr = obs.slice(-n).map(mapper).filter((v) => isFinite(v));
  return arr.length ? arr : null;
}

/* ==================== Proxies ==================== */
async function fredObservations(seriesId, apiKey, params = {}) {
  const search = new URLSearchParams({
    series_id: seriesId,
    api_key: apiKey,
    file_type: "json",
    ...params,
  });
  const res = await fetch(`/api/fred?${search.toString()}`);
  if (!res.ok) throw new Error(`FRED ${seriesId} HTTP ${res.status}`);
  const json = await res.json();
  return json?.observations || [];
}
async function coingeckoBTC() {
  // Use lightweight endpoint via your /api/coingecko proxy (updated earlier)
  const res = await fetch("/api/coingecko");
  if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
  const data = await res.json();
  // supports both /simple/price and full coin payloads
  if (data?.bitcoin?.usd != null) return { price: data.bitcoin.usd };
  // fallback if full payload:
  return {
    price: data?.market_data?.current_price?.usd ?? null,
  };
}

/* ==================== Tiny Sparkline (no deps) ==================== */
function Sparkline({ data, width = 100, height = 28, color = "#16a34a" }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const dx = width / (data.length - 1 || 1);
  const scaleY = (v) =>
    height - ((v - min) / (max - min || 1)) * (height - 2) - 1; // padding
  const points = data.map((v, i) => `${i * dx},${scaleY(v)}`).join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        points={points}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ==================== UI Bits ==================== */
function Card({ children }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #eee", borderRadius: 10, padding: 10 }}>
      {children}
    </div>
  );
}

function Metric({ label, value, isPrice = false, trend = null }) {
  const dir = isPrice ? "" : arrow(value);
  const color =
    value == null ? "#666" : isPrice ? "#111" : value > 0 ? "#16a34a" : value < 0 ? "#dc2626" : "#111";
  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 13, color: "#555", marginBottom: 2 }}>{label}</div>
          <div style={{ fontSize: 18, fontWeight: 700, color }}>
            {value == null ? "—" : isPrice ? money0(value) : pct(value)} {dir}
          </div>
        </div>
        {trend && <Sparkline data={trend} color={color} />}
      </div>
    </Card>
  );
}

function Badge({ regime, score, quadrant }) {
  const map = {
    "Risk-On": { bg: "#d1fae5", color: "#065f46", emoji: "🟢" },
    Neutral: { bg: "#fef9c3", color: "#854d0e", emoji: "🟠" },
    "Risk-Off": { bg: "#fee2e2", color: "#7f1d1d", emoji: "🔴" },
  };
  const s = map[regime];
  return (
    <div
      style={{
        background: s.bg,
        color: s.color,
        border: "1px solid #e5e7eb",
        borderRadius: 10,
        padding: "8px 12px",
        fontWeight: 700,
        textAlign: "center",
        marginBottom: 10,
      }}
    >
      {s.emoji} {regime} — Score {fmt2.format(score)} • {quadrant}
    </div>
  );
}

/* ==================== Main ==================== */
export default function App() {
  const [apiKey] = useState(localStorage.getItem("FRED_API_KEY") || DEFAULT_FRED_KEY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [series, setSeries] = useState({});
  const [btc, setBtc] = useState({ price: null });
  const [lastUpdated, setLastUpdated] = useState(null);
  const [preset, setPreset] = useState("Moss-Tilt"); // Balanced | Moss-Tilt | Defensive

  async function loadAll() {
    setError(null);
    if (!apiKey) return setError("Missing FRED key");
    setLoading(true);
    try {
      const [
        m2,
        prod,
        gdp,
        cpi,
        dgs10,
        fed,
        spx,
        gold,
        btcData,
      ] = await Promise.all([
        fredObservations(FRED_SERIES.M2SL, apiKey, { observation_start: "2010-01-01" }),
        fredObservations(FRED_SERIES.PROD, apiKey, { observation_start: "2010-01-01" }),
        fredObservations(FRED_SERIES.GDP_REAL, apiKey, { observation_start: "2010-01-01" }),
        fredObservations(FRED_SERIES.CPI, apiKey, { observation_start: "2010-01-01" }),
        fredObservations(FRED_SERIES.DGS10, apiKey, { observation_start: "2010-01-01" }),
        fredObservations(FRED_SERIES.FEDFUNDS, apiKey, { observation_start: "2010-01-01" }),
        fredObservations(FRED_SERIES.SP500, apiKey, { observation_start: "2015-01-01" }),
        fredObservations(FRED_SERIES.GOLD, apiKey, { observation_start: "2015-01-01" }),
        coingeckoBTC(),
      ]);
      setSeries({ M2SL: m2, PROD: prod, GDP_REAL: gdp, CPI: cpi, DGS10: dgs10, FEDFUNDS: fed, SP500: spx, GOLD: gold });
      setBtc({ price: btcData.price ?? null });
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

  // Auto-refresh hourly
  useEffect(() => {
    const id = setInterval(loadAll, 3600_000);
    return () => clearInterval(id);
  }, []);

  const metrics = useMemo(() => {
    const M2_yoy = series.M2SL ? yoy(series.M2SL) : null;
    const GDP_yoy = series.GDP_REAL ? yoy(series.GDP_REAL) : null;
    const CPI_yoy = series.CPI ? yoy(series.CPI) : null;
    const PROD_yoy = series.PROD ? yoy(series.PROD) : null;
    const dgs10 = latestNum(series.DGS10);
    const fed = latestNum(series.FEDFUNDS);
    const btc_price = btc?.price ?? null;

    // Derived
    const realRate = dgs10 != null && CPI_yoy != null ? dgs10 - CPI_yoy : null;
    const policyGap = fed != null && CPI_yoy != null ? fed - CPI_yoy : null;
    const realGrowth = GDP_yoy != null && CPI_yoy != null ? GDP_yoy - CPI_yoy : null;

    // Liquidity/policy momentum for outlook (compare last YoY vs prior YoY)
    const M2_yoy_prev =
      series.M2SL && series.M2SL.length > 14
        ? ((parseFloat(series.M2SL.at(-13).value) - parseFloat(series.M2SL.at(-25).value)) /
            parseFloat(series.M2SL.at(-25).value)) *
          100
        : null;
    const ΔM2 = M2_yoy != null && M2_yoy_prev != null ? M2_yoy - M2_yoy_prev : null;

    const policyGap_prev =
      series.FEDFUNDS && series.CPI && series.FEDFUNDS.length > 13 && series.CPI.length > 13
        ? parseFloat(series.FEDFUNDS.at(-13).value) - // prior month policy
          (((parseFloat(series.CPI.at(-13).value) - parseFloat(series.CPI.at(-25).value)) /
            parseFloat(series.CPI.at(-25).value)) *
            100)
        : null;
    const ΔPolicy = policyGap != null && policyGap_prev != null ? policyGap - policyGap_prev : null;

    // Composite Regime Score v2
    const liquidityScore = normalize(M2_yoy, { low: -5, high: 10 });
    const growthScore = normalize(realGrowth, { low: -5, high: 5 });
    const policyScore = normalize(-policyGap, { low: -5, high: 5 }); // easing ↑
    const marketScore = normalize(btc_price, { low: 20000, high: 150000 });

    const score = 0.4 * liquidityScore + 0.3 * growthScore + 0.2 * policyScore + 0.1 * marketScore;
    const regime = score >= 0.75 ? "Risk-On" : score >= 0.45 ? "Neutral" : "Risk-Off";

    // Macro quadrant
    const quadrant =
      (realGrowth ?? 0) >= 0 && (realRate ?? 0) <= 0
        ? "Reflation / Easing"
        : (realGrowth ?? 0) >= 0 && (realRate ?? 0) > 0
        ? "Goldilocks"
        : (realGrowth ?? 0) < 0 && (realRate ?? 0) > 0
        ? "Stagflation Risk"
        : "Disinflation / Deflation Risk";

    // Forward-looking “Outlook”
    let outlook = "Await clearer direction.";
    if (ΔM2 != null && ΔPolicy != null) {
      if (ΔM2 > 0 && ΔPolicy < 0) outlook = "Liquidity & policy easing → forward risk bias improving.";
      else if (ΔM2 < 0 && ΔPolicy > 0) outlook = "Liquidity contraction & tightening policy → pressure on risk assets.";
      else if (ΔM2 > 0) outlook = "Liquidity improving; watch for policy follow-through.";
      else if (ΔM2 < 0) outlook = "Liquidity fading; favor quality and shorter duration.";
    }

    // Performance tiles (3m)
    const spx3m = changePct(series.SP500, 63);
    const gold3m = changePct(series.GOLD, 63);
    const btc3m =
      btc_price != null && series.SP500 // just to gate; BTC from CG has no history here
        ? null
        : null; // (optional: add a small BTC history endpoint if desired)

    // Trends for sparklines (last 12 points)
    const M2_trend = lastN(series.M2SL, 12);
    const GDP_trend = lastN(series.GDP_REAL, 12);
    const CPI_trend = lastN(series.CPI, 12);
    const PROD_trend = lastN(series.PROD, 12);

    // Allocation presets
    const tables = {
      Balanced: {
        "Risk-On": { Equities: 60, Bonds: 20, Gold: 10, Bitcoin: 10 },
        Neutral: { Equities: 45, Bonds: 30, Gold: 15, Bitcoin: 10 },
        "Risk-Off": { Equities: 25, Bonds: 40, Gold: 25, Bitcoin: 10 },
      },
      "Moss-Tilt": {
        "Risk-On": { Equities: 40, Bonds: 25, Gold: 20, Bitcoin: 15 },
        Neutral: { Equities: 40, Bonds: 25, Gold: 20, Bitcoin: 15 },
        "Risk-Off": { Equities: 25, Bonds: 40, Gold: 25, Bitcoin: 10 },
      },
      Defensive: {
        "Risk-On": { Equities: 45, Bonds: 35, Gold: 15, Bitcoin: 5 },
        Neutral: { Equities: 35, Bonds: 45, Gold: 15, Bitcoin: 5 },
        "Risk-Off": { Equities: 20, Bonds: 55, Gold: 20, Bitcoin: 5 },
      },
    };

    const allocation = tables[preset][regime];

    const narrative =
      regime === "Risk-On"
        ? `Liquidity expanding (${pct(M2_yoy)}), real growth ${pct(realGrowth)}; policy gap ${fmt2.format(
            policyGap ?? 0
          )}. Crypto bid (${money0(btc_price)}) supports risk appetite. Tilt toward growth, Bitcoin, gold; keep cash minimal. Outlook: ${outlook}`
        : regime === "Risk-Off"
        ? `Liquidity slowing (${pct(M2_yoy)}), real growth ${pct(realGrowth)}; policy restrictive (${fmt2.format(
            policyGap ?? 0
          )}). Favor defensives, cash, short duration. Outlook: ${outlook}`
        : `Mixed signals: liquidity ${pct(M2_yoy)}, real growth ${pct(realGrowth)}, policy gap ${fmt2.format(
            policyGap ?? 0
          )}. Maintain balanced exposure. Outlook: ${outlook}`;

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
      score,
      regime,
      quadrant,
      narrative,
      allocation,
      // views
      M2_trend,
      GDP_trend,
      CPI_trend,
      PROD_trend,
      spx3m,
      gold3m,
      btc3m,
    };
  }, [series, btc, preset]);

  // Export “Print/PDF” (opens a print-friendly window; user can Save as PDF)
  function exportPDF() {
    const html = `
      <html>
        <head>
          <title>Macro Pulse Report</title>
          <style>
            body{font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial; padding:20px;}
            h1{margin:0 0 6px 0;}
            .box{border:1px solid #e5e7eb; border-radius:10px; padding:12px; margin:8px 0;}
            table{width:100%; border-collapse:collapse;}
            th, td{border-bottom:1px solid #eee; padding:6px 4px; text-align:left;}
          </style>
        </head>
        <body>
          <h1>Macro Pulse Report</h1>
          <div>${new Date().toLocaleString()}</div>
          <div class="box"><b>Regime:</b> ${metrics.regime} • Score ${fmt2.format(metrics.score)} • ${metrics.quadrant}</div>
          <div class="box">
            <b>Summary:</b><br/>
            ${metrics.narrative}
          </div>
          <div class="box">
            <b>Key Metrics</b>
            <ul>
              <li>M2 YoY: ${pct(metrics.M2_yoy)}</li>
              <li>GDP YoY: ${pct(metrics.GDP_yoy)}</li>
              <li>CPI YoY: ${pct(metrics.CPI_yoy)}</li>
              <li>Productivity YoY: ${pct(metrics.PROD_yoy)}</li>
              <li>10Y / Fed Funds / Real Rate: ${fmt2.format(metrics.dgs10 ?? 0)}% / ${fmt2.format(
                metrics.fed ?? 0
              )}% / ${fmt2.format(metrics.realRate ?? 0)}%</li>
              <li>Bitcoin: ${money0(metrics.btc_price)}</li>
            </ul>
          </div>
          <div class="box">
            <b>Suggested Allocation — ${preset} (${metrics.regime})</b>
            <table>
              <thead><tr>${Object.keys(metrics.allocation)
                .map((k) => `<th>${k}</th>`)
                .join("")}</tr></thead>
              <tbody><tr>${Object.values(metrics.allocation)
                .map((v) => `<td>${fmt2.format(v)}%</td>`)
                .join("")}</tr></tbody>
            </table>
          </div>
          <script>window.onload = () => window.print();</script>
        </body>
      </html>`;
    const win = window.open("", "_blank");
    if (win) {
      win.document.write(html);
      win.document.close();
    }
  }

  // Dark-mode awareness
  const prefersDark =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  const background = prefersDark ? "#1f1f1f" : "#fff";
  const textColor = prefersDark ? "#f3f4f6" : "#111";

  return (
    <div
      style={{
        fontFamily: "system-ui",
        padding: 24,
        maxWidth: 920,
        margin: "0 auto",
        color: textColor,
        background,
        transition: "background .3s,color .3s",
      }}
    >
      <h1 style={{ fontSize: "1.4rem", marginBottom: 8 }}>Liquidity–Fundamentals Dashboard</h1>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
        <button
          onClick={loadAll}
          style={{
            padding: "6px 12px",
            borderRadius: 6,
            border: "1px solid #ccc",
            cursor: "pointer",
            background: prefersDark ? "#2a2a2a" : "#fafafa",
            color: textColor,
          }}
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>

        <label style={{ fontSize: 12 }}>
          Preset:&nbsp;
          <select
            value={preset}
            onChange={(e) => setPreset(e.target.value)}
            style={{ padding: "4px 6px", borderRadius: 6, border: "1px solid #ccc" }}
          >
            <option>Balanced</option>
            <option>Moss-Tilt</option>
            <option>Defensive</option>
          </select>
        </label>

        <button
          onClick={exportPDF}
          style={{
            padding: "6px 12px",
            borderRadius: 6,
            border: "1px solid #ccc",
            cursor: "pointer",
            background: prefersDark ? "#2a2a2a" : "#fafafa",
            color: textColor,
          }}
          title="Open a print-ready investor brief (Save as PDF)"
        >
          Export (Print/PDF)
        </button>
      </div>

      {lastUpdated && (
        <div style={{ fontSize: 12, color: "#777", marginBottom: 10 }}>
          Last updated: {lastUpdated}
        </div>
      )}

      {error && (
        <div
          style={{
            color: prefersDark ? "#fecaca" : "#7f1d1d",
            marginBottom: 12,
            background: prefersDark ? "#7f1d1d22" : "#fee2e2",
            padding: 8,
            borderRadius: 8,
            border: "1px solid #fca5a5",
          }}
        >
          {error}
        </div>
      )}

      <Badge regime={metrics.regime} score={metrics.score} quadrant={metrics.quadrant} />

      {/* Metrics with sparklines */}
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
        <Metric label="M2 YoY" value={metrics.M2_yoy} trend={metrics.M2_trend} />
        <Metric label="GDP YoY" value={metrics.GDP_yoy} trend={metrics.GDP_trend} />
        <Metric label="CPI YoY" value={metrics.CPI_yoy} trend={metrics.CPI_trend} />
        <Metric label="Productivity YoY" value={metrics.PROD_yoy} trend={metrics.PROD_trend} />
        <Card>
          <div style={{ fontSize: 13, color: "#555", marginBottom: 2 }}>10Y / Fed Funds / Real Rate</div>
          <div style={{ fontSize: 14 }}>
            {fmt2.format(metrics.dgs10 ?? 0)}% / {fmt2.format(metrics.fed ?? 0)}% /{" "}
            {fmt2.format(metrics.realRate ?? 0)}%
          </div>
        </Card>
        <Metric label="Bitcoin Price (USD)" value={metrics.btc_price} isPrice />
      </div>

      {/* Market performance tiles */}
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <Card>
          <div style={{ fontSize: 12, color: "#555" }}>S&amp;P 500 (3m)</div>
          <div style={{ fontWeight: 700, color: (metrics.spx3m ?? 0) >= 0 ? "#16a34a" : "#dc2626" }}>
            {pct(metrics.spx3m)}
          </div>
        </Card>
        <Card>
          <div style={{ fontSize: 12, color: "#555" }}>Gold (3m)</div>
          <div style={{ fontWeight: 700, color: (metrics.gold3m ?? 0) >= 0 ? "#16a34a" : "#dc2626" }}>
            {pct(metrics.gold3m)}
          </div>
        </Card>
        <Card>
          <div style={{ fontSize: 12, color: "#555" }}>Bitcoin (spot)</div>
          <div style={{ fontWeight: 700 }}>{money0(metrics.btc_price)}</div>
        </Card>
      </div>

      {/* Narrative */}
      <div style={{ marginTop: 14 }}>
        <Card>
          <div style={{ fontSize: 13, color: "#555", marginBottom: 6 }}>Investor Narrative</div>
          <div style={{ fontSize: 14, lineHeight: 1.4 }}>{metrics.narrative}</div>
        </Card>
      </div>

      {/* Allocation Table */}
      <div style={{ marginTop: 10, marginBottom: 20 }}>
        <Card>
          <div style={{ fontSize: 13, color: "#555", marginBottom: 6 }}>
            Suggested Allocation — {preset} preset ({metrics.regime})
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr>
                {Object.keys(metrics.allocation).map((k) => (
                  <th key={k} style={{ textAlign: "left", padding: "6px 4px", borderBottom: "1px solid #eee" }}>
                    {k}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {Object.values(metrics.allocation).map((v, i) => (
                  <td key={i} style={{ padding: "6px 4px" }}>
                    {fmt2.format(v)}%
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
          <div style={{ marginTop: 6, fontSize: 12, color: "#777" }}>
            *Heuristic guidance only; tune thresholds & presets to mandate and risk tolerance.
          </div>
        </Card>
      </div>
    </div>
  );
}





