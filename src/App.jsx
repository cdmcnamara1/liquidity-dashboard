import React, { useEffect, useMemo, useState } from "react";

/* -------------------- Config -------------------- */
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

/* -------------------- Helpers -------------------- */
const fmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
const money = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const pct = (v) => (v == null ? "—" : `${fmt.format(v)}%`);
const arrow = (v) => (v == null ? "" : v > 0 ? "↑" : v < 0 ? "↓" : "→");
const clamp01 = (n) => Math.max(0, Math.min(1, n));
const normalize = (v, { low, high }) =>
  v == null ? 0.5 : clamp01((v - low) / (high - low));

function yoy(obs) {
  if (!obs || obs.length < 13) return null;
  const last = parseFloat(obs[obs.length - 1].value);
  const prev = parseFloat(obs[obs.length - 13].value);
  if (!isFinite(last) || !isFinite(prev) || prev === 0) return null;
  return ((last - prev) / prev) * 100;
}
function latest(obs) {
  if (!obs || !obs.length) return null;
  for (let i = obs.length - 1; i >= 0; i--) {
    const v = parseFloat(obs[i].value);
    if (isFinite(v)) return v;
  }
  return null;
}

/* -------------------- Data fetch via your proxies -------------------- */
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
async function coingeckoBTC() {
  const res = await fetch("/api/coingecko");
  if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
  return res.json();
}

/* -------------------- Small UI bits -------------------- */
function Card({ children }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #eee", borderRadius: 10, padding: 10 }}>
      {children}
    </div>
  );
}
function Metric({ label, value, isPrice = false }) {
  const dir = isPrice ? "" : arrow(value);
  const color =
    value == null ? "#666" : isPrice ? "#111" : value > 0 ? "#16a34a" : value < 0 ? "#dc2626" : "#111";
  return (
    <Card>
      <div style={{ fontSize: 13, color: "#555", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color }}>
        {value == null ? "—" : isPrice ? `$${money.format(value)}` : pct(value)} {dir}
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
      {s.emoji} {regime} — Score {fmt.format(score)} • {quadrant}
    </div>
  );
}

/* -------------------- Main -------------------- */
export default function App() {
  const [apiKey] = useState(localStorage.getItem("FRED_API_KEY") || DEFAULT_FRED_KEY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [series, setSeries] = useState({});
  const [btc, setBtc] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [preset, setPreset] = useState("Moss-Tilt"); // "Balanced" | "Moss-Tilt" | "Defensive"

  async function loadAll() {
    setError(null);
    if (!apiKey) return setError("Missing FRED key");
    setLoading(true);
    try {
      const [m2, prod, gdp, cpi, dgs10, fed, btcJson] = await Promise.all([
        fredObservations(FRED_SERIES.M2SL, apiKey, { observation_start: "2010-01-01" }),
        fredObservations(FRED_SERIES.PROD, apiKey, { observation_start: "2010-01-01" }),
        fredObservations(FRED_SERIES.GDP_REAL, apiKey, { observation_start: "2010-01-01" }),
        fredObservations(FRED_SERIES.CPI, apiKey, { observation_start: "2010-01-01" }),
        fredObservations(FRED_SERIES.DGS10, apiKey, { observation_start: "2010-01-01" }),
        fredObservations(FRED_SERIES.FEDFUNDS, apiKey, { observation_start: "2010-01-01" }),
        coingeckoBTC(),
      ]);
      setSeries({ M2SL: m2, PROD: prod, GDP_REAL: gdp, CPI: cpi, DGS10: dgs10, FEDFUNDS: fed });
      setBtc(btcJson);
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

  const metrics = useMemo(() => {
    const M2_yoy = series.M2SL ? yoy(series.M2SL) : null;
    const GDP_yoy = series.GDP_REAL ? yoy(series.GDP_REAL) : null;
    const CPI_yoy = series.CPI ? yoy(series.CPI) : null;
    const PROD_yoy = series.PROD ? yoy(series.PROD) : null;
    const dgs10 = latest(series.DGS10);
    const fed = latest(series.FEDFUNDS);
    const btc_price = btc?.market_data?.current_price?.usd ?? null;

    // Derived signals
    const realRate = dgs10 != null && CPI_yoy != null ? dgs10 - CPI_yoy : null; // % approx
    const policyGap = fed != null && CPI_yoy != null ? fed - CPI_yoy : null; // >0 = restrictive
    const realGrowth = GDP_yoy != null && CPI_yoy != null ? GDP_yoy - CPI_yoy : null;

    // Composite regime score (v2)
    const liquidityScore = normalize(M2_yoy, { low: -5, high: 10 });
    const growthScore = normalize(realGrowth, { low: -5, high: 5 }); // GDP - CPI
    const policyScore = normalize(-policyGap, { low: -5, high: 5 }); // easing ↑
    const marketScore = normalize(btc_price, { low: 20000, high: 150000 });

    const score = 0.4 * liquidityScore + 0.3 * growthScore + 0.2 * policyScore + 0.1 * marketScore;
    const regime = score >= 0.75 ? "Risk-On" : score >= 0.45 ? "Neutral" : "Risk-Off";

    // Macro quadrant label
    const quadrant =
      (realGrowth ?? 0) >= 0 && (realRate ?? 0) <= 0
        ? "Reflation / Easing"
        : (realGrowth ?? 0) >= 0 && (realRate ?? 0) > 0
        ? "Goldilocks"
        : (realGrowth ?? 0) < 0 && (realRate ?? 0) > 0
        ? "Stagflation Risk"
        : "Disinflation / Deflation Risk";

    const narrative =
      regime === "Risk-On"
        ? `Liquidity expanding (${pct(M2_yoy)}), real growth ${pct(realGrowth)}; policy leaning easier (${fmt.format(
            policyGap ?? 0
          )} gap). Crypto bid ($${money.format(btc_price ?? 0)}) confirms risk appetite. Tilt toward long-duration growth, Bitcoin, and gold; keep cash minimal.`
        : regime === "Risk-Off"
        ? `Liquidity slowing (${pct(M2_yoy)}), real growth ${pct(realGrowth)}; policy restrictive (${fmt.format(
            policyGap ?? 0
          )}). Favor defensives, cash, short-duration Treasuries; trim high beta/crypto.`
        : `Mixed signals: liquidity ${pct(M2_yoy)}, real growth ${pct(realGrowth)}, policy gap ${fmt.format(
            policyGap ?? 0
          )}. Maintain balanced exposure and await clearer direction.`;

    // Allocation presets by regime
    const tables = {
      Balanced: {
        "Risk-On": { Equities: 60, Bonds: 20, Gold: 10, Bitcoin: 10 },
        Neutral: { Equities: 45, Bonds: 30, Gold: 15, Bitcoin: 10 },
        "Risk-Off": { Equities: 25, Bonds: 40, Gold: 25, Bitcoin: 10 },
      },
      "Moss-Tilt": {
        // more scarce assets when Risk-On, still tempered when not
        "Risk-On": { Equities: 45, Bonds: 15, Gold: 20, Bitcoin: 20 },
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
    };
  }, [series, btc, preset]);

  // Dark-mode awareness for Notion
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
        maxWidth: 820,
        margin: "0 auto",
        color: textColor,
        background,
        transition: "background 0.3s ease, color 0.3s ease",
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
      </div>

      {lastUpdated && (
        <div style={{ fontSize: 12, color: "#777", marginBottom: 10 }}>Last updated: {lastUpdated}</div>
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

      {/* Metrics */}
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
        <Metric label="M2 YoY" value={metrics.M2_yoy} />
        <Metric label="GDP YoY" value={metrics.GDP_yoy} />
        <Metric label="CPI YoY" value={metrics.CPI_yoy} />
        <Metric label="Productivity YoY" value={metrics.PROD_yoy} />
        <Card>
          <div style={{ fontSize: 13, color: "#555", marginBottom: 2 }}>10Y Yield / Fed Funds / Real Rate</div>
          <div style={{ fontSize: 14 }}>
            {metrics.dgs10 != null ? `${fmt.format(metrics.dgs10)}%` : "—"} /{" "}
            {metrics.fed != null ? `${fmt.format(metrics.fed)}%` : "—"} /{" "}
            {metrics.realRate != null ? `${fmt.format(metrics.realRate)}%` : "—"}
          </div>
        </Card>
        <Metric label="Bitcoin Price (USD)" value={metrics.btc_price} isPrice />
      </div>

      {/* Narrative */}
      <div style={{ marginTop: 14 }}>
        <Card>
          <div style={{ fontSize: 13, color: "#555", marginBottom: 6 }}>Investor Narrative</div>
          <div style={{ fontSize: 14, lineHeight: 1.4 }}>{metrics.narrative}</div>
        </Card>
      </div>

      {/* Allocation Table */}
      <div style={{ marginTop: 10 }}>
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
                    {fmt.format(v)}%
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
          <div style={{ marginTop: 6, fontSize: 12, color: "#777" }}>
            *Heuristic guidance only. Tune thresholds & presets to mandate and risk tolerance.
          </div>
        </Card>
      </div>
    </div>
  );
}




