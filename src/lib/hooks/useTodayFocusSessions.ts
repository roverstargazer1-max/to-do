import { useQuery } from "@tanstack/react-query";
import { startOfDay } from "date-fns";
import { focusClient } from "@/lib/api/focus-client";

export function useTodayFocusSessions() {
  return useQuery({
    queryKey: ["today-focus-count"],
    staleTime: 30_000,
    queryFn: async (): Promise<number> => {
      const startIso = startOfDay(new Date()).toISOString();
      const res = await focusClient.list("local_user", 500);
      return res.logs.filter((log) => log.start_time >= startIso).length;
    },
  });
}
