'use client';

import React, { useState } from 'react';
import { X, ChevronDown, ChevronUp, Sparkles, Clock, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Priority, WorkerType, WaitingType, TaskStatus } from '@prisma/client';

interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTaskCreated: () => void;
  projects: Array<{ id: string; name: string; milestones?: Array<{ id: string; name: string }> }>;
  currentProjectId?: string;
  workers: Array<{ id: string; name: string; type: WorkerType; wipLimit: number; activeTasksCount: number }>;
  allTasks: Array<{ id: string; title: string; status: TaskStatus; projectId: string }>;
}

export default function CreateTaskModal({
  isOpen,
  onClose,
  onTaskCreated,
  projects,
  currentProjectId,
  workers,
  allTasks,
}: CreateTaskModalProps) {
  const [projectId, setProjectId] = useState(
    currentProjectId && currentProjectId !== 'all' ? currentProjectId : projects[0]?.id || ''
  );
  const [title, setTitle] = useState('');
  const [workerId, setWorkerId] = useState(workers.find((w) => w.type === WorkerType.ME)?.id || '');
  const [priority, setPriority] = useState<Priority>(Priority.MEDIUM);
  const [estimatedDuration, setEstimatedDuration] = useState('');
  const [deadline, setDeadline] = useState('');
  const [selectedDependencies, setSelectedDependencies] = useState<string[]>([]);

  // Advanced fields toggle
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [description, setDescription] = useState('');
  const [completionCriteria, setCompletionCriteria] = useState('');
  const [milestoneId, setMilestoneId] = useState('');
  const [waitingReason, setWaitingReason] = useState('');
  const [waitingType, setWaitingType] = useState<WaitingType | ''>('');
  const [aiInstructions, setAiInstructions] = useState('');
  const [aiExpectedOutput, setAiExpectedOutput] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const currentProject = projects.find((p) => p.id === projectId);
  const eligiblePrereqs = allTasks.filter((t) => t.projectId === projectId);
  const selectedWorker = workers.find((w) => w.id === workerId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !projectId) {
      setError('Task title and project are required.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          title: title.trim(),
          description: description.trim() || null,
          completionCriteria: completionCriteria.trim() || null,
          priority,
          workerId: workerId || null,
          milestoneId: milestoneId || null,
          estimatedDuration: estimatedDuration ? parseInt(estimatedDuration, 10) : null,
          deadline: deadline || null,
          dependencies: selectedDependencies,
          waitingReason: waitingReason.trim() || null,
          waitingType: waitingType || null,
          aiInstructions: aiInstructions.trim() || null,
          aiExpectedOutput: aiExpectedOutput.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create task');

      // Reset
      setTitle('');
      setDescription('');
      setCompletionCriteria('');
      setEstimatedDuration('');
      setDeadline('');
      setSelectedDependencies([]);
      setShowAdvanced(false);

      onTaskCreated();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleDependency = (taskId: string) => {
    if (selectedDependencies.includes(taskId)) {
      setSelectedDependencies(selectedDependencies.filter((id) => id !== taskId));
    } else {
      setSelectedDependencies([...selectedDependencies, taskId]);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-950/60">
          <div>
            <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-400" /> Create Task (SMART Framework)
            </h2>
            <p className="text-xs text-zinc-400">
              Start time is automatically derived from completed dependencies.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mx-6 mt-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-center gap-2 text-rose-400 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Row 1: Project & Assignee */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">
                Project *
              </label>
              <select
                value={projectId}
                onChange={(e) => {
                  setProjectId(e.target.value);
                  setSelectedDependencies([]);
                }}
                required
                className="w-full bg-zinc-950 border border-zinc-700 text-zinc-200 text-sm rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">
                Who does it? (Assignee / AI)
              </label>
              <select
                value={workerId}
                onChange={(e) => setWorkerId(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700 text-zinc-200 text-sm rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                <option value="">Unassigned</option>
                {workers.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.type === WorkerType.AI_AGENT ? 'AI Agent' : w.type}) [Limit: {w.wipLimit}]
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Task Name */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">
              Task Name (Specific) *
            </label>
            <input
              type="text"
              placeholder="e.g. Build authentication API or Research 20 competitors"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full bg-zinc-950 border border-zinc-700 text-zinc-100 text-sm rounded-lg px-3.5 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none placeholder-zinc-600"
            />
          </div>

          {/* Priority & Duration & Deadline */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className="w-full bg-zinc-950 border border-zinc-700 text-zinc-200 text-sm rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                <option value={Priority.CRITICAL}>🔥 Critical</option>
                <option value={Priority.HIGH}>⚡ High</option>
                <option value={Priority.MEDIUM}>🔹 Medium</option>
                <option value={Priority.LOW}>☕ Low</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">
                Est. Duration (Minutes)
              </label>
              <input
                type="number"
                placeholder="e.g. 45"
                value={estimatedDuration}
                onChange={(e) => setEstimatedDuration(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700 text-zinc-200 text-sm rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none placeholder-zinc-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">
                Target Deadline
              </label>
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700 text-zinc-200 text-sm rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Depends on (Prerequisites) */}
          <div className="border border-zinc-800 rounded-lg p-3.5 bg-zinc-950/50">
            <label className="block text-xs font-semibold uppercase tracking-wider text-indigo-400 mb-1.5">
              Depends On (Prerequisites - Finish-to-Start)
            </label>
            <p className="text-xs text-zinc-500 mb-2.5">
              Select tasks that must finish before this task becomes READY.
            </p>

            {eligiblePrereqs.length === 0 ? (
              <p className="text-xs text-zinc-600 italic">No existing tasks in this project yet.</p>
            ) : (
              <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                {eligiblePrereqs.map((t) => {
                  const checked = selectedDependencies.includes(t.id);
                  return (
                    <label
                      key={t.id}
                      className={`flex items-center justify-between p-2 rounded cursor-pointer text-xs border transition ${
                        checked
                          ? 'bg-indigo-500/10 border-indigo-500/40 text-indigo-200'
                          : 'bg-zinc-900/80 border-zinc-800 text-zinc-300 hover:bg-zinc-800'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleDependency(t.id)}
                          className="rounded border-zinc-700 text-indigo-600 focus:ring-0"
                        />
                        <span className="font-medium">{t.title}</span>
                      </div>
                      <span className="text-[10px] uppercase font-mono text-zinc-500">[{t.status}]</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* Advanced collapsible section */}
          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200 transition py-1"
            >
              {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              {showAdvanced ? 'Hide Advanced SMART Fields' : 'Show Advanced SMART Fields (Done criteria, AI instructions, milestones)'}
            </button>

            {showAdvanced && (
              <div className="mt-3 space-y-4 pt-3 border-t border-zinc-800">
                {/* Measurable: Done When */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-emerald-400 mb-1">
                    Done When (Measurable Completion Criteria)
                  </label>
                  <input
                    type="text"
                    placeholder='e.g. "Authentication works with Google and email and passes unit tests."'
                    value={completionCriteria}
                    onChange={(e) => setCompletionCriteria(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-700 text-zinc-200 text-sm rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none placeholder-zinc-600"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">
                    Description & Context
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Provide additional details or requirements..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-700 text-zinc-200 text-sm rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none placeholder-zinc-600"
                  />
                </div>

                {/* Milestone */}
                {currentProject?.milestones && currentProject.milestones.length > 0 && (
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">
                      Milestone
                    </label>
                    <select
                      value={milestoneId}
                      onChange={(e) => setMilestoneId(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-700 text-zinc-200 text-sm rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    >
                      <option value="">No milestone</option>
                      {currentProject.milestones.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* AI Worker specific inputs */}
                {selectedWorker?.type === WorkerType.AI_AGENT && (
                  <div className="p-3.5 rounded-lg bg-purple-500/10 border border-purple-500/30 space-y-3">
                    <span className="text-xs font-semibold uppercase tracking-wider text-purple-400 block">
                      AI Agent Execution Spec
                    </span>
                    <div>
                      <label className="block text-[11px] text-purple-300 mb-1">Prompt / Instructions</label>
                      <textarea
                        rows={2}
                        placeholder="Instructions for the autonomous agent..."
                        value={aiInstructions}
                        onChange={(e) => setAiInstructions(e.target.value)}
                        className="w-full bg-zinc-950 border border-purple-500/30 text-zinc-200 text-xs rounded px-3 py-2 focus:ring-1 focus:ring-purple-400"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-purple-300 mb-1">Expected Deliverable</label>
                      <input
                        type="text"
                        placeholder="e.g. Clean TypeScript route handler passing tests"
                        value={aiExpectedOutput}
                        onChange={(e) => setAiExpectedOutput(e.target.value)}
                        className="w-full bg-zinc-950 border border-purple-500/30 text-zinc-200 text-xs rounded px-3 py-1.5 focus:ring-1 focus:ring-purple-400"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer CTA */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !title.trim()}
              className="flex items-center gap-2 px-5 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg transition shadow-lg shadow-indigo-600/20"
            >
              {loading ? 'Creating...' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
