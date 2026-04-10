import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { Task, TaskPriority } from "../types";

const taskSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().max(5000).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  project: z.number({ required_error: "Project is required" }),
  assignee_id: z.number().nullable().optional(),
  due_date: z.string().nullable().optional(),
});

type TaskFormData = z.infer<typeof taskSchema>;

export default function CreateTaskForm() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { register, handleSubmit, formState: { errors } } = useForm<TaskFormData>({
    resolver: zodResolver(taskSchema),
    defaultValues: { priority: "medium", assignee_id: null, due_date: null },
  });

  const createTask = useMutation({
    mutationFn: (data: TaskFormData) => api.post<Task>("/tasks/", { ...data, status: "todo" }),
    onSuccess: (task) => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      navigate(`/tasks/${task.id}`);
    },
  });

  // TODO: fetch projects list for dropdown
  // TODO: fetch team members for assignee dropdown
  // TODO: add rich text editor for description

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold mb-6">Create Task</h1>
      <form onSubmit={handleSubmit((d) => createTask.mutate(d))} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Title *</label>
          <input {...register("title")} className="w-full border rounded-lg px-3 py-2" />
          {errors.title && <p className="text-red-600 text-sm mt-1">{errors.title.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Description</label>
          <textarea {...register("description")} rows={4} className="w-full border rounded-lg px-3 py-2" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Priority</label>
            <select {...register("priority")} className="w-full border rounded-lg px-3 py-2">
              {(["low", "medium", "high", "urgent"] as TaskPriority[]).map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Due Date</label>
            <input type="date" {...register("due_date")} className="w-full border rounded-lg px-3 py-2" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Project *</label>
          {/* FIXME: hardcoded project ID — should be a dynamic dropdown */}
          <input type="number" {...register("project", { valueAsNumber: true })} className="w-full border rounded-lg px-3 py-2" placeholder="Project ID" />
          {errors.project && <p className="text-red-600 text-sm mt-1">{errors.project.message}</p>}
        </div>

        <button type="submit" disabled={createTask.isPending} className="btn btn-primary w-full">
          {createTask.isPending ? "Creating..." : "Create Task"}
        </button>

        {createTask.isError && <p className="text-red-600 text-sm">Something went wrong. Please try again.</p>}
      </form>
    </div>
  );
}
