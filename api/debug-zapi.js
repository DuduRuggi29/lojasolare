export default async function handler(req, res) {
  const instanceId = process.env.ZAPI_INSTANCE_ID;
  const token = process.env.ZAPI_TOKEN;
  const clientToken = process.env.ZAPI_CLIENT_TOKEN;

  // Testa envio real para número fixo
  let zapiResult = null;
  if (instanceId && token && clientToken) {
    try {
      const r = await fetch(`https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Client-Token': clientToken },
        body: JSON.stringify({ phone: '5521975605337', message: '[TESTE] Z-API funcionando na Vercel ✅' }),
      });
      const body = await r.json();
      zapiResult = { status: r.status, body };
    } catch (e) {
      zapiResult = { error: e.message };
    }
  }

  return res.status(200).json({
    env: {
      ZAPI_INSTANCE_ID: instanceId ? `set (${instanceId.slice(0,6)}...)` : 'MISSING',
      ZAPI_TOKEN:       token       ? `set (${token.slice(0,4)}...)`       : 'MISSING',
      ZAPI_CLIENT_TOKEN: clientToken ? `set (${clientToken.slice(0,6)}...)` : 'MISSING',
    },
    zapiResult,
  });
}
