"use client";

import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { get, set, del } from "idb-keyval";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
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

// Read fresh at execution time — the same source the mutation services and
// AuthProvider use, so resumed paused mutations see the current mode.
function isGuestModeNow(): boolean {
  return (
    typeof window !== "undefined" &&
    localStorage.getItem("kanso_guest_mode") === "true"
  );
}

const asyncStoragePersister = {
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

export default function QueryProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [queryClient] = useState(() => {
    const client = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 1000 * 60 * 5, // 5 minutes
          gcTime: 1000 * 60 * 60 * 24 * 7, // 7 days for offline
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
    // Tasks — create/toggle rebind to the Domain Command execution (the
    // same function the hooks call), so paused mutations resuming after a
    // reload run the full command policy: optimistic update, rollback,
    // invalidation, and Domain Event publication on resume (ADR 0016/0017).
    client.setMutationDefaults(["createTask"], {
      mutationFn: (input: CreateTaskInputWithClientId) =>
        taskCommands.create(
          { queryClient: client, isGuestMode: isGuestModeNow() },
          input,
        ),
    });
    client.setMutationDefaults(["toggleTask"], {
      mutationFn: (input: ToggleTaskInput) =>
        taskCommands.toggle(
          { queryClient: client, isGuestMode: isGuestModeNow() },
          input,
        ),
    });
    client.setMutationDefaults(["updateTask"], {
      mutationFn: (input: UpdateTaskInput) =>
        taskCommands.update(
          { queryClient: client, isGuestMode: isGuestModeNow() },
          input,
        ),
    });
    client.setMutationDefaults(["deleteTask"], {
      mutationFn: (id: string) =>
        taskCommands.delete(
          { queryClient: client, isGuestMode: isGuestModeNow() },
          id,
        ),
    });
    client.setMutationDefaults(["reorderTasks"], {
      mutationFn: (pairs: { id: string; day_order: number }[]) =>
        taskCommands.reorder(
          { queryClient: client, isGuestMode: isGuestModeNow() },
          pairs,
        ),
    });
    client.setMutationDefaults(["clearCompletedTasks"], {
      mutationFn: () =>
        taskCommands.clearCompleted({
          queryClient: client,
          isGuestMode: isGuestModeNow(),
        }),
    });

    // Workspace nodes — the position-specific `node.move` mutation key: a
    // paused position write rebinds to the node command on resume, the same
    // rebind discipline as the task keys above (ADR 0016/0018).
    client.setMutationDefaults(["node.move"], {
      mutationFn: (input: MoveNodeInput) =>
        nodeCommands.move(
          { queryClient: client, isGuestMode: isGuestModeNow() },
          input,
        ),
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
  });

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: asyncStoragePersister,
        maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
      }}
      onSuccess={() => {
        // Authenticated Session Guard
        const supabase = createClient();
        const isGuest =
          typeof window !== "undefined" &&
          localStorage.getItem("kanso_guest_mode") === "true";

        supabase.auth.getSession().then(({ data: { session } }) => {
          const user = session?.user;
          if (user || isGuest) {
            queryClient.resumePausedMutations();
          } else {
            // Safety: Clear mutations if no valid session found on reload
            queryClient.getMutationCache().clear();
          }
        });
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
