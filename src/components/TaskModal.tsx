'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Clock,
  CheckCircle2,
  AlertCircle,
  Play,
  Pause,
  ArrowRight,
  Bot,
  User,
  ExternalLink,
  Trash2,
  Plus,
  Link as LinkIcon,
  Sparkles,
  ShieldAlert,
} from 'lucide-react';
import { TaskStatus, Priority, WorkerType, WaitingType } from '@prisma/client';

interface TaskModalProps {
  taskId: string | null;
  onClose: () => void;
  onTaskUpdated: () => void;
  allTasks: Array<{ id: string; title: string; status: TaskStatus; projectId: string }>;
  workers: Array<{ id: string; name: string; type: WorkerType; wipLimit: number; activeTasksCount: number }>;
}

export default function TaskModal({
  taskId,
  onClose,
  onTaskUpdated,
  allTasks,
  workers,
}: TaskModalProps) {
  const [task, setTask] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // New dependency selection
  const [selectedDepId, setSelectedDepId] = useState('');
  const [addingDep, setAddingDep] = useState(false);

  // Subtask creation
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');

  useEffect(() => {
    if (!taskId) return;
    fetchTaskDetails(taskId);
  }, [taskId]);

  const fetchTaskDetails = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load task');
      setTask(data.task);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!taskId) return null;

  const handleStatusChange = async (newStatus: TaskStatus) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update status');
      await fetchTaskDetails(task.id);
      onTaskUpdated();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleWorkerChange = async (workerId: string) => {
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workerId: workerId === 'none' ? null : workerId }),
      });
      if (res.ok) {
        await fetchTaskDetails(task.id);
        onTaskUpdated();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddDependency = async () => {
    if (!selectedDepId) return;
    setAddingDep(true);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${task.id}/dependencies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dependsOnTaskId: selectedDepId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add dependency');
      setSelectedDepId('');
      await fetchTaskDetails(task.id);
      onTaskUpdated();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAddingDep(false);
    }
  };

  const handleRemoveDependency = async (prereqId: string) => {
    try {
      const res = await fetch(`/api/tasks/${task.id}/dependencies?dependsOnTaskId=${prereqId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        await fetchTaskDetails(task.id);
        onTaskUpdated();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddSubtask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubtaskTitle.trim()) return;
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: task.projectId,
          parentId: task.id,
          title: newSubtaskTitle.trim(),
          priority: task.priority,
        }),
      });
      if (res.ok) {
        setNewSubtaskTitle('');
        await fetchTaskDetails(task.id);
        onTaskUpdated();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteTask = async () => {
    if (!confirm('Are you sure you want to delete this task? Dependent tasks will have their dependency removed and recalculate automatically.')) {
      return;
    }
    try {
      const res = await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' });
      if (res.ok) {
        onClose();
        onTaskUpdated();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const availablePrereqs = allTasks.filter(
    (t) =>
      t.id !== task?.id &&
      t.projectId === task?.projectId &&
      !task?.dependencies?.some((d: any) => d.dependsOnTaskId === t.id)
  );

  const getStatusBadgeClass = (status: TaskStatus) => {
    switch (status) {
      case TaskStatus.READY:
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case TaskStatus.BLOCKED:
        return 'bg-rose-500/10 text-rose-400 border-rose-500/30';
      case TaskStatus.IN_PROGRESS:
        return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
      case TaskStatus.WAITING:
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      case TaskStatus.REVIEW:
        return 'bg-purple-500/10 text-purple-400 border-purple-500/30';
      case TaskStatus.DONE:
        return 'bg-green-500/10 text-green-400 border-green-500/30';
      default:
        return 'bg-zinc-800 text-zinc-400 border-zinc-700';
    }
  };

  const getPriorityBadgeClass = (priority: Priority) => {
    switch (priority) {
      case Priority.CRITICAL:
        return 'bg-red-500/20 text-red-400 border-red-500/40';
      case Priority.HIGH:
        return 'bg-orange-500/20 text-orange-400 border-orange-500/40';
      case Priority.MEDIUM:
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40';
      case Priority.LOW:
        return 'bg-zinc-700/50 text-zinc-300 border-zinc-600';
    }
  };

  const formatWaitingDuration = (since: string | null) => {
    if (!since) return '';
    const diffMin = Math.floor((Date.now() - new Date(since).getTime()) / (1000 * 60));
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    return `${diffHours}h ${diffMin % 60}m ago`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden my-8">
        {loading || !task ? (
          <div className="p-12 text-center text-zinc-400">Loading task details...</div>
        ) : (
          <div>
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-950/50">
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">
                  {task.project?.name}
                </span>
                {task.milestone && (
                  <span className="text-xs px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                    {task.milestone.name}
                  </span>
                )}
                <span
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${getStatusBadgeClass(
                    task.status
                  )}`}
                >
                  {task.status.replace('_', ' ')}
                </span>
                <span
                  className={`text-xs px-2 py-0.5 rounded border ${getPriorityBadgeClass(
                    task.priority
                  )}`}
                >
                  {task.priority}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDeleteTask}
                  className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition"
                  title="Delete task"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Error Banner */}
            {error && (
              <div className="mx-6 mt-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-center gap-2 text-rose-400 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Modal Body */}
            <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
              {/* Title & Quick Actions */}
              <div>
                <h2 className="text-xl font-bold text-zinc-100">{task.title}</h2>
                {task.description && (
                  <p className="mt-2 text-sm text-zinc-400 leading-relaxed">{task.description}</p>
                )}
              </div>

              {/* Status Action Buttons */}
              <div className="flex flex-wrap gap-2 p-3 bg-zinc-950/60 rounded-lg border border-zinc-800/80">
                <span className="text-xs text-zinc-400 self-center mr-2">Transition status:</span>
                {task.status !== TaskStatus.IN_PROGRESS && task.status !== TaskStatus.DONE && (
                  <button
                    disabled={saving || task.status === TaskStatus.BLOCKED}
                    onClick={() => handleStatusChange(TaskStatus.IN_PROGRESS)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:hover:bg-blue-600 text-white rounded-md transition shadow"
                  >
                    <Play className="w-3.5 h-3.5" /> Start Task
                  </button>
                )}
                {task.status === TaskStatus.IN_PROGRESS && (
                  <button
                    disabled={saving}
                    onClick={() => handleStatusChange(TaskStatus.WAITING)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-amber-600/80 hover:bg-amber-600 text-white rounded-md transition"
                  >
                    <Pause className="w-3.5 h-3.5" /> Move to Waiting
                  </button>
                )}
                {task.status !== TaskStatus.REVIEW && task.status !== TaskStatus.DONE && (
                  <button
                    disabled={saving}
                    onClick={() => handleStatusChange(TaskStatus.REVIEW)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-purple-600/80 hover:bg-purple-600 text-white rounded-md transition"
                  >
                    Submit for Review
                  </button>
                )}
                {task.status !== TaskStatus.DONE && (
                  <button
                    disabled={saving}
                    onClick={() => handleStatusChange(TaskStatus.DONE)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white rounded-md transition shadow"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> Mark Done
                  </button>
                )}
                {task.status === TaskStatus.DONE && (
                  <button
                    disabled={saving}
                    onClick={() => handleStatusChange(TaskStatus.IN_PROGRESS)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-md transition"
                  >
                    Reopen Task
                  </button>
                )}
              </div>

              {/* Waiting Status Banner if WAITING */}
              {task.status === TaskStatus.WAITING && (
                <div className="p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-sm">
                  <div className="font-semibold flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Waiting for: {task.waitingReason || 'External completion'}
                  </div>
                  <div className="text-xs text-amber-400/80 mt-1">
                    Type: <span className="font-mono">{task.waitingType || 'EXTERNAL'}</span> • Started{' '}
                    {formatWaitingDuration(task.waitingSince)}
                  </div>
                </div>
              )}

              {/* SMART Task Framework Data */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Completion Criteria (Measurable) */}
                <div className="p-4 rounded-lg bg-zinc-950 border border-zinc-800/80">
                  <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400 block mb-1">
                    Done When (Completion Criteria)
                  </span>
                  <p className="text-sm text-zinc-300">
                    {task.completionCriteria || (
                      <span className="text-zinc-500 italic">No specific completion criteria defined.</span>
                    )}
                  </p>
                </div>

                {/* Worker Assignment & WIP limit */}
                <div className="p-4 rounded-lg bg-zinc-950 border border-zinc-800/80 space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400 block">
                    Assignee / Worker
                  </span>
                  <div className="flex items-center gap-3">
                    <select
                      value={task.workerId || 'none'}
                      onChange={(e) => handleWorkerChange(e.target.value)}
                      className="bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    >
                      <option value="none">Unassigned</option>
                      {workers.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name} ({w.type}) [Active: {w.activeTasksCount}/{w.wipLimit}]
                        </option>
                      ))}
                    </select>
                    {task.worker?.type === WorkerType.AI_AGENT && (
                      <span className="flex items-center gap-1 text-xs text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                        <Bot className="w-3.5 h-3.5" /> AI Worker
                      </span>
                    )}
                  </div>
                </div>

                {/* Time & Duration */}
                <div className="p-4 rounded-lg bg-zinc-950 border border-zinc-800/80">
                  <span className="text-xs font-semibold uppercase tracking-wider text-blue-400 block mb-1">
                    Estimate & Deadlines
                  </span>
                  <div className="text-sm text-zinc-300 space-y-1">
                    <div>
                      Estimated Duration:{' '}
                      <span className="font-semibold text-zinc-100">
                        {task.estimatedDuration ? `${task.estimatedDuration} minutes` : 'Not specified'}
                      </span>
                    </div>
                    {task.deadline && (
                      <div>
                        Target Deadline:{' '}
                        <span className="font-semibold text-amber-400">
                          {new Date(task.deadline).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* AI Instructions if applicable */}
                {task.worker?.type === WorkerType.AI_AGENT && (
                  <div className="p-4 rounded-lg bg-zinc-950 border border-purple-500/20">
                    <span className="text-xs font-semibold uppercase tracking-wider text-purple-400 flex items-center gap-1 mb-1">
                      <Sparkles className="w-3.5 h-3.5" /> AI Instructions & Spec
                    </span>
                    <p className="text-xs text-zinc-300">{task.aiInstructions || 'Standard task prompt'}</p>
                    {task.aiExpectedOutput && (
                      <p className="text-xs text-zinc-400 mt-1">
                        <strong className="text-zinc-300">Expected:</strong> {task.aiExpectedOutput}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Dependencies Section (BLOCKED BY & UNLOCKS) */}
              <div className="border border-zinc-800 rounded-lg p-4 bg-zinc-950/40 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                    <LinkIcon className="w-4 h-4 text-zinc-400" />
                    Task Dependencies & Graph Links
                  </h3>
                </div>

                {/* Blocked By */}
                <div>
                  <span className="text-xs font-semibold text-rose-400 uppercase tracking-wider block mb-2">
                    Blocked By (Prerequisites that must finish first):
                  </span>
                  {task.dependencies && task.dependencies.length > 0 ? (
                    <div className="space-y-1.5">
                      {task.dependencies.map((dep: any) => (
                        <div
                          key={dep.id}
                          className="flex items-center justify-between p-2 rounded bg-zinc-900 border border-zinc-800 text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                dep.dependsOnTask.status === TaskStatus.DONE
                                  ? 'bg-emerald-500/20 text-emerald-400'
                                  : 'bg-rose-500/20 text-rose-400'
                              }`}
                            >
                              {dep.dependsOnTask.status}
                            </span>
                            <span className="text-zinc-200 font-medium">{dep.dependsOnTask.title}</span>
                          </div>
                          <button
                            onClick={() => handleRemoveDependency(dep.dependsOnTaskId)}
                            className="text-zinc-500 hover:text-rose-400 transition"
                            title="Remove dependency"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-500 italic">No prerequisites. This task can start immediately!</p>
                  )}

                  {/* Add prerequisite dropdown */}
                  <div className="mt-3 flex gap-2">
                    <select
                      value={selectedDepId}
                      onChange={(e) => setSelectedDepId(e.target.value)}
                      className="bg-zinc-900 border border-zinc-700 text-zinc-300 text-xs rounded px-2.5 py-1.5 flex-1 focus:ring-1 focus:ring-indigo-500"
                    >
                      <option value="">+ Add prerequisite dependency...</option>
                      {availablePrereqs.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.title} ({p.status})
                        </option>
                      ))}
                    </select>
                    <button
                      disabled={!selectedDepId || addingDep}
                      onClick={handleAddDependency}
                      className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-xs text-zinc-200 font-medium rounded transition"
                    >
                      Add Link
                    </button>
                  </div>
                </div>

                {/* Unlocks (Downstream dependents) */}
                <div className="pt-2 border-t border-zinc-800/80">
                  <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider block mb-2">
                    Unlocks (Tasks waiting on this to complete):
                  </span>
                  {task.dependents && task.dependents.length > 0 ? (
                    <div className="space-y-1.5">
                      {task.dependents.map((dep: any) => (
                        <div
                          key={dep.id}
                          className="flex items-center justify-between p-2 rounded bg-zinc-900 border border-zinc-800 text-xs"
                        >
                          <span className="text-zinc-200 font-medium">{dep.task.title}</span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] ${getStatusBadgeClass(
                              dep.task.status
                            )}`}
                          >
                            {dep.task.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-500 italic">No downstream tasks waiting directly on this.</p>
                  )}
                </div>
              </div>

              {/* Subtasks Section */}
              <div className="border border-zinc-800 rounded-lg p-4 bg-zinc-950/40 space-y-3">
                <h3 className="text-sm font-semibold text-zinc-200">Subtasks & Breakdown</h3>
                {task.subtasks && task.subtasks.length > 0 ? (
                  <div className="space-y-1.5">
                    {task.subtasks.map((st: any) => (
                      <div
                        key={st.id}
                        className="flex items-center justify-between p-2 rounded bg-zinc-900 border border-zinc-800 text-xs"
                      >
                        <span
                          className={`font-medium ${
                            st.status === TaskStatus.DONE ? 'line-through text-zinc-500' : 'text-zinc-200'
                          }`}
                        >
                          {st.title}
                        </span>
                        <button
                          onClick={async () => {
                            const newSt = st.status === TaskStatus.DONE ? TaskStatus.READY : TaskStatus.DONE;
                            await fetch(`/api/tasks/${st.id}`, {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ status: newSt }),
                            });
                            await fetchTaskDetails(task.id);
                          }}
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${getStatusBadgeClass(
                            st.status
                          )}`}
                        >
                          {st.status}
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-zinc-500 italic">No subtasks created.</p>
                )}

                <form onSubmit={handleAddSubtask} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Add a new subtask..."
                    value={newSubtaskTitle}
                    onChange={(e) => setNewSubtaskTitle(e.target.value)}
                    className="flex-1 bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <button
                    type="submit"
                    disabled={!newSubtaskTitle.trim()}
                    className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-xs text-zinc-200 font-medium rounded transition"
                  >
                    Add
                  </button>
                </form>
              </div>

              {/* Activity Log */}
              {task.activities && task.activities.length > 0 && (
                <div className="border-t border-zinc-800 pt-4">
                  <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block mb-2">
                    Recent Activity
                  </span>
                  <div className="space-y-1 max-h-32 overflow-y-auto text-xs text-zinc-400">
                    {task.activities.map((a: any) => (
                      <div key={a.id} className="flex items-center gap-2 py-0.5">
                        <span className="text-[10px] text-zinc-600 font-mono">
                          {new Date(a.createdAt).toLocaleTimeString()}
                        </span>
                        <span>{a.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
