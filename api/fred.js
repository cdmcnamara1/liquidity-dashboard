// /api/fred.js — simple proxy to bypass CORS
export default async function handler(req, res) {
  const { series_id, api_key, ...rest } = req.query;
  const search = new URLSearchParams({
    series_id,
    api_key,
    file_type: "json",
    ...rest,
  });

  const url = `https://api.stlouisfed.org/fred/series/observations?${search.toString()}`;

  try {
    const fredRes = await fetch(url);
    const text = await fredRes.text();
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(200).send(text);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
