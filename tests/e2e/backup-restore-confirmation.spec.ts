import { test, expect } from "@playwright/test";
import { seedGuestMode } from "./support/guest-mode";

test("selecting a ZIP previews replacement; only confirmation restores it", async ({
  page,
  request,
}, testInfo) => {
  await page.addInitScript(() =>
    localStorage.setItem("telemetry_consent", "denied"),
  );
  const beforeTitle = `Backup retained ${crypto.randomUUID()}`;
  const afterTitle = `Backup newer ${crypto.randomUUID()}`;
  const before = await (
    await request.post("/api/db/tasks", { data: { content: beforeTitle } })
  ).json();
  let afterId: string | undefined;
  try {
    await seedGuestMode(page, "http://localhost:3000/settings");
    await page.getByRole("tab", { name: "Account", exact: true }).click();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const download = await downloadPromise;
    const zipPath = testInfo.outputPath("backup.zip");
    await download.saveAs(zipPath);
    const after = await (
      await request.post("/api/db/tasks", { data: { content: afterTitle } })
    ).json();
    afterId = after.id;
    const titles = async () =>
      (
        await (await request.get("/api/db/tasks?showCompleted=true")).json()
      ).map((task: { content: string }) => task.content);
    const fileInput = page.getByLabel("Import backup file", { exact: true });
    await fileInput.setInputFiles(zipPath);
    await expect(
      page.getByText("Replace your data?", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/This backup was taken/)).toBeVisible();
    await expect(page.getByText(/Tasks: \d+/)).toBeVisible();
    expect(await titles()).toContain(afterTitle);

    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(
      page.getByText("Replace your data?", { exact: true }),
    ).toHaveCount(0);
    expect(await titles()).toContain(afterTitle);

    // The same file can be selected again after canceling.
    await fileInput.setInputFiles(zipPath);
    await expect(
      page.getByText("Replace your data?", { exact: true }),
    ).toBeVisible();
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/db/migrate-legacy") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Replace", exact: true }).click();
    expect((await responsePromise).ok()).toBe(true);
    await expect.poll(titles).toContain(beforeTitle);
    await expect.poll(titles).not.toContain(afterTitle);

    await fileInput.setInputFiles({
      name: "broken.zip",
      mimeType: "application/zip",
      buffer: Buffer.from("not a ZIP"),
    });
    await expect(page.getByText(/Failed to import backup/)).toBeVisible();
    await expect(
      page.getByText("Replace your data?", { exact: true }),
    ).toHaveCount(0);
    expect(await titles()).toContain(beforeTitle);
  } finally {
    await request
      .delete(`/api/db/tasks?id=${before.id}`)
      .catch(() => undefined);
    if (afterId)
      await request
        .delete(`/api/db/tasks?id=${afterId}`)
        .catch(() => undefined);
  }
});
