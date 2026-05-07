import type { VercelRequest, VercelResponse } from '@vercel/node';

const AMBIENT_API_URL = 'https://rt.ambientweather.net/v1/devices';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const mac = req.query.mac as string;
  const limit = (req.query.limit as string) || '288';
  const endDate = req.query.endDate as string | undefined;

  // Accept keys from query params or env vars
  const apiKey = (req.query.apiKey as string) || process.env.AMBIENT_API_KEY;
  const applicationKey = (req.query.applicationKey as string) || process.env.AMBIENT_APP_KEY;

  if (!mac) {
    return res.status(400).json({ error: 'mac parameter is required' });
  }

  if (!apiKey || !applicationKey) {
    return res.status(400).json({ error: 'API key and application key are required' });
  }

  try {
    const params = new URLSearchParams({
      apiKey,
      applicationKey,
      limit,
    });

    if (endDate) {
      params.set('endDate', endDate);
    }

    const url = `${AMBIENT_API_URL}/${encodeURIComponent(mac)}?${params}`;
    const response = await fetch(url);

    if (!response.ok) {
      const body = await response.text();
      return res.status(response.status).json({
        error: `Ambient Weather API error: ${response.status}`,
        details: body,
      });
    }

    const data = await response.json();

    // Extract only the fields we need to minimize data transfer
    const readings = Array.isArray(data)
      ? data.map((entry: Record<string, unknown>) => ({
          dateutc: entry.dateutc,
          tempf: entry.tempf,
          date: entry.date,
        }))
      : [];

    return res.status(200).json(readings);
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to fetch weather history',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
