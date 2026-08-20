'use client';

import React, { useState } from 'react';
import { X, Bot, User, Users, Shield, Plus, Check } from 'lucide-react';
import { WorkerType } from '@prisma/client';

interface WorkerManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  workers: any[];
  onWorkersUpdated: () => void;
}

export default function WorkerManagerModal({
  isOpen,
  onClose,
  workers,
  onWorkersUpdated,
}: WorkerManagerModalProps) {
  const [name, setName] = useState('');
  const [type, setType] = useState<WorkerType>(WorkerType.AI_AGENT);
  const [wipLimit, setWipLimit] = useState(2);
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editWipLimit, setEditWipLimit] = useState<number>(2);

  if (!isOpen) return null;

  const handleCreateWorker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/workers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          type,
          wipLimit,
          description: description.trim() || null,
        }),
      });
      if (res.ok) {
        setName('');
        setDescription('');
        setWipLimit(2);
        onWorkersUpdated();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateWipLimit = async (workerId: string) => {
    try {
      const res = await fetch('/api/workers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: workerId, wipLimit: editWipLimit }),
      });
      if (res.ok) {
        setEditingId(null);
        onWorkersUpdated();
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-950/60">
          <div>
            <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2">
              <Bot className="w-5 h-5 text-indigo-400" /> Workers & Work-In-Progress (WIP) Limits
            </h2>
            <p className="text-xs text-zinc-400">
              Control active task limits for Humans and AI Agents to prevent overload.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* Workers List */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Active Workers ({workers.length})
            </h3>

            <div className="space-y-2">
              {workers.map((w) => (
                <div
                  key={w.id}
                  className="flex items-center justify-between p-3.5 rounded-xl bg-zinc-950 border border-zinc-800"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-2 rounded-lg ${
                        w.type === WorkerType.AI_AGENT
                          ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                          : w.type === WorkerType.ME
                          ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                          : 'bg-zinc-800 text-zinc-300'
                      }`}
                    >
                      {w.type === WorkerType.AI_AGENT ? (
                        <Bot className="w-4 h-4" />
                      ) : (
                        <User className="w-4 h-4" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-zinc-100">{w.name}</span>
                        <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-400 border border-zinc-800">
                          {w.type}
                        </span>
                      </div>
                      {w.description && (
                        <p className="text-xs text-zinc-400 mt-0.5">{w.description}</p>
                      )}
                    </div>
                  </div>

                  {/* WIP limits and active task counts */}
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-xs font-mono text-zinc-300">
                        Active:{' '}
                        <span
                          className={`font-bold ${
                            w.isAtCapacity ? 'text-amber-400' : 'text-emerald-400'
                          }`}
                        >
                          {w.activeTasksCount || 0}
                        </span>{' '}
                        / Limit: {w.wipLimit}
                      </div>
                      {w.isAtCapacity && (
                        <span className="text-[10px] text-amber-400 font-semibold">Capacity Full</span>
                      )}
                    </div>

                    {editingId === w.id ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={1}
                          max={10}
                          value={editWipLimit}
                          onChange={(e) => setEditWipLimit(parseInt(e.target.value, 10))}
                          className="w-14 bg-zinc-900 border border-zinc-700 text-zinc-100 text-xs rounded px-2 py-1"
                        />
                        <button
                          onClick={() => handleUpdateWipLimit(w.id)}
                          className="p-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setEditingId(w.id);
                          setEditWipLimit(w.wipLimit);
                        }}
                        className="text-xs text-indigo-400 hover:underline"
                      >
                        Edit Limit
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Add New Worker Form */}
          <form
            onSubmit={handleCreateWorker}
            className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800 space-y-4"
          >
            <h3 className="text-xs font-semibold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
              <Plus className="w-4 h-4" /> Add New Worker
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Name</label>
                <input
                  type="text"
                  placeholder="e.g. OpenAI o3, DeepSeek, QA Lead"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Type</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as WorkerType)}
                  className="w-full bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-indigo-500"
                >
                  <option value={WorkerType.AI_AGENT}>AI Agent</option>
                  <option value={WorkerType.ME}>Me</option>
                  <option value={WorkerType.TEAM_MEMBER}>Team Member</option>
                  <option value={WorkerType.EXTERNAL_PARTY}>External Party</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">WIP Limit (Max Active)</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={wipLimit}
                  onChange={(e) => setWipLimit(parseInt(e.target.value, 10))}
                  required
                  className="w-full bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] text-zinc-400 mb-1">Description (Optional)</label>
              <input
                type="text"
                placeholder="e.g. Specialized in data science and scraping"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold rounded-lg transition"
            >
              {loading ? 'Creating...' : 'Register Worker'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
