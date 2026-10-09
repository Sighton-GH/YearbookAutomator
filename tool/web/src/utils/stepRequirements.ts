import type { TopStep } from "../session";

/** Keep these prerequisites aligned with the workflow gates, not optional uploads. */
export function missingStepRequirements(
  step: TopStep,
  state: { hasWorkspace: boolean; slotCount: number; peopleCount: number; unlockAllSteps: boolean },
): string[] {
  if (step === "template" || state.unlockAllSteps) return [];
  const missing: string[] = [];
  if (!state.hasWorkspace || state.slotCount === 0) {
    missing.push("Template: no slots detected yet - upload and parse your template.");
  }
  if (step !== "roster" && state.peopleCount === 0) {
    missing.push("Roster & Photos: upload a roster spreadsheet and portraits ZIP, then import them.");
  }
  return missing;
}
