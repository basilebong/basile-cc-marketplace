import React, { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { useAuth } from "../hooks/useAuth";
import type { Task, Comment } from "../types";
import { format } from "date-fns";

export default function TaskDetail() {
  const { taskId } = useParams<{ taskId: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [commentBody, setCommentBody] = useState("");

  const { data: task, isLoading } = useQuery({
    queryKey: ["task", taskId],
    queryFn: () => api.get<Task>(`/tasks/${taskId}/`),
    enabled: !!taskId,
  });

  const { data: comments = [] } = useQuery({
    queryKey: ["comments", taskId],
    queryFn: () => api.get<Comment[]>(`/tasks/${taskId}/comments/`),
    enabled: !!taskId,
  });

  const addComment = useMutation({
    mutationFn: (body: string) => api.post(`/tasks/${taskId}/comments/`, { body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comments", taskId] });
      queryClient.invalidateQueries({ queryKey: ["task", taskId] });
      setCommentBody("");
    },
  });

  // TODO: add ability to edit/delete comments
  // TODO: add file attachment upload
  // TODO: show task activity log / history

  if (isLoading || !task) return <div className="py-8 text-center">Loading...</div>;

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold mb-2">{task.title}</h1>
      <div className="flex gap-3 text-sm text-gray-500 mb-4">
        <span className="capitalize">{task.status.replace("_", " ")}</span>
        <span className="capitalize">{task.priority} priority</span>
        {task.assignee && <span>Assigned to {task.assignee.display_name}</span>}
        {task.due_date && <span>Due {format(new Date(task.due_date), "MMM d, yyyy")}</span>}
      </div>

      <div className="prose bg-white border rounded-lg p-4 mb-8">
        {task.description || <span className="text-gray-400">No description provided.</span>}
      </div>

      <h2 className="text-lg font-semibold mb-3">Comments ({comments.length})</h2>
      <ul className="space-y-3 mb-6">
        {comments.map((c) => (
          <li key={c.id} className="bg-white border rounded-lg p-3">
            <div className="flex items-center justify-between text-sm text-gray-500 mb-1">
              <span className="font-medium text-gray-700">{c.author.display_name}</span>
              <span>{format(new Date(c.created_at), "MMM d, h:mm a")}</span>
            </div>
            <p className="text-sm">{c.body}</p>
            {/* No edit/delete buttons yet — backend doesn't support it */}
          </li>
        ))}
      </ul>

      {user && (
        <form onSubmit={(e) => { e.preventDefault(); if (commentBody.trim()) addComment.mutate(commentBody); }} className="flex gap-2">
          <input
            value={commentBody}
            onChange={(e) => setCommentBody(e.target.value)}
            placeholder="Add a comment..."
            className="flex-1 border rounded-lg px-3 py-2 text-sm"
          />
          <button type="submit" disabled={addComment.isPending} className="btn btn-primary text-sm">
            {addComment.isPending ? "Posting..." : "Comment"}
          </button>
        </form>
      )}
    </div>
  );
}
