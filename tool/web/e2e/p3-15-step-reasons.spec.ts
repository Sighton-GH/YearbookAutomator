import { expect, test } from "@playwright/test";

// No real data or licence: mock only the API boundaries for a fresh project.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem("ymga_license_key", "fictional-test-key");
    localStorage.setItem("ymga-tour-seen-v1", "1");
  });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const responses: Record<string, unknown> = {
      "/api/licensing/validate": { valid: true, license_type: "personal", unlock_all_steps: false },
      "/api/workspaces/resolve": { workspace_id: "fictional-workspace", license_type: "personal" },
      "/api/workspaces/state": { workspace_id: "fictional-workspace", default_baby_filename: null, default_mugshot_filenames: [] },
      "/api/admin/settings/features": {},
      "/api/fonts/list": { fonts: [] },
    };
    await route.fulfill({ json: responses[path] ?? {} });
  });
  await page.goto("/");
});

test("locked People step exposes every missing prerequisite without navigating", async ({ page }) => {
  const rail = page.getByRole("navigation", { name: "Workflow steps" });
  const people = rail.getByRole("button", { name: "People", exact: true });
  await expect(people).toHaveAttribute("aria-disabled", "true");
  await expect(people).not.toHaveAttribute("disabled", "");
  // Playwright blocks aria-disabled clicks by default; users can still click for help.
  await people.click({ force: true });
  const reasonId = await people.getAttribute("aria-describedby");
  expect(reasonId).toBeTruthy();
  const reason = page.locator(`[id="${reasonId}"]`);
  await expect(reason).toBeVisible();
  await expect(reason).toContainText("Template: no slots detected yet");
  await expect(reason).toContainText("Roster & Photos: upload a roster spreadsheet");
  await expect(reason.locator("..")).toHaveAttribute("aria-live", "polite");
  await expect(rail.getByRole("button", { name: "Template", exact: true })).toHaveAttribute("aria-current", "step");
});

test("Continue explains its prerequisite inline and remains keyboard focusable", async ({ page }) => {
  const buttons = page.getByRole("button", { name: "Continue to Uploads" });
  await expect(buttons).toHaveCount(2);
  const reasonIds: string[] = [];
  for (const button of await buttons.all()) {
    await expect(button).toHaveAttribute("aria-disabled", "true");
    await button.focus();
    await expect(button).toBeFocused();
    await button.press("Enter");
    const id = await button.getAttribute("aria-describedby");
    reasonIds.push(id!);
    await expect(page.locator(`[id="${id}"]`)).toBeVisible();
    await expect(page.locator(`[id="${id}"]`)).toContainText("upload and parse your template");
  }
  expect(new Set(reasonIds).size).toBe(2);
  const people = page.getByRole("navigation", { name: "Workflow steps" }).getByRole("button", { name: "People", exact: true });
  await people.focus();
  await people.press("Enter");
  await expect(page.locator(`[id="${await people.getAttribute("aria-describedby")}"]`)).toBeVisible();
});

test("missing prerequisites match existing gates, including the licence override", async () => {
  const { missingStepRequirements } = await import("../src/utils/stepRequirements");
  const fresh = { hasWorkspace: false, slotCount: 0, peopleCount: 0, unlockAllSteps: false };
  expect(missingStepRequirements("template", fresh)).toEqual([]);
  expect(missingStepRequirements("roster", fresh)).toHaveLength(1);
  for (const step of ["people", "style", "generate"] as const) {
    expect(missingStepRequirements(step, fresh)).toHaveLength(2);
    const templateOnly = { ...fresh, hasWorkspace: true, slotCount: 1 };
    expect(missingStepRequirements(step, templateOnly)).toEqual([
      "Roster & Photos: upload a roster spreadsheet and portraits ZIP, then import them.",
    ]);
    expect(missingStepRequirements(step, { ...templateOnly, peopleCount: 1 })).toEqual([]);
    expect(missingStepRequirements(step, { ...fresh, unlockAllSteps: true })).toEqual([]);
  }
  expect(missingStepRequirements("roster", { ...fresh, hasWorkspace: true, slotCount: 1 })).toEqual([]);
});
