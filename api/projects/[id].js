import { supa, json, readBody, methodNotAllowed } from '../_lib/supabase.js';

export default async function handler(req, res) {
  const id = req.query.id;
  try {
    if (req.method === 'GET') {
      const { data, error } = await supa.from('cofounder_projects').select('*').eq('id', id).single();
      if (error) return json(res, 404, { error: 'not found' });
      return json(res, 200, data);
    }
    if (req.method === 'PATCH') {
      const b = await readBody(req);
      const update = {};
      for (const k of ['name', 'description', 'status', 'color', 'deadline']) if (k in b) update[k] = b[k] === '' ? null : b[k];
      const { data, error } = await supa.from('cofounder_projects').update(update).eq('id', id).select().single();
      if (error) throw error;
      return json(res, 200, data);
    }
    if (req.method === 'DELETE') {
      const { error } = await supa.from('cofounder_projects').delete().eq('id', id);
      if (error) throw error;
      return json(res, 200, { ok: true });
    }
    return methodNotAllowed(res, ['GET', 'PATCH', 'DELETE']);
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: e.message });
  }
}
