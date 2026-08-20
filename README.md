# Human + AI Work Orchestrator ⚡

> Production-ready task management system built around the fundamental productivity question: **"What can I work on right now?"**

Traditional project management tools force users to guess arbitrary start dates or manually move tasks across boards. **Human + AI Work Orchestrator** models real human + AI workflows where start availability is dynamically derived from finish-to-start dependencies, active AI agent executions, and external waiting states.

---

## 🌟 Core Innovations & Features

### 1. Zero Guess Start Dates & Automatic Status Engine
- **No arbitrary calendar guessing:** A task’s start availability is automatically determined by dependency completion.
- **Auto BLOCKED ↔ READY:** When prerequisites are unfinished, downstream tasks are locked as `BLOCKED`. As soon as prerequisites are marked `DONE`, dependent tasks automatically flip to `READY` with zero manual dragging.
- **Parallel Branch Support:** When a parent task completes, all parallel branches (assigned to humans, AI agents, or team members) become `READY` simultaneously.
- **Reopening & Cascade Invalidation:** If a completed task is reopened, all downstream dependent tasks immediately recalculate and revert to `BLOCKED`.

### 2. "What Should I Do Now?" Ranking Engine
- Prominently recommends the highest-leverage task for the human user based on:
  - **Downstream unlock multiplier:** Tasks that unblock many other tasks are prioritized.
  - **Critical path status:** Tasks on the project's critical path receive a priority boost.
  - **Priority level:** `CRITICAL` > `HIGH` > `MEDIUM` > `LOW`.
  - **Deadline urgency & duration:** Urgently due and well-scoped tasks rise to the top.
  - **Diagnostic Clarity:** Clearly distinguishes between *"I have other ready tasks I can work on while AI is running"* vs. *"I am genuinely blocked because all remaining work depends on active AI runs"*.

### 3. First-Class AI Workers & WIP Limits
- Workers can be **Me (Human)**, **AI Agents** (Hermes, Claude, Gemini), or **Team Members**.
- **Work-In-Progress (WIP) Limits:** Configurable limits per worker. When an AI agent is at full capacity (e.g. 2/2 active tasks), subsequent tasks show `Waiting for worker capacity` rather than misleading dependency blockage.

### 4. Interactive Dependency DAG Visualization
- Interactive graph powered by React Flow (`@xyflow/react`).
- **Left-to-right topological layout:** Automatically aligns parallel execution branches side-by-side.
- **Visual status and critical path highlights:** Distinct colored borders, dashed pending dependency lines, and magenta-highlighted critical paths.
- **Click-to-inspect:** Click any node to view SMART details, add/remove dependencies, or trigger transitions.

### 5. Circular Dependency Prevention (DAG Cycle Detection)
- Server-side breadth-first traversal validates all dependency creation requests, rejecting circular loops (e.g., $A \rightarrow B \rightarrow C \rightarrow A$) before they can corrupt the graph.

### 6. SMART Planning Framework
- **Specific:** Title + contextual description.
- **Measurable:** Clear "Done When" completion criteria.
- **Actionable:** Assigned worker and AI execution prompts/expected deliverables.
- **Realistic:** Estimated duration (minutes) and WIP capacity tracking.
- **Time-Bound:** Target completion deadlines without forced start dates.

---

## 🛠️ Tech Stack

- **Framework:** [Next.js 15 App Router](https://nextjs.org/) (React 19)
- **Language:** TypeScript
- **Styling:** Tailwind CSS (Dark Mode, modern Linear/Notion aesthetic)
- **Database:** [Neon PostgreSQL](https://neon.tech/) (Serverless Postgres with connection pooling)
- **ORM:** [Prisma ORM](https://www.prisma.io/)
- **Graph Visualization:** [React Flow / @xyflow/react](https://reactflow.dev/)
- **Icons:** Lucide React

---

## 🚀 Local Development Setup

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/tusarimrananik/human-ai-orchestrator.git
cd human-ai-orchestrator
npm install
```

### 2. Configure Environment Variables
Create a `.env` file in the root directory:
```env
DATABASE_URL="postgresql://neondb_owner:<password>@<neon-host>-pooler.c-4.ap-southeast-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require"
DIRECT_URL="postgresql://neondb_owner:<password>@<neon-host>.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=require"
NEXT_PUBLIC_APP_NAME="Human+AI Task Orchestrator"
```

### 3. Run Database Migrations & Seed
```bash
npx prisma db push
npx prisma generate
npx tsx prisma/seed.ts
```

### 4. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🧪 Testing Graph & Engine Correctness
Run the automated test suite verifying cycle prevention, parallel unlocks, and ranking logic:
```bash
npx tsx test-engine.ts
```

---

## 🚢 Deployment (Vercel)

1. Link project with Vercel CLI:
```bash
vercel link
```
2. Set environment variables on Vercel:
```bash
vercel env add DATABASE_URL
vercel env add DIRECT_URL
```
3. Deploy to production:
```bash
vercel --prod
```
