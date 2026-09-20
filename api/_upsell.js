// Regras compartilhadas do upsell (usadas por upsell-info e process-upsell)
export const UPSELL_AMOUNT = 49.90;
export const UPSELL_WINDOW_MS = 6 * 60 * 1000; // a página promete 5 min; 1 min de tolerância
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Retorna { order } se o pedido pode receber upsell, ou { status, error } caso contrário.
export async function loadEligibleOrder(supabase, orderId) {
  if (!UUID_RE.test(String(orderId || ''))) return { status: 400, error: 'Pedido inválido.' };

  const { data: order } = await supabase.from('orders').select('*').eq('id', orderId).single();
  if (!order) return { status: 404, error: 'Pedido não encontrado.' };

  if (order.status !== 'approved' || order.payment_method === 'pix' || order.upsell_of) {
    return { status: 403, error: 'Oferta indisponível para este pedido.' };
  }
  const expiresAt = new Date(order.created_at).getTime() + UPSELL_WINDOW_MS;
  if (Date.now() > expiresAt) return { status: 410, error: 'Oferta expirada.' };

  const { data: existing } = await supabase
    .from('orders').select('id').eq('upsell_of', orderId).limit(1);
  if (existing?.length) return { status: 409, error: 'Oferta já utilizada.' };

  return { order, expiresAt };
}
