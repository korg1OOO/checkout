// server/api/analytics.ts
import { Pool } from 'pg';
import { createClient } from '@supabase/supabase-js';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

export default async function handler(req, res) {
  const { userId } = req.body; // Get user ID from auth token
  const { data: pages } = await supabase.from('checkout_pages').select('id').eq('user_id', userId);
  const pageIds = pages?.map(page => `'${page.id}'`).join(',') || 'NULL';

  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT 
        SUM(total_amount) as total_sales,
        COUNT(*) as total_orders,
        json_agg(json_build_object('date', DATE(created_at), 'revenue', total_amount)) as revenue_by_day,
        json_agg(json_build_object('name', (product->>'name'), 'sales', (product->>'quantity')::integer)) as product_sales
      FROM orders, jsonb_array_elements(products) as product
      WHERE checkout_page_id IN (${pageIds})
    `);
    res.status(200).json(result.rows[0]);
  } finally {
    client.release();
  }
}