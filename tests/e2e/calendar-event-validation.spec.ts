import { test, expect } from "@playwright/test";
import { seedGuestMode } from "./support/guest-mode";

test("an event date edit requires a valid range before it can be saved", async ({
  page,
  request,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("telemetry_consent", "denied"),
  );
  const dates = await page.evaluate(() => {
    const start = new Date();
    start.setHours(10, 0, 0, 0);
    const end = new Date(start);
    end.setHours(11);
    const tomorrowStart = new Date(start);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    const tomorrowEnd = new Date(end);
    tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);
    return {
      start: start.toISOString(),
      end: end.toISOString(),
      tomorrowStart: tomorrowStart.toISOString(),
      tomorrowEnd: tomorrowEnd.toISOString(),
      label: new Intl.DateTimeFormat("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      }).format(start),
    };
  });
  const title = `Event range audit ${crypto.randomUUID()}`;
  const created = await request.post("/api/db/calendar-events", {
    data: { title, start_time: dates.start, end_time: dates.end },
  });
  expect(created.ok()).toBe(true);
  const event = await created.json();
  try {
    await seedGuestMode(page);
    // Next's development badge overlaps the mobile dialog footer.
    await page.addStyleTag({ content: "nextjs-portal { display: none; }" });
    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name: "Schedule", exact: true }).click();
    await page.getByText(title, { exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Edit Event", exact: true }),
    ).toBeVisible();
    const dateButtons = page.getByRole("button", {
      name: new RegExp(`^${dates.label}`),
    });
    await dateButtons.first().click();
    await page.getByRole("button", { name: "Tomorrow", exact: true }).click();
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Done", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Save changes", exact: true }),
    ).toBeDisabled();
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "End time must be after start time." }),
    ).toBeVisible();

    // Repair the end and verify a valid range reaches SQLite.
    await dateButtons.click();
    await page.getByRole("button", { name: "Tomorrow", exact: true }).click();
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Done", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Save changes", exact: true }),
    ).toBeEnabled();
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect
      .poll(async () => {
        const events = await (
          await request.get("/api/db/calendar-events")
        ).json();
        const saved = events.find(
          (item: { id: string }) => item.id === event.id,
        );
        return [saved?.start_time, saved?.end_time];
      })
      .toEqual([dates.tomorrowStart, dates.tomorrowEnd]);
  } finally {
    await request
      .delete(`/api/db/calendar-events?id=${event.id}`)
      .catch(() => undefined);
  }
});
