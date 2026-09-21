"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { get, set, del } from "idb-keyval";
import { useEffect, useState } from "react";
import { taskCommands } from "@/lib/commands/task";
import { nodeCommands } from "@/lib/commands/node";
import type {
  ToggleTaskInput,
  CreateTaskInputWithClientId,
} from "@/lib/commands/task";
import type { MoveNodeInput } from "@/lib/types/workspace";
import type { UpdateTaskInput } from "@/lib/types/task";
import { habitMutations } from "@/lib/mutations/habit";
import { projectMutations } from "@/lib/mutations/project";
import { focusMutations } from "@/lib/mutations/focus";

export const ELECTRON_GC_TIME = 1000 * 60 * 5; // 5 minutes
export const DEFAULT_GC_TIME = 1000 * 60 * 60 * 24 * 7; // 7 days

export const asyncStoragePersister = {
  persistClient: async (client: unknown) => {
    await set("REACT_QUERY_OFFLINE_CACHE", client);
  },
  restoreClient: async () => {
    return await get("REACT_QUERY_OFFLINE_CACHE");
  },
  removeClient: async () => {
    await del("REACT_QUERY_OFFLINE_CACHE");
  },
};

export function createQueryClient(
  isElectron = process.env.NEXT_PUBLIC_IS_ELECTRON === "true",
): QueryClient {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 5, // 5 minutes
        gcTime: isElectron ? ELECTRON_GC_TIME : DEFAULT_GC_TIME,
        retry: 2,
        refetchOnWindowFocus: true,
        networkMode: "offlineFirst",
      },
      mutations: {
        retry: 1,
      },
    },
  });

  // Register defaults for resumable mutations
  client.setMutationDefaults(["createTask"], {
    mutationFn: (input: CreateTaskInputWithClientId) =>
      taskCommands.create({ queryClient: client }, input),
  });
  client.setMutationDefaults(["toggleTask"], {
    mutationFn: (input: ToggleTaskInput) =>
      taskCommands.toggle({ queryClient: client }, input),
  });
  client.setMutationDefaults(["updateTask"], {
    mutationFn: (input: UpdateTaskInput) =>
      taskCommands.update({ queryClient: client }, input),
  });
  client.setMutationDefaults(["deleteTask"], {
    mutationFn: (id: string) =>
      taskCommands.delete({ queryClient: client }, id),
  });
  client.setMutationDefaults(["reorderTasks"], {
    mutationFn: (pairs: { id: string; day_order: number }[]) =>
      taskCommands.reorder({ queryClient: client }, pairs),
  });
  client.setMutationDefaults(["clearCompletedTasks"], {
    mutationFn: () =>
      taskCommands.clearCompleted({
        queryClient: client,
      }),
  });

  client.setMutationDefaults(["node.move"], {
    mutationFn: (input: MoveNodeInput) =>
      nodeCommands.move({ queryClient: client }, input),
  });

  // Habits
  client.setMutationDefaults(["createHabit"], {
    mutationFn: habitMutations.create,
  });
  client.setMutationDefaults(["updateHabit"], {
    mutationFn: habitMutations.update,
  });
  client.setMutationDefaults(["deleteHabit"], {
    mutationFn: habitMutations.delete,
  });
  client.setMutationDefaults(["markHabitComplete"], {
    mutationFn: habitMutations.markComplete,
  });

  // Projects
  client.setMutationDefaults(["createProject"], {
    mutationFn: projectMutations.create,
  });
  client.setMutationDefaults(["updateProject"], {
    mutationFn: projectMutations.update,
  });
  client.setMutationDefaults(["archiveProject"], {
    mutationFn: projectMutations.archive,
  });

  // Focus
  client.setMutationDefaults(["logFocusSession"], {
    mutationFn: focusMutations.logSession,
  });

  return client;
}

export default function QueryProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const isElectron = process.env.NEXT_PUBLIC_IS_ELECTRON === "true";
  const [queryClient] = useState(() => createQueryClient(isElectron));

  useEffect(() => {
    if (isElectron) {
      queryClient.resumePausedMutations();
    }
  }, [isElectron, queryClient]);

  if (isElectron) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: asyncStoragePersister,
        maxAge: DEFAULT_GC_TIME,
      }}
      onSuccess={() => {
        queryClient.resumePausedMutations();
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
