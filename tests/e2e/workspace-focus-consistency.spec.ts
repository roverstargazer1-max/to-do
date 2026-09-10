import { test, expect, type Page } from "@playwright/test";
import { seedGuestMode, waitForBackAnchor } from "./support/guest-mode";

/**
 * The focus-consistency acceptance demonstration (spec: Testing Decisions —
 * the product-layer Playwright specs). One timer, both surfaces, real
 * navigation: a focus node placed on a workspace canvas, the timer started
 * from the focus page (the node shows running), then paused from the node
 * (the focus page shows paused).
 *
 * Assertions only read what a user can see — the state line the focus node
 * exposes to screen readers, the play/pause ink of the focus page's main
 * control — never stores or caches.
 */

const ORIGIN = "http://localhost:3000";

// The telemetry consent banner would otherwise surface mid-flight and cover
// the navigation affordances; a dismissed banner is the steady state a user
// settles into before this journey ever starts.
async function seed(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("telemetry_consent", "denied");
  });
  await seedGuestMode(page, `${ORIGIN}/`);
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

// In-app navigation — the sidebar's Focus link is a client-side transition
// (no back-anchor bounce; AppShell stays mounted), so the URL is the wait.
// exact: role name matching is substring by default, so the spec's own canvas
// must not be named "…Focus…" or the sidebar's workspace entry would shadow
// the link (and the canvas below is named "Timer Canvas" for exactly that
// reason). The sidebar's lists also resolve async — a row can land and shift
// the link under the cursor mid-click — so retry the whole click-and-wait
// rather than racing a fixed sleep (task-creation spec prior art).
async function gotoFocusPage(page: Page) {
  const focusLink = page.getByRole("link", { name: "Focus", exact: true });
  await expect(async () => {
    await focusLink.click();
    await page.waitForURL(/\/focus$/, { timeout: 2000 });
  }).toPass({ timeout: 15000 });
  await expect(page.locator("button.h-20.w-20")).toBeVisible({
    timeout: 15000,
  });
}

// In-app navigation back — the focus page hides the sidebar, so the page's
// own back button is how a user returns to the canvas they came from
// (focus-cold-start-back spec prior art: it is the page's first button).
async function gotoWorkspaceFromFocus(page: Page) {
  await page.getByRole("button").first().click();
  await page.waitForURL(/\/workspaces\/[^/]+$/);
  await expect(page.getByTestId("workspace-canvas")).toBeVisible({
    timeout: 15000,
  });
}

test.describe("Workspace focus-node consistency (Guest Mode)", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "the desktop canvas with its always-open sidebar is the deterministic surface for these specs",
  );

  test.setTimeout(120_000);

  test("timer state flows both ways: focus page start → node running, node pause → focus page paused", async ({
    page,
  }) => {
    await seed(page);
    // "Timer Canvas", not "Focus Canvas": getByRole names match by substring,
    // and a canvas whose name contains "Focus" would shadow the sidebar's
    // Focus link for the navigation below.
    const workspaceName = `Timer Canvas ${Date.now()}`;

    await createWorkspace(page, workspaceName);

    // Place a focus node — no picker; it lands directly at the canvas center.
    await page.getByTestId("add-node-menu").click();
    await page.getByTestId("add-node-focus").click();

    // The node is a live projection of the idle singleton: "paused".
    const nodeState = page.getByTestId("focus-node-timer");
    await expect(nodeState).toHaveText("paused");

    // The focus page's main control, and the play/pause ink a user sees —
    // lucide swaps the icon with the running state.
    const mainControl = page.locator("button.h-20.w-20");
    const playIcon = mainControl.locator("svg.lucide-play");
    const pauseIcon = mainControl.locator("svg.lucide-pause");

    // --- Start on the focus page → the node shows running.
    await gotoFocusPage(page);
    await expect(playIcon).toBeVisible();

    await mainControl.click();
    await expect(pauseIcon).toBeVisible();

    await gotoWorkspaceFromFocus(page);
    await expect(nodeState).toHaveText("running");

    // --- Pause on the node → the focus page shows paused.
    await page.getByTestId("focus-node-pause").click();
    await expect(nodeState).toHaveText("paused");

    await gotoFocusPage(page);
    await expect(playIcon).toBeVisible();
  });
});
