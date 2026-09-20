import { createClient } from '@supabase/supabase-js';
import { loadEligibleOrder } from './_upsell.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Dados que a página de upsell precisa: forma de pagamento da oferta, prazo e chave pública do MP.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  res.setHeader('Cache-Control', 'no-store');

  const result = await loadEligibleOrder(supabase, req.query.orderId, { markOffered: true });
  if (!result.order) return res.status(result.status).json({ error: result.error });

  const pixPending = result.existing?.status === 'pending' && result.existing.pix_qr_code;
  return res.status(200).json({
    method: result.isPix ? 'pix' : 'card',
    publicKey: process.env.MP_PUBLIC_KEY || '',
    expiresAt: result.expiresAt,
    pix: pixPending ? {
      paymentId: result.existing.mp_payment_id,
      qrCode: result.existing.pix_qr_code,
      qrCodeBase64: result.existing.pix_qr_code_base64,
    } : null,
  });
}
