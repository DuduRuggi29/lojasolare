import { createClient } from '@supabase/supabase-js';
import { loadEligibleOrder } from './_upsell.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Dados que a página de upsell precisa: chave pública do MP e prazo da oferta.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  res.setHeader('Cache-Control', 'no-store');

  const result = await loadEligibleOrder(supabase, req.query.orderId);
  if (!result.order) return res.status(result.status).json({ error: result.error });

  return res.status(200).json({
    publicKey: process.env.MP_PUBLIC_KEY || '',
    expiresAt: result.expiresAt,
  });
}
