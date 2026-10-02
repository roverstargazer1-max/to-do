import { test, expect } from "@playwright/test";

test("a fresh browser does not manufacture legacy demo data", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(
    () => localStorage.getItem("kanso_sqlite_migrated_v1") === "true",
  );

  expect(
    await page.evaluate(() => localStorage.getItem("kanso_guest_data_v11")),
  ).toBeNull();
});

test("a stale browser copy cannot overwrite current SQLite data on startup", async ({
  page,
  request,
}) => {
  const content = `Current local edit ${crypto.randomUUID()}`;
  const created = await request.post("/api/db/tasks", {
    data: { content },
  });
  expect(created.ok()).toBe(true);
  const task = await created.json();

  try {
    await page.addInitScript((legacyTask) => {
      localStorage.setItem("telemetry_consent", "denied");
      localStorage.setItem(
        "kanso_guest_data_v11",
        JSON.stringify({
          tasks: [{ ...legacyTask, content: "Stale browser copy" }],
          projects: [],
          habits: [],
          habit_entries: [],
          focus_logs: [],
          events: [],
        }),
      );
    }, task);
    await page.goto("/");
    await page.waitForFunction(
      () => localStorage.getItem("kanso_sqlite_migrated_v1") === "true",
    );

    const tasks = await (
      await request.get("/api/db/tasks?showCompleted=true")
    ).json();
    expect(
      tasks.find((item: { id: string }) => item.id === task.id),
    ).toMatchObject({
      content,
    });
    await expect(
      page
        .getByTestId("task-list-container")
        .getByText(content, { exact: true }),
    ).toBeVisible();
  } finally {
    await request.delete(`/api/db/tasks?id=${task.id}`);
  }
});
