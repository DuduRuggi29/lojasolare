const MP_BASE = 'https://api.mercadopago.com';

async function mp(path, options = {}) {
  const res = await fetch(`${MP_BASE}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

// Encontra (ou cria) o customer no Mercado Pago pelo e-mail.
async function getOrCreateCustomer({ email, firstName, lastName, cpf }) {
  const found = await mp(`/v1/customers/search?email=${encodeURIComponent(email)}`);
  const existing = found.data?.results?.[0];
  if (found.ok && existing?.id) return existing.id;

  const created = await mp('/v1/customers', {
    method: 'POST',
    body: JSON.stringify({
      email,
      first_name: firstName,
      last_name: lastName,
      identification: { type: 'CPF', number: cpf },
    }),
  });
  return created.ok ? created.data.id : null;
}

// Salva o cartão (a partir de um token de uso único) no customer.
// Retorna { customerId, cardId, paymentMethodId } ou null se não foi possível salvar.
export async function saveCardForCustomer({ email, firstName, lastName, cpf, cardToken, firstSix, lastFour }) {
  const customerId = await getOrCreateCustomer({ email, firstName, lastName, cpf });
  if (!customerId) return null;

  const saved = await mp(`/v1/customers/${customerId}/cards`, {
    method: 'POST',
    body: JSON.stringify({ token: cardToken }),
  });
  if (saved.ok && saved.data?.id) {
    return { customerId, cardId: saved.data.id, paymentMethodId: saved.data.payment_method?.id || null };
  }

  // Cartão já salvo antes para esse cliente: reaproveita o que tem os mesmos dígitos
  const list = await mp(`/v1/customers/${customerId}/cards`);
  const match = Array.isArray(list.data) && list.data.find(c =>
    c.first_six_digits === firstSix && c.last_four_digits === lastFour);
  if (match) {
    return { customerId, cardId: match.id, paymentMethodId: match.payment_method?.id || null };
  }
  console.error('[MP] Não foi possível salvar o cartão:', JSON.stringify(saved.data));
  return null;
}
