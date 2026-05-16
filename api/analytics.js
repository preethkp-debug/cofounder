import { supa, json, methodNotAllowed } from './_lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  try {
    const [
      projectsAll, projectsActive, projectsDone,
      tasksAll, tasksDone, tasksDoing, tasksTodo,
      chatsAll, messagesAll,
    ] = await Promise.all([
      supa.from('cofounder_projects').select('*', { count: 'exact', head: true }),
      supa.from('cofounder_projects').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      supa.from('cofounder_projects').select('*', { count: 'exact', head: true }).eq('status', 'done'),
      supa.from('cofounder_tasks').select('*', { count: 'exact', head: true }),
      supa.from('cofounder_tasks').select('*', { count: 'exact', head: true }).eq('status', 'done'),
      supa.from('cofounder_tasks').select('*', { count: 'exact', head: true }).eq('status', 'doing'),
      supa.from('cofounder_tasks').select('*', { count: 'exact', head: true }).eq('status', 'todo'),
      supa.from('cofounder_chats').select('*', { count: 'exact', head: true }),
      supa.from('cofounder_messages').select('*', { count: 'exact', head: true }),
    ]);

    const stats = {
      projects_total: projectsAll.count || 0,
      projects_active: projectsActive.count || 0,
      projects_done: projectsDone.count || 0,
      tasks_total: tasksAll.count || 0,
      tasks_done: tasksDone.count || 0,
      tasks_doing: tasksDoing.count || 0,
      tasks_todo: tasksTodo.count || 0,
      chats_total: chatsAll.count || 0,
      messages_total: messagesAll.count || 0,
    };

    const { data: projects } = await supa.from('cofounder_projects').select('id,name,color');
    const { data: tasks } = await supa.from('cofounder_tasks').select('project_id, status, completed_at');

    const byProject = (projects || []).map(p => {
      const ts = (tasks || []).filter(t => t.project_id === p.id);
      return {
        id: p.id, name: p.name, color: p.color,
        total: ts.length,
        done: ts.filter(t => t.status === 'done').length,
        doing: ts.filter(t => t.status === 'doing').length,
        todo: ts.filter(t => t.status === 'todo').length,
      };
    }).sort((a, b) => b.total - a.total);

    // 14-day completion window
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 13);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const cmap = {};
    (tasks || []).forEach(t => {
      if (!t.completed_at) return;
      const day = t.completed_at.slice(0, 10);
      if (day < cutoffStr) return;
      cmap[day] = (cmap[day] || 0) + 1;
    });
    const completion = Object.entries(cmap).map(([day, done]) => ({ day, done })).sort((a, b) => a.day.localeCompare(b.day));

    return json(res, 200, { stats, byProject, completion });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: e.message });
  }
}
