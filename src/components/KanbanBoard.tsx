'use client';

import React from 'react';
import {
  Clock,
  CheckCircle2,
  AlertCircle,
  Play,
  Bot,
  User,
  Layers,
  Lock,
  Hourglass,
  Sparkles,
  AlertTriangle,
} from 'lucide-react';
import { TaskStatus, Priority, WorkerType } from '@prisma/client';

interface KanbanBoardProps {
  tasks: any[];
  onOpenTask: (taskId: string) => void;
  onStatusChange: (taskId: string, newStatus: TaskStatus) => void;
  workers: any[];
}

const COLUMNS: Array<{ id: TaskStatus; label: string; color: string; bg: string }> = [
  { id: TaskStatus.BACKLOG, label: 'Backlog', color: 'text-zinc-400', bg: 'border-zinc-800' },
  { id: TaskStatus.BLOCKED, label: 'Blocked', color: 'text-rose-400', bg: 'border-rose-500/20' },
  { id: TaskStatus.READY, label: 'Ready', color: 'text-emerald-400', bg: 'border-emerald-500/20' },
  { id: TaskStatus.IN_PROGRESS, label: 'In Progress', color: 'text-blue-400', bg: 'border-blue-500/20' },
  { id: TaskStatus.WAITING, label: 'Waiting', color: 'text-amber-400', bg: 'border-amber-500/20' },
  { id: TaskStatus.REVIEW, label: 'Review', color: 'text-purple-400', bg: 'border-purple-500/20' },
  { id: TaskStatus.DONE, label: 'Done', color: 'text-green-400', bg: 'border-green-500/20' },
];

export default function KanbanBoard({
  tasks,
  onOpenTask,
  onStatusChange,
  workers,
}: KanbanBoardProps) {
  const getTasksByStatus = (status: TaskStatus) => {
    return tasks.filter((t) => t.status === status);
  };

  const getPriorityBadgeClass = (priority: Priority) => {
    switch (priority) {
      case Priority.CRITICAL:
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      case Priority.HIGH:
        return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case Priority.MEDIUM:
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case Priority.LOW:
        return 'bg-zinc-800 text-zinc-400 border-zinc-700';
    }
  };

  return (
    <div className="flex gap-4 overflow-x-auto pb-6 pt-2 select-none min-h-[70vh]">
      {COLUMNS.map((col) => {
        const columnTasks = getTasksByStatus(col.id);

        return (
          <div
            key={col.id}
            className="flex-shrink-0 w-80 bg-zinc-900/50 rounded-xl border border-zinc-800 flex flex-col max-h-[80vh]"
          >
            {/* Column Header */}
            <div className={`px-4 py-3 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/40 rounded-t-xl`}>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-bold uppercase tracking-wider ${col.color}`}>
                  {col.label}
                </span>
                <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300">
                  {columnTasks.length}
                </span>
              </div>
            </div>

            {/* Column Tasks List */}
            <div className="p-3 space-y-3 overflow-y-auto flex-1">
              {columnTasks.length === 0 ? (
                <div className="py-8 text-center text-xs text-zinc-600 italic">
                  No {col.label.toLowerCase()} tasks
                </div>
              ) : (
                columnTasks.map((t) => {
                  const hasUnfinishedPrereqs =
                    t.dependencies &&
                    t.dependencies.some((d: any) => d.dependsOnTask.status !== TaskStatus.DONE);

                  return (
                    <div
                      key={t.id}
                      onClick={() => onOpenTask(t.id)}
                      className="group p-3.5 rounded-xl bg-zinc-950/80 hover:bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition cursor-pointer shadow-sm space-y-2.5"
                    >
                      {/* Top row: project & priority */}
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-400 border border-zinc-800 truncate max-w-[120px]">
                          {t.project?.name || t.projectName}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {t.isWorkerAtCapacity && col.id === TaskStatus.READY && (
                            <span
                              className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20"
                              title="Worker capacity is currently full (waiting for WIP capacity)"
                            >
                              Capacity Full
                            </span>
                          )}
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${getPriorityBadgeClass(
                              t.priority
                            )}`}
                          >
                            {t.priority}
                          </span>
                        </div>
                      </div>

                      {/* Title */}
                      <h4 className="text-sm font-semibold text-zinc-200 group-hover:text-white transition leading-snug">
                        {t.title}
                      </h4>

                      {/* Blocked reason hint if in BLOCKED column */}
                      {col.id === TaskStatus.BLOCKED && hasUnfinishedPrereqs && (
                        <div className="text-[11px] text-rose-400/90 flex items-center gap-1 bg-rose-500/10 p-1.5 rounded border border-rose-500/20">
                          <Lock className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">
                            Blocked by:{' '}
                            {t.dependencies
                              .filter((d: any) => d.dependsOnTask.status !== TaskStatus.DONE)
                              .map((d: any) => d.dependsOnTask.title)
                              .join(', ')}
                          </span>
                        </div>
                      )}

                      {/* Waiting reason if in WAITING column */}
                      {col.id === TaskStatus.WAITING && t.waitingReason && (
                        <div className="text-[11px] text-amber-400/90 flex items-center gap-1 bg-amber-500/10 p-1.5 rounded border border-amber-500/20">
                          <Hourglass className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">{t.waitingReason}</span>
                        </div>
                      )}

                      {/* Footer: Worker & Duration */}
                      <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-1.5 border-t border-zinc-900">
                        <div className="flex items-center gap-1.5">
                          {t.worker ? (
                            <span className="flex items-center gap-1 text-zinc-300 font-medium">
                              {t.worker.type === WorkerType.AI_AGENT ? (
                                <Bot className="w-3 h-3 text-purple-400" />
                              ) : (
                                <User className="w-3 h-3 text-zinc-400" />
                              )}
                              {t.worker.name}
                            </span>
                          ) : (
                            <span className="text-zinc-600 italic">Unassigned</span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 font-mono">
                          {t.estimatedDuration && (
                            <span className="flex items-center gap-0.5">
                              <Clock className="w-3 h-3" /> {t.estimatedDuration}m
                            </span>
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
  );
}
