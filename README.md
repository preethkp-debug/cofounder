# Cofounder

A Claude-inspired workspace for managing your projects, chats, tasks, and analytics.

**Stack:** Vercel serverless functions (Node 20) + Supabase Postgres. Vanilla HTML/CSS/JS frontend — no build step.

## What's inside

- **Dashboard** — daily snapshot of active projects, in-progress work, and what's overdue.
- **Projects** — CRUD with status, deadlines, color tags, progress driven by linked tasks.
- **Tasks** — drag-and-drop Kanban (To do · In progress · Done) with priorities, due dates, assignees.
- **Chats** — Claude-style chat threads. Each conversation can be linked to a project so replies use your real task data ("what should I prioritise?" returns your actual next five tasks ranked by due date).
- **Analytics** — top-line stats, per-project completion bars, 14-day completion chart.

## Quick deploy

The database is already provisioned (Supabase project `cpwyoglqgojygnaxviqd`, region `ap-northeast-1`) and seeded with sample data. You just need to point Vercel at this folder.

### 1. Install Vercel CLI (one-time)

```bash
npm install -g vercel
```

### 2. From inside the `cofounder/` folder

```bash
vercel login        # browser-based auth
vercel              # links the folder to a new Vercel project
```

When prompted:
- *Set up and deploy?* → **Yes**
- *Which scope?* → your personal account
- *Link to existing project?* → **No**
- *Project name?* → `cofounder` (or whatever you like)
- *In which directory is your code?* → `./`
- *Want to modify the settings?* → **No**

### 3. Add the two environment variables

```bash
vercel env add SUPABASE_URL production
# paste: https://cpwyoglqgojygnaxviqd.supabase.co

vercel env add SUPABASE_KEY production
# paste: sb_publishable_O_tH64dvRlF29XvbDESKTw_dn9t8pnH
```

(Do the same for `preview` and `development` if you want `vercel dev` to work locally.)

### 4. Ship it

```bash
vercel deploy --prod
```

Vercel will install `@supabase/supabase-js`, bundle the functions, and give you a production URL.

## Project structure

```
cofounder/
├── api/
│   ├── _lib/supabase.js          Shared Supabase client + helpers
│   ├── analytics.js              GET /api/analytics
│   ├── projects/
│   │   ├── index.js              GET, POST /api/projects
│   │   └── [id].js               GET, PATCH, DELETE /api/projects/:id
│   ├── tasks/
│   │   ├── index.js              GET, POST /api/tasks
│   │   └── [id].js               PATCH, DELETE /api/tasks/:id
│   └── chats/
│       ├── index.js              GET, POST /api/chats
│       └── [id]/
│           ├── index.js          GET, DELETE /api/chats/:id
│           └── messages.js       POST /api/chats/:id/messages
├── public/
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── vercel.json
├── package.json
└── README.md
```

## Database

Tables (all prefixed `cofounder_` so they don't collide with other projects in the same Supabase instance):

- `cofounder_projects` — id, name, description, status (active/on_hold/done), color, deadline, created_at
- `cofounder_tasks` — id, project_id (FK), title, notes, status (todo/doing/done), priority, assignee, due_date, completed_at, created_at
- `cofounder_chats` — id, project_id (FK, nullable), title, created_at
- `cofounder_messages` — id, chat_id (FK), role (user/assistant), content, created_at

RLS is enabled on every table with permissive policies (read+write allowed). Tighten those when you add real authentication.

## API

All endpoints return JSON.

| Method | Path                              | Purpose                          |
|--------|-----------------------------------|----------------------------------|
| GET    | `/api/projects`                   | List projects with task counts   |
| POST   | `/api/projects`                   | Create project                   |
| PATCH  | `/api/projects/:id`               | Update project                   |
| DELETE | `/api/projects/:id`               | Delete (cascades to tasks)       |
| GET    | `/api/tasks?project_id=&status=`  | List tasks                       |
| POST   | `/api/tasks`                      | Create task                      |
| PATCH  | `/api/tasks/:id`                  | Update (sets `completed_at`)     |
| DELETE | `/api/tasks/:id`                  | Delete task                      |
| GET    | `/api/chats`                      | List chats with preview          |
| GET    | `/api/chats/:id`                  | Chat + all messages              |
| POST   | `/api/chats`                      | Create chat                      |
| POST   | `/api/chats/:id/messages`         | Send message, get assistant reply|
| DELETE | `/api/chats/:id`                  | Delete chat                      |
| GET    | `/api/analytics`                  | Aggregated stats                 |

## Wire in a real LLM

The chat assistant currently uses heuristic replies grounded in your Supabase data. To swap in Claude, OpenAI, or another LLM, open `api/chats/[id]/messages.js` and replace the `replyText = ...` branches with a call to your model of choice. Add the API key as another Vercel env var (`ANTHROPIC_API_KEY`, etc.).

## License

MIT.
