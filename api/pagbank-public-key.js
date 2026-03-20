const PAGBANK_TOKEN = process.env.PAGBANK_TOKEN;
const PAGBANK_BASE  = 'https://api.pagseguro.com';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const response = await fetch(`${PAGBANK_BASE}/public-keys/card`, {
      method:  'GET',
      headers: {
        'Authorization': `Bearer ${PAGBANK_TOKEN}`,
        'Accept':        'application/json',
      },
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[PagBank PublicKey Error]', data);
      return res.status(500).json({ error: 'Failed to fetch public key' });
    }

    // Cache for 24h — public key rotates infrequently
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.status(200).json({ public_key: data.public_key });
  } catch (err) {
    console.error('[PagBank PublicKey] Error:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
