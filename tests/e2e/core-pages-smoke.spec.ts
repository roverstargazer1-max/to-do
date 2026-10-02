import { test, expect } from "@playwright/test";
import { seedGuestMode } from "./support/guest-mode";

test("main pages and settings sections remain accessible", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() =>
    localStorage.setItem("telemetry_consent", "denied"),
  );
  await seedGuestMode(page, "http://localhost:3000/workspaces");
  await expect(
    page.getByRole("heading", { name: "Workspaces", level: 1, exact: true }),
  ).toBeVisible();
  // Navigate as a user would, without aborting a previous document's chunks.
  for (const [route, linkName, heading] of [
    ["habits", "Habits", "Habits"],
    ["stats", "Stats", "Statistics"],
    ["settings", "Settings", "Settings"],
  ]) {
    const link = page
      .getByRole("link", { name: linkName, exact: true })
      .first();
    const bottomNavButton = page
      .getByRole("navigation")
      .getByRole("button", { name: linkName, exact: true });
    if (await bottomNavButton.isVisible()) {
      await bottomNavButton.click();
    } else {
      if (!(await link.isVisible())) {
        await page
          .getByRole("button", { name: "Toggle Sidebar", exact: true })
          .first()
          .click();
      }
      await link.click();
    }
    await page.waitForURL((url) => url.pathname === `/${route}`);
    await expect(
      page.getByRole("dialog", { name: "Sidebar", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: heading, level: 1, exact: true }),
    ).toBeVisible();
  }
  await page.getByRole("tab", { name: "Preferences", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Preferences", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Account", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Account", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
