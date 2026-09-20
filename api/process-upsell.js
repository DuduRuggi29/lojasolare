import { createClient } from '@supabase/supabase-js';
import { notifyPaymentApproved } from './send-notification.js';
import { loadEligibleOrder, UPSELL_AMOUNT } from './_upsell.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { orderId, token } = req.body || {};
    if (!orderId || !token) return res.status(400).json({ error: 'Missing orderId or token' });

    // Pedido aprovado no cartão, com cartão salvo, dentro do prazo e sem upsell anterior
    const eligible = await loadEligibleOrder(supabase, orderId);
    if (!eligible.order) return res.status(eligible.status).json({ error: eligible.error });
    const order = eligible.order;

    const upsellAmount  = UPSELL_AMOUNT;
    const nameParts     = order.customer_name.trim().split(/\s+/);
    const firstName     = nameParts[0];
    const lastName      = nameParts.slice(1).join(' ') || firstName;
    const phoneDigits   = String(order.customer_phone || '').replace(/\D/g, '');
    const addr          = order.customer_address || {};
    const cepDigits     = String(addr.cep || '').replace(/\D/g, '');

    const paymentData = {
      transaction_amount: upsellAmount,
      description: 'Upsell — Kit 2 Luminárias Solar Solare',
      statement_descriptor: 'LOJA SOLARE',
      external_reference: `upsell-${orderId}-${Date.now()}`,
      notification_url: `${process.env.SITE_URL}/api/mp-webhook`,
      token,
      payment_method_id: order.mp_card_payment_method,
      installments: 1,
      capture: true,
      payer: {
        type: 'customer',
        id: order.mp_customer_id,
        email: order.customer_email,
      },
      additional_info: {
        items: [
          {
            id:          'luminaria-solar-solare',
            title:       'Luminária Solar Solare',
            description: 'Luminária solar de alta durabilidade com certificação IP65, ideal para jardins, escadas e áreas externas.',
            picture_url: 'https://lojassolare.com.br/luminaria-info.png',
            category_id: 'home',
            quantity:    2,
            unit_price:  upsellAmount / 2,
          },
        ],
        payer: {
          first_name: firstName,
          last_name:  lastName,
          phone: {
            area_code: phoneDigits.slice(0, 2),
            number:    phoneDigits.slice(2),
          },
          address: {
            zip_code:      cepDigits,
            street_name:   addr.street || '',
            street_number: addr.number || '',
          },
        },
        shipments: {
          receiver_address: {
            zip_code:      cepDigits,
            street_name:   addr.street       || '',
            street_number: addr.number       || '',
            apartment:     addr.complement   || '',
            city_name:     addr.city         || '',
            state_name:    addr.state        || '',
          },
        },
      },
    };

    const mpResponse = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}`,
        'X-Idempotency-Key': `upsell-${orderId}-${token}`,
      },
      body: JSON.stringify(paymentData),
    });

    const mpResult = await mpResponse.json();

    if (!mpResponse.ok || mpResult.status === 'rejected') {
      console.error('MP Upsell Error:', mpResult);
      return res.status(400).json({ error: 'Upsell payment failed' });
    }

    // Save upsell order to Supabase
    const upsellOrder = {
      customer_name: order.customer_name,
      customer_email: order.customer_email,
      customer_cpf: order.customer_cpf,
      customer_phone: order.customer_phone,
      customer_address: order.customer_address,
      product_quantity: 2,
      product_light_color: order.product_light_color,
      total_price: upsellAmount,
      payment_method: order.payment_method,
      upsell_of: orderId,
      mp_payment_id: String(mpResult.id),
      status: mpResult.status === 'approved' ? 'approved' : 'pending',
      shipping_method: order.shipping_method,
      shipping_price: 0,
    };

    const { data: savedUpsell } = await supabase
      .from('orders')
      .insert(upsellOrder)
      .select()
      .single();

    // Send notification for upsell approval
    if (mpResult.status === 'approved') {
      await notifyPaymentApproved({
        customerName: order.customer_name,
        customerEmail: order.customer_email,
        customerPhone: order.customer_phone,
        totalPrice: upsellAmount,
        shippingMethod: order.shipping_method,
        orderId: savedUpsell?.id || `MP-${mpResult.id}`,
      });
    }

    return res.status(200).json({
      success: true,
      status: mpResult.status,
    });

  } catch (err) {
    console.error('Upsell error:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
