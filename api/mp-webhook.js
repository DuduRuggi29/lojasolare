import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { type, data } = req.body;

    if (type !== 'payment') {
      return res.status(200).json({ message: 'Ignored' });
    }

    const paymentId = data?.id;
    if (!paymentId) {
      return res.status(400).end();
    }

    const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: {
        'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}`,
      },
    });

    if (!mpResponse.ok) {
      return res.status(500).end();
    }

    const payment = await mpResponse.json();
    
    const statusMap = {
      approved: 'approved',
      rejected: 'rejected',
      pending: 'pending',
      in_process: 'pending',
      cancelled: 'cancelled',
      refunded: 'cancelled',
    };

    const newStatus = statusMap[payment.status] || 'pending';

    const { error: updateError } = await supabase
      .from('orders')
      .update({ status: newStatus })
      .eq('mp_payment_id', String(paymentId));

    if (updateError) {
      console.error('DB Update Error:', updateError);
      return res.status(500).end();
    }

    return res.status(200).json({ updated: true });

  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(500).end();
  }
}
