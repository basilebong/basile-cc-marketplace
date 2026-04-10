import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { Task, TaskStatus, TaskPriority } from "../types";
import { FunnelIcon, PlusIcon } from "@heroicons/react/24/outline";
import clsx from "clsx";

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  low: "bg-gray-100 text-gray-700",
  medium: "bg-blue-100 text-blue-700",
  high: "bg-orange-100 text-orange-700",
  urgent: "bg-red-100 text-red-700",
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  done: "Done",
};

export default function TaskList() {
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | "all">("all");

  // BUG: no pagination — fetches all tasks at once. Will be slow for large teams.
  const { data: tasks = [], isLoading, error } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => api.get<Task[]>("/tasks/"),
  });

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (priorityFilter !== "all" && t.priority !== priorityFilter) return false;
      return true;
    });
  }, [tasks, statusFilter, priorityFilter]);

  if (isLoading) return <div className="py-8 text-center text-gray-500">Loading tasks...</div>;
  if (error) return <div className="py-8 text-center text-red-600">Failed to load tasks.</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Tasks</h1>
        <Link to="/tasks/new" className="btn btn-primary inline-flex items-center gap-1">
          <PlusIcon className="w-4 h-4" /> New Task
        </Link>
      </div>

      <div className="flex gap-3 mb-4 items-center text-sm">
        <FunnelIcon className="w-4 h-4 text-gray-400" />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as TaskStatus | "all")} className="border rounded px-2 py-1">
          <option value="all">All statuses</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value as TaskPriority | "all")} className="border rounded px-2 py-1">
          <option value="all">All priorities</option>
          {(["low", "medium", "high", "urgent"] as TaskPriority[]).map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        {/* TODO: add assignee filter, date range filter, search box */}
      </div>

      <ul className="space-y-2">
        {filtered.map((task) => (
          <li key={task.id}>
            <Link to={`/tasks/${task.id}`} className="block bg-white rounded-lg border p-4 hover:shadow-sm transition-shadow">
              <div className="flex items-center justify-between">
                <span className="font-medium">{task.title}</span>
                <span className={clsx("text-xs px-2 py-0.5 rounded-full", PRIORITY_COLORS[task.priority])}>{task.priority}</span>
              </div>
              <div className="mt-1 text-sm text-gray-500 flex gap-4">
                <span>{STATUS_LABELS[task.status]}</span>
                {task.assignee && <span>Assigned to {task.assignee.display_name}</span>}
                {task.due_date && <span>Due {task.due_date}</span>}
                <span>{task.comment_count} comments</span>
              </div>
            </Link>
          </li>
        ))}
        {filtered.length === 0 && <li className="text-gray-400 text-center py-8">No tasks match your filters.</li>}
      </ul>
    </div>
  );
}
