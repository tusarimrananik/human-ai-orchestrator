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
  ArrowUp,
  ArrowDown,
  GripVertical,
  Timer,
  Check,
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
  manualStatus: 'todo' | 'progress' | 'done';
  createdAt: number;
  startedAt?: number | null;
  completedAt?: number | null;
  totalTimeSpentSeconds?: number;
}

const STORAGE_KEY = 'smart_task_manager_v1';

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function priorityScore(p: string) {
  return p === 'High' ? 3 : p === 'Medium' ? 2 : 1;
}

function formatElapsed(seconds: number): string {
  if (!seconds || seconds <= 0) return '0s';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) return `${hrs}h ${mins}m`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

export default function Page() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [mounted, setMounted] = useState(false);
  const [view, setView] = useState<'board' | 'dependency'>('board');
  const [search, setSearch] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');

  // Live timer tick for active in-progress tasks
  const [now, setNow] = useState<number>(Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Drag-and-drop state
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);

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

  // Initial Load from LocalStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setTasks(
          parsed.map((t: any) => ({
            ...t,
            manualStatus: t.manualStatus === 'triage' ? 'todo' : t.manualStatus,
            totalTimeSpentSeconds: t.totalTimeSpentSeconds || 0,
          }))
        );
      } else {
        const a = uid(), b = uid(), c = uid(), d = uid();
        const initialTasks: Task[] = [
          { id: a, name: 'Plan for algorithm Lab report', owner: 'Me', priority: 'High', deadline: '', estimate: '30m', doneRule: 'Plan ready', notes: '', dependencies: [], manualStatus: 'todo', createdAt: Date.now() },
          { id: b, name: 'Plan for micro lab report', owner: 'Me', priority: 'High', deadline: '', estimate: '30m', doneRule: 'Plan ready', notes: '', dependencies: [], manualStatus: 'todo', createdAt: Date.now() + 1 },
          { id: c, name: 'Write algorithm report prompt', owner: 'Me', priority: 'Medium', deadline: '', estimate: '45m', doneRule: 'Prompt ready', notes: '', dependencies: [a], manualStatus: 'todo', createdAt: Date.now() + 2 },
          { id: d, name: 'Write micro report prompt', owner: 'Me', priority: 'Medium', deadline: '', estimate: '45m', doneRule: 'Prompt ready', notes: '', dependencies: [b], manualStatus: 'todo', createdAt: Date.now() + 3 },
        ];
        setTasks(initialTasks);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(initialTasks));
      }
    } catch (err) {
      console.warn('LocalStorage access error:', err);
    }
    setMounted(true);
  }, []);

  const cascadePriority = (taskList: Task[], taskId: string, newPriority: 'High' | 'Medium' | 'Low'): Task[] => {
    const updated = [...taskList];
    const targetScore = priorityScore(newPriority);

    const visitedUp = new Set<string>();
    const queueUp: string[] = [taskId];
    while (queueUp.length > 0) {
      const currId = queueUp.shift()!;
      if (visitedUp.has(currId)) continue;
      visitedUp.add(currId);
      const current = updated.find((t) => t.id === currId);
      if (!current) continue;
      (current.dependencies || []).forEach((depId) => {
        const depIdx = updated.findIndex((t) => t.id === depId);
        if (depIdx !== -1) {
          if (priorityScore(updated[depIdx].priority) < targetScore) {
            updated[depIdx] = { ...updated[depIdx], priority: newPriority };
          }
          queueUp.push(depId);
        }
      });
    }

    const visitedDown = new Set<string>();
    const queueDown: string[] = [taskId];
    while (queueDown.length > 0) {
      const currId = queueDown.shift()!;
      if (visitedDown.has(currId)) continue;
      visitedDown.add(currId);

      updated.forEach((t, idx) => {
        if ((t.dependencies || []).includes(currId)) {
          if (priorityScore(t.priority) < targetScore) {
            updated[idx] = { ...t, priority: newPriority };
          }
          queueDown.push(t.id);
        }
      });
    }

    return updated;
  };

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

  const moveTaskWithinGroup = (taskId: string, groupList: Task[], direction: 'up' | 'down') => {
    const groupIdx = groupList.findIndex((t) => t.id === taskId);
    if (groupIdx === -1) return;

    const targetGroupIdx = direction === 'up' ? groupIdx - 1 : groupIdx + 1;
    if (targetGroupIdx < 0 || targetGroupIdx >= groupList.length) return;

    const targetTask = groupList[targetGroupIdx];
    const idxA = tasks.findIndex((t) => t.id === taskId);
    const idxB = tasks.findIndex((t) => t.id === targetTask.id);
    if (idxA === -1 || idxB === -1) return;

    const newTasks = [...tasks];
    const temp = newTasks[idxA];
    newTasks[idxA] = newTasks[idxB];
    newTasks[idxB] = temp;
    saveTasks(newTasks);
  };

  const handlePriorityChange = (taskId: string, newPriority: 'High' | 'Medium' | 'Low') => {
    let updated = tasks.map((t) => (t.id === taskId ? { ...t, priority: newPriority } : t));
    updated = cascadePriority(updated, taskId, newPriority);
    saveTasks(updated);
  };

  // Drag and Drop handlers
  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData('text/plain', taskId);
    setDraggedTaskId(taskId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDropOnTask = (targetTaskId: string) => {
    if (!draggedTaskId || draggedTaskId === targetTaskId) return;

    const idxA = tasks.findIndex((t) => t.id === draggedTaskId);
    const idxB = tasks.findIndex((t) => t.id === targetTaskId);
    if (idxA === -1 || idxB === -1) return;

    const newTasks = [...tasks];
    const [moved] = newTasks.splice(idxA, 1);
    newTasks.splice(idxB, 0, moved);

    saveTasks(newTasks);
    setDraggedTaskId(null);
  };

  const getFocusTask = () => {
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

  filtered.forEach((t) => {
    const st = computedStatus(t);
    groups[st].push(t);
  });

  const allGroups = { blocked: 0, ready: 0, progress: 0, done: 0 };
  tasks.forEach((t) => {
    const st = computedStatus(t);
    allGroups[st]++;
  });

  const focus = getFocusTask();

  // Straight horizontal dependency lines calculation
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

          const isNearlyStraight = Math.abs(y1 - y2) < 4;
          let d = '';
          if (isNearlyStraight) {
            d = `M ${x1} ${y1} L ${x2 - 6} ${y2}`;
          } else {
            const bend = Math.max(24, (x2 - x1) * 0.45);
            d = `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2 - 6} ${y2}`;
          }
          paths.push(d);
        });
      });

      setSvgContent({ width, height, paths });
    }, 60);

    return () => clearTimeout(timer);
  }, [view, tasks, ownerFilter, priorityFilter, search]);

  // Start task & begin live timer
  const startInProgress = (id: string) => {
    saveTasks(
      tasks.map((t) => {
        if (t.id === id) {
          return {
            ...t,
            manualStatus: 'progress',
            startedAt: Date.now(),
            completedAt: null,
          };
        }
        return t;
      })
    );
  };

  // Finish task & record total duration
  const finishTask = (id: string) => {
    saveTasks(
      tasks.map((t) => {
        if (t.id === id) {
          const sessionSeconds = t.startedAt ? Math.floor((Date.now() - t.startedAt) / 1000) : 0;
          const total = (t.totalTimeSpentSeconds || 0) + sessionSeconds;
          return {
            ...t,
            manualStatus: 'done',
            startedAt: null,
            completedAt: Date.now(),
            totalTimeSpentSeconds: total,
          };
        }
        return t;
      })
    );
  };

  // Reopen task
  const reopenTask = (id: string) => {
    saveTasks(
      tasks.map((t) =>
        t.id === id
          ? {
              ...t,
              manualStatus: 'todo',
              startedAt: null,
              completedAt: null,
            }
          : t
      )
    );
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
    const a = uid(), b = uid(), c = uid(), d = uid(), e = uid(), f = uid();
    const newSamples: Task[] = [
      { id: a, name: 'Plan for algorithm Lab report', owner: 'Me', priority: 'High', deadline: '', estimate: '30m', doneRule: 'Plan ready', notes: '', dependencies: [], manualStatus: 'todo', createdAt: Date.now() },
      { id: b, name: 'Plan for micro lab report', owner: 'Me', priority: 'High', deadline: '', estimate: '30m', doneRule: 'Plan ready', notes: '', dependencies: [], manualStatus: 'todo', createdAt: Date.now() + 1 },
      { id: c, name: 'Write algorithm report prompt', owner: 'Me', priority: 'High', deadline: '', estimate: '45m', doneRule: 'Prompt ready', notes: '', dependencies: [a], manualStatus: 'todo', createdAt: Date.now() + 2 },
      { id: d, name: 'Write micro report prompt', owner: 'Me', priority: 'High', deadline: '', estimate: '45m', doneRule: 'Prompt ready', notes: '', dependencies: [b], manualStatus: 'todo', createdAt: Date.now() + 3 },
      { id: e, name: 'AI: Generate algorithm report', owner: 'AI', priority: 'High', deadline: '', estimate: '1h', doneRule: 'Content ready', notes: '', dependencies: [c], manualStatus: 'todo', createdAt: Date.now() + 4 },
      { id: f, name: 'AI: Generate micro report', owner: 'AI', priority: 'High', deadline: '', estimate: '1h', doneRule: 'Content ready', notes: '', dependencies: [d], manualStatus: 'todo', createdAt: Date.now() + 5 },
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

    let updatedTasks: Task[];

    if (editId) {
      updatedTasks = tasks.map((t) => (t.id === editId ? { ...t, ...data } : t));
      updatedTasks = cascadePriority(updatedTasks, editId, taskPriority);
    } else {
      const newId = uid();
      const newTask: Task = {
        id: newId,
        manualStatus: 'todo',
        createdAt: Date.now(),
        totalTimeSpentSeconds: 0,
        ...data,
      };
      updatedTasks = [...tasks, newTask];
      updatedTasks = cascadePriority(updatedTasks, newId, taskPriority);
    }

    saveTasks(updatedTasks);
    setIsModalOpen(false);
  };

  // Helper to compute live elapsed time string for a task
  const getTaskDurationDisplay = (t: Task): string | null => {
    let totalSec = t.totalTimeSpentSeconds || 0;
    if (t.manualStatus === 'progress' && t.startedAt) {
      totalSec += Math.floor((now - t.startedAt) / 1000);
    }
    if (totalSec <= 0) return null;
    return formatElapsed(totalSec);
  };

  // Topological DAG calculation with parallel line alignment
  const getAlignedLevels = () => {
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

    const orderedLevelKeys = Object.keys(levels).map(Number).sort((a, b) => a - b);
    const laneMap = new Map<string, number>();

    orderedLevelKeys.forEach((lvl) => {
      const list = levels[lvl];
      if (lvl === 0) {
        list.forEach((t, i) => laneMap.set(t.id, i));
      } else {
        list.sort((a, b) => {
          const predA = (a.dependencies || [])[0];
          const predB = (b.dependencies || [])[0];
          const laneA = predA ? laneMap.get(predA) ?? 999 : 999;
          const laneB = predB ? laneMap.get(predB) ?? 999 : 999;
          return laneA - laneB;
        });
        list.forEach((t, i) => {
          const pred = (t.dependencies || [])[0];
          const inheritedLane = pred ? laneMap.get(pred) : undefined;
          laneMap.set(t.id, inheritedLane !== undefined ? inheritedLane : i);
        });
      }
    });

    return { levels, orderedLevels: orderedLevelKeys };
  };

  const { levels, orderedLevels } = getAlignedLevels();

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
              onClick={() => setView('dependency')}
              className={`px-2 py-0.5 rounded text-[11px] font-semibold transition flex items-center gap-1 ${
                view === 'dependency' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <GitFork className="w-3 h-3" /> DAG Graph
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
            onClick={() => openTaskModal()}
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
                      list.map((t, idx) => {
                        const depNames = (t.dependencies || [])
                          .map((id) => tasks.find((x) => x.id === id))
                          .filter(Boolean) as Task[];
                        const waiting = depNames.filter((d) => d.manualStatus !== 'done').map((d) => d.name);
                        const durationDisplay = getTaskDurationDisplay(t);

                        return (
                          <div
                            key={t.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, t.id)}
                            onDragOver={handleDragOver}
                            onDrop={() => handleDropOnTask(t.id)}
                            className={`group p-2 rounded-md bg-zinc-950 border transition shadow-sm space-y-1 cursor-grab active:cursor-grabbing ${
                              draggedTaskId === t.id
                                ? 'border-indigo-500 opacity-60'
                                : 'border-zinc-800/90 hover:border-zinc-700'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1">
                              <div className="flex items-center gap-1">
                                <GripVertical className="w-3 h-3 text-zinc-600 group-hover:text-zinc-400" />
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
                              </div>

                              <div className="flex items-center gap-1">
                                {/* Up/Down buttons across columns to prioritize */}
                                <div className="flex items-center gap-0.5 mr-1">
                                  <button
                                    disabled={idx === 0}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      moveTaskWithinGroup(t.id, list, 'up');
                                    }}
                                    className="p-0.5 text-zinc-500 hover:text-white disabled:opacity-20 transition"
                                    title="Move Up"
                                  >
                                    <ArrowUp className="w-2.5 h-2.5" />
                                  </button>
                                  <button
                                    disabled={idx === list.length - 1}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      moveTaskWithinGroup(t.id, list, 'down');
                                    }}
                                    className="p-0.5 text-zinc-500 hover:text-white disabled:opacity-20 transition"
                                    title="Move Down"
                                  >
                                    <ArrowDown className="w-2.5 h-2.5" />
                                  </button>
                                </div>

                                {/* Priority Selector with Auto-Cascade */}
                                <select
                                  value={t.priority}
                                  onChange={(e) =>
                                    handlePriorityChange(t.id, e.target.value as 'High' | 'Medium' | 'Low')
                                  }
                                  className={`text-[9px] px-1 rounded font-semibold border-0 cursor-pointer focus:outline-none ${
                                    t.priority === 'High'
                                      ? 'text-rose-400 bg-rose-500/10'
                                      : t.priority === 'Medium'
                                      ? 'text-amber-400 bg-amber-500/10'
                                      : 'text-zinc-400 bg-zinc-800'
                                  }`}
                                >
                                  <option value="High" className="bg-zinc-900 text-rose-400">
                                    High
                                  </option>
                                  <option value="Medium" className="bg-zinc-900 text-amber-400">
                                    Medium
                                  </option>
                                  <option value="Low" className="bg-zinc-900 text-zinc-300">
                                    Low
                                  </option>
                                </select>
                              </div>
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

                            {/* Time Tracking Info & Estimate */}
                            <div className="flex items-center justify-between text-[10px] text-zinc-400 pt-0.5">
                              {durationDisplay ? (
                                <div
                                  className={`flex items-center gap-1 font-mono px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                    colKey === 'progress'
                                      ? 'bg-blue-500/20 text-blue-300 animate-pulse border border-blue-500/30'
                                      : 'bg-zinc-900 text-emerald-400'
                                  }`}
                                >
                                  <Timer className="w-2.5 h-2.5" />
                                  <span>{durationDisplay}</span>
                                </div>
                              ) : t.estimate ? (
                                <div className="text-zinc-500 flex items-center gap-1">
                                  <Clock className="w-2.5 h-2.5" /> {t.estimate}
                                </div>
                              ) : (
                                <span />
                              )}

                              {t.estimate && durationDisplay && (
                                <span className="text-[9px] text-zinc-500 font-mono">est: {t.estimate}</span>
                              )}
                            </div>

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

              <div className="grid grid-flow-col auto-cols-[210px] gap-16 items-start relative z-20">
                {orderedLevels.map((level, index) => (
                  <div key={level} className="flex flex-col gap-4">
                    <div className="text-[10px] font-mono uppercase text-zinc-500 tracking-wider">
                      {index === 0 ? 'Root Available' : `Stage ${index + 1}`}
                    </div>
                    {levels[level].map((t) => {
                      const status = computedStatus(t);
                      const durationDisplay = getTaskDurationDisplay(t);
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
                          <div className="text-xs font-bold text-zinc-100 line-clamp-2 leading-tight">
                            {t.name}
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-zinc-400 mt-1.5 pt-1 border-t border-zinc-800/80">
                            <span>{t.owner}</span>
                            <div className="flex items-center gap-1">
                              {durationDisplay && (
                                <span className="font-mono text-emerald-400 font-bold">
                                  {durationDisplay}
                                </span>
                              )}
                              <span className="font-semibold uppercase text-[9px]">{status}</span>
                            </div>
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

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
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
