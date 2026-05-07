import type { VercelRequest, VercelResponse } from '@vercel/node';

const AMBIENT_API_URL = 'https://rt.ambientweather.net/v1/devices';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Accept keys from query params (for client-side calls) or env vars
  const apiKey = (req.query.apiKey as string) || process.env.AMBIENT_API_KEY;
  const applicationKey = (req.query.applicationKey as string) || process.env.AMBIENT_APP_KEY;

  if (!apiKey || !applicationKey) {
    return res.status(400).json({ error: 'API key and application key are required' });
  }

  try {
    const url = `${AMBIENT_API_URL}?apiKey=${encodeURIComponent(apiKey)}&applicationKey=${encodeURIComponent(applicationKey)}`;
    const response = await fetch(url);

    if (!response.ok) {
      const body = await response.text();
      return res.status(response.status).json({
        error: `Ambient Weather API error: ${response.status}`,
        details: body,
      });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to fetch devices',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
