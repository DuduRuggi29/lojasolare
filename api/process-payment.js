import { createClient } from '@supabase/supabase-js';
import { notifyPaymentApproved, schedulePixReminder } from './send-notification.js';
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
    const {
      customerName,
      customerEmail,
      customerCpf,
      customerPhone,
      customerAddress,
      quantity,
      lightColor,
      totalPrice,
      paymentMethodId,
      token,
      installments,
      issuerId,
      shippingMethod,
      shippingPrice,
    } = req.body;

    const isPix = paymentMethodId === 'pix';

    // Round to 2 decimal places to avoid floating-point issues (e.g. 8 * 0.95 = 7.6000000000000005)
    const transactionAmount = Math.round(parseFloat(totalPrice) * 100) / 100;

    const nameParts = customerName.trim().split(/\s+/);
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ') || firstName;

    const paymentData = {
      transaction_amount: transactionAmount,
      description: `Luminária Solar Solare - Kit ${quantity} unidades`,
      payment_method_id: paymentMethodId,
      payer: {
        email: customerEmail.trim().toLowerCase(),
        first_name: firstName,
        last_name: lastName,
        identification: {
          type: 'CPF',
          number: customerCpf.replace(/\D/g, ''),
        },
        address: {
          zip_code: customerAddress.cep.replace(/\D/g, ''),
          street_name: customerAddress.street,
          street_number: String(customerAddress.number),
          neighborhood: customerAddress.neighborhood,
          city: customerAddress.city,
          federal_unit: customerAddress.state.toUpperCase(),
        },
      },
      ...(process.env.SITE_URL && { notification_url: `${process.env.SITE_URL}/api/mp-webhook` }),
      external_reference: `order-${Date.now()}`,
    };

    if (isPix) {
      // Pix specific fields
    } else {
      // Card specific fields
      paymentData.token = token;
      paymentData.installments = parseInt(installments);
      paymentData.issuer_id = issuerId;
    }

    const mpResponse = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}`,
        'X-Idempotency-Key': `idemp-${Date.now()}`,
      },
      body: JSON.stringify(paymentData),
    });

    const mpResult = await mpResponse.json();

    if (!mpResponse.ok) {
      console.error('MP Error:', mpResult);
      return res.status(400).json({ error: 'Erro no Mercado Pago', details: mpResult });
    }

    // Save order to Supabase
    const orderData = {
      customer_name: customerName,
      customer_email: customerEmail,
      customer_cpf: customerCpf,
      customer_phone: customerPhone,
      customer_address: customerAddress,
      product_quantity: quantity,
      product_light_color: lightColor,
      total_price: totalPrice,
      payment_method: paymentMethodId,
      mp_payment_id: String(mpResult.id),
      status: mpResult.status === 'approved' ? 'approved' : 'pending',
      shipping_method: shippingMethod,
      shipping_price: shippingPrice,
    };

    if (isPix) {
      orderData.pix_qr_code = mpResult.point_of_interaction?.transaction_data?.qr_code ?? null;
      orderData.pix_qr_code_base64 = mpResult.point_of_interaction?.transaction_data?.qr_code_base64 ?? null;
    }

    const { data: order, error: dbError } = await supabase
      .from('orders')
      .insert(orderData)
      .select()
      .single();

    if (dbError) {
      console.error('Supabase Error:', dbError);
    }

    // Schedule Pix reminder email 2 minutes after generation (if not paid, user gets a nudge)
    if (isPix) {
      const pixQrCode = mpResult.point_of_interaction?.transaction_data?.qr_code;
      if (pixQrCode) {
        schedulePixReminder({
          customerName,
          customerEmail,
          pixCode: pixQrCode,
        }).catch(e => console.error('Pix reminder schedule failed (non-fatal):', e));
      }
    }

    // Fire Meta CAPI Purchase for immediately approved payments (card)
    if (mpResult.status === 'approved') {
      sendMetaEvent({
        eventName: 'Purchase',
        eventSourceUrl: 'https://lojassolare.com.br/obrigado.html',
        userData: {
          email: customerEmail,
          phone: customerPhone,
          firstName: firstName,
          lastName: lastName,
          cpf: customerCpf,
          city: customerAddress?.city,
          state: customerAddress?.state,
          zip: customerAddress?.cep,
        },
        customData: {
          value: transactionAmount,
          currency: 'BRL',
          content_ids: ['solare-luminaria'],
          content_type: 'product',
          num_items: quantity,
        },
        eventId: `purchase-${mpResult.id}`,
      }).catch(e => console.error('Meta CAPI Purchase failed (non-fatal):', e));
    }

    // For card payments approved immediately, notify and save card for 1-click upsell
    if (!isPix && mpResult.status === 'approved') {
      const savedOrder = order || { id: `MP-${mpResult.id}` };
      await notifyPaymentApproved({
        customerName,
        customerEmail,
        customerPhone,
        totalPrice,
        shippingMethod,
        orderId: savedOrder.id,
      });

      // Save card to MP customer for one-click upsell
      try {
        // 1. Create or get customer
        const custResponse = await fetch('https://api.mercadopago.com/v1/customers/search?email=' + encodeURIComponent(customerEmail), {
          headers: { 'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}` }
        });
        const custData = await custResponse.json();
        let mpCustomerId = custData.results?.[0]?.id;

        if (!mpCustomerId) {
          const newCust = await fetch('https://api.mercadopago.com/v1/customers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}` },
            body: JSON.stringify({ email: customerEmail, first_name: customerName.split(' ')[0], last_name: customerName.split(' ').slice(1).join(' ') }),
          });
          const newCustData = await newCust.json();
          mpCustomerId = newCustData.id;
        }

        // 2. Save card (using the original payment token is not possible after payment)
        //    MP provides card info via payment response — save from there
        const mpCardId = mpResult.card?.id || null;

        if (mpCustomerId && order) {
          await supabase.from('orders').update({
            mp_customer_id: String(mpCustomerId),
            mp_card_id: mpCardId ? String(mpCardId) : null,
          }).eq('id', order.id);
        }
      } catch (cardSaveErr) {
        console.error('Card save error (non-fatal):', cardSaveErr);
      }
    }

    return res.status(200).json({
      success: true,
      status: mpResult.status,
      status_detail: mpResult.status_detail,
      id: mpResult.id,
      orderId: order?.id || null,
      qr_code: isPix ? (mpResult.point_of_interaction?.transaction_data?.qr_code ?? null) : null,
      qr_code_base64: isPix ? (mpResult.point_of_interaction?.transaction_data?.qr_code_base64 ?? null) : null,
    });

  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
