import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";

export default function RequireAuth({ children }: { children: React.ReactElement }) {
  const { user, initializing } = useAuth();

  if (initializing) return <div>Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;

  return children;
}
