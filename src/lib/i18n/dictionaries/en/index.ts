import { auth } from "./auth";
import { calendar } from "./calendar";
import { changelog } from "./changelog";
import { command } from "./command";
import { common } from "./common";
import { focus } from "./focus";
import { habits } from "./habits";
import { settings } from "./settings";
import { shortcuts } from "./shortcuts";
import { stats } from "./stats";
import { tasks } from "./tasks";
import { workspace } from "./workspace";

/**
 * The combined English dictionary — the source of truth every other
 * locale implements. `Dictionary` is the compile-time parity guard:
 * zh-CN is typed as this, so a missing key fails `typecheck` inside
 * `npm run validate` (spec D-03, D-07).
 */
export const en = {
  ...common,
  ...settings,
  ...tasks,
  ...command,
  ...shortcuts,
  ...auth,
  ...changelog,
  ...habits,
  ...stats,
  ...calendar,
  ...focus,
  ...workspace,
};

export type Dictionary = typeof en;
export type TranslationKey = keyof Dictionary & string;
