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
  Clock,
  Lock,
  X,
  ArrowUp,
  ArrowDown,
  GripVertical,
  Timer,
  Layers,
  CornerDownRight,
  Link2,
} from 'lucide-react';

export type BatchTag = 'None' | 'Batch 1' | 'Batch 2' | 'Batch 3' | 'Batch 4' | 'Batch 5';

interface Task {
  id: string;
  name: string;
  owner: 'Me' | 'AI' | 'Other';
  batch: BatchTag;
  deadline: string;
  estimate: string;
  description?: string;
  notes?: string;
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

function batchWeight(b: BatchTag = 'None'): number {
  switch (b) {
    case 'Batch 1': return 1;
    case 'Batch 2': return 2;
    case 'Batch 3': return 3;
    case 'Batch 4': return 4;
    case 'Batch 5': return 5;
    default: return 99;
  }
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

// Full element background, border, text & badge styling with high contrast readability
export function getBatchTheme(batch: BatchTag = 'None') {
  switch (batch) {
    case 'Batch 1':
      return {
        cardBg: 'bg-sky-950/40 border-sky-600/70 text-sky-100',
        cardTitle: 'text-sky-100',
        descBg: 'bg-sky-950/60 border-sky-800/60 text-sky-200/90',
        badge: 'bg-sky-500/20 text-sky-300 border border-sky-500/50',
        dropdown: 'bg-sky-950 text-sky-300 border-sky-700/80',
        dagNode: 'bg-sky-950/60 border-sky-500 text-sky-100',
      };
    case 'Batch 2':
      return {
        cardBg: 'bg-purple-950/40 border-purple-600/70 text-purple-100',
        cardTitle: 'text-purple-100',
        descBg: 'bg-purple-950/60 border-purple-800/60 text-purple-200/90',
        badge: 'bg-purple-500/20 text-purple-300 border border-purple-500/50',
        dropdown: 'bg-purple-950 text-purple-300 border-purple-700/80',
        dagNode: 'bg-purple-950/60 border-purple-500 text-purple-100',
      };
    case 'Batch 3':
      return {
        cardBg: 'bg-amber-950/40 border-amber-600/70 text-amber-100',
        cardTitle: 'text-amber-100',
        descBg: 'bg-amber-950/60 border-amber-800/60 text-amber-200/90',
        badge: 'bg-amber-500/20 text-amber-300 border border-amber-500/50',
        dropdown: 'bg-amber-950 text-amber-300 border-amber-700/80',
        dagNode: 'bg-amber-950/60 border-amber-500 text-amber-100',
      };
    case 'Batch 4':
      return {
        cardBg: 'bg-emerald-950/40 border-emerald-600/70 text-emerald-100',
        cardTitle: 'text-emerald-100',
        descBg: 'bg-emerald-950/60 border-emerald-800/60 text-emerald-200/90',
        badge: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50',
        dropdown: 'bg-emerald-950 text-emerald-300 border-emerald-700/80',
        dagNode: 'bg-emerald-950/60 border-emerald-500 text-emerald-100',
      };
    case 'Batch 5':
      return {
        cardBg: 'bg-rose-950/40 border-rose-600/70 text-rose-100',
        cardTitle: 'text-rose-100',
        descBg: 'bg-rose-950/60 border-rose-800/60 text-rose-200/90',
        badge: 'bg-rose-500/20 text-rose-300 border border-rose-500/50',
        dropdown: 'bg-rose-950 text-rose-300 border-rose-700/80',
        dagNode: 'bg-rose-950/60 border-rose-500 text-rose-100',
      };
    default:
      return {
        cardBg: 'bg-zinc-950 border-zinc-800 text-zinc-200',
        cardTitle: 'text-zinc-100',
        descBg: 'bg-zinc-900/60 border-zinc-800/60 text-zinc-400',
        badge: 'bg-zinc-800 text-zinc-400 border border-zinc-700',
        dropdown: 'bg-zinc-900 text-zinc-400 border-zinc-700',
        dagNode: 'bg-zinc-900 border-zinc-700 text-zinc-200',
      };
  }
}

export default function Page() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [mounted, setMounted] = useState(false);
  const [view, setView] = useState<'board' | 'dependency'>('board');
  const [search, setSearch] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [batchFilter, setBatchFilter] = useState('');

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
  const [taskDescription, setTaskDescription] = useState('');
  const [taskOwner, setTaskOwner] = useState<'Me' | 'AI' | 'Other'>('Me');
  const [taskBatch, setTaskBatch] = useState<BatchTag>('None');
  const [taskDeadline, setTaskDeadline] = useState('');
  const [taskEstimate, setTaskEstimate] = useState('');
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
            batch: t.batch || (t.priority === 'High' ? 'Batch 1' : t.priority === 'Medium' ? 'Batch 2' : 'None'),
            description: t.description || t.doneRule || t.notes || '',
            manualStatus: t.manualStatus === 'triage' ? 'todo' : t.manualStatus,
            totalTimeSpentSeconds: t.totalTimeSpentSeconds || 0,
          }))
        );
      } else {
        const a = uid(), b = uid(), c = uid(), d = uid();
        const initialTasks: Task[] = [
          { id: a, name: 'Plan for algorithm Lab report', description: 'Outline experiment objectives, formula derivations and steps', owner: 'Me', batch: 'Batch 1', deadline: '', estimate: '30m', notes: '', dependencies: [], manualStatus: 'todo', createdAt: Date.now() },
          { id: b, name: 'Plan for micro lab report', description: 'Define microprocessor pin diagrams and instruction set specs', owner: 'Me', batch: 'Batch 1', deadline: '', estimate: '30m', notes: '', dependencies: [], manualStatus: 'todo', createdAt: Date.now() + 1 },
          { id: c, name: 'Write algorithm report prompt', description: 'Write structured prompt template for AI report generation', owner: 'Me', batch: 'Batch 2', deadline: '', estimate: '45m', notes: '', dependencies: [a], manualStatus: 'todo', createdAt: Date.now() + 2 },
          { id: d, name: 'Write micro report prompt', description: 'Prepare code blocks and input parameters prompt', owner: 'Me', batch: 'Batch 2', deadline: '', estimate: '45m', notes: '', dependencies: [b], manualStatus: 'todo', createdAt: Date.now() + 3 },
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

  // Change batch tag on task
  const handleBatchChange = (taskId: string, newBatch: BatchTag) => {
    const updated = tasks.map((t) => (t.id === taskId ? { ...t, batch: newBatch } : t));
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

  const q = search.toLowerCase();
  const filtered = tasks.filter(
    (t) =>
      (!q || (t.name + ' ' + (t.description || '') + ' ' + (t.notes || '')).toLowerCase().includes(q)) &&
      (!ownerFilter || t.owner === ownerFilter) &&
      (!batchFilter || t.batch === batchFilter)
  );

  const groups: Record<'blocked' | 'ready' | 'progress' | 'done', Task[]> = {
    blocked: [],
    ready: [],
    progress: [],
    done: [],
  };

  // Group and sort tasks by Batch (Batch 1 -> Batch 2 -> Batch 3 -> Batch 4 -> Batch 5 -> None)
  filtered.forEach((t) => {
    const st = computedStatus(t);
    groups[st].push(t);
  });

  // Enforce batch-based sorting in each Board column
  (['blocked', 'ready', 'progress', 'done'] as const).forEach((key) => {
    groups[key].sort((a, b) => {
      const bwA = batchWeight(a.batch);
      const bwB = batchWeight(b.batch);
      if (bwA !== bwB) return bwA - bwB;
      return a.createdAt - b.createdAt;
    });
  });

  // Straight horizontal dependency lines calculation for DAG
  useLayoutEffect(() => {
    if (view !== 'dependency' || !stageRef.current || !filtered.length) return;

    const timer = setTimeout(() => {
      const stage = stageRef.current;
      if (!stage) return;

      const stageRect = stage.getBoundingClientRect();
      const width = stage.scrollWidth;
      const height = stage.scrollHeight;
      const paths: string[] = [];

      filtered.forEach((targetTask) => {
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
  }, [view, filtered, ownerFilter, batchFilter, search]);

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

  // Reopen task resets timer completely to ZERO
  const reopenTask = (id: string) => {
    saveTasks(
      tasks.map((t) =>
        t.id === id
          ? {
              ...t,
              manualStatus: 'todo',
              startedAt: null,
              completedAt: null,
              totalTimeSpentSeconds: 0,
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
    setTaskDescription(current?.description || current?.notes || '');
    setTaskOwner(current?.owner || 'Me');
    setTaskBatch(current?.batch || 'None');
    setTaskDeadline(current?.deadline || '');
    setTaskEstimate(current?.estimate || '');
    setSelectedDeps(current?.dependencies || []);
    setIsModalOpen(true);
  };

  const saveTask = () => {
    const name = taskName.trim();
    if (!name) return;
    const data = {
      name,
      description: taskDescription.trim(),
      owner: taskOwner,
      batch: taskBatch,
      deadline: taskDeadline,
      estimate: taskEstimate.trim(),
      notes: '',
      dependencies: selectedDeps,
    };

    let updatedTasks: Task[];

    if (editId) {
      updatedTasks = tasks.map((t) => (t.id === editId ? { ...t, ...data } : t));
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
    }

    saveTasks(updatedTasks);
    setIsModalOpen(false);
  };

  const getTaskDurationDisplay = (t: Task): string | null => {
    let totalSec = t.totalTimeSpentSeconds || 0;
    if (t.manualStatus === 'progress' && t.startedAt) {
      totalSec += Math.floor((now - t.startedAt) / 1000);
    }
    if (totalSec <= 0) return null;
    return formatElapsed(totalSec);
  };

  const getUpstreamChain = (taskId: string, stack = new Set<string>()): Task[] => {
    if (stack.has(taskId)) return [];
    stack.add(taskId);
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return [];
    const chain: Task[] = [];
    (task.dependencies || []).forEach((dId) => {
      const depTask = tasks.find((t) => t.id === dId);
      if (depTask) {
        chain.push(depTask);
        chain.push(...getUpstreamChain(dId, new Set(stack)));
      }
    });
    return chain;
  };

  // Topological DAG calculation with BATCH PRIORITY & straight-lane sorting
  const getAlignedLevels = () => {
    const sourceTasks = filtered;
    const byId = new Map(sourceTasks.map((t) => [t.id, t]));
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
    sourceTasks.forEach((t) => {
      const l = levelOf(t);
      (levels[l] ||= []).push(t);
    });

    const orderedLevelKeys = Object.keys(levels).map(Number).sort((a, b) => a - b);
    const laneMap = new Map<string, number>();

    orderedLevelKeys.forEach((lvl) => {
      const list = levels[lvl];

      // 1. Sort primarily by Batch (Batch 1 -> Batch 2 -> Batch 3 -> Batch 4 -> Batch 5 -> None)
      // 2. If same batch, sort by predecessor's lane so connected paths stay straight!
      list.sort((a, b) => {
        const bwA = batchWeight(a.batch);
        const bwB = batchWeight(b.batch);
        if (bwA !== bwB) return bwA - bwB;

        const predA = (a.dependencies || [])[0];
        const predB = (b.dependencies || [])[0];
        const laneA = predA ? laneMap.get(predA) ?? 999 : 999;
        const laneB = predB ? laneMap.get(predB) ?? 999 : 999;
        return laneA - laneB;
      });

      list.forEach((t, i) => {
        const pred = (t.dependencies || [])[0];
        const inheritedLane = pred !== undefined ? laneMap.get(pred) : undefined;
        laneMap.set(t.id, inheritedLane !== undefined ? inheritedLane : i);
      });
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
                view === 'board' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400'
              }`}
            >
              <LayoutGrid className="w-3 h-3" /> Board
            </button>
            <button
              onClick={() => setView('dependency')}
              className={`px-2 py-0.5 rounded text-[11px] font-semibold transition flex items-center gap-1 ${
                view === 'dependency' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400'
              }`}
            >
              <GitFork className="w-3 h-3" /> DAG Graph
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={exportData}
            className="p-1 rounded bg-zinc-800/80 text-zinc-400 transition"
            title="Export"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-1 rounded bg-zinc-800/80 text-zinc-400 transition"
            title="Import"
          >
            <Upload className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => openTaskModal()}
            className="px-2.5 py-1 rounded bg-indigo-600 font-semibold text-white text-[11px] shadow"
          >
            + Task
          </button>
        </div>
      </header>

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

          {/* Batch Filter */}
          <select
            value={batchFilter}
            onChange={(e) => setBatchFilter(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded px-1.5 py-0.5 text-[11px] text-zinc-300 focus:outline-none font-medium"
          >
            <option value="">All Batches</option>
            <option value="Batch 1">Batch 1</option>
            <option value="Batch 2">Batch 2</option>
            <option value="Batch 3">Batch 3</option>
            <option value="Batch 4">Batch 4</option>
            <option value="Batch 5">Batch 5</option>
            <option value="None">No Batch</option>
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
                        const batchTheme = getBatchTheme(t.batch);

                        return (
                          <div
                            key={t.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, t.id)}
                            onDragOver={handleDragOver}
                            onDrop={() => handleDropOnTask(t.id)}
                            className={`p-2 rounded-md border shadow-sm space-y-1 ${batchTheme.cardBg} ${
                              draggedTaskId === t.id ? 'opacity-60 ring-2 ring-indigo-500' : ''
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1">
                              <div className="flex items-center gap-1">
                                <GripVertical className="w-3 h-3 text-zinc-400/60" />
                                <span className="text-[9px] px-1 rounded font-semibold bg-black/30 border border-white/10 text-zinc-200">
                                  {t.owner}
                                </span>
                              </div>

                              <div className="flex items-center gap-1">
                                <div className="flex items-center gap-0.5 mr-1">
                                  <button
                                    disabled={idx === 0}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      moveTaskWithinGroup(t.id, list, 'up');
                                    }}
                                    className="p-0.5 text-zinc-400 hover:text-white disabled:opacity-20"
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
                                    className="p-0.5 text-zinc-400 hover:text-white disabled:opacity-20"
                                    title="Move Down"
                                  >
                                    <ArrowDown className="w-2.5 h-2.5" />
                                  </button>
                                </div>

                                <select
                                  value={t.batch || 'None'}
                                  onChange={(e) =>
                                    handleBatchChange(t.id, e.target.value as BatchTag)
                                  }
                                  className={`text-[9px] px-1.5 py-0.2 rounded font-bold cursor-pointer focus:outline-none ${batchTheme.dropdown}`}
                                >
                                  <option value="None" className="bg-zinc-900 text-zinc-400">
                                    No Batch
                                  </option>
                                  <option value="Batch 1" className="bg-zinc-900 text-sky-400">
                                    Batch 1
                                  </option>
                                  <option value="Batch 2" className="bg-zinc-900 text-purple-400">
                                    Batch 2
                                  </option>
                                  <option value="Batch 3" className="bg-zinc-900 text-amber-400">
                                    Batch 3
                                  </option>
                                  <option value="Batch 4" className="bg-zinc-900 text-emerald-400">
                                    Batch 4
                                  </option>
                                  <option value="Batch 5" className="bg-zinc-900 text-rose-400">
                                    Batch 5
                                  </option>
                                </select>
                              </div>
                            </div>

                            <div className={`text-xs font-bold leading-snug line-clamp-2 ${batchTheme.cardTitle}`}>
                              {t.name}
                            </div>

                            {t.description && (
                              <p className={`text-[11px] line-clamp-2 leading-relaxed p-1 rounded border ${batchTheme.descBg}`}>
                                {t.description}
                              </p>
                            )}

                            {waiting.length > 0 && (
                              <div className="text-[10px] text-rose-300 bg-rose-950/80 border border-rose-800/80 px-1.5 py-0.5 rounded truncate flex items-center gap-1">
                                <Lock className="w-2.5 h-2.5 flex-shrink-0 text-rose-400" />
                                <span className="truncate">Waiting: {waiting.join(', ')}</span>
                              </div>
                            )}

                            <div className="flex items-center justify-between text-[10px] text-zinc-300 pt-0.5">
                              {durationDisplay ? (
                                <div
                                  className={`flex items-center gap-1 font-mono px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                    colKey === 'progress'
                                      ? 'bg-blue-500/30 text-blue-200 animate-pulse border border-blue-400/50'
                                      : 'bg-black/40 text-emerald-300 border border-emerald-500/30'
                                  }`}
                                >
                                  <Timer className="w-2.5 h-2.5" />
                                  <span>{durationDisplay}</span>
                                </div>
                              ) : t.estimate ? (
                                <div className="text-zinc-400 flex items-center gap-1">
                                  <Clock className="w-2.5 h-2.5" /> {t.estimate}
                                </div>
                              ) : (
                                <span />
                              )}

                              {t.estimate && durationDisplay && (
                                <span className="text-[9px] text-zinc-400 font-mono">est: {t.estimate}</span>
                              )}
                            </div>

                            <div className="flex items-center justify-end gap-1 pt-1 border-t border-white/10">
                              {colKey === 'ready' && (
                                <button
                                  onClick={() => startInProgress(t.id)}
                                  className="px-1.5 py-0.5 rounded bg-indigo-600 text-white text-[10px] font-semibold shadow"
                                >
                                  Start
                                </button>
                              )}
                              {colKey === 'progress' && (
                                <button
                                  onClick={() => finishTask(t.id)}
                                  className="px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-semibold shadow"
                                >
                                  Done
                                </button>
                              )}
                              {colKey === 'done' && (
                                <button
                                  onClick={() => reopenTask(t.id)}
                                  className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-200 text-[10px]"
                                >
                                  Reopen
                                </button>
                              )}
                              <button
                                onClick={() => openTaskModal(t.id)}
                                className="p-0.5 text-zinc-400 hover:text-white"
                                title="Edit"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => deleteTask(t.id)}
                                className="p-0.5 text-zinc-400 hover:text-rose-400"
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

              <div className="grid grid-flow-col auto-cols-[220px] gap-16 items-start relative z-20">
                {orderedLevels.map((level, index) => (
                  <div key={level} className="flex flex-col gap-4">
                    <div className="text-[10px] font-mono uppercase text-zinc-500 tracking-wider">
                      {index === 0 ? 'Root Available' : `Stage ${index + 1}`}
                    </div>
                    {levels[level].map((t) => {
                      const status = computedStatus(t);
                      const durationDisplay = getTaskDurationDisplay(t);
                      const batchTheme = getBatchTheme(t.batch);

                      return (
                        <div
                          key={t.id}
                          data-node-id={t.id}
                          className={`p-2.5 rounded-lg border-2 shadow space-y-1 ${batchTheme.dagNode}`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <div className="text-xs font-bold line-clamp-2 leading-tight flex-1">
                              {t.name}
                            </div>
                            {t.batch && t.batch !== 'None' && (
                              <span className={`text-[8px] font-bold px-1 rounded ${batchTheme.badge}`}>
                                {t.batch}
                              </span>
                            )}
                          </div>
                          {t.description && (
                            <p className="text-[10px] line-clamp-2 leading-snug opacity-80">
                              {t.description}
                            </p>
                          )}
                          <div className="flex items-center justify-between text-[10px] mt-1 pt-1 border-t border-white/10">
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
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-xl p-4 space-y-3 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <span className="font-bold text-xs text-zinc-100 flex items-center gap-1.5">
                <Link2 className="w-3.5 h-3.5 text-indigo-400" />
                {editId ? 'Edit Task' : 'New Task'}
              </span>
              <button onClick={() => setIsModalOpen(false)} className="text-zinc-500 hover:text-zinc-300">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1">
                Task Name *
              </label>
              <input
                value={taskName}
                onChange={(e) => setTaskName(e.target.value)}
                placeholder="e.g. Write micro report prompt"
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1">
                Description / Context
              </label>
              <textarea
                rows={2}
                value={taskDescription}
                onChange={(e) => setTaskDescription(e.target.value)}
                placeholder="Add task details or specifications..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500 resize-none"
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
                <label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1 flex items-center gap-1">
                  <Layers className="w-3 h-3 text-indigo-400" /> Batch
                </label>
                <select
                  value={taskBatch}
                  onChange={(e) => setTaskBatch(e.target.value as BatchTag)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 font-bold"
                >
                  <option value="None">No Batch</option>
                  <option value="Batch 1">Batch 1 (Sky)</option>
                  <option value="Batch 2">Batch 2 (Purple)</option>
                  <option value="Batch 3">Batch 3 (Amber)</option>
                  <option value="Batch 4">Batch 4 (Emerald)</option>
                  <option value="Batch 5">Batch 5 (Rose)</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-[10px] uppercase font-bold text-indigo-400 flex items-center justify-between">
                <span>Dependencies (Prerequisites)</span>
                <span className="text-[9px] text-zinc-500 normal-case">Sub-chains auto-linked</span>
              </label>

              <div className="max-h-36 overflow-y-auto border border-zinc-800 bg-zinc-950 rounded p-1.5 space-y-1.5">
                {tasks.filter((t) => t.id !== editId).length === 0 ? (
                  <div className="text-[10px] text-zinc-600 italic py-1 text-center">
                    No existing tasks to depend on. This will start as Root Available.
                  </div>
                ) : (
                  tasks
                    .filter((t) => t.id !== editId)
                    .map((candidate) => {
                      const isDirectChecked = selectedDeps.includes(candidate.id);
                      const upstreamSubDeps = getUpstreamChain(candidate.id);
                      const candidateTheme = getBatchTheme(candidate.batch);

                      return (
                        <div
                          key={candidate.id}
                          className={`p-1.5 rounded border ${
                            isDirectChecked
                              ? 'bg-indigo-950/40 border-indigo-500 text-white'
                              : 'bg-zinc-900/60 border-zinc-800 text-zinc-300'
                          }`}
                        >
                          <label className="flex items-center justify-between gap-2 cursor-pointer">
                            <div className="flex items-center gap-2 min-w-0">
                              <input
                                type="checkbox"
                                checked={isDirectChecked}
                                onChange={(e) => {
                                  if (e.target.checked) setSelectedDeps([...selectedDeps, candidate.id]);
                                  else setSelectedDeps(selectedDeps.filter((id) => id !== candidate.id));
                                }}
                                className="rounded border-zinc-700 text-indigo-600 focus:ring-0"
                              />
                              <span className="font-semibold text-[11px] truncate">{candidate.name}</span>
                            </div>

                            <div className="flex items-center gap-1 text-[9px] font-mono text-zinc-400 flex-shrink-0">
                              <span className="px-1 py-0.2 rounded bg-zinc-800">{candidate.owner}</span>
                              {candidate.batch && candidate.batch !== 'None' && (
                                <span className={`px-1 py-0.2 rounded font-bold ${candidateTheme.badge}`}>
                                  {candidate.batch}
                                </span>
                              )}
                            </div>
                          </label>

                          {isDirectChecked && upstreamSubDeps.length > 0 && (
                            <div className="mt-1 pl-4 pt-1 border-t border-indigo-500/20 text-[10px] text-indigo-300 flex items-center gap-1.5 flex-wrap">
                              <CornerDownRight className="w-3 h-3 text-indigo-400 flex-shrink-0" />
                              <span className="font-mono text-zinc-400">Chained:</span>
                              {upstreamSubDeps.map((sub, sIdx) => (
                                <span
                                  key={sub.id + sIdx}
                                  className="px-1.5 py-0.2 rounded bg-zinc-800/80 text-zinc-300 border border-zinc-700"
                                >
                                  {sub.name}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
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
                Save Task
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
