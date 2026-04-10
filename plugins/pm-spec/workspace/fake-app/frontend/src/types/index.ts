export type TaskStatus = "todo" | "in_progress" | "done";
export type TaskPriority = "low" | "medium" | "high" | "urgent";

export interface User {
  id: number;
  email: string;
  display_name: string;
  avatar_url: string | null;
  team_ids: number[];
}

export interface Team {
  id: number;
  name: string;
  slug: string;
  members: User[];
  created_at: string;
}

export interface Project {
  id: number;
  name: string;
  description: string;
  team: number;
  color: string;
  created_at: string;
}

export interface Task {
  id: number;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee: User | null;
  project: number;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  comment_count: number;
  attachment_count: number;
}

export interface Comment {
  id: number;
  task: number;
  author: User;
  body: string;
  created_at: string;
  // TODO: add updated_at once backend supports editing comments
}

export interface Attachment {
  id: number;
  task: number;
  uploaded_by: User;
  file_url: string;
  filename: string;
  size_bytes: number;
  created_at: string;
}

export interface Notification {
  id: number;
  recipient: number;
  message: string;
  is_read: boolean;
  link: string | null;
  created_at: string;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}
