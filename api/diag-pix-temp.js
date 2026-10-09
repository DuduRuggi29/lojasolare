// ENDPOINT TEMPORÁRIO DE DIAGNÓSTICO — remover após o uso.
// Consulta, com o token real de produção, o status no Mercado Pago dos pedidos
// Pix que ficaram "pending" no Supabase. Não expõe o token em nenhuma resposta.
import { createClient } from '@supabase/supabase-js';

const DIAG_SECRET = '1c20d25948dca8a7f1537e8723ad7c22a0074029ec774101';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  if (req.query.secret !== DIAG_SECRET) return res.status(404).end();

  const limit = Math.min(parseInt(req.query.limit) || 15, 50);

  try {
    const me = await fetch('https://api.mercadopago.com/users/me', {
      headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` },
    }).then(r => r.json());

    const { data: pendingOrders } = await supabase
      .from('orders')
      .select('id, created_at, mp_payment_id, total_price')
      .eq('payment_method', 'pix')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(limit);

    const results = [];
    for (const order of pendingOrders || []) {
      try {
        const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${order.mp_payment_id}`, {
          headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` },
        });
        const mp = await mpRes.json();
        results.push({
          orderId: order.id,
          createdAt: order.created_at,
          mpHttpStatus: mpRes.status,
          mpStatus: mp.status || null,
          mpStatusDetail: mp.status_detail || null,
          dateOfExpiration: mp.date_of_expiration || null,
          mpError: mp.message || null,
        });
      } catch (e) {
        results.push({ orderId: order.id, error: String(e) });
      }
    }

    return res.status(200).json({
      account: { id: me.id, email: me.email, site_id: me.site_id },
      siteUrl: process.env.SITE_URL || null,
      webhookUrlUsedInPayments: `${process.env.SITE_URL}/api/mp-webhook`,
      hasWebhookSecret: !!process.env.MP_WEBHOOK_SECRET,
      checked: results.length,
      results,
    });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
