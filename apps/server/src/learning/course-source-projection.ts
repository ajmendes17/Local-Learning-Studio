import { createHash } from "node:crypto";
import type {
  CourseDetail,
  SourcePassage,
} from "@local-learning-studio/contracts";
import type { SourceLibrary } from "../storage/source-library.js";

const MAX_PASSAGES = 120;
const MAX_CHARACTERS = 60_000;
const MAX_PASSAGES_PER_MATERIAL = 50;

export interface ProjectedMaterial {
  id: string;
  originalName: string;
  declaredKind: string;
  passages: SourcePassage[];
}

export interface CourseSourceProjection {
  course: Pick<CourseDetail, "id" | "title" | "code" | "term">;
  materials: ProjectedMaterial[];
  sourceFingerprint: string;
  omittedPassageCount: number;
}

export function buildCourseSourceProjection(
  course: CourseDetail,
  sourceLibrary: SourceLibrary,
): CourseSourceProjection {
  const readyMaterials = course.materials
    .filter(({ status, passageCount }) => status === "ready" && passageCount > 0)
    .sort((left, right) => left.id.localeCompare(right.id));
  const candidates = readyMaterials.map((material) => ({
    material,
    passages: sourceLibrary.getPassages(
      course.id,
      material.id,
      MAX_PASSAGES_PER_MATERIAL,
      0,
    ),
  }));
  const selected = new Map<string, SourcePassage[]>();
  let characterCount = 0;
  let passageCount = 0;

  for (let position = 0; position < MAX_PASSAGES_PER_MATERIAL; position += 1) {
    for (const candidate of candidates) {
      const passage = candidate.passages[position];
      if (!passage) continue;
      if (
        passageCount >= MAX_PASSAGES ||
        characterCount + passage.content.length > MAX_CHARACTERS
      ) {
        continue;
      }
      const passages = selected.get(candidate.material.id) ?? [];
      passages.push(passage);
      selected.set(candidate.material.id, passages);
      characterCount += passage.content.length;
      passageCount += 1;
    }
  }

  const materials = candidates
    .filter(({ material }) => selected.has(material.id))
    .map(({ material }) => ({
      id: material.id,
      originalName: material.originalName,
      declaredKind: material.kind,
      passages: selected.get(material.id)!,
    }));
  const totalPassages = readyMaterials.reduce(
    (total, material) => total + material.passageCount,
    0,
  );
  const fingerprintInput = sourceLibrary
    .getCoursePassageHashes(course.id)
    .map(({ materialId, contentHash }) => `${materialId}:${contentHash}`)
    .join("\n");

  return {
    course: {
      id: course.id,
      title: course.title,
      code: course.code,
      term: course.term,
    },
    materials,
    sourceFingerprint: createHash("sha256")
      .update(`course-source.v1\n${course.id}\n${fingerprintInput}`)
      .digest("hex"),
    omittedPassageCount: Math.max(0, totalPassages - passageCount),
  };
}
