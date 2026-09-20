import { NextRequest } from "next/server";
import { dbWatcher } from "@/lib/db/watcher";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest) {
  dbWatcher.start();

  let unsubscribe: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(
        encoder.encode(`event: connected\ndata: {"status":"connected"}\n\n`),
      );

      unsubscribe = dbWatcher.onChange(() => {
        try {
          const payload = JSON.stringify({
            type: "db-change",
            timestamp: Date.now(),
          });
          controller.enqueue(
            encoder.encode(`event: change\ndata: ${payload}\n\n`),
          );
        } catch {}
      });
    },
    cancel() {
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
