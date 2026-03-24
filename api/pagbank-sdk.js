// Proxy para servir o SDK do PagBank — necessário pois o CDN deles
// bloqueia acesso direto de IPs fora do Brasil.
// Esta função roda no servidor Vercel (São Paulo/US) e retorna o SDK
// com headers CORS para que o browser possa carregá-lo.

// Forçar execução na região São Paulo para acessar CDN do PagBank
export const config = { regions: ['gru1'] };

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const sdkUrl = 'https://assets.pagseguro.com.br/checkout-sdk/npm/release/4.3.28/browser/pag-seguro.min.js';
    const response = await fetch(sdkUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LojaSolare/1.0)',
        'Referer': 'https://lojassolare.com.br/',
        'Origin': 'https://lojassolare.com.br',
      },
    });

    if (!response.ok) {
      return res.status(502).json({ error: 'SDK unavailable', status: response.status });
    }

    const js = await response.text();

    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).send(js);
  } catch (err) {
    console.error('[PagBank SDK Proxy]', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
