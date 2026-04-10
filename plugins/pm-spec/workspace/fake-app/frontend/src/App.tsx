import React, { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthContext } from "./hooks/useAuth";
import { useAuthProvider } from "./hooks/useAuth";
import Navbar from "./components/Navbar";

const TaskList = lazy(() => import("./components/TaskList"));
const TaskDetail = lazy(() => import("./components/TaskDetail"));
const CreateTaskForm = lazy(() => import("./components/CreateTaskForm"));

// TODO: add lazy-loaded routes for ProjectList, TeamSettings, UserProfile
// TODO: add a proper 404 page

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});

function AppRoutes() {
  return (
    <Suspense fallback={<div className="p-8 text-center">Loading...</div>}>
      <Routes>
        <Route path="/" element={<Navigate to="/tasks" replace />} />
        <Route path="/tasks" element={<TaskList />} />
        <Route path="/tasks/new" element={<CreateTaskForm />} />
        <Route path="/tasks/:taskId" element={<TaskDetail />} />
        {/* TODO: project routes */}
        {/* TODO: team settings route */}
        <Route path="*" element={<div className="p-8">Page not found</div>} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  const auth = useAuthProvider();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={auth}>
        <BrowserRouter>
          <div className="min-h-screen bg-gray-50">
            <Navbar />
            <main className="max-w-6xl mx-auto px-4 py-6">
              {auth.isLoading ? (
                <div className="text-center py-12">Authenticating...</div>
              ) : (
                <AppRoutes />
              )}
            </main>
          </div>
        </BrowserRouter>
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}
