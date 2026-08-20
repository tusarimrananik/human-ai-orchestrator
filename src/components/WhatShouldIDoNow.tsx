'use client';

import React from 'react';
import {
  Sparkles,
  Play,
  CheckCircle2,
  Clock,
  Bot,
  User,
  ShieldAlert,
  Layers,
  ChevronRight,
  Hourglass,
  Lock,
} from 'lucide-react';
import { TaskStatus, WorkerType } from '@prisma/client';
import { EnrichedTask } from '@/lib/engine';

interface WhatShouldIDoNowProps {
  primaryRecommendation: EnrichedTask | null;
  otherReadyTasks: EnrichedTask[];
  aiWorkingTasks: EnrichedTask[];
  waitingTasks: EnrichedTask[];
  blockedTasks: EnrichedTask[];
  isUserGenuinelyBlocked: boolean;
  onOpenTask: (taskId: string) => void;
  onStatusChange: (taskId: string, newStatus: TaskStatus) => void;
}

export default function WhatShouldIDoNow({
  primaryRecommendation,
  otherReadyTasks,
  aiWorkingTasks,
  waitingTasks,
  blockedTasks,
  isUserGenuinelyBlocked,
  onOpenTask,
  onStatusChange,
}: WhatShouldIDoNowProps) {
  const formatDuration = (min: number | null | undefined) => {
    if (!min) return null;
    if (min < 60) return `${min}m`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  };

  const formatStartedTime = (startedAt: Date | string | null | undefined) => {
    if (!startedAt) return 'Just started';
    const diff = Math.floor((Date.now() - new Date(startedAt).getTime()) / (1000 * 60));
    if (diff < 1) return 'Just started';
    if (diff < 60) return `${diff}m ago`;
    return `${Math.floor(diff / 60)}h ${diff % 60}m ago`;
  };

  return (
    <div className="h-full flex flex-col gap-3">
      {/* 1. HERO: WHAT SHOULD I DO NOW? */}
      <div className="rounded-xl bg-gradient-to-br from-indigo-950/30 via-zinc-900 to-zinc-950 border border-indigo-500/30 p-3.5 shadow-xl flex-shrink-0">
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2 mb-2.5">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-white">
                WHAT SHOULD I DO NOW?
              </h2>
              <p className="text-[10px] text-zinc-400">
                Optimal task recommendation based on dependency unlocks & priority
              </p>
            </div>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
            ⚡ Zero guess start dates
          </span>
        </div>

        {/* Primary Recommendation Card */}
        {primaryRecommendation ? (
          <div className="bg-zinc-950/80 border border-indigo-500/40 rounded-lg p-3 shadow">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-1 min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-red-500/20 text-red-400 border border-red-500/30">
                    {primaryRecommendation.priority}
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-900 text-zinc-300">
                    {primaryRecommendation.projectName}
                  </span>
                  {primaryRecommendation.estimatedDuration && (
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5" /> {formatDuration(primaryRecommendation.estimatedDuration)}
                    </span>
                  )}
                  {primaryRecommendation.unlocksTotalCount ? (
                    <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                      <Layers className="w-2.5 h-2.5" /> Unlocks: {primaryRecommendation.unlocksTotalCount} tasks
                    </span>
                  ) : null}
                </div>

                <h3
                  onClick={() => onOpenTask(primaryRecommendation.id)}
                  className="text-sm font-bold text-white hover:text-indigo-400 transition cursor-pointer truncate"
                >
                  {primaryRecommendation.title}
                </h3>

                {primaryRecommendation.completionCriteria && (
                  <div className="text-[11px] text-emerald-400/90 truncate">
                    <span className="font-semibold">Done when:</span> {primaryRecommendation.completionCriteria}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  onClick={() => onStatusChange(primaryRecommendation.id, TaskStatus.IN_PROGRESS)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition"
                >
                  <Play className="w-3 h-3 fill-white" /> Start
                </button>
                <button
                  onClick={() => onStatusChange(primaryRecommendation.id, TaskStatus.DONE)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/40 text-xs font-medium transition"
                >
                  <CheckCircle2 className="w-3 h-3" /> Done
                </button>
                <button
                  onClick={() => onOpenTask(primaryRecommendation.id)}
                  className="p-1.5 rounded-md bg-zinc-900 hover:bg-zinc-800 text-zinc-300 transition"
                  title="View details"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ) : isUserGenuinelyBlocked ? (
          <div className="bg-rose-950/20 border border-rose-500/30 rounded-lg p-2.5 text-center flex items-center justify-center gap-2 text-rose-300 text-xs">
            <ShieldAlert className="w-4 h-4 text-rose-400 flex-shrink-0" />
            <span>YOU ARE CURRENTLY BLOCKED: Remaining work is waiting on active AI runs or external events.</span>
          </div>
        ) : (
          <div className="bg-zinc-950/40 border border-zinc-800 rounded-lg p-2 text-center text-zinc-400 text-xs">
            🎉 All active tasks are completed!
          </div>
        )}
      </div>

      {/* 2. OTHER AVAILABLE TASKS YOU CAN WORK ON */}
      {otherReadyTasks.length > 0 && (
        <div className="flex-shrink-0">
          <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5 flex items-center justify-between">
            <span>Other Available Tasks ({otherReadyTasks.length})</span>
            <span className="text-zinc-500">Unblocked & Ready</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
            {otherReadyTasks.slice(0, 4).map((t) => (
              <div
                key={t.id}
                onClick={() => onOpenTask(t.id)}
                className="group p-2 rounded-lg bg-zinc-900/80 hover:bg-zinc-800/90 border border-zinc-800 hover:border-zinc-700 transition cursor-pointer flex flex-col justify-between space-y-1"
              >
                <div className="flex items-center justify-between gap-1 text-[10px]">
                  <span className="font-mono text-zinc-400 truncate max-w-[100px]">{t.projectName}</span>
                  {t.worker && (
                    <span className="text-zinc-400 flex items-center gap-0.5">
                      {t.worker.type === WorkerType.AI_AGENT ? (
                        <Bot className="w-2.5 h-2.5 text-purple-400" />
                      ) : (
                        <User className="w-2.5 h-2.5 text-zinc-400" />
                      )}
                      {t.worker.name}
                    </span>
                  )}
                </div>
                <h5 className="text-xs font-semibold text-zinc-200 group-hover:text-white transition truncate">
                  {t.title}
                </h5>
                <div className="flex items-center justify-between text-[10px] text-zinc-500 pt-0.5">
                  <span>{formatDuration(t.estimatedDuration) || '—'}</span>
                  {t.unlocksTotalCount ? (
                    <span className="text-emerald-400 font-medium">Unlocks {t.unlocksTotalCount}</span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. THREE PARALLEL STATUS COLUMNS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 flex-1 min-h-0">
        {/* AI WORKING SECTION */}
        <div className="bg-zinc-900/40 border border-purple-500/20 rounded-lg p-2.5 flex flex-col min-h-0">
          <div className="flex items-center justify-between pb-1.5 border-b border-zinc-800/80 flex-shrink-0">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
              <Bot className="w-3.5 h-3.5 text-purple-400" /> AI Working ({aiWorkingTasks.length})
            </h3>
            <span className="text-[9px] font-mono text-purple-400/80 bg-purple-500/10 px-1.5 py-0.2 rounded">
              Autonomous
            </span>
          </div>

          <div className="space-y-1.5 pt-2 overflow-y-auto flex-1">
            {aiWorkingTasks.length === 0 ? (
              <p className="text-[11px] text-zinc-500 italic py-2 text-center">No AI agents active</p>
            ) : (
              aiWorkingTasks.map((t) => (
                <div
                  key={t.id}
                  onClick={() => onOpenTask(t.id)}
                  className="p-2 rounded bg-zinc-950/80 border border-purple-500/20 hover:border-purple-500/40 transition cursor-pointer space-y-1"
                >
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="font-bold text-purple-300">{t.worker?.name || 'AI'}</span>
                    <span className="text-zinc-500 font-mono flex items-center gap-0.5">
                      <Clock className="w-2.5 h-2.5 text-purple-400" />
                      {formatStartedTime(t.actualStartedAt)}
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-zinc-200 truncate">{t.title}</div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* WAITING SECTION */}
        <div className="bg-zinc-900/40 border border-amber-500/20 rounded-lg p-2.5 flex flex-col min-h-0">
          <div className="flex items-center justify-between pb-1.5 border-b border-zinc-800/80 flex-shrink-0">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
              <Hourglass className="w-3.5 h-3.5 text-amber-400" /> Waiting ({waitingTasks.length})
            </h3>
            <span className="text-[9px] font-mono text-amber-400/80 bg-amber-500/10 px-1.5 py-0.2 rounded">
              External
            </span>
          </div>

          <div className="space-y-1.5 pt-2 overflow-y-auto flex-1">
            {waitingTasks.length === 0 ? (
              <p className="text-[11px] text-zinc-500 italic py-2 text-center">No waiting tasks</p>
            ) : (
              waitingTasks.map((t) => (
                <div
                  key={t.id}
                  onClick={() => onOpenTask(t.id)}
                  className="p-2 rounded bg-zinc-950/80 border border-amber-500/20 hover:border-amber-500/40 transition cursor-pointer space-y-0.5"
                >
                  <div className="text-xs font-semibold text-zinc-200 truncate">{t.title}</div>
                  <div className="text-[10px] text-amber-300/90 truncate">
                    For: {t.waitingReason || 'External dependency'}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* BLOCKED DIAGNOSTICS SECTION */}
        <div className="bg-zinc-900/40 border border-rose-500/20 rounded-lg p-2.5 flex flex-col min-h-0">
          <div className="flex items-center justify-between pb-1.5 border-b border-zinc-800/80 flex-shrink-0">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-rose-400" /> Blocked Tasks ({blockedTasks.length})
            </h3>
            <span className="text-[9px] font-mono text-rose-400/80 bg-rose-500/10 px-1.5 py-0.2 rounded">
              Unsatisfied
            </span>
          </div>

          <div className="space-y-1.5 pt-2 overflow-y-auto flex-1">
            {blockedTasks.length === 0 ? (
              <p className="text-[11px] text-zinc-500 italic py-2 text-center">No blocked tasks</p>
            ) : (
              blockedTasks.slice(0, 5).map((t) => (
                <div
                  key={t.id}
                  onClick={() => onOpenTask(t.id)}
                  className="p-2 rounded bg-zinc-950/80 border border-rose-500/20 hover:border-rose-500/40 transition cursor-pointer space-y-0.5"
                >
                  <div className="text-xs font-semibold text-zinc-200 truncate">{t.title}</div>
                  <div className="text-[10px] text-rose-400/90 truncate">
                    Blocked by: {t.dependencies?.map((d: any) => d.dependsOnTask.title).join(', ') || 'Prerequisites'}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
