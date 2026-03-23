import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || 'solare@2024';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Auth
  const { password, from, to, search, status, method, page = 1 } = req.query;
  if (password !== DASHBOARD_PASSWORD) {
    return res.status(401).json({ error: 'Senha incorreta.' });
  }

  const pageSize = 50;
  const pageNum  = Math.max(1, parseInt(page));
  const offset   = (pageNum - 1) * pageSize;

  try {
    // ── Build filtered query ──────────────────────────────────
    let query = supabase
      .from('orders')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (from)   query = query.gte('created_at', `${from}T00:00:00`);
    if (to)     query = query.lte('created_at', `${to}T23:59:59`);
    if (status && status !== 'all') query = query.eq('status', status);
    if (method && method !== 'all') query = query.eq('payment_method', method);
    if (search) {
      query = query.or(
        `customer_name.ilike.%${search}%,customer_email.ilike.%${search}%,customer_phone.ilike.%${search}%`
      );
    }

    const { data: orders, count, error } = await query.range(offset, offset + pageSize - 1);
    if (error) throw error;

    // ── Summary stats (all time, no filter) ──────────────────
    const { data: allOrders, error: err2 } = await supabase
      .from('orders')
      .select('status, payment_method, total_price, created_at');
    if (err2) throw err2;

    const today = new Date().toISOString().slice(0, 10);

    const stats = {
      total_pedidos:    allOrders.length,
      total_pagos:      allOrders.filter(o => o.status === 'approved').length,
      total_pix_pendente: allOrders.filter(o => o.status === 'pending' && o.payment_method === 'pix').length,
      total_faturado:   allOrders.filter(o => o.status === 'approved').reduce((s, o) => s + parseFloat(o.total_price || 0), 0),
      faturado_hoje:    allOrders.filter(o => o.status === 'approved' && o.created_at?.slice(0, 10) === today).reduce((s, o) => s + parseFloat(o.total_price || 0), 0),
      pedidos_hoje:     allOrders.filter(o => o.created_at?.slice(0, 10) === today).length,
      pagos_hoje:       allOrders.filter(o => o.status === 'approved' && o.created_at?.slice(0, 10) === today).length,
      cartao_total:     allOrders.filter(o => o.status === 'approved' && o.payment_method === 'credit_card').length,
      pix_total:        allOrders.filter(o => o.status === 'approved' && o.payment_method === 'pix').length,
    };

    return res.status(200).json({
      stats,
      orders,
      total: count,
      page: pageNum,
      pageSize,
      totalPages: Math.ceil(count / pageSize),
    });

  } catch (err) {
    console.error('Dashboard error:', err);
    return res.status(500).json({ error: 'Erro interno.' });
  }
}
