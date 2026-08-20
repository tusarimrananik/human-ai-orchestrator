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
  ArrowRight,
  AlertTriangle,
  Lock,
  Hourglass,
  Layers,
  ChevronRight,
} from 'lucide-react';
import { TaskStatus, Priority, WorkerType } from '@prisma/client';
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
    if (diff < 60) return `Started ${diff}m ago`;
    return `Started ${Math.floor(diff / 60)}h ${diff % 60}m ago`;
  };

  return (
    <div className="space-y-6">
      {/* 1. HERO: WHAT SHOULD I DO NOW? */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-950/40 via-zinc-900 to-zinc-950 border border-indigo-500/30 p-6 shadow-2xl">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800/80 pb-4 mb-5">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
                WHAT SHOULD I DO NOW?
              </h2>
              <p className="text-xs text-zinc-400">
                Calculated optimal task based on dependency unlocks, critical path & priority
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="px-2.5 py-1 rounded-md bg-zinc-800 text-zinc-300 border border-zinc-700">
              ⚡ Zero guess start dates
            </span>
          </div>
        </div>

        {/* Primary Recommendation Card or Genuinely Blocked State */}
        {primaryRecommendation ? (
          <div className="bg-zinc-900/90 border border-indigo-500/40 rounded-xl p-5 shadow-lg">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-2 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold px-2 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30">
                    {primaryRecommendation.priority} PRIORITY
                  </span>
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                    {primaryRecommendation.projectName}
                  </span>
                  {primaryRecommendation.estimatedDuration && (
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {formatDuration(primaryRecommendation.estimatedDuration)}
                    </span>
                  )}
                  {primaryRecommendation.unlocksTotalCount ? (
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                      <Layers className="w-3 h-3" /> Unlocks: {primaryRecommendation.unlocksTotalCount} tasks
                    </span>
                  ) : null}
                </div>

                <h3
                  onClick={() => onOpenTask(primaryRecommendation.id)}
                  className="text-xl font-bold text-white hover:text-indigo-400 transition cursor-pointer"
                >
                  {primaryRecommendation.title}
                </h3>

                {primaryRecommendation.description && (
                  <p className="text-sm text-zinc-400 line-clamp-2 max-w-2xl">
                    {primaryRecommendation.description}
                  </p>
                )}

                {primaryRecommendation.completionCriteria && (
                  <div className="text-xs text-emerald-400/90 flex items-start gap-1.5 pt-1">
                    <span className="font-semibold uppercase tracking-wider">Done when:</span>
                    <span>{primaryRecommendation.completionCriteria}</span>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2.5 flex-shrink-0 pt-2 lg:pt-0">
                <button
                  onClick={() => onStatusChange(primaryRecommendation.id, TaskStatus.IN_PROGRESS)}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition shadow-lg shadow-indigo-600/30"
                >
                  <Play className="w-4 h-4 fill-white" /> Start Working
                </button>
                <button
                  onClick={() => onStatusChange(primaryRecommendation.id, TaskStatus.DONE)}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/40 text-sm font-medium transition"
                >
                  <CheckCircle2 className="w-4 h-4" /> Done
                </button>
                <button
                  onClick={() => onOpenTask(primaryRecommendation.id)}
                  className="p-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition"
                  title="View full task details"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        ) : isUserGenuinelyBlocked ? (
          <div className="bg-rose-950/30 border border-rose-500/40 rounded-xl p-6 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center mx-auto">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-rose-300">YOU ARE CURRENTLY BLOCKED</h3>
              <p className="text-xs text-rose-400/80 max-w-md mx-auto mt-1">
                You have no available ready tasks because all remaining work depends on active AI runs or external waiting items.
              </p>
            </div>
            {aiWorkingTasks.length > 0 && (
              <div className="text-xs text-zinc-300 pt-2 font-mono">
                Waiting for AI: {aiWorkingTasks.map((t) => `"${t.title}" (${t.worker?.name})`).join(', ')}
              </div>
            )}
          </div>
        ) : (
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-6 text-center text-zinc-400 text-sm">
            🎉 All active tasks are completed or moved! Create a new task or review project plans.
          </div>
        )}

        {/* 2. OTHER READY TASKS YOU CAN DO NOW */}
        {otherReadyTasks.length > 0 && (
          <div className="mt-6 pt-5 border-t border-zinc-800/80">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3 flex items-center gap-1.5">
              <span>Other Things You Can Do Now ({otherReadyTasks.length})</span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {otherReadyTasks.slice(0, 6).map((t) => (
                <div
                  key={t.id}
                  onClick={() => onOpenTask(t.id)}
                  className="group p-3.5 rounded-xl bg-zinc-900/70 hover:bg-zinc-800/90 border border-zinc-800/80 hover:border-zinc-700 transition cursor-pointer flex flex-col justify-between space-y-2"
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                        {t.projectName}
                      </span>
                      {t.worker && (
                        <span className="text-[11px] text-zinc-400 flex items-center gap-1">
                          {t.worker.type === WorkerType.AI_AGENT ? (
                            <Bot className="w-3 h-3 text-purple-400" />
                          ) : (
                            <User className="w-3 h-3 text-zinc-400" />
                          )}
                          {t.worker.name}
                        </span>
                      )}
                    </div>
                    <h5 className="text-sm font-semibold text-zinc-200 group-hover:text-white transition">
                      {t.title}
                    </h5>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-2 border-t border-zinc-800/60">
                    <span>Est: {formatDuration(t.estimatedDuration) || '—'}</span>
                    {t.unlocksTotalCount ? (
                      <span className="text-emerald-400 font-medium">Unlocks {t.unlocksTotalCount}</span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 3. PARALLEL STATUS SECTIONS: AI WORKING | WAITING | BLOCKED REASON */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* AI WORKING SECTION */}
        <div className="bg-zinc-900/60 border border-purple-500/20 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
            <h3 className="text-xs font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
              <Bot className="w-4 h-4 text-purple-400" /> AI Working ({aiWorkingTasks.length})
            </h3>
            <span className="text-[11px] font-mono text-purple-400/80 bg-purple-500/10 px-2 py-0.5 rounded">
              Autonomous
            </span>
          </div>

          {aiWorkingTasks.length === 0 ? (
            <p className="text-xs text-zinc-500 italic py-3 text-center">No AI agents running right now.</p>
          ) : (
            <div className="space-y-2.5">
              {aiWorkingTasks.map((t) => (
                <div
                  key={t.id}
                  onClick={() => onOpenTask(t.id)}
                  className="p-3 rounded-lg bg-zinc-950 border border-purple-500/20 hover:border-purple-500/40 transition cursor-pointer space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-purple-300">{t.worker?.name || 'AI'}</span>
                    <span className="text-[10px] text-zinc-500 flex items-center gap-1 font-mono">
                      <Clock className="w-3 h-3 text-purple-400" />
                      {formatStartedTime(t.actualStartedAt)}
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-zinc-100">{t.title}</div>
                  {t.aiInstructions && (
                    <div className="text-[11px] text-zinc-400 line-clamp-1 italic">
                      &quot;{t.aiInstructions}&quot;
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* WAITING SECTION */}
        <div className="bg-zinc-900/60 border border-amber-500/20 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
              <Hourglass className="w-4 h-4 text-amber-400" /> Waiting On Events ({waitingTasks.length})
            </h3>
            <span className="text-[11px] font-mono text-amber-400/80 bg-amber-500/10 px-2 py-0.5 rounded">
              External
            </span>
          </div>

          {waitingTasks.length === 0 ? (
            <p className="text-xs text-zinc-500 italic py-3 text-center">No tasks currently waiting.</p>
          ) : (
            <div className="space-y-2.5">
              {waitingTasks.map((t) => (
                <div
                  key={t.id}
                  onClick={() => onOpenTask(t.id)}
                  className="p-3 rounded-lg bg-zinc-950 border border-amber-500/20 hover:border-amber-500/40 transition cursor-pointer space-y-1"
                >
                  <div className="text-xs font-semibold text-zinc-100">{t.title}</div>
                  <div className="text-xs text-amber-300 font-medium flex items-center gap-1">
                    <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                      {t.waitingType || 'WAITING'}
                    </span>
                    <span className="truncate">{t.waitingReason || 'External dependency'}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* BLOCKED DIAGNOSTICS SECTION */}
        <div className="bg-zinc-900/60 border border-rose-500/20 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
            <h3 className="text-xs font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
              <Lock className="w-4 h-4 text-rose-400" /> Blocked Tasks ({blockedTasks.length})
            </h3>
            <span className="text-[11px] font-mono text-rose-400/80 bg-rose-500/10 px-2 py-0.5 rounded">
              Why blocked
            </span>
          </div>

          {blockedTasks.length === 0 ? (
            <p className="text-xs text-zinc-500 italic py-3 text-center">No blocked tasks.</p>
          ) : (
            <div className="space-y-2.5">
              {blockedTasks.slice(0, 5).map((t) => (
                <div
                  key={t.id}
                  onClick={() => onOpenTask(t.id)}
                  className="p-3 rounded-lg bg-zinc-950 border border-rose-500/20 hover:border-rose-500/40 transition cursor-pointer space-y-1.5"
                >
                  <div className="text-xs font-semibold text-zinc-100">{t.title}</div>
                  <div className="text-[11px] text-rose-400/90 space-y-0.5">
                    <span className="font-semibold block">Blocked by:</span>
                    {t.dependencies && t.dependencies.length > 0 ? (
                      t.dependencies
                        .filter((d: any) => d.dependsOnTask.status !== TaskStatus.DONE)
                        .map((d: any) => (
                          <div key={d.id} className="truncate text-zinc-400 pl-2">
                            • {d.dependsOnTask.title} ({d.dependsOnTask.status})
                          </div>
                        ))
                    ) : (
                      <span className="text-zinc-500 italic">Dependency pending</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
