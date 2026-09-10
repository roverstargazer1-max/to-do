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
import { createClient } from "@/lib/supabase/client";
import { mockStore } from "@/lib/mock/mock-store";

const ENTRY_CHUNK_SIZE = 500;

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

      const isGuest =
        typeof window !== "undefined" &&
        localStorage.getItem("kanso_guest_mode") === "true";

      // Best-effort, backgrounded capture for round-trip export (ADR 0006).
      void persistImportSource(
        { source_app: "uhabits", file_name: file.name, raw: source },
        { isGuest },
      ).catch((err) => Sentry.captureException(err));

      let habitsToImport = habits;
      let skippedCount = 0;
      let nextSortOrder = 0;
      if (!isGuest) {
        const supabase = createClient();
        // eslint-disable-next-line local/no-unbounded-supabase-select -- habit definitions, not entries
        const { data: existing } = await supabase
          .from("habits")
          .select("name, sort_order");
        if (existing && existing.length > 0) {
          const existingNames = new Set(
            existing.map((h) => h.name.toLowerCase()),
          );
          habitsToImport = habits.filter(
            (h) => !existingNames.has(h.name.toLowerCase()),
          );
          skippedCount = habits.length - habitsToImport.length;
          nextSortOrder = Math.max(...existing.map((h) => h.sort_order)) + 1;
        }
      } else {
        const existingNames = new Set(
          mockStore.getHabits().map((h) => h.name.toLowerCase()),
        );
        habitsToImport = habits.filter(
          (h) => !existingNames.has(h.name.toLowerCase()),
        );
        skippedCount = habits.length - habitsToImport.length;
      }

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

      // tempId (from parseUhabitsFile) -> actualId (DB / mock store)
      const habitIdMap = new Map<string, string>();

      // Raw create avoids invalidating the habits query once per habit.
      for (const habit of habitsToImport) {
        const created = await habitMutations.create({
          ...toCreateHabitInput(habit),
          sort_order: isGuest ? undefined : nextSortOrder++,
        });
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

        const remapped = entries
          .filter((e) => habitIdMap.has(e.habit_id))
          .map((e) => ({
            id: crypto.randomUUID(),
            habit_id: habitIdMap.get(e.habit_id)!,
            date: e.date,
            value: e.value,
            created_at: e.created_at,
          }));

        if (isGuest) {
          mockStore.addHabitEntries(remapped);
        } else {
          const supabase = createClient();
          for (let i = 0; i < remapped.length; i += ENTRY_CHUNK_SIZE) {
            const { error } = await supabase
              .from("habit_entries")
              .insert(remapped.slice(i, i + ENTRY_CHUNK_SIZE));
            if (error) throw error;
          }
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
      // Parsing already succeeded, so this is a save failure, not a bad file.
      return reportImportFailure(err, SAVE_ERROR_MESSAGE);
    } finally {
      setIsImporting(false);
    }
  };

  return { importUhabits, isImporting };
}
