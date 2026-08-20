'use client';

import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import {
  Play,
  CheckCircle2,
  Pencil,
  Trash2,
  Plus,
  Search,
  LayoutGrid,
  GitFork,
  Download,
  Upload,
  Sparkles,
  Clock,
  Lock,
  X,
  ListOrdered,
  ArrowUp,
  ArrowDown,
  ArrowRight,
} from 'lucide-react';

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
  manualStatus: 'triage' | 'todo' | 'progress' | 'done';
  createdAt: number;
}

const STORAGE_KEY = 'smart_task_manager_v1';

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function priorityScore(p: string) {
  return p === 'High' ? 3 : p === 'Medium' ? 2 : 1;
}

export default function Page() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [mounted, setMounted] = useState(false);
  const [view, setView] = useState<'board' | 'triage' | 'dependency'>('board');
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
  const [initialInTriage, setInitialInTriage] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [svgContent, setSvgContent] = useState<{ width: number; height: number; paths: string[] }>({
    width: 0,
    height: 0,
    paths: [],
  });

  // Initial Load from LocalStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setTasks(JSON.parse(stored));
      } else {
        const a = uid(), b = uid(), c = uid(), d = uid(), e = uid();
        const initialTasks: Task[] = [
          { id: a, name: 'Decide product idea', owner: 'Me', priority: 'High', deadline: '', estimate: '30m', doneRule: 'Idea chosen', notes: '', dependencies: [], manualStatus: 'todo', createdAt: Date.now() },
          { id: b, name: 'Research competitors', owner: 'AI', priority: 'Medium', deadline: '', estimate: '45m', doneRule: 'Report ready', notes: '', dependencies: [a], manualStatus: 'todo', createdAt: Date.now() + 1 },
          { id: c, name: 'Design UI layout', owner: 'AI', priority: 'Medium', deadline: '', estimate: '2h', doneRule: 'Figma ready', notes: '', dependencies: [a], manualStatus: 'todo', createdAt: Date.now() + 2 },
          { id: d, name: 'Build MVP', owner: 'Me', priority: 'High', deadline: '', estimate: '3h', doneRule: 'Deployed', notes: '', dependencies: [b, c], manualStatus: 'todo', createdAt: Date.now() + 3 },
          { id: e, name: 'Collect User Feedback', owner: 'Me', priority: 'Medium', deadline: '', estimate: '1h', doneRule: '5 interviews done', notes: '', dependencies: [d], manualStatus: 'triage', createdAt: Date.now() + 4 },
        ];
        setTasks(initialTasks);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(initialTasks));
      }
    } catch (err) {
      console.warn('LocalStorage access error:', err);
    }
    setMounted(true);
  }, []);

  const saveTasks = (newTasks: Task[]) => {
    setTasks(newTasks);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newTasks));
    }
  };

  const computedStatus = (t: Task): 'triage' | 'done' | 'progress' | 'blocked' | 'ready' => {
    if (t.manualStatus === 'triage') return 'triage';
    if (t.manualStatus === 'done') return 'done';
    if (t.manualStatus === 'progress') return 'progress';
    const deps = (t.dependencies || []).map((id) => tasks.find((x) => x.id === id)).filter(Boolean) as Task[];
    const blocked = deps.some((d) => d.manualStatus !== 'done');
    return blocked ? 'blocked' : 'ready';
  };

  // Reorder Tasks (Move Up / Down in Triage list)
  const moveTask = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= tasks.length) return;

    const newTasks = [...tasks];
    const [movedItem] = newTasks.splice(index, 1);
    newTasks.splice(targetIndex, 0, movedItem);
    saveTasks(newTasks);
  };

  const getFocusTask = () => {
    // Pick first READY task for Me in user's prioritized order
    const ready = tasks.filter((t) => computedStatus(t) === 'ready' && t.owner === 'Me');
    return ready[0] || null;
  };

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

  // Tasks in board are those that are committed (not in triage)
  filtered
    .filter((t) => t.manualStatus !== 'triage')
    .forEach((t) => {
      const st = computedStatus(t);
      if (st !== 'triage') groups[st].push(t);
    });

  const allGroups = { blocked: 0, ready: 0, progress: 0, done: 0, triage: 0 };
  tasks.forEach((t) => {
    const st = computedStatus(t);
    allGroups[st]++;
  });

  const focus = getFocusTask();

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
          const bend = Math.max(28, (x2 - x1) * 0.45);

          const d = `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2 - 6} ${y2}`;
          paths.push(d);
        });
      });

      setSvgContent({ width, height, paths });
    }, 50);

    return () => clearTimeout(timer);
  }, [view, tasks, ownerFilter, priorityFilter, search]);

  // When clicking "Start" in Triage, send to Board (todo), where dependency logic automatically places it in Blocked or Ready!
  const startFromTriageToBoard = (id: string) => {
    saveTasks(tasks.map((t) => (t.id === id ? { ...t, manualStatus: 'todo' } : t)));
  };

  // Start execution directly on board
  const startInProgress = (id: string) => {
    saveTasks(tasks.map((t) => (t.id === id ? { ...t, manualStatus: 'progress' } : t)));
  };

  const finishTask = (id: string) => {
    saveTasks(tasks.map((t) => (t.id === id ? { ...t, manualStatus: 'done' } : t)));
  };

  const reopenTask = (id: string) => {
    saveTasks(tasks.map((t) => (t.id === id ? { ...t, manualStatus: 'todo' } : t)));
  };

  const sendBackToTriage = (id: string) => {
    saveTasks(tasks.map((t) => (t.id === id ? { ...t, manualStatus: 'triage' } : t)));
  };

  const deleteTask = (id: string) => {
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
    const a = uid(), b = uid(), c = uid(), d = uid(), e = uid();
    const newSamples: Task[] = [
      { id: a, name: 'Product Spec', owner: 'Me', priority: 'High', deadline: '', estimate: '30m', doneRule: 'Approved', notes: '', dependencies: [], manualStatus: 'todo', createdAt: Date.now() },
      { id: b, name: 'Competitor Analysis', owner: 'AI', priority: 'Medium', deadline: '', estimate: '45m', doneRule: 'Done', notes: '', dependencies: [a], manualStatus: 'todo', createdAt: Date.now() + 1 },
      { id: c, name: 'Wireframe Design', owner: 'AI', priority: 'Medium', deadline: '', estimate: '1h', doneRule: 'Done', notes: '', dependencies: [a], manualStatus: 'todo', createdAt: Date.now() + 2 },
      { id: d, name: 'Engine Implementation', owner: 'Me', priority: 'High', deadline: '', estimate: '2h', doneRule: 'Tests pass', notes: '', dependencies: [b, c], manualStatus: 'todo', createdAt: Date.now() + 3 },
      { id: e, name: 'Draft Announcement', owner: 'Me', priority: 'Low', deadline: '', estimate: '20m', doneRule: 'Ready', notes: '', dependencies: [d], manualStatus: 'triage', createdAt: Date.now() + 4 },
    ];
    saveTasks([...tasks, ...newSamples]);
  };

  const exportData = () => {
    const blob = new Blob([JSON.stringify(tasks, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'tasks-backup.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const openTaskModal = (id: string | null = null, defaultTriage = false) => {
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
    setInitialInTriage(current ? current.manualStatus === 'triage' : defaultTriage || view === 'triage');
    setIsModalOpen(true);
  };

  const saveTask = () => {
    const name = taskName.trim();
    if (!name) return;
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
      saveTasks(
        tasks.map((t) =>
          t.id === editId
            ? { ...t, ...data, manualStatus: initialInTriage ? 'triage' : t.manualStatus === 'triage' ? 'todo' : t.manualStatus }
            : t
        )
      );
    } else {
      saveTasks([
        ...tasks,
        {
          id: uid(),
          manualStatus: initialInTriage ? 'triage' : 'todo',
          createdAt: Date.now(),
          ...data,
        },
      ]);
    }
    setIsModalOpen(false);
  };

  const getLevels = () => {
    const byId = new Map(tasks.map((t) => [t.id, t]));
    const memo = new Map<string, number>();

    function levelOf(task: Task, stack = new Set<string>()): number {
      if (memo.has(task.id)) return memo.get(task.id)!;
      if (stack.has(task.id)) return 0;

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

  if (!mounted) return null;

  return (
    <div className="h-screen w-screen bg-zinc-950 text-zinc-200 flex flex-col antialiased overflow-hidden select-none font-sans text-xs">
      {/* Top Header */}
      <header className="h-11 px-3 border-b border-zinc-800/80 bg-zinc-900/90 flex items-center justify-between gap-2 flex-shrink-0 z-20">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded bg-indigo-600 flex items-center justify-center font-black text-white text-[11px]">
            ⚡
          </div>
          <div className="flex items-center bg-zinc-950 border border-zinc-800 p-0.5 rounded-md">
            <button
              onClick={() => setView('board')}
              className={`px-2 py-0.5 rounded text-[11px] font-semibold transition flex items-center gap-1 ${
                view === 'board' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <LayoutGrid className="w-3 h-3" /> Board
            </button>
            <button
              onClick={() => setView('triage')}
              className={`px-2 py-0.5 rounded text-[11px] font-semibold transition flex items-center gap-1.5 ${
                view === 'triage' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <ListOrdered className="w-3 h-3" /> Triage
              {allGroups.triage > 0 && (
                <span className="bg-indigo-600 text-white text-[9px] px-1 rounded-full font-mono">
                  {allGroups.triage}
                </span>
              )}
            </button>
            <button
              onClick={() => setView('dependency')}
              className={`px-2 py-0.5 rounded text-[11px] font-semibold transition flex items-center gap-1 ${
                view === 'dependency' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <GitFork className="w-3 h-3" /> DAG
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={addSample}
            className="px-2 py-1 rounded bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 text-[11px] transition"
          >
            + Sample
          </button>
          <button
            onClick={exportData}
            className="p-1 rounded bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition"
            title="Export"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-1 rounded bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition"
            title="Import"
          >
            <Upload className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => openTaskModal(null, view === 'triage')}
            className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-[11px] transition shadow"
          >
            + Task
          </button>
        </div>
      </header>

      {/* Stats & Focus Summary Bar */}
      <div className="px-3 py-2 border-b border-zinc-800/60 bg-zinc-950/60 grid grid-cols-5 gap-2 flex-shrink-0 z-10">
        <div className="col-span-2 bg-indigo-950/20 border border-indigo-500/30 rounded-lg px-2.5 py-1.5 flex items-center justify-between gap-2 overflow-hidden">
          <div className="min-w-0">
            <div className="text-[9px] uppercase font-bold text-indigo-400 tracking-wider flex items-center gap-1">
              <Sparkles className="w-2.5 h-2.5" /> DO NOW
            </div>
            <div className="text-xs font-bold text-white truncate">
              {focus ? focus.name : 'No ready task for you'}
            </div>
          </div>
          {focus && (
            <button
              onClick={() => startInProgress(focus.id)}
              className="flex-shrink-0 px-2 py-0.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded text-[10px]"
            >
              Start
            </button>
          )}
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-lg px-2 py-1 flex items-center justify-between">
          <span className="text-[10px] text-rose-400 font-bold uppercase">Blocked</span>
          <span className="text-sm font-black text-rose-400">{allGroups.blocked}</span>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-lg px-2 py-1 flex items-center justify-between">
          <span className="text-[10px] text-emerald-400 font-bold uppercase">Ready</span>
          <span className="text-sm font-black text-emerald-400">{allGroups.ready}</span>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-lg px-2 py-1 flex items-center justify-between">
          <span className="text-[10px] text-blue-400 font-bold uppercase">Working</span>
          <span className="text-sm font-black text-blue-400">{allGroups.progress}</span>
        </div>
      </div>

      {/* Filter Row */}
      <div className="px-3 py-1.5 border-b border-zinc-800/60 bg-zinc-900/30 flex items-center justify-between gap-2 flex-shrink-0">
        <div className="relative flex-1 max-w-xs">
          <Search className="w-3 h-3 text-zinc-500 absolute left-2 top-1.5" />
          <input
            placeholder="Search tasks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded pl-6 pr-2 py-0.5 text-[11px] text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <select
            value={ownerFilter}
            onChange={(e) => setOwnerFilter(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded px-1.5 py-0.5 text-[11px] text-zinc-300 focus:outline-none"
          >
            <option value="">All Assignees</option>
            <option value="Me">Me</option>
            <option value="AI">AI</option>
            <option value="Other">Other</option>
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded px-1.5 py-0.5 text-[11px] text-zinc-300 focus:outline-none"
          >
            <option value="">All Priorities</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 p-2.5 overflow-hidden min-h-0">
        {view === 'board' ? (
          <div className="h-full grid grid-cols-4 gap-2 min-h-0">
            {(['blocked', 'ready', 'progress', 'done'] as const).map((colKey) => {
              const list = groups[colKey];
              const headerMeta = {
                blocked: { title: 'Blocked', color: 'text-rose-400', countBg: 'bg-rose-500/10 text-rose-400' },
                ready: { title: 'Ready', color: 'text-emerald-400', countBg: 'bg-emerald-500/10 text-emerald-400' },
                progress: { title: 'In Progress', color: 'text-blue-400', countBg: 'bg-blue-500/10 text-blue-400' },
                done: { title: 'Done', color: 'text-zinc-400', countBg: 'bg-zinc-800 text-zinc-400' },
              }[colKey];

              return (
                <div
                  key={colKey}
                  className="bg-zinc-900/40 border border-zinc-800/80 rounded-lg flex flex-col min-h-0 overflow-hidden"
                >
                  <div className="px-2.5 py-1.5 border-b border-zinc-800/80 bg-zinc-950/60 flex items-center justify-between flex-shrink-0">
                    <span className={`text-[11px] font-bold uppercase tracking-wider ${headerMeta.color}`}>
                      {headerMeta.title}
                    </span>
                    <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${headerMeta.countBg}`}>
                      {list.length}
                    </span>
                  </div>

                  <div className="p-1.5 space-y-1.5 overflow-y-auto flex-1">
                    {list.length === 0 ? (
                      <div className="py-8 text-center text-[10px] text-zinc-600 italic">Empty</div>
                    ) : (
                      list.map((t) => {
                        const depNames = (t.dependencies || [])
                          .map((id) => tasks.find((x) => x.id === id))
                          .filter(Boolean) as Task[];
                        const waiting = depNames.filter((d) => d.manualStatus !== 'done').map((d) => d.name);

                        return (
                          <div
                            key={t.id}
                            className="group p-2 rounded-md bg-zinc-950 border border-zinc-800/90 hover:border-zinc-700 transition shadow-sm space-y-1"
                          >
                            <div className="flex items-center justify-between gap-1">
                              <span
                                className={`text-[9px] px-1 rounded font-semibold ${
                                  t.owner === 'Me'
                                    ? 'bg-blue-500/10 text-blue-400'
                                    : t.owner === 'AI'
                                    ? 'bg-purple-500/10 text-purple-400'
                                    : 'bg-zinc-800 text-zinc-400'
                                }`}
                              >
                                {t.owner}
                              </span>
                              <span
                                className={`text-[9px] px-1 rounded font-semibold ${
                                  t.priority === 'High'
                                    ? 'text-rose-400 bg-rose-500/10'
                                    : t.priority === 'Medium'
                                    ? 'text-amber-400 bg-amber-500/10'
                                    : 'text-zinc-400'
                                }`}
                              >
                                {t.priority}
                              </span>
                            </div>

                            <div className="text-xs font-semibold text-zinc-100 leading-snug line-clamp-2">
                              {t.name}
                            </div>

                            {waiting.length > 0 && (
                              <div className="text-[10px] text-rose-400/90 bg-rose-500/10 px-1.5 py-0.5 rounded truncate flex items-center gap-1">
                                <Lock className="w-2.5 h-2.5 flex-shrink-0" />
                                <span className="truncate">Waiting: {waiting.join(', ')}</span>
                              </div>
                            )}

                            {t.estimate && (
                              <div className="text-[10px] text-zinc-500 flex items-center gap-1">
                                <Clock className="w-2.5 h-2.5" /> {t.estimate}
                              </div>
                            )}

                            <div className="flex items-center justify-end gap-1 pt-1 border-t border-zinc-900">
                              {colKey === 'ready' && (
                                <button
                                  onClick={() => startInProgress(t.id)}
                                  className="px-1.5 py-0.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-medium"
                                >
                                  Start
                                </button>
                              )}
                              {colKey === 'progress' && (
                                <button
                                  onClick={() => finishTask(t.id)}
                                  className="px-1.5 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-medium"
                                >
                                  Done
                                </button>
                              )}
                              {colKey === 'done' && (
                                <button
                                  onClick={() => reopenTask(t.id)}
                                  className="px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px]"
                                >
                                  Reopen
                                </button>
                              )}
                              <button
                                onClick={() => sendBackToTriage(t.id)}
                                className="p-0.5 text-zinc-500 hover:text-indigo-400"
                                title="Send to Triage"
                              >
                                <ListOrdered className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => openTaskModal(t.id)}
                                className="p-0.5 text-zinc-500 hover:text-zinc-300"
                                title="Edit"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => deleteTask(t.id)}
                                className="p-0.5 text-zinc-500 hover:text-rose-400"
                                title="Delete"
                              >
                                <Trash2 className="w-3 h-3" />
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
        ) : view === 'triage' ? (
          /* Triage View with Up/Down Priority Ordering */
          <div className="h-full bg-zinc-900/40 border border-zinc-800/80 rounded-lg flex flex-col min-h-0 overflow-hidden">
            <div className="px-3 py-2 border-b border-zinc-800/80 bg-zinc-950/60 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                  <ListOrdered className="w-3.5 h-3.5" /> Triage Queue
                </span>
                <span className="text-[10px] text-zinc-500">
                  Click &apos;Start&apos; on a triage task to send it to the board (automatically placed in Blocked or Ready based on dependencies)
                </span>
              </div>
            </div>

            <div className="p-2 space-y-1.5 overflow-y-auto flex-1">
              {filtered.length === 0 ? (
                <div className="py-12 text-center text-zinc-600 text-xs italic">No tasks in queue</div>
              ) : (
                filtered.map((t, index) => {
                  const status = computedStatus(t);
                  const depNames = (t.dependencies || [])
                    .map((id) => tasks.find((x) => x.id === id))
                    .filter(Boolean) as Task[];
                  const waiting = depNames.filter((d) => d.manualStatus !== 'done').map((d) => d.name);

                  return (
                    <div
                      key={t.id}
                      className="p-2 rounded-md bg-zinc-950 border border-zinc-800/80 hover:border-zinc-700 flex items-center justify-between gap-3 transition shadow-sm"
                    >
                      {/* Left: Reorder up/down + index */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <div className="flex flex-col gap-0.5">
                          <button
                            disabled={index === 0}
                            onClick={() => moveTask(index, 'up')}
                            className="p-1 rounded bg-zinc-900 hover:bg-zinc-800 disabled:opacity-20 text-zinc-400 hover:text-white transition"
                            title="Move Up"
                          >
                            <ArrowUp className="w-3 h-3" />
                          </button>
                          <button
                            disabled={index === tasks.length - 1}
                            onClick={() => moveTask(index, 'down')}
                            className="p-1 rounded bg-zinc-900 hover:bg-zinc-800 disabled:opacity-20 text-zinc-400 hover:text-white transition"
                            title="Move Down"
                          >
                            <ArrowDown className="w-3 h-3" />
                          </button>
                        </div>
                        <span className="w-5 text-center font-mono text-[11px] text-zinc-500 font-bold">
                          #{index + 1}
                        </span>
                      </div>

                      {/* Middle: Title, Worker, Status badge */}
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${
                              status === 'triage'
                                ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                                : status === 'ready'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : status === 'blocked'
                                ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                : status === 'progress'
                                ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                : 'bg-zinc-800 text-zinc-400'
                            }`}
                          >
                            {status}
                          </span>
                          <span
                            className={`text-[9px] px-1.5 py-0.2 rounded font-semibold ${
                              t.owner === 'Me'
                                ? 'bg-blue-500/10 text-blue-400'
                                : t.owner === 'AI'
                                ? 'bg-purple-500/10 text-purple-400'
                                : 'bg-zinc-800 text-zinc-400'
                            }`}
                          >
                            {t.owner}
                          </span>
                          <span
                            className={`text-[9px] px-1.5 py-0.2 rounded font-semibold ${
                              t.priority === 'High'
                                ? 'text-rose-400 bg-rose-500/10'
                                : t.priority === 'Medium'
                                ? 'text-amber-400 bg-amber-500/10'
                                : 'text-zinc-400'
                            }`}
                          >
                            {t.priority}
                          </span>
                          {t.estimate && (
                            <span className="text-[10px] text-zinc-500 font-mono">
                              • {t.estimate}
                            </span>
                          )}
                        </div>

                        <div className="text-xs font-semibold text-zinc-100 truncate">{t.name}</div>

                        {waiting.length > 0 && (
                          <div className="text-[10px] text-rose-400/90 truncate">
                            Waiting for: {waiting.join(', ')}
                          </div>
                        )}
                      </div>

                      {/* Right Actions */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {status === 'triage' ? (
                          <button
                            onClick={() => startFromTriageToBoard(t.id)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold shadow"
                            title="Commit task to Board (will be placed in Blocked or Ready automatically)"
                          >
                            <Play className="w-3 h-3 fill-white" /> Start (to Board)
                          </button>
                        ) : status === 'ready' ? (
                          <button
                            onClick={() => startInProgress(t.id)}
                            className="px-2 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold"
                          >
                            In Progress
                          </button>
                        ) : status === 'progress' ? (
                          <button
                            onClick={() => finishTask(t.id)}
                            className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold"
                          >
                            Done
                          </button>
                        ) : status === 'done' ? (
                          <button
                            onClick={() => reopenTask(t.id)}
                            className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px]"
                          >
                            Reopen
                          </button>
                        ) : (
                          <span className="text-[10px] text-zinc-500 italic pr-1">On Board</span>
                        )}

                        <button
                          onClick={() => openTaskModal(t.id)}
                          className="p-1 text-zinc-500 hover:text-zinc-300"
                          title="Edit"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => deleteTask(t.id)}
                          className="p-1 text-zinc-500 hover:text-rose-400"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ) : (
          /* DAG View */
          <div className="h-full w-full bg-zinc-900/40 border border-zinc-800/80 rounded-lg p-3 overflow-auto relative">
            <div className="relative min-w-max pb-6" ref={stageRef}>
              <svg
                className="absolute inset-0 pointer-events-none z-10"
                width={svgContent.width}
                height={svgContent.height}
                viewBox={`0 0 ${svgContent.width} ${svgContent.height}`}
              >
                <defs>
                  <marker
                    id="arrowHead"
                    markerWidth="6"
                    markerHeight="6"
                    refX="5"
                    refY="3"
                    orient="auto"
                  >
                    <path d="M0,0 L6,3 L0,6 z" fill="#6366f1" />
                  </marker>
                </defs>
                {svgContent.paths.map((d, i) => (
                  <path
                    key={i}
                    d={d}
                    fill="none"
                    stroke="#6366f1"
                    strokeWidth="1.5"
                    strokeDasharray="4 2"
                    markerEnd="url(#arrowHead)"
                  />
                ))}
              </svg>

              <div className="grid grid-flow-col auto-cols-[200px] gap-14 items-start relative z-20">
                {orderedLevels.map((level, index) => (
                  <div key={level} className="flex flex-col gap-3">
                    <div className="text-[10px] font-mono uppercase text-zinc-500 tracking-wider">
                      {index === 0 ? 'Root Available' : `Stage ${index + 1}`}
                    </div>
                    {levels[level].map((t) => {
                      const status = computedStatus(t);
                      const badgeClass =
                        status === 'ready'
                          ? 'border-emerald-500/80 bg-emerald-950/30 text-emerald-300'
                          : status === 'blocked'
                          ? 'border-rose-500/80 bg-rose-950/30 text-rose-300'
                          : status === 'progress'
                          ? 'border-blue-500/80 bg-blue-950/30 text-blue-300'
                          : 'border-zinc-700 bg-zinc-900 text-zinc-400';

                      return (
                        <div
                          key={t.id}
                          data-node-id={t.id}
                          className={`p-2.5 rounded-lg border-2 shadow transition ${badgeClass}`}
                        >
                          <div className="text-xs font-bold text-zinc-100 truncate">{t.name}</div>
                          <div className="flex items-center justify-between text-[10px] text-zinc-400 mt-1">
                            <span>{t.owner}</span>
                            <span className="font-semibold uppercase">{status}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Task Edit/Create Modal */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsModalOpen(false);
          }}
        >
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-lg p-4 space-y-3 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <span className="font-bold text-xs text-zinc-100">
                {editId ? 'Edit Task' : 'New Task'}
              </span>
              <button onClick={() => setIsModalOpen(false)} className="text-zinc-500 hover:text-zinc-300">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1">
                Task Name
              </label>
              <input
                value={taskName}
                onChange={(e) => setTaskName(e.target.value)}
                placeholder="e.g. Build API authentication"
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1">
                  Assignee
                </label>
                <select
                  value={taskOwner}
                  onChange={(e) => setTaskOwner(e.target.value as any)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200"
                >
                  <option value="Me">Me (Human)</option>
                  <option value="AI">AI Agent</option>
                  <option value="Other">Other Person</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1">
                  Priority
                </label>
                <select
                  value={taskPriority}
                  onChange={(e) => setTaskPriority(e.target.value as any)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200"
                >
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[10px] uppercase font-bold text-indigo-400 mb-1">
                Dependencies (Prerequisites)
              </label>
              <div className="max-h-28 overflow-y-auto border border-zinc-800 bg-zinc-950 rounded p-1.5 space-y-1">
                {tasks.filter((t) => t.id !== editId).length === 0 ? (
                  <div className="text-[10px] text-zinc-600 italic">No other tasks available</div>
                ) : (
                  tasks
                    .filter((t) => t.id !== editId)
                    .map((t) => {
                      const checked = selectedDeps.includes(t.id);
                      return (
                        <label
                          key={t.id}
                          className="flex items-center gap-2 text-[11px] text-zinc-300 cursor-pointer hover:bg-zinc-900 p-1 rounded"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              if (e.target.checked) setSelectedDeps([...selectedDeps, t.id]);
                              else setSelectedDeps(selectedDeps.filter((id) => id !== t.id));
                            }}
                            className="rounded border-zinc-700"
                          />
                          <span className="truncate">{t.name}</span>
                        </label>
                      );
                    })
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1">
                  Estimate
                </label>
                <input
                  value={taskEstimate}
                  onChange={(e) => setTaskEstimate(e.target.value)}
                  placeholder="e.g. 45m"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1">
                  Deadline
                </label>
                <input
                  type="date"
                  value={taskDeadline}
                  onChange={(e) => setTaskDeadline(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
              <label className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={initialInTriage}
                  onChange={(e) => setInitialInTriage(e.target.checked)}
                  className="rounded border-zinc-700"
                />
                <span>Place in Triage queue</span>
              </label>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1 text-xs text-zinc-400 hover:text-zinc-200"
                >
                  Cancel
                </button>
                <button
                  onClick={saveTask}
                  className="px-4 py-1 bg-indigo-600 hover:bg-indigo-500 font-bold text-white rounded text-xs"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <input
        type="file"
        ref={fileInputRef}
        accept=".json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const r = new FileReader();
          r.onload = () => {
            try {
              const data = JSON.parse(r.result as string);
              if (!Array.isArray(data)) throw new Error();
              saveTasks(data);
            } catch {
              alert('Invalid JSON file');
            }
          };
          r.readAsText(file);
        }}
      />
    </div>
  );
}
