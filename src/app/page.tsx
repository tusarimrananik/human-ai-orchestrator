'use client';

import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';

interface Task {
  id: string;
  name: string;
  owner: 'Me' | 'AI' | 'Other';
  priority: 'High' | 'Medium' | 'Low';
  deadline: string;
  estimate: string;
  doneRule: string;
  notes: string;
  dependencies: string[];
  manualStatus: 'todo' | 'progress' | 'done';
  createdAt: number;
}

const STORAGE_KEY = 'smart_task_manager_v1';

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function priorityScore(p: string) {
  return p === 'High' ? 3 : p === 'Medium' ? 2 : 1;
}

export default function SmartTaskManagerPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [mounted, setMounted] = useState(false);
  const [view, setView] = useState<'board' | 'dependency'>('board');
  const [search, setSearch] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [taskName, setTaskName] = useState('');
  const [taskOwner, setTaskOwner] = useState<'Me' | 'AI' | 'Other'>('Me');
  const [taskPriority, setTaskPriority] = useState<'High' | 'Medium' | 'Low'>('Medium');
  const [taskDeadline, setTaskDeadline] = useState('');
  const [taskEstimate, setTaskEstimate] = useState('');
  const [taskDoneRule, setTaskDoneRule] = useState('');
  const [taskNotes, setTaskNotes] = useState('');
  const [selectedDeps, setSelectedDeps] = useState<string[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [svgContent, setSvgContent] = useState<{ width: number; height: number; paths: string[] }>({
    width: 0,
    height: 0,
    paths: [],
  });

  // Load initial tasks from LocalStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setTasks(JSON.parse(stored));
      } else {
        // Default initial sample
        const a = uid(), b = uid(), c = uid(), d = uid();
        const initialTasks: Task[] = [
          { id: a, name: 'Decide product idea', owner: 'Me', priority: 'High', deadline: '', estimate: '30 min', doneRule: 'One idea is chosen', notes: '', dependencies: [], manualStatus: 'todo', createdAt: Date.now() },
          { id: b, name: 'Research competitors', owner: 'AI', priority: 'Medium', deadline: '', estimate: '1 hour', doneRule: 'Competitor list is ready', notes: '', dependencies: [a], manualStatus: 'todo', createdAt: Date.now() + 1 },
          { id: c, name: 'Design homepage', owner: 'AI', priority: 'Medium', deadline: '', estimate: '2 hours', doneRule: 'Homepage design is ready', notes: '', dependencies: [a], manualStatus: 'todo', createdAt: Date.now() + 2 },
          { id: d, name: 'Build homepage', owner: 'Me', priority: 'High', deadline: '', estimate: '3 hours', doneRule: 'Homepage works in browser', notes: '', dependencies: [b, c], manualStatus: 'todo', createdAt: Date.now() + 3 },
        ];
        setTasks(initialTasks);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(initialTasks));
      }
    } catch (e) {
      console.warn('LocalStorage access error:', e);
    }
    setMounted(true);
  }, []);

  // Save to LocalStorage whenever tasks update
  const saveTasks = (newTasks: Task[]) => {
    setTasks(newTasks);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newTasks));
    }
  };

  const computedStatus = (t: Task): 'done' | 'progress' | 'blocked' | 'ready' => {
    if (t.manualStatus === 'done') return 'done';
    if (t.manualStatus === 'progress') return 'progress';
    const deps = (t.dependencies || []).map((id) => tasks.find((x) => x.id === id)).filter(Boolean) as Task[];
    const blocked = deps.some((d) => d.manualStatus !== 'done');
    return blocked ? 'blocked' : 'ready';
  };

  const getFocusTask = () => {
    const ready = tasks.filter((t) => computedStatus(t) === 'ready' && t.owner === 'Me');
    ready.sort((a, b) => {
      const p = priorityScore(b.priority) - priorityScore(a.priority);
      if (p) return p;
      const ad = a.deadline ? new Date(a.deadline).getTime() : Infinity;
      const bd = b.deadline ? new Date(b.deadline).getTime() : Infinity;
      return ad - bd;
    });
    return ready[0];
  };

  // Filter tasks
  const q = search.toLowerCase();
  const filtered = tasks.filter(
    (t) =>
      (!q || (t.name + ' ' + (t.notes || '')).toLowerCase().includes(q)) &&
      (!ownerFilter || t.owner === ownerFilter) &&
      (!priorityFilter || t.priority === priorityFilter)
  );

  const groups: Record<'blocked' | 'ready' | 'progress' | 'done', Task[]> = {
    blocked: [],
    ready: [],
    progress: [],
    done: [],
  };
  filtered.forEach((t) => groups[computedStatus(t)].push(t));
  Object.values(groups).forEach((arr) =>
    arr.sort((a, b) => priorityScore(b.priority) - priorityScore(a.priority))
  );

  const allGroups = { blocked: 0, ready: 0, progress: 0, done: 0 };
  tasks.forEach((t) => allGroups[computedStatus(t)]++);

  const focus = getFocusTask();

  // Draw Dependency SVG curved lines
  useLayoutEffect(() => {
    if (view !== 'dependency' || !stageRef.current || !tasks.length) return;

    const timer = setTimeout(() => {
      const stage = stageRef.current;
      if (!stage) return;

      const stageRect = stage.getBoundingClientRect();
      const width = stage.scrollWidth;
      const height = stage.scrollHeight;
      const paths: string[] = [];

      tasks.forEach((targetTask) => {
        (targetTask.dependencies || []).forEach((depId) => {
          const source = stage.querySelector(`[data-node-id="${depId}"]`);
          const target = stage.querySelector(`[data-node-id="${targetTask.id}"]`);
          if (!source || !target) return;

          const a = source.getBoundingClientRect();
          const b = target.getBoundingClientRect();

          const x1 = a.right - stageRect.left;
          const y1 = a.top - stageRect.top + a.height / 2;
          const x2 = b.left - stageRect.left;
          const y2 = b.top - stageRect.top + b.height / 2;
          const bend = Math.max(32, (x2 - x1) * 0.45);

          const d = `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2 - 8} ${y2}`;
          paths.push(d);
        });
      });

      setSvgContent({ width, height, paths });
    }, 50);

    return () => clearTimeout(timer);
  }, [view, tasks, ownerFilter, priorityFilter, search]);

  // Actions
  const startTask = (id: string) => {
    saveTasks(tasks.map((t) => (t.id === id ? { ...t, manualStatus: 'progress' } : t)));
  };

  const finishTask = (id: string) => {
    saveTasks(tasks.map((t) => (t.id === id ? { ...t, manualStatus: 'done' } : t)));
  };

  const reopenTask = (id: string) => {
    saveTasks(tasks.map((t) => (t.id === id ? { ...t, manualStatus: 'todo' } : t)));
  };

  const deleteTask = (id: string) => {
    const t = tasks.find((x) => x.id === id);
    if (!t) return;
    if (!confirm(`Delete "${t.name}"?`)) return;
    saveTasks(
      tasks
        .filter((x) => x.id !== id)
        .map((x) => ({
          ...x,
          dependencies: (x.dependencies || []).filter((d) => d !== id),
        }))
    );
  };

  const addSample = () => {
    if (tasks.length && !confirm('Add sample tasks to your current board?')) return;
    const a = uid(), b = uid(), c = uid(), d = uid();
    const newSamples: Task[] = [
      { id: a, name: 'Decide product idea', owner: 'Me', priority: 'High', deadline: '', estimate: '30 min', doneRule: 'One idea is chosen', notes: '', dependencies: [], manualStatus: 'todo', createdAt: Date.now() },
      { id: b, name: 'Research competitors', owner: 'AI', priority: 'Medium', deadline: '', estimate: '1 hour', doneRule: 'Competitor list is ready', notes: '', dependencies: [a], manualStatus: 'todo', createdAt: Date.now() + 1 },
      { id: c, name: 'Design homepage', owner: 'AI', priority: 'Medium', deadline: '', estimate: '2 hours', doneRule: 'Homepage design is ready', notes: '', dependencies: [a], manualStatus: 'todo', createdAt: Date.now() + 2 },
      { id: d, name: 'Build homepage', owner: 'Me', priority: 'High', deadline: '', estimate: '3 hours', doneRule: 'Homepage works in browser', notes: '', dependencies: [b, c], manualStatus: 'todo', createdAt: Date.now() + 3 },
    ];
    saveTasks([...tasks, ...newSamples]);
  };

  const exportData = () => {
    const blob = new Blob([JSON.stringify(tasks, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'smart-task-manager-backup.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importData = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const data = JSON.parse(r.result as string);
        if (!Array.isArray(data)) throw new Error();
        saveTasks(data);
      } catch {
        alert('That backup file is not valid.');
      }
    };
    r.readAsText(file);
  };

  const openTaskModal = (id: string | null = null) => {
    setEditId(id);
    const current = tasks.find((t) => t.id === id);
    setTaskName(current?.name || '');
    setTaskOwner(current?.owner || 'Me');
    setTaskPriority(current?.priority || 'Medium');
    setTaskDeadline(current?.deadline || '');
    setTaskEstimate(current?.estimate || '');
    setTaskDoneRule(current?.doneRule || '');
    setTaskNotes(current?.notes || '');
    setSelectedDeps(current?.dependencies || []);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
  };

  const saveTask = () => {
    const name = taskName.trim();
    if (!name) {
      alert('Please enter a task name.');
      return;
    }
    const data = {
      name,
      owner: taskOwner,
      priority: taskPriority,
      deadline: taskDeadline,
      estimate: taskEstimate.trim(),
      doneRule: taskDoneRule.trim(),
      notes: taskNotes.trim(),
      dependencies: selectedDeps,
    };

    if (editId) {
      saveTasks(tasks.map((t) => (t.id === editId ? { ...t, ...data } : t)));
    } else {
      saveTasks([...tasks, { id: uid(), manualStatus: 'todo', createdAt: Date.now(), ...data }]);
    }
    closeModal();
  };

  // Topological calculation for dependency stages
  const getLevels = () => {
    const byId = new Map(tasks.map((t) => [t.id, t]));
    const memo = new Map<string, number>();

    function levelOf(task: Task, stack = new Set<string>()): number {
      if (memo.has(task.id)) return memo.get(task.id)!;
      if (stack.has(task.id)) return 0; // protects against circular loops

      stack.add(task.id);
      const validDeps = (task.dependencies || []).map((id) => byId.get(id)).filter(Boolean) as Task[];
      let level = 0;
      if (validDeps.length) {
        level = 1 + Math.max(...validDeps.map((d) => levelOf(d, new Set(stack))));
      }
      memo.set(task.id, level);
      return level;
    }

    const levels: Record<number, Task[]> = {};
    tasks.forEach((t) => {
      const l = levelOf(t);
      (levels[l] ||= []).push(t);
    });

    return levels;
  };

  const levels = getLevels();
  const orderedLevels = Object.keys(levels)
    .map(Number)
    .sort((a, b) => a - b);

  if (!mounted) {
    return <div className="app" style={{ padding: 24 }}>Loading Smart Task Manager...</div>;
  }

  return (
    <>
      <style jsx global>{`
        :root {
          --bg: #f6f7fb;
          --panel: #ffffff;
          --text: #111827;
          --muted: #6b7280;
          --line: #e5e7eb;
          --accent: #2563eb;
          --danger: #dc2626;
          --shadow: 0 8px 24px rgba(17, 24, 39, 0.08);
        }
        * {
          box-sizing: border-box;
          scrollbar-width: none !important;
          -ms-overflow-style: none !important;
        }
        *::-webkit-scrollbar {
          display: none !important;
          width: 0 !important;
          height: 0 !important;
        }
        body {
          margin: 0;
          font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
          background: var(--bg);
          color: var(--text);
          user-select: none;
        }
        button,
        input,
        select,
        textarea {
          font: inherit;
        }
        .app {
          max-width: 1500px;
          margin: auto;
          padding: 24px;
        }
        .topbar {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: center;
          margin-bottom: 18px;
          flex-wrap: wrap;
        }
        h1 {
          font-size: 26px;
          margin: 0;
        }
        .sub {
          color: var(--muted);
          font-size: 14px;
          margin-top: 4px;
        }
        .actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        button {
          border: 0;
          border-radius: 10px;
          padding: 10px 14px;
          cursor: pointer;
          background: #eef2ff;
          color: #1f2937;
          font-weight: 650;
          transition: all 0.15s ease;
        }
        button:hover {
          opacity: 0.9;
        }
        button.primary {
          background: var(--accent);
          color: white;
        }
        button.danger {
          background: #fee2e2;
          color: #991b1b;
        }
        button.ghost {
          background: white;
          border: 1px solid var(--line);
        }
        button.small {
          padding: 7px 10px;
          border-radius: 8px;
          font-size: 13px;
        }
        .summary {
          display: grid;
          grid-template-columns: 2fr repeat(4, 1fr);
          gap: 12px;
          margin-bottom: 18px;
        }
        .summary .box {
          background: var(--panel);
          border: 1px solid var(--line);
          border-radius: 14px;
          padding: 14px;
          box-shadow: var(--shadow);
        }
        .focus {
          border-left: 4px solid var(--accent) !important;
        }
        .k {
          font-size: 12px;
          color: var(--muted);
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .v {
          font-size: 22px;
          font-weight: 800;
          margin-top: 6px;
        }
        .focus .v {
          font-size: 17px;
          line-height: 1.3;
        }
        .toolbar {
          background: var(--panel);
          border: 1px solid var(--line);
          border-radius: 14px;
          padding: 12px;
          display: flex;
          gap: 10px;
          align-items: center;
          flex-wrap: wrap;
          margin-bottom: 18px;
        }
        .toolbar input,
        .toolbar select {
          border: 1px solid var(--line);
          border-radius: 9px;
          padding: 9px 10px;
          background: white;
        }
        .toolbar input {
          min-width: 240px;
          flex: 1;
        }
        .board {
          display: grid;
          grid-template-columns: repeat(4, minmax(240px, 1fr));
          gap: 14px;
          align-items: start;
        }
        .column {
          background: #eef0f5;
          border-radius: 16px;
          padding: 12px;
          min-height: 380px;
        }
        .column h2 {
          font-size: 15px;
          margin: 2px 4px 10px;
          display: flex;
          justify-content: space-between;
        }
        .count {
          color: var(--muted);
          font-weight: 500;
        }
        .card {
          background: white;
          border: 1px solid var(--line);
          border-radius: 13px;
          padding: 12px;
          margin-bottom: 10px;
          box-shadow: 0 3px 10px rgba(17, 24, 39, 0.05);
        }
        .card-title {
          font-weight: 800;
          font-size: 15px;
          line-height: 1.35;
        }
        .chips {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          margin: 9px 0;
        }
        .chip {
          font-size: 11px;
          padding: 4px 7px;
          border-radius: 999px;
          background: #f3f4f6;
          color: #374151;
        }
        .chip.me {
          background: #dbeafe;
          color: #1d4ed8;
        }
        .chip.ai {
          background: #ede9fe;
          color: #6d28d9;
        }
        .chip.high {
          background: #fee2e2;
          color: #991b1b;
        }
        .chip.med {
          background: #fef3c7;
          color: #92400e;
        }
        .chip.low {
          background: #dcfce7;
          color: #166534;
        }
        .meta {
          font-size: 12px;
          color: var(--muted);
          line-height: 1.45;
          margin: 6px 0;
        }
        .blocked-reason {
          font-size: 12px;
          background: #fff7ed;
          color: #9a3412;
          border-radius: 8px;
          padding: 7px;
          margin: 7px 0;
        }
        .card-actions {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          margin-top: 10px;
        }
        .empty {
          color: #9ca3af;
          text-align: center;
          padding: 30px 10px;
          font-size: 13px;
        }
        .modal-wrap {
          position: fixed;
          inset: 0;
          background: rgba(17, 24, 39, 0.42);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          z-index: 20;
          backdrop-blur: 2px;
        }
        .modal {
          background: white;
          width: min(680px, 100%);
          max-height: 92vh;
          overflow: auto;
          border-radius: 18px;
          padding: 20px;
          box-shadow: 0 24px 70px rgba(0, 0, 0, 0.25);
        }
        .modal h3 {
          margin: 0 0 16px;
        }
        .grid2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        label {
          font-size: 13px;
          font-weight: 700;
          display: block;
          margin-bottom: 6px;
        }
        .field {
          margin-bottom: 13px;
        }
        .field input,
        .field select,
        .field textarea {
          width: 100%;
          border: 1px solid var(--line);
          border-radius: 10px;
          padding: 10px;
          background: white;
        }
        textarea {
          min-height: 80px;
          resize: vertical;
        }
        .deps {
          border: 1px solid var(--line);
          border-radius: 10px;
          padding: 8px;
          max-height: 150px;
          overflow: auto;
        }
        .dep-row {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px;
          font-size: 13px;
          cursor: pointer;
        }
        .dep-row input {
          width: auto;
        }
        .modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          margin-top: 16px;
        }
        .note {
          font-size: 12px;
          color: var(--muted);
          margin-top: 5px;
        }
        .view-switch {
          display: flex;
          gap: 6px;
          margin-left: auto;
        }
        .view-switch button.active {
          background: var(--accent);
          color: white;
        }
        .dependency-view {
          background: var(--panel);
          border: 1px solid var(--line);
          border-radius: 16px;
          box-shadow: var(--shadow);
          overflow: hidden;
        }
        .dependency-head {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: center;
          padding: 14px 16px;
          border-bottom: 1px solid var(--line);
        }
        .dependency-head strong {
          font-size: 15px;
        }
        .dependency-head span {
          font-size: 12px;
          color: var(--muted);
        }
        .dependency-scroll {
          overflow: auto;
          padding: 0;
        }
        .dependency-stage {
          position: relative;
          display: grid;
          grid-auto-flow: column;
          grid-auto-columns: 240px;
          gap: 76px;
          align-items: start;
          padding: 18px 24px 34px;
          min-width: max-content;
        }
        .dep-level {
          position: relative;
          z-index: 2;
          display: flex;
          flex-direction: column;
          gap: 18px;
        }
        .dep-level-title {
          font-size: 11px;
          color: var(--muted);
          text-transform: uppercase;
          letter-spacing: 0.06em;
          margin: 0 2px 2px;
        }
        .dep-node {
          background: white;
          border: 2px solid var(--line);
          border-radius: 12px;
          padding: 11px 12px;
          min-height: 84px;
        }
        .dep-node.ready {
          border-color: #60a5fa;
        }
        .dep-node.progress {
          border-color: #a78bfa;
        }
        .dep-node.done {
          border-color: #4ade80;
        }
        .dep-node.blocked {
          border-color: #fb923c;
        }
        .dep-node-name {
          font-weight: 800;
          font-size: 14px;
          line-height: 1.3;
        }
        .dep-node-meta {
          font-size: 11px;
          color: var(--muted);
          margin-top: 7px;
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }
        .dep-status {
          font-weight: 700;
        }
        .dependency-lines {
          position: absolute;
          left: 0;
          top: 0;
          z-index: 1;
          pointer-events: none;
          overflow: visible;
        }
        .dep-empty {
          padding: 44px 20px;
          text-align: center;
          color: var(--muted);
        }
        @media (max-width: 1050px) {
          .board {
            grid-template-columns: 1fr 1fr;
          }
          .summary {
            grid-template-columns: 1fr 1fr;
          }
        }
        @media (max-width: 650px) {
          .board,
          .summary,
          .grid2 {
            grid-template-columns: 1fr;
          }
          .app {
            padding: 14px;
          }
        }
      `}</style>

      <div className="app">
        <div className="topbar">
          <div>
            <h1>Smart Task Manager</h1>
            <div className="sub">Dependencies decide what is ready. You do not need to guess start dates.</div>
          </div>
          <div className="actions">
            <button className="ghost" onClick={addSample}>
              Add sample
            </button>
            <button className="ghost" onClick={exportData}>
              Export
            </button>
            <button className="ghost" onClick={importData}>
              Import
            </button>
            <button className="primary" onClick={() => openTaskModal()}>
              + Add task
            </button>
          </div>
        </div>

        <div className="summary">
          <div className="box focus">
            <div className="k">What should I do now?</div>
            <div className="v">{focus ? focus.name : 'No ready task for you.'}</div>
          </div>
          <div className="box">
            <div className="k">Blocked</div>
            <div className="v">{allGroups.blocked}</div>
          </div>
          <div className="box">
            <div className="k">Ready</div>
            <div className="v">{allGroups.ready}</div>
          </div>
          <div className="box">
            <div className="k">Working</div>
            <div className="v">{allGroups.progress}</div>
          </div>
          <div className="box">
            <div className="k">Done</div>
            <div className="v">{allGroups.done}</div>
          </div>
        </div>

        <div className="toolbar">
          <input
            id="search"
            placeholder="Search tasks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)}>
            <option value="">All workers</option>
            <option value="Me">Me</option>
            <option value="AI">AI</option>
            <option value="Other">Other person</option>
          </select>
          <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
            <option value="">All priorities</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
          <div className="view-switch">
            <button
              className={`small ${view === 'board' ? 'active' : 'ghost'}`}
              onClick={() => setView('board')}
            >
              Board
            </button>
            <button
              className={`small ${view === 'dependency' ? 'active' : 'ghost'}`}
              onClick={() => setView('dependency')}
            >
              Dependency View
            </button>
          </div>
        </div>

        {/* Board View */}
        <div className="board" style={{ display: view === 'board' ? 'grid' : 'none' }}>
          {(['blocked', 'ready', 'progress', 'done'] as const).map((colKey) => {
            const list = groups[colKey];
            const titleMap = {
              blocked: 'Blocked',
              ready: 'Ready',
              progress: 'In Progress',
              done: 'Done',
            };

            return (
              <div key={colKey} className="column">
                <h2>
                  {titleMap[colKey]} <span className="count">{list.length}</span>
                </h2>
                <div>
                  {!list.length ? (
                    <div className="empty">Nothing here</div>
                  ) : (
                    list.map((t) => {
                      const depNames = (t.dependencies || [])
                        .map((id) => tasks.find((x) => x.id === id))
                        .filter(Boolean) as Task[];
                      const waiting = depNames
                        .filter((d) => d.manualStatus !== 'done')
                        .map((d) => d.name);

                      return (
                        <div key={t.id} className="card">
                          <div className="card-title">{t.name}</div>
                          <div className="chips">
                            <span
                              className={`chip ${
                                t.owner === 'Me' ? 'me' : t.owner === 'AI' ? 'ai' : ''
                              }`}
                            >
                              {t.owner}
                            </span>
                            <span
                              className={`chip ${
                                t.priority === 'High'
                                  ? 'high'
                                  : t.priority === 'Medium'
                                  ? 'med'
                                  : 'low'
                              }`}
                            >
                              {t.priority}
                            </span>
                          </div>
                          {t.deadline && <div className="meta">Deadline: {t.deadline}</div>}
                          {t.estimate && <div className="meta">Estimate: {t.estimate}</div>}
                          {waiting.length > 0 && (
                            <div className="blocked-reason">Waiting for: {waiting.join(', ')}</div>
                          )}
                          {t.doneRule && <div className="meta">Done when: {t.doneRule}</div>}
                          <div className="card-actions">
                            {colKey === 'ready' && (
                              <button className="small primary" onClick={() => startTask(t.id)}>
                                Start
                              </button>
                            )}
                            {colKey === 'progress' && (
                              <button className="small primary" onClick={() => finishTask(t.id)}>
                                Mark done
                              </button>
                            )}
                            {colKey === 'done' && (
                              <button className="small ghost" onClick={() => reopenTask(t.id)}>
                                Reopen
                              </button>
                            )}
                            <button className="small ghost" onClick={() => openTaskModal(t.id)}>
                              Edit
                            </button>
                            <button className="small danger" onClick={() => deleteTask(t.id)}>
                              Delete
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Dependency View */}
        <div className="dependency-view" style={{ display: view === 'dependency' ? 'block' : 'none' }}>
          <div className="dependency-head">
            <div>
              <strong>Dependency View</strong>
              <div>
                <span>Arrows mean: this task must finish before the next one can start.</span>
              </div>
            </div>
          </div>
          <div className="dependency-scroll">
            <div className="dependency-stage" ref={stageRef}>
              {!tasks.length ? (
                <div className="dep-empty">
                  Add some tasks first. Their dependency arrows will appear here.
                </div>
              ) : (
                <>
                  <svg
                    className="dependency-lines"
                    width={svgContent.width}
                    height={svgContent.height}
                    viewBox={`0 0 ${svgContent.width} ${svgContent.height}`}
                    aria-hidden="true"
                  >
                    <defs>
                      <marker
                        id="arrowHead"
                        markerWidth="8"
                        markerHeight="8"
                        refX="7"
                        refY="4"
                        orient="auto"
                        markerUnits="strokeWidth"
                      >
                        <path d="M0,0 L8,4 L0,8 z" fill="#9ca3af" />
                      </marker>
                    </defs>
                    {svgContent.paths.map((d, i) => (
                      <path
                        key={i}
                        d={d}
                        fill="none"
                        stroke="#9ca3af"
                        strokeWidth="2"
                        markerEnd="url(#arrowHead)"
                      />
                    ))}
                  </svg>

                  {orderedLevels.map((level, index) => (
                    <div key={level} className="dep-level">
                      <div className="dep-level-title">
                        {index === 0 ? 'Can start first' : 'Stage ' + (index + 1)}
                      </div>
                      {levels[level].map((t) => {
                        const status = computedStatus(t);
                        const niceStatus =
                          status === 'progress'
                            ? 'In progress'
                            : status[0].toUpperCase() + status.slice(1);

                        return (
                          <div key={t.id} className={`dep-node ${status}`} data-node-id={t.id}>
                            <div className="dep-node-name">{t.name}</div>
                            <div className="dep-node-meta">
                              <span>{t.owner}</span>
                              <span>•</span>
                              <span className="dep-status">{niceStatus}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div
          className="modal-wrap"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div className="modal">
            <h3>{editId ? 'Edit task' : 'Add task'}</h3>
            <div className="field">
              <label>Task name</label>
              <input
                placeholder="Example: Build login page"
                value={taskName}
                onChange={(e) => setTaskName(e.target.value)}
              />
            </div>

            <div className="grid2">
              <div className="field">
                <label>Who will do it?</label>
                <select
                  value={taskOwner}
                  onChange={(e) => setTaskOwner(e.target.value as 'Me' | 'AI' | 'Other')}
                >
                  <option value="Me">Me</option>
                  <option value="AI">AI</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div className="field">
                <label>Priority</label>
                <select
                  value={taskPriority}
                  onChange={(e) => setTaskPriority(e.target.value as 'High' | 'Medium' | 'Low')}
                >
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
              </div>
              <div className="field">
                <label>Deadline (optional)</label>
                <input
                  type="date"
                  value={taskDeadline}
                  onChange={(e) => setTaskDeadline(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Estimated time (optional)</label>
                <input
                  placeholder="Example: 2 hours"
                  value={taskEstimate}
                  onChange={(e) => setTaskEstimate(e.target.value)}
                />
              </div>
            </div>

            <div className="field">
              <label>What must finish before this task?</label>
              <div className="deps">
                {tasks.filter((t) => t.id !== editId).length === 0 ? (
                  <div className="note">No other tasks yet.</div>
                ) : (
                  tasks
                    .filter((t) => t.id !== editId)
                    .map((t) => {
                      const checked = selectedDeps.includes(t.id);
                      return (
                        <label key={t.id} className="dep-row">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedDeps([...selectedDeps, t.id]);
                              } else {
                                setSelectedDeps(selectedDeps.filter((id) => id !== t.id));
                              }
                            }}
                          />{' '}
                          {t.name}
                        </label>
                      );
                    })
                )}
              </div>
              <div className="note">Choose nothing if this task can start immediately.</div>
            </div>

            <div className="field">
              <label>Done means... (optional)</label>
              <input
                placeholder="Example: page works and is deployed"
                value={taskDoneRule}
                onChange={(e) => setTaskDoneRule(e.target.value)}
              />
            </div>

            <div className="field">
              <label>Notes (optional)</label>
              <textarea
                placeholder="Anything useful..."
                value={taskNotes}
                onChange={(e) => setTaskNotes(e.target.value)}
              />
            </div>

            <div className="modal-actions">
              <button className="ghost" onClick={closeModal}>
                Cancel
              </button>
              <button className="primary" onClick={saveTask}>
                Save task
              </button>
            </div>
          </div>
        </div>
      )}

      <input
        type="file"
        ref={fileInputRef}
        accept=".json"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
    </>
  );
}
