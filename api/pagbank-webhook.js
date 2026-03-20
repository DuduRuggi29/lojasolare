import { createClient } from '@supabase/supabase-js';
import { notifyPaymentApproved } from './send-notification.js';
import { sendMetaEvent } from './meta-capi.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = req.body;
    console.log('[PagBank Webhook]', JSON.stringify(body));

    // PagBank sends order object with charges or qr_codes
    const orderId  = body?.id;
    const charges  = body?.charges  || [];
    const qrCodes  = body?.qr_codes || [];

    // Determine status from first charge or qr_code
    let pbStatus = null;
    let pbChargeId = null;

    if (charges.length > 0) {
      pbStatus   = charges[0].status;
      pbChargeId = charges[0].id;
    } else if (qrCodes.length > 0) {
      pbStatus   = qrCodes[0].status;
      pbChargeId = orderId; // for pix, we stored orderId in mp_payment_id
    }

    if (!pbStatus) {
      return res.status(200).json({ received: true, note: 'No actionable status' });
    }

    const statusMap = {
      PAID:        'approved',
      DECLINED:    'rejected',
      CANCELED:    'cancelled',
      IN_ANALYSIS: 'pending',
      WAITING:     'pending',
    };

    const newStatus = statusMap[pbStatus];
    if (!newStatus) {
      return res.status(200).json({ received: true, note: `Unhandled status: ${pbStatus}` });
    }

    // Look up order by charge ID or order ID
    const { data: orders, error: fetchErr } = await supabase
      .from('orders')
      .select('*')
      .or(`mp_payment_id.eq.${pbChargeId},mp_payment_id.eq.${orderId}`)
      .limit(1);

    if (fetchErr || !orders?.length) {
      console.warn('[PagBank Webhook] Order not found for', pbChargeId, orderId);
      return res.status(200).json({ received: true, note: 'Order not found' });
    }

    const order = orders[0];

    if (order.status === newStatus) {
      return res.status(200).json({ received: true, note: 'Status unchanged' });
    }

    // Update order status
    const { error: updateErr } = await supabase
      .from('orders')
      .update({ status: newStatus })
      .eq('id', order.id);

    if (updateErr) {
      console.error('[PagBank Webhook] Update error:', updateErr);
      return res.status(500).json({ error: 'DB update failed' });
    }

    // If newly approved, send notifications and Meta CAPI
    if (newStatus === 'approved' && order.status !== 'approved') {
      const nameParts = (order.customer_name || '').trim().split(/\s+/);
      const firstName = nameParts[0] || '';
      const lastName  = nameParts.slice(1).join(' ') || firstName;

      sendMetaEvent({
        eventName:      'Purchase',
        eventSourceUrl: 'https://lojassolare.com.br/obrigado.html',
        userData: {
          email:     order.customer_email,
          phone:     order.customer_phone,
          firstName, lastName,
          cpf:   order.customer_cpf,
          city:  order.customer_address?.city,
          state: order.customer_address?.state,
          zip:   order.customer_address?.cep,
        },
        customData: {
          value:        parseFloat(order.total_price),
          currency:     'BRL',
          content_ids:  ['solare-luminaria'],
          content_type: 'product',
          num_items:    order.product_quantity,
        },
        eventId: `purchase-${order.mp_payment_id}`,
      }).catch(e => console.error('Meta CAPI failed (non-fatal):', e));

      await notifyPaymentApproved({
        customerName:  order.customer_name,
        customerEmail: order.customer_email,
        customerPhone: order.customer_phone,
        totalPrice:    order.total_price,
        shippingMethod: order.shipping_method,
        orderId:       order.id,
      }).catch(e => console.error('Notification failed (non-fatal):', e));
    }

    return res.status(200).json({ received: true, status: newStatus });
  } catch (err) {
    console.error('[PagBank Webhook] Error:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
