import { createClient } from '@supabase/supabase-js';
import { notifyPaymentApproved, schedulePixReminder } from './send-notification.js';
import { sendMetaEvent } from './meta-capi.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PAGBANK_TOKEN = process.env.PAGBANK_TOKEN;
const PAGBANK_BASE  = 'https://api.pagseguro.com';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

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
      cardEncrypted,
      cardHolder,
      installments,
      shippingMethod,
      shippingPrice,
    } = req.body;

    // ── Validação ──────────────────────────────────────────
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const cpfDigits  = String(customerCpf || '').replace(/\D/g, '');
    const parsedTotal = parseFloat(totalPrice);
    const parsedQty   = parseInt(quantity);

    if (!customerName || String(customerName).trim().split(/\s+/).length < 2)
      return res.status(400).json({ error: 'Nome completo obrigatório.' });
    if (!emailRegex.test(String(customerEmail || '')))
      return res.status(400).json({ error: 'E-mail inválido.' });
    if (cpfDigits.length !== 11)
      return res.status(400).json({ error: 'CPF inválido.' });
    if (isNaN(parsedTotal) || parsedTotal <= 0 || parsedTotal > 50000)
      return res.status(400).json({ error: 'Valor inválido.' });
    if (isNaN(parsedQty) || parsedQty < 1 || parsedQty > 100)
      return res.status(400).json({ error: 'Quantidade inválida.' });
    if (!customerAddress?.cep || String(customerAddress.cep).replace(/\D/g, '').length !== 8)
      return res.status(400).json({ error: 'CEP inválido.' });
    if (!['pix', 'credit_card'].includes(String(paymentMethodId)))
      return res.status(400).json({ error: 'Método de pagamento inválido.' });

    const isPix = paymentMethodId === 'pix';
    const amountCents = Math.round(parsedTotal * 100);
    const refId = `order-${Date.now()}`;

    const nameParts = customerName.trim().split(/\s+/);
    const firstName  = nameParts[0];
    const lastName   = nameParts.slice(1).join(' ') || firstName;

    const phoneDigits = String(customerPhone || '').replace(/\D/g, '');

    // ── Montar pedido PagBank ──────────────────────────────
    const orderBody = {
      reference_id: refId,
      customer: {
        name:   customerName.trim(),
        email:  customerEmail.trim().toLowerCase(),
        tax_id: cpfDigits,
        ...(phoneDigits.length >= 10 && {
          phones: [{
            country: '55',
            area:    phoneDigits.slice(0, 2),
            number:  phoneDigits.slice(2),
            type:    'MOBILE',
          }],
        }),
      },
      items: [{
        reference_id: 'solare-luminaria',
        name:         `Luminária Solar Solare — Kit ${quantity} unidades`,
        quantity:     1,
        unit_amount:  amountCents,
      }],
      notification_urls: [`${process.env.SITE_URL}/api/pagbank-webhook`],
    };

    if (isPix) {
      // Expira em 30 minutos
      const expiration = new Date(Date.now() + 30 * 60 * 1000)
        .toISOString()
        .replace(/\.\d{3}Z$/, '-03:00');
      orderBody.qr_codes = [{
        amount:          { value: amountCents },
        expiration_date: expiration,
      }];
    } else {
      orderBody.charges = [{
        reference_id: `${refId}-charge`,
        description:  `Luminária Solar Solare — Kit ${quantity} unidades`,
        amount:        { value: amountCents, currency: 'BRL' },
        payment_method: {
          type:         'CREDIT_CARD',
          installments: parseInt(installments) || 1,
          capture:      true,
          card: {
            encrypted: cardEncrypted,
            holder:    { name: (cardHolder || customerName).trim() },
            store:     false,
          },
        },
      }];
    }

    // ── Chamar API PagBank ────────────────────────────────
    const pbResponse = await fetch(`${PAGBANK_BASE}/orders`, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${PAGBANK_TOKEN}`,
        'Content-Type':  'application/json',
        'Accept':        'application/json',
      },
      body: JSON.stringify(orderBody),
    });

    const pbResult = await pbResponse.json();

    if (!pbResponse.ok) {
      console.error('[PagBank Error]', JSON.stringify(pbResult));
      const errMsg = pbResult?.error_messages?.[0]?.description
        || pbResult?.message
        || 'Erro no processamento.';
      return res.status(400).json({ error: errMsg, details: pbResult });
    }

    // ── Determinar status ──────────────────────────────────
    let paymentStatus = 'pending';
    let pbPaymentId   = pbResult.id;

    if (!isPix) {
      const chargeStatus = pbResult.charges?.[0]?.status;
      if (chargeStatus === 'PAID')     paymentStatus = 'approved';
      else if (chargeStatus === 'DECLINED') paymentStatus = 'rejected';
      pbPaymentId = pbResult.charges?.[0]?.id || pbResult.id;
    }

    // ── Salvar no Supabase ────────────────────────────────
    const orderData = {
      customer_name:       customerName,
      customer_email:      customerEmail,
      customer_cpf:        customerCpf,
      customer_phone:      customerPhone,
      customer_address:    customerAddress,
      product_quantity:    quantity,
      product_light_color: lightColor,
      total_price:         totalPrice,
      payment_method:      paymentMethodId,
      mp_payment_id:       String(pbPaymentId),
      status:              paymentStatus,
      shipping_method:     shippingMethod,
      shipping_price:      shippingPrice,
    };

    if (isPix) {
      const qrCode = pbResult.qr_codes?.[0];
      orderData.pix_qr_code        = qrCode?.text ?? null;
      orderData.pix_qr_code_base64 = qrCode?.links?.find(l => l.rel === 'QRCODE.PNG')?.href ?? null;
    }

    const { data: order, error: dbError } = await supabase
      .from('orders')
      .insert(orderData)
      .select()
      .single();

    if (dbError) console.error('Supabase Error:', dbError);

    // ── Reminder Pix (2 min) ──────────────────────────────
    if (isPix) {
      const pixCode = pbResult.qr_codes?.[0]?.text;
      if (pixCode) {
        schedulePixReminder({ customerName, customerEmail, pixCode })
          .catch(e => console.error('Pix reminder failed (non-fatal):', e));
      }
    }

    // ── Meta CAPI + Notificação para cartão aprovado ──────
    if (paymentStatus === 'approved') {
      sendMetaEvent({
        eventName:      'Purchase',
        eventSourceUrl: 'https://lojassolare.com.br/obrigado.html',
        userData: {
          email:     customerEmail,
          phone:     customerPhone,
          firstName, lastName,
          cpf:  customerCpf,
          city:  customerAddress?.city,
          state: customerAddress?.state,
          zip:   customerAddress?.cep,
        },
        customData: {
          value:        parsedTotal,
          currency:     'BRL',
          content_ids:  ['solare-luminaria'],
          content_type: 'product',
          num_items:    quantity,
        },
        eventId: `purchase-${pbPaymentId}`,
      }).catch(e => console.error('Meta CAPI failed (non-fatal):', e));

      await notifyPaymentApproved({
        customerName, customerEmail, customerPhone,
        totalPrice, shippingMethod,
        orderId: order?.id || pbPaymentId,
      });
    }

    return res.status(200).json({
      success:       true,
      status:        paymentStatus,
      id:            pbPaymentId,
      orderId:       order?.id || null,
      qr_code:       isPix ? (pbResult.qr_codes?.[0]?.text ?? null) : null,
      qr_code_base64: isPix ? (pbResult.qr_codes?.[0]?.links?.find(l => l.rel === 'QRCODE.PNG')?.href ?? null) : null,
    });

  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
