import { test, expect } from "@playwright/test";
import { seedGuestMode } from "./support/guest-mode";

test.use({ timezoneId: "Asia/Shanghai" });
test("an open logbook includes today's task after local midnight", async ({
  page,
  request,
}) => {
  const title = `Midnight completed ${crypto.randomUUID()}`;
  const task = await (
    await request.post("/api/db/tasks", {
      data: {
        content: title,
        is_completed: true,
        completed_at: "2026-10-03T15:30:00Z",
      },
    })
  ).json();
  try {
    await page.addInitScript(() =>
      localStorage.setItem("telemetry_consent", "denied"),
    );
    await page.clock.install();
    await seedGuestMode(page, "http://localhost:3000/");
    await expect(
      page.getByRole("listbox", { name: "Task list" }),
    ).toBeVisible();
    await expect(page.getByText(title, { exact: true })).toBeVisible();
    await page.clock.setSystemTime(new Date("2026-10-03T15:59:30Z"));
    const completed = page.getByRole("button", {
      name: "Completed",
      exact: true,
    });
    if (await completed.isVisible()) await completed.click();
    else {
      await page
        .getByRole("button", { name: "More options", exact: true })
        .click();
      await page
        .getByRole("menuitem", { name: "Completed Tasks", exact: true })
        .click();
    }
    await expect(
      page.getByRole("heading", { name: "Logbook", exact: true }),
    ).toBeVisible();
    const logbook = page.getByRole("dialog").or(page.getByRole("alertdialog"));
    await expect(logbook.getByText(title, { exact: true })).toHaveCount(0);
    await page.clock.fastForward(60000);
    await expect(logbook.getByText(title, { exact: true })).toBeVisible();
  } finally {
    await request.delete(`/api/db/tasks?id=${task.id}`).catch(() => undefined);
  }
});
