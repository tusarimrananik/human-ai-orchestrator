'use client';

import React, { useCallback } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  NodeProps,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Bot, User, Clock, Lock, Sparkles, AlertCircle, Layers } from 'lucide-react';
import { TaskStatus, Priority, WorkerType } from '@prisma/client';

// Custom Node for React Flow
function CustomTaskNode({ data }: NodeProps) {
  const getStatusColor = (status: TaskStatus) => {
    switch (status) {
      case TaskStatus.READY:
        return 'border-emerald-500 bg-emerald-950/40 text-emerald-300';
      case TaskStatus.BLOCKED:
        return 'border-rose-500/80 bg-rose-950/40 text-rose-300';
      case TaskStatus.IN_PROGRESS:
        return 'border-blue-500 bg-blue-950/40 text-blue-300';
      case TaskStatus.WAITING:
        return 'border-amber-500 bg-amber-950/40 text-amber-300';
      case TaskStatus.REVIEW:
        return 'border-purple-500 bg-purple-950/40 text-purple-300';
      case TaskStatus.DONE:
        return 'border-green-500/80 bg-zinc-900/90 text-green-400 opacity-80';
      default:
        return 'border-zinc-700 bg-zinc-900 text-zinc-400';
    }
  };

  return (
    <div
      className={`w-64 rounded-xl border-2 p-3.5 shadow-xl transition-all hover:scale-[1.02] cursor-pointer ${getStatusColor(
        data.status as TaskStatus
      )} ${data.isCritical ? 'ring-2 ring-pink-500 shadow-pink-500/20' : ''}`}
    >
      {/* Target handle (left - incoming dependencies) */}
      <Handle
        type="target"
        position={Position.Left}
        className="w-3 h-3 bg-indigo-500 border-2 border-zinc-900 rounded-full"
      />

      <div className="space-y-2">
        {/* Header: Priority & Critical Path Flag */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-zinc-950/80 border border-zinc-800">
            {data.priority as string}
          </span>
          {Boolean(data.isCritical) && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-pink-500/20 text-pink-400 border border-pink-500/40 animate-pulse">
              CRITICAL PATH
            </span>
          )}
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-950 text-zinc-400">
            {(data.status as string).replace('_', ' ')}
          </span>
        </div>

        {/* Title */}
        <h4 className="text-xs font-bold text-zinc-100 line-clamp-2 leading-tight">
          {data.title as string}
        </h4>

        {/* Worker & Duration */}
        <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-1.5 border-t border-zinc-800/80">
          <span className="flex items-center gap-1 font-medium">
            {data.worker ? (
              <>
                {(data.worker as any).type === WorkerType.AI_AGENT ? (
                  <Bot className="w-3 h-3 text-purple-400" />
                ) : (
                  <User className="w-3 h-3 text-zinc-400" />
                )}
                <span className="truncate max-w-[90px]">{(data.worker as any).name}</span>
              </>
            ) : (
              <span className="text-zinc-600 italic">Unassigned</span>
            )}
          </span>

          {Boolean(data.estimatedDuration) ? (
            <span className="flex items-center gap-0.5 font-mono text-[10px]">
              <Clock className="w-3 h-3" /> {String(data.estimatedDuration)}m
            </span>
          ) : null}
        </div>
      </div>

      {/* Source handle (right - downstream dependents) */}
      <Handle
        type="source"
        position={Position.Right}
        className="w-3 h-3 bg-emerald-500 border-2 border-zinc-900 rounded-full"
      />
    </div>
  );
}

const nodeTypes = {
  customTaskNode: CustomTaskNode,
};

interface DependencyGraphProps {
  graphData: {
    nodes: any[];
    edges: any[];
    project: any;
    criticalTaskIds?: string[];
  };
  onOpenTask: (taskId: string) => void;
}

export default function DependencyGraph({ graphData, onOpenTask }: DependencyGraphProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(graphData.nodes || []);
  const [edges, setEdges, onEdgesChange] = useEdgesState(graphData.edges || []);

  React.useEffect(() => {
    setNodes(graphData.nodes || []);
    setEdges(graphData.edges || []);
  }, [graphData, setNodes, setEdges]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: any) => {
      onOpenTask(node.id);
    },
    [onOpenTask]
  );

  return (
    <div className="relative w-full h-[75vh] rounded-2xl bg-zinc-950 border border-zinc-800 overflow-hidden shadow-2xl">
      {/* Top Legend */}
      <div className="absolute top-4 left-4 z-10 bg-zinc-900/90 backdrop-blur-md border border-zinc-800 rounded-xl px-4 py-2.5 shadow-xl flex items-center gap-4 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-emerald-500" />
          <span className="text-zinc-300">Ready</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-rose-500" />
          <span className="text-zinc-300">Blocked</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-blue-500" />
          <span className="text-zinc-300">In Progress</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-amber-500" />
          <span className="text-zinc-300">Waiting</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-pink-500 ring-2 ring-pink-500/40" />
          <span className="text-pink-400 font-semibold">Critical Path</span>
        </div>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.2}
        maxZoom={1.8}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#374151" />
        <Controls className="bg-zinc-900 border border-zinc-800 text-zinc-100 fill-zinc-100" />
        <MiniMap
          nodeColor={(node: any) => {
            if (node.data?.status === TaskStatus.READY) return '#10B981';
            if (node.data?.status === TaskStatus.BLOCKED) return '#F43F5E';
            if (node.data?.status === TaskStatus.IN_PROGRESS) return '#3B82F6';
            if (node.data?.status === TaskStatus.DONE) return '#22C55E';
            return '#6B7280';
          }}
          className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden"
        />
      </ReactFlow>
    </div>
  );
}
