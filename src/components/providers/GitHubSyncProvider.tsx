"use client";

import React from "react";
import { useGitHubSyncLifecycle } from "@/lib/hooks/useGitHubSyncLifecycle";

interface GitHubSyncProviderProps {
  children: React.ReactNode;
}

export function GitHubSyncProvider({ children }: GitHubSyncProviderProps) {
  useGitHubSyncLifecycle();
  return <>{children}</>;
}
