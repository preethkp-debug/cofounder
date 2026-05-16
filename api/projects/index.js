import { supa, json, readBody, methodNotAllowed } from '../_lib/supabase.js';

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      // Fetch all projects and counts in two queries
      const { data: projects, error } = await supa
        .from('cofounder_projects')
        .select('*');
      if (error) throw error;

      const { data: tasks } = await supa.from('cofounder_tasks').select('project_id,status');
      const counts = new Map();
      (tasks || []).forEach(t => {
        const c = counts.get(t.project_id) || { task_count: 0, task_done: 0 };
        c.task_count++; if (t.status === 'done') c.task_done++;
        counts.set(t.project_id, c);
      });
      const so = { active: 0, on_hold: 1, done: 2 };
      const out = (projects || [])
        .map(p => ({ ...p, ...(counts.get(p.id) || { task_count: 0, task_done: 0 }) }))
        .sort((a, b) => (so[a.status] - so[b.status]) || (b.created_at || '').localeCompare(a.created_at || ''));
      return json(res, 200, out);
    }

    if (req.method === 'POST') {
      const b = await readBody(req);
      if (!b.name || !b.name.trim()) return json(res, 400, { error: 'name required' });
      const { data, error } = await supa.from('cofounder_projects').insert({
        name: b.name.trim(),
        description: b.description || '',
        status: b.status || 'active',
        color: b.color || '#D97757',
        deadline: b.deadline || null,
      }).select().single();
      if (error) throw error;
      return json(res, 200, { ...data, task_count: 0, task_done: 0 });
    }

    return methodNotAllowed(res, ['GET', 'POST']);
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: e.message });
  }
}
