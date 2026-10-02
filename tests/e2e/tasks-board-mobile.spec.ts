import {
  test,
  expect,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { randomUUID } from "node:crypto";

/**
 * Board view at a phone viewport — see ADR 0007. Columns are 85vw, so a card
 * only reaches the next column via edge auto-scroll, which needs the board to
 * actually overflow.
 *
 * Aimed at mobile-webkit: Chromium tolerated snap during a drag when this was
 * written, so the snap assertion pins the decision rather than a reproduced bug.
 */

const UI_KEY = "kanso-ui-state";
const BOARD = '[data-testid="task-board-container"]';

async function bootstrap(
  page: Page,
  request: APIRequestContext,
  viewMode: "board" | "list",
) {
  const runId = randomUUID();
  const tasks = Array.from({ length: 6 }, (_, i) => ({
    id: `board-mobile-${runId}-${i}`,
    content: `Board mobile ${runId} Task ${i}`,
    day_order: i,
  }));

  for (const task of tasks) {
    const response = await request.post("/api/db/tasks", {
      data: task,
    });
    expect(response.ok(), `failed to seed task ${task.id}`).toBe(true);
  }

  await page.context().addCookies([
    {
      name: "kanso_guest_mode",
      value: "true",
      domain: "localhost",
      path: "/",
    },
  ]);

  await page.addInitScript(
    ([uiKey, mode]) => {
      localStorage.setItem("kanso_guest_mode", "true");
      localStorage.setItem("telemetry_consent", "denied");
      localStorage.setItem(
        uiKey as string,
        JSON.stringify({
          state: { viewMode: mode, groupBy: "none", sortBy: "custom" },
          version: 1,
        }),
      );
    },
    [UI_KEY, viewMode] as const,
  );

  await page.goto("/");

  return {
    firstTaskName: tasks[0].content,
    cleanup: async () => {
      await Promise.all(
        tasks.map((task) =>
          request.delete(`/api/db/tasks?id=${encodeURIComponent(task.id)}`),
        ),
      );
    },
  };
}

test.describe("Tasks board on mobile", () => {
  test.skip(
    ({ viewport }) => (viewport?.width ?? 0) > 500,
    "mobile viewport only",
  );

  test("Board is reachable from the view switcher", async ({
    page,
    request,
  }) => {
    const fixture = await bootstrap(page, request, "list");
    try {
      const boardTab = page.getByRole("tab", { name: /board/i });
      await expect(boardTab).toBeVisible({ timeout: 15000 });

      await boardTab.click();
      await expect(page.locator(BOARD)).toBeVisible();
    } finally {
      await fixture.cleanup();
    }
  });

  test("renders both fallback columns when Evening is empty", async ({
    page,
    request,
  }) => {
    const fixture = await bootstrap(page, request, "board");
    try {
      await expect(page.locator(BOARD)).toBeVisible({ timeout: 15000 });

      await expect(page.getByRole("heading", { name: /^Tasks/ })).toBeVisible();
      await expect(
        page.getByRole("heading", { name: /^This Evening/ }),
      ).toBeVisible();
    } finally {
      await fixture.cleanup();
    }
  });

  test("suspends scroll-snap while a card is being dragged", async ({
    page,
    request,
  }) => {
    const fixture = await bootstrap(page, request, "board");
    try {
      const board = page.locator(BOARD);
      await expect(board).toBeVisible({ timeout: 15000 });

      await expect(board).toHaveClass(/snap-mandatory/);

      const card = page
        .getByText(fixture.firstTaskName, { exact: true })
        .first();
      const box = await card.boundingBox();
      if (!box) throw new Error(`no bounding box for ${fixture.firstTaskName}`);
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;

      await page.mouse.move(cx, cy);
      await page.mouse.down();
      // Cross the 5px activation distance.
      await page.mouse.move(cx + 12, cy, { steps: 4 });

      await expect(board).not.toHaveClass(/snap-mandatory/);

      await page.mouse.up();
      await expect(board).toHaveClass(/snap-mandatory/);
    } finally {
      await fixture.cleanup();
    }
  });

  test("auto-scrolls toward the next column during a cross-column drag", async ({
    page,
    request,
  }) => {
    const fixture = await bootstrap(page, request, "board");
    try {
      const board = page.locator(BOARD);
      await expect(board).toBeVisible({ timeout: 15000 });

      const startScroll = await board.evaluate((el) => el.scrollLeft);

      const card = page
        .getByText(fixture.firstTaskName, { exact: true })
        .first();
      const box = await card.boundingBox();
      if (!box) throw new Error(`no bounding box for ${fixture.firstTaskName}`);
      const cy = box.y + box.height / 2;

      await page.mouse.move(box.x + box.width / 2, cy);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 12, cy, { steps: 4 });

      // Hold at the edge to engage auto-scroll.
      const width = page.viewportSize()?.width ?? 360;
      await page.mouse.move(width - 6, cy, { steps: 10 });
      await page.waitForTimeout(800);

      const draggingScroll = await board.evaluate((el) => el.scrollLeft);
      await page.mouse.up();

      expect(draggingScroll).toBeGreaterThan(startScroll);
    } finally {
      await fixture.cleanup();
    }
  });
});
