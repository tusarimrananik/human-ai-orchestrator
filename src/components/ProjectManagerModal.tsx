'use client';

import React, { useState } from 'react';
import { X, FolderPlus, Plus, Trash2, Calendar, Target } from 'lucide-react';

interface ProjectManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProjectCreated: (newProjectId: string) => void;
}

export default function ProjectManagerModal({
  isOpen,
  onClose,
  onProjectCreated,
}: ProjectManagerModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState('');
  const [milestones, setMilestones] = useState<Array<{ name: string; description: string }>>([
    { name: 'Planning', description: 'Requirements & initial specs' },
    { name: 'MVP Build', description: 'Core feature development' },
    { name: 'Launch & QA', description: 'Testing, verification and deployment' },
  ]);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleAddMilestone = () => {
    setMilestones([...milestones, { name: '', description: '' }]);
  };

  const handleRemoveMilestone = (index: number) => {
    setMilestones(milestones.filter((_, i) => i !== index));
  };

  const handleMilestoneChange = (index: number, field: 'name' | 'description', value: string) => {
    const updated = [...milestones];
    updated[index][field] = value;
    setMilestones(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);

    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          deadline: deadline || null,
          milestones: milestones.filter((m) => m.name.trim().length > 0),
        }),
      });

      const data = await res.json();
      if (res.ok && data.project) {
        setName('');
        setDescription('');
        setDeadline('');
        onProjectCreated(data.project.id);
        onClose();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-xl bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden my-8">
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-950/60">
          <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2">
            <FolderPlus className="w-5 h-5 text-indigo-400" /> Create New Project
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">
              Project Name *
            </label>
            <input
              type="text"
              placeholder="e.g. AI Customer Support Agent, Q4 Growth Sprint"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full bg-zinc-950 border border-zinc-700 text-zinc-200 text-sm rounded-lg px-3.5 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">
              Description
            </label>
            <textarea
              rows={2}
              placeholder="Project goals, objectives, and success criteria..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-700 text-zinc-200 text-sm rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">
              Target Completion Deadline (Optional)
            </label>
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-700 text-zinc-200 text-sm rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          {/* Milestones */}
          <div className="border border-zinc-800 rounded-lg p-3.5 bg-zinc-950/40 space-y-3">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5" /> Initial Project Milestones
              </label>
              <button
                type="button"
                onClick={handleAddMilestone}
                className="text-[11px] text-indigo-400 hover:underline flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Add Milestone
              </button>
            </div>

            <div className="space-y-2">
              {milestones.map((m, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder={`Milestone ${idx + 1} Name`}
                    value={m.name}
                    onChange={(e) => handleMilestoneChange(idx, 'name', e.target.value)}
                    className="flex-1 bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs rounded px-2.5 py-1.5"
                  />
                  <input
                    type="text"
                    placeholder="Short description"
                    value={m.description}
                    onChange={(e) => handleMilestoneChange(idx, 'description', e.target.value)}
                    className="flex-1 bg-zinc-900 border border-zinc-700 text-zinc-400 text-xs rounded px-2.5 py-1.5"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveMilestone(idx)}
                    className="text-zinc-600 hover:text-rose-400 p-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

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
              disabled={loading || !name.trim()}
              className="px-5 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg transition"
            >
              {loading ? 'Creating...' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
