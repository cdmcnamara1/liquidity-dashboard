import React, { useEffect, useMemo, useState } from "react";

/* -------------------- Configuration -------------------- */
const DEFAULT_FRED_KEY =
  import.meta.env.VITE_FRED_API_KEY || "4d7f73d268ae4c1f10e48a4a17203b0f";

const FRED_SERIES = {
  M2SL: "M2SL",
  PROD: "OPHNFB",
  GDP_REAL: "GDPC1",
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

/* -------------------- Data Fetch (proxies) -------------------- */
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

/* -------------------- UI Bits -------------------- */
function Card({ children }) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #eee",
        borderRadius: 10,
        padding: 10,
      }}
    >
      {children}
    </div>
  );
}

function Metric({ label, value, isPrice = false }) {
  const dir = isPrice ? "" : arrow(value);
  const color =
    value == null
      ? "#666"
      : isPrice
      ? "#111"
      : value > 0
      ? "#16a34a"
      : value < 0
      ? "#dc2626"
      : "#111";
  return (
    <Card>
      <div style={{ fontSize: 13, color: "#555", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color }}>
        {value == null ? "—" : isPrice ? `$${money.format(value)}` : pct(value)}{" "}
        {dir}
      </div>
    </Card>
  );
}

function Badge({ regime, score }) {
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
      {s.emoji} {regime} — Score {fmt.format(score)}
    </div>
  );
}

/* ============================================================= */

export default function App() {
  const [apiKey] = useState(
    localStorage.getItem("FRED_API_KEY") || DEFAULT_FRED_KEY
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [series, setSeries] = useState({});
  const [btc, setBtc] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  async function loadAll() {
    setError(null);
    if (!apiKey) return setError("Missing FRED key");
    setLoading(true);
    try {
      const [m2, prod, gdp, btcJson] = await Promise.all([
        fredObservations(FRED_SERIES.M2SL, apiKey, {
          observation_start: "2010-01-01",
        }),
        fredObservations(FRED_SERIES.PROD, apiKey, {
          observation_start: "2010-01-01",
        }),
        fredObservations(FRED_SERIES.GDP_REAL, apiKey, {
          observation_start: "2010-01-01",
        }),
        coingeckoBTC(),
      ]);
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

  /* -------------------- Metrics & Regime -------------------- */
  const metrics = useMemo(() => {
    const M2_yoy = series.M2SL ? yoy(series.M2SL) : null;
    const GDP_yoy = series.GDP_REAL ? yoy(series.GDP_REAL) : null;
    const PROD_yoy = series.PROD ? yoy(series.PROD) : null;
    const btc_price = btc?.market_data?.current_price?.usd ?? null;

    // Composite risk score (0..1)
    const score =
      0.5 * normalize(M2_yoy, { low: -2, high: 8 }) +
      0.3 * normalize(GDP_yoy, { low: -2, high: 6 }) +
      0.2 * normalize(btc_price, { low: 20000, high: 150000 });

    const regime =
      score >= 0.7 ? "Risk-On" : score >= 0.4 ? "Neutral" : "Risk-Off";

    const narrative =
      regime === "Risk-On"
        ? `Liquidity expanding (${pct(M2_yoy)}), growth firm (${pct(
            GDP_yoy
          )}). Crypto bid ($${money.format(
            btc_price ?? 0
          )}) confirms risk appetite. Tilt toward long-duration growth, Bitcoin, and gold; keep cash minimal.`
        : regime === "Risk-Off"
        ? `Liquidity tightening (${pct(M2_yoy)}), growth soft (${pct(
            GDP_yoy
          )}). Preserve capital with defensives, cash, and short-duration Treasuries; trim high beta.`
        : `Signals are mixed (liquidity ${pct(
            M2_yoy
          )}, growth ${pct(
            GDP_yoy
          )}). Maintain balanced exposure and await clearer liquidity direction.`;

    // Suggested allocation by regime
    const allocation =
      regime === "Risk-On"
        ? { Equities: 60, Bonds: 20, Gold: 10, Bitcoin: 10 }
        : regime === "Risk-Off"
        ? { Equities: 25, Bonds: 40, Gold: 25, Bitcoin: 10 }
        : { Equities: 45, Bonds: 30, Gold: 15, Bitcoin: 10 };

    return { M2_yoy, GDP_yoy, PROD_yoy, btc_price, score, regime, narrative, allocation };
  }, [series, btc]);

  /* -------------------- UI -------------------- */
  // Dark-mode awareness (Notion)
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
        maxWidth: 700,
        margin: "0 auto",
        color: textColor,
        background,
        transition: "background 0.3s ease, color 0.3s ease",
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
          color: textColor,
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

      {/* Regime Badge */}
      <Badge regime={metrics.regime} score={metrics.score} />

      {/* Metrics Grid */}
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
        <Metric label="Productivity YoY" value={metrics.PROD_yoy} />
        <Metric label="Bitcoin Price (USD)" value={metrics.btc_price} isPrice />
      </div>

      {/* Investor Narrative */}
      <div style={{ marginTop: 14 }}>
        <Card>
          <div style={{ fontSize: 13, color: "#555", marginBottom: 6 }}>
            Investor Narrative
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.4 }}>{metrics.narrative}</div>
        </Card>
      </div>

      {/* Suggested Allocation */}
      <div style={{ marginTop: 10 }}>
        <Card>
          <div style={{ fontSize: 13, color: "#555", marginBottom: 6 }}>
            Suggested Allocation (by regime)
          </div>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 14,
            }}
          >
            <thead>
              <tr>
                {Object.keys(metrics.allocation).map((k) => (
                  <th
                    key={k}
                    style={{
                      textAlign: "left",
                      padding: "6px 4px",
                      borderBottom: "1px solid #eee",
                    }}
                  >
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
            *Heuristic guidance only; tune thresholds to your mandate and risk
            tolerance.
          </div>
        </Card>
      </div>
    </div>
  );
}



