import { supa, json, readBody, methodNotAllowed } from '../_lib/supabase.js';

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const { data: chats, error } = await supa.from('cofounder_chats').select('*').order('id', { ascending: false });
      if (error) throw error;
      const ids = (chats || []).map(c => c.id);
      const projIds = [...new Set((chats || []).map(c => c.project_id).filter(Boolean))];

      const [{ data: msgs }, { data: projs }] = await Promise.all([
        ids.length ? supa.from('cofounder_messages').select('chat_id, content, id').in('chat_id', ids) : Promise.resolve({ data: [] }),
        projIds.length ? supa.from('cofounder_projects').select('id,name,color').in('id', projIds) : Promise.resolve({ data: [] }),
      ]);
      const projMap = new Map((projs || []).map(p => [p.id, p]));
      const msgByChat = new Map();
      (msgs || []).forEach(m => {
        const c = msgByChat.get(m.chat_id) || { count: 0, last: null, lastId: -1 };
        c.count++;
        if (m.id > c.lastId) { c.lastId = m.id; c.last = m.content; }
        msgByChat.set(m.chat_id, c);
      });
      const out = (chats || []).map(c => {
        const p = projMap.get(c.project_id);
        const m = msgByChat.get(c.id) || { count: 0, last: null };
        return {
          ...c,
          project_name: p?.name || null,
          project_color: p?.color || null,
          last_message: m.last,
          message_count: m.count,
        };
      });
      return json(res, 200, out);
    }
    if (req.method === 'POST') {
      const b = await readBody(req);
      if (!b.title || !b.title.trim()) return json(res, 400, { error: 'title required' });
      const { data, error } = await supa.from('cofounder_chats').insert({
        title: b.title.trim(),
        project_id: b.project_id ? +b.project_id : null,
      }).select().single();
      if (error) throw error;
      return json(res, 200, data);
    }
    return methodNotAllowed(res, ['GET', 'POST']);
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: e.message });
  }
}
