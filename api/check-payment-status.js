import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).end();
  }

  const { payment_id } = req.query;
  if (!payment_id) return res.status(400).json({ error: 'Missing payment_id' });

  // Allow numeric IDs (legacy) and PagBank alphanumeric IDs like ORDE_xxx / CHAR_xxx
  if (!/^[\w-]{1,64}$/.test(String(payment_id))) {
    return res.status(400).json({ error: 'Invalid payment_id' });
  }

  try {
    const { data: order } = await supabase
      .from('orders')
      .select('status')
      .eq('mp_payment_id', String(payment_id))
      .single();

    return res.status(200).json({ status: order?.status || 'pending' });
  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }
}
