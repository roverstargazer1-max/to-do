import { z } from "zod";
import { parseLocalDateKey } from "@/lib/utils/local-date";
import { validateHabitFrequency } from "@/lib/habits/validation";

export const CreateHabitSchema = z
  .object({
    name: z.string().min(1, "Habit name is required").max(100),
    description: z.string().max(500).optional(),
    color: z
      .string()
      .regex(/^#[A-Fa-f0-9]{6}$/, "Invalid color format")
      .optional(),
    icon: z.string().max(50).optional(),
    start_date: z
      .union([
        z.date(),
        z
          .string()
          .refine(
            (value) => Boolean(parseLocalDateKey(value)),
            "Invalid habit start date",
          ),
      ])
      .optional(),
    habit_type: z.enum(["boolean", "measurable"]).optional(),
    frequency_count: z.number().int().positive().optional(),
    frequency_period: z.enum(["day", "week", "month"]).optional(),
    target_type: z.enum(["at_least", "at_most"]).optional(),
    target_value: z.number().optional(),
    unit: z.string().max(50).optional(),
  })
  .superRefine((habit, ctx) => {
    try {
      validateHabitFrequency(
        habit.frequency_count,
        habit.frequency_period,
        habit.habit_type,
      );
    } catch (error) {
      ctx.addIssue({
        code: "custom",
        path: ["frequency_count"],
        message:
          error instanceof Error ? error.message : "Invalid habit frequency",
      });
    }
  });

export type CreateHabitInput = z.infer<typeof CreateHabitSchema>;
