import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../hooks/useAuth";
import { api } from "../api/client";
import type { Notification } from "../types";
import { BellIcon, Bars3Icon } from "@heroicons/react/24/outline";

export default function Navbar() {
  const { user, isAuthenticated, logout } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  // TODO: notifications should use WebSocket for real-time updates
  const { data: notifications = [] } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.get<Notification[]>("/notifications/"),
    enabled: isAuthenticated,
    refetchInterval: 30_000, // poll every 30s — not ideal
  });

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <nav className="bg-white border-b sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 flex items-center justify-between h-14">
        <div className="flex items-center gap-6">
          <Link to="/" className="text-lg font-bold text-indigo-600">TaskFlow</Link>
          <Link to="/tasks" className="text-sm text-gray-600 hover:text-gray-900">Tasks</Link>
          {/* TODO: add Projects link, Team link */}
        </div>

        {isAuthenticated && user ? (
          <div className="flex items-center gap-3">
            <div className="relative">
              <button onClick={() => setShowNotifications(!showNotifications)} className="relative p-1.5 rounded-full hover:bg-gray-100">
                <BellIcon className="w-5 h-5 text-gray-600" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>
              {showNotifications && (
                <div className="absolute right-0 mt-2 w-72 bg-white border rounded-lg shadow-lg py-2 max-h-80 overflow-y-auto">
                  {notifications.length === 0 && <p className="px-4 py-3 text-sm text-gray-400">No notifications</p>}
                  {notifications.slice(0, 10).map((n) => (
                    <div key={n.id} className={`px-4 py-2 text-sm border-b last:border-0 ${n.is_read ? "text-gray-400" : "text-gray-800 bg-indigo-50"}`}>
                      {n.message}
                    </div>
                  ))}
                  {/* TODO: mark individual notifications as read */}
                  {/* TODO: "mark all as read" button */}
                </div>
              )}
            </div>

            <div className="relative">
              <button onClick={() => setShowUserMenu(!showUserMenu)} className="flex items-center gap-2 text-sm">
                <div className="w-7 h-7 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center font-medium text-xs">
                  {user.display_name.charAt(0).toUpperCase()}
                </div>
              </button>
              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-48 bg-white border rounded-lg shadow-lg py-1">
                  <div className="px-4 py-2 text-sm text-gray-500 border-b">{user.email}</div>
                  <button onClick={logout} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-50">Sign out</button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <Link to="/login" className="text-sm text-indigo-600 hover:underline">Sign in</Link>
        )}
      </div>
    </nav>
  );
}
