"use client";

import { useState } from "react";
import * as Sentry from "@sentry/nextjs";
import {
  parseUhabitsFile,
  toCreateHabitInput,
  type UhabitsRawSource,
} from "@/lib/import/uhabits";
import { persistImportSource } from "@/lib/mutations/importSource";
import {
  classifyUhabitsError,
  SAVE_ERROR_MESSAGE,
} from "@/lib/import/uhabitsErrors";
import type { Habit, HabitEntry } from "@/lib/types/habit";
import { notify } from "@/lib/notify";
import { tr } from "@/lib/i18n/tr";
import type { TranslationKey } from "@/lib/i18n/dictionaries/en";
import { useHaptic } from "@/lib/hooks/useHaptic";
import { habitMutations } from "@/lib/mutations/habit";
import { useQueryClient } from "@tanstack/react-query";
import { habitsClient } from "@/lib/api/habits-client";

export function useUhabitsImport() {
  const [isImporting, setIsImporting] = useState(false);
  const { trigger } = useHaptic();
  const queryClient = useQueryClient();

  const importUhabits = async (file: File) => {
    if (!file) return;

    setIsImporting(true);
    trigger("toggle");
    const loadingToastId = notify.loading(
      tr("habits.import.parsing", { file: file.name }),
    );

    const reportImportFailure = (err: unknown, messageKey: TranslationKey) => {
      Sentry.captureException(err);
      notify.error(tr(messageKey), { id: loadingToastId });
      trigger("thud");
      return false;
    };

    try {
      let habits: Habit[];
      let entries: HabitEntry[];
      let source: UhabitsRawSource;
      try {
        ({ habits, entries, source } = await parseUhabitsFile(file));
      } catch (err) {
        return reportImportFailure(err, classifyUhabitsError(err));
      }

      if (habits.length === 0) {
        notify.error(tr("habits.import.noCompatible"), {
          id: loadingToastId,
        });
        return;
      }

      // Best-effort, backgrounded capture for round-trip export (ADR 0006).
      void persistImportSource({
        source_app: "uhabits",
        file_name: file.name,
        raw: source,
      }).catch((err) => Sentry.captureException(err));

      const existingHabits = await habitsClient.list();
      const existingNames = new Set(
        existingHabits.map((h) => h.name.toLowerCase()),
      );
      const habitsToImport = habits.filter(
        (h) => !existingNames.has(h.name.toLowerCase()),
      );
      const skippedCount = habits.length - habitsToImport.length;

      if (habitsToImport.length === 0) {
        notify.info(tr("habits.import.allExist", { count: habits.length }), {
          id: loadingToastId,
        });
        return true;
      }

      notify.loading(
        tr("habits.import.importing", { count: habitsToImport.length }),
        {
          id: loadingToastId,
        },
      );

      const habitIdMap = new Map<string, string>();

      for (const habit of habitsToImport) {
        const created = await habitMutations.create(toCreateHabitInput(habit));
        habitIdMap.set(habit.id, created.id);
      }

      if (entries.length > 0) {
        notify.loading(
          tr("habits.import.importingEntries", {
            habits: habits.length,
            entries: entries.length,
          }),
          { id: loadingToastId },
        );

        const remapped = entries.filter((e) => habitIdMap.has(e.habit_id));
        for (const e of remapped) {
          const targetId = habitIdMap.get(e.habit_id)!;
          await habitsClient.recordEntry(targetId, e.date, e.value);
        }
      }

      await queryClient.invalidateQueries({ queryKey: ["habits"] });

      const skippedMsg =
        skippedCount > 0
          ? tr("habits.import.skippedSuffix", { count: skippedCount })
          : "";
      notify.success(
        tr("habits.import.success", {
          habits: habitsToImport.length,
          entries: entries.length,
          skipped: skippedMsg,
        }),
        { id: loadingToastId },
      );
      trigger("success");
      return true;
    } catch (err) {
      return reportImportFailure(err, SAVE_ERROR_MESSAGE);
    } finally {
      setIsImporting(false);
    }
  };

  return { importUhabits, isImporting };
}
