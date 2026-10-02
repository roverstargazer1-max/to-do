import { test, expect, type Page } from "@playwright/test";
import { seedGuestMode } from "./support/guest-mode";

// GlobalHotkeys attaches after hydration, which can land after
// domcontentloaded — retry instead of racing a fixed sleep.
async function openNewTaskViaShortcut(page: Page) {
  await expect(async () => {
    await page.keyboard.press("n");
    await expect(page.getByRole("heading", { name: "New Task" })).toBeVisible({
      timeout: 1000,
    });
  }).toPass({ timeout: 10_000 });
}

test.describe("Task Creation (Guest Mode)", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() =>
      localStorage.setItem("telemetry_consent", "denied"),
    );
    await seedGuestMode(page, "http://localhost:3000/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("should create a new task successfully via shortcut", async ({
    page,
  }) => {
    const taskContent = `Test Task ${Date.now()}`;
    await openNewTaskViaShortcut(page);
    await page.getByPlaceholder("What needs to be done?").fill(taskContent);
    await page.getByRole("button", { name: /create task/i }).click();
    await expect(
      page.getByTestId("task-list-container").getByText(taskContent),
    ).toBeVisible();
  });

  test("should have disabled submit button when content is empty", async ({
    page,
  }) => {
    await openNewTaskViaShortcut(page);

    const createBtn = page.getByRole("button", { name: /create task/i });

    await expect(createBtn).toBeDisabled();

    const input = page.getByPlaceholder("What needs to be done?");
    await input.fill("a");
    await expect(createBtn).toBeEnabled();
    await input.fill("");
    await expect(createBtn).toBeDisabled();
  });

  test("should create task with steps and persist them on submit", async ({
    page,
  }) => {
    const taskContent = `Task with Steps ${Date.now()}`;
    await openNewTaskViaShortcut(page);
    await page.getByPlaceholder("What needs to be done?").fill(taskContent);

    // Open steps panel
    await page.getByRole("button", { name: /(subtasks|steps)/i }).click();

    // Add two steps via Enter
    const stepInput = page.getByPlaceholder("Add a step...");
    await stepInput.fill("Step One");
    await stepInput.press("Enter");
    await stepInput.fill("Step Two");
    await stepInput.press("Enter");

    // Submit task
    await page.getByRole("button", { name: /create task/i }).click();

    // Reopen task from list to verify steps were saved
    const taskRow = page
      .getByTestId("task-list-container")
      .getByText(taskContent);
    await expect(taskRow).toBeVisible();
    await taskRow.click();

    // Steps belong to their parent and stay out of the top-level list.
    await expect(
      page
        .getByTestId("task-list-container")
        .getByText("Step One", { exact: true }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: /(subtasks|steps)/i }).click();
    await expect(page.getByText("Step One")).toBeVisible();
    await expect(page.getByText("Step Two")).toBeVisible();
  });

  test("should auto-flush uncommitted step text when saving task", async ({
    page,
  }) => {
    const taskContent = `Task with Uncommitted Step ${Date.now()}`;
    await openNewTaskViaShortcut(page);
    await page.getByPlaceholder("What needs to be done?").fill(taskContent);

    // Open steps panel and type step without pressing Enter
    await page.getByRole("button", { name: /(subtasks|steps)/i }).click();
    await page.getByPlaceholder("Add a step...").fill("Auto-flushed step");

    // Submit task directly
    await page.getByRole("button", { name: /create task/i }).click();

    // Reopen task from list to verify uncommitted step was flushed & saved
    const taskRow = page
      .getByTestId("task-list-container")
      .getByText(taskContent);
    await expect(taskRow).toBeVisible();
    await taskRow.click();

    await page.getByRole("button", { name: /(subtasks|steps)/i }).click();
    await expect(page.getByText("Auto-flushed step")).toBeVisible();
  });

  test("persists a changed start date after reopening and reloading", async ({
    page,
    request,
    isMobile,
  }) => {
    test.skip(isMobile, "desktop date picker verification");
    const content = `Start date audit ${crypto.randomUUID()}`;
    const today = await page.evaluate(() => {
      const date = new Date();
      date.setHours(12, 0, 0, 0);
      return date.toISOString();
    });
    const response = await request.post("/api/db/tasks", {
      data: { content, do_date: today },
    });
    expect(response.ok()).toBe(true);
    const task = await response.json();
    try {
      await page.reload();
      const row = page
        .getByTestId("task-list-container")
        .getByText(content, { exact: true });
      await row.click();
      await page.getByTitle("Set start date", { exact: true }).click();
      await page.getByRole("button", { name: "Tomorrow", exact: true }).click();
      await page
        .getByRole("button", { name: "Done", exact: true })
        .click({ timeout: 5000 });
      await page
        .getByRole("button", { name: "Save changes", exact: true })
        .click();
      const tomorrow = await page.evaluate(() => {
        const date = new Date();
        date.setDate(date.getDate() + 1);
        date.setHours(12, 0, 0, 0);
        return date.toISOString();
      });
      await expect
        .poll(async () => {
          const tasks = await (
            await request.get("/api/db/tasks?showCompleted=true")
          ).json();
          return tasks.find((item: { id: string }) => item.id === task.id)
            ?.do_date;
        })
        .toBe(tomorrow);
      await page.reload();
      await row.click();
      await expect(
        page.getByTitle("Set start date", { exact: true }),
      ).toContainText(new Date(tomorrow).getDate().toString());
    } finally {
      // A timed-out browser fixture may already be disposed; retain the original failure.
      await request
        .delete(`/api/db/tasks?id=${task.id}`)
        .catch(() => undefined);
    }
  });
});
