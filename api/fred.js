export default async function handler(req, res) {
  try {
    // Ensure clean query handling and proper key passthrough
    const { series_id, api_key, ...rest } = req.query;

    if (!series_id) {
      return res.status(400).json({ error: "Missing required parameter: series_id" });
    }
    if (!api_key) {
      return res.status(400).json({ error: "Missing required parameter: api_key" });
    }

    // Build query string safely
    const search = new URLSearchParams({
      series_id,
      api_key: api_key.trim(), // ensure no spaces or invisible chars
      file_type: "json",
      ...rest,
    });

    const url = `https://api.stlouisfed.org/fred/series/observations?${search.toString()}`;

    const fredRes = await fetch(url);
    const text = await fredRes.text();

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(200).send(text);
  } catch (err) {
    console.error("FRED proxy error:", err);
