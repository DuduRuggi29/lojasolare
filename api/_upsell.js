// Regras compartilhadas do upsell (usadas por upsell-info e process-upsell)
export const UPSELL_AMOUNT = 49.90;
export const UPSELL_WINDOW_MS = 6 * 60 * 1000; // a página promete 5 min; 1 min de tolerância
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Retorna { order, isPix, expiresAt, existing } se o pedido pode receber upsell,
// ou { status, error } caso contrário.
//  - Cartão: o prazo conta a partir da criação do pedido.
//  - Pix: o prazo conta a partir do momento em que a oferta foi exibida (markOffered), pois o
//    cliente pode pagar o Pix minutos depois de gerar o QR Code.
//  - existing: pedido de upsell já criado para este pedido (usado para retomar um Pix pendente).
export async function loadEligibleOrder(supabase, orderId, { markOffered = false } = {}) {
  if (!UUID_RE.test(String(orderId || ''))) return { status: 400, error: 'Pedido inválido.' };

  const { data: order } = await supabase.from('orders').select('*').eq('id', orderId).single();
  if (!order) return { status: 404, error: 'Pedido não encontrado.' };

  if (order.status !== 'approved' || order.upsell_of) {
    return { status: 403, error: 'Oferta indisponível para este pedido.' };
  }

  const isPix = order.payment_method === 'pix';
  let startedAt = new Date(order.created_at).getTime();

  if (isPix) {
    startedAt = order.upsell_offered_at ? new Date(order.upsell_offered_at).getTime() : null;
    if (!startedAt) {
      if (!markOffered) return { status: 403, error: 'Oferta indisponível para este pedido.' };
      startedAt = Date.now();
      await supabase.from('orders').update({ upsell_offered_at: new Date(startedAt).toISOString() }).eq('id', orderId);
    }
  }

  const expiresAt = startedAt + UPSELL_WINDOW_MS;

  const { data: existingRows } = await supabase
    .from('orders')
    .select('id, status, mp_payment_id, pix_qr_code, pix_qr_code_base64')
    .eq('upsell_of', orderId)
    .limit(1);
  const existing = existingRows?.[0] || null;

  // Pix pendente já gerado pode ser retomado mesmo depois do prazo de criação
  const resumablePix = isPix && existing?.status === 'pending' && existing.pix_qr_code;
  if (!resumablePix) {
    if (existing) return { status: 409, error: 'Oferta já utilizada.' };
    if (Date.now() > expiresAt) return { status: 410, error: 'Oferta expirada.' };
  }

  return { order, isPix, expiresAt, existing };
}
