'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Sparkles,
  LayoutGrid,
  GitFork,
  Bot,
  Plus,
  Search,
  RefreshCw,
  ChevronDown,
  CloudCheck,
  CloudOff,
} from 'lucide-react';
import { TaskStatus, WorkerType } from '@prisma/client';
import WhatShouldIDoNow from '@/components/WhatShouldIDoNow';
import KanbanBoard from '@/components/KanbanBoard';
import DependencyGraph from '@/components/DependencyGraph';
import TaskModal from '@/components/TaskModal';
import CreateTaskModal from '@/components/CreateTaskModal';
import WorkerManagerModal from '@/components/WorkerManagerModal';
import ProjectManagerModal from '@/components/ProjectManagerModal';
import { localStore } from '@/lib/localStore';

type ActiveTab = 'dashboard' | 'board' | 'graph';

export default function Home() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>('all');
  const [selectedPriority, setSelectedPriority] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [quickFilter, setQuickFilter] = useState<string | null>(null);

  // Data states with local cache initialization
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [workers, setWorkers] = useState<any[]>([]);
  const [graphData, setGraphData] = useState<any>({ nodes: [], edges: [], project: null });
  const [loading, setLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  // Modals
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false);
  const [isWorkerManagerOpen, setIsWorkerManagerOpen] = useState(false);
  const [isProjectManagerOpen, setIsProjectManagerOpen] = useState(false);

  const queryKey = `${selectedProjectId}_${selectedWorkerId}_${selectedPriority}_${searchQuery}`;

  // 1. Initial Load: Read immediately from browser LocalStorage in 0ms
  useEffect(() => {
    const cachedProjects = localStore.getProjects();
    const cachedWorkers = localStore.getWorkers();
    const cachedDashboard = localStore.getDashboard(selectedProjectId);
    const cachedTasks = localStore.getTasks(queryKey);
    const cachedGraph = localStore.getGraph(selectedProjectId);

    if (cachedProjects) setProjects(cachedProjects);
    if (cachedWorkers) setWorkers(cachedWorkers);
    if (cachedDashboard) setDashboardData(cachedDashboard);
    if (cachedTasks) setTasks(cachedTasks);
    if (cachedGraph) setGraphData(cachedGraph);
  }, [selectedProjectId, queryKey]);

  // 2. Background Sync with Server
  const syncWithBackend = useCallback(async (isManual = false) => {
    setIsSyncing(true);
    try {
      const [dashRes, tasksRes, projRes, workersRes, graphRes] = await Promise.all([
        fetch(`/api/dashboard?projectId=${selectedProjectId}`),
        fetch(
          `/api/tasks?projectId=${selectedProjectId}&workerId=${selectedWorkerId}&priority=${selectedPriority}&search=${encodeURIComponent(
            searchQuery
          )}`
        ),
        fetch('/api/projects'),
        fetch('/api/workers'),
        fetch(`/api/graph?projectId=${selectedProjectId}`),
      ]);

      const [dash, tks, projs, wrks, grph] = await Promise.all([
        dashRes.json(),
        tasksRes.json(),
        projRes.json(),
        workersRes.json(),
        graphRes.json(),
      ]);

      // Update State
      if (dash && !dash.error) {
        setDashboardData(dash);
        localStore.setDashboard(selectedProjectId, dash);
      }
      if (tks?.tasks) {
        setTasks(tks.tasks);
        localStore.setTasks(queryKey, tks.tasks);
      }
      if (projs?.projects) {
        setProjects(projs.projects);
        localStore.setProjects(projs.projects);
      }
      if (wrks?.workers) {
        setWorkers(wrks.workers);
        localStore.setWorkers(wrks.workers);
      }
      if (grph && !grph.error) {
        setGraphData(grph);
        localStore.setGraph(selectedProjectId, grph);
      }

      setLastSyncedAt(new Date());
    } catch (error) {
      console.warn('Background sync warning (using cached data):', error);
    } finally {
      setIsSyncing(false);
    }
  }, [selectedProjectId, selectedWorkerId, selectedPriority, searchQuery, queryKey]);

  useEffect(() => {
    syncWithBackend();
  }, [syncWithBackend]);

  // 3. Optimistic Status Changes (Instant UI Feedback + Background Save)
  const handleStatusChange = async (taskId: string, newStatus: TaskStatus) => {
    // Optimistically update local task list & cache
    const updatedTasks = tasks.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t));
    setTasks(updatedTasks);
    localStore.setTasks(queryKey, updatedTasks);

    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        syncWithBackend();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to update status');
        syncWithBackend();
      }
    } catch (err) {
      console.error(err);
      syncWithBackend();
    }
  };

  const handleResetDemoData = async () => {
    if (confirm('Reset and re-seed the Launch SaaS MVP & Routine Tracker demo projects?')) {
      await fetch('/api/seed', { method: 'POST' });
      syncWithBackend(true);
    }
  };

  const filteredTasks = tasks.filter((t) => {
    if (!quickFilter) return true;
    if (quickFilter === 'ready_me') return t.status === TaskStatus.READY && (!t.worker || t.worker.type === WorkerType.ME);
    if (quickFilter === 'ai') return t.worker?.type === WorkerType.AI_AGENT;
    if (quickFilter === 'waiting') return t.status === TaskStatus.WAITING;
    if (quickFilter === 'blocked') return t.status === TaskStatus.BLOCKED;
    if (quickFilter === 'due_soon') return t.deadline && new Date(t.deadline).getTime() - Date.now() < 3 * 24 * 60 * 60 * 1000;
    return true;
  });

  return (
    <div className="h-screen w-screen bg-zinc-950 text-zinc-100 flex flex-col antialiased overflow-hidden select-none">
      {/* Top Navbar */}
      <header className="border-b border-zinc-800/80 bg-zinc-900/80 backdrop-blur-md h-12 flex-shrink-0 z-30">
        <div className="max-w-7xl mx-auto px-3 h-full flex items-center justify-between gap-3">
          {/* Logo & Project Switcher */}
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-6 rounded bg-indigo-600 flex items-center justify-center font-bold text-xs text-white shadow-md">
                ⚡
              </div>
              <span className="font-bold text-xs tracking-tight text-white hidden sm:inline">
                Human<span className="text-indigo-400">+</span>AI
              </span>
            </div>

            <div className="h-4 w-[1px] bg-zinc-800 hidden sm:block" />

            {/* Project Selector */}
            <div className="relative">
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="bg-zinc-900 border border-zinc-700/80 text-zinc-200 text-xs rounded-md pl-2 pr-6 py-1 focus:ring-1 focus:ring-indigo-500 focus:outline-none appearance-none cursor-pointer"
              >
                <option value="all">🌐 All Projects</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    📁 {p.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3 h-3 text-zinc-400 absolute right-1.5 top-2 pointer-events-none" />
            </div>

            <button
              onClick={() => setIsProjectManagerOpen(true)}
              className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition"
              title="Add New Project"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>

          {/* Center Tabs */}
          <nav className="flex items-center bg-zinc-900 border border-zinc-800 p-0.5 rounded-lg">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold transition ${
                activeTab === 'dashboard'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Sparkles className="w-3 h-3" /> What To Do
            </button>
            <button
              onClick={() => setActiveTab('board')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold transition ${
                activeTab === 'board'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <LayoutGrid className="w-3 h-3" /> Board
            </button>
            <button
              onClick={() => setActiveTab('graph')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold transition ${
                activeTab === 'graph'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <GitFork className="w-3 h-3" /> DAG Graph
            </button>
          </nav>

          {/* Right Action buttons & Sync Status */}
          <div className="flex items-center gap-1.5">
            {/* Background Sync Indicator */}
            <div
              className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-900 text-zinc-400 border border-zinc-800"
              title={isSyncing ? 'Syncing with Neon DB...' : 'Local cache synced in background'}
            >
              <div
                className={`w-1.5 h-1.5 rounded-full ${
                  isSyncing ? 'bg-amber-400 animate-ping' : 'bg-emerald-400'
                }`}
              />
              <span className="hidden md:inline">{isSyncing ? 'Syncing' : 'Instant Sync'}</span>
            </div>

            <button
              onClick={() => setIsWorkerManagerOpen(true)}
              className="flex items-center gap-1 px-2 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-300 transition"
              title="Manage Workers & WIP Limits"
            >
              <Bot className="w-3 h-3 text-purple-400" />
              <span className="hidden md:inline">Workers</span>
            </button>

            <button
              onClick={() => setIsCreateTaskOpen(true)}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition shadow"
            >
              <Plus className="w-3 h-3" />
              <span>New Task</span>
            </button>
          </div>
        </div>
      </header>

      {/* Sub-bar: Search & Quick Filter Pills */}
      <div className="border-b border-zinc-800/60 bg-zinc-950/80 px-3 py-1.5 flex-shrink-0 z-20">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 overflow-x-auto text-[11px]">
            <button
              onClick={() => setQuickFilter(null)}
              className={`px-2 py-0.5 rounded-full border transition whitespace-nowrap ${
                quickFilter === null
                  ? 'bg-zinc-200 text-zinc-900 border-zinc-200 font-semibold'
                  : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200'
              }`}
            >
              All Work
            </button>
            <button
              onClick={() => setQuickFilter(quickFilter === 'ready_me' ? null : 'ready_me')}
              className={`px-2 py-0.5 rounded-full border transition whitespace-nowrap ${
                quickFilter === 'ready_me'
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-semibold'
                  : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-emerald-400'
              }`}
            >
              ⚡ Ready For Me
            </button>
            <button
              onClick={() => setQuickFilter(quickFilter === 'ai' ? null : 'ai')}
              className={`px-2 py-0.5 rounded-full border transition whitespace-nowrap ${
                quickFilter === 'ai'
                  ? 'bg-purple-500/20 text-purple-300 border-purple-500/40 font-semibold'
                  : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-purple-400'
              }`}
            >
              🤖 AI Tasks
            </button>
            <button
              onClick={() => setQuickFilter(quickFilter === 'waiting' ? null : 'waiting')}
              className={`px-2 py-0.5 rounded-full border transition whitespace-nowrap ${
                quickFilter === 'waiting'
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-semibold'
                  : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-amber-400'
              }`}
            >
              ⏳ Waiting
            </button>
            <button
              onClick={() => setQuickFilter(quickFilter === 'blocked' ? null : 'blocked')}
              className={`px-2 py-0.5 rounded-full border transition whitespace-nowrap ${
                quickFilter === 'blocked'
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 font-semibold'
                  : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-rose-400'
              }`}
            >
              🔒 Blocked
            </button>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <div className="relative w-40 sm:w-48">
              <Search className="w-3 h-3 text-zinc-500 absolute left-2 top-1.5" />
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-md pl-6 pr-2 py-0.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <button
              onClick={() => syncWithBackend(true)}
              disabled={isSyncing}
              className="p-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 transition"
              title="Sync now"
            >
              <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
            </button>

            <button
              onClick={handleResetDemoData}
              className="text-[10px] px-2 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 transition hidden sm:inline"
            >
              Reset Demo
            </button>
          </div>
        </div>
      </div>

      {/* Main Content View */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 overflow-hidden min-h-0 flex flex-col">
        {dashboardData ? (
          <div className="flex-1 min-h-0 flex flex-col">
            {activeTab === 'dashboard' && (
              <WhatShouldIDoNow
                primaryRecommendation={dashboardData.primaryRecommendation}
                otherReadyTasks={dashboardData.otherReadyTasks || []}
                aiWorkingTasks={dashboardData.aiWorkingTasks || []}
                waitingTasks={dashboardData.waitingTasks || []}
                blockedTasks={dashboardData.blockedTasks || []}
                isUserGenuinelyBlocked={dashboardData.isUserGenuinelyBlocked}
                onOpenTask={(id) => setActiveTaskId(id)}
                onStatusChange={handleStatusChange}
              />
            )}

            {activeTab === 'board' && (
              <KanbanBoard
                tasks={filteredTasks}
                onOpenTask={(id) => setActiveTaskId(id)}
                onStatusChange={handleStatusChange}
                workers={workers}
              />
            )}

            {activeTab === 'graph' && (
              <DependencyGraph
                graphData={graphData}
                onOpenTask={(id) => setActiveTaskId(id)}
              />
            )}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-zinc-500 text-xs">
            Loading...
          </div>
        )}
      </main>

      {/* Modals */}
      <TaskModal
        taskId={activeTaskId}
        onClose={() => setActiveTaskId(null)}
        onTaskUpdated={() => syncWithBackend(true)}
        allTasks={tasks}
        workers={workers}
      />

      <CreateTaskModal
        isOpen={isCreateTaskOpen}
        onClose={() => setIsCreateTaskOpen(false)}
        onTaskCreated={() => syncWithBackend(true)}
        projects={projects}
        currentProjectId={selectedProjectId}
        workers={workers}
        allTasks={tasks}
      />

      <WorkerManagerModal
        isOpen={isWorkerManagerOpen}
        onClose={() => setIsWorkerManagerOpen(false)}
        workers={workers}
        onWorkersUpdated={() => syncWithBackend(true)}
      />

      <ProjectManagerModal
        isOpen={isProjectManagerOpen}
        onClose={() => setIsProjectManagerOpen(false)}
        onProjectCreated={(newId) => {
          setSelectedProjectId(newId);
          syncWithBackend(true);
        }}
      />
    </div>
  );
}
