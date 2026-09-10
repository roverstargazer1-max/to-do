"use client";

import { useState } from "react";
import { parseICSFile } from "@/lib/utils/ics-parser";
import { notify } from "@/lib/notify";
import { tr } from "@/lib/i18n/tr";
import { useHaptic } from "@/lib/hooks/useHaptic";
import { useCreateCalendarEvent } from "@/lib/hooks/useCalendarEventMutations";

export function useIcsImport() {
  const [isImporting, setIsImporting] = useState(false);
  const { trigger } = useHaptic();
  const createEvent = useCreateCalendarEvent();

  const importIcs = async (file: File) => {
    if (!file) return;

    setIsImporting(true);
    trigger("toggle");
    const loadingToastId = notify.loading(
      tr("calendar.ics.importing", { file: file.name }),
    );

    try {
      const { events: parsedEvents, errors } = await parseICSFile(file);

      if (parsedEvents.length === 0 && errors.length > 0) {
        notify.error(tr("calendar.ics.parseFailed"), { id: loadingToastId });
        trigger("thud");
        return false;
      }

      if (parsedEvents.length === 0) {
        notify.error(tr("calendar.ics.noValidEvents"), { id: loadingToastId });
        trigger("thud");
        return false;
      }

      // Create each event sequentially
      let importedCount = 0;
      for (const eventInput of parsedEvents) {
        try {
          await createEvent.mutateAsync(eventInput);
          importedCount++;
        } catch (err) {
          console.error("Failed to import single event:", err);
        }
      }

      notify.success(tr("calendar.ics.imported", { count: importedCount }), {
        id: loadingToastId,
      });
      trigger("success");

      if (errors.length > 0) {
        notify.warning(tr("calendar.ics.warnings", { count: errors.length }));
      }

      return true;
    } catch (err) {
      console.error("Failed to import ICS:", err);
      notify.error(tr("calendar.ics.criticalError"), { id: loadingToastId });
      trigger("thud");
      return false;
    } finally {
      setIsImporting(false);
    }
  };

  return { importIcs, isImporting };
}
