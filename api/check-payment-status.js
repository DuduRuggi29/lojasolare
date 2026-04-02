import { createClient } from '@supabase/supabase-js';
import { notifyPaymentApproved } from './send-notification.js';
import { sendMetaEvent } from './meta-capi.js';

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
      .select('*')
      .eq('mp_payment_id', String(payment_id))
      .single();

    if (order?.status === 'approved') {
      return res.status(200).json({ status: 'approved' });
    }

    // 2. Consultar diretamente a API do Mercado Pago
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${payment_id}`, {
      headers: { 'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}` },
    });

    if (!mpRes.ok) {
      return res.status(200).json({ status: order?.status || 'pending' });
    }

    const mpData = await mpRes.json();
    const mpStatus = mpData.status;

    if (mpStatus === 'approved') {
      // Atualizar Supabase
      await supabase
        .from('orders')
        .update({ status: 'approved' })
        .eq('mp_payment_id', String(payment_id));

      // Enviar email + notificações (só se ainda não estava aprovado)
      if (order) {
        const nameParts = (order.customer_name || '').trim().split(/\s+/);
        const addr = order.customer_address || {};

        notifyPaymentApproved({
          customerName:  order.customer_name,
          customerEmail: order.customer_email,
          customerPhone: order.customer_phone,
          totalPrice:    order.total_price,
          shippingMethod: order.shipping_method,
          orderId:       order.id,
        }).catch(e => console.error('Email notification failed:', e));

        sendMetaEvent({
          eventName:      'Purchase',
          eventSourceUrl: 'https://lojassolare.com.br/obrigado.html',
          userData: {
            email:     order.customer_email,
            phone:     order.customer_phone,
            firstName: nameParts[0],
            lastName:  nameParts.slice(1).join(' ') || nameParts[0],
            cpf:   order.customer_cpf,
            city:  addr.city,
            state: addr.state,
            zip:   addr.cep,
          },
          customData: {
            value:        parseFloat(order.total_price) || 0,
            currency:     'BRL',
            content_ids:  ['solare-luminaria'],
            content_type: 'product',
            num_items:    order.product_quantity || 1,
          },
          eventId: `purchase-${payment_id}`,
        }).catch(e => console.error('Meta CAPI failed:', e));
      }

      return res.status(200).json({ status: 'approved' });
    }

    return res.status(200).json({ status: mpStatus || order?.status || 'pending' });
  } catch (err) {
    console.error('check-payment-status error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
