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
  ArrowLeft,
  ArrowRight,
  GripVertical,
  Timer,
  Layers,
  CornerDownRight,
  Link2,
  AlertCircle,
  ArrowRightCircle,
  FolderKanban,
  Sliders,
  Check,
  ListPlus,
  Split,
  CheckSquare,
  Square,
  ListTodo,
} from 'lucide-react';

export type BatchTag =
  | 'None'
  | 'Batch 1'
  | 'Batch 2'
  | 'Batch 3'
  | 'Batch 4'
  | 'Batch 5'
  | 'Batch 6'
  | 'Batch 7'
  | 'Batch 8'
  | 'Batch 9'
  | 'Batch 10'
  | 'Batch 11'
  | 'Batch 12';

export interface ParallelGroupConfig {
  id: string;
  name: string;
  slotLimit: number; // e.g. Development = 3, Study = 1
}

export interface SubTask {
  id: string;
  name: string;
  status: 'todo' | 'done';
}

interface Task {
  id: string;
  name: string;
  owner: 'Me' | 'AI' | 'Other';
  batch: BatchTag;
  isParallel?: boolean; // true = Parallel stream work, false/undefined = Standard sequential
  parallelGroup?: string; // e.g. "Development", "Study", etc.
  subTasks?: SubTask[]; // Sub-tasks breakdown (e.g. solve question 1, 2, 3)
  deadline: string;
  estimate: string;
  description?: string;
  notes?: string;
  dependencies: string[];
  manualStatus: 'todo' | 'progress' | 'done';
  createdAt: number;
  order?: number;
  startedAt?: number | null;
  completedAt?: number | null;
  totalTimeSpentSeconds?: number;
}

const STORAGE_KEY = 'smart_task_manager_v1';
const BATCH_ORDER_KEY = 'smart_task_batch_order_v1';
const PARALLEL_GROUPS_KEY = 'smart_task_parallel_groups_v1';

const DEFAULT_PARALLEL_GROUPS: ParallelGroupConfig[] = [
  { id: 'pgrp_dev', name: 'Development', slotLimit: 3 },
  { id: 'pgrp_study', name: 'Study', slotLimit: 1 },
];

export const ALL_BATCHES: BatchTag[] = [
  'Batch 1',
  'Batch 2',
  'Batch 3',
  'Batch 4',
  'Batch 5',
  'Batch 6',
  'Batch 7',
  'Batch 8',
  'Batch 9',
  'Batch 10',
  'Batch 11',
  'Batch 12',
];

const DEFAULT_BATCH_ORDER: BatchTag[] = [...ALL_BATCHES];

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
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

// 12 unique color themes for batches with high readability
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
        short: 'B1',
      };
    case 'Batch 2':
      return {
        cardBg: 'bg-purple-950/40 border-purple-600/70 text-purple-100',
        cardTitle: 'text-purple-100',
        descBg: 'bg-purple-950/60 border-purple-800/60 text-purple-200/90',
        badge: 'bg-purple-500/20 text-purple-300 border border-purple-500/50',
        dropdown: 'bg-purple-950 text-purple-300 border-purple-700/80',
        dagNode: 'bg-purple-950/60 border-purple-500 text-purple-100',
        short: 'B2',
      };
    case 'Batch 3':
      return {
        cardBg: 'bg-amber-950/40 border-amber-600/70 text-amber-100',
        cardTitle: 'text-amber-100',
        descBg: 'bg-amber-950/60 border-amber-800/60 text-amber-200/90',
        badge: 'bg-amber-500/20 text-amber-300 border border-amber-500/50',
        dropdown: 'bg-amber-950 text-amber-300 border-amber-700/80',
        dagNode: 'bg-amber-950/60 border-amber-500 text-amber-100',
        short: 'B3',
      };
    case 'Batch 4':
      return {
        cardBg: 'bg-emerald-950/40 border-emerald-600/70 text-emerald-100',
        cardTitle: 'text-emerald-100',
        descBg: 'bg-emerald-950/60 border-emerald-800/60 text-emerald-200/90',
        badge: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50',
        dropdown: 'bg-emerald-950 text-emerald-300 border-emerald-700/80',
        dagNode: 'bg-emerald-950/60 border-emerald-500 text-emerald-100',
        short: 'B4',
      };
    case 'Batch 5':
      return {
        cardBg: 'bg-rose-950/40 border-rose-600/70 text-rose-100',
        cardTitle: 'text-rose-100',
        descBg: 'bg-rose-950/60 border-rose-800/60 text-rose-200/90',
        badge: 'bg-rose-500/20 text-rose-300 border border-rose-500/50',
        dropdown: 'bg-rose-950 text-rose-300 border-rose-700/80',
        dagNode: 'bg-rose-950/60 border-rose-500 text-rose-100',
        short: 'B5',
      };
    case 'Batch 6':
      return {
        cardBg: 'bg-cyan-950/40 border-cyan-600/70 text-cyan-100',
        cardTitle: 'text-cyan-100',
        descBg: 'bg-cyan-950/60 border-cyan-800/60 text-cyan-200/90',
        badge: 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50',
        dropdown: 'bg-cyan-950 text-cyan-300 border-cyan-700/80',
        dagNode: 'bg-cyan-950/60 border-cyan-500 text-cyan-100',
        short: 'B6',
      };
    case 'Batch 7':
      return {
        cardBg: 'bg-fuchsia-950/40 border-fuchsia-600/70 text-fuchsia-100',
        cardTitle: 'text-fuchsia-100',
        descBg: 'bg-fuchsia-950/60 border-fuchsia-800/60 text-fuchsia-200/90',
        badge: 'bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/50',
        dropdown: 'bg-fuchsia-950 text-fuchsia-300 border-fuchsia-700/80',
        dagNode: 'bg-fuchsia-950/60 border-fuchsia-500 text-fuchsia-100',
        short: 'B7',
      };
    case 'Batch 8':
      return {
        cardBg: 'bg-lime-950/40 border-lime-600/70 text-lime-100',
        cardTitle: 'text-lime-100',
        descBg: 'bg-lime-950/60 border-lime-800/60 text-lime-200/90',
        badge: 'bg-lime-500/20 text-lime-300 border border-lime-500/50',
        dropdown: 'bg-lime-950 text-lime-300 border-lime-700/80',
        dagNode: 'bg-lime-950/60 border-lime-500 text-lime-100',
        short: 'B8',
      };
    case 'Batch 9':
      return {
        cardBg: 'bg-indigo-950/40 border-indigo-600/70 text-indigo-100',
        cardTitle: 'text-indigo-100',
        descBg: 'bg-indigo-950/60 border-indigo-800/60 text-indigo-200/90',
        badge: 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/50',
        dropdown: 'bg-indigo-950 text-indigo-300 border-indigo-700/80',
        dagNode: 'bg-indigo-950/60 border-indigo-500 text-indigo-100',
        short: 'B9',
      };
    case 'Batch 10':
      return {
        cardBg: 'bg-orange-950/40 border-orange-600/70 text-orange-100',
        cardTitle: 'text-orange-100',
        descBg: 'bg-orange-950/60 border-orange-800/60 text-orange-200/90',
        badge: 'bg-orange-500/20 text-orange-300 border border-orange-500/50',
        dropdown: 'bg-orange-950 text-orange-300 border-orange-700/80',
        dagNode: 'bg-orange-950/60 border-orange-500 text-orange-100',
        short: 'B10',
      };
    case 'Batch 11':
      return {
        cardBg: 'bg-teal-950/40 border-teal-600/70 text-teal-100',
        cardTitle: 'text-teal-100',
        descBg: 'bg-teal-950/60 border-teal-800/60 text-teal-200/90',
        badge: 'bg-teal-500/20 text-teal-300 border border-teal-500/50',
        dropdown: 'bg-teal-950 text-teal-300 border-teal-700/80',
        dagNode: 'bg-teal-950/60 border-teal-500 text-teal-100',
        short: 'B11',
      };
    case 'Batch 12':
      return {
        cardBg: 'bg-violet-950/40 border-violet-600/70 text-violet-100',
        cardTitle: 'text-violet-100',
        descBg: 'bg-violet-950/60 border-violet-800/60 text-violet-200/90',
        badge: 'bg-violet-500/20 text-violet-300 border border-violet-500/50',
        dropdown: 'bg-violet-950 text-violet-300 border-violet-700/80',
        dagNode: 'bg-violet-950/60 border-violet-500 text-violet-100',
        short: 'B12',
      };
    default:
      return {
        cardBg: 'bg-zinc-950 border-zinc-800 text-zinc-200',
        cardTitle: 'text-zinc-100',
        descBg: 'bg-zinc-900/60 border-zinc-800/60 text-zinc-400',
        badge: 'bg-zinc-800 text-zinc-400 border border-zinc-700',
        dropdown: 'bg-zinc-900 text-zinc-400 border-zinc-700',
        dagNode: 'bg-zinc-900 border-zinc-700 text-zinc-200',
        short: 'None',
      };
  }
}

export default function Page() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [batchPriorityOrder, setBatchPriorityOrder] = useState<BatchTag[]>(DEFAULT_BATCH_ORDER);
  const [parallelGroups, setParallelGroups] = useState<ParallelGroupConfig[]>(DEFAULT_PARALLEL_GROUPS);
  const [mounted, setMounted] = useState(false);
  const [view, setView] = useState<'board' | 'dependency'>('board');
  const [search, setSearch] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [batchFilter, setBatchFilter] = useState('');
  const [parallelGroupFilter, setParallelGroupFilter] = useState('');

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
  const [taskIsParallel, setTaskIsParallel] = useState(false);
  const [taskParallelGroup, setTaskParallelGroup] = useState<string>('Development');
  const [taskSubTasks, setTaskSubTasks] = useState<SubTask[]>([]);
  const [newSubTaskInput, setNewSubTaskInput] = useState('');
  const [taskManualStatus, setTaskManualStatus] = useState<'blocked' | 'ready' | 'progress' | 'done'>('ready');
  const [taskDeadline, setTaskDeadline] = useState('');
  const [taskEstimate, setTaskEstimate] = useState('');

  // Parallel Group Config Modal & Multi-Select Queue State
  const [isGroupConfigOpen, setIsGroupConfigOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupSlotLimit, setNewGroupSlotLimit] = useState(3);

  // Multi-select task IDs to queue for each group
  const [selectedTaskIdsForGroup, setSelectedTaskIdsForGroup] = useState<Record<string, string[]>>({});
  const [groupQueueSearch, setGroupQueueSearch] = useState<Record<string, string>>({});

  // Per-Group New Task Quick Input State
  const [queueTaskInputs, setQueueTaskInputs] = useState<
    Record<
      string,
      { name: string; owner: 'Me' | 'AI' | 'Other' }
    >
  >({});

  // Bi-directional dependency tracking
  const [selectedParents, setSelectedParents] = useState<string[]>([]);
  const [selectedChildren, setSelectedChildren] = useState<string[]>([]);

  // Inline Quick Creators
  const [showAddParent, setShowAddParent] = useState(false);
  const [newParentName, setNewParentName] = useState('');
  const [newParentOwner, setNewParentOwner] = useState<'Me' | 'AI' | 'Other'>('Other');
  const [newParentStatus, setNewParentStatus] = useState<'ready' | 'progress' | 'done'>('progress');

  const [showAddChild, setShowAddChild] = useState(false);
  const [newChildName, setNewChildName] = useState('');
  const [newChildOwner, setNewChildOwner] = useState<'Me' | 'AI' | 'Other'>('AI');

  // Local map of status overrides for parent tasks edited inside the modal
  const [parentStatusOverrides, setParentStatusOverrides] = useState<Record<string, 'todo' | 'progress' | 'done'>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [svgContent, setSvgContent] = useState<{ width: number; height: number; paths: string[] }>({
    width: 0,
    height: 0,
    paths: [],
  });

  const getBatchWeight = (b: BatchTag = 'None'): number => {
    if (b === 'None') return 999;
    const idx = batchPriorityOrder.indexOf(b);
    return idx !== -1 ? idx : 99;
  };

  // Initial Load from LocalStorage
  useEffect(() => {
    try {
      const storedGroups = localStorage.getItem(PARALLEL_GROUPS_KEY);
      if (storedGroups) setParallelGroups(JSON.parse(storedGroups));

      const storedOrder = localStorage.getItem(BATCH_ORDER_KEY);
      if (storedOrder) {
        const parsed = JSON.parse(storedOrder);
        const fullList = [...parsed];
        ALL_BATCHES.forEach((b) => {
          if (!fullList.includes(b)) fullList.push(b);
        });
        setBatchPriorityOrder(fullList);
      }

      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setTasks(
          parsed.map((t: any, idx: number) => ({
            ...t,
            order: typeof t.order === 'number' ? t.order : idx,
            batch: t.batch || (t.priority === 'High' ? 'Batch 1' : t.priority === 'Medium' ? 'Batch 2' : 'None'),
            description: t.description || t.doneRule || t.notes || '',
            manualStatus: t.manualStatus === 'triage' ? 'todo' : t.manualStatus,
            totalTimeSpentSeconds: t.totalTimeSpentSeconds || 0,
            isParallel: typeof t.isParallel === 'boolean' ? t.isParallel : !!t.parallelGroup,
            parallelGroup: t.parallelGroup || '',
            subTasks: t.subTasks || [],
          }))
        );
      } else {
        const a = uid(), b = uid(), c = uid(), d = uid();
        const initialTasks: Task[] = [
          { id: a, name: 'Plan for algorithm Lab report', description: 'Outline experiment objectives and formulas', owner: 'Me', batch: 'Batch 1', isParallel: true, parallelGroup: 'Development', deadline: '', estimate: '30m', notes: '', dependencies: [], manualStatus: 'todo', createdAt: Date.now(), order: 0 },
          { id: b, name: 'Plan for micro lab report', description: 'Define pin diagrams and specs', owner: 'Me', batch: 'Batch 1', isParallel: true, parallelGroup: 'Development', deadline: '', estimate: '30m', notes: '', dependencies: [], manualStatus: 'todo', createdAt: Date.now() + 1, order: 1 },
          { id: c, name: 'Write algorithm report prompt', description: 'Template for AI generation', owner: 'Me', batch: 'Batch 2', isParallel: true, parallelGroup: 'Development', deadline: '', estimate: '45m', notes: '', dependencies: [a], manualStatus: 'todo', createdAt: Date.now() + 2, order: 2 },
          {
            id: d,
            name: 'Study Numerical Methods',
            description: 'Solve CT preparation problem sets',
            owner: 'Me',
            batch: 'Batch 2',
            isParallel: true,
            parallelGroup: 'Study',
            subTasks: [
              { id: 'sub_1', name: 'Solve Question 1 (Newton-Raphson)', status: 'done' },
              { id: 'sub_2', name: 'Solve Question 2 (Runge-Kutta 4th)', status: 'todo' },
              { id: 'sub_3', name: 'Solve Question 3 (Gauss-Seidel)', status: 'todo' },
            ],
            deadline: '',
            estimate: '45m',
            notes: '',
            dependencies: [b],
            manualStatus: 'todo',
            createdAt: Date.now() + 3,
            order: 3,
          },
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

  const saveParallelGroups = (newGroups: ParallelGroupConfig[]) => {
    setParallelGroups(newGroups);
    if (typeof window !== 'undefined') {
      localStorage.setItem(PARALLEL_GROUPS_KEY, JSON.stringify(newGroups));
    }
  };

  const saveBatchOrder = (newOrder: BatchTag[]) => {
    setBatchPriorityOrder(newOrder);
    if (typeof window !== 'undefined') {
      localStorage.setItem(BATCH_ORDER_KEY, JSON.stringify(newOrder));
    }
  };

  const shiftBatchPriority = (batch: BatchTag, direction: 'left' | 'right') => {
    const idx = batchPriorityOrder.indexOf(batch);
    if (idx === -1) return;
    const targetIdx = direction === 'left' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= batchPriorityOrder.length) return;

    const newOrder = [...batchPriorityOrder];
    const temp = newOrder[idx];
    newOrder[idx] = newOrder[targetIdx];
    newOrder[targetIdx] = temp;
    saveBatchOrder(newOrder);
  };

  const setTopBatchPriority = (batch: BatchTag) => {
    const remaining = batchPriorityOrder.filter((b) => b !== batch);
    saveBatchOrder([batch, ...remaining]);
  };

  const computedStatus = (t: Task): 'done' | 'progress' | 'blocked' | 'ready' => {
    if (t.manualStatus === 'done') return 'done';
    if (t.manualStatus === 'progress') return 'progress';
    const deps = (t.dependencies || []).map((id) => tasks.find((x) => x.id === id)).filter(Boolean) as Task[];
    const blocked = deps.some((d) => d.manualStatus !== 'done');
    return blocked ? 'blocked' : 'ready';
  };

  // Reorder task positions strictly WITHIN the same batch and column
  const moveTaskWithinBatch = (taskId: string, columnTasks: Task[], direction: 'up' | 'down') => {
    const currentTask = tasks.find((t) => t.id === taskId);
    if (!currentTask) return;

    const batchTasks = columnTasks.filter((t) => (t.batch || 'None') === (currentTask.batch || 'None'));
    const batchIdx = batchTasks.findIndex((t) => t.id === taskId);
    if (batchIdx === -1) return;

    const targetBatchIdx = direction === 'up' ? batchIdx - 1 : batchIdx + 1;
    if (targetBatchIdx < 0 || targetBatchIdx >= batchTasks.length) return;

    const targetTask = batchTasks[targetBatchIdx];
    const idxA = tasks.findIndex((t) => t.id === taskId);
    const idxB = tasks.findIndex((t) => t.id === targetTask.id);
    if (idxA === -1 || idxB === -1) return;

    const newTasks = [...tasks];
    const temp = newTasks[idxA];
    newTasks[idxA] = newTasks[idxB];
    newTasks[idxB] = temp;

    newTasks.forEach((t, i) => {
      t.order = i;
    });

    saveTasks(newTasks);
  };

  const handleBatchChange = (taskId: string, newBatch: BatchTag) => {
    const updated = tasks.map((t) => (t.id === taskId ? { ...t, batch: newBatch } : t));
    saveTasks(updated);
  };

  // Toggle sub-task checkbox on a task card
  const toggleSubTask = (taskId: string, subId: string) => {
    const updated = tasks.map((t) => {
      if (t.id === taskId && t.subTasks) {
        const nextSubs = t.subTasks.map((s) => (s.id === subId ? { ...s, status: s.status === 'done' ? ('todo' as const) : ('done' as const) } : s));
        return { ...t, subTasks: nextSubs };
      }
      return t;
    });
    saveTasks(updated);
  };

  // Drag and Drop handlers restricted within same batch
  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData('text/plain', taskId);
    setDraggedTaskId(taskId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDropOnTask = (targetTaskId: string) => {
    if (!draggedTaskId || draggedTaskId === targetTaskId) return;

    const sourceTask = tasks.find((t) => t.id === draggedTaskId);
    const targetTask = tasks.find((t) => t.id === targetTaskId);
    if (!sourceTask || !targetTask) return;

    if ((sourceTask.batch || 'None') !== (targetTask.batch || 'None')) {
      setDraggedTaskId(null);
      return;
    }

    const idxA = tasks.findIndex((t) => t.id === draggedTaskId);
    const idxB = tasks.findIndex((t) => t.id === targetTaskId);
    if (idxA === -1 || idxB === -1) return;

    const newTasks = [...tasks];
    const [moved] = newTasks.splice(idxA, 1);
    newTasks.splice(idxB, 0, moved);

    newTasks.forEach((t, i) => {
      t.order = i;
    });

    saveTasks(newTasks);
    setDraggedTaskId(null);
  };

  const q = search.toLowerCase();
  const filtered = tasks.filter((t) => {
    const subText = (t.subTasks || []).map((s) => s.name).join(' ');
    const matchesSearch =
      !q || (t.name + ' ' + (t.description || '') + ' ' + subText + ' ' + (t.notes || '')).toLowerCase().includes(q);
    const matchesOwner = !ownerFilter || t.owner === ownerFilter;
    const matchesBatch = !batchFilter || t.batch === batchFilter;
    const matchesParallelGroup =
      !parallelGroupFilter ||
      (parallelGroupFilter === 'parallel_only'
        ? t.isParallel || !!t.parallelGroup
        : parallelGroupFilter === 'non_parallel_only'
        ? !t.isParallel && !t.parallelGroup
        : t.parallelGroup === parallelGroupFilter);

    return matchesSearch && matchesOwner && matchesBatch && matchesParallelGroup;
  });

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

  // Group by Batch Priority First, then preserve manual user order within that batch
  (['blocked', 'ready', 'progress', 'done'] as const).forEach((key) => {
    groups[key].sort((a, b) => {
      const bwA = getBatchWeight(a.batch);
      const bwB = getBatchWeight(b.batch);
      if (bwA !== bwB) return bwA - bwB;
      const ordA = typeof a.order === 'number' ? a.order : a.createdAt;
      const ordB = typeof b.order === 'number' ? b.order : b.createdAt;
      return ordA - ordB;
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
  }, [view, filtered, ownerFilter, batchFilter, parallelGroupFilter, search, batchPriorityOrder]);

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

  const openTaskModal = (id: string | null = null, defaultState?: 'blocked' | 'ready' | 'progress' | 'done') => {
    setEditId(id);
    const current = tasks.find((t) => t.id === id);
    setTaskName(current?.name || '');
    setTaskDescription(current?.description || current?.notes || '');
    setTaskOwner(current?.owner || 'Me');
    setTaskBatch(current?.batch || 'None');
    setTaskIsParallel(typeof current?.isParallel === 'boolean' ? current.isParallel : !!current?.parallelGroup);
    setTaskParallelGroup(current?.parallelGroup || (parallelGroups[0]?.name || 'Development'));
    setTaskSubTasks(current?.subTasks || []);
    setNewSubTaskInput('');
    setTaskDeadline(current?.deadline || '');
    setTaskEstimate(current?.estimate || '');

    setSelectedParents(current?.dependencies || []);
    const existingChildren = id ? tasks.filter((t) => (t.dependencies || []).includes(id)).map((t) => t.id) : [];
    setSelectedChildren(existingChildren);

    setParentStatusOverrides({});
    setShowAddParent(false);
    setNewParentName('');
    setShowAddChild(false);
    setNewChildName('');

    if (current) {
      setTaskManualStatus(computedStatus(current));
    } else {
      setTaskManualStatus(defaultState || 'ready');
    }

    setIsModalOpen(true);
  };

  const handleCreateParentTask = () => {
    const pName = newParentName.trim();
    if (!pName) return;
    const parentId = uid();
    const newParent: Task = {
      id: parentId,
      name: pName,
      owner: newParentOwner,
      batch: taskBatch,
      isParallel: taskIsParallel,
      parallelGroup: taskIsParallel ? taskParallelGroup : '',
      deadline: '',
      estimate: '',
      description: 'Blocking prerequisite parent task',
      dependencies: [],
      manualStatus: newParentStatus === 'done' ? 'done' : newParentStatus === 'progress' ? 'progress' : 'todo',
      createdAt: Date.now() - 100,
      order: 0,
      totalTimeSpentSeconds: 0,
    };

    saveTasks([newParent, ...tasks]);
    setSelectedParents((prev) => [...prev, parentId]);
    setNewParentName('');
    setShowAddParent(false);
  };

  const handleCreateChildTask = () => {
    const cName = newChildName.trim();
    if (!cName) return;
    const childId = uid();
    const newChild: Task = {
      id: childId,
      name: cName,
      owner: newChildOwner,
      batch: taskBatch,
      isParallel: taskIsParallel,
      parallelGroup: taskIsParallel ? taskParallelGroup : '',
      deadline: '',
      estimate: '',
      description: 'Downstream child task',
      dependencies: editId ? [editId] : [],
      manualStatus: 'todo',
      createdAt: Date.now() + 100,
      order: tasks.length + 1,
      totalTimeSpentSeconds: 0,
    };

    saveTasks([...tasks, newChild]);
    setSelectedChildren((prev) => [...prev, childId]);
    setNewChildName('');
    setShowAddChild(false);
  };

  const handleAddSubTask = () => {
    const title = newSubTaskInput.trim();
    if (!title) return;
    setTaskSubTasks((prev) => [...prev, { id: uid(), name: title, status: 'todo' }]);
    setNewSubTaskInput('');
  };

  const handleRemoveSubTask = (subId: string) => {
    setTaskSubTasks((prev) => prev.filter((s) => s.id !== subId));
  };

  // Quick Queue: Add BRAND NEW Task directly into group queue
  const handleQueueNewTaskToGroup = (groupName: string) => {
    const input = queueTaskInputs[groupName];
    if (!input || !input.name.trim()) return;

    const newTask: Task = {
      id: uid(),
      name: input.name.trim(),
      owner: input.owner,
      batch: 'Batch 1',
      isParallel: true,
      parallelGroup: groupName,
      deadline: '',
      estimate: '',
      description: '',
      dependencies: [],
      manualStatus: 'progress',
      createdAt: Date.now(),
      order: tasks.length + 1,
      totalTimeSpentSeconds: 0,
    };

    saveTasks([...tasks, newTask]);
    setQueueTaskInputs((prev) => ({
      ...prev,
      [groupName]: { name: '', owner: 'AI' },
    }));
  };

  // Quick Queue: Attach ALL MULTI-SELECTED EXISTING tasks to this parallel group
  const handleAssignSelectedTasksToGroup = (groupName: string) => {
    const selectedIds = selectedTaskIdsForGroup[groupName] || [];
    if (selectedIds.length === 0) return;

    const updated = tasks.map((t) => {
      if (selectedIds.includes(t.id)) {
        return { ...t, isParallel: true, parallelGroup: groupName, manualStatus: 'progress' as const };
      }
      return t;
    });

    saveTasks(updated);
    setSelectedTaskIdsForGroup((prev) => ({ ...prev, [groupName]: [] }));
  };

  // Toggle selection checkbox for an existing task in group queue selector
  const toggleSelectTaskForGroup = (groupName: string, taskId: string) => {
    const currentSelected = selectedTaskIdsForGroup[groupName] || [];
    if (currentSelected.includes(taskId)) {
      setSelectedTaskIdsForGroup((prev) => ({
        ...prev,
        [groupName]: currentSelected.filter((id) => id !== taskId),
      }));
    } else {
      setSelectedTaskIdsForGroup((prev) => ({
        ...prev,
        [groupName]: [...currentSelected, taskId],
      }));
    }
  };

  // Remove a task from a parallel group
  const handleRemoveTaskFromGroup = (taskId: string) => {
    const updated = tasks.map((t) => (t.id === taskId ? { ...t, isParallel: false, parallelGroup: '' } : t));
    saveTasks(updated);
  };

  const saveTask = () => {
    const name = taskName.trim();
    if (!name) return;

    let manualSt: 'todo' | 'progress' | 'done' = 'todo';
    if (taskManualStatus === 'done') manualSt = 'done';
    else if (taskManualStatus === 'progress') manualSt = 'progress';

    const targetId = editId || uid();

    const data = {
      id: targetId,
      name,
      description: taskDescription.trim(),
      owner: taskOwner,
      batch: taskBatch,
      isParallel: taskIsParallel,
      parallelGroup: taskIsParallel ? taskParallelGroup : '',
      subTasks: taskSubTasks,
      deadline: taskDeadline,
      estimate: taskEstimate.trim(),
      notes: '',
      dependencies: selectedParents,
      manualStatus: manualSt,
    };

    let baseList = tasks.map((t) => {
      if (parentStatusOverrides[t.id]) {
        return { ...t, manualStatus: parentStatusOverrides[t.id] };
      }
      return t;
    });

    let updatedTasks: Task[];
    if (editId) {
      updatedTasks = baseList.map((t) => (t.id === editId ? { ...t, ...data } : t));
    } else {
      const newTask: Task = {
        ...data,
        createdAt: Date.now(),
        order: baseList.length,
        totalTimeSpentSeconds: 0,
      };
      updatedTasks = [...baseList, newTask];
    }

    // Bi-directionally synchronize child downstream tasks
    updatedTasks = updatedTasks.map((t) => {
      if (t.id === targetId) return t;
      const isMarkedAsChild = selectedChildren.includes(t.id);
      const currentlyHasAsDep = (t.dependencies || []).includes(targetId);

      if (isMarkedAsChild && !currentlyHasAsDep) {
        return { ...t, dependencies: [...(t.dependencies || []), targetId] };
      } else if (!isMarkedAsChild && currentlyHasAsDep) {
        return { ...t, dependencies: (t.dependencies || []).filter((d) => d !== targetId) };
      }
      return t;
    });

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

  // Topological DAG calculation with DYNAMIC BATCH PRIORITY & straight-lane sorting
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

      list.sort((a, b) => {
        const bwA = getBatchWeight(a.batch);
        const bwB = getBatchWeight(b.batch);
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

  // Helper to partition In Progress items into parallel group queues and active slots
  const renderInProgressColumn = () => {
    const inProgressList = groups.progress;
    if (inProgressList.length === 0) {
      return <div className="py-8 text-center text-[10px] text-zinc-600 italic">Empty</div>;
    }

    const groupedMap: Record<string, Task[]> = {};
    const ungroupedList: Task[] = [];

    inProgressList.forEach((t) => {
      if (t.isParallel && t.parallelGroup) {
        (groupedMap[t.parallelGroup] ||= []).push(t);
      } else {
        ungroupedList.push(t);
      }
    });

    const activeGroupNames = Object.keys(groupedMap);

    return (
      <div className="space-y-2">
        {/* Render Each Parallel Group Queue & Active Slots inside In Progress */}
        {activeGroupNames.map((grpName) => {
          const cfg = parallelGroups.find((g) => g.name === grpName) || {
            id: 'temp',
            name: grpName,
            slotLimit: 3,
          };
          const allGrpTasks = groupedMap[grpName];
          const activeSlots = allGrpTasks.slice(0, cfg.slotLimit);
          const queuedTasks = allGrpTasks.slice(cfg.slotLimit);

          return (
            <div
              key={grpName}
              className="p-1.5 rounded-lg border border-indigo-500/40 bg-indigo-950/20 space-y-1.5"
            >
              <div className="flex items-center justify-between px-1 text-[10px] font-bold text-indigo-300">
                <span className="flex items-center gap-1">
                  <FolderKanban className="w-3 h-3 text-indigo-400" />
                  {grpName} [Slots: {activeSlots.length}/{cfg.slotLimit}]
                </span>
                {queuedTasks.length > 0 && (
                  <span className="text-[9px] text-zinc-400 font-mono">
                    {queuedTasks.length} in queue
                  </span>
                )}
              </div>

              {/* Active Running Slots */}
              <div className="space-y-1">
                {activeSlots.map((t) => renderTaskCard(t, 'progress'))}
              </div>

              {/* Internal Waiting Queue for this parallel group */}
              {queuedTasks.length > 0 && (
                <div className="pt-1 border-t border-indigo-500/20 space-y-1">
                  <span className="text-[9px] uppercase font-bold text-zinc-500 px-1 flex items-center gap-1">
                    <span>Waiting Queue (Auto-refills when slot opens)</span>
                  </span>
                  {queuedTasks.map((t, qIdx) => (
                    <div
                      key={t.id}
                      className="p-1.5 rounded bg-zinc-950/80 border border-zinc-800 text-[10px] text-zinc-400 flex items-center justify-between gap-1"
                    >
                      <div className="flex items-center gap-1.5 truncate flex-1">
                        <span className="font-mono text-[9px] text-zinc-600">#{qIdx + 1}</span>
                        <span className="truncate text-zinc-300">{t.name}</span>
                      </div>
                      <button
                        onClick={() => openTaskModal(t.id)}
                        className="text-zinc-500 hover:text-zinc-300 p-0.5"
                      >
                        <Pencil className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Ungrouped Standard In-Progress Tasks */}
        {ungroupedList.length > 0 && (
          <div className="space-y-1">
            {activeGroupNames.length > 0 && (
              <div className="text-[9px] font-bold uppercase text-zinc-500 px-1 pt-1">
                Standard (Sequential) Tasks
              </div>
            )}
            {ungroupedList.map((t) => renderTaskCard(t, 'progress'))}
          </div>
        )}
      </div>
    );
  };

  const renderTaskCard = (t: Task, colKey: 'blocked' | 'ready' | 'progress' | 'done') => {
    const depNames = (t.dependencies || [])
      .map((id) => tasks.find((x) => x.id === id))
      .filter(Boolean) as Task[];
    const waiting = depNames.filter((d) => d.manualStatus !== 'done').map((d) => d.name);
    const durationDisplay = getTaskDurationDisplay(t);
    const batchTheme = getBatchTheme(t.batch);

    const list = groups[colKey];
    const batchSiblings = list.filter((x) => (x.batch || 'None') === (t.batch || 'None'));
    const posInBatch = batchSiblings.findIndex((x) => x.id === t.id);
    const isFirstInBatch = posInBatch === 0;
    const isLastInBatch = posInBatch === batchSiblings.length - 1;

    const completedSubsCount = (t.subTasks || []).filter((s) => s.status === 'done').length;
    const totalSubsCount = (t.subTasks || []).length;

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
            <GripVertical className="w-3 h-3 text-zinc-400/60 cursor-grab active:cursor-grabbing" />
            <span className="text-[9px] px-1 rounded font-semibold bg-black/30 border border-white/10 text-zinc-200">
              {t.owner}
            </span>
            {t.isParallel && t.parallelGroup && (
              <span className="text-[8px] px-1 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center gap-0.5">
                <Split className="w-2 h-2 text-indigo-400" /> {t.parallelGroup}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1">
            <div className="flex items-center gap-0.5 mr-1">
              <button
                disabled={isFirstInBatch}
                onClick={(e) => {
                  e.stopPropagation();
                  moveTaskWithinBatch(t.id, list, 'up');
                }}
                className="p-0.5 text-zinc-400 hover:text-white disabled:opacity-20"
                title="Move Up Within Batch"
              >
                <ArrowUp className="w-2.5 h-2.5" />
              </button>
              <button
                disabled={isLastInBatch}
                onClick={(e) => {
                  e.stopPropagation();
                  moveTaskWithinBatch(t.id, list, 'down');
                }}
                className="p-0.5 text-zinc-400 hover:text-white disabled:opacity-20"
                title="Move Down Within Batch"
              >
                <ArrowDown className="w-2.5 h-2.5" />
              </button>
            </div>

            <select
              value={t.batch || 'None'}
              onChange={(e) => handleBatchChange(t.id, e.target.value as BatchTag)}
              className={`text-[9px] px-1.5 py-0.2 rounded font-bold cursor-pointer focus:outline-none ${batchTheme.dropdown}`}
            >
              <option value="None" className="bg-zinc-900 text-zinc-400">
                No Batch
              </option>
              {ALL_BATCHES.map((b) => (
                <option key={b} value={b} className="bg-zinc-900 text-zinc-200">
                  {b}
                </option>
              ))}
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

        {/* Sub-Tasks Checklist Breakdown */}
        {t.subTasks && t.subTasks.length > 0 && (
          <div className="p-1.5 bg-black/30 rounded border border-white/10 space-y-1">
            <div className="flex items-center justify-between text-[9px] font-bold text-zinc-400">
              <span className="flex items-center gap-1">
                <ListTodo className="w-2.5 h-2.5 text-indigo-400" /> Sub-Tasks
              </span>
              <span className="font-mono text-[8px] text-emerald-400">
                {completedSubsCount}/{totalSubsCount} Done
              </span>
            </div>
            <div className="space-y-0.5">
              {t.subTasks.map((st) => (
                <div
                  key={st.id}
                  onClick={() => toggleSubTask(t.id, st.id)}
                  className="flex items-center gap-1.5 cursor-pointer text-[10px] py-0.5 text-zinc-300 hover:text-white"
                >
                  {st.status === 'done' ? (
                    <CheckSquare className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                  ) : (
                    <Square className="w-3 h-3 text-zinc-500 flex-shrink-0" />
                  )}
                  <span className={`truncate ${st.status === 'done' ? 'line-through opacity-50 text-zinc-400' : ''}`}>
                    {st.name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {waiting.length > 0 && (
          <div className="text-[10px] text-rose-300 bg-rose-950/80 border border-rose-800/80 px-1.5 py-0.5 rounded truncate flex items-center gap-1">
            <Lock className="w-2.5 h-2.5 flex-shrink-0 text-rose-400" />
            <span className="truncate">Waiting: {waiting.join(', ')}</span>
          </div>
        )}

        <div className="flex items-center justify-between text-[10px] text-zinc-300 pt-0.5">
          {durationDisplay ? (
            <div className="flex items-center gap-1 font-mono px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/30 text-blue-200 animate-pulse border border-blue-400/50">
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

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-1 pt-1 border-t border-white/10">
          {colKey === 'ready' && (
            <button
              onClick={() => startInProgress(t.id)}
              className="px-2 py-0.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-semibold shadow"
            >
              Start
            </button>
          )}

          {colKey === 'progress' && (
            <button
              onClick={() => finishTask(t.id)}
              className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-semibold shadow"
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
  };

  return (
    <div className="h-screen w-screen bg-zinc-950 text-zinc-200 flex flex-col antialiased overflow-hidden select-none font-sans text-xs">
      {/* Top Header */}
      <header className="h-11 px-3 border-b border-zinc-800/80 bg-zinc-900/90 flex items-center justify-between gap-2 flex-shrink-0 z-20">
        <div className="flex items-center gap-2 flex-shrink-0">
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

        {/* Compact, Zero-Overflow Batch Priority Strip */}
        <div className="flex-1 flex items-center justify-center min-w-0 px-2">
          <div className="flex items-center gap-1 bg-zinc-950 border border-zinc-800/90 px-2 py-0.5 rounded-lg overflow-x-auto scrollbar-none max-w-full">
            <span className="text-[10px] font-bold uppercase text-zinc-500 flex items-center gap-1 mr-1 flex-shrink-0">
              <Layers className="w-3 h-3 text-indigo-400" /> Order:
            </span>
            {batchPriorityOrder.map((b, idx) => {
              const theme = getBatchTheme(b);
              return (
                <div
                  key={b}
                  className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded border text-[10px] font-bold transition flex-shrink-0 ${theme.badge}`}
                >
                  <button
                    onClick={() => setTopBatchPriority(b)}
                    title={`Set ${b} as #1 Priority`}
                    className="hover:underline"
                  >
                    {theme.short || b}
                  </button>
                  <div className="flex items-center ml-0.5 opacity-60 hover:opacity-100">
                    <button
                      disabled={idx === 0}
                      onClick={() => shiftBatchPriority(b, 'left')}
                      className="p-0.2 hover:text-white disabled:opacity-20"
                      title="Shift Left"
                    >
                      <ArrowLeft className="w-2.5 h-2.5" />
                    </button>
                    <button
                      disabled={idx === batchPriorityOrder.length - 1}
                      onClick={() => shiftBatchPriority(b, 'right')}
                      className="p-0.2 hover:text-white disabled:opacity-20"
                      title="Shift Right"
                    >
                      <ArrowRight className="w-2.5 h-2.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={() => setIsGroupConfigOpen(true)}
            className="p-1 rounded bg-zinc-800/80 text-zinc-400 hover:text-zinc-200 transition flex items-center gap-1 text-[10px] px-2 font-semibold"
            title="Configure Parallel Groups & Queues"
          >
            <Sliders className="w-3 h-3 text-indigo-400" /> Groups & Queues
          </button>
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

      {/* Filter Row with Parallel Group View Filter */}
      <div className="px-3 py-1.5 border-b border-zinc-800/60 bg-zinc-900/30 flex items-center justify-between gap-2 flex-shrink-0">
        <div className="relative flex-1 max-w-xs">
          <Search className="w-3 h-3 text-zinc-500 absolute left-2 top-1.5" />
          <input
            placeholder="Search tasks or sub-tasks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded pl-6 pr-2 py-0.5 text-[11px] text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
          />
        </div>

        <div className="flex items-center gap-1.5">
          {/* Parallel Group Stream Filter */}
          <select
            value={parallelGroupFilter}
            onChange={(e) => setParallelGroupFilter(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded px-1.5 py-0.5 text-[11px] text-indigo-300 focus:outline-none font-medium"
          >
            <option value="">All Streams (Parallel & Standard)</option>
            <option value="parallel_only">⚡ All Parallel Work Only</option>
            <option value="non_parallel_only">Standard (Non-Parallel) Only</option>
            {parallelGroups.map((g) => (
              <option key={g.id} value={g.name}>
                📁 {g.name} Stream
              </option>
            ))}
          </select>

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

          {/* Batch Filter with All 12 Batches */}
          <select
            value={batchFilter}
            onChange={(e) => setBatchFilter(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded px-1.5 py-0.5 text-[11px] text-zinc-300 focus:outline-none font-medium"
          >
            <option value="">All Batches</option>
            {ALL_BATCHES.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
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
                    {colKey === 'progress' ? (
                      /* Special Parallel Queue & Slot Engine inside In-Progress */
                      renderInProgressColumn()
                    ) : list.length === 0 ? (
                      <div className="py-8 text-center text-[10px] text-zinc-600 italic">Empty</div>
                    ) : (
                      list.map((t) => renderTaskCard(t, colKey))
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

      {/* Task Edit/Create Modal (Cleaned up, zero goal task clutter) */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsModalOpen(false);
          }}
        >
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-xl p-4 space-y-3 shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <span className="font-bold text-xs text-zinc-100 flex items-center gap-1.5">
                <Link2 className="w-3.5 h-3.5 text-indigo-400" />
                {editId ? 'Edit Task' : 'New Task'}
              </span>
              <button onClick={() => setIsModalOpen(false)} className="text-zinc-500 hover:text-zinc-300">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Task Name & Target Belonging Status */}
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1">
                  Task Name *
                </label>
                <input
                  value={taskName}
                  onChange={(e) => setTaskName(e.target.value)}
                  placeholder="e.g. Study numerical methods"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1">
                  Task State / Belonging
                </label>
                <select
                  value={taskManualStatus}
                  onChange={(e) => setTaskManualStatus(e.target.value as any)}
                  className={`w-full border rounded px-2 py-1.5 text-xs font-bold focus:outline-none ${
                    taskManualStatus === 'blocked'
                      ? 'bg-rose-950/60 border-rose-600 text-rose-300'
                      : taskManualStatus === 'ready'
                      ? 'bg-emerald-950/60 border-emerald-600 text-emerald-300'
                      : taskManualStatus === 'progress'
                      ? 'bg-blue-950/60 border-blue-600 text-blue-300'
                      : 'bg-zinc-900 border-zinc-700 text-zinc-300'
                  }`}
                >
                  <option value="blocked" className="bg-zinc-900 text-rose-400">
                    BLOCKED
                  </option>
                  <option value="ready" className="bg-zinc-900 text-emerald-400">
                    READY
                  </option>
                  <option value="progress" className="bg-zinc-900 text-blue-400">
                    IN PROGRESS
                  </option>
                  <option value="done" className="bg-zinc-900 text-zinc-300">
                    DONE
                  </option>
                </select>
              </div>
            </div>

            {/* Sub-Tasks Breakdown Section */}
            <div className="p-2.5 bg-zinc-950/90 border border-zinc-800 rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-indigo-400 flex items-center gap-1">
                  <ListTodo className="w-3 h-3 text-indigo-400" /> Sub-Tasks Breakdown (e.g. Solve Question 1, 2, 3)
                </span>
                <span className="text-[9px] text-zinc-500 font-mono">
                  {taskSubTasks.filter((s) => s.status === 'done').length}/{taskSubTasks.length} Done
                </span>
              </div>

              {taskSubTasks.length > 0 && (
                <div className="space-y-1">
                  {taskSubTasks.map((st, idx) => (
                    <div
                      key={st.id}
                      className="p-1 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-between gap-1 text-[11px]"
                    >
                      <div className="flex items-center gap-2 truncate flex-1">
                        <span className="font-mono text-[9px] text-zinc-500">#{idx + 1}</span>
                        <span className={`truncate text-zinc-200 ${st.status === 'done' ? 'line-through opacity-50' : ''}`}>
                          {st.name}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveSubTask(st.id)}
                        className="p-0.5 text-zinc-500 hover:text-rose-400"
                        title="Remove sub-task"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-1.5">
                <input
                  placeholder="Add sub-task (e.g. Solve question 1)..."
                  value={newSubTaskInput}
                  onChange={(e) => setNewSubTaskInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddSubTask();
                    }
                  }}
                  className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="button"
                  onClick={handleAddSubTask}
                  className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[10px] rounded"
                >
                  + Add Sub-Task
                </button>
              </div>
            </div>

            {/* Parallel Work Selector Option */}
            <div className="p-2.5 bg-indigo-950/20 border border-indigo-500/30 rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-indigo-300 flex items-center gap-1">
                  <Split className="w-3 h-3 text-indigo-400" /> Work Type (Parallel Stream vs. Standard)
                </span>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1 cursor-pointer text-xs">
                    <input
                      type="radio"
                      name="parallelChoice"
                      checked={!taskIsParallel}
                      onChange={() => setTaskIsParallel(false)}
                      className="text-indigo-600"
                    />
                    <span className="text-zinc-300">Standard Sequential</span>
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer text-xs">
                    <input
                      type="radio"
                      name="parallelChoice"
                      checked={taskIsParallel}
                      onChange={() => setTaskIsParallel(true)}
                      className="text-indigo-500"
                    />
                    <span className="text-indigo-300 font-semibold">⚡ Parallel Group Work</span>
                  </label>
                </div>
              </div>

              {taskIsParallel && (
                <div className="flex items-center gap-2 pt-1 border-t border-indigo-500/20">
                  <span className="text-[10px] text-zinc-400 font-semibold flex-shrink-0">Assign to Parallel Stream:</span>
                  <select
                    value={taskParallelGroup}
                    onChange={(e) => setTaskParallelGroup(e.target.value)}
                    className="flex-1 bg-zinc-950 border border-indigo-500/40 rounded px-2 py-1 text-xs text-indigo-200 font-bold"
                  >
                    {parallelGroups.map((g) => (
                      <option key={g.id} value={g.name}>
                        📁 {g.name} [{g.slotLimit} active slots]
                      </option>
                    ))}
                  </select>
                </div>
              )}
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
                  {ALL_BATCHES.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* SECTION 1: BLOCKED BY (Parent Prerequisites) */}
            <div className="space-y-1 pt-1 border-t border-zinc-800">
              <div className="flex items-center justify-between">
                <label className="text-[10px] uppercase font-bold text-rose-400 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> 1. Blocked By (Parents — Tasks that must finish BEFORE this task)
                </label>

                <button
                  type="button"
                  onClick={() => setShowAddParent(!showAddParent)}
                  className="text-[10px] text-rose-400 hover:text-rose-300 font-semibold flex items-center gap-1 underline"
                >
                  {showAddParent ? 'Cancel Parent' : '+ Create Blocking Parent'}
                </button>
              </div>

              {/* Inline Parent Task Creator */}
              {showAddParent && (
                <div className="p-2 bg-rose-950/30 border border-rose-500/40 rounded-lg space-y-2 mb-2">
                  <div className="text-[10px] font-bold text-rose-300">
                    Create New Parent Blocker (e.g. Waiting for syllabus / API approval)
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    <input
                      placeholder="Parent task name..."
                      value={newParentName}
                      onChange={(e) => setNewParentName(e.target.value)}
                      className="col-span-2 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200"
                    />
                    <select
                      value={newParentOwner}
                      onChange={(e) => setNewParentOwner(e.target.value as any)}
                      className="bg-zinc-950 border border-zinc-800 rounded px-1.5 py-1 text-[11px] text-zinc-300"
                    >
                      <option value="Other">Other</option>
                      <option value="Me">Me</option>
                      <option value="AI">AI</option>
                    </select>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-1 text-[10px] text-zinc-400">
                      <span>Initial State:</span>
                      <select
                        value={newParentStatus}
                        onChange={(e) => setNewParentStatus(e.target.value as any)}
                        className="bg-zinc-900 border border-zinc-700 rounded px-1.5 py-0.5 text-[10px] text-zinc-200"
                      >
                        <option value="progress">In Progress (Blocking)</option>
                        <option value="ready">Ready (Unfinished)</option>
                        <option value="done">Done (Completed)</option>
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={handleCreateParentTask}
                      className="px-2.5 py-0.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded text-[10px]"
                    >
                      Add & Attach Parent
                    </button>
                  </div>
                </div>
              )}

              {/* List of Parent Candidates */}
              <div className="max-h-32 overflow-y-auto border border-zinc-800 bg-zinc-950 rounded p-1.5 space-y-1.5">
                {tasks.filter((t) => t.id !== editId).length === 0 ? (
                  <div className="text-[10px] text-zinc-600 italic py-1 text-center">
                    No existing tasks to select as parent.
                  </div>
                ) : (
                  tasks
                    .filter((t) => t.id !== editId)
                    .map((candidate) => {
                      const isDirectChecked = selectedParents.includes(candidate.id);
                      const currentCandidateStatus =
                        parentStatusOverrides[candidate.id] || candidate.manualStatus;

                      return (
                        <div
                          key={candidate.id}
                          className={`p-1.5 rounded border ${
                            isDirectChecked
                              ? 'bg-rose-950/40 border-rose-500 text-white'
                              : 'bg-zinc-900/60 border-zinc-800 text-zinc-300'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <label className="flex items-center gap-2 min-w-0 cursor-pointer flex-1">
                              <input
                                type="checkbox"
                                checked={isDirectChecked}
                                onChange={(e) => {
                                  if (e.target.checked) setSelectedParents([...selectedParents, candidate.id]);
                                  else setSelectedParents(selectedParents.filter((id) => id !== candidate.id));
                                }}
                                className="rounded border-zinc-700 text-rose-600 focus:ring-0"
                              />
                              <span className="font-semibold text-[11px] truncate">{candidate.name}</span>
                            </label>

                            <div className="flex items-center gap-1.5 text-[9px] font-mono flex-shrink-0">
                              <span className="px-1 py-0.2 rounded bg-zinc-800 text-zinc-300">
                                {candidate.owner}
                              </span>

                              <select
                                value={currentCandidateStatus}
                                onChange={(e) => {
                                  const newSt = e.target.value as 'todo' | 'progress' | 'done';
                                  setParentStatusOverrides((prev) => ({
                                    ...prev,
                                    [candidate.id]: newSt,
                                  }));
                                }}
                                className={`text-[9px] px-1 py-0.5 rounded font-bold border focus:outline-none ${
                                  currentCandidateStatus === 'done'
                                    ? 'bg-zinc-800 border-zinc-600 text-zinc-300'
                                    : currentCandidateStatus === 'progress'
                                    ? 'bg-blue-950 border-blue-600 text-blue-300'
                                    : 'bg-emerald-950 border-emerald-600 text-emerald-300'
                                }`}
                              >
                                <option value="todo">READY</option>
                                <option value="progress">IN PROGRESS</option>
                                <option value="done">DONE</option>
                              </select>
                            </div>
                          </div>
                        </div>
                      );
                    })
                )}
              </div>
            </div>

            {/* SECTION 2: BLOCKS / UNLOCKS (Child Downstream Tasks) */}
            <div className="space-y-1 pt-2 border-t border-zinc-800">
              <div className="flex items-center justify-between">
                <label className="text-[10px] uppercase font-bold text-emerald-400 flex items-center gap-1">
                  <ArrowRightCircle className="w-3 h-3" /> 2. Blocks / Unlocks (Children — Tasks that wait for this task)
                </label>

                <button
                  type="button"
                  onClick={() => setShowAddChild(!showAddChild)}
                  className="text-[10px] text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1 underline"
                >
                  {showAddChild ? 'Cancel Child' : '+ Create Child Task'}
                </button>
              </div>

              {/* Inline Child Task Creator */}
              {showAddChild && (
                <div className="p-2 bg-emerald-950/30 border border-emerald-500/40 rounded-lg space-y-2 mb-2">
                  <div className="text-[10px] font-bold text-emerald-300">
                    Create New Downstream Child (Will automatically depend on this task)
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    <input
                      placeholder="Child task name..."
                      value={newChildName}
                      onChange={(e) => setNewChildName(e.target.value)}
                      className="col-span-2 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200"
                    />
                    <select
                      value={newChildOwner}
                      onChange={(e) => setNewChildOwner(e.target.value as any)}
                      className="bg-zinc-950 border border-zinc-800 rounded px-1.5 py-1 text-[11px] text-zinc-300"
                    >
                      <option value="AI">AI</option>
                      <option value="Me">Me</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div className="flex items-center justify-end pt-1">
                    <button
                      type="button"
                      onClick={handleCreateChildTask}
                      className="px-2.5 py-0.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded text-[10px]"
                    >
                      Add & Attach Child
                    </button>
                  </div>
                </div>
              )}

              {/* List of Child Candidates */}
              <div className="max-h-32 overflow-y-auto border border-zinc-800 bg-zinc-950 rounded p-1.5 space-y-1.5">
                {tasks.filter((t) => t.id !== editId).length === 0 ? (
                  <div className="text-[10px] text-zinc-600 italic py-1 text-center">
                    No existing tasks to select as children. Click "+ Create Child Task" above.
                  </div>
                ) : (
                  tasks
                    .filter((t) => t.id !== editId)
                    .map((candidate) => {
                      const isChildChecked = selectedChildren.includes(candidate.id);
                      return (
                        <div
                          key={candidate.id}
                          className={`p-1.5 rounded border ${
                            isChildChecked
                              ? 'bg-emerald-950/40 border-emerald-500 text-white'
                              : 'bg-zinc-900/60 border-zinc-800 text-zinc-300'
                          }`}
                        >
                          <label className="flex items-center justify-between gap-2 cursor-pointer">
                            <div className="flex items-center gap-2 min-w-0">
                              <input
                                type="checkbox"
                                checked={isChildChecked}
                                onChange={(e) => {
                                  if (e.target.checked) setSelectedChildren([...selectedChildren, candidate.id]);
                                  else setSelectedChildren(selectedChildren.filter((id) => id !== candidate.id));
                                }}
                                className="rounded border-zinc-700 text-emerald-600 focus:ring-0"
                              />
                              <span className="font-semibold text-[11px] truncate">{candidate.name}</span>
                            </div>
                            <span className="text-[9px] px-1 py-0.2 rounded bg-zinc-800 text-zinc-300">
                              {candidate.owner}
                            </span>
                          </label>
                        </div>
                      );
                    })
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
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
                className="px-4 py-1 bg-indigo-600 hover:bg-indigo-500 font-bold text-white rounded text-xs shadow"
              >
                Save Task
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Parallel Group Configuration & Multi-Select Queue Management Modal */}
      {isGroupConfigOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsGroupConfigOpen(false);
          }}
        >
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-2xl p-4 space-y-4 shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <span className="font-bold text-xs text-zinc-100 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                Configure Groups, Slot Limits & Multi-Task Queues
              </span>
              <button onClick={() => setIsGroupConfigOpen(false)} className="text-zinc-500 hover:text-zinc-300">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Groups List with Multi-Select Existing Tasks & New Task Queuers */}
            <div className="space-y-4">
              {parallelGroups.map((grp) => {
                const grpTasks = tasks.filter((t) => t.isParallel && t.parallelGroup === grp.name && computedStatus(t) !== 'done');
                const formState = queueTaskInputs[grp.name] || { name: '', owner: 'AI' };
                const searchTxt = (groupQueueSearch[grp.name] || '').toLowerCase();
                const availableTasks = tasks.filter(
                  (t) =>
                    (!t.isParallel || t.parallelGroup !== grp.name) &&
                    computedStatus(t) !== 'done' &&
                    (!searchTxt || t.name.toLowerCase().includes(searchTxt) || t.batch.toLowerCase().includes(searchTxt))
                );
                const selectedIds = selectedTaskIdsForGroup[grp.name] || [];

                return (
                  <div
                    key={grp.id}
                    className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FolderKanban className="w-4 h-4 text-indigo-400" />
                        <span className="font-bold text-xs text-white">{grp.name}</span>
                        <span className="text-[10px] text-zinc-500 font-mono">
                          ({grpTasks.length} in group)
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 text-[10px]">
                        <span className="text-zinc-400">Max Running Slots:</span>
                        <input
                          type="number"
                          min={1}
                          max={10}
                          value={grp.slotLimit}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 1;
                            saveParallelGroups(
                              parallelGroups.map((g) => (g.id === grp.id ? { ...g, slotLimit: val } : g))
                            );
                          }}
                          className="w-12 bg-zinc-900 border border-zinc-700 rounded px-1.5 py-0.5 text-xs text-center text-white font-bold"
                        />
                      </div>
                    </div>

                    {/* Current Tasks inside this group */}
                    {grpTasks.length > 0 && (
                      <div className="space-y-1 bg-zinc-900/40 p-2 rounded border border-zinc-800/80">
                        <div className="text-[9px] uppercase font-bold text-zinc-400 mb-1 flex items-center justify-between">
                          <span>Current Tasks in {grp.name} ({grpTasks.length})</span>
                          <span className="text-[8px] text-zinc-500">First {grp.slotLimit} run in active slots</span>
                        </div>
                        <div className="space-y-1 max-h-28 overflow-y-auto">
                          {grpTasks.map((t, idx) => (
                            <div
                              key={t.id}
                              className={`flex items-center justify-between p-1.5 rounded border text-[11px] ${
                                idx < grp.slotLimit ? 'bg-indigo-950/40 border-indigo-500/40 text-white' : 'bg-zinc-950 border-zinc-800/80 text-zinc-300'
                              }`}
                            >
                              <div className="flex items-center gap-1.5 truncate flex-1">
                                <span className="font-mono text-[9px] text-zinc-500">
                                  {idx < grp.slotLimit ? `[Slot ${idx + 1}]` : `[Queue #${idx + 1 - grp.slotLimit}]`}
                                </span>
                                <span className="truncate">{t.name}</span>
                              </div>

                              <div className="flex items-center gap-1.5">
                                <span className="text-[9px] px-1 rounded bg-zinc-900 text-zinc-400 font-mono">
                                  {t.owner}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveTaskFromGroup(t.id)}
                                  className="text-zinc-500 hover:text-rose-400 p-0.5"
                                  title="Remove from group"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Multi-Select Existing Tasks to Queue into this group */}
                    <div className="p-2.5 bg-indigo-950/20 border border-indigo-500/30 rounded-md space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-indigo-300 flex items-center gap-1">
                          <ListPlus className="w-3 h-3 text-indigo-400" /> Multi-Select Existing Tasks to Queue
                        </span>
                        <div className="flex items-center gap-2">
                          <input
                            placeholder="Filter existing tasks..."
                            value={groupQueueSearch[grp.name] || ''}
                            onChange={(e) =>
                              setGroupQueueSearch((prev) => ({
                                ...prev,
                                [grp.name]: e.target.value,
                              }))
                            }
                            className="bg-zinc-950 border border-zinc-800 rounded px-2 py-0.5 text-[10px] text-zinc-200 placeholder-zinc-500"
                          />
                          {selectedIds.length > 0 && (
                            <button
                              type="button"
                              onClick={() => handleAssignSelectedTasksToGroup(grp.name)}
                              className="px-2.5 py-0.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded text-[10px] shadow"
                            >
                              Queue {selectedIds.length} Selected Tasks
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="max-h-36 overflow-y-auto border border-zinc-800/80 bg-zinc-950 rounded p-1.5 space-y-1">
                        {availableTasks.length === 0 ? (
                          <div className="text-[10px] text-zinc-600 italic py-2 text-center">
                            No other existing tasks available to queue.
                          </div>
                        ) : (
                          availableTasks.map((cand) => {
                            const isChecked = selectedIds.includes(cand.id);
                            return (
                              <label
                                key={cand.id}
                                className={`flex items-center justify-between p-1.5 rounded border cursor-pointer transition ${
                                  isChecked
                                    ? 'bg-indigo-950/50 border-indigo-500 text-white'
                                    : 'bg-zinc-900/60 border-zinc-800 text-zinc-300 hover:bg-zinc-900'
                                }`}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => toggleSelectTaskForGroup(grp.name, cand.id)}
                                    className="rounded border-zinc-700 text-indigo-600 focus:ring-0"
                                  />
                                  <span className="text-[11px] font-medium truncate">{cand.name}</span>
                                </div>
                                <div className="flex items-center gap-1 text-[9px] flex-shrink-0">
                                  <span className="px-1 py-0.2 rounded bg-zinc-800 text-zinc-400">
                                    {cand.owner}
                                  </span>
                                  <span className="px-1 py-0.2 rounded bg-zinc-800 text-zinc-400">
                                    {cand.batch}
                                  </span>
                                </div>
                              </label>
                            );
                          })
                        )}
                      </div>
                    </div>

                    {/* Quick Create a BRAND NEW Task into this group */}
                    <div className="p-2 bg-zinc-900/60 border border-zinc-800/80 rounded-md space-y-1.5">
                      <span className="font-bold text-indigo-300 text-[10px]">+ Create & Queue New Task</span>
                      <div className="grid grid-cols-4 gap-1.5">
                        <input
                          placeholder="Task name..."
                          value={formState.name}
                          onChange={(e) =>
                            setQueueTaskInputs((prev) => ({
                              ...prev,
                              [grp.name]: { ...formState, name: e.target.value },
                            }))
                          }
                          className="col-span-3 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200"
                        />
                        <select
                          value={formState.owner}
                          onChange={(e) =>
                            setQueueTaskInputs((prev) => ({
                              ...prev,
                              [grp.name]: { ...formState, owner: e.target.value as any },
                            }))
                          }
                          className="bg-zinc-950 border border-zinc-800 rounded px-1 text-[10px] text-zinc-300"
                        >
                          <option value="AI">AI</option>
                          <option value="Me">Me</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>

                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => handleQueueNewTaskToGroup(grp.name)}
                          className="px-3 py-0.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded text-[10px]"
                        >
                          Create & Queue
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Add Brand New Parallel Group */}
            <div className="pt-2 border-t border-zinc-800 space-y-2">
              <span className="text-[10px] font-bold uppercase text-zinc-400">Add New Parallel Group</span>
              <div className="grid grid-cols-3 gap-1.5">
                <input
                  placeholder="Group name (e.g. Research)"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  className="col-span-2 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200"
                />
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={newGroupSlotLimit}
                  onChange={(e) => setNewGroupSlotLimit(parseInt(e.target.value) || 1)}
                  className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-center text-zinc-200 font-bold"
                  title="Slot limit"
                />
              </div>
              <button
                onClick={() => {
                  const gName = newGroupName.trim();
                  if (!gName) return;
                  const newGrp: ParallelGroupConfig = {
                    id: 'pgrp_' + uid(),
                    name: gName,
                    slotLimit: newGroupSlotLimit,
                  };
                  saveParallelGroups([...parallelGroups, newGrp]);
                  setNewGroupName('');
                }}
                className="w-full py-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded text-xs shadow"
              >
                + Add Parallel Group
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
              if (Array.isArray(data)) saveTasks(data);
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
