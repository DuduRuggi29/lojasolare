import { createClient } from '@supabase/supabase-js';
import { notifyPaymentApproved, notifyPixExpired } from './send-notification.js';
import { sendMetaEvent } from './meta-capi.js';

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

    // Fetch the order from Supabase to get customer info for notifications
    const { data: order } = await supabase
      .from('orders')
      .select('*')
      .eq('mp_payment_id', String(paymentId))
      .single();

    const { error: updateError } = await supabase
      .from('orders')
      .update({ status: newStatus })
      .eq('mp_payment_id', String(paymentId));

    if (updateError) {
      console.error('DB Update Error:', updateError);
      return res.status(500).end();
    }

    // Send notifications based on status
    if (order) {
      if (newStatus === 'approved') {
        await notifyPaymentApproved({
          customerName: order.customer_name,
          customerEmail: order.customer_email,
          customerPhone: order.customer_phone,
          totalPrice: order.total_price,
          shippingMethod: order.shipping_method,
          orderId: order.id,
        });

        // Meta CAPI Purchase (especially important for Pix — browser pixel may not fire)
        const nameParts = (order.customer_name || '').trim().split(/\s+/);
        const addr = order.customer_address || {};
        sendMetaEvent({
          eventName: 'Purchase',
          eventSourceUrl: 'https://lojassolare.com.br/obrigado.html',
          userData: {
            email: order.customer_email,
            phone: order.customer_phone,
            firstName: nameParts[0],
            lastName: nameParts.slice(1).join(' ') || nameParts[0],
            cpf: order.customer_cpf,
            city: addr.city,
            state: addr.state,
            zip: addr.cep,
          },
          customData: {
            value: parseFloat(order.total_price) || 0,
            currency: 'BRL',
            content_ids: ['solare-luminaria'],
            content_type: 'product',
            num_items: order.product_quantity || 1,
          },
          eventId: `purchase-${paymentId}`,
        }).catch(e => console.error('Meta CAPI Purchase (webhook) failed:', e));
      } else if (newStatus === 'cancelled') {
        await notifyPixExpired({
          customerName: order.customer_name,
          customerEmail: order.customer_email,
        });
      }
    }

    return res.status(200).json({ updated: true });

  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(500).end();
  }
}
