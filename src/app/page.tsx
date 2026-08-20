'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Sparkles,
  LayoutGrid,
  GitFork,
  CheckCircle2,
  Clock,
  Bot,
  User,
  Plus,
  Search,
  Filter,
  RefreshCw,
  Folder,
  Layers,
  ChevronDown,
  Users,
  Shield,
  Activity,
} from 'lucide-react';
import { TaskStatus, Priority, WorkerType } from '@prisma/client';
import WhatShouldIDoNow from '@/components/WhatShouldIDoNow';
import KanbanBoard from '@/components/KanbanBoard';
import DependencyGraph from '@/components/DependencyGraph';
import TaskModal from '@/components/TaskModal';
import CreateTaskModal from '@/components/CreateTaskModal';
import WorkerManagerModal from '@/components/WorkerManagerModal';
import ProjectManagerModal from '@/components/ProjectManagerModal';

type ActiveTab = 'dashboard' | 'board' | 'graph';

export default function Home() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>('all');
  const [selectedPriority, setSelectedPriority] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [quickFilter, setQuickFilter] = useState<string | null>(null);

  // Data states
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [workers, setWorkers] = useState<any[]>([]);
  const [graphData, setGraphData] = useState<any>({ nodes: [], edges: [], project: null });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Modals
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false);
  const [isWorkerManagerOpen, setIsWorkerManagerOpen] = useState(false);
  const [isProjectManagerOpen, setIsProjectManagerOpen] = useState(false);

  const fetchAllData = useCallback(async () => {
    try {
      setRefreshing(true);
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

      setDashboardData(dash);
      setTasks(tks.tasks || []);
      setProjects(projs.projects || []);
      setWorkers(wrks.workers || []);
      setGraphData(grph);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedProjectId, selectedWorkerId, selectedPriority, searchQuery]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  const handleStatusChange = async (taskId: string, newStatus: TaskStatus) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        fetchAllData();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to update status');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleResetDemoData = async () => {
    if (confirm('Reset and re-seed the Launch SaaS MVP & Routine Tracker demo projects?')) {
      await fetch('/api/seed', { method: 'POST' });
      fetchAllData();
    }
  };

  // Filter tasks based on quick filters
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
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col antialiased selection:bg-indigo-500 selection:text-white">
      {/* Top Navbar */}
      <header className="border-b border-zinc-800/80 bg-zinc-900/60 backdrop-blur-xl sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          {/* Logo & Project Switcher */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-600/30">
                ⚡
              </div>
              <span className="font-extrabold text-sm tracking-tight text-white hidden sm:inline">
                Human<span className="text-indigo-400">+</span>AI Work
              </span>
            </div>

            <div className="h-5 w-[1px] bg-zinc-800 hidden sm:block" />

            {/* Project Selector */}
            <div className="relative">
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="bg-zinc-900 border border-zinc-700/80 text-zinc-200 text-xs font-medium rounded-lg pl-3 pr-8 py-1.5 focus:ring-1 focus:ring-indigo-500 focus:outline-none appearance-none cursor-pointer"
              >
                <option value="all">🌐 All Projects (Multi-Project View)</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    📁 {p.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-zinc-400 absolute right-2.5 top-2.5 pointer-events-none" />
            </div>

            <button
              onClick={() => setIsProjectManagerOpen(true)}
              className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs transition"
              title="Add New Project"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Center Tabs: Dashboard / Board / Graph */}
          <nav className="flex items-center bg-zinc-900/90 border border-zinc-800 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeTab === 'dashboard'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" /> What To Do
            </button>
            <button
              onClick={() => setActiveTab('board')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeTab === 'board'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" /> Board
            </button>
            <button
              onClick={() => setActiveTab('graph')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeTab === 'graph'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <GitFork className="w-3.5 h-3.5" /> Dependencies
            </button>
          </nav>

          {/* Right Action buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsWorkerManagerOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-300 transition"
              title="Manage Workers & WIP Limits"
            >
              <Bot className="w-3.5 h-3.5 text-purple-400" />
              <span className="hidden md:inline">Workers</span>
            </button>

            <button
              onClick={() => setIsCreateTaskOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition shadow-lg shadow-indigo-600/30"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Task</span>
            </button>
          </div>
        </div>
      </header>

      {/* Sub-bar: Search, Quick Filter Pills, and Refresh */}
      <div className="border-b border-zinc-800/60 bg-zinc-950/80 px-4 sm:px-6 lg:px-8 py-2.5">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Quick Filters */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 text-xs">
            <button
              onClick={() => setQuickFilter(null)}
              className={`px-2.5 py-1 rounded-full border transition whitespace-nowrap ${
                quickFilter === null
                  ? 'bg-zinc-200 text-zinc-900 border-zinc-200 font-semibold'
                  : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200'
              }`}
            >
              All Work
            </button>
            <button
              onClick={() => setQuickFilter(quickFilter === 'ready_me' ? null : 'ready_me')}
              className={`px-2.5 py-1 rounded-full border transition whitespace-nowrap ${
                quickFilter === 'ready_me'
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-semibold'
                  : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-emerald-400'
              }`}
            >
              ⚡ Ready For Me
            </button>
            <button
              onClick={() => setQuickFilter(quickFilter === 'ai' ? null : 'ai')}
              className={`px-2.5 py-1 rounded-full border transition whitespace-nowrap ${
                quickFilter === 'ai'
                  ? 'bg-purple-500/20 text-purple-300 border-purple-500/40 font-semibold'
                  : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-purple-400'
              }`}
            >
              🤖 AI Tasks
            </button>
            <button
              onClick={() => setQuickFilter(quickFilter === 'waiting' ? null : 'waiting')}
              className={`px-2.5 py-1 rounded-full border transition whitespace-nowrap ${
                quickFilter === 'waiting'
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-semibold'
                  : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-amber-400'
              }`}
            >
              ⏳ Waiting
            </button>
            <button
              onClick={() => setQuickFilter(quickFilter === 'blocked' ? null : 'blocked')}
              className={`px-2.5 py-1 rounded-full border transition whitespace-nowrap ${
                quickFilter === 'blocked'
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 font-semibold'
                  : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-rose-400'
              }`}
            >
              🔒 Blocked
            </button>
            <button
              onClick={() => setQuickFilter(quickFilter === 'due_soon' ? null : 'due_soon')}
              className={`px-2.5 py-1 rounded-full border transition whitespace-nowrap ${
                quickFilter === 'due_soon'
                  ? 'bg-blue-500/20 text-blue-300 border-blue-500/40 font-semibold'
                  : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-blue-400'
              }`}
            >
              🎯 Due Soon
            </button>
          </div>

          {/* Search Box & Refresh & Demo Seed */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1 md:w-64">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2" />
              <input
                type="text"
                placeholder="Search tasks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-8 pr-3 py-1 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <button
              onClick={() => fetchAllData()}
              disabled={refreshing}
              className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 transition"
              title="Refresh all data"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>

            <button
              onClick={handleResetDemoData}
              className="text-[11px] px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 transition"
              title="Reset Demo Data"
            >
              Reset Demo
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {loading && !dashboardData ? (
          <div className="p-16 text-center text-zinc-500 text-sm">
            Initializing Human + AI Work Engine...
          </div>
        ) : (
          <div>
            {activeTab === 'dashboard' && dashboardData && (
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
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-zinc-200">
                      Dependency Visualization (DAG View)
                    </h3>
                    <p className="text-xs text-zinc-400">
                      Left-to-right topological order. Click any task to inspect details or manage dependencies.
                    </p>
                  </div>
                </div>
                <DependencyGraph
                  graphData={graphData}
                  onOpenTask={(id) => setActiveTaskId(id)}
                />
              </div>
            )}
          </div>
        )}
      </main>

      {/* Task Details Modal */}
      <TaskModal
        taskId={activeTaskId}
        onClose={() => setActiveTaskId(null)}
        onTaskUpdated={fetchAllData}
        allTasks={tasks}
        workers={workers}
      />

      {/* Create Task Modal */}
      <CreateTaskModal
        isOpen={isCreateTaskOpen}
        onClose={() => setIsCreateTaskOpen(false)}
        onTaskCreated={fetchAllData}
        projects={projects}
        currentProjectId={selectedProjectId}
        workers={workers}
        allTasks={tasks}
      />

      {/* Worker Manager Modal */}
      <WorkerManagerModal
        isOpen={isWorkerManagerOpen}
        onClose={() => setIsWorkerManagerOpen(false)}
        workers={workers}
        onWorkersUpdated={fetchAllData}
      />

      {/* Project Manager Modal */}
      <ProjectManagerModal
        isOpen={isProjectManagerOpen}
        onClose={() => setIsProjectManagerOpen(false)}
        onProjectCreated={(newId) => {
          setSelectedProjectId(newId);
          fetchAllData();
        }}
      />
    </div>
  );
}
