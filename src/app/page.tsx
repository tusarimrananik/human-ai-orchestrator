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
  Bot,
  User,
  Sparkles,
  RefreshCw,
  Check,
  ChevronRight,
  Sliders,
} from 'lucide-react';

export type TaskType = 'normal' | 'ai_goal';
export type AIGoalPhase = 'prompting' | 'working' | 'review';

export interface TaskGroup {
  id: string;
  name: string;
  slotLimit: number;
  color: string;
}

export interface Task {
  id: string;
  name: string;
  type: TaskType;
  owner: 'Me' | 'AI' | 'Other';
  groupId: string; // Belongs to a parallel task group (Development, Study, etc.)
  deadline: string;
  estimate: string;
  description?: string;
  notes?: string;
  dependencies: string[];
  manualStatus: 'todo' | 'progress' | 'done';
  aiPhase?: AIGoalPhase;
  aiPrompt?: string;
  aiOutput?: string;
  createdAt: number;
  order?: number;
  startedAt?: number | null;
  completedAt?: number | null;
  totalTimeSpentSeconds?: number;
}

const STORAGE_KEY = 'smart_task_manager_v2';
const GROUPS_STORAGE_KEY = 'smart_task_groups_v2';
const ACTIVE_TURN_KEY = 'smart_task_active_turn_v2';

const DEFAULT_GROUPS: TaskGroup[] = [
  { id: 'grp_dev', name: 'Development', slotLimit: 3, color: 'sky' },
  { id: 'grp_study', name: 'Study', slotLimit: 1, color: 'emerald' },
  { id: 'grp_business', name: 'Business', slotLimit: 2, color: 'purple' },
];

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

export function getGroupTheme(color: string = 'sky') {
  switch (color) {
    case 'sky':
      return {
        cardBg: 'bg-sky-950/40 border-sky-600/70 text-sky-100',
        badge: 'bg-sky-500/20 text-sky-300 border border-sky-500/50',
        activePill: 'bg-sky-600 text-white',
        border: 'border-sky-500',
      };
    case 'emerald':
      return {
        cardBg: 'bg-emerald-950/40 border-emerald-600/70 text-emerald-100',
        badge: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50',
        activePill: 'bg-emerald-600 text-white',
        border: 'border-emerald-500',
      };
    case 'purple':
      return {
        cardBg: 'bg-purple-950/40 border-purple-600/70 text-purple-100',
        badge: 'bg-purple-500/20 text-purple-300 border border-purple-500/50',
        activePill: 'bg-purple-600 text-white',
        border: 'border-purple-500',
      };
    case 'amber':
      return {
        cardBg: 'bg-amber-950/40 border-amber-600/70 text-amber-100',
        badge: 'bg-amber-500/20 text-amber-300 border border-amber-500/50',
        activePill: 'bg-amber-600 text-white',
        border: 'border-amber-500',
      };
    case 'rose':
      return {
        cardBg: 'bg-rose-950/40 border-rose-600/70 text-rose-100',
        badge: 'bg-rose-500/20 text-rose-300 border border-rose-500/50',
        activePill: 'bg-rose-600 text-white',
        border: 'border-rose-500',
      };
    default:
      return {
        cardBg: 'bg-zinc-950 border-zinc-800 text-zinc-200',
        badge: 'bg-zinc-800 text-zinc-400 border border-zinc-700',
        activePill: 'bg-zinc-700 text-white',
        border: 'border-zinc-700',
      };
  }
}

export default function Page() {
  const [groups, setGroups] = useState<TaskGroup[]>(DEFAULT_GROUPS);
  const [activeTurnGroupId, setActiveTurnGroupId] = useState<string>('grp_dev');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [mounted, setMounted] = useState(false);
  const [view, setView] = useState<'board' | 'dependency' | 'interleaved'>('board');
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');

  // Live timer tick for active in-progress tasks
  const [now, setNow] = useState<number>(Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [taskName, setTaskName] = useState('');
  const [taskType, setTaskType] = useState<TaskType>('normal');
  const [taskOwner, setTaskOwner] = useState<'Me' | 'AI' | 'Other'>('Me');
  const [taskGroupId, setTaskGroupId] = useState<string>('grp_dev');
  const [taskManualStatus, setTaskManualStatus] = useState<'blocked' | 'ready' | 'progress' | 'done'>('ready');
  const [taskDeadline, setTaskDeadline] = useState('');
  const [taskEstimate, setTaskEstimate] = useState('');
  const [taskDescription, setTaskDescription] = useState('');

  // AI Task prompt & output
  const [taskAiPrompt, setTaskAiPrompt] = useState('');
  const [taskAiOutput, setTaskAiOutput] = useState('');

  // Group config modal
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupLimit, setNewGroupLimit] = useState(3);
  const [newGroupColor, setNewGroupColor] = useState('sky');

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
      const storedGroups = localStorage.getItem(GROUPS_STORAGE_KEY);
      if (storedGroups) setGroups(JSON.parse(storedGroups));

      const storedTurn = localStorage.getItem(ACTIVE_TURN_KEY);
      if (storedTurn) setActiveTurnGroupId(storedTurn);

      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setTasks(JSON.parse(stored));
      } else {
        const d1 = uid(), d2 = uid(), d3 = uid(), s1 = uid(), s2 = uid();
        const initialTasks: Task[] = [
          { id: d1, name: 'Build Authentication API', type: 'ai_goal', owner: 'AI', groupId: 'grp_dev', deadline: '', estimate: '45m', description: 'Write JWT OAuth backend in Node/Go', dependencies: [], manualStatus: 'progress', aiPhase: 'working', aiPrompt: 'Implement JWT refresh rotation in Next.js', aiOutput: 'Generated middleware & token helpers.', createdAt: Date.now(), order: 0 },
          { id: d2, name: 'Design Database Schema', type: 'ai_goal', owner: 'AI', groupId: 'grp_dev', deadline: '', estimate: '30m', description: 'Postgres Prisma models', dependencies: [], manualStatus: 'progress', aiPhase: 'working', aiPrompt: 'Draft Prisma schema for multi-tenant tasks', aiOutput: 'Schema written with relations.', createdAt: Date.now() + 1, order: 1 },
          { id: d3, name: 'Setup Vercel Deployment', type: 'normal', owner: 'Me', groupId: 'grp_dev', deadline: '', estimate: '20m', description: 'Configure env variables and domain', dependencies: [], manualStatus: 'todo', createdAt: Date.now() + 2, order: 2 },
          { id: s1, name: 'Solve Algorithm CT Question 1', type: 'normal', owner: 'Me', groupId: 'grp_study', deadline: '', estimate: '30m', description: 'Dynamic programming matrix chain multiplication', dependencies: [], manualStatus: 'todo', createdAt: Date.now() + 3, order: 3 },
          { id: s2, name: 'Solve Algorithm CT Question 2', type: 'normal', owner: 'Me', groupId: 'grp_study', deadline: '', estimate: '30m', description: 'Greedy activity selection problem', dependencies: [], manualStatus: 'todo', createdAt: Date.now() + 4, order: 4 },
        ];
        setTasks(initialTasks);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(initialTasks));
      }
    } catch (err) {
      console.warn('LocalStorage error:', err);
    }
    setMounted(true);
  }, []);

  const saveTasks = (newTasks: Task[]) => {
    setTasks(newTasks);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newTasks));
    }
  };

  const saveGroups = (newGroups: TaskGroup[]) => {
    setGroups(newGroups);
    if (typeof window !== 'undefined') {
      localStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(newGroups));
    }
  };

  const switchActiveTurn = (groupId: string) => {
    setActiveTurnGroupId(groupId);
    if (typeof window !== 'undefined') {
      localStorage.setItem(ACTIVE_TURN_KEY, groupId);
    }
  };

  const computedStatus = (t: Task): 'done' | 'progress' | 'blocked' | 'ready' => {
    if (t.manualStatus === 'done') return 'done';
    if (t.manualStatus === 'progress') return 'progress';
    const deps = (t.dependencies || []).map((id) => tasks.find((x) => x.id === id)).filter(Boolean) as Task[];
    const blocked = deps.some((d) => d.manualStatus !== 'done');
    return blocked ? 'blocked' : 'ready';
  };

  // Auto-refill active slots from queue when a task completes
  const completeTask = (id: string) => {
    const target = tasks.find((t) => t.id === id);
    if (!target) return;

    const sessionSeconds = target.startedAt ? Math.floor((Date.now() - target.startedAt) / 1000) : 0;
    const total = (target.totalTimeSpentSeconds || 0) + sessionSeconds;

    const updated = tasks.map((t) => {
      if (t.id === id) {
        return {
          ...t,
          manualStatus: 'done' as const,
          startedAt: null,
          completedAt: Date.now(),
          totalTimeSpentSeconds: total,
        };
      }
      return t;
    });

    saveTasks(updated);
  };

  const reopenTask = (id: string) => {
    saveTasks(
      tasks.map((t) =>
        t.id === id
          ? {
              ...t,
              manualStatus: 'todo' as const,
              aiPhase: t.type === 'ai_goal' ? 'prompting' : undefined,
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

  // AI Goal Task Actions
  const submitAiPrompt = (id: string) => {
    saveTasks(
      tasks.map((t) => {
        if (t.id === id) {
          return {
            ...t,
            manualStatus: 'progress' as const,
            aiPhase: 'working' as const,
            startedAt: Date.now(),
          };
        }
        return t;
      })
    );
  };

  const finishAiGeneration = (id: string) => {
    saveTasks(
      tasks.map((t) => {
        if (t.id === id) {
          return {
            ...t,
            aiPhase: 'review' as const,
          };
        }
        return t;
      })
    );
  };

  const rejectAndRepromptAi = (id: string) => {
    saveTasks(
      tasks.map((t) => {
        if (t.id === id) {
          return {
            ...t,
            manualStatus: 'todo' as const,
            aiPhase: 'prompting' as const,
          };
        }
        return t;
      })
    );
  };

  const startNormalTask = (id: string) => {
    saveTasks(
      tasks.map((t) => {
        if (t.id === id) {
          return {
            ...t,
            manualStatus: 'progress' as const,
            startedAt: Date.now(),
          };
        }
        return t;
      })
    );
  };

  const exportData = () => {
    const blob = new Blob([JSON.stringify({ groups, tasks }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'orchestrator-backup.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const openTaskModal = (id: string | null = null, defaultGroup?: string) => {
    setEditId(id);
    const current = tasks.find((t) => t.id === id);
    setTaskName(current?.name || '');
    setTaskType(current?.type || 'normal');
    setTaskDescription(current?.description || current?.notes || '');
    setTaskOwner(current?.owner || (current?.type === 'ai_goal' ? 'AI' : 'Me'));
    setTaskGroupId(current?.groupId || defaultGroup || activeTurnGroupId);
    setTaskDeadline(current?.deadline || '');
    setTaskEstimate(current?.estimate || '');
    setTaskAiPrompt(current?.aiPrompt || '');
    setTaskAiOutput(current?.aiOutput || '');

    setSelectedParents(current?.dependencies || []);
    const existingChildren = id ? tasks.filter((t) => (t.dependencies || []).includes(id)).map((t) => t.id) : [];
    setSelectedChildren(existingChildren);

    setShowAddParent(false);
    setNewParentName('');
    setShowAddChild(false);
    setNewChildName('');

    if (current) {
      setTaskManualStatus(computedStatus(current));
    } else {
      setTaskManualStatus('ready');
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
      type: 'normal',
      owner: newParentOwner,
      groupId: taskGroupId,
      deadline: '',
      estimate: '',
      description: 'Blocking prerequisite task',
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
      type: newChildOwner === 'AI' ? 'ai_goal' : 'normal',
      owner: newChildOwner,
      groupId: taskGroupId,
      deadline: '',
      estimate: '',
      description: 'Downstream child task',
      dependencies: editId ? [editId] : [],
      manualStatus: 'todo',
      aiPhase: newChildOwner === 'AI' ? 'prompting' : undefined,
      createdAt: Date.now() + 100,
      order: tasks.length + 1,
      totalTimeSpentSeconds: 0,
    };

    saveTasks([...tasks, newChild]);
    setSelectedChildren((prev) => [...prev, childId]);
    setNewChildName('');
    setShowAddChild(false);
  };

  const saveTask = () => {
    const name = taskName.trim();
    if (!name) return;

    let manualSt: 'todo' | 'progress' | 'done' = 'todo';
    if (taskManualStatus === 'done') manualSt = 'done';
    else if (taskManualStatus === 'progress') manualSt = 'progress';

    const targetId = editId || uid();
    const data: Partial<Task> = {
      name,
      type: taskType,
      description: taskDescription.trim(),
      owner: taskOwner,
      groupId: taskGroupId,
      deadline: taskDeadline,
      estimate: taskEstimate.trim(),
      dependencies: selectedParents,
      manualStatus: manualSt,
      aiPrompt: taskAiPrompt.trim(),
      aiOutput: taskAiOutput.trim(),
      aiPhase: taskType === 'ai_goal' ? (manualSt === 'progress' ? 'working' : 'prompting') : undefined,
    };

    let updatedTasks = tasks.map((t) => (t.id === targetId ? { ...t, ...data } : t));

    if (!editId) {
      const newTask: Task = {
        id: targetId,
        createdAt: Date.now(),
        order: tasks.length,
        totalTimeSpentSeconds: 0,
        dependencies: selectedParents,
        name,
        type: taskType,
        owner: taskOwner,
        groupId: taskGroupId,
        deadline: taskDeadline,
        estimate: taskEstimate.trim(),
        manualStatus: manualSt,
        aiPrompt: taskAiPrompt.trim(),
        aiOutput: taskAiOutput.trim(),
        aiPhase: taskType === 'ai_goal' ? 'prompting' : undefined,
      };
      updatedTasks = [...tasks, newTask];
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

  const q = search.toLowerCase();
  const filtered = tasks.filter(
    (t) =>
      (!q || (t.name + ' ' + (t.description || '')).toLowerCase().includes(q)) &&
      (!ownerFilter || t.owner === ownerFilter) &&
      (!groupFilter || t.groupId === groupFilter)
  );

  const groupsObj: Record<'blocked' | 'ready' | 'progress' | 'done', Task[]> = {
    blocked: [],
    ready: [],
    progress: [],
    done: [],
  };

  filtered.forEach((t) => {
    const st = computedStatus(t);
    groupsObj[st].push(t);
  });

  // Calculate Interleaved Parallel Group States (Active Slots vs Waiting Queue)
  const activeTurnGroup = groups.find((g) => g.id === activeTurnGroupId) || groups[0];

  const getGroupSlotData = (group: TaskGroup) => {
    const groupTasks = tasks.filter((t) => t.groupId === group.id && computedStatus(t) !== 'done');
    const activeTasks = groupTasks.slice(0, group.slotLimit);
    const queuedTasks = groupTasks.slice(group.slotLimit);
    const isTurnHandedOff = activeTasks.every(
      (t) => t.manualStatus === 'progress' || t.aiPhase === 'working' || t.aiPhase === 'review'
    );
    return { activeTasks, queuedTasks, isTurnHandedOff, totalRemaining: groupTasks.length };
  };

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
  }, [view, filtered, search, groupFilter]);

  if (!mounted) return null;

  return (
    <div className="h-screen w-screen bg-zinc-950 text-zinc-200 flex flex-col antialiased overflow-hidden select-none font-sans text-xs">
      {/* Top Navigation Bar */}
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
              onClick={() => setView('interleaved')}
              className={`px-2 py-0.5 rounded text-[11px] font-semibold transition flex items-center gap-1 ${
                view === 'interleaved' ? 'bg-indigo-600 text-white shadow-sm' : 'text-zinc-400'
              }`}
            >
              <RefreshCw className="w-3 h-3" /> Turn Rhythm
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

        {/* Turn-Based Rhythm Switcher Strip */}
        <div className="flex-1 flex items-center justify-center min-w-0 px-2">
          <div className="flex items-center gap-1 bg-zinc-950 border border-zinc-800/90 px-2 py-0.5 rounded-lg overflow-x-auto scrollbar-none max-w-full">
            <span className="text-[10px] font-bold uppercase text-zinc-500 flex items-center gap-1 mr-1 flex-shrink-0">
              <RefreshCw className="w-3 h-3 text-indigo-400" /> Turn:
            </span>
            {groups.map((g) => {
              const { activeTasks, isTurnHandedOff, totalRemaining } = getGroupSlotData(g);
              const isCurrentTurn = g.id === activeTurnGroupId;
              const theme = getGroupTheme(g.color);

              return (
                <button
                  key={g.id}
                  onClick={() => switchActiveTurn(g.id)}
                  className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold transition flex-shrink-0 border ${
                    isCurrentTurn
                      ? `${theme.activePill} shadow-md border-transparent`
                      : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <span>{g.name}</span>
                  <span className="font-mono text-[9px] opacity-80">
                    [{activeTasks.length}/{g.slotLimit}]
                  </span>
                  {isTurnHandedOff && activeTasks.length > 0 && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" title="Ready to switch turn" />
                  )}
                </button>
              );
            })}
            <button
              onClick={() => setIsGroupModalOpen(true)}
              className="p-1 text-zinc-500 hover:text-zinc-300"
              title="Configure Groups & Slot Limits"
            >
              <Sliders className="w-3 h-3" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
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
            onClick={() => openTaskModal(null, activeTurnGroupId)}
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
            value={groupFilter}
            onChange={(e) => setGroupFilter(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded px-1.5 py-0.5 text-[11px] text-zinc-300 focus:outline-none font-medium"
          >
            <option value="">All Groups</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
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
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 p-2.5 overflow-hidden min-h-0">
        {view === 'interleaved' ? (
          /* Interleaved Turn-Based View */
          <div className="h-full flex flex-col gap-3 overflow-y-auto">
            {/* Active Turn Highlight Header */}
            <div className="bg-indigo-950/40 border border-indigo-500/50 rounded-xl p-3 flex items-center justify-between shadow-lg">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center font-black text-white text-base">
                  ⚡
                </div>
                <div>
                  <div className="text-[10px] uppercase font-bold text-indigo-400 tracking-wider">
                    Current Turn Focus
                  </div>
                  <div className="text-sm font-bold text-white flex items-center gap-2">
                    <span>{activeTurnGroup?.name}</span>
                    <span className="text-xs text-zinc-400 font-normal">
                      (Keep {activeTurnGroup?.slotLimit} active tasks running)
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {groups.map((g, idx) => {
                  const isNext = g.id !== activeTurnGroupId;
                  if (!isNext) return null;
                  return (
                    <button
                      key={g.id}
                      onClick={() => switchActiveTurn(g.id)}
                      className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 hover:border-indigo-500 text-zinc-200 text-xs font-semibold flex items-center gap-1.5 transition shadow"
                    >
                      <span>Switch Turn to {g.name}</span>
                      <ChevronRight className="w-3.5 h-3.5 text-indigo-400" />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Parallel Groups Lanes */}
            <div className="grid grid-cols-3 gap-3 flex-1 min-h-0">
              {groups.map((grp) => {
                const { activeTasks, queuedTasks } = getGroupSlotData(grp);
                const theme = getGroupTheme(grp.color);
                const isCurrent = grp.id === activeTurnGroupId;

                return (
                  <div
                    key={grp.id}
                    className={`rounded-xl border flex flex-col min-h-0 overflow-hidden ${
                      isCurrent ? 'bg-zinc-900/90 border-indigo-500/80 ring-1 ring-indigo-500/30' : 'bg-zinc-900/40 border-zinc-800/80 opacity-80'
                    }`}
                  >
                    <div className="px-3 py-2 border-b border-zinc-800 bg-zinc-950/80 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${theme.activePill}`} />
                        <span className="font-bold text-xs text-zinc-100">{grp.name}</span>
                      </div>
                      <div className="flex items-center gap-1 font-mono text-[10px]">
                        <span className="text-emerald-400 font-bold">{activeTasks.length} Active</span>
                        <span className="text-zinc-600">/</span>
                        <span className="text-zinc-400">{grp.slotLimit} Slots</span>
                      </div>
                    </div>

                    <div className="p-2 space-y-2 overflow-y-auto flex-1">
                      {/* Active Slots Section */}
                      <div>
                        <div className="text-[10px] font-bold uppercase text-zinc-400 tracking-wider mb-1.5 flex items-center justify-between">
                          <span>Active Slots [{activeTasks.length}/{grp.slotLimit}]</span>
                          {activeTasks.length < grp.slotLimit && (
                            <span className="text-[9px] text-emerald-400">Empty Slot Available</span>
                          )}
                        </div>

                        {activeTasks.length === 0 ? (
                          <div className="py-6 text-center text-[10px] text-zinc-600 italic border border-dashed border-zinc-800 rounded-lg">
                            No active tasks in slots. Add tasks below to start.
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            {activeTasks.map((t) => {
                              const durationDisplay = getTaskDurationDisplay(t);

                              return (
                                <div
                                  key={t.id}
                                  className={`p-2.5 rounded-lg border shadow-sm space-y-1.5 ${theme.cardBg}`}
                                >
                                  <div className="flex items-center justify-between gap-1">
                                    <div className="flex items-center gap-1.5">
                                      {t.type === 'ai_goal' ? (
                                        <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40 flex items-center gap-1">
                                          <Bot className="w-2.5 h-2.5" /> AI Goal
                                        </span>
                                      ) : (
                                        <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/40 flex items-center gap-1">
                                          <User className="w-2.5 h-2.5" /> Normal
                                        </span>
                                      )}
                                      <span className="text-[9px] text-zinc-400 font-semibold">{t.owner}</span>
                                    </div>

                                    {durationDisplay && (
                                      <div className="flex items-center gap-1 font-mono text-[9px] text-emerald-400 bg-black/40 px-1.5 py-0.2 rounded">
                                        <Timer className="w-2.5 h-2.5" /> {durationDisplay}
                                      </div>
                                    )}
                                  </div>

                                  <div className="text-xs font-bold text-white leading-tight">
                                    {t.name}
                                  </div>

                                  {t.description && (
                                    <p className="text-[10px] text-zinc-400 line-clamp-2 leading-snug">
                                      {t.description}
                                    </p>
                                  )}

                                  {/* AI Task Workflow Controls */}
                                  {t.type === 'ai_goal' && (
                                    <div className="pt-1 border-t border-white/10 flex items-center justify-between gap-1">
                                      {t.aiPhase === 'prompting' && (
                                        <button
                                          onClick={() => submitAiPrompt(t.id)}
                                          className="w-full py-1 rounded bg-purple-600 hover:bg-purple-500 text-white font-bold text-[10px] flex items-center justify-center gap-1 shadow"
                                        >
                                          <Bot className="w-3 h-3" /> Hand off to AI & Start
                                        </button>
                                      )}

                                      {t.aiPhase === 'working' && (
                                        <div className="w-full flex items-center justify-between gap-1">
                                          <span className="text-[10px] font-mono text-purple-300 animate-pulse flex items-center gap-1">
                                            <Timer className="w-3 h-3" /> AI Running...
                                          </span>
                                          <button
                                            onClick={() => finishAiGeneration(t.id)}
                                            className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-[10px]"
                                          >
                                            Done Generating
                                          </button>
                                        </div>
                                      )}

                                      {t.aiPhase === 'review' && (
                                        <div className="w-full flex items-center justify-between gap-1">
                                          <button
                                            onClick={() => completeTask(t.id)}
                                            className="flex-1 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] flex items-center justify-center gap-1 shadow"
                                          >
                                            <Check className="w-3 h-3" /> Goal Reached (Done)
                                          </button>
                                          <button
                                            onClick={() => rejectAndRepromptAi(t.id)}
                                            className="px-2 py-0.5 rounded bg-rose-900/80 hover:bg-rose-800 text-rose-200 font-bold text-[10px]"
                                            title="Need new prompt"
                                          >
                                            Re-Prompt
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {/* Normal Task Controls */}
                                  {t.type === 'normal' && (
                                    <div className="pt-1 border-t border-white/10 flex items-center justify-end gap-1">
                                      {t.manualStatus === 'todo' && (
                                        <button
                                          onClick={() => startNormalTask(t.id)}
                                          className="px-2 py-0.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-[10px]"
                                        >
                                          Start
                                        </button>
                                      )}
                                      {t.manualStatus === 'progress' && (
                                        <button
                                          onClick={() => completeTask(t.id)}
                                          className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px]"
                                        >
                                          Complete (Done)
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Waiting Queue Section (Refills empty slots) */}
                      <div className="pt-2 border-t border-zinc-800">
                        <div className="text-[10px] font-bold uppercase text-zinc-500 tracking-wider mb-1 flex items-center justify-between">
                          <span>Queue (Refills slots on completion)</span>
                          <span className="font-mono text-[9px]">{queuedTasks.length} queued</span>
                        </div>

                        {queuedTasks.length === 0 ? (
                          <div className="py-3 text-center text-[10px] text-zinc-600 italic">
                            Queue is empty.
                          </div>
                        ) : (
                          <div className="space-y-1">
                            {queuedTasks.map((t, qIdx) => (
                              <div
                                key={t.id}
                                className="p-1.5 rounded bg-zinc-950 border border-zinc-800 flex items-center justify-between text-zinc-300"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="font-mono text-[9px] text-zinc-600">#{qIdx + 1}</span>
                                  <span className="text-[11px] font-medium truncate">{t.name}</span>
                                </div>
                                <span className="text-[9px] px-1 rounded bg-zinc-900 text-zinc-400 flex-shrink-0">
                                  {t.owner}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="p-2 border-t border-zinc-800 bg-zinc-950 flex items-center justify-between">
                      <button
                        onClick={() => openTaskModal(null, grp.id)}
                        className="w-full py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold text-[11px] transition text-center"
                      >
                        + Add Task to {grp.name}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : view === 'board' ? (
          /* Kanban Board View */
          <div className="h-full grid grid-cols-4 gap-2 min-h-0">
            {(['blocked', 'ready', 'progress', 'done'] as const).map((colKey) => {
              const list = groupsObj[colKey];
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
                        const durationDisplay = getTaskDurationDisplay(t);
                        const taskGroup = groups.find((g) => g.id === t.groupId);
                        const theme = getGroupTheme(taskGroup?.color || 'sky');

                        return (
                          <div
                            key={t.id}
                            className={`p-2 rounded-md border shadow-sm space-y-1 ${theme.cardBg}`}
                          >
                            <div className="flex items-center justify-between gap-1">
                              <div className="flex items-center gap-1">
                                <span className={`text-[9px] px-1 rounded font-semibold ${theme.badge}`}>
                                  {taskGroup?.name || 'Group'}
                                </span>
                                <span className="text-[9px] px-1 rounded font-semibold bg-black/30 border border-white/10 text-zinc-200">
                                  {t.owner}
                                </span>
                              </div>

                              {t.type === 'ai_goal' && (
                                <span className="text-[9px] px-1 rounded font-bold bg-purple-500/20 text-purple-300">
                                  AI Goal
                                </span>
                              )}
                            </div>

                            <div className="text-xs font-bold leading-snug line-clamp-2 text-white">
                              {t.name}
                            </div>

                            {t.description && (
                              <p className="text-[11px] line-clamp-2 leading-relaxed p-1 rounded border bg-black/30 border-white/10 text-zinc-300">
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
                                <div className="flex items-center gap-1 font-mono px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/30 text-blue-200 border border-blue-400/50">
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
                            </div>

                            <div className="flex items-center justify-end gap-1 pt-1 border-t border-white/10">
                              {colKey === 'ready' && (
                                <button
                                  onClick={() => (t.type === 'ai_goal' ? submitAiPrompt(t.id) : startNormalTask(t.id))}
                                  className="px-1.5 py-0.5 rounded bg-indigo-600 text-white text-[10px] font-semibold shadow"
                                >
                                  Start
                                </button>
                              )}
                              {colKey === 'progress' && (
                                <button
                                  onClick={() => completeTask(t.id)}
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
                {groupsObj.ready.concat(groupsObj.progress, groupsObj.blocked).map((t) => {
                  const status = computedStatus(t);
                  const durationDisplay = getTaskDurationDisplay(t);
                  const taskGroup = groups.find((g) => g.id === t.groupId);
                  const theme = getGroupTheme(taskGroup?.color || 'sky');

                  return (
                    <div
                      key={t.id}
                      data-node-id={t.id}
                      className={`p-2.5 rounded-lg border-2 shadow space-y-1 ${theme.cardBg}`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <div className="text-xs font-bold line-clamp-2 leading-tight flex-1 text-white">
                          {t.name}
                        </div>
                        <span className={`text-[8px] font-bold px-1 rounded ${theme.badge}`}>
                          {taskGroup?.name || 'Group'}
                        </span>
                      </div>
                      {t.description && (
                        <p className="text-[10px] line-clamp-2 leading-snug opacity-80 text-zinc-300">
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

            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1">
                  Task Name *
                </label>
                <input
                  value={taskName}
                  onChange={(e) => setTaskName(e.target.value)}
                  placeholder="e.g. Build API endpoints"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1">
                  Task Type
                </label>
                <select
                  value={taskType}
                  onChange={(e) => {
                    const newType = e.target.value as TaskType;
                    setTaskType(newType);
                    if (newType === 'ai_goal') setTaskOwner('AI');
                    else setTaskOwner('Me');
                  }}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-xs font-bold text-zinc-200"
                >
                  <option value="normal">Normal (Human)</option>
                  <option value="ai_goal">AI Goal (Loop)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1">
                  Parallel Task Group
                </label>
                <select
                  value={taskGroupId}
                  onChange={(e) => setTaskGroupId(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 font-bold"
                >
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} [{g.slotLimit} slots]
                    </option>
                  ))}
                </select>
              </div>

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
            </div>

            <div>
              <label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1">
                Description / Context
              </label>
              <textarea
                rows={2}
                value={taskDescription}
                onChange={(e) => setTaskDescription(e.target.value)}
                placeholder="Add task specifications or details..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500 resize-none"
              />
            </div>

            {/* AI Goal Task Prompt Input */}
            {taskType === 'ai_goal' && (
              <div className="p-2.5 bg-purple-950/30 border border-purple-500/40 rounded-lg space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-purple-300 flex items-center gap-1">
                  <Bot className="w-3 h-3" /> Initial AI Prompt / Goal Instructions
                </label>
                <textarea
                  rows={2}
                  value={taskAiPrompt}
                  onChange={(e) => setTaskAiPrompt(e.target.value)}
                  placeholder="Give exact prompt or task instruction for AI..."
                  className="w-full bg-zinc-950 border border-purple-900/60 rounded px-2.5 py-1 text-xs text-purple-200 focus:outline-none resize-none"
                />
              </div>
            )}

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

      {/* Group Configuration Modal */}
      {isGroupModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsGroupModalOpen(false);
          }}
        >
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-md p-4 space-y-3 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <span className="font-bold text-xs text-zinc-100 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                Configure Parallel Groups & Active Slots
              </span>
              <button onClick={() => setIsGroupModalOpen(false)} className="text-zinc-500 hover:text-zinc-300">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              {groups.map((grp) => (
                <div
                  key={grp.id}
                  className="p-2 rounded bg-zinc-950 border border-zinc-800 flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${getGroupTheme(grp.color).activePill}`} />
                    <span className="font-bold text-xs text-white">{grp.name}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-zinc-400">Active Slots:</span>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={grp.slotLimit}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 1;
                        saveGroups(groups.map((g) => (g.id === grp.id ? { ...g, slotLimit: val } : g)));
                      }}
                      className="w-14 bg-zinc-900 border border-zinc-700 rounded px-1.5 py-0.5 text-xs text-center text-white font-bold"
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Add New Group */}
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
                  value={newGroupLimit}
                  onChange={(e) => setNewGroupLimit(parseInt(e.target.value) || 1)}
                  className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-center text-zinc-200 font-bold"
                  title="Slot limit"
                />
              </div>
              <button
                onClick={() => {
                  const gName = newGroupName.trim();
                  if (!gName) return;
                  const newGrp: TaskGroup = {
                    id: 'grp_' + uid(),
                    name: gName,
                    slotLimit: newGroupLimit,
                    color: 'amber',
                  };
                  saveGroups([...groups, newGrp]);
                  setNewGroupName('');
                }}
                className="w-full py-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded text-xs"
              >
                + Add Group
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
              if (data.tasks) saveTasks(data.tasks);
              if (data.groups) saveGroups(data.groups);
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
