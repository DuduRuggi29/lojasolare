/**
 * Notification helper for Solare Checkout
 * Sends emails via Resend and SMS via Twilio
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY;

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_FROM = process.env.TWILIO_PHONE_FROM;
const FROM_EMAIL = process.env.FROM_EMAIL || 'pedidos@lojassolare.com.br';

// ─────────────────────────────────────────────
// Email Templates
// ─────────────────────────────────────────────

function approvedEmailHTML({ customerName, totalPrice, shippingMethod, orderId }) {
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f7f5;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7f5;padding:40px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.07);">
        
        <!-- Header -->
        <tr><td style="background:#1a3c34;padding:32px;text-align:center;">
          <h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:700;letter-spacing:-0.5px;">🌞 Solare</h1>
          <p style="color:rgba(255,255,255,0.7);margin:6px 0 0;font-size:13px;">lojassolare.com.br</p>
        </td></tr>

        <!-- Confirmed Badge -->
        <tr><td style="padding:32px 40px 0;text-align:center;">
          <div style="display:inline-block;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:50px;padding:10px 24px;margin-bottom:20px;">
            <span style="color:#16a34a;font-weight:700;font-size:14px;">✅ Pagamento Confirmado</span>
          </div>
          <h2 style="color:#1a1a1a;margin:0 0 8px;font-size:24px;">Pedido aprovado, ${escapeHtml(customerName.split(' ')[0])}! 🎉</h2>
          <p style="color:#6b7280;font-size:15px;margin:0 0 28px;line-height:1.6;">
            Recebemos o seu pagamento e seu pedido já está sendo preparado com carinho.
          </p>
        </td></tr>

        <!-- Order Details -->
        <tr><td style="padding:0 40px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
            <tr>
              <td style="padding:16px 20px;border-bottom:1px solid #e5e7eb;">
                <span style="font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Número do Pedido</span><br>
                <span style="font-size:15px;color:#1a1a1a;font-weight:700;">#${orderId}</span>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 20px;border-bottom:1px solid #e5e7eb;">
                <span style="font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Produto</span><br>
                <span style="font-size:15px;color:#1a1a1a;font-weight:700;">Luminária Solar Solare</span>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 20px;border-bottom:1px solid #e5e7eb;">
                <span style="font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Método de Envio</span><br>
                <span style="font-size:15px;color:#1a1a1a;font-weight:700;">${shippingMethod || 'Envio Regular'}</span>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 20px;">
                <span style="font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Total Pago</span><br>
                <span style="font-size:20px;color:#1a3c34;font-weight:800;">R$ ${parseFloat(totalPrice).toFixed(2).replace('.', ',')}</span>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- CTA -->
        <tr><td style="padding:0 40px 40px;text-align:center;">
          <p style="color:#6b7280;font-size:14px;margin:0 0 20px;line-height:1.6;">
            Você receberá uma atualização assim que seu pedido for enviado. 
            Em caso de dúvidas, entre em contato conosco.
          </p>
          <p style="color:#9ca3af;font-size:12px;margin:0;">© 2025 Solare · lojassolare.com.br</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function pixExpiredEmailHTML({ customerName }) {
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f7f5;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7f5;padding:40px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.07);">
        
        <tr><td style="background:#1a3c34;padding:32px;text-align:center;">
          <h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:700;">🌞 Solare</h1>
          <p style="color:rgba(255,255,255,0.7);margin:6px 0 0;font-size:13px;">lojassolare.com.br</p>
        </td></tr>

        <tr><td style="padding:32px 40px;text-align:center;">
          <div style="font-size:48px;margin-bottom:16px;">⏱️</div>
          <h2 style="color:#1a1a1a;margin:0 0 12px;font-size:22px;">Seu Pix expirou, ${escapeHtml(customerName.split(' ')[0])}.</h2>
          <p style="color:#6b7280;font-size:15px;margin:0 0 28px;line-height:1.7;">
            O código Pix gerado expirou sem pagamento confirmado. 
            Mas fique tranquilo — seus produtos continuam disponíveis!
          </p>
          <a href="https://lojassolare.com.br" 
             style="display:inline-block;background:#4CAF50;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:700;font-size:15px;">
            Finalizar Compra Novamente
          </a>
        </td></tr>

        <tr><td style="padding:0 40px 40px;text-align:center;">
          <p style="color:#9ca3af;font-size:12px;margin:0;">© 2025 Solare · lojassolare.com.br</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─────────────────────────────────────────────
// Email Sender (Resend)
// ─────────────────────────────────────────────

export async function sendEmail({ to, subject, html }) {
  if (!RESEND_API_KEY) {
    console.warn('[Notifications] RESEND_API_KEY not set, skipping email.');
    return;
  }
  try {
    console.log(`[Resend] Attempting to send email from ${FROM_EMAIL} to ${to}...`);
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
    });
    
    const data = await res.json();
    
    if (!res.ok) {
      console.error('[Resend Error Response]', JSON.stringify(data, null, 2));
    } else {
      console.log('[Resend Success]', data.id);
    }
  } catch (e) {
    console.error('[Resend Exception]', e.message);
  }
}

// ─────────────────────────────────────────────
// SMS Sender (Twilio)
// ─────────────────────────────────────────────

export async function sendSMS({ to, message }) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_FROM) {
    console.warn('[Notifications] Twilio credentials not set, skipping SMS.');
    return;
  }
  try {
    const body = new URLSearchParams({
      From: TWILIO_PHONE_FROM,
      To: to,
      Body: message,
    });
    const credentials = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });
    if (!res.ok) {
      const err = await res.json();
      console.error('[Twilio Error]', err);
    } else {
      console.log('[Twilio] SMS sent to', to);
    }
  } catch (e) {
    console.error('[Twilio Exception]', e);
  }
}

// ─────────────────────────────────────────────
// High-Level Notification Functions
// ─────────────────────────────────────────────

export async function notifyPaymentApproved({ customerName, customerEmail, customerPhone, totalPrice, shippingMethod, orderId }) {
  const subject = `✅ Pedido confirmado — Solare #${orderId}`;
  const html = approvedEmailHTML({ customerName, totalPrice, shippingMethod, orderId });

  await sendEmail({ to: customerEmail, subject, html });

  // SMS (phone must be in E.164 format, e.g., +5521999999999)
  if (customerPhone) {
    const phoneE164 = '+55' + customerPhone.replace(/\D/g, '');
    await sendSMS({
      to: phoneE164,
      message: `🌞 Solare: Pedido #${orderId} confirmado! Valor: R$ ${parseFloat(totalPrice).toFixed(2).replace('.', ',')}. Obrigado pela compra!`,
    });
  }
}

export async function notifyPixExpired({ customerName, customerEmail }) {
  const subject = `⏱️ Seu Pix expirou — finalize sua compra na Solare`;
  const html = pixExpiredEmailHTML({ customerName });
  await sendEmail({ to: customerEmail, subject, html });
}

// ─────────────────────────────────────────────
// Pix Reminder — scheduled 2 minutes after generation
// ─────────────────────────────────────────────

function pixReminderEmailHTML({ customerName, pixCode }) {
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f7f5;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7f5;padding:40px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.07);">

        <tr><td style="background:#1a3c34;padding:28px 32px;text-align:center;">
          <h1 style="color:#ffffff;margin:0;font-size:20px;font-weight:700;">🌞 Solare</h1>
          <p style="color:rgba(255,255,255,0.7);margin:6px 0 0;font-size:13px;">lojassolare.com.br</p>
        </td></tr>

        <tr><td style="padding:32px 40px;text-align:center;">
          <div style="font-size:44px;margin-bottom:12px;">⏳</div>
          <h2 style="color:#1a1a1a;margin:0 0 10px;font-size:22px;">
            Seu Pix está esperando, ${escapeHtml(customerName.split(' ')[0])}!
          </h2>
          <p style="color:#6b7280;font-size:15px;margin:0 0 24px;line-height:1.7;">
            Identificamos que você gerou um Pix mas ainda não concluiu o pagamento.<br>
            O código expira em <strong>30 minutos</strong> — não perca seu pedido!
          </p>
          ${pixCode ? `
          <div style="background:#f8fafc;border:1px dashed #d1d5db;border-radius:10px;padding:16px;margin-bottom:24px;word-break:break-all;font-size:12px;color:#374151;font-family:monospace;text-align:left;">
            <p style="margin:0 0 6px;font-size:11px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Código Pix Copia e Cola</p>
            ${pixCode}
          </div>
          ` : ''}
          <a href="https://lojassolare.com.br"
             style="display:inline-block;background:#4CAF50;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:700;font-size:15px;">
            Pagar Agora
          </a>
        </td></tr>

        <tr><td style="padding:0 40px 32px;text-align:center;">
          <p style="color:#9ca3af;font-size:12px;margin:0;line-height:1.6;">
            Se você já realizou o pagamento, por favor ignore este e-mail.<br>
            © 2025 Solare · lojassolare.com.br
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/**
 * Schedule a Pix reminder email 2 minutes after generation.
 * Uses Resend's scheduled_at parameter (ISO 8601).
 * If user already paid, they simply ignore the email.
 */
export async function schedulePixReminder({ customerName, customerEmail, pixCode }) {
  if (!RESEND_API_KEY) {
    console.warn('[Notifications] RESEND_API_KEY not set, skipping Pix reminder schedule.');
    return null;
  }

  const delay = new Date(Date.now() + 2 * 60 * 1000).toISOString(); // 2 minutos
  const subject = `⏳ Você esqueceu de pagar seu Pix — Solare`;
  const html = pixReminderEmailHTML({ customerName, pixCode });

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: customerEmail,
        subject,
        html,
        scheduled_at: delay,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      console.error('[Resend] Pix reminder schedule error:', JSON.stringify(data));
      return null;
    }
    console.log('[Resend] Pix reminder scheduled — id:', data.id);
    return data.id; // retorna o ID para cancelamento posterior
  } catch (e) {
    console.error('[Resend] Pix reminder schedule exception:', e.message);
    return null;
  }
}

export async function cancelPixReminder(reminderId) {
  if (!RESEND_API_KEY || !reminderId) return;
  try {
    await fetch(`https://api.resend.com/emails/${reminderId}/cancel`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}` },
    });
    console.log('[Resend] Pix reminder cancelled — id:', reminderId);
  } catch (e) {
    console.error('[Resend] Cancel reminder failed:', e.message);
  }
}
