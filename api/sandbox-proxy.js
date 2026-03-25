// Proxy para testes sandbox PagBank — roteia chamadas pelo servidor
// evitando bloqueio CORS do browser para sandbox.api.pagseguro.com
const SANDBOX_TOKEN = '1f05cb45-5c02-4934-8a69-9f0e0dc898841edcb547422c965123032b00fc70c0d27690-9146-43e1-b2d1-c0199aeacc81';
const SANDBOX_BASE  = 'https://sandbox.api.pagseguro.com';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action } = req.query;

  try {
    if (action === 'public-key') {
      const r = await fetch(`${SANDBOX_BASE}/public-keys/card`, {
        headers: { 'Authorization': `Bearer ${SANDBOX_TOKEN}` }
      });
      const data = await r.json();
      return res.status(r.status).json(data);
    }

    if (action === 'pix') {
      const refId = 'solare-pix-' + Date.now();
      const body = {
        reference_id: refId,
        customer: {
          name: 'Jose da Silva', email: 'jose@email.com', tax_id: '12345678909',
          phones: [{ country: '55', area: '11', number: '999999999', type: 'MOBILE' }]
        },
        items: [{ reference_id: 'solare-luminaria', name: 'Luminaria Solar Solare Kit 2 unidades', quantity: 1, unit_amount: 7890 }],
        shipping: { address: { street: 'Rua das Flores', number: '100', complement: 'apto 1', locality: 'Centro', city: 'Sao Paulo', region_code: 'SP', country: 'BRA', postal_code: '01310100' } },
        qr_codes: [{ amount: { value: 7890 }, expiration_date: '2026-04-23T23:59:00-03:00' }],
        notification_urls: ['https://lojassolare.com.br/api/pagbank-webhook']
      };
      const r = await fetch(`${SANDBOX_BASE}/orders`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${SANDBOX_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await r.json();
      return res.status(r.status).json({ _request: body, _response: data, _status: r.status });
    }

    if (action === 'card') {
      const { encrypted } = req.body || {};
      if (!encrypted) return res.status(400).json({ error: 'encrypted card required' });

      const refId = 'solare-card-' + Date.now();
      const body = {
        reference_id: refId,
        customer: {
          name: 'Jose da Silva', email: 'jose@email.com', tax_id: '12345678909',
          phones: [{ country: '55', area: '11', number: '999999999', type: 'MOBILE' }]
        },
        items: [{ reference_id: 'solare-luminaria', name: 'Luminaria Solar Solare Kit 2 unidades', quantity: 1, unit_amount: 7890 }],
        shipping: { address: { street: 'Rua das Flores', number: '100', complement: 'apto 1', locality: 'Centro', city: 'Sao Paulo', region_code: 'SP', country: 'BRA', postal_code: '01310100' } },
        charges: [{
          reference_id: refId + '-charge',
          description: 'Luminaria Solar Solare Kit 2 unidades',
          amount: { value: 7890, currency: 'BRL' },
          payment_method: {
            type: 'CREDIT_CARD', installments: 1, capture: true,
            card: { encrypted, store: true },
            holder: { name: 'Jose da Silva', tax_id: '12345678909' }
          }
        }],
        notification_urls: ['https://lojassolare.com.br/api/pagbank-webhook']
      };
      const r = await fetch(`${SANDBOX_BASE}/orders`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${SANDBOX_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await r.json();
      return res.status(r.status).json({ _request: body, _response: data, _status: r.status });
    }

    return res.status(400).json({ error: 'action must be: public-key, pix, or card' });
  } catch (err) {
    console.error('[sandbox-proxy]', err);
    return res.status(500).json({ error: err.message });
  }
}
