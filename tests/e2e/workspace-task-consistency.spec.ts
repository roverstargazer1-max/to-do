import { test, expect, type Page } from "@playwright/test";
import { seedGuestMode, waitForBackAnchor } from "./support/guest-mode";

/**
 * The task-consistency acceptance demonstration (spec: Testing Decisions —
 * the product-layer Playwright specs). One task, both surfaces, both
 * directions, real navigation: created on the tasks page, placed on a
 * workspace canvas as a node, completed from the tasks page (the node shows
 * completed), then completed from the node (the tasks page shows completed).
 *
 * Assertions only read what a user can see — row ink, checkbox state, the
 * node's screen-reader state line — never caches or stores.
 */

const ORIGIN = "http://localhost:3000";

// GlobalHotkeys attaches after hydration, which can land after
// domcontentloaded — retry instead of racing a fixed sleep (task-creation
// spec prior art).
async function openNewTaskViaShortcut(page: Page) {
  await expect(async () => {
    await page.keyboard.press("n");
    await expect(page.getByRole("heading", { name: "New Task" })).toBeVisible({
      timeout: 1000,
    });
  }).toPass({ timeout: 10_000 });
}

async function createWorkspace(page: Page, name: string) {
  await page.goto(`${ORIGIN}/workspaces`, { waitUntil: "domcontentloaded" });
  await waitForBackAnchor(page, "/workspaces");
  await expect(
    page.getByRole("button", { name: /new workspace/i }),
  ).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: /new workspace/i }).click();
  await page.getByLabel("Workspace Name").fill(name);
  // Scoped to the dialog: the empty state behind it has a same-named button.
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create Workspace" })
    .click();
  await page.waitForURL(/\/workspaces\/[^/]+$/);
  await expect(page.getByTestId("workspace-canvas")).toBeVisible({
    timeout: 15000,
  });
}

async function openWorkspace(page: Page, name: string) {
  await page.goto(`${ORIGIN}/workspaces`, { waitUntil: "domcontentloaded" });
  await waitForBackAnchor(page, "/workspaces");
  await page.getByTestId("workspaces-list").getByText(name).click();
  await page.waitForURL(/\/workspaces\/[^/]+$/);
  await expect(page.getByTestId("workspace-canvas")).toBeVisible({
    timeout: 15000,
  });
}

// In-app navigation — the sidebar's All Tasks link is how a user leaves the
// canvas for the tasks page.
async function gotoTasksPage(page: Page) {
  await page.getByRole("link", { name: "All Tasks" }).click();
  await page.waitForURL((url) => url.pathname === "/");
}

test.describe("Workspace task-node consistency (Guest Mode)", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "the desktop canvas with its always-open sidebar is the deterministic surface for these specs",
  );

  test.setTimeout(120_000);

  test("completion flows both ways: tasks page → node, node → tasks page", async ({
    page,
  }) => {
    await seedGuestMode(page, `${ORIGIN}/`);
    const taskContent = `Consistency Task ${Date.now()}`;
    const workspaceName = `Consistency Canvas ${Date.now()}`;

    // Create the task on the tasks page.
    await openNewTaskViaShortcut(page);
    await page.getByPlaceholder("What needs to be done?").fill(taskContent);
    await page.getByRole("button", { name: /create task/i }).click();

    const taskRow = page
      .getByTestId("task-list-container")
      .locator('[data-testid="task-list-row"]', { hasText: taskContent });
    await expect(taskRow).toBeVisible();
    await expect(taskRow.getByRole("checkbox")).not.toBeChecked();

    // Place it on a workspace canvas as a node.
    await createWorkspace(page, workspaceName);
    await page.getByTestId("add-node-menu").click();
    await page.getByTestId("add-node-task").click();
    await page.getByRole("dialog").getByText(taskContent).click();

    // The node is a live reference: active, showing the task's own text.
    const nodeState = page.locator('[data-testid^="task-node-state-"]');
    await expect(nodeState).toHaveText("active");
    await expect(page.getByTestId("workspace-canvas")).toContainText(
      taskContent,
    );

    // --- Direction 1: complete on the tasks page → the node shows completed.
    await gotoTasksPage(page);
    await taskRow.getByRole("checkbox").click();
    await expect(taskRow.getByRole("checkbox")).toBeChecked();
    // The completed ink a user sees: strike-through on the content.
    await expect(taskRow.locator("span.task-ink-completed-text")).toHaveText(
      taskContent,
    );

    await openWorkspace(page, workspaceName);
    await expect(nodeState).toHaveText("completed");
    await expect(
      page
        .getByTestId("workspace-canvas")
        .locator("span.task-ink-completed-text"),
    ).toHaveText(taskContent);

    // Reset for direction 2: uncomplete on the tasks page → node follows back.
    await gotoTasksPage(page);
    await taskRow.getByRole("checkbox").click();
    await expect(taskRow.getByRole("checkbox")).not.toBeChecked();

    await openWorkspace(page, workspaceName);
    await expect(nodeState).toHaveText("active");

    // --- Direction 2: complete from the node → the tasks page shows completed.
    await page.locator('[data-testid^="task-node-toggle-"]').click();
    await expect(nodeState).toHaveText("completed");

    await gotoTasksPage(page);
    await expect(taskRow.getByRole("checkbox")).toBeChecked();
    await expect(taskRow.locator("span.task-ink-completed-text")).toHaveText(
      taskContent,
    );
  });
});
