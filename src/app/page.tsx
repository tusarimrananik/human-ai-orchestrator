'use client';

import React, { useState, useEffect, useRef, useLayoutEffect, useMemo } from 'react';
import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import { api } from '../../convex/_generated/api';
import {
  addDagTaskAfter,
  addDagTaskSibling,
  alignDagLevels,
  collapseHiddenDagTasks,
  createSourceOrderComparator,
  insertDagTaskBefore,
  swapBatchTaskPositions,
} from '@/lib/dag-layout';
import { clearTaskRank, normalizeTaskRanks, rankActiveTasks, setTaskRank } from '@/lib/task-ranking';
import { getBatchTheme, syncBatchPriorityWithTasks } from '@/lib/batch-theme';
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
  RefreshCw,
  Zap,
  Target,
  RotateCcw,
  Ban,
  Eye,
  EyeOff,
  Boxes,
  Filter,
  ArrowUpDown,
} from 'lucide-react';

type BatchTag = string;

interface ParallelGroupConfig {
  id: string;
  name: string;
  slotLimit: number; // e.g. Development = 3, Study = 1
}

interface SubTask {
  id: string;
  name: string;
  status: 'todo' | 'done';
}

interface Task {
  id: string;
  name: string;
  taskType?: 'normal' | 'goal'; // Normal task vs Goal task
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
  rank?: number;
}

type DagSortMode = 'manual' | 'batch' | 'name' | 'owner' | 'status';
type BatchSortMode = 'manual' | 'name' | 'owner' | 'status' | 'estimate' | 'created';
type BatchSequenceSortMode = 'custom' | 'name-asc' | 'name-desc' | 'count-desc';

const STORAGE_KEY = 'smart_task_manager_v1';
const BATCH_ORDER_KEY = 'smart_task_batch_order_v1';
const PARALLEL_GROUPS_KEY = 'smart_task_parallel_groups_v1';
const ACTIVE_TURN_KEY = 'smart_task_active_turn_v1';
const PARALLEL_MODE_KEY = 'smart_task_parallel_mode_v1';
type WorkspacePayload = {
  schemaVersion: 2;
  tasks: Task[];
  batchPriorityOrder: BatchTag[];
  parallelGroups: ParallelGroupConfig[];
  isParallelModeActive: boolean;
  activeTurnGroupName: string;
};

function migrateOptionalRanks(tasks: Task[], schemaVersion?: number): Task[] {
  if ((schemaVersion || 1) < 2) {
    return tasks.map((task) => {
      const { rank: _rank, ...withoutRank } = task;
      return withoutRank;
    });
  }
  return normalizeTaskRanks(tasks, (task) => task.manualStatus === 'done');
}

const DEFAULT_PARALLEL_GROUPS: ParallelGroupConfig[] = [
  { id: 'pgrp_dev', name: 'Development', slotLimit: 3 },
  { id: 'pgrp_study', name: 'Study', slotLimit: 1 },
];

const ALL_BATCHES: BatchTag[] = [
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

// Natural alphanumeric batch sort comparator (e.g. B1 -> B2 -> ... -> B9 -> B10 -> B11)
function naturalBatchCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

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



export default function Page() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signIn } = useAuthActions();

  if (isLoading) {
    return <main className="flex min-h-screen items-center justify-center bg-zinc-950 text-sm text-zinc-400">Connecting securely…</main>;
  }

  if (!isAuthenticated) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950 p-4 text-zinc-100">
        <section className="w-full max-w-sm rounded-xl border border-zinc-800 bg-zinc-900 p-5 text-center shadow-2xl">
          <div className="mb-2 text-2xl">⚡</div>
          <h1 className="text-base font-bold">Human + AI Work Orchestrator</h1>
          <p className="mt-1 text-xs text-zinc-400">Sign in to securely sync your task graph across devices.</p>
          <button
            onClick={() => void signIn('google', { redirectTo: '/' })}
            className="mt-4 w-full rounded-lg bg-white px-4 py-2 text-sm font-bold text-zinc-900 hover:bg-zinc-200"
          >
            Continue with Google
          </button>
        </section>
      </main>
    );
  }

  return <AuthenticatedOrchestrator />;
}

function AuthenticatedOrchestrator() {
  const me = useQuery(api.workspace.me, {});
  if (me === undefined || me === null) {
    return <main className="flex min-h-screen items-center justify-center bg-zinc-950 text-sm text-zinc-400">Loading private workspace…</main>;
  }
  return <OrchestratorPage userId={me.id} />;
}

function OrchestratorPage({ userId }: { userId: string }) {
  const storageKey = `${STORAGE_KEY}:${userId}`;
  const batchOrderKey = `${BATCH_ORDER_KEY}:${userId}`;
  const parallelGroupsKey = `${PARALLEL_GROUPS_KEY}:${userId}`;
  const activeTurnKey = `${ACTIVE_TURN_KEY}:${userId}`;
  const parallelModeKey = `${PARALLEL_MODE_KEY}:${userId}`;
  const syncEnvelopeKey = `smart_task_sync_v1:${userId}`;
  const legacyOwnerKey = 'smart_task_legacy_owner_v1';
  const [tasks, setTasks] = useState<Task[]>([]);
  const [batchPriorityOrder, setBatchPriorityOrder] = useState<BatchTag[]>(DEFAULT_BATCH_ORDER);
  const [parallelGroups, setParallelGroups] = useState<ParallelGroupConfig[]>(DEFAULT_PARALLEL_GROUPS);
  const [isParallelModeActive, setIsParallelModeActive] = useState<boolean>(false);
  const [activeTurnGroupName, setActiveTurnGroupName] = useState<string>('Study');
  const [devTurnCompletedCount, setDevTurnCompletedCount] = useState<number>(0);
  const [mounted, setMounted] = useState(false);
  const [view, setView] = useState<'queue' | 'dependency' | 'ranked' | 'batch'>('queue');
  const [rankedViewTab, setRankedViewTab] = useState<'active' | 'done'>('active');
  const [search, setSearch] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [batchFilter, setBatchFilter] = useState('');
  const [parallelGroupFilter, setParallelGroupFilter] = useState('');
  const [hiddenStageIndices, setHiddenStageIndices] = useState<number[]>([]);
  const [dagStageAlignMode, setDagStageAlignMode] = useState<'parent' | 'batch'>('parent');
  const [batchSortMode, setBatchSortMode] = useState<BatchSortMode>('manual');
  const [batchSequenceSortMode, setBatchSequenceSortMode] = useState<BatchSequenceSortMode>('custom');
  const [showEmptyBatches, setShowEmptyBatches] = useState<boolean>(true);
  const [selectedBatchTaskIds, setSelectedBatchTaskIds] = useState<string[]>([]);
  const [bulkTargetBatch, setBulkTargetBatch] = useState<string>('');
  const [isBulkCreatingNewBatch, setIsBulkCreatingNewBatch] = useState<boolean>(false);
  const [bulkNewBatchInput, setBulkNewBatchInput] = useState<string>('');
  const [editingBatchName, setEditingBatchName] = useState<string | null>(null);
  const [renameInput, setRenameInput] = useState<string>('');
  const [isNewBatchInputOpen, setIsNewBatchInputOpen] = useState<boolean>(false);
  const [newBatchNameInput, setNewBatchNameInput] = useState<string>('');
  const remoteWorkspace = useQuery(api.workspace.get, {});
  const saveRemoteWorkspace = useMutation(api.workspace.save);
  const remoteRevisionRef = useRef(0);
  const syncReadyRef = useRef(false);
  const lastRemoteHashRef = useRef('');
  const saveInFlightRef = useRef(false);
  const pendingPayloadRef = useRef<WorkspacePayload | null>(null);
  const [syncRetry, setSyncRetry] = useState(0);
  const [syncStatus, setSyncStatus] = useState<'connecting' | 'saved' | 'saving' | 'offline' | 'conflict'>('connecting');

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
  const [dagInsert, setDagInsert] = useState<{ taskId: string; position: 'before' | 'after' | 'top' | 'bottom' } | null>(null);
  const [taskName, setTaskName] = useState('');
  const [taskType, setTaskType] = useState<'normal' | 'goal'>('normal');
  const [taskDescription, setTaskDescription] = useState('');
  const [taskOwner, setTaskOwner] = useState<'Me' | 'AI' | 'Other'>('Me');
  const [taskBatch, setTaskBatch] = useState<BatchTag>('Batch 1');
  const [taskIsParallel, setTaskIsParallel] = useState(false);
  const [taskParallelGroup, setTaskParallelGroup] = useState<string>('Development');
  const [taskSubTasks, setTaskSubTasks] = useState<SubTask[]>([]);
  const [newSubTaskInput, setNewSubTaskInput] = useState('');
  const [taskManualStatus, setTaskManualStatus] = useState<'blocked' | 'ready' | 'progress' | 'done'>('ready');
  const [taskDeadline, setTaskDeadline] = useState('');
  const [taskEstimate, setTaskEstimate] = useState('');

  // Goal Task Review Modal State
  const [reviewingTaskId, setReviewingTaskId] = useState<string | null>(null);
  const [isBlockPickerOpen, setIsBlockPickerOpen] = useState<boolean>(false);
  const [blockParentId, setBlockParentId] = useState<string>('');
  const [blockParentStatus, setBlockParentStatus] = useState<'progress' | 'ready'>('progress');
  const [blockNewParentName, setBlockNewParentName] = useState<string>('');
  const [blockNewParentOwner, setBlockNewParentOwner] = useState<'Me' | 'AI' | 'Other'>('Other');

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
      { name: string; taskType: 'normal' | 'goal'; owner: 'Me' | 'AI' | 'Other' }
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
  const batchContainerRef = useRef<HTMLDivElement>(null);
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
      const canClaimLegacy = !localStorage.getItem(legacyOwnerKey) || localStorage.getItem(legacyOwnerKey) === userId;
      if (canClaimLegacy && !localStorage.getItem(legacyOwnerKey)) localStorage.setItem(legacyOwnerKey, userId);
      const storedGroups = localStorage.getItem(parallelGroupsKey) || (canClaimLegacy ? localStorage.getItem(PARALLEL_GROUPS_KEY) : null);
      if (storedGroups) setParallelGroups(JSON.parse(storedGroups));

      const storedMode = localStorage.getItem(parallelModeKey) || (canClaimLegacy ? localStorage.getItem(PARALLEL_MODE_KEY) : null);
      if (storedMode) setIsParallelModeActive(storedMode === 'true');

      const storedTurn = localStorage.getItem(activeTurnKey) || (canClaimLegacy ? localStorage.getItem(ACTIVE_TURN_KEY) : null);
      if (storedTurn) setActiveTurnGroupName(storedTurn);

      const storedOrder = localStorage.getItem(batchOrderKey) || (canClaimLegacy ? localStorage.getItem(BATCH_ORDER_KEY) : null);
      if (storedOrder) {
        const parsed = JSON.parse(storedOrder);
        const fullList = [...parsed];
        ALL_BATCHES.forEach((b) => {
          if (!fullList.includes(b)) fullList.push(b);
        });
        setBatchPriorityOrder(fullList);
      }

      const stored = localStorage.getItem(storageKey) || (canClaimLegacy ? localStorage.getItem(STORAGE_KEY) : null);
      if (stored) {
        const parsed = JSON.parse(stored);
        const storedEnvelope = JSON.parse(localStorage.getItem(syncEnvelopeKey) || 'null') as { payload?: { schemaVersion?: number } } | null;
        const loadedTasks = migrateOptionalRanks(
          parsed.map((t: any, idx: number) => ({
            ...t,
            taskType: t.taskType || (t.isGoal ? 'goal' : 'normal'),
            order: typeof t.order === 'number' ? t.order : idx,
            batch: t.batch || (t.priority === 'High' ? 'Batch 1' : t.priority === 'Medium' ? 'Batch 2' : 'None'),
            description: t.description || t.doneRule || t.notes || '',
            manualStatus: t.manualStatus === 'triage' ? 'todo' : t.manualStatus,
            totalTimeSpentSeconds: t.totalTimeSpentSeconds || 0,
            isParallel: typeof t.isParallel === 'boolean' ? t.isParallel : !!t.parallelGroup,
            parallelGroup: t.parallelGroup || '',
            subTasks: t.subTasks || [],
          })),
          storedEnvelope?.payload?.schemaVersion
        );
        setTasks(loadedTasks);
        setBatchPriorityOrder((prev) => syncBatchPriorityWithTasks(prev, loadedTasks));
      } else {
        const a = uid(), b = uid(), c = uid(), d = uid();
        const initialTasks: Task[] = [
          { id: a, name: 'Plan for algorithm Lab report', taskType: 'goal', description: 'Outline experiment objectives and formulas', owner: 'Me', batch: 'Batch 1', isParallel: true, parallelGroup: 'Development', deadline: '', estimate: '30m', notes: '', dependencies: [], manualStatus: 'todo', createdAt: Date.now(), order: 0 },
          { id: b, name: 'Plan for micro lab report', taskType: 'goal', description: 'Define pin diagrams and specs', owner: 'Me', batch: 'Batch 1', isParallel: true, parallelGroup: 'Development', deadline: '', estimate: '30m', notes: '', dependencies: [], manualStatus: 'todo', createdAt: Date.now() + 1, order: 1 },
          { id: c, name: 'Write algorithm report prompt', taskType: 'normal', description: 'Template for AI generation', owner: 'Me', batch: 'Batch 2', isParallel: true, parallelGroup: 'Development', deadline: '', estimate: '45m', notes: '', dependencies: [a], manualStatus: 'todo', createdAt: Date.now() + 2, order: 2 },
          {
            id: d,
            name: 'Study Numerical Methods',
            taskType: 'goal',
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
        localStorage.setItem(storageKey, JSON.stringify(initialTasks));
      }
    } catch (err) {
      console.warn('LocalStorage access error:', err);
    }
    setMounted(true);
  }, [userId]);

  // Convex is the durable cross-device source; this user-scoped envelope protects offline edits.
  useEffect(() => {
    if (!mounted || remoteWorkspace === undefined || syncReadyRef.current) return;
    const envelope = JSON.parse(localStorage.getItem(syncEnvelopeKey) || 'null') as
      | { payload: WorkspacePayload; baseRevision: number; dirty: boolean }
      | null;

    if (envelope?.dirty) {
      remoteRevisionRef.current = envelope.baseRevision;
      pendingPayloadRef.current = envelope.payload;
      setSyncStatus(remoteWorkspace && remoteWorkspace.revision !== envelope.baseRevision ? 'conflict' : 'offline');
    } else if (remoteWorkspace) {
      const payload = remoteWorkspace.payload as WorkspacePayload;
      remoteRevisionRef.current = remoteWorkspace.revision;
      lastRemoteHashRef.current = JSON.stringify(payload);
      const rankedTasks = migrateOptionalRanks(payload.tasks, payload.schemaVersion);
      const syncedBatches = syncBatchPriorityWithTasks(payload.batchPriorityOrder as BatchTag[] || DEFAULT_BATCH_ORDER, rankedTasks);
      setTasks(rankedTasks);
      setBatchPriorityOrder(syncedBatches);
      setParallelGroups(payload.parallelGroups);
      setIsParallelModeActive(payload.isParallelModeActive);
      setActiveTurnGroupName(payload.activeTurnGroupName);
      localStorage.setItem(storageKey, JSON.stringify(rankedTasks));
      localStorage.setItem(batchOrderKey, JSON.stringify(syncedBatches));
      localStorage.setItem(parallelGroupsKey, JSON.stringify(payload.parallelGroups));
      localStorage.setItem(parallelModeKey, String(payload.isParallelModeActive));
      localStorage.setItem(activeTurnKey, payload.activeTurnGroupName);
      localStorage.setItem(syncEnvelopeKey, JSON.stringify({ payload, baseRevision: remoteWorkspace.revision, dirty: false }));
      setSyncStatus('saved');
    } else {
      remoteRevisionRef.current = 0;
      setSyncStatus('offline');
    }
    syncReadyRef.current = true;
  }, [mounted, remoteWorkspace, userId]);

  useEffect(() => {
    if (!mounted || !syncReadyRef.current) return;
    const payload: WorkspacePayload = {
      schemaVersion: 2,
      tasks,
      batchPriorityOrder,
      parallelGroups,
      isParallelModeActive,
      activeTurnGroupName,
    };
    const hash = JSON.stringify(payload);
    if (hash === lastRemoteHashRef.current) return;
    pendingPayloadRef.current = payload;
    localStorage.setItem(syncEnvelopeKey, JSON.stringify({ payload, baseRevision: remoteRevisionRef.current, dirty: true }));
    setSyncStatus('saving');

    const timer = window.setTimeout(async () => {
      if (saveInFlightRef.current || !pendingPayloadRef.current) return;
      saveInFlightRef.current = true;
      const sending = pendingPayloadRef.current;
      const sendingHash = JSON.stringify(sending);
      try {
        const result = await saveRemoteWorkspace({ payload: sending, expectedRevision: remoteRevisionRef.current });
        if (!result.ok) {
          remoteRevisionRef.current = result.revision;
          setSyncStatus('conflict');
          return;
        }
        remoteRevisionRef.current = result.revision;
        lastRemoteHashRef.current = sendingHash;
        if (JSON.stringify(pendingPayloadRef.current) === sendingHash) {
          pendingPayloadRef.current = null;
          localStorage.setItem(syncEnvelopeKey, JSON.stringify({ payload: sending, baseRevision: result.revision, dirty: false }));
          setSyncStatus('saved');
        }
      } catch (error) {
        console.warn('Convex sync deferred:', error);
        setSyncStatus('offline');
        window.setTimeout(() => setSyncRetry((value) => value + 1), 2000);
      } finally {
        saveInFlightRef.current = false;
        if (pendingPayloadRef.current && JSON.stringify(pendingPayloadRef.current) !== sendingHash) {
          setSyncRetry((value) => value + 1);
        }
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [mounted, tasks, batchPriorityOrder, parallelGroups, isParallelModeActive, activeTurnGroupName, saveRemoteWorkspace, syncRetry]);

  const saveTasks = (newTasks: Task[]) => {
    const rankedTasks = normalizeTaskRanks(newTasks, (task) => task.manualStatus === 'done');
    setTasks(rankedTasks);
    if (typeof window !== 'undefined') {
      localStorage.setItem(storageKey, JSON.stringify(rankedTasks));
    }

    const syncedBatches = syncBatchPriorityWithTasks(batchPriorityOrder, rankedTasks);
    if (syncedBatches.length > batchPriorityOrder.length) {
      saveBatchOrder(syncedBatches);
    }
  };

  const changeTaskRank = (taskId: string, rank: number) => {
    saveTasks(setTaskRank(tasks, taskId, rank, (task) => task.manualStatus === 'done'));
  };

  const removeTaskRank = (taskId: string) => {
    saveTasks(clearTaskRank(tasks, taskId, (task) => task.manualStatus === 'done'));
  };

  const saveParallelGroups = (newGroups: ParallelGroupConfig[]) => {
    setParallelGroups(newGroups);
    if (typeof window !== 'undefined') {
      localStorage.setItem(parallelGroupsKey, JSON.stringify(newGroups));
    }
  };

  const saveBatchOrder = (newOrder: BatchTag[]) => {
    setBatchPriorityOrder(newOrder);
    if (typeof window !== 'undefined') {
      localStorage.setItem(batchOrderKey, JSON.stringify(newOrder));
    }
  };

  const switchActiveTurn = (groupName: string) => {
    setActiveTurnGroupName(groupName);
    if (typeof window !== 'undefined') {
      localStorage.setItem(activeTurnKey, groupName);
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

    // Also reorder tasks in the array so source order matches the new batch priority
    const promotedBatch = direction === 'left' ? batch : newOrder[idx];
    const demotedBatch = direction === 'left' ? newOrder[idx] : batch;
    const reorderedTasks = swapBatchTaskPositions(tasks, promotedBatch, demotedBatch);
    saveTasks(reorderedTasks);
  };

  const sortBatchSequence = (mode: BatchSequenceSortMode) => {
    setBatchSequenceSortMode(mode);
    const next = [...batchPriorityOrder];
    if (mode === 'name-asc') {
      next.sort(naturalBatchCompare);
    } else if (mode === 'name-desc') {
      next.sort((a, b) => naturalBatchCompare(b, a));
    } else if (mode === 'count-desc') {
      next.sort((a, b) => {
        const cntA = tasks.filter((t) => (t.batch || 'Batch 1') === a).length;
        const cntB = tasks.filter((t) => (t.batch || 'Batch 1') === b).length;
        return cntB - cntA || naturalBatchCompare(a, b);
      });
    }
    saveBatchOrder(next);
  };

  const handleAddNewBatch = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (batchPriorityOrder.includes(trimmed)) return;
    const next = [...batchPriorityOrder, trimmed];
    if (batchSequenceSortMode === 'name-asc') {
      next.sort(naturalBatchCompare);
    } else if (batchSequenceSortMode === 'name-desc') {
      next.sort((a, b) => naturalBatchCompare(b, a));
    }
    saveBatchOrder(next);
    setNewBatchNameInput('');
    setIsNewBatchInputOpen(false);
  };

  const handleRenameBatch = (oldName: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName) {
      setEditingBatchName(null);
      setRenameInput('');
      return;
    }

    // Update batch order
    const nextOrder = batchPriorityOrder.map((b) => (b === oldName ? trimmed : b));
    saveBatchOrder(nextOrder);

    // Update all tasks in this batch
    const updatedTasks = tasks.map((t) => ((t.batch || 'Batch 1') === oldName ? { ...t, batch: trimmed } : t));
    saveTasks(updatedTasks);

    if (batchFilter === oldName) setBatchFilter(trimmed);
    if (bulkTargetBatch === oldName) setBulkTargetBatch(trimmed);
    if (taskBatch === oldName) setTaskBatch(trimmed);

    setEditingBatchName(null);
    setRenameInput('');
  };

  const createNextBatchAfter = (targetBatch: string) => {
    const targetIdx = batchPriorityOrder.indexOf(targetBatch);
    if (targetIdx === -1) return;

    let nextName = '';
    const match = targetBatch.match(/^Batch\s+(\d+)$/i);
    if (match) {
      const num = parseInt(match[1], 10);
      let candidateNum = num + 1;
      while (batchPriorityOrder.includes(`Batch ${candidateNum}`)) {
        candidateNum++;
      }
      nextName = `Batch ${candidateNum}`;
    } else {
      let candidate = `${targetBatch} 2`;
      let counter = 2;
      while (batchPriorityOrder.includes(candidate)) {
        counter++;
        candidate = `${targetBatch} ${counter}`;
      }
      nextName = candidate;
    }

    const newOrder = [...batchPriorityOrder];
    newOrder.splice(targetIdx + 1, 0, nextName);
    saveBatchOrder(newOrder);
  };

  const toggleSelectBatchTask = (taskId: string) => {
    setSelectedBatchTaskIds((prev) =>
      prev.includes(taskId) ? prev.filter((id) => id !== taskId) : [...prev, taskId]
    );
  };

  // Toggle single task selection without auto-mutating batch targets
  const toggleSelectDagTask = (taskId: string) => {
    setSelectedBatchTaskIds((prev) =>
      prev.includes(taskId) ? prev.filter((id) => id !== taskId) : [...prev, taskId]
    );
  };

  const queueSelectedTasks = () => {
    if (selectedBatchTaskIds.length === 0) return;

    // Collect all selected tasks + all of their uncompleted upstream parent dependencies
    const allTargetIds = new Set<string>();
    selectedBatchTaskIds.forEach((id) => {
      allTargetIds.add(id);
      getUpstreamChain(id)
        .filter((t) => t.manualStatus !== 'done')
        .forEach((p) => allTargetIds.add(p.id));
    });

    let nextTasks = [...tasks];
    const uncompletedSelected = Array.from(allTargetIds)
      .map((id) => nextTasks.find((t) => t.id === id))
      .filter((t): t is Task => Boolean(t && t.manualStatus !== 'done'));

    const { orderedLevels, levels } = alignDagLevels(
      uncompletedSelected,
      (a, b) => getBatchWeight(a.batch) - getBatchWeight(b.batch)
    );

    const topoOrderedIds: string[] = [];
    orderedLevels.forEach((lvl) => {
      (levels[lvl] || []).forEach((t) => topoOrderedIds.push(t.id));
    });

    topoOrderedIds.forEach((id, idx) => {
      nextTasks = setTaskRank(nextTasks, id, idx + 1, (t) => t.manualStatus === 'done');
    });

    saveTasks(nextTasks);
    setSelectedBatchTaskIds([]);
    setView('queue');
  };

  const clearExecutionQueue = () => {
    const cleared = tasks.map((t) => (t.rank ? { ...t, rank: undefined } : t));
    saveTasks(cleared);
  };

  const toggleSelectAllInBatch = (batchTasks: Task[]) => {
    const taskIds = batchTasks.map((t) => t.id);
    const allSelected = taskIds.length > 0 && taskIds.every((id) => selectedBatchTaskIds.includes(id));
    if (allSelected) {
      setSelectedBatchTaskIds((prev) => prev.filter((id) => !taskIds.includes(id)));
    } else {
      setSelectedBatchTaskIds((prev) => Array.from(new Set([...prev, ...taskIds])));
    }
  };

  const clearBatchTaskSelection = () => {
    setSelectedBatchTaskIds([]);
    setIsBulkCreatingNewBatch(false);
    setBulkNewBatchInput('');
  };

  const moveSelectedTasksToBatch = (rawTargetBatch: string) => {
    const targetBatch = rawTargetBatch.trim();
    if (!targetBatch || selectedBatchTaskIds.length === 0) return;

    if (!batchPriorityOrder.includes(targetBatch)) {
      const next = [...batchPriorityOrder, targetBatch];
      saveBatchOrder(next);
    }

    const updated = tasks.map((t) =>
      selectedBatchTaskIds.includes(t.id) ? { ...t, batch: targetBatch as BatchTag } : t
    );
    saveTasks(updated);
    setSelectedBatchTaskIds([]);
    setIsBulkCreatingNewBatch(false);
    setBulkNewBatchInput('');
  };

  const getSuggestedNextBatchName = () => {
    let candidateNum = batchPriorityOrder.length + 1;
    while (batchPriorityOrder.includes(`Batch ${candidateNum}`)) {
      candidateNum++;
    }
    return `Batch ${candidateNum}`;
  };

  const renderBulkMoveBar = () => {
    if (selectedBatchTaskIds.length === 0) return null;

    if (isBulkCreatingNewBatch) {
      return (
        <div className="flex items-center gap-1.5 bg-indigo-950/90 border border-indigo-500/80 px-2.5 py-0.5 rounded-md shadow animate-in fade-in ml-2">
          <span className="text-[10px] font-bold text-indigo-200 flex items-center gap-1">
            <Layers className="w-3 h-3 text-indigo-400" /> New Batch:
          </span>
          <input
            autoFocus
            placeholder={getSuggestedNextBatchName()}
            value={bulkNewBatchInput}
            onChange={(e) => setBulkNewBatchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const target = bulkNewBatchInput.trim() || getSuggestedNextBatchName();
                moveSelectedTasksToBatch(target);
              }
              if (e.key === 'Escape') {
                setIsBulkCreatingNewBatch(false);
              }
            }}
            className="bg-zinc-900 border border-indigo-400 rounded px-1.5 py-0.5 text-[9px] font-bold text-white w-24 outline-none"
          />
          <button
            onClick={() => {
              const target = bulkNewBatchInput.trim() || getSuggestedNextBatchName();
              moveSelectedTasksToBatch(target);
            }}
            className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold shadow flex items-center gap-0.5 transition"
            title="Create batch and move selected tasks into it"
          >
            <Check className="w-2.5 h-2.5" /> Move
          </button>
          <button
            onClick={() => setIsBulkCreatingNewBatch(false)}
            className="text-[9px] text-zinc-400 hover:text-white px-1 py-0.5 rounded hover:bg-white/10"
            title="Back to dropdown"
          >
            <X className="w-2.5 h-2.5" />
          </button>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-1.5 bg-indigo-950/90 border border-indigo-500/80 px-2.5 py-0.5 rounded-md shadow animate-in fade-in ml-2">
        <span className="text-[10px] font-bold text-indigo-200 flex items-center gap-1">
          <CheckSquare className="w-3 h-3 text-indigo-400" />
          <span className="bg-indigo-600 text-white px-1.5 py-0.2 rounded-full text-[9px] font-mono">
            {selectedBatchTaskIds.length}
          </span>
          selected
        </span>

        <span className="text-[9px] uppercase font-bold text-zinc-400 ml-1">Move to:</span>

        <select
          value={bulkTargetBatch || batchPriorityOrder[0] || 'Batch 1'}
          onChange={(e) => {
            if (e.target.value === '__create_new__') {
              setBulkNewBatchInput(getSuggestedNextBatchName());
              setIsBulkCreatingNewBatch(true);
            } else {
              setBulkTargetBatch(e.target.value);
            }
          }}
          style={getBatchTheme(bulkTargetBatch || batchPriorityOrder[0] || 'Batch 1', batchPriorityOrder).dropdownStyle}
          className="text-[9px] px-1.5 py-0.5 rounded font-bold border focus:outline-none cursor-pointer"
        >
          {batchPriorityOrder.map((b) => (
            <option
              key={b}
              value={b}
              style={{
                backgroundColor: getBatchTheme(b, batchPriorityOrder).dropdownStyle.backgroundColor,
                color: getBatchTheme(b, batchPriorityOrder).dropdownStyle.color,
              }}
            >
              {b}
            </option>
          ))}
          <option value="__create_new__" className="bg-indigo-950 text-indigo-200 font-bold">
            + Create New Batch...
          </option>
        </select>

        <button
          onClick={() => {
            setBulkNewBatchInput(getSuggestedNextBatchName());
            setIsBulkCreatingNewBatch(true);
          }}
          className="p-1 rounded hover:bg-white/20 text-indigo-300 hover:text-white transition"
          title="Create a new batch and move selected tasks"
        >
          <Plus className="w-2.5 h-2.5" />
        </button>

        <button
          onClick={() => moveSelectedTasksToBatch(bulkTargetBatch || batchPriorityOrder[0] || 'Batch 1')}
          className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold shadow flex items-center gap-0.5 transition"
          title="Move all selected tasks to the selected batch"
        >
          <ArrowRight className="w-2.5 h-2.5" /> Move
        </button>

        <button
          onClick={queueSelectedTasks}
          className="px-2.5 py-0.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold shadow flex items-center gap-1 transition"
          title="Add all selected tasks and their dependencies into the execution Queue DAG"
        >
          <Target className="w-3 h-3" /> Move to Queue
        </button>

        <button
          onClick={clearBatchTaskSelection}
          className="text-[9px] text-zinc-400 hover:text-white px-1 py-0.5 rounded hover:bg-white/10"
        >
          Cancel
        </button>
      </div>
    );
  };

  const handleDeleteBatch = (batchToDelete: string) => {
    if (batchPriorityOrder.length <= 1) return;
    const next = batchPriorityOrder.filter((b) => b !== batchToDelete);
    const fallback = next[0] || 'Batch 1';
    const updatedTasks = tasks.map((t) => ((t.batch || 'Batch 1') === batchToDelete ? { ...t, batch: fallback } : t));
    saveTasks(updatedTasks);
    saveBatchOrder(next);
  };

  const setTopBatchPriority = (batch: BatchTag) => {
    setBatchSequenceSortMode('custom');
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

  // Helper to sort ready tasks strictly in exact board priority order (Batch Priority Rank -> Card Position Order)
  const sortReadyTasksInBoardOrder = (taskList: Task[]): Task[] => {
    return [...taskList].sort((a, b) => {
      const bwA = getBatchWeight(a.batch);
      const bwB = getBatchWeight(b.batch);
      if (bwA !== bwB) return bwA - bwB;
      const ordA = typeof a.order === 'number' ? a.order : a.createdAt;
      const ordB = typeof b.order === 'number' ? b.order : b.createdAt;
      return ordA - ordB;
    });
  };

  // Master Action: "Start Parallel Work" - Activates parallel mode & automatically fills slots from Ready state
  const handleStartParallelWork = () => {
    setIsParallelModeActive(true);
    if (typeof window !== 'undefined') {
      localStorage.setItem(parallelModeKey, 'true');
    }

    let updated = [...tasks];

    parallelGroups.forEach((grp) => {
      // Find all ready/unblocked tasks belonging to this group
      const grpCandidates = updated.filter(
        (t) => t.isParallel && t.parallelGroup === grp.name && computedStatus(t) === 'ready'
      );
      // Sort strictly by Ready column priority order: Batch priority -> Card order
      const sortedCandidates = sortReadyTasksInBoardOrder(grpCandidates);

      // Take up to slotLimit
      const toStart = sortedCandidates.slice(0, grp.slotLimit);
      const toStartIds = toStart.map((t) => t.id);

      updated = updated.map((t) => {
        if (toStartIds.includes(t.id)) {
          return {
            ...t,
            manualStatus: 'progress' as const,
            startedAt: Date.now(),
          };
        }
        return t;
      });
    });

    saveTasks(updated);
  };

  // Master Action: "Stop Parallel Work" - Deactivates parallel mode and treats all tasks as a single in-progress list
  const handleStopParallelWork = () => {
    setIsParallelModeActive(false);
    if (typeof window !== 'undefined') {
      localStorage.setItem(parallelModeKey, 'false');
    }
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

  // Reorder task positions within the same batch, or move entire batch if at boundary of a root task
  const moveTaskWithinDagStage = (taskId: string, stageTasks: Task[], direction: 'up' | 'down', isRootStage: boolean = false) => {
    const currentTask = tasks.find((t) => t.id === taskId);
    if (!currentTask) return;

    const currentBatch = currentTask.batch || 'Batch 1';
    const batchTasks = stageTasks.filter((t) => (t.batch || 'Batch 1') === currentBatch);
    const batchIdx = batchTasks.findIndex((t) => t.id === taskId);
    if (batchIdx === -1) return;

    if (direction === 'up') {
      if (batchIdx > 0) {
        const targetTask = batchTasks[batchIdx - 1];
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
      } else if (isRootStage) {
        // Move entire batch UP in Stage 1!
        const stageBatches = Array.from(new Set(stageTasks.map((t) => t.batch || 'Batch 1')));
        const currentStageBatchIdx = stageBatches.indexOf(currentBatch);
        if (currentStageBatchIdx > 0) {
          const precedingBatch = stageBatches[currentStageBatchIdx - 1];
          const idx1 = batchPriorityOrder.indexOf(currentBatch);
          const idx2 = batchPriorityOrder.indexOf(precedingBatch);
          if (idx1 !== -1 && idx2 !== -1) {
            const nextOrder = [...batchPriorityOrder];
            nextOrder[idx1] = precedingBatch;
            nextOrder[idx2] = currentBatch;
            saveBatchOrder(nextOrder);
          }
          const reordered = swapBatchTaskPositions(tasks, currentBatch, precedingBatch);
          saveTasks(reordered);
        } else {
          shiftBatchPriority(currentBatch, 'left');
        }
      }
    } else {
      if (batchIdx < batchTasks.length - 1) {
        const targetTask = batchTasks[batchIdx + 1];
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
      } else if (isRootStage) {
        // Move entire batch DOWN in Stage 1!
        const stageBatches = Array.from(new Set(stageTasks.map((t) => t.batch || 'Batch 1')));
        const currentStageBatchIdx = stageBatches.indexOf(currentBatch);
        if (currentStageBatchIdx !== -1 && currentStageBatchIdx < stageBatches.length - 1) {
          const nextBatch = stageBatches[currentStageBatchIdx + 1];
          const idx1 = batchPriorityOrder.indexOf(currentBatch);
          const idx2 = batchPriorityOrder.indexOf(nextBatch);
          if (idx1 !== -1 && idx2 !== -1) {
            const nextOrder = [...batchPriorityOrder];
            nextOrder[idx1] = nextBatch;
            nextOrder[idx2] = currentBatch;
            saveBatchOrder(nextOrder);
          }
          const reordered = swapBatchTaskPositions(tasks, nextBatch, currentBatch);
          saveTasks(reordered);
        } else {
          shiftBatchPriority(currentBatch, 'right');
        }
      }
    }
  };

  // Reorder tasks within a parallel group in the Groups & Queues modal
  const moveTaskWithinGroup = (groupName: string, taskId: string, direction: 'up' | 'down') => {
    const grpTasks = tasks.filter((t) => t.isParallel && t.parallelGroup === groupName && computedStatus(t) !== 'done');
    const idx = grpTasks.findIndex((t) => t.id === taskId);
    if (idx === -1) return;

    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= grpTasks.length) return;

    const targetTask = grpTasks[targetIdx];
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

  // Toggle sub-task checkbox on a task card with iterative auto-turn rotation
  const toggleSubTask = (taskId: string, subId: string) => {
    const parentTask = tasks.find((t) => t.id === taskId);
    let justCompleted = false;

    const updated = tasks.map((t) => {
      if (t.id === taskId && t.subTasks) {
        const nextSubs = t.subTasks.map((s) => {
          if (s.id === subId) {
            const nextStatus = s.status === 'done' ? ('todo' as const) : ('done' as const);
            if (nextStatus === 'done') justCompleted = true;
            return { ...s, status: nextStatus };
          }
          return s;
        });
        return { ...t, subTasks: nextSubs };
      }
      return t;
    });

    // If a subtask in Study was completed, auto-rotate next focus to Development!
    if (justCompleted && parentTask?.parallelGroup === 'Study') {
      switchActiveTurn('Development');
    }

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

  const handleDropOnTask = (targetTaskId: string, targetBatch?: BatchTag) => {
    if (!draggedTaskId || draggedTaskId === targetTaskId) return;

    const idxA = tasks.findIndex((t) => t.id === draggedTaskId);
    const idxB = tasks.findIndex((t) => t.id === targetTaskId);
    if (idxA === -1 || idxB === -1) return;

    const targetTask = tasks[idxB];
    const newTasks = [...tasks];
    const [moved] = newTasks.splice(idxA, 1);

    // Update batch to target batch if moved across batches!
    moved.batch = targetBatch || targetTask.batch || 'Batch 1';
    newTasks.splice(idxB, 0, moved);

    newTasks.forEach((t, i) => {
      t.order = i;
    });

    saveTasks(newTasks);
    setDraggedTaskId(null);
  };

  const handleDropOnBatchColumn = (targetBatch: BatchTag) => {
    if (!draggedTaskId) return;
    const currentTask = tasks.find((t) => t.id === draggedTaskId);
    if (!currentTask || currentTask.batch === targetBatch) return;

    const updated = tasks.map((t) => (t.id === draggedTaskId ? { ...t, batch: targetBatch } : t));
    saveTasks(updated);
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

  // 1. Compute full unhidden DAG stage indices for all active tasks
  const activeUnfinishedTasks = useMemo(() => {
    const list = view === 'queue'
      ? filtered.filter((t) => typeof t.rank === 'number' && t.rank > 0)
      : filtered;
    return list.filter((t) => t.manualStatus !== 'done');
  }, [filtered, view]);

  const baseLevelsResult = useMemo(() => {
    const compareSource = createSourceOrderComparator(activeUnfinishedTasks);
    return alignDagLevels(
      activeUnfinishedTasks,
      (a, b) => getBatchWeight(a.batch) - getBatchWeight(b.batch) || compareSource(a, b)
    );
  }, [activeUnfinishedTasks, batchPriorityOrder]);

  const taskStageIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    baseLevelsResult.orderedLevels.forEach((levelNum: number, stageIndex: number) => {
      (baseLevelsResult.levels[levelNum] || []).forEach((t: Task) => {
        map.set(t.id, stageIndex);
      });
    });
    return map;
  }, [baseLevelsResult]);

  // 2. Collapse hidden stages & done tasks
  const visibleDagTasks = useMemo(() => {
    const sourceList = view === 'queue'
      ? filtered.filter((t) => typeof t.rank === 'number' && t.rank > 0)
      : filtered;

    const isHidden = (task: Task) => {
      if (task.manualStatus === 'done') return true;
      const sIdx = taskStageIndexMap.get(task.id);
      return sIdx !== undefined && hiddenStageIndices.includes(sIdx);
    };
    return collapseHiddenDagTasks(sourceList, isHidden);
  }, [filtered, view, taskStageIndexMap, hiddenStageIndices]);

  const toggleHideStage = (stageIdx: number) => {
    setHiddenStageIndices((prev) =>
      prev.includes(stageIdx) ? prev.filter((i) => i !== stageIdx) : [...prev, stageIdx]
    );
  };

  const unhideAllStages = () => {
    setHiddenStageIndices([]);
  };

  const rankedTasks = rankActiveTasks(filtered, (task) => task.manualStatus === 'done');

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

  // In Progress column is sorted strictly by Order (so existing active tasks stay on top, newly promoted tasks stay at the bottom)
  groups.progress.sort((a, b) => {
    const ordA = typeof a.order === 'number' ? a.order : a.createdAt;
    const ordB = typeof b.order === 'number' ? b.order : b.createdAt;
    return ordA - ordB;
  });

  // Ready, Blocked, Done columns sort by Batch Rank first, then Order within that batch
  (['blocked', 'ready', 'done'] as const).forEach((key) => {
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
    if (view !== 'dependency' || !stageRef.current || !visibleDagTasks.length) return;

    const timer = setTimeout(() => {
      const stage = stageRef.current;
      if (!stage) return;

      const stageRect = stage.getBoundingClientRect();
      const width = stage.scrollWidth;
      const height = stage.scrollHeight;
      const paths: string[] = [];

      visibleDagTasks.forEach((targetTask) => {
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
  }, [view, visibleDagTasks, ownerFilter, batchFilter, parallelGroupFilter, search, batchPriorityOrder, hiddenStageIndices, dagStageAlignMode]);

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

  // Helper to advance turn counter and auto-rotate focus if turn limit is reached
  const advanceTurnCounter = (groupName?: string, currentTasksList?: Task[]) => {
    if (!groupName) return;
    const currentGrp = parallelGroups.find((g) => g.name === groupName);
    const turnTarget = currentGrp?.slotLimit || 1;
    const nextCount = devTurnCompletedCount + 1;
    const remainingTasks = (currentTasksList || tasks).filter(
      (t) => t.isParallel && t.parallelGroup === groupName && computedStatus(t) !== 'done'
    ).length;

    if (nextCount >= turnTarget || remainingTasks === 0) {
      const allGroupNames = parallelGroups.map((g) => g.name);
      const currentIdx = allGroupNames.indexOf(groupName);
      if (currentIdx !== -1) {
        const nextGroupName = allGroupNames[(currentIdx + 1) % allGroupNames.length];
        switchActiveTurn(nextGroupName);
      }
      setDevTurnCompletedCount(0);
    } else {
      setDevTurnCompletedCount(nextCount);
    }
  };

  // Complete a task in progress, auto-refill open slots from queue, and auto-rotate turns
  const finishTask = (id: string) => {
    const target = tasks.find((t) => t.id === id);
    const sessionSeconds = target?.startedAt ? Math.floor((Date.now() - target.startedAt) / 1000) : 0;
    const total = (target?.totalTimeSpentSeconds || 0) + sessionSeconds;

    let updated = tasks.map((t) => {
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

    // Auto-Refill next task from this group's queue into active running slot
    if (target?.isParallel && target?.parallelGroup) {
      const grp = parallelGroups.find((g) => g.name === target.parallelGroup);
      const slotCap = grp?.slotLimit || 3;

      const currentRunningCount = updated.filter(
        (t) => t.isParallel && t.parallelGroup === target.parallelGroup && t.manualStatus === 'progress' && t.id !== id
      ).length;

      if (currentRunningCount < slotCap) {
        // Find all ready/unblocked tasks belonging to this group
        const readyCandidates = updated.filter(
          (t) => t.isParallel && t.parallelGroup === target.parallelGroup && computedStatus(t) === 'ready'
        );
        // Sort strictly by Ready column priority order: Batch priority -> Card order
        const sortedCandidates = sortReadyTasksInBoardOrder(readyCandidates);
        const nextInLine = sortedCandidates[0];

        if (nextInLine) {
          const maxOrder = Math.max(
            ...updated
              .filter((t) => t.isParallel && t.parallelGroup === target.parallelGroup && t.manualStatus === 'progress')
              .map((t) => (typeof t.order === 'number' ? t.order : t.createdAt)),
            Date.now()
          );
          updated = updated.map((t) =>
            t.id === nextInLine.id
              ? {
                  ...t,
                  manualStatus: 'progress' as const,
                  startedAt: Date.now(),
                  order: maxOrder + 1,
                }
              : t
          );
        }
      }

      advanceTurnCounter(target.parallelGroup, updated);
    }

    saveTasks(updated);
    setReviewingTaskId(null);
  };

  // Goal Task Option: Retry (moves task to last position, resets timer, and increments turn completion)
  const retryGoalTask = (id: string) => {
    const target = tasks.find((t) => t.id === id);
    if (!target) return;

    // Calculate maximum order among active in-progress tasks to put this task at the bottom (last)
    const maxOrder = Math.max(
      ...tasks
        .filter((t) => t.isParallel === target.isParallel && t.parallelGroup === target.parallelGroup && t.manualStatus === 'progress')
        .map((t) => (typeof t.order === 'number' ? t.order : t.createdAt)),
      Date.now()
    );

    const updated = tasks.map((t) =>
      t.id === id
        ? {
            ...t,
            manualStatus: 'progress' as const,
            startedAt: Date.now(),
            order: maxOrder + 1, // Moves from top to the very bottom / last position
          }
        : t
    );

    if (target.isParallel && target.parallelGroup) {
      advanceTurnCounter(target.parallelGroup, updated);
    }

    saveTasks(updated);
    setReviewingTaskId(null);
  };

  // Goal Task Option: Blocked (Attaches parent blocker, auto-refills slot, and increments turn completion)
  const handleConfirmGoalBlock = () => {
    if (!reviewingTaskId) return;

    const target = tasks.find((t) => t.id === reviewingTaskId);
    let finalParentId = blockParentId;
    let updatedTasks = [...tasks];

    // If user typed a new blocker parent name, create it on the fly with the selected status
    if (!finalParentId && blockNewParentName.trim()) {
      finalParentId = uid();
      const currentBlocked = tasks.find((t) => t.id === reviewingTaskId);
      const newParent: Task = {
        id: finalParentId,
        name: blockNewParentName.trim(),
        taskType: 'normal',
        owner: blockNewParentOwner,
        batch: currentBlocked?.batch || 'Batch 1',
        deadline: '',
        estimate: '',
        description: `Prerequisite blocker for ${currentBlocked?.name || 'task'}`,
        dependencies: [],
        manualStatus: blockParentStatus === 'progress' ? 'progress' : 'todo',
        startedAt: blockParentStatus === 'progress' ? Date.now() : null,
        createdAt: Date.now() - 100,
        order: 0,
        totalTimeSpentSeconds: 0,
      };
      updatedTasks = [newParent, ...updatedTasks];
    } else if (finalParentId) {
      // If an existing parent was selected, update its status according to user choice
      updatedTasks = updatedTasks.map((t) => {
        if (t.id === finalParentId) {
          return {
            ...t,
            manualStatus: blockParentStatus === 'progress' ? ('progress' as const) : ('todo' as const),
            startedAt: blockParentStatus === 'progress' && !t.startedAt ? Date.now() : t.startedAt,
          };
        }
        return t;
      });
    }

    // Attach parent blocker to the target task and set its status to todo (which automatically evaluates to blocked)
    updatedTasks = updatedTasks.map((t) => {
      if (t.id === reviewingTaskId) {
        const nextDeps = finalParentId ? Array.from(new Set([...(t.dependencies || []), finalParentId])) : t.dependencies;
        return {
          ...t,
          manualStatus: 'todo' as const,
          dependencies: nextDeps,
          startedAt: null,
        };
      }
      return t;
    });

    // When goal task becomes blocked, auto-refill open slot from ready queue
    if (target?.isParallel && target?.parallelGroup) {
      const grp = parallelGroups.find((g) => g.name === target.parallelGroup);
      const slotCap = grp?.slotLimit || 3;

      const currentRunningCount = updatedTasks.filter(
        (t) => t.isParallel && t.parallelGroup === target.parallelGroup && t.manualStatus === 'progress'
      ).length;

      if (currentRunningCount < slotCap) {
        const readyCandidates = updatedTasks.filter(
          (t) => t.isParallel && t.parallelGroup === target.parallelGroup && computedStatus(t) === 'ready'
        );
        const sortedCandidates = sortReadyTasksInBoardOrder(readyCandidates);
        const nextInLine = sortedCandidates[0];

        if (nextInLine) {
          const maxOrder = Math.max(
            ...updatedTasks
              .filter((t) => t.isParallel && t.parallelGroup === target.parallelGroup && t.manualStatus === 'progress')
              .map((t) => (typeof t.order === 'number' ? t.order : t.createdAt)),
            Date.now()
          );
          updatedTasks = updatedTasks.map((t) =>
            t.id === nextInLine.id
              ? {
                  ...t,
                  manualStatus: 'progress' as const,
                  startedAt: Date.now(),
                  order: maxOrder + 1,
                }
              : t
          );
        }
      }

      advanceTurnCounter(target.parallelGroup, updatedTasks);
    }

    saveTasks(updatedTasks);
    setReviewingTaskId(null);
    setIsBlockPickerOpen(false);
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

  const openTaskModal = (
    id: string | null = null,
    defaultState?: 'blocked' | 'ready' | 'progress' | 'done',
    initialParentIds?: string[],
    initialBatch?: BatchTag,
    insertion?: { taskId: string; position: 'before' | 'after' | 'top' | 'bottom' }
  ) => {
    setEditId(id);
    setDagInsert(insertion || null);
    const current = tasks.find((t) => t.id === id);
    setTaskName(current?.name || '');
    setTaskType(current?.taskType || 'normal');
    setTaskDescription(current?.description || current?.notes || '');
    setTaskOwner(current?.owner || 'Me');
    const defaultBatch = current?.batch || initialBatch || batchPriorityOrder[0] || 'Batch 1';
    setTaskBatch(defaultBatch === 'None' ? (batchPriorityOrder[0] || 'Batch 1') : defaultBatch);
    setTaskIsParallel(typeof current?.isParallel === 'boolean' ? current.isParallel : !!current?.parallelGroup);
    setTaskParallelGroup(current?.parallelGroup || (parallelGroups[0]?.name || 'Development'));
    setTaskSubTasks(current?.subTasks || []);
    setNewSubTaskInput('');
    setTaskDeadline(current?.deadline || '');
    setTaskEstimate(current?.estimate || '');

    setSelectedParents(current?.dependencies || initialParentIds || []);
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
      taskType: 'normal',
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
      taskType: 'normal',
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
      taskType: input.taskType || 'normal',
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
      [groupName]: { name: '', taskType: 'normal', owner: 'AI' },
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
      taskType,
      description: taskDescription.trim(),
      owner: taskOwner,
      batch: taskBatch && taskBatch !== 'None' ? taskBatch : (batchPriorityOrder[0] || 'Batch 1'),
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
      updatedTasks = dagInsert?.position === 'before'
        ? insertDagTaskBefore(baseList, dagInsert.taskId, newTask)
        : dagInsert?.position === 'after'
          ? addDagTaskAfter(baseList, dagInsert.taskId, newTask)
          : dagInsert?.position === 'top' || dagInsert?.position === 'bottom'
            ? addDagTaskSibling(baseList, dagInsert.taskId, newTask, dagInsert.position)
            : [...baseList, newTask];
    }

    // Bi-directionally synchronize child downstream tasks
    if (!dagInsert) updatedTasks = updatedTasks.map((t) => {
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

  // Topologically align DAG stages with permanent Batch Priority Sorting on roots
  const getAlignedLevels = () => {
    const compareSourceOrder = createSourceOrderComparator(visibleDagTasks);
    const compareTasks = (a: Task, b: Task): number => {
      return getBatchWeight(a.batch) - getBatchWeight(b.batch) || compareSourceOrder(a, b);
    };
    return alignDagLevels(visibleDagTasks, compareTasks, dagStageAlignMode);
  };

  const { levels, orderedLevels, lanes, laneCount } = getAlignedLevels();

  // Helper to partition In Progress items: Single unified list when parallel mode is OFF, or parallel group slots when ON
  const renderInProgressColumn = () => {
    const inProgressList = groups.progress;
    if (inProgressList.length === 0) {
      return <div className="py-8 text-center text-[10px] text-zinc-600 italic">Empty</div>;
    }

    // When Parallel Work is Stopped -> Render all active tasks as a single unified in-progress list
    if (!isParallelModeActive) {
      return (
        <div className="space-y-1.5">
          {inProgressList.map((t) => renderTaskCard(t, 'progress'))}
        </div>
      );
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

    // Order parallel groups so the active turn group appears at the top!
    const activeGroupNames = Object.keys(groupedMap).sort((a, b) => {
      if (a === activeTurnGroupName) return -1;
      if (b === activeTurnGroupName) return 1;
      return 0;
    });

    return (
      <div className="space-y-2">
        {/* Active Focus Switcher Ribbon */}
        {activeGroupNames.length > 1 && (
          <div className="p-1.5 rounded-lg bg-indigo-950/40 border border-indigo-500/50 flex items-center justify-between">
            <span className="text-[9px] font-bold uppercase text-indigo-300 flex items-center gap-1">
              <Zap className="w-3 h-3 text-amber-400" /> Focus: {activeTurnGroupName}
              <span className="text-[8px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 font-mono">
                ({devTurnCompletedCount}/
                {parallelGroups.find((g) => g.name === activeTurnGroupName)?.slotLimit || 1} completed this turn)
              </span>
            </span>
            <div className="flex items-center gap-1">
              {activeGroupNames.map((gn) => (
                <button
                  key={gn}
                  onClick={() => switchActiveTurn(gn)}
                  className={`px-1.5 py-0.2 rounded text-[9px] font-semibold transition ${
                    gn === activeTurnGroupName
                      ? 'bg-indigo-600 text-white shadow'
                      : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {gn}
                </button>
              ))}
            </div>
          </div>
        )}

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
          const isTopFocus = grpName === activeTurnGroupName;

          return (
            <div
              key={grpName}
              className={`p-1.5 rounded-lg border transition space-y-1.5 ${
                isTopFocus
                  ? 'border-indigo-500 bg-indigo-950/30 ring-1 ring-indigo-500/40 shadow-md'
                  : 'border-zinc-800/80 bg-zinc-900/40 opacity-85'
              }`}
            >
              <div className="flex items-center justify-between px-1 text-[10px] font-bold text-indigo-300">
                <span className="flex items-center gap-1">
                  <FolderKanban className="w-3 h-3 text-indigo-400" />
                  {grpName} [Slots: {activeSlots.length}/{cfg.slotLimit}]
                  {isTopFocus && (
                    <span className="ml-1 px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[8px]">
                      ACTIVE FOCUS
                    </span>
                  )}
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
                        {t.taskType === 'goal' && (
                          <span className="text-[8px] font-bold px-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-0.5">
                            <Target className="w-2 h-2" /> Goal
                          </span>
                        )}
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

  const renderDoneTaskRow = (t: Task) => {
    const durationDisplay = getTaskDurationDisplay(t);
    const batchTheme = getBatchTheme(t.batch, batchPriorityOrder);
    const completedSubsCount = (t.subTasks || []).filter((s) => s.status === 'done').length;
    const totalSubsCount = (t.subTasks || []).length;

    return (
      <div
        key={t.id}
        style={batchTheme.cardStyle}
        className="border-2 rounded-xl p-3.5 shadow-md flex items-center justify-between gap-3.5 select-none transition opacity-85 hover:opacity-100"
      >
        {/* Left: Checkmark & Info */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-400/50 text-emerald-300 flex-shrink-0">
            <Check className="w-4 h-4" />
          </div>

          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[9px] px-1.5 py-0.5 rounded font-bold bg-black/40 border border-white/20 text-zinc-100">
                {t.owner}
              </span>
              <span
                style={batchTheme.badgeStyle}
                className="text-[9px] font-bold px-1.5 py-0.5 rounded border shadow-sm"
              >
                {t.batch || 'Batch 1'}
              </span>
              <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded border bg-zinc-900/90 border-zinc-600 text-zinc-300">
                Done
              </span>
            </div>

            <div
              onClick={() => openTaskModal(t.id)}
              className="text-sm font-bold line-through opacity-80 cursor-pointer hover:underline truncate"
              style={{ color: batchTheme.cardStyle.color }}
            >
              {t.name}
            </div>

            {t.description && (
              <p
                style={batchTheme.descStyle}
                className="text-[11px] truncate leading-tight px-2 py-1 rounded border opacity-75"
              >
                {t.description}
              </p>
            )}

            {totalSubsCount > 0 && (
              <div className="text-[10px] text-emerald-400 font-mono font-bold flex items-center gap-1">
                <CheckSquare className="w-3 h-3" />
                {completedSubsCount}/{totalSubsCount} Subtasks Done
              </div>
            )}
          </div>
        </div>

        {/* Right: Duration & Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {durationDisplay && (
            <div className="flex items-center gap-1 font-mono px-2.5 py-1 rounded text-[10px] font-bold bg-zinc-800 text-zinc-300 border border-zinc-700">
              <Timer className="w-3 h-3 text-zinc-400" />
              <span>{durationDisplay}</span>
            </div>
          )}

          <button
            onClick={() => reopenTask(t.id)}
            className="px-3 py-1.5 rounded-lg bg-indigo-600/90 hover:bg-indigo-600 text-white text-xs font-bold shadow flex items-center gap-1 transition"
            title="Reopen task and move to active"
          >
            <RotateCcw className="w-3 h-3" /> Reopen
          </button>

          <button
            onClick={() => openTaskModal(t.id)}
            className="p-1.5 text-zinc-400 hover:text-white rounded hover:bg-black/30 transition"
            title="Edit Task"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => deleteTask(t.id)}
            className="p-1.5 text-zinc-500 hover:text-rose-400 rounded hover:bg-black/30 transition"
            title="Delete Task"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  };

  const renderRankedTaskRow = (t: Task) => {
    const status = computedStatus(t);
    const durationDisplay = getTaskDurationDisplay(t);
    const batchTheme = getBatchTheme(t.batch, batchPriorityOrder);
    const depNames = (t.dependencies || [])
      .map((id) => tasks.find((x) => x.id === id))
      .filter(Boolean) as Task[];
    const waiting = depNames.filter((d) => d.manualStatus !== 'done').map((d) => d.name);
    const completedSubsCount = (t.subTasks || []).filter((s) => s.status === 'done').length;
    const totalSubsCount = (t.subTasks || []).length;

    return (
      <div
        key={t.id}
        style={batchTheme.cardStyle}
        className="border-2 rounded-xl p-3.5 shadow-lg flex items-center justify-between gap-3.5 select-none transition"
      >
        {/* Left: Rank badge & clear */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="flex flex-col items-center justify-center flex-shrink-0">
            <label
              style={batchTheme.badgeStyle}
              className="flex items-center gap-0.5 rounded-lg border px-2 py-1 text-xs font-black shadow-md cursor-pointer"
              title="Execution Rank (Type to reorder)"
            >
              <span className="opacity-80 font-mono text-xs">#</span>
              <input
                type="number"
                min={1}
                max={rankedTasks.length}
                value={t.rank ?? ''}
                onChange={(e) =>
                  e.target.value === ''
                    ? removeTaskRank(t.id)
                    : changeTaskRank(t.id, Number(e.target.value))
                }
                className="w-8 bg-transparent text-center font-mono font-bold text-xs outline-none"
                style={{ color: batchTheme.cardStyle.color }}
                aria-label={`Rank ${t.name}`}
              />
            </label>
            <button
              onClick={() => removeTaskRank(t.id)}
              className="text-[9px] opacity-70 hover:opacity-100 hover:text-rose-300 mt-1 font-semibold"
              title="Remove from ranked queue"
            >
              clear
            </button>
          </div>

          {/* Center: Info */}
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[9px] px-1.5 py-0.5 rounded font-bold bg-black/40 border border-white/20 text-zinc-100">
                {t.owner}
              </span>
              <span
                style={batchTheme.badgeStyle}
                className="text-[9px] font-bold px-1.5 py-0.5 rounded border shadow-sm"
              >
                {t.batch || 'Batch 1'}
              </span>
              {t.taskType === 'goal' && (
                <span className="text-[8px] px-1.5 py-0.5 rounded font-bold bg-amber-500/30 text-amber-200 border border-amber-400/50 flex items-center gap-0.5">
                  <Target className="w-2.5 h-2.5" /> Goal
                </span>
              )}
              {t.isParallel && t.parallelGroup && (
                <span className="text-[8px] px-1.5 py-0.5 rounded bg-indigo-500/30 text-indigo-200 border border-indigo-400/40 flex items-center gap-0.5">
                  <Split className="w-2 h-2 text-indigo-300" /> {t.parallelGroup}
                </span>
              )}
              <span
                className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded border ${
                  status === 'ready'
                    ? 'bg-emerald-950/80 border-emerald-400 text-emerald-200'
                    : status === 'progress'
                    ? 'bg-blue-950/80 border-blue-400 text-blue-200 animate-pulse'
                    : status === 'done'
                    ? 'bg-zinc-900/80 border-zinc-600 text-zinc-300'
                    : 'bg-rose-950/80 border-rose-400 text-rose-200'
                }`}
              >
                {status}
              </span>
            </div>

            <div
              onClick={() => openTaskModal(t.id)}
              className="text-sm font-bold hover:underline cursor-pointer truncate"
              style={{ color: batchTheme.cardStyle.color }}
            >
              {t.name}
            </div>

            {t.description && (
              <p
                style={batchTheme.descStyle}
                className="text-[11px] truncate leading-tight px-2 py-1 rounded border shadow-inner"
              >
                {t.description}
              </p>
            )}

            {t.subTasks && t.subTasks.length > 0 && (
              <div className="flex items-center gap-2 text-[10px]">
                <span className="font-mono font-bold flex items-center gap-1 opacity-90">
                  <ListTodo className="w-3 h-3 text-indigo-300" />
                  {completedSubsCount}/{totalSubsCount} Subtasks
                </span>
              </div>
            )}

            {waiting.length > 0 && (
              <div className="text-[10px] text-rose-200 bg-rose-950/80 border border-rose-600/80 px-2 py-0.5 rounded truncate flex items-center gap-1 max-w-md">
                <Lock className="w-2.5 h-2.5 flex-shrink-0 text-rose-300" />
                <span className="truncate">Waiting for: {waiting.join(', ')}</span>
              </div>
            )}
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {durationDisplay && (
            <div className="flex items-center gap-1 font-mono px-2.5 py-1 rounded text-[10px] font-bold bg-blue-500/30 text-blue-100 border border-blue-400/60 shadow">
              <Timer className="w-3 h-3" />
              <span>{durationDisplay}</span>
            </div>
          )}

          {status === 'ready' && (
            <button
              onClick={() => startInProgress(t.id)}
              className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow flex items-center gap-1 transition"
            >
              <Play className="w-3 h-3 fill-current" /> Start
            </button>
          )}

          {status === 'progress' && t.taskType === 'goal' ? (
            <button
              onClick={() => {
                setReviewingTaskId(t.id);
                setIsBlockPickerOpen(false);
                setBlockParentId('');
                setBlockNewParentName('');
              }}
              className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold shadow flex items-center gap-1 transition"
            >
              <Eye className="w-3 h-3" /> Review
            </button>
          ) : status === 'progress' && t.taskType !== 'goal' ? (
            <button
              onClick={() => finishTask(t.id)}
              className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow flex items-center gap-1 transition"
            >
              <Check className="w-3 h-3" /> Done
            </button>
          ) : null}

          {status === 'done' && (
            <button
              onClick={() => reopenTask(t.id)}
              className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium shadow"
            >
              Reopen
            </button>
          )}

          <button
            onClick={() => openTaskModal(t.id)}
            className="p-1.5 text-zinc-300 hover:text-white rounded hover:bg-black/30 transition"
            title="Edit Task"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  };

  const renderTaskCard = (t: Task, colKey: 'blocked' | 'ready' | 'progress' | 'done') => {
    const depNames = (t.dependencies || [])
      .map((id) => tasks.find((x) => x.id === id))
      .filter(Boolean) as Task[];
    const waiting = depNames.filter((d) => d.manualStatus !== 'done').map((d) => d.name);
    const durationDisplay = getTaskDurationDisplay(t);
    const batchTheme = getBatchTheme(t.batch, batchPriorityOrder);

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
        style={batchTheme.cardStyle}
        className={`p-2.5 rounded-lg border-2 shadow space-y-1.5 select-none ${
          draggedTaskId === t.id ? 'opacity-60 ring-2 ring-indigo-500' : ''
        }`}
      >
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1">
            {colKey !== 'done' && (
              <label
                style={batchTheme.badgeStyle}
                className="flex items-center gap-0.5 rounded border px-1 py-0.5 text-[9px] font-black shadow-sm cursor-pointer"
                title="Execution rank"
              >
                #
                <input
                  type="number"
                  min={1}
                  max={rankedTasks.length + (t.rank ? 0 : 1)}
                  placeholder="—"
                  value={t.rank ?? ''}
                  onChange={(e) => e.target.value === '' ? removeTaskRank(t.id) : changeTaskRank(t.id, Number(e.target.value))}
                  className="w-7 bg-transparent text-center font-mono outline-none font-bold"
                  style={{ color: batchTheme.cardStyle.color }}
                  aria-label={`Rank ${t.name}`}
                />
              </label>
            )}
            <GripVertical className="w-3 h-3 text-zinc-400/60 cursor-grab active:cursor-grabbing" />
            <span className="text-[9px] px-1 rounded font-semibold bg-black/30 border border-white/10 text-zinc-200">
              {t.owner}
            </span>
            {t.taskType === 'goal' && (
              <span className="text-[8px] px-1 rounded font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-0.5">
                <Target className="w-2.5 h-2.5" /> Goal
              </span>
            )}
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
              value={t.batch || 'Batch 1'}
              onChange={(e) => handleBatchChange(t.id, e.target.value as BatchTag)}
              style={batchTheme.dropdownStyle}
              className="text-[9px] px-1.5 py-0.5 rounded font-bold cursor-pointer focus:outline-none border shadow-sm"
            >
              {batchPriorityOrder.map((b) => {
                const optTheme = getBatchTheme(b, batchPriorityOrder);
                return (
                  <option
                    key={b}
                    value={b}
                    style={{
                      backgroundColor: optTheme.dropdownStyle.backgroundColor,
                      color: optTheme.dropdownStyle.color,
                    }}
                  >
                    {b}
                  </option>
                );
              })}
            </select>
          </div>
        </div>

        <div
          className="text-xs font-bold leading-snug line-clamp-2 truncate"
          style={{ color: batchTheme.cardStyle.color }}
        >
          {t.name}
        </div>

        {t.description && (
          <p
            style={batchTheme.descStyle}
            className="text-[11px] line-clamp-2 leading-relaxed p-1.5 rounded border"
          >
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

          {/* Goal Task Review Action in In Progress */}
          {colKey === 'progress' && t.taskType === 'goal' ? (
            <button
              onClick={() => {
                setReviewingTaskId(t.id);
                setIsBlockPickerOpen(false);
                setBlockParentId('');
                setBlockNewParentName('');
              }}
              className="px-2 py-0.5 rounded bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-bold shadow flex items-center gap-1"
            >
              <Eye className="w-3 h-3" /> Review
            </button>
          ) : colKey === 'progress' && t.taskType !== 'goal' ? (
            <button
              onClick={() => finishTask(t.id)}
              className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-semibold shadow"
            >
              Done
            </button>
          ) : null}

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
          {colKey === 'done' && (
            <button
              onClick={() => deleteTask(t.id)}
              className="p-0.5 text-zinc-400 hover:text-rose-400"
              title="Delete"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    );
  };

  const reviewingTask = tasks.find((t) => t.id === reviewingTaskId);

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
              onClick={() => setView('queue')}
              className={`px-2 py-0.5 rounded text-[11px] font-semibold transition flex items-center gap-1 ${
                view === 'queue' ? 'bg-indigo-600 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="View focused DAG containing only your queued/selected tasks"
            >
              <Target className="w-3 h-3" /> Queue DAG
              {rankedTasks.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-black/40 text-[9px] font-mono">
                  {rankedTasks.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setView('dependency')}
              className={`px-2 py-0.5 rounded text-[11px] font-semibold transition flex items-center gap-1 ${
                view === 'dependency' ? 'bg-indigo-600 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="View the complete project DAG graph with all tasks"
            >
              <GitFork className="w-3 h-3" /> Full DAG
            </button>
            <button
              onClick={() => setView('ranked')}
              className={`px-2 py-0.5 rounded text-[11px] font-semibold transition flex items-center gap-1 ${
                view === 'ranked' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Linear execution list in ranked order"
            >
              <ListTodo className="w-3 h-3" /> Execution List
            </button>
            <button
              onClick={() => setView('batch')}
              className={`px-2 py-0.5 rounded text-[11px] font-semibold transition flex items-center gap-1 ${
                view === 'batch' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Columns grouped by batch"
            >
              <Boxes className="w-3 h-3" /> Batch View
            </button>
          </div>
        </div>

        {/* Compact, Zero-Overflow Batch Priority Strip with Sort Selector & + Add Batch */}
        <div className="flex-1 flex items-center justify-center min-w-0 px-2">
          <div className="flex items-center gap-1.5 bg-zinc-950 border border-zinc-800/90 px-2 py-0.5 rounded-lg overflow-x-auto scrollbar-none max-w-full">
            <div className="flex items-center gap-1 flex-shrink-0">
              <span className="text-[10px] font-bold uppercase text-zinc-500 flex items-center gap-1">
                <Layers className="w-3 h-3 text-indigo-400" /> Order:
              </span>
              <select
                value={batchSequenceSortMode}
                onChange={(e) => sortBatchSequence(e.target.value as BatchSequenceSortMode)}
                className="bg-zinc-900 border border-zinc-800 text-zinc-300 rounded px-1 py-0.2 text-[9px] font-bold focus:outline-none cursor-pointer"
                title="Sort Batch Priority Order"
              >
                <option value="custom">Custom</option>
                <option value="name-asc">B1 → B12 (A–Z)</option>
                <option value="name-desc">B12 → B1 (Z–A)</option>
                <option value="count-desc">Most Tasks</option>
              </select>
            </div>

            <div className="h-3 w-[1px] bg-zinc-800 flex-shrink-0" />

            {batchPriorityOrder.map((b, idx) => {
              const theme = getBatchTheme(b, batchPriorityOrder);
              const count = tasks.filter((t) => (t.batch || 'Batch 1') === b).length;
              return (
                <div
                  key={b}
                  style={theme.badgeStyle}
                  className="flex items-center gap-0.5 px-1.5 py-0.5 rounded border text-[10px] font-bold transition flex-shrink-0 shadow-sm"
                >
                  <button
                    onClick={() => setTopBatchPriority(b)}
                    title={`Set ${b} as #1 Priority`}
                    className="hover:underline flex items-center gap-0.5"
                  >
                    <span>{theme.short || b}</span>
                    <span className="text-[8px] opacity-80 font-mono">({count})</span>
                  </button>
                  <div className="flex items-center ml-0.5 opacity-70 hover:opacity-100">
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
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        createNextBatchAfter(b);
                      }}
                      className="p-0.2 hover:text-white hover:bg-white/20 rounded ml-0.5"
                      title={`Create next batch right next to ${b}`}
                      aria-label={`Create next batch right next to ${b}`}
                    >
                      <Plus className="w-2.5 h-2.5" />
                    </button>
                  </div>
                </div>
              );
            })}

            {isNewBatchInputOpen ? (
              <div className="flex items-center gap-1 bg-zinc-900 border border-indigo-500/60 rounded px-1 py-0.5 flex-shrink-0">
                <input
                  autoFocus
                  placeholder="Batch name (e.g. B13)"
                  value={newBatchNameInput}
                  onChange={(e) => setNewBatchNameInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddNewBatch(newBatchNameInput);
                    if (e.key === 'Escape') setIsNewBatchInputOpen(false);
                  }}
                  className="bg-transparent text-[10px] font-bold text-zinc-100 w-24 outline-none px-0.5"
                />
                <button
                  onClick={() => handleAddNewBatch(newBatchNameInput)}
                  className="text-emerald-400 hover:text-emerald-300 text-[10px]"
                  title="Add"
                >
                  <Check className="w-2.5 h-2.5" />
                </button>
                <button
                  onClick={() => setIsNewBatchInputOpen(false)}
                  className="text-zinc-500 hover:text-zinc-300 text-[10px]"
                  title="Cancel"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsNewBatchInputOpen(true)}
                className="flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-dashed border-zinc-700 hover:border-indigo-500 text-zinc-400 hover:text-indigo-300 text-[9px] font-bold transition flex-shrink-0"
                title="Create a new custom batch"
              >
                <Plus className="w-2.5 h-2.5" /> Batch
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span
            className={`rounded border px-1.5 py-0.5 text-[8px] font-bold uppercase ${
              syncStatus === 'saved'
                ? 'border-emerald-700/60 bg-emerald-950/60 text-emerald-300'
                : syncStatus === 'conflict'
                  ? 'border-rose-700/60 bg-rose-950/60 text-rose-300'
                  : 'border-amber-700/60 bg-amber-950/60 text-amber-300'
            }`}
            title={syncStatus === 'conflict' ? 'Local changes are preserved; another device changed the remote workspace.' : 'Convex database synchronization status'}
          >
            {syncStatus}
          </span>
          {/* Master Action: Start / Stop Parallel Work Toggle */}
          {isParallelModeActive ? (
            <button
              onClick={handleStopParallelWork}
              className="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold text-[10px] flex items-center gap-1 shadow transition"
              title="Stop Parallel Work and view all active tasks as a single in-progress list"
            >
              <X className="w-3 h-3" /> Stop Parallel Work
            </button>
          ) : (
            <button
              onClick={handleStartParallelWork}
              className="px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white font-bold text-[10px] flex items-center gap-1 shadow transition"
              title="Start Parallel Work (Groups, slots & turns)"
            >
              <Play className="w-3 h-3 fill-current" /> Start Parallel Work
            </button>
          )}

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

          {/* Batch Filter with dynamic configured Batches */}
          <select
            value={batchFilter}
            onChange={(e) => setBatchFilter(e.target.value)}
            style={batchFilter ? getBatchTheme(batchFilter, batchPriorityOrder).dropdownStyle : undefined}
            className="bg-zinc-900 border border-zinc-800 rounded px-1.5 py-0.5 text-[11px] text-zinc-300 focus:outline-none font-bold"
          >
            <option value="" className="bg-zinc-900 text-zinc-300">All Batches</option>
            {batchPriorityOrder.map((b) => {
              const optTheme = getBatchTheme(b, batchPriorityOrder);
              return (
                <option
                  key={b}
                  value={b}
                  style={{
                    backgroundColor: optTheme.dropdownStyle.backgroundColor,
                    color: optTheme.dropdownStyle.color,
                  }}
                >
                  {b}
                </option>
              );
            })}
          </select>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 p-2.5 overflow-hidden min-h-0">
        {view === 'ranked' ? (
          <div className="mx-auto flex h-full w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-950/60 shadow-xl">
            <div className="flex flex-shrink-0 items-center justify-between border-b border-zinc-800/80 bg-zinc-900/80 px-4 py-3">
              <div>
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <ListTodo className="w-4 h-4 text-indigo-400" /> Ranked Tasks Execution Queue
                </h2>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Complete tasks sequentially from #1 downward. Type any number into the # badge to reorder.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {/* Active vs Done Tab Switcher */}
                <div className="flex items-center bg-zinc-950 border border-zinc-800 p-0.5 rounded-lg">
                  <button
                    onClick={() => setRankedViewTab('active')}
                    className={`px-2.5 py-1 rounded-md text-xs font-bold transition flex items-center gap-1.5 ${
                      rankedViewTab === 'active'
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <span>Active Queue</span>
                    <span className="px-1.5 py-0.2 rounded-full bg-black/40 text-[10px] font-mono">
                      {rankedTasks.length}
                    </span>
                  </button>
                  <button
                    onClick={() => setRankedViewTab('done')}
                    className={`px-2.5 py-1 rounded-md text-xs font-bold transition flex items-center gap-1.5 ${
                      rankedViewTab === 'done'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Done</span>
                    <span className="px-1.5 py-0.2 rounded-full bg-black/40 text-[10px] font-mono">
                      {groups.done.length}
                    </span>
                  </button>
                </div>

                <button
                  onClick={() => openTaskModal()}
                  className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 font-semibold text-white text-xs shadow flex items-center gap-1 transition"
                >
                  <Plus className="w-3.5 h-3.5" /> New Task
                </button>
              </div>
            </div>
            <div className="flex-1 space-y-2.5 overflow-y-auto p-3">
              {rankedViewTab === 'active' ? (
                rankedTasks.length === 0 ? (
                  <div className="py-24 text-center space-y-2">
                    <div className="text-2xl">📋</div>
                    <div className="text-sm font-bold text-zinc-300">No ranked tasks</div>
                    <div className="text-xs text-zinc-500 max-w-sm mx-auto">
                      Go to the DAG Graph and type a rank number (e.g. #1, #2) on any task card to add it to your execution queue.
                    </div>
                  </div>
                ) : (
                  rankedTasks.map((task) => renderRankedTaskRow(task))
                )
              ) : (
                groups.done.length === 0 ? (
                  <div className="py-24 text-center space-y-2">
                    <div className="text-2xl">🎉</div>
                    <div className="text-sm font-bold text-zinc-300">No completed tasks yet</div>
                    <div className="text-xs text-zinc-500 max-w-sm mx-auto">
                      Complete tasks from your active queue and they will be archived here.
                    </div>
                  </div>
                ) : (
                  groups.done.map((task) => renderDoneTaskRow(task))
                )
              )}
            </div>
          </div>
        ) : view === 'queue' || view === 'dependency' ? (
          /* DAG View (Queue DAG or Full DAG) */
          <div className="h-full w-full bg-zinc-900/40 border border-zinc-800/80 rounded-lg p-3 overflow-auto relative">
            {view === 'queue' && rankedTasks.length === 0 ? (
              <div className="py-24 text-center space-y-3">
                <div className="text-3xl">🎯</div>
                <div className="text-sm font-bold text-zinc-200">Your Queue DAG is empty</div>
                <div className="text-xs text-zinc-400 max-w-sm mx-auto">
                  Go to <strong className="text-indigo-400">Full DAG</strong>, select the tasks you want to do (dependencies are auto-selected), and click <strong className="text-indigo-400">Move to Queue</strong>.
                </div>
                <button
                  onClick={() => setView('dependency')}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 font-semibold text-white text-xs shadow inline-flex items-center gap-1 transition"
                >
                  <GitFork className="w-3.5 h-3.5" /> Go to Full DAG
                </button>
              </div>
            ) : (
              <div className="relative min-w-max pb-6 pl-7" ref={stageRef}>
              <div className="sticky left-0 z-30 mb-3 flex w-fit items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-950/95 px-2.5 py-1.5 shadow-lg">
                <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-400 flex items-center gap-1">
                  <Layers className="h-3.5 w-3.5 text-indigo-400" /> Stages 2+:
                </span>

                <div className="flex items-center rounded border border-zinc-800 bg-zinc-900/90 p-0.5 shadow-inner">
                  <button
                    onClick={() => setDagStageAlignMode('parent')}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold transition flex items-center gap-1 ${
                      dagStageAlignMode === 'parent'
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                    title="Child tasks horizontally align with their parent rows"
                  >
                    <Link2 className="w-3 h-3" />
                    <span>Parent Align</span>
                  </button>
                  <button
                    onClick={() => setDagStageAlignMode('batch')}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold transition flex items-center gap-1 ${
                      dagStageAlignMode === 'batch'
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                    title="Every stage groups tasks strictly by batch priority order"
                  >
                    <Boxes className="w-3 h-3" />
                    <span>Batch Grouped</span>
                  </button>
                </div>

                {view === 'queue' && rankedTasks.length > 0 && (
                  <button
                    onClick={() => {
                      if (window.confirm('Clear all tasks from the execution Queue?')) {
                        clearExecutionQueue();
                      }
                    }}
                    className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-rose-900/60 hover:text-rose-200 border border-zinc-700 hover:border-rose-700/60 text-zinc-400 text-[10px] font-bold flex items-center gap-1 shadow transition"
                    title="Clear all tasks from the execution Queue DAG"
                  >
                    <Trash2 className="w-2.5 h-2.5" />
                    <span>Clear Queue ({rankedTasks.length})</span>
                  </button>
                )}

                {hiddenStageIndices.length > 0 && (
                  <button
                    onClick={unhideAllStages}
                    className="px-2 py-0.5 rounded bg-indigo-950/90 border border-indigo-500/60 hover:bg-indigo-900 text-indigo-200 text-[10px] font-bold flex items-center gap-1 shadow transition"
                    title="Restore and unhide all hidden stages"
                  >
                    <Eye className="w-3 h-3" />
                    <span>Unhide {hiddenStageIndices.length} {hiddenStageIndices.length === 1 ? 'stage' : 'stages'}</span>
                  </button>
                )}

                {renderBulkMoveBar()}
              </div>

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

              <div
                className="grid auto-cols-[200px] grid-flow-col gap-x-10 gap-y-3 items-start relative z-20 pt-1"
                style={{ gridTemplateRows: `auto repeat(${Math.max(laneCount, 1)}, 100px)` }}
              >
                {orderedLevels.map((level, index) => {
                  const stageTasks = levels[level] || [];
                  return (
                    <div
                      key={level}
                      className="grid gap-y-3 items-start"
                      style={{
                        gridColumn: index + 1,
                        gridRow: `1 / span ${Math.max(laneCount, 1) + 1}`,
                        gridTemplateRows: `auto repeat(${Math.max(laneCount, 1)}, 100px)`,
                      }}
                    >
                      {/* Stage Header with Stage name, task count, Hide Stage button & + Add Task button */}
                      <div className="h-8 flex items-center justify-between bg-zinc-900/90 border border-zinc-800 rounded-md px-2 shadow-sm" style={{ gridRow: 1 }}>
                        <div className="flex items-center gap-1 min-w-0">
                          <span className="text-[9px] font-mono uppercase font-bold text-zinc-300 tracking-wider truncate">
                            {index === 0 ? 'Root Available' : `Stage ${index + 1}`}
                          </span>
                          <span className="text-[8px] font-mono px-1.5 py-0.2 rounded-full bg-zinc-800 text-zinc-400 flex-shrink-0">
                            {stageTasks.length}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {stageTasks.length > 0 && (
                            <button
                              onClick={() => {
                                const sampleTask = stageTasks[0];
                                const originalStageIdx = sampleTask ? taskStageIndexMap.get(sampleTask.id) ?? index : index;
                                toggleHideStage(originalStageIdx);
                              }}
                              className="p-1 rounded text-zinc-400 hover:text-white hover:bg-white/10 transition"
                              title="Hide this stage (collapses tasks and shifts child tasks left to parent/root)"
                            >
                              <EyeOff className="w-2.5 h-2.5" />
                            </button>
                          )}
                          <button
                            onClick={() => openTaskModal(null, index === 0 ? 'ready' : 'blocked', undefined, batchPriorityOrder[0] || 'Batch 1')}
                            className="flex items-center gap-0.5 text-[8px] px-1.5 py-0.2 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 font-semibold transition-colors"
                            title={`Add new task to ${index === 0 ? 'Root' : `Stage ${index + 1}`}`}
                          >
                            <Plus className="w-2 h-2" /> Add
                          </button>
                        </div>
                      </div>

                      {stageTasks.map((t) => {
                        const status = computedStatus(t);
                        const durationDisplay = getTaskDurationDisplay(t);
                        const batchTheme = getBatchTheme(t.batch, batchPriorityOrder);

                        const batchSiblings = stageTasks.filter((x) => (x.batch || 'Batch 1') === (t.batch || 'Batch 1'));
                        const posInBatch = batchSiblings.findIndex((x) => x.id === t.id);
                        const isFirstInBatch = posInBatch === 0;
                        const isLastInBatch = posInBatch === batchSiblings.length - 1;

                        const isRootStage = index === 0;
                        const currentBatchIdx = batchPriorityOrder.indexOf(t.batch || 'Batch 1');
                        const stageBatches = Array.from(new Set(stageTasks.map((x) => x.batch || 'Batch 1')));
                        const stageBatchIdx = stageBatches.indexOf(t.batch || 'Batch 1');

                        const canMoveUp = posInBatch > 0 || (isRootStage && (stageBatchIdx > 0 || currentBatchIdx > 0));
                        const canMoveDown = posInBatch < batchSiblings.length - 1 || (isRootStage && (stageBatchIdx < stageBatches.length - 1 || (currentBatchIdx !== -1 && currentBatchIdx < batchPriorityOrder.length - 1)));

                        const depNames = (t.dependencies || [])
                          .map((id) => tasks.find((x) => x.id === id))
                          .filter(Boolean) as Task[];
                        const waiting = depNames.filter((d) => d.manualStatus !== 'done').map((d) => d.name);

                        const completedSubsCount = (t.subTasks || []).filter((s) => s.status === 'done').length;
                        const totalSubsCount = (t.subTasks || []).length;
                        const isSelected = selectedBatchTaskIds.includes(t.id);

                        return (
                          <div
                            key={t.id}
                            data-node-id={t.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, t.id)}
                            onDragOver={handleDragOver}
                            onDrop={() => handleDropOnTask(t.id)}
                            style={{
                              ...batchTheme.cardStyle,
                              gridRow: (lanes.get(t.id) ?? 0) + 2,
                            }}
                            className={`group relative overflow-visible w-[200px] h-[100px] p-2 rounded-lg border-2 shadow flex flex-col justify-between transition-all select-none ${
                              isSelected ? 'ring-2 ring-indigo-500 bg-indigo-950/40' : ''
                            } ${
                              draggedTaskId === t.id ? 'opacity-60 ring-2 ring-indigo-500' : ''
                            }`}
                          >
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openTaskModal(null, (t.dependencies || []).length > 0 ? 'blocked' : 'ready', t.dependencies, t.batch, { taskId: t.id, position: 'top' });
                              }}
                              className="absolute -top-2.5 left-1/2 z-30 flex h-4 w-4 -translate-x-1/2 items-center justify-center rounded-full border border-indigo-400 bg-zinc-900 text-indigo-200 opacity-0 shadow-md transition hover:scale-110 hover:bg-indigo-600 hover:text-white focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-indigo-400 group-hover:opacity-100"
                              title={`Add parallel task above ${t.name} (same stage)`}
                              aria-label={`Add parallel task above ${t.name}`}
                            >
                              <Plus className="h-2.5 w-2.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openTaskModal(null, (t.dependencies || []).length > 0 ? 'blocked' : 'ready', t.dependencies, t.batch, { taskId: t.id, position: 'bottom' });
                              }}
                              className="absolute -bottom-2.5 left-1/2 z-30 flex h-4 w-4 -translate-x-1/2 items-center justify-center rounded-full border border-indigo-400 bg-zinc-900 text-indigo-200 opacity-0 shadow-md transition hover:scale-110 hover:bg-indigo-600 hover:text-white focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-indigo-400 group-hover:opacity-100"
                              title={`Add parallel task below ${t.name} (same stage)`}
                              aria-label={`Add parallel task below ${t.name}`}
                            >
                              <Plus className="h-2.5 w-2.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openTaskModal(null, 'blocked', undefined, t.batch, { taskId: t.id, position: 'before' });
                              }}
                              className="absolute -left-4 top-1/2 z-30 flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded-full border border-indigo-400 bg-zinc-900 text-indigo-200 opacity-0 shadow-md transition hover:scale-110 hover:bg-indigo-600 hover:text-white focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-indigo-400 group-hover:opacity-100"
                              title={`Insert a task before ${t.name}`}
                              aria-label={`Insert a task before ${t.name}`}
                            >
                              <Plus className="h-2.5 w-2.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openTaskModal(null, 'blocked', [t.id], t.batch, { taskId: t.id, position: 'after' });
                              }}
                              className="absolute -right-4 top-1/2 z-30 flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded-full border border-indigo-400 bg-zinc-900 text-indigo-200 opacity-0 shadow-md transition hover:scale-110 hover:bg-indigo-600 hover:text-white focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-indigo-400 group-hover:opacity-100"
                              title={`Add a parallel-capable task after ${t.name}`}
                              aria-label={`Add a task after ${t.name}`}
                            >
                              <Plus className="h-2.5 w-2.5" />
                            </button>

                            {/* Card Top Row */}
                            <div className="flex items-center justify-between gap-1 flex-shrink-0">
                              <div className="flex items-center gap-1 min-w-0">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    toggleSelectDagTask(t.id);
                                  }}
                                  className="w-3 h-3 rounded accent-indigo-600 cursor-pointer flex-shrink-0"
                                  title="Select task (auto-selects parent dependencies)"
                                />
                                <label
                                  style={batchTheme.badgeStyle}
                                  className="flex flex-shrink-0 items-center gap-0.5 rounded border px-1 py-0.2 text-[8px] font-black shadow-sm cursor-pointer"
                                  title="Execution rank"
                                >
                                  #
                                  <input
                                    type="number"
                                    min={1}
                                    max={rankedTasks.length + (t.rank ? 0 : 1)}
                                    placeholder="—"
                                    value={t.rank ?? ''}
                                    onChange={(e) => e.target.value === '' ? removeTaskRank(t.id) : changeTaskRank(t.id, Number(e.target.value))}
                                    className="w-5 bg-transparent text-center font-mono outline-none font-bold text-[9px]"
                                    style={{ color: batchTheme.cardStyle.color }}
                                    aria-label={`Rank ${t.name}`}
                                  />
                                </label>
                                <span className="text-[8px] px-1 rounded font-bold bg-black/30 border border-white/10 text-zinc-200 flex-shrink-0">
                                  {t.owner}
                                </span>
                              </div>

                              <div className="flex items-center gap-1 flex-shrink-0">
                                <div className="flex items-center gap-0.5">
                                  <button
                                    disabled={!canMoveUp}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      moveTaskWithinDagStage(t.id, stageTasks, 'up', isRootStage);
                                    }}
                                    className="p-0.5 rounded text-zinc-300 hover:text-white hover:bg-white/10 disabled:opacity-20 transition"
                                    title={isFirstInBatch && isRootStage ? "Move entire batch UP" : "Move task UP"}
                                  >
                                    <ArrowUp className="w-2.5 h-2.5" />
                                  </button>
                                  <button
                                    disabled={!canMoveDown}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      moveTaskWithinDagStage(t.id, stageTasks, 'down', isRootStage);
                                    }}
                                    className="p-0.5 rounded text-zinc-300 hover:text-white hover:bg-white/10 disabled:opacity-20 transition"
                                    title={isLastInBatch && isRootStage ? "Move entire batch DOWN" : "Move task DOWN"}
                                  >
                                    <ArrowDown className="w-2.5 h-2.5" />
                                  </button>
                                </div>

                                <select
                                  value={t.batch || 'Batch 1'}
                                  onChange={(e) => handleBatchChange(t.id, e.target.value as BatchTag)}
                                  style={batchTheme.dropdownStyle}
                                  className="text-[8px] px-1 py-0.2 rounded font-bold cursor-pointer focus:outline-none border shadow-sm"
                                >
                                  {batchPriorityOrder.map((b) => (
                                    <option
                                      key={b}
                                      value={b}
                                      style={{
                                        backgroundColor: getBatchTheme(b, batchPriorityOrder).dropdownStyle.backgroundColor,
                                        color: getBatchTheme(b, batchPriorityOrder).dropdownStyle.color,
                                      }}
                                    >
                                      {getBatchTheme(b, batchPriorityOrder).short || b}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            {/* Card Middle: Title & Description/Subtask */}
                            <div className="flex-1 flex flex-col justify-center min-h-0 space-y-0.5 my-0.5">
                              <div
                                onClick={() => openTaskModal(t.id)}
                                className="text-[11px] font-bold leading-tight line-clamp-1 truncate cursor-pointer hover:underline"
                                style={{ color: batchTheme.cardStyle.color }}
                                title="Click to edit task"
                              >
                                {t.name}
                              </div>

                              {t.description ? (
                                <p
                                  style={batchTheme.descStyle}
                                  className="text-[9px] truncate leading-none px-1 py-0.5 rounded border"
                                >
                                  {t.description.replace(/^Key objectives:\s*•?\s*/i, '')}
                                </p>
                              ) : null}
                            </div>

                            {/* Bottom row */}
                            <div className="flex items-center justify-between text-[9px] pt-0.5 border-t border-white/10 flex-shrink-0">
                              <div className="flex items-center gap-1">
                                <span className="font-bold uppercase text-[7px] px-1 py-0.2 rounded border bg-black/40 border-white/20">
                                  {status}
                                </span>
                                {durationDisplay ? (
                                  <span className="font-mono text-[8px] font-bold text-blue-300">
                                    {durationDisplay}
                                  </span>
                                ) : null}
                              </div>

                              <div className="flex items-center gap-0.5">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openTaskModal(null, 'blocked', [t.id], t.batch);
                                  }}
                                  className="px-1 py-0.2 rounded bg-black/40 border border-white/20 hover:bg-black/60 text-[8px] font-bold flex items-center gap-0.5 shadow"
                                  title="Plan & add child task depending on this"
                                >
                                  <Plus className="w-2 h-2" /> Step
                                </button>

                                {status === 'ready' && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      startInProgress(t.id);
                                    }}
                                    className="px-1.5 py-0.2 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[8px] font-bold shadow"
                                  >
                                    Start
                                  </button>
                                )}

                                {status === 'progress' && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (t.taskType === 'goal') {
                                        setReviewingTaskId(t.id);
                                        setIsBlockPickerOpen(false);
                                      } else {
                                        finishTask(t.id);
                                      }
                                    }}
                                    className="px-1.5 py-0.2 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[8px] font-bold shadow"
                                  >
                                    Done
                                  </button>
                                )}

                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openTaskModal(t.id);
                                  }}
                                  className="p-0.5 text-zinc-300 hover:text-white"
                                  title="Edit"
                                >
                                  <Pencil className="w-2.5 h-2.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
            )}
          </div>
        ) : (
          /* Batch Task View (Grouped/Sorted by Batch Priority, Not Tree Structure) */
          <div className="h-full w-full bg-zinc-900/40 border border-zinc-800/80 rounded-lg p-2.5 flex flex-col min-h-0 overflow-hidden select-none">
            {/* Batch View Sub-header with batch sequence sorting, quick jump, task sorting, and bulk move toolbar */}
            <div className="mb-2 flex items-center justify-between gap-2 flex-shrink-0 bg-zinc-950/80 border border-zinc-800/90 rounded-lg px-2.5 py-1.5 shadow-sm">
              <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
                <span className="text-[10px] font-bold uppercase text-zinc-500 flex items-center gap-1 mr-1 flex-shrink-0">
                  <Boxes className="w-3 h-3 text-indigo-400" /> Batches:
                </span>

                <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded px-1.5 py-0.5 flex-shrink-0 mr-1">
                  <label htmlFor="batch-sequence-sort" className="text-[9px] font-bold uppercase text-zinc-400">
                    Sort Batches:
                  </label>
                  <select
                    id="batch-sequence-sort"
                    value={batchSequenceSortMode}
                    onChange={(e) => sortBatchSequence(e.target.value as BatchSequenceSortMode)}
                    className="bg-transparent text-[10px] font-bold text-indigo-300 focus:outline-none cursor-pointer"
                  >
                    <option value="custom" className="bg-zinc-900 text-zinc-200">Custom Order</option>
                    <option value="name-asc" className="bg-zinc-900 text-zinc-200">B1 → B12 (A–Z)</option>
                    <option value="name-desc" className="bg-zinc-900 text-zinc-200">B12 → B1 (Z–A)</option>
                    <option value="count-desc" className="bg-zinc-900 text-zinc-200">Most Tasks First</option>
                  </select>
                </div>

                {batchPriorityOrder.map((bTag) => {
                  const count = filtered.filter((t) => (t.batch || 'Batch 1') === bTag).length;
                  const theme = getBatchTheme(bTag, batchPriorityOrder);
                  return (
                    <div
                      key={bTag}
                      style={theme.badgeStyle}
                      className="flex items-center gap-0.5 px-1.5 py-0.5 rounded border text-[9px] font-mono font-bold transition flex-shrink-0 shadow-sm"
                    >
                      <button
                        onClick={() => {
                          const col = document.getElementById(`batch-col-${bTag}`);
                          col?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
                        }}
                        className="hover:underline flex items-center gap-1"
                        title={`Jump to ${bTag}`}
                      >
                        <span>{theme.short || bTag}</span>
                        <span className="px-1 py-0.2 rounded-full bg-black/40 text-[8px]">{count}</span>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          createNextBatchAfter(bTag);
                        }}
                        className="p-0.2 hover:text-white hover:bg-white/20 rounded ml-0.5"
                        title={`Create next batch right next to ${bTag}`}
                        aria-label={`Create next batch right next to ${bTag}`}
                      >
                        <Plus className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  );
                })}

                {isNewBatchInputOpen ? (
                  <div className="flex items-center gap-1 bg-zinc-900 border border-indigo-500/60 rounded px-1.5 py-0.5 flex-shrink-0">
                    <input
                      autoFocus
                      placeholder="e.g. B13"
                      value={newBatchNameInput}
                      onChange={(e) => setNewBatchNameInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleAddNewBatch(newBatchNameInput);
                        if (e.key === 'Escape') setIsNewBatchInputOpen(false);
                      }}
                      className="bg-transparent text-[10px] font-bold text-zinc-100 w-20 outline-none px-0.5"
                    />
                    <button
                      onClick={() => handleAddNewBatch(newBatchNameInput)}
                      className="text-emerald-400 hover:text-emerald-300 text-[10px]"
                      title="Add Batch"
                    >
                      <Check className="w-2.5 h-2.5" />
                    </button>
                    <button
                      onClick={() => setIsNewBatchInputOpen(false)}
                      className="text-zinc-500 hover:text-zinc-300 text-[10px]"
                      title="Cancel"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setIsNewBatchInputOpen(true)}
                    className="flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-dashed border-zinc-700 hover:border-indigo-500 text-zinc-400 hover:text-indigo-300 text-[9px] font-bold transition flex-shrink-0"
                    title="Create a new custom batch"
                  >
                    <Plus className="w-2.5 h-2.5" /> Batch
                  </button>
                )}
              </div>

              {/* Right tools or Bulk Move Toolbar */}
              <div className="flex items-center gap-2 flex-shrink-0">
                {renderBulkMoveBar()}

                <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded px-1.5 py-0.5">
                  <label htmlFor="batch-sort" className="text-[9px] font-bold uppercase text-zinc-400 flex items-center gap-0.5">
                    <ArrowUpDown className="w-2.5 h-2.5 text-indigo-400" /> Sort Tasks:
                  </label>
                  <select
                    id="batch-sort"
                    value={batchSortMode}
                    onChange={(e) => setBatchSortMode(e.target.value as BatchSortMode)}
                    className="bg-transparent text-[10px] font-semibold text-zinc-200 focus:outline-none cursor-pointer"
                  >
                    <option value="manual" className="bg-zinc-900 text-zinc-200">Manual Order</option>
                    <option value="name" className="bg-zinc-900 text-zinc-200">Task Name (A–Z)</option>
                    <option value="owner" className="bg-zinc-900 text-zinc-200">Owner (A–Z)</option>
                    <option value="status" className="bg-zinc-900 text-zinc-200">Status (Ready → Done)</option>
                    <option value="created" className="bg-zinc-900 text-zinc-200">Newest Created</option>
                  </select>
                </div>

                <button
                  onClick={() => setShowEmptyBatches(!showEmptyBatches)}
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded border transition flex items-center gap-1 ${
                    showEmptyBatches
                      ? 'bg-indigo-950/80 border-indigo-500/60 text-indigo-200'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                  }`}
                  title="Toggle displaying batches with 0 tasks"
                >
                  <Filter className="w-2.5 h-2.5" />
                  <span>{showEmptyBatches ? 'Hide empty' : 'Show all'}</span>
                </button>
              </div>
            </div>

            {/* Batch Columns */}
            <div
              ref={batchContainerRef}
              onWheel={(e) => {
                if (batchContainerRef.current) {
                  if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
                    const target = e.target as HTMLElement | null;
                    const scrollableChild = target?.closest('.overflow-y-auto');
                    if (scrollableChild) {
                      const canScrollUp = scrollableChild.scrollTop > 0 && e.deltaY < 0;
                      const canScrollDown = scrollableChild.scrollTop + scrollableChild.clientHeight < scrollableChild.scrollHeight - 1 && e.deltaY > 0;
                      if (canScrollUp || canScrollDown) {
                        return; // allow inner task list to scroll vertically when needed
                      }
                    }
                    batchContainerRef.current.scrollLeft += e.deltaY;
                  }
                }
              }}
              className="flex-1 flex gap-2.5 overflow-x-auto min-h-0 pb-2"
            >
              {batchPriorityOrder
                .filter((bTag) => {
                  if (showEmptyBatches) return true;
                  const count = filtered.filter((t) => (t.batch || 'Batch 1') === bTag).length;
                  return count > 0;
                })
                .map((batchTag) => {
                  const batchTasks = filtered.filter((t) => (t.batch || 'Batch 1') === batchTag);
                  const theme = getBatchTheme(batchTag, batchPriorityOrder);

                  // Sort batch tasks according to batchSortMode
                  batchTasks.sort((a, b) => {
                    const ordA = typeof a.order === 'number' ? a.order : a.createdAt;
                    const ordB = typeof b.order === 'number' ? b.order : b.createdAt;
                    switch (batchSortMode) {
                      case 'name':
                        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || ordA - ordB;
                      case 'owner':
                        return a.owner.localeCompare(b.owner) || ordA - ordB;
                      case 'status': {
                        const statusWeight = (st: string) => ({ ready: 0, progress: 1, blocked: 2, done: 3 }[st] ?? 9);
                        return statusWeight(computedStatus(a)) - statusWeight(computedStatus(b)) || ordA - ordB;
                      }
                      case 'created':
                        return b.createdAt - a.createdAt;
                      default:
                        return ordA - ordB;
                    }
                  });

                  return (
                    <div
                      key={batchTag}
                      id={`batch-col-${batchTag}`}
                      style={{
                        borderTopColor: theme.badgeStyle.borderColor,
                        borderTopWidth: '3px',
                      }}
                      className="w-72 flex-shrink-0 border border-zinc-800/90 rounded-lg flex flex-col min-h-0 overflow-hidden shadow-md bg-zinc-900/60"
                    >
                      {/* Batch Column Header */}
                      <div className="px-2.5 py-1.5 border-b border-zinc-800/80 bg-zinc-950/80 flex items-center justify-between flex-shrink-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <input
                            type="checkbox"
                            checked={batchTasks.length > 0 && batchTasks.every((t) => selectedBatchTaskIds.includes(t.id))}
                            onChange={() => toggleSelectAllInBatch(batchTasks)}
                            className="w-3.5 h-3.5 rounded accent-indigo-600 cursor-pointer flex-shrink-0"
                            title={`Select all tasks in ${batchTag}`}
                          />
                          <span
                            style={theme.badgeStyle}
                            className="text-[10px] font-mono uppercase font-bold px-1.5 py-0.5 rounded border shadow-sm flex-shrink-0"
                          >
                            {theme.short || batchTag}
                          </span>

                          {editingBatchName === batchTag ? (
                            <div className="flex items-center gap-1 min-w-0">
                              <input
                                autoFocus
                                value={renameInput}
                                onChange={(e) => setRenameInput(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleRenameBatch(batchTag, renameInput);
                                  if (e.key === 'Escape') setEditingBatchName(null);
                                }}
                                className="bg-zinc-900 border border-indigo-400 rounded px-1.5 py-0.2 text-[11px] font-bold text-white w-24 outline-none"
                              />
                              <button
                                onClick={() => handleRenameBatch(batchTag, renameInput)}
                                className="text-emerald-400 hover:text-emerald-300"
                                title="Save"
                              >
                                <Check className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => setEditingBatchName(null)}
                                className="text-zinc-500 hover:text-zinc-300"
                                title="Cancel"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <div
                              onClick={() => {
                                setEditingBatchName(batchTag);
                                setRenameInput(batchTag);
                              }}
                              className="flex items-center gap-1 cursor-pointer group/title min-w-0"
                              title="Click to rename batch"
                            >
                              <span className="text-[11px] font-bold text-zinc-200 truncate group-hover/title:text-white">
                                {batchTag}
                              </span>
                              <Pencil className="w-2.5 h-2.5 text-zinc-500 opacity-0 group-hover/title:opacity-100 transition flex-shrink-0" />
                            </div>
                          )}

                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-zinc-800 text-zinc-400 flex-shrink-0">
                            {batchTasks.length}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={() => openTaskModal(null, 'ready', undefined, batchTag)}
                            className="flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 font-semibold transition"
                            title={`Add task directly to ${batchTag}`}
                          >
                            <Plus className="w-2.5 h-2.5" /> Add
                          </button>
                          {batchPriorityOrder.length > 1 && (
                            <button
                              onClick={() => {
                                if (window.confirm(`Delete ${batchTag}? Any tasks in it will be moved to ${batchPriorityOrder.find((b) => b !== batchTag) || 'Batch 1'}.`)) {
                                  handleDeleteBatch(batchTag);
                                }
                              }}
                              className="p-1 text-zinc-500 hover:text-rose-400 rounded hover:bg-zinc-800"
                              title={`Delete ${batchTag}`}
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Batch Task List */}
                      <div
                        onDragOver={handleDragOver}
                        onDrop={() => handleDropOnBatchColumn(batchTag)}
                        className="p-1.5 space-y-1.5 overflow-y-auto flex-1 min-h-[80px]"
                      >
                        {batchTasks.length === 0 ? (
                          <div className="py-8 text-center text-[10px] text-zinc-600 italic">
                            Drop tasks here or click + Add
                          </div>
                        ) : (
                          batchTasks.map((t) => {
                            const status = computedStatus(t);
                            const durationDisplay = getTaskDurationDisplay(t);
                            const depNames = (t.dependencies || [])
                              .map((id) => tasks.find((x) => x.id === id))
                              .filter(Boolean) as Task[];
                            const waiting = depNames.filter((d) => d.manualStatus !== 'done').map((d) => d.name);

                            const posInBatch = batchTasks.findIndex((x) => x.id === t.id);
                            const isFirst = posInBatch === 0;
                            const isLast = posInBatch === batchTasks.length - 1;

                            const completedSubsCount = (t.subTasks || []).filter((s) => s.status === 'done').length;
                            const totalSubsCount = (t.subTasks || []).length;
                            const isSelected = selectedBatchTaskIds.includes(t.id);

                            return (
                              <div
                                key={t.id}
                                draggable
                                onDragStart={(e) => handleDragStart(e, t.id)}
                                onDragOver={handleDragOver}
                                onDrop={(e) => {
                                  e.stopPropagation();
                                  handleDropOnTask(t.id, batchTag);
                                }}
                                style={{
                                  borderLeftColor: theme.badgeStyle.borderColor,
                                  borderLeftWidth: '3px',
                                }}
                                className={`w-full h-[148px] p-2.5 rounded-lg border border-zinc-800 bg-zinc-900/90 shadow-sm flex flex-col justify-between transition-all select-none ${
                                  isSelected ? 'ring-2 ring-indigo-500 bg-indigo-950/40' : ''
                                } ${
                                  draggedTaskId === t.id ? 'opacity-60 ring-2 ring-indigo-500' : ''
                                }`}
                              >
                                <div className="flex items-center justify-between gap-1 flex-shrink-0">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={(e) => {
                                        e.stopPropagation();
                                        toggleSelectBatchTask(t.id);
                                      }}
                                      className="w-3.5 h-3.5 rounded accent-indigo-600 cursor-pointer flex-shrink-0"
                                      title="Select task for bulk batch move"
                                    />
                                    <GripVertical className="w-3 h-3 text-zinc-400/60 cursor-grab active:cursor-grabbing flex-shrink-0" />
                                    <span className="text-[9px] px-1 rounded font-semibold bg-black/30 border border-white/10 text-zinc-200 flex-shrink-0">
                                      {t.owner}
                                    </span>
                                    {t.taskType === 'goal' && (
                                      <span className="text-[8px] px-1 rounded font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-0.5 flex-shrink-0">
                                        <Target className="w-2.5 h-2.5" /> Goal
                                      </span>
                                    )}
                                    {t.isParallel && t.parallelGroup && (
                                      <span className="text-[8px] px-1 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center gap-0.5 truncate">
                                        <Split className="w-2 h-2 text-indigo-400 flex-shrink-0" /> {t.parallelGroup}
                                      </span>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-1 flex-shrink-0">
                                    <div className="flex items-center gap-0.5 mr-0.5">
                                      <button
                                        disabled={isFirst}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          moveTaskWithinBatch(t.id, batchTasks, 'up');
                                        }}
                                        className="p-0.5 text-zinc-400 hover:text-white disabled:opacity-20"
                                        title="Move Up Within Batch"
                                      >
                                        <ArrowUp className="w-2.5 h-2.5" />
                                      </button>
                                      <button
                                        disabled={isLast}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          moveTaskWithinBatch(t.id, batchTasks, 'down');
                                        }}
                                        className="p-0.5 text-zinc-400 hover:text-white disabled:opacity-20"
                                        title="Move Down Within Batch"
                                      >
                                        <ArrowDown className="w-2.5 h-2.5" />
                                      </button>
                                    </div>

                                    <select
                                      value={t.batch || 'Batch 1'}
                                      onChange={(e) => handleBatchChange(t.id, e.target.value as BatchTag)}
                                      style={theme.dropdownStyle}
                                      className="text-[9px] px-1.5 py-0.5 rounded font-bold cursor-pointer focus:outline-none border shadow-sm"
                                    >
                                      {batchPriorityOrder.map((b) => (
                                        <option key={b} value={b} style={getBatchTheme(b, batchPriorityOrder).dropdownStyle}>
                                          {b}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                </div>

                                {/* Card Middle */}
                                <div className="flex-1 flex flex-col justify-center min-h-0 space-y-1 my-0.5">
                                  <div
                                    onClick={() => openTaskModal(t.id)}
                                    className="text-xs font-bold leading-tight line-clamp-1 truncate cursor-pointer hover:underline text-zinc-100"
                                    title="Click to edit task"
                                  >
                                    {t.name}
                                  </div>

                                  {t.description ? (
                                    <p className="text-[10px] truncate leading-tight px-1.5 py-0.5 rounded border border-zinc-800 bg-zinc-950/60 text-zinc-300">
                                      {t.description.replace(/^Key objectives:\s*•?\s*/i, '')}
                                    </p>
                                  ) : null}

                                  <div className="flex items-center justify-between text-[9px] gap-1">
                                    {totalSubsCount > 0 ? (
                                      <span className="font-mono text-emerald-400 flex items-center gap-1 truncate">
                                        <ListTodo className="w-2.5 h-2.5 text-indigo-400 flex-shrink-0" />
                                        {completedSubsCount}/{totalSubsCount} Subtasks
                                      </span>
                                    ) : (
                                      <span className="text-zinc-500 italic text-[9px]">No subtasks</span>
                                    )}

                                    {waiting.length > 0 ? (
                                      <span className="text-rose-300 bg-rose-950/90 border border-rose-800/80 px-1 py-0.2 rounded truncate flex items-center gap-0.5 text-[8px] max-w-[130px]" title={`Waiting: ${waiting.join(', ')}`}>
                                        <Lock className="w-2 h-2 flex-shrink-0 text-rose-400" />
                                        <span className="truncate">{waiting[0]}{waiting.length > 1 ? ` +${waiting.length - 1}` : ''}</span>
                                      </span>
                                    ) : null}
                                  </div>
                                </div>

                                {/* Footer */}
                                <div className="flex items-center justify-between text-[10px] pt-1 border-t border-white/10 flex-shrink-0">
                                  <div className="flex items-center gap-1">
                                    {durationDisplay ? (
                                      <div className="flex items-center gap-1 font-mono px-1 py-0.2 rounded text-[9px] font-bold bg-blue-500/30 text-blue-200 animate-pulse border border-blue-400/50">
                                        <Timer className="w-2.5 h-2.5" />
                                        <span>{durationDisplay}</span>
                                      </div>
                                    ) : t.estimate ? (
                                      <div className="text-zinc-400 flex items-center gap-1 text-[9px]">
                                        <Clock className="w-2.5 h-2.5" /> {t.estimate}
                                      </div>
                                    ) : null}

                                    <span className={`font-bold uppercase text-[8px] px-1.5 py-0.2 rounded border ${
                                      status === 'ready'
                                        ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300'
                                        : status === 'progress'
                                        ? 'bg-blue-950/60 border-blue-500/50 text-blue-300'
                                        : status === 'done'
                                        ? 'bg-zinc-900 border-zinc-700 text-zinc-400'
                                        : 'bg-rose-950/60 border-rose-500/50 text-rose-300'
                                    }`}>
                                      {status}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-1">
                                    {status === 'ready' && (
                                      <button
                                        onClick={() => startInProgress(t.id)}
                                        className="px-2 py-0.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-semibold shadow"
                                      >
                                        Start
                                      </button>
                                    )}

                                    {status === 'progress' && t.taskType === 'goal' ? (
                                      <button
                                        onClick={() => {
                                          setReviewingTaskId(t.id);
                                          setIsBlockPickerOpen(false);
                                          setBlockParentId('');
                                          setBlockNewParentName('');
                                        }}
                                        className="px-2 py-0.5 rounded bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-bold shadow flex items-center gap-1"
                                      >
                                        <Eye className="w-3 h-3" /> Review
                                      </button>
                                    ) : status === 'progress' && t.taskType !== 'goal' ? (
                                      <button
                                        onClick={() => finishTask(t.id)}
                                        className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-semibold shadow"
                                      >
                                        Done
                                      </button>
                                    ) : null}

                                    {status === 'done' && (
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
                                    {status === 'done' && (
                                      <button
                                        onClick={() => deleteTask(t.id)}
                                        className="p-0.5 text-zinc-400 hover:text-rose-400"
                                        title="Delete"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    )}
                                  </div>
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
          </div>
        )}
      </main>

      {/* Goal Task Review Modal (3 Options: Done, Retry, Blocked) */}
      {reviewingTaskId && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3"
          onClick={(e) => {
            if (e.target === e.currentTarget) setReviewingTaskId(null);
          }}
        >
          <div className="bg-zinc-900 border border-amber-500/50 rounded-xl w-full max-w-md p-4 space-y-3 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <span className="font-bold text-xs text-amber-300 flex items-center gap-1.5">
                <Target className="w-4 h-4 text-amber-400" />
                Review Goal: "{reviewingTask?.name}"
              </span>
              <button onClick={() => setReviewingTaskId(null)} className="text-zinc-500 hover:text-zinc-300">
                <X className="w-4 h-4" />
              </button>
            </div>

            {!isBlockPickerOpen ? (
              <div className="space-y-3 pt-1">
                <div className="text-[11px] text-zinc-300">
                  Choose outcome for this goal task iteration:
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => finishTask(reviewingTaskId)}
                    className="p-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex flex-col items-center justify-center gap-1 shadow"
                  >
                    <Check className="w-4 h-4" />
                    <span>✓ Done</span>
                  </button>

                  <button
                    onClick={() => retryGoalTask(reviewingTaskId)}
                    className="p-2.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs flex flex-col items-center justify-center gap-1 shadow"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>🔄 Retry</span>
                  </button>

                  <button
                    onClick={() => setIsBlockPickerOpen(true)}
                    className="p-2.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex flex-col items-center justify-center gap-1 shadow"
                  >
                    <Ban className="w-4 h-4" />
                    <span>🚫 Blocked</span>
                  </button>
                </div>
              </div>
            ) : (
              /* Blocked Sub-flow: Select/Create Parent Task & Parent State */
              <div className="space-y-2.5 pt-1">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1">
                    1. Select prerequisite parent task causing block:
                  </label>
                  <select
                    value={blockParentId}
                    onChange={(e) => {
                      setBlockParentId(e.target.value);
                      if (e.target.value) setBlockNewParentName('');
                    }}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-xs text-zinc-200"
                  >
                    <option value="">-- Or type new parent below --</option>
                    {tasks
                      .filter((t) => t.id !== reviewingTaskId && computedStatus(t) !== 'done')
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.owner}) [{t.batch}]
                        </option>
                      ))}
                  </select>
                </div>

                <div className="pt-2 border-t border-zinc-800 space-y-1.5">
                  <label className="block text-[10px] uppercase font-bold text-zinc-400">
                    2. Or create brand new prerequisite task:
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    <input
                      placeholder="e.g. Waiting for API / Syllabus approval"
                      value={blockNewParentName}
                      onChange={(e) => {
                        setBlockNewParentName(e.target.value);
                        if (e.target.value) setBlockParentId('');
                      }}
                      className="col-span-2 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200"
                    />
                    <select
                      value={blockNewParentOwner}
                      onChange={(e) => setBlockNewParentOwner(e.target.value as any)}
                      className="bg-zinc-950 border border-zinc-800 rounded px-1 text-[10px] text-zinc-300"
                    >
                      <option value="Other">Other</option>
                      <option value="AI">AI</option>
                      <option value="Me">Me</option>
                    </select>
                  </div>
                </div>

                {/* Set Parent Task State */}
                <div className="pt-2 border-t border-zinc-800 flex items-center justify-between text-xs">
                  <span className="text-[10px] font-bold text-zinc-300 uppercase">
                    Parent Task State:
                  </span>
                  <select
                    value={blockParentStatus}
                    onChange={(e) => setBlockParentStatus(e.target.value as any)}
                    className={`border rounded px-2 py-1 text-xs font-bold focus:outline-none ${
                      blockParentStatus === 'progress'
                        ? 'bg-blue-950/80 border-blue-600 text-blue-300'
                        : 'bg-emerald-950/80 border-emerald-600 text-emerald-300'
                    }`}
                  >
                    <option value="progress" className="bg-zinc-900 text-blue-400">
                      IN PROGRESS (Being worked on)
                    </option>
                    <option value="ready" className="bg-zinc-900 text-emerald-400">
                      READY (Waiting to be picked up)
                    </option>
                  </select>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
                  <button
                    onClick={() => setIsBlockPickerOpen(false)}
                    className="px-3 py-1 text-xs text-zinc-400 hover:text-zinc-200"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleConfirmGoalBlock}
                    className="px-3.5 py-1 bg-rose-600 hover:bg-rose-500 font-bold text-white rounded text-xs shadow"
                  >
                    Confirm & Move to Blocked
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

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

            {/* Task Type Option (Normal vs Goal Task) */}
            <div className="p-2 bg-zinc-950/80 border border-zinc-800 rounded-lg flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-zinc-400 flex items-center gap-1">
                <Target className="w-3 h-3 text-amber-400" /> Task Type
              </span>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1 cursor-pointer text-xs">
                  <input
                    type="radio"
                    name="taskTypeSelect"
                    checked={taskType === 'normal'}
                    onChange={() => setTaskType('normal')}
                    className="text-indigo-600"
                  />
                  <span className="text-zinc-300">Normal Task</span>
                </label>
                <label className="flex items-center gap-1 cursor-pointer text-xs">
                  <input
                    type="radio"
                    name="taskTypeSelect"
                    checked={taskType === 'goal'}
                    onChange={() => setTaskType('goal')}
                    className="text-amber-500"
                  />
                  <span className="text-amber-300 font-semibold flex items-center gap-0.5">
                    🎯 Goal Task (Review: Done / Retry / Blocked)
                  </span>
                </label>
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
                  style={getBatchTheme(taskBatch, batchPriorityOrder).dropdownStyle}
                  className="w-full border rounded px-2 py-1 text-xs font-bold focus:outline-none shadow-sm"
                >
                  {batchPriorityOrder.map((b) => {
                    const optTheme = getBatchTheme(b, batchPriorityOrder);
                    return (
                      <option
                        key={b}
                        value={b}
                        style={{
                          backgroundColor: optTheme.dropdownStyle.backgroundColor,
                          color: optTheme.dropdownStyle.color,
                        }}
                      >
                        {b}
                      </option>
                    );
                  })}
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
                      <option value="AI">AI</option>
                      <option value="Me">Me</option>
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

            <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
              {editId ? (
                <button
                  type="button"
                  onClick={() => {
                    deleteTask(editId);
                    setIsModalOpen(false);
                  }}
                  className="px-2.5 py-1 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 rounded border border-rose-800/60 flex items-center gap-1 font-semibold"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete Task
                </button>
              ) : (
                <div />
              )}
              <div className="flex items-center gap-2">
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

            {/* Groups List with Multi-Select Existing Tasks & Reordering Controls */}
            <div className="space-y-4">
              {parallelGroups.map((grp) => {
                const grpTasks = tasks.filter((t) => t.isParallel && t.parallelGroup === grp.name && computedStatus(t) !== 'done');
                const formState = queueTaskInputs[grp.name] || { name: '', taskType: 'normal', owner: 'AI' };
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
                        <span className="text-zinc-400">Slots & Turn Target:</span>
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
                          title="Active running slots & tasks needed to rotate focus"
                        />
                      </div>
                    </div>

                    {/* Current Tasks inside this group with Sort/Reorder Controls */}
                    {grpTasks.length > 0 && (
                      <div className="space-y-1 bg-zinc-900/40 p-2 rounded border border-zinc-800/80">
                        <div className="text-[9px] uppercase font-bold text-zinc-400 mb-1 flex items-center justify-between">
                          <span>Sort & Reorder Tasks in {grp.name} ({grpTasks.length})</span>
                          <span className="text-[8px] text-zinc-500">First {grp.slotLimit} tasks run in active slots</span>
                        </div>
                        <div className="space-y-1 max-h-36 overflow-y-auto">
                          {grpTasks.map((t, idx) => (
                            <div
                              key={t.id}
                              className={`flex items-center justify-between p-1.5 rounded border text-[11px] ${
                                idx < grp.slotLimit ? 'bg-indigo-950/40 border-indigo-500/40 text-white' : 'bg-zinc-950 border-zinc-800/80 text-zinc-300'
                              }`}
                            >
                              <div className="flex items-center gap-1.5 truncate flex-1">
                                <div className="flex items-center gap-0.5 flex-shrink-0">
                                  <button
                                    disabled={idx === 0}
                                    onClick={() => moveTaskWithinGroup(grp.name, t.id, 'up')}
                                    className="p-0.5 text-zinc-400 hover:text-white disabled:opacity-20"
                                    title="Move Up in Queue"
                                  >
                                    <ArrowUp className="w-3 h-3" />
                                  </button>
                                  <button
                                    disabled={idx === grpTasks.length - 1}
                                    onClick={() => moveTaskWithinGroup(grp.name, t.id, 'down')}
                                    className="p-0.5 text-zinc-400 hover:text-white disabled:opacity-20"
                                    title="Move Down in Queue"
                                  >
                                    <ArrowDown className="w-3 h-3" />
                                  </button>
                                </div>
                                <span className="font-mono text-[9px] text-indigo-400 font-bold flex-shrink-0">
                                  {idx < grp.slotLimit ? `[Slot ${idx + 1}]` : `[Queue #${idx + 1 - grp.slotLimit}]`}
                                </span>
                                {t.taskType === 'goal' && (
                                  <span className="text-[8px] font-bold px-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-0.5">
                                    <Target className="w-2 h-2" /> Goal
                                  </span>
                                )}
                                <span className="truncate">{t.name}</span>
                              </div>

                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                <span className="text-[9px] px-1 rounded bg-zinc-900 text-zinc-400 font-mono">
                                  {t.owner}
                                </span>
                                <span className="text-[9px] px-1 rounded bg-zinc-900 text-zinc-400">
                                  {t.batch}
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
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="font-bold text-indigo-300">+ Create & Queue New Task</span>
                        <div className="flex items-center gap-2">
                          <label className="flex items-center gap-1 cursor-pointer">
                            <input
                              type="radio"
                              name={`type_${grp.name}`}
                              checked={formState.taskType === 'normal'}
                              onChange={() =>
                                setQueueTaskInputs((prev) => ({
                                  ...prev,
                                  [grp.name]: { ...formState, taskType: 'normal' },
                                }))
                              }
                            />
                            <span className="text-zinc-400">Normal</span>
                          </label>
                          <label className="flex items-center gap-1 cursor-pointer">
                            <input
                              type="radio"
                              name={`type_${grp.name}`}
                              checked={formState.taskType === 'goal'}
                              onChange={() =>
                                setQueueTaskInputs((prev) => ({
                                  ...prev,
                                  [grp.name]: { ...formState, taskType: 'goal' },
                                }))
                              }
                            />
                            <span className="text-amber-300 font-bold flex items-center gap-0.5">
                              <Target className="w-2.5 h-2.5" /> Goal
                            </span>
                          </label>
                        </div>
                      </div>

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
