import type { MaterialKind } from "@local-learning-studio/contracts";

export const materialKindLabels: Record<MaterialKind, string> = {
  syllabus: "Syllabus",
  "lecture-notes": "Lecture notes",
  reading: "Reading",
  assignment: "Assignment",
  "study-guide": "Study guide",
  other: "Other",
};
export const materialKinds = Object.entries(materialKindLabels) as Array<[MaterialKind, string]>;
