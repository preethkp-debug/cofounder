import { supa, json, methodNotAllowed } from '../../_lib/supabase.js';

export default async function handler(req, res) {
  const id = req.query.id;
  try {
    if (req.method === 'GET') {
      const { data: chat, error } = await supa.from('cofounder_chats').select('*').eq('id', id).single();
      if (error) return json(res, 404, { error: 'not found' });
      let project = null;
      if (chat.project_id) {
        const { data: p } = await supa.from('cofounder_projects').select('id,name,color').eq('id', chat.project_id).single();
        project = p;
      }
      const { data: messages } = await supa.from('cofounder_messages').select('*').eq('chat_id', id).order('id', { ascending: true });
      return json(res, 200, {
        ...chat,
        project_name: project?.name || null,
        project_color: project?.color || null,
        messages: messages || [],
      });
    }
    if (req.method === 'DELETE') {
      const { error } = await supa.from('cofounder_chats').delete().eq('id', id);
      if (error) throw error;
      return json(res, 200, { ok: true });
    }
    return methodNotAllowed(res, ['GET', 'DELETE']);
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: e.message });
  }
}
