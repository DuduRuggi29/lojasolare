// Proxy para testes sandbox PagBank — roteia chamadas pelo servidor
// evitando bloqueio CORS do browser para sandbox.api.pagseguro.com
import crypto from 'crypto';

const SANDBOX_TOKEN = '1f05cb45-5c02-4934-8a69-9f0e0dc898841edcb547422c965123032b00fc70c0d27690-9146-43e1-b2d1-c0199aeacc81';
const SANDBOX_BASE  = 'https://sandbox.api.pagseguro.com';

// Converte chave pública base64 (SPKI) para PEM
function toPem(base64Key) {
  const lines = base64Key.match(/.{1,64}/g).join('\n');
  return `-----BEGIN PUBLIC KEY-----\n${lines}\n-----END PUBLIC KEY-----`;
}

// Criptografa payload usando RSA-OAEP
function rsaEncrypt(pemKey, payload, hash = 'sha256') {
  return crypto.publicEncrypt(
    { key: pemKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: hash },
    Buffer.from(payload, 'utf8')
  ).toString('base64');
}

// Cria pedido de cartão no sandbox e retorna resultado
async function createCardOrder(encrypted, label) {
  const refId = 'solare-card-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
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
        card: { encrypted, store: false },
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
  return { label, status: r.status, request: body, response: data };
}

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

    // Testa criptografia do cartão server-side (sem SDK browser)
    // Tenta múltiplos formatos de payload até encontrar o correto
    if (action === 'card-auto') {
      // Etapa 1: buscar chave pública
      const pkRes = await fetch(`${SANDBOX_BASE}/public-keys/card`, {
        headers: { 'Authorization': `Bearer ${SANDBOX_TOKEN}` }
      });
      if (!pkRes.ok) {
        return res.status(502).json({ error: 'Falha ao buscar chave pública', status: pkRes.status });
      }
      const { public_key } = await pkRes.json();
      const pem = toPem(public_key);

      // Dados do cartão de teste (Visa sandbox PagBank)
      const card = {
        number: '4111111111111111',
        expMonth: '12',
        expYear: '2026',
        securityCode: '123',
        holder: 'Jose da Silva'
      };

      // Variações de payload para testar
      const variants = [
        // PT-BR com anoExpiracao 4 dígitos, SHA-256
        {
          label: 'pt4d-sha256',
          hash: 'sha256',
          payload: JSON.stringify({ numero: card.number, mesExpiracao: card.expMonth, anoExpiracao: card.expYear, codigoSeguranca: card.securityCode, nomeTitular: card.holder.toUpperCase() })
        },
        // PT-BR com anoExpiracao 2 dígitos, SHA-256
        {
          label: 'pt2d-sha256',
          hash: 'sha256',
          payload: JSON.stringify({ numero: card.number, mesExpiracao: card.expMonth, anoExpiracao: '26', codigoSeguranca: card.securityCode, nomeTitular: card.holder.toUpperCase() })
        },
        // PT-BR mixed case holder, SHA-256
        {
          label: 'pt4d-mixed-sha256',
          hash: 'sha256',
          payload: JSON.stringify({ numero: card.number, mesExpiracao: card.expMonth, anoExpiracao: card.expYear, codigoSeguranca: card.securityCode, nomeTitular: card.holder })
        },
        // EN field names (matching SDK input), SHA-256
        {
          label: 'en-sha256',
          hash: 'sha256',
          payload: JSON.stringify({ number: card.number, expMonth: card.expMonth, expYear: card.expYear, securityCode: card.securityCode, holder: card.holder })
        },
        // EN field names uppercase holder, SHA-256
        {
          label: 'en-upper-sha256',
          hash: 'sha256',
          payload: JSON.stringify({ number: card.number, expMonth: card.expMonth, expYear: card.expYear, securityCode: card.securityCode, holder: card.holder.toUpperCase() })
        },
        // PT-BR com anoExpiracao 4 dígitos, SHA-1
        {
          label: 'pt4d-sha1',
          hash: 'sha1',
          payload: JSON.stringify({ numero: card.number, mesExpiracao: card.expMonth, anoExpiracao: card.expYear, codigoSeguranca: card.securityCode, nomeTitular: card.holder.toUpperCase() })
        },
        // PT-BR com anoExpiracao 2 dígitos, SHA-1
        {
          label: 'pt2d-sha1',
          hash: 'sha1',
          payload: JSON.stringify({ numero: card.number, mesExpiracao: card.expMonth, anoExpiracao: '26', codigoSeguranca: card.securityCode, nomeTitular: card.holder.toUpperCase() })
        },
        // EN SHA-1
        {
          label: 'en-sha1',
          hash: 'sha1',
          payload: JSON.stringify({ number: card.number, expMonth: card.expMonth, expYear: card.expYear, securityCode: card.securityCode, holder: card.holder })
        },
        // Formato camelCase alternativo, SHA-256
        {
          label: 'camel-sha256',
          hash: 'sha256',
          payload: JSON.stringify({ cardNumber: card.number, cardExpMonth: card.expMonth, cardExpYear: card.expYear, cardCvv: card.securityCode, cardHolder: card.holder })
        },
        // Formato com exp como string MM/YYYY, SHA-256
        {
          label: 'mmyyyy-sha256',
          hash: 'sha256',
          payload: JSON.stringify({ numero: card.number, expiracao: `${card.expMonth}/${card.expYear}`, codigoSeguranca: card.securityCode, nomeTitular: card.holder.toUpperCase() })
        },
      ];

      const results = [];
      for (const v of variants) {
        try {
          const encrypted = rsaEncrypt(pem, v.payload, v.hash);
          const result = await createCardOrder(encrypted, v.label);
          results.push({
            label: v.label,
            hash: v.hash,
            payload_preview: v.payload.slice(0, 80),
            http_status: result.status,
            charge_status: result.response?.charges?.[0]?.status,
            error: result.response?.error_messages || result.response?.title || null,
            order_id: result.response?.id || null,
            raw_response: result.response
          });
          // Se deu 201, parar e retornar esse resultado como principal
          if (result.status === 201) {
            return res.status(200).json({
              success: true,
              winning_variant: v.label,
              winning_payload: v.payload,
              winning_hash: v.hash,
              result: result,
              all_results: results
            });
          }
        } catch (encErr) {
          results.push({ label: v.label, hash: v.hash, error: encErr.message });
        }
        // Pequena pausa para não sobrecarregar a API sandbox
        await new Promise(r => setTimeout(r, 300));
      }

      return res.status(200).json({
        success: false,
        message: 'Nenhum formato funcionou. Ver all_results para detalhes.',
        public_key_snippet: public_key.slice(0, 40) + '...',
        all_results: results
      });
    }

    return res.status(400).json({ error: 'action must be: public-key, pix, card, or card-auto' });
  } catch (err) {
    console.error('[sandbox-proxy]', err);
    return res.status(500).json({ error: err.message });
  }
}
