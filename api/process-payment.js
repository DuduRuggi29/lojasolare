import { createClient } from '@supabase/supabase-js';

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

    const paymentData = {
      transaction_amount: parseFloat(totalPrice),
      description: `Luminária Solar Solare - Kit ${quantity} unidades`,
      payment_method_id: paymentMethodId,
      payer: {
        email: customerEmail,
        first_name: customerName.split(' ')[0],
        last_name: customerName.split(' ').slice(1).join(' '),
        identification: {
          type: 'CPF',
          number: customerCpf.replace(/\D/g, ''),
        },
        address: {
          zip_code: customerAddress.cep.replace(/\D/g, ''),
          street_name: customerAddress.street,
          street_number: customerAddress.number,
          neighborhood: customerAddress.neighborhood,
          city: customerAddress.city,
          federal_unit: customerAddress.state,
        },
      },
      notification_url: `${process.env.SITE_URL}/api/mp-webhook`,
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
      orderData.pix_qr_code = mpResult.point_of_interaction.transaction_data.qr_code;
      orderData.pix_qr_code_base64 = mpResult.point_of_interaction.transaction_data.qr_code_base64;
    }

    const { data: order, error: dbError } = await supabase
      .from('orders')
      .insert(orderData)
      .select()
      .single();

    if (dbError) {
      console.error('Supabase Error:', dbError);
    }

    return res.status(200).json({
      success: true,
      status: mpResult.status,
      status_detail: mpResult.status_detail,
      id: mpResult.id,
      qr_code: isPix ? mpResult.point_of_interaction.transaction_data.qr_code : null,
      qr_code_base64: isPix ? mpResult.point_of_interaction.transaction_data.qr_code_base64 : null,
    });

  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
