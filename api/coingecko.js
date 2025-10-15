// /api/coingecko.js — proxy for CoinGecko BTC data
export default async function handler(req, res) {
  const url =
    "https://api.coingecko.com/api/v3/coins/bitcoin?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false";

  try {
    const cgRes = await fetch(url);
    const text = await cgRes.text();
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(200).send(text);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
