import type { Dictionary } from "../en";
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
 * The combined zh-CN dictionary, typed as `Dictionary` so the compiler
 * enforces key parity with English (spec D-03, D-07). Glossary terms are
 * used verbatim: Kagelin is never translated.
 */
export const zhCN: Dictionary = {
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
