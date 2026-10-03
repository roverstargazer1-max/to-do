import { test, expect, type Page } from "@playwright/test";
import { seedGuestMode, waitForBackAnchor } from "./support/guest-mode";

async function openNewHabit(page: Page) {
  const newHabit = page.getByRole("button", { name: "New Habit", exact: true });
  if (await newHabit.isVisible()) await newHabit.click();
  else
    await page
      .getByRole("button", { name: "Create Habit", exact: true })
      .click();
}

for (const timezone of ["Asia/Shanghai", "UTC", "America/Los_Angeles"]) {
  test.describe(`habit calendar dates in ${timezone}`, () => {
    test.use({ timezoneId: timezone });

    test("keeps a local date through creating, editing and reloading", async ({
      page,
      request,
    }) => {
      const name = `Local date habit ${crypto.randomUUID()}`;
      await page.addInitScript(() =>
        localStorage.setItem("telemetry_consent", "denied"),
      );
      await seedGuestMode(page, "http://localhost:3000/habits");
      await page.clock.setFixedTime(
        await page.evaluate(() => new Date(2026, 11, 31, 0, 30).toISOString()),
      );
      const dates = await page.evaluate(() => {
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const key = (date: Date) =>
          `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
        return {
          today: key(today),
          tomorrow: key(tomorrow),
          tomorrowLabel: tomorrow.toLocaleDateString(),
        };
      });
      try {
        await openNewHabit(page);
        await page.getByPlaceholder("Habit name", { exact: true }).fill(name);
        await page
          .getByRole("button", { name: "Start habit", exact: true })
          .click();
        const habit = page.getByText(name, { exact: true });
        await expect(habit).toBeVisible();
        await expect
          .poll(async () => {
            const rows = await (await request.get("/api/db/habits")).json();
            return rows.find((row: { name: string }) => row.name === name)
              ?.start_date;
          })
          .toBe(dates.today);
        await habit.click();
        const dateButton = page
          .getByRole("dialog", { name: "Edit Habit", exact: true })
          .getByRole("button")
          .filter({ has: page.locator("svg.lucide-calendar") });
        await dateButton.click();
        // Habit start dates are calendar dates, with no time-of-day input.
        await expect(
          page.getByRole("tab", { name: /\d{1,2}:\d{2}/ }),
        ).toHaveCount(0);
        await page
          .getByRole("button", { name: "Tomorrow", exact: true })
          .click();
        await page.getByRole("button", { name: "Done", exact: true }).click();
        await page
          .getByRole("button", { name: "Save changes", exact: true })
          .click();
        await expect
          .poll(async () => {
            const rows = await (await request.get("/api/db/habits")).json();
            return rows.find((row: { name: string }) => row.name === name)
              ?.start_date;
          })
          .toBe(dates.tomorrow);
        await page.reload();
        await waitForBackAnchor(page, "/habits");
        await habit.click();
        await dateButton.click();
        await expect(
          page.locator('button[data-selected-single="true"]'),
        ).toHaveAttribute("data-day", dates.tomorrowLabel);
      } finally {
        const rows = await (
          await request.get("/api/db/habits").catch(() => null)
        )?.json();
        const row = rows?.find((item: { name: string }) => item.name === name);
        if (row)
          await request
            .delete(`/api/db/habits?id=${row.id}`)
            .catch(() => undefined);
      }
    });
  });
}

test("boolean frequency stays attainable and legacy values need explicit adjustment", async ({
  page,
  request,
}) => {
  const name = `Frequency habit ${crypto.randomUUID()}`;
  const legacyName = `Legacy frequency ${crypto.randomUUID()}`;
  const legacyResponse = await request.post("/api/db/habits", {
    data: {
      name: legacyName,
      habitType: "boolean",
      frequencyCount: 2,
      frequencyPeriod: "day",
      source_uuid: crypto.randomUUID(),
    },
  });
  expect(legacyResponse.ok()).toBe(true);
  expect(await legacyResponse.json()).toMatchObject({ frequency_count: 2 });
  await page.addInitScript(() =>
    localStorage.setItem("telemetry_consent", "denied"),
  );
  try {
    await seedGuestMode(page, "http://localhost:3000/habits");
    await openNewHabit(page);
    const more = page.getByRole("button", { name: "More days", exact: true });
    const fewer = page.getByRole("button", { name: "Fewer days", exact: true });
    await expect(more).toBeDisabled();
    await page.getByRole("button", { name: "Week", exact: true }).click();
    for (let i = 0; i < 6; i++) await more.click();
    await expect(more).toBeDisabled();
    await page.getByRole("button", { name: "Day", exact: true }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: /exceeds 1 available days/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Start habit", exact: true }),
    ).toBeDisabled();
    await fewer.click();
    await expect(
      page.getByRole("alert").filter({ hasText: /exceeds 1 available days/ }),
    ).toHaveCount(0);
    await page.getByPlaceholder("Habit name", { exact: true }).fill(name);
    await page
      .getByRole("button", { name: "Start habit", exact: true })
      .click();
    await expect(page.getByText(name, { exact: true })).toBeVisible();
    await page.getByText(legacyName, { exact: true }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: /exceeds 1 available days/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Save changes", exact: true }),
    ).toBeDisabled();
    const rows = await (await request.get("/api/db/habits")).json();
    const legacy = rows.find(
      (row: { name: string }) => row.name === legacyName,
    );
    expect(legacy.frequency_count).toBe(2);
    await fewer.click();
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect
      .poll(async () => {
        const saved = await (await request.get("/api/db/habits")).json();
        return saved.find((row: { name: string }) => row.name === legacyName)
          ?.frequency_count;
      })
      .toBe(1);
  } finally {
    const rows = await (await request.get("/api/db/habits")).json();
    for (const row of rows.filter((item: { name: string }) =>
      [name, legacyName].includes(item.name),
    )) {
      await request.delete(`/api/db/habits?id=${row.id}`);
    }
  }
});
