import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const { payment_id } = req.query;
  if (!payment_id) return res.status(400).json({ error: 'Missing payment_id' });
  if (!/^[\w-]{1,64}$/.test(String(payment_id))) {
    return res.status(400).json({ error: 'Invalid payment_id' });
  }

  try {
    // 1. Verificar status no Supabase
    const { data: order } = await supabase
      .from('orders')
      .select('status')
      .eq('mp_payment_id', String(payment_id))
      .single();

    if (order?.status === 'approved') {
      return res.status(200).json({ status: 'approved' });
    }

    // 2. Se não aprovado no DB, consultar diretamente a API do Mercado Pago
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${payment_id}`, {
      headers: { 'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}` },
    });

    if (mpRes.ok) {
      const mpData = await mpRes.json();
      const mpStatus = mpData.status; // approved, pending, rejected, etc.

      // Se o MP diz aprovado, atualizar Supabase e retornar aprovado
      if (mpStatus === 'approved') {
        await supabase
          .from('orders')
          .update({ status: 'approved' })
          .eq('mp_payment_id', String(payment_id));

        return res.status(200).json({ status: 'approved' });
      }

      return res.status(200).json({ status: mpStatus || order?.status || 'pending' });
    }

    return res.status(200).json({ status: order?.status || 'pending' });
  } catch (err) {
    console.error('check-payment-status error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
