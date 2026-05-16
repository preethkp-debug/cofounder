import { supa, json, readBody, methodNotAllowed, decorateTasks } from '../_lib/supabase.js';

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      let q = supa.from('cofounder_tasks').select('*');
      if (req.query.project_id) q = q.eq('project_id', req.query.project_id);
      if (req.query.status) q = q.eq('status', req.query.status);
      const { data, error } = await q;
      if (error) throw error;
      const so = { doing: 0, todo: 1, done: 2 };
      const decorated = await decorateTasks(data || []);
      decorated.sort((a, b) => (so[a.status] - so[b.status]) || ((a.due_date || '9999').localeCompare(b.due_date || '9999')));
      return json(res, 200, decorated);
    }
    if (req.method === 'POST') {
      const b = await readBody(req);
      if (!b.title || !b.title.trim()) return json(res, 400, { error: 'title required' });
      const row = {
        project_id: b.project_id ? +b.project_id : null,
        title: b.title.trim(),
        notes: b.notes || '',
        status: b.status || 'todo',
        priority: b.priority || 'medium',
        assignee: b.assignee || '',
        due_date: b.due_date || null,
        completed_at: b.status === 'done' ? new Date().toISOString() : null,
      };
      const { data, error } = await supa.from('cofounder_tasks').insert(row).select().single();
      if (error) throw error;
      const [decorated] = await decorateTasks([data]);
      return json(res, 200, decorated);
    }
    return methodNotAllowed(res, ['GET', 'POST']);
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: e.message });
  }
}
