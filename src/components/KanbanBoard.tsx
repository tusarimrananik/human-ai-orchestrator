'use client';

import React from 'react';
import {
  Clock,
  CheckCircle2,
  Bot,
  User,
  Lock,
  Hourglass,
} from 'lucide-react';
import { TaskStatus, Priority, WorkerType } from '@prisma/client';

interface KanbanBoardProps {
  tasks: any[];
  onOpenTask: (taskId: string) => void;
  onStatusChange: (taskId: string, newStatus: TaskStatus) => void;
  workers: any[];
}

const COLUMNS: Array<{ id: TaskStatus; label: string; color: string }> = [
  { id: TaskStatus.BACKLOG, label: 'Backlog', color: 'text-zinc-400' },
  { id: TaskStatus.BLOCKED, label: 'Blocked', color: 'text-rose-400' },
  { id: TaskStatus.READY, label: 'Ready', color: 'text-emerald-400' },
  { id: TaskStatus.IN_PROGRESS, label: 'In Progress', color: 'text-blue-400' },
  { id: TaskStatus.WAITING, label: 'Waiting', color: 'text-amber-400' },
  { id: TaskStatus.REVIEW, label: 'Review', color: 'text-purple-400' },
  { id: TaskStatus.DONE, label: 'Done', color: 'text-green-400' },
];

export default function KanbanBoard({
  tasks,
  onOpenTask,
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
    <div className="h-full flex gap-2 overflow-x-auto select-none min-h-0 pb-1">
      {COLUMNS.map((col) => {
        const columnTasks = getTasksByStatus(col.id);

        return (
          <div
            key={col.id}
            className="flex-1 min-w-[170px] bg-zinc-900/40 rounded-lg border border-zinc-800/80 flex flex-col min-h-0"
          >
            {/* Column Header */}
            <div className="px-2.5 py-1.5 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-950/60 rounded-t-lg flex-shrink-0">
              <span className={`text-[11px] font-bold uppercase tracking-wider ${col.color}`}>
                {col.label}
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-zinc-800 text-zinc-300">
                {columnTasks.length}
              </span>
            </div>

            {/* Column Tasks List */}
            <div className="p-1.5 space-y-1.5 overflow-y-auto flex-1">
              {columnTasks.length === 0 ? (
                <div className="py-6 text-center text-[10px] text-zinc-600 italic">
                  Empty
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
                      className="group p-2 rounded-lg bg-zinc-950/80 hover:bg-zinc-900 border border-zinc-800/90 hover:border-zinc-700 transition cursor-pointer shadow-sm space-y-1"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[9px] font-mono text-zinc-400 truncate max-w-[80px]">
                          {t.project?.name || t.projectName}
                        </span>
                        <span
                          className={`text-[9px] font-bold px-1 py-0.2 rounded border ${getPriorityBadgeClass(
                            t.priority
                          )}`}
                        >
                          {t.priority}
                        </span>
                      </div>

                      <h4 className="text-xs font-semibold text-zinc-200 group-hover:text-white transition leading-tight line-clamp-2">
                        {t.title}
                      </h4>

                      {col.id === TaskStatus.BLOCKED && hasUnfinishedPrereqs && (
                        <div className="text-[9px] text-rose-400/90 flex items-center gap-1 bg-rose-500/10 p-1 rounded border border-rose-500/20 truncate">
                          <Lock className="w-2.5 h-2.5 flex-shrink-0" />
                          <span className="truncate">
                            Blocked by:{' '}
                            {t.dependencies
                              .filter((d: any) => d.dependsOnTask.status !== TaskStatus.DONE)
                              .map((d: any) => d.dependsOnTask.title)
                              .join(', ')}
                          </span>
                        </div>
                      )}

                      {col.id === TaskStatus.WAITING && t.waitingReason && (
                        <div className="text-[9px] text-amber-400/90 flex items-center gap-1 bg-amber-500/10 p-1 rounded border border-amber-500/20 truncate">
                          <Hourglass className="w-2.5 h-2.5 flex-shrink-0" />
                          <span className="truncate">{t.waitingReason}</span>
                        </div>
                      )}

                      <div className="flex items-center justify-between text-[10px] text-zinc-500 pt-1 border-t border-zinc-900/80">
                        <span className="flex items-center gap-1 text-zinc-400 truncate">
                          {t.worker ? (
                            <>
                              {t.worker.type === WorkerType.AI_AGENT ? (
                                <Bot className="w-2.5 h-2.5 text-purple-400" />
                              ) : (
                                <User className="w-2.5 h-2.5 text-zinc-400" />
                              )}
                              <span className="truncate max-w-[65px]">{t.worker.name}</span>
                            </>
                          ) : (
                            <span className="text-zinc-600 italic">None</span>
                          )}
                        </span>

                        {t.estimatedDuration ? (
                          <span className="flex items-center gap-0.5 font-mono text-[9px]">
                            <Clock className="w-2.5 h-2.5" /> {t.estimatedDuration}m
                          </span>
                        ) : null}
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
