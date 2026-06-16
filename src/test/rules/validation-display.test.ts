import { describe, it, expect } from "vitest";
import {
  STATUS_LABEL,
  STATUS_BADGE_CLASS,
  PRIORITY_LABEL,
  PRIORITY_BADGE_CLASS,
  ENFORCEMENT_LABEL,
  type ValidationStatus,
  type ValidationPriority,
  type ValidationEnforcement,
} from "@/lib/validation";

const STATUSES: ValidationStatus[] = [
  "draft", "submitted", "pending_post_hoc", "approved", "rejected", "cancelled", "applied", "archived",
];
const PRIORITIES: ValidationPriority[] = ["low", "medium", "high", "critical"];
const ENFORCEMENTS: ValidationEnforcement[] = ["post_hoc", "blocking"];

describe("validation display maps are exhaustive", () => {
  it("every status has a label and a badge class", () => {
    for (const s of STATUSES) {
      expect(STATUS_LABEL[s], `label ${s}`).toBeTruthy();
      expect(STATUS_BADGE_CLASS[s], `badge ${s}`).toBeTruthy();
    }
  });

  it("every priority has a label and a badge class", () => {
    for (const p of PRIORITIES) {
      expect(PRIORITY_LABEL[p], `label ${p}`).toBeTruthy();
      expect(PRIORITY_BADGE_CLASS[p], `badge ${p}`).toBeTruthy();
    }
  });

  it("every enforcement has a label", () => {
    for (const e of ENFORCEMENTS) {
      expect(ENFORCEMENT_LABEL[e], `label ${e}`).toBeTruthy();
    }
  });
});
