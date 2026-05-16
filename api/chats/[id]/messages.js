import { supa, json, readBody, methodNotAllowed, localReply } from '../../_lib/supabase.js';

export default async function handler(req, res) {
  const id = req.query.id;
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  try {
    const b = await readBody(req);
    if (!b.content || !b.content.trim()) return json(res, 400, { error: 'content required' });
    const content = b.content.trim();

    const { data: chat, error: cerr } = await supa.from('cofounder_chats').select('*').eq('id', id).single();
    if (cerr) return json(res, 404, { error: 'chat not found' });

    // Build a small context from linked project + open tasks
    let contextLines = '';
    if (chat.project_id) {
      const { data: proj } = await supa.from('cofounder_projects').select('name').eq('id', chat.project_id).single();
      const { data: open } = await supa.from('cofounder_tasks')
        .select('title, due_date, status')
        .eq('project_id', chat.project_id)
        .neq('status', 'done')
        .order('due_date', { ascending: true, nullsFirst: false })
        .limit(3);
      if (proj) {
        contextLines = `\n\nFor context, this chat is linked to "${proj.name}".`;
        if (open?.length) {
          contextLines += ` Next open tasks: ${open.map(t => `"${t.title}"${t.due_date ? ` (due ${t.due_date})` : ''}`).join('; ')}.`;
        }
      }
    }

    // Handle "priorities" / "status" specifically (they need cross-project queries)
    let replyText;
    const t = content.toLowerCase();
    if (t.includes('priorit')) {
      const { data: open } = await supa.from('cofounder_tasks')
        .select('title, due_date, project_id')
        .neq('status', 'done')
        .order('due_date', { ascending: true, nullsFirst: false })
        .limit(5);
      if (!open?.length) {
        replyText = `You have no open tasks — a rare and beautiful state.${contextLines}`;
      } else {
        const projIds = [...new Set(open.map(x => x.project_id).filter(Boolean))];
        const { data: projs } = await supa.from('cofounder_projects').select('id,name').in('id', projIds);
        const pmap = new Map((projs || []).map(p => [p.id, p.name]));
        replyText = `Next five on your plate:\n${open.map((x, i) => `${i + 1}. ${x.title}${pmap.get(x.project_id) ? ` — ${pmap.get(x.project_id)}` : ''}${x.due_date ? ` (due ${x.due_date})` : ''}`).join('\n')}${contextLines}`;
      }
    } else if (t.includes('summar') || t.includes('status')) {
      const [{ count: active }, { count: doing }, { count: todo }, { count: done }] = await Promise.all([
        supa.from('cofounder_projects').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        supa.from('cofounder_tasks').select('*', { count: 'exact', head: true }).eq('status', 'doing'),
        supa.from('cofounder_tasks').select('*', { count: 'exact', head: true }).eq('status', 'todo'),
        supa.from('cofounder_tasks').select('*', { count: 'exact', head: true }).eq('status', 'done'),
      ]);
      replyText = `Quick status check:\n• ${active} active project(s)\n• ${doing} task(s) in progress\n• ${todo} waiting to start\n• ${done} completed${contextLines}`;
    } else {
      replyText = localReply(content, contextLines);
    }

    await supa.from('cofounder_messages').insert([
      { chat_id: +id, role: 'user', content },
      { chat_id: +id, role: 'assistant', content: replyText },
    ]);

    const { data: messages } = await supa.from('cofounder_messages').select('*').eq('chat_id', id).order('id', { ascending: true });
    return json(res, 200, { messages: messages || [] });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: e.message });
  }
}
