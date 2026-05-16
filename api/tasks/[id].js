import { supa, json, readBody, methodNotAllowed, decorateTasks } from '../_lib/supabase.js';

export default async function handler(req, res) {
  const id = req.query.id;
  try {
    if (req.method === 'PATCH') {
      const b = await readBody(req);
      const update = {};
      for (const k of ['project_id','title','notes','status','priority','assignee','due_date']) if (k in b) update[k] = b[k];
      if (update.project_id === '' || update.project_id === undefined) {
        if ('project_id' in b) update.project_id = null;
      } else if (update.project_id != null) update.project_id = +update.project_id;
      if (update.due_date === '') update.due_date = null;
      if ('status' in b) update.completed_at = b.status === 'done' ? new Date().toISOString() : null;
      const { data, error } = await supa.from('cofounder_tasks').update(update).eq('id', id).select().single();
      if (error) throw error;
      const [decorated] = await decorateTasks([data]);
      return json(res, 200, decorated);
    }
    if (req.method === 'DELETE') {
      const { error } = await supa.from('cofounder_tasks').delete().eq('id', id);
      if (error) throw error;
      return json(res, 200, { ok: true });
    }
    return methodNotAllowed(res, ['PATCH', 'DELETE']);
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: e.message });
  }
}
