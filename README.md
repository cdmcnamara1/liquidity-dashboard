# Liquidity–Fundamentals Dashboard (Notion-Embeddable)

Live macro + Bitcoin monitoring panel you can deploy on Vercel and embed in Notion.

## Features
- Fetches **FRED** and **CoinGecko** indicators client-side (no backend)
- Computes composite **Liquidity / Fundamentals / Bitcoin** scores
- Color-coded **Risk Regime** badge
- Local **Settings** to store FRED API key + weights

## Quick Start
1. **Get a FRED API key**: https://fred.stlouisfed.org/
2. **Deploy on Vercel** (or run locally with `npm i && npm run dev`)
3. **Embed in Notion**: `/embed` → paste your Vercel URL

## Indicators
- Liquidity: M2 YoY (M2SL), Reverse Repo Δ3m (RRPONTSYD), USD 90d (DTWEXBGS), 10y TIPS (DFII10), VIX (VIXCLS)
- Fundamentals: Real GDP YoY (GDPC1), Productivity YoY (OPHNFB), Debt/GDP (GFDEBTN ÷ GDPC1)
- Bitcoin: Price (USD), 7d % change (CoinGecko)

## Notes
- Your FRED API key is stored in **localStorage**.
- All thresholds/weights can be tuned in `src/App.jsx`.

---
Educational content, not investment advice.
