import { supa, json, readBody, methodNotAllowed, localReply } from '../../_lib/supabase.js';

// Build a system prompt that gives Claude grounded context about the user's projects/tasks.
async function buildSystemPrompt(chat) {
  const today = new Date().toISOString().slice(0, 10);
  const parts = [
    `You are the user's AI co-founder inside an app called Cofounder. The user is Preeth, a founder running multiple projects. Today is ${today}.`,
    `Your job: answer the user's question using their real project + task data (provided below). Be concrete, specific, and grounded — never invent projects, tasks, or deadlines that aren't listed.`,
    `Style: warm but direct. Short paragraphs. Use a numbered list when ranking or sequencing. Avoid hedging language. If the user asks something the data can't answer, say so plainly and offer the smallest next step.`,
  ];

  // Pull live data from Supabase
  const { data: projects } = await supa
    .from('cofounder_projects')
    .select('id, name, description, status, deadline');
  const { data: tasks } = await supa
    .from('cofounder_tasks')
    .select('id, project_id, title, status, priority, assignee, due_date')
    .neq('status', 'done')
    .order('due_date', { ascending: true, nullsFirst: false });

  const projById = new Map((projects || []).map(p => [p.id, p]));
  const linked = chat.project_id ? projById.get(chat.project_id) : null;

  if (linked) {
    parts.push(
      `\nTHIS CHAT IS LINKED TO PROJECT: "${linked.name}"` +
      (linked.description ? ` — ${linked.description}` : '') +
      (linked.deadline ? ` (deadline ${linked.deadline})` : '') +
      `. Default to talking about this project unless the user asks more broadly.`
    );
  } else {
    parts.push(`\nTHIS CHAT IS GENERAL (not linked to a specific project). Answer across all projects.`);
  }

  // All active projects
  const active = (projects || []).filter(p => p.status !== 'done');
  if (active.length) {
    parts.push(
      `\nACTIVE PROJECTS:\n` +
      active.map(p => `- ${p.name} [${p.status}]${p.deadline ? ` due ${p.deadline}` : ''}${p.description ? ` — ${p.description}` : ''}`).join('\n')
    );
  }

  // Open tasks (sorted by due date)
  if (tasks && tasks.length) {
    parts.push(
      `\nOPEN TASKS (oldest deadline first):\n` +
      tasks.slice(0, 25).map(t => {
        const proj = projById.get(t.project_id)?.name || 'No project';
        return `- ${t.title} [${t.status}, ${t.priority}]${t.due_date ? ` due ${t.due_date}` : ''} — ${proj}${t.assignee ? ` (${t.assignee})` : ''}`;
      }).join('\n')
    );
  }

  return parts.join('\n');
}

async function callClaude({ system, history }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not set');

  const body = {
    model: 'claude-haiku-4-5',
    max_tokens: 600,
    system,
    messages: history.map(m => ({ role: m.role, content: m.content })),
  };

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Anthropic ${resp.status}: ${t.slice(0, 300)}`);
  }
  const data = await resp.json();
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
  if (!text) throw new Error('Empty Claude response');
  return text;
}

export default async function handler(req, res) {
  const id = req.query.id;
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  try {
    const b = await readBody(req);
    if (!b.content || !b.content.trim()) return json(res, 400, { error: 'content required' });
    const content = b.content.trim();

    const { data: chat, error: cerr } = await supa
      .from('cofounder_chats').select('*').eq('id', id).single();
    if (cerr) return json(res, 404, { error: 'chat not found' });

    // Pull existing message history BEFORE inserting the new user message,
    // so the array passed to Claude ends naturally on the new turn.
    const { data: priorMessages } = await supa
      .from('cofounder_messages')
      .select('role, content')
      .eq('chat_id', id)
      .order('id', { ascending: true });

    // Insert the user message
    await supa.from('cofounder_messages').insert({
      chat_id: +id, role: 'user', content,
    });

    // Build the conversation array for Claude.
    // Claude expects messages to alternate user/assistant and start with 'user'.
    const history = [...(priorMessages || []), { role: 'user', content }];

    let replyText;
    let source = 'claude';
    try {
      const system = await buildSystemPrompt(chat);
      replyText = await callClaude({ system, history });
    } catch (e) {
      console.error('Claude call failed:', e.message);
      // Graceful degradation — never let the chat break.
      let contextLines = '';
      if (chat.project_id) {
        const { data: proj } = await supa
          .from('cofounder_projects').select('name').eq('id', chat.project_id).single();
        if (proj) contextLines = `\n\nFor context, this chat is linked to "${proj.name}".`;
      }
      replyText = localReply(content, contextLines);
      source = 'fallback';
    }

    await supa.from('cofounder_messages').insert({
      chat_id: +id, role: 'assistant', content: replyText,
    });

    const { data: messages } = await supa
      .from('cofounder_messages').select('*').eq('chat_id', id).order('id', { ascending: true });
    return json(res, 200, { messages: messages || [], source });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: e.message });
  }
}
