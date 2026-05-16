// Shared Supabase client + helpers for Vercel serverless functions.
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY; // anon or publishable; RLS policies allow read/write

if (!url || !key) {
  console.warn('Missing SUPABASE_URL or SUPABASE_KEY env vars.');
}

export const supa = createClient(url, key, { auth: { persistSession: false } });

export function json(res, status, body) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(status).send(JSON.stringify(body));
}

export function methodNotAllowed(res, allowed) {
  res.setHeader('Allow', allowed.join(', '));
  return json(res, 405, { error: 'method not allowed' });
}

export async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body.length) {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return new Promise((resolve, reject) => {
    let s = '';
    req.on('data', c => { s += c; if (s.length > 1e6) reject(new Error('too large')); });
    req.on('end', () => { try { resolve(s ? JSON.parse(s) : {}); } catch { resolve({}); } });
    req.on('error', reject);
  });
}

// Decorate a task row with its project name/color
export async function decorateTasks(rows) {
  if (!rows.length) return [];
  const ids = [...new Set(rows.map(r => r.project_id).filter(Boolean))];
  if (!ids.length) return rows.map(r => ({ ...r, project_name: null, project_color: null }));
  const { data: projs } = await supa.from('cofounder_projects').select('id,name,color').in('id', ids);
  const map = new Map((projs || []).map(p => [p.id, p]));
  return rows.map(r => {
    const p = map.get(r.project_id);
    return { ...r, project_name: p?.name || null, project_color: p?.color || null };
  });
}

export function localReply(input, contextLines = '') {
  const t = (input || '').toLowerCase();
  if (/^(hi|hey|hello)\b/.test(t)) return `Hey — happy to help. What are you working on right now?${contextLines}`;
  if (t.includes('idea') || t.includes('brainstorm'))
    return `Three angles to try:\n1. Start from the user's frustration — what makes them mutter under their breath?\n2. Start from the outcome — what does success look like in a screenshot?\n3. Start from the identity — what kind of person are they becoming when they use this?${contextLines}`;
  if (t.endsWith('?'))
    return `Good question. Write down the answer you're hoping for, then list what would have to be true for it to be the right one. The "what would have to be true" list is usually the actual work.${contextLines}`;
  return `Noted. A useful next move: break that into the smallest version you could ship today — and add it as a task so it doesn't drift.${contextLines}`;
}
