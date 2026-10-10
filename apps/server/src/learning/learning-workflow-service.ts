import { createHash, randomUUID } from "node:crypto";
import {
  CourseLearningArtifactsResponseSchema,
  CourseMapAssessmentProposalSchema,
  CourseMapConceptProposalSchema,
  CourseMapModuleProposalSchema,
  CourseMapArtifactSchema,
  CourseMapProposalSchema,
  type CodexTask,
  SourceClassificationArtifactSchema,
  SourceClassificationProposalSchema,
} from "@local-learning-studio/contracts";
import type { z } from "zod";
import { z as zod } from "zod";
import type {
  CodexRunResult,
} from "../codex/codex-runner.js";
import type { CourseLibrary } from "../storage/course-library.js";
import type { CourseStructureLibrary } from "../storage/course-structure-library.js";
import type { LearningArtifactLibrary } from "../storage/learning-artifact-library.js";
import type { SourceLibrary } from "../storage/source-library.js";
import {
  buildCourseSourceProjection,
  type CourseSourceProjection,
} from "./course-source-projection.js";

const ModelSourceReferenceSchema = zod.object({
  passageKey: zod.string().trim().min(1).max(80),
});
const ModelCourseMapProposalSchema = zod.object({
  schemaVersion: zod.literal("course-map.v1"),
  modules: zod.array(CourseMapModuleProposalSchema.omit({ sourceReferences: true }).extend({ sourceReferences: zod.array(ModelSourceReferenceSchema).min(1) })).min(1),
  concepts: zod.array(CourseMapConceptProposalSchema.omit({ sourceReferences: true }).extend({ sourceReferences: zod.array(ModelSourceReferenceSchema).min(1) })).min(1),
  assessments: zod.array(CourseMapAssessmentProposalSchema.omit({ sourceReferences: true }).extend({ sourceReferences: zod.array(ModelSourceReferenceSchema).min(1) })),
  warnings: zod.array(zod.string()),
});
type ModelCourseMapProposal = z.infer<typeof ModelCourseMapProposalSchema>;

export interface LearningCodexClient {
  status(): Promise<unknown>;
  run<T>(
    task: CodexTask,
    prompt: string,
    outputSchema: z.ZodType<T>,
  ): Promise<CodexRunResult<T>>;
}

export interface LearningOperationReporter {
  cached(event: { courseId: string; phase: "classification" | "course-map" }): void;
  started(event: { operationId: string; courseId: string; phase: "classification" | "course-map"; model: string; promptCharacters: number; sourceStats: CourseSourceProjection["sourceStats"]; omittedPassageCount: number }): void;
  completed(event: { operationId: string; courseId: string; phase: "classification" | "course-map"; result: CodexRunResult<unknown> }): void;
  failed(event: { operationId: string; courseId: string; phase: "classification" | "course-map" }): void;
}

export type LearningWorkflowErrorCode =
  | "course_not_found"
  | "no_sources"
  | "classification_required"
  | "artifact_not_found"
  | "invalid_source_references";

export class LearningWorkflowError extends Error {
  constructor(
    readonly code: LearningWorkflowErrorCode,
    message: string,
    readonly diagnostics?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "LearningWorkflowError";
  }
}

export class LearningWorkflowService {
  constructor(
    private readonly courses: CourseLibrary,
    private readonly sources: SourceLibrary,
    private readonly artifacts: LearningArtifactLibrary,
    private readonly structures: CourseStructureLibrary,
    private readonly codex: LearningCodexClient,
    private readonly operations?: LearningOperationReporter,
  ) {}

  getArtifacts(courseId: string) {
    const projection = buildCourseSourceProjection(
      this.requireCourse(courseId),
      this.sources,
    );
    const classification = this.artifacts.latest(
      courseId,
      "source-classification",
    );
    const courseMap = this.artifacts.latest(courseId, "course-map");
    const classificationCurrent =
      classification?.kind === "source-classification" &&
      classification.sourceFingerprint === projection.sourceFingerprint;
    const expectedMapFingerprint = classificationCurrent
      ? this.courseMapFingerprint(
          projection.sourceFingerprint,
          classification.payload,
        )
      : null;
    return CourseLearningArtifactsResponseSchema.parse({
      classification,
      courseMap,
      classificationCurrent,
      courseMapCurrent:
        courseMap?.kind === "course-map" &&
        courseMap.sourceFingerprint === expectedMapFingerprint,
    });
  }

  getAcceptedCourseMap(courseId: string) {
    this.requireCourse(courseId);
    return this.artifacts.acceptedCourseMap(courseId);
  }

  getCurrentAcceptedCourseMap(courseId: string) {
    const current = this.getArtifacts(courseId);
    return current.classificationCurrent && current.courseMapCurrent && current.courseMap?.status === "accepted"
      ? current.courseMap
      : null;
  }

  async classifySources(courseId: string, regenerate = false) {
    const projection = this.projection(courseId);
    if (!regenerate) {
      const cached = this.artifacts.findByFingerprint(
        courseId,
        "source-classification",
        projection.sourceFingerprint,
      );
      if (cached) {
        this.operations?.cached({ courseId, phase: "classification" });
        return SourceClassificationArtifactSchema.parse(cached);
      }
    }

    const result = await this.runTracked(courseId, "classification", "classify-course-sources", this.classificationPrompt(projection), SourceClassificationProposalSchema);
    this.validateClassification(projection, result.output);
    return this.artifacts.saveClassification({
      courseId,
      sourceFingerprint: projection.sourceFingerprint,
      model: result.model,
      payload: result.output,
    });
  }

  async buildCourseMap(courseId: string, regenerate = false) {
    const projection = this.projection(courseId);
    const classification = this.artifacts.findByFingerprint(
      courseId,
      "source-classification",
      projection.sourceFingerprint,
    );
    if (!classification || classification.kind !== "source-classification") {
      throw new LearningWorkflowError(
        "classification_required",
        "Analyze the current course sources before building a course map.",
      );
    }
    const mapFingerprint = this.courseMapFingerprint(
      projection.sourceFingerprint,
      classification.payload,
    );
    if (!regenerate) {
      const cached = this.artifacts.findByFingerprint(
        courseId,
        "course-map",
        mapFingerprint,
      );
      if (cached) {
        this.operations?.cached({ courseId, phase: "course-map" });
        return CourseMapArtifactSchema.parse(cached);
      }
    }

    const passageKeys = this.passageKeys(projection);
    const result = await this.runTracked(courseId, "course-map", "map-course", this.courseMapPrompt(projection, classification.payload, passageKeys), ModelCourseMapProposalSchema);
    const proposal = this.resolveCourseMapReferences(projection, result.output, passageKeys);
    this.validateCourseMap(projection, proposal);
    return this.artifacts.saveCourseMap({
      courseId,
      sourceFingerprint: mapFingerprint,
      model: result.model,
      payload: proposal,
    });
  }

  private async runTracked<T>(courseId: string, phase: "classification" | "course-map", task: CodexTask, prompt: string, schema: z.ZodType<T>) {
    const operationId = randomUUID();
    const projection = this.projection(courseId);
    this.operations?.started({ operationId, courseId, phase, model: task === "classify-course-sources" ? "Luna" : "Terra", promptCharacters: prompt.length, sourceStats: projection.sourceStats, omittedPassageCount: projection.omittedPassageCount });
    try {
      const result = await this.codex.run(task, prompt, schema);
      this.operations?.completed({ operationId, courseId, phase, result });
      return result;
    } catch (error) {
      this.operations?.failed({ operationId, courseId, phase });
      throw error;
    }
  }

  acceptCourseMap(courseId: string, artifactId: string) {
    const projection = this.projection(courseId);
    const classification = this.artifacts.findByFingerprint(
      courseId,
      "source-classification",
      projection.sourceFingerprint,
    );
    if (!classification || classification.kind !== "source-classification") {
      throw new LearningWorkflowError(
        "classification_required",
        "Analyze the current course sources before accepting a course map.",
      );
    }
    const currentMap = this.artifacts.findByFingerprint(
      courseId,
      "course-map",
      this.courseMapFingerprint(
        projection.sourceFingerprint,
        classification.payload,
      ),
    );
    if (!currentMap || currentMap.id !== artifactId) {
      throw new LearningWorkflowError(
        "artifact_not_found",
        "This course-map draft is stale. Build a new map from the current sources.",
      );
    }
    const accepted = this.artifacts.acceptCourseMap(
      courseId,
      artifactId,
      (proposal) => this.structures.replaceFromCourseMap(courseId, proposal),
    );
    if (!accepted) {
      throw new LearningWorkflowError(
        "artifact_not_found",
        "The course-map draft was not found or has been superseded.",
      );
    }
    return accepted;
  }

  private requireCourse(courseId: string) {
    const course = this.courses.getCourseDetail(courseId);
    if (!course) {
      throw new LearningWorkflowError("course_not_found", "Course not found.");
    }
    return course;
  }

  private projection(courseId: string) {
    const projection = buildCourseSourceProjection(
      this.requireCourse(courseId),
      this.sources,
    );
    if (projection.materials.length === 0) {
      throw new LearningWorkflowError(
        "no_sources",
        "Import at least one successfully extracted course source first.",
      );
    }
    return projection;
  }

  private classificationPrompt(projection: CourseSourceProjection) {
    return [
      "Use $classify-course-sources for this Local Learning Studio action.",
      "Return only the requested structured output. Classify every supplied material exactly once.",
      "For each classified source, every evidence reference must use that same source's materialId and a passageId listed under that material; never cite a passage from another material.",
      projection.omittedPassageCount > 0
        ? `The deterministic projection omitted ${projection.omittedPassageCount} passages because of the input budget; include this limitation in warnings.`
        : "No passages were omitted from the deterministic projection.",
      "INPUT_JSON",
      JSON.stringify(projection),
    ].join("\n\n");
  }

  private courseMapFingerprint(
    sourceFingerprint: string,
    classification: unknown,
  ) {
    return createHash("sha256")
      .update(
        `course-map-input.v1\n${sourceFingerprint}\n${JSON.stringify(
          classification,
        )}`,
      )
      .digest("hex");
  }

  private courseMapPrompt(
    projection: CourseSourceProjection,
    classification: z.infer<typeof SourceClassificationProposalSchema>,
    passageKeys: Map<string, string>,
  ) {
    const materialKeys = new Map(projection.materials.map((material, index) => [material.id, `M${index + 1}`]));
    const materials = projection.materials.map((material, materialIndex) => ({
      materialKey: `M${materialIndex + 1}`,
      originalName: material.originalName,
      declaredKind: material.declaredKind,
      passages: material.passages.map((passage, passageIndex) => ({
        passageKey: `M${materialIndex + 1}-P${passageIndex + 1}`,
        location: passage.location,
        content: passage.content,
      })),
    }));
    const sourceAliases = new Map(
      projection.materials.flatMap((material, materialIndex) =>
        material.passages.map((passage, passageIndex) => [
          `${material.id}:${passage.id}`,
          `M${materialIndex + 1}-P${passageIndex + 1}`,
        ] as const),
      ),
    );
    const compactClassification = {
      sources: classification.sources.map((source) => ({
        materialKey: materialKeys.get(source.materialId),
        role: source.role,
        summary: source.summary,
        confidence: source.confidence,
        evidence: source.evidence.map(({ materialId, passageId }) => ({
          passageKey: sourceAliases.get(`${materialId}:${passageId}`),
        })),
      })),
      gaps: classification.gaps,
      warnings: classification.warnings,
    };
    return [
      "Use $map-course for this Local Learning Studio action.",
      "Return only the requested course-map.v1 structured output. Cite each evidence reference with one exact passageKey from INPUT_JSON; every passageKey is globally unique and maps to exactly one supplied source. Do not return course IDs, material IDs, or passage UUIDs; the application attaches validated IDs from this input.",
      "Treat homework and assignment questions as explicit evidence of assessed or practiced topics. Create concepts and learning objectives for topics directly covered by those tasks, even if the syllabus does not list them. Keep them grounded in the assignments and note where broader course coverage is unverified.",
      projection.omittedPassageCount > 0
        ? `The deterministic projection omitted ${projection.omittedPassageCount} passages because of the input budget; include this limitation in warnings.`
        : "No passages were omitted from the deterministic projection.",
      "INPUT_JSON",
      JSON.stringify({
        course: { title: projection.course.title, code: projection.course.code, term: projection.course.term },
        materials,
        omittedPassageCount: projection.omittedPassageCount,
        classification: compactClassification,
      }),
    ].join("\n\n");
  }

  private passageKeys(projection: CourseSourceProjection) {
    return new Map(
      projection.materials.flatMap((material, materialIndex) =>
        material.passages.map((passage, passageIndex) => [
          `${material.id}:${passage.id}`,
          `M${materialIndex + 1}-P${passageIndex + 1}`,
        ] as const),
      ),
    );
  }

  private resolveCourseMapReferences(
    projection: CourseSourceProjection,
    modelProposal: ModelCourseMapProposal,
    passageKeys: Map<string, string>,
  ) {
    const reverseKeys = new Map([...passageKeys].map(([identity, key]) => [key, identity]));
    const invalidKeys: string[] = [];
    const resolve = (references: ModelCourseMapProposal["modules"][number]["sourceReferences"]) =>
      references.map(({ passageKey }) => {
        const identity = reverseKeys.get(passageKey);
        if (!identity) {
          invalidKeys.push(passageKey);
          return { materialId: "", passageId: "" };
        }
        const separator = identity.indexOf(":");
        return { materialId: identity.slice(0, separator), passageId: identity.slice(separator + 1) };
      });
    const normalized = {
      ...modelProposal,
      courseId: projection.course.id,
      sourceMaterialIds: projection.materials.map(({ id }) => id),
      modules: modelProposal.modules.map((module) => ({ ...module, sourceReferences: resolve(module.sourceReferences) })),
      concepts: modelProposal.concepts.map((concept) => ({ ...concept, sourceReferences: resolve(concept.sourceReferences) })),
      assessments: modelProposal.assessments.map((assessment) => ({ ...assessment, sourceReferences: resolve(assessment.sourceReferences) })),
    };
    if (invalidKeys.length) {
      throw new LearningWorkflowError(
        "invalid_source_references",
        `Codex returned a course map that does not match the supplied course evidence: ${invalidKeys.length} unknown passage key(s). Sample: ${invalidKeys.slice(0, 3).join(", ")}.`,
        { invalidPassageKeys: invalidKeys.slice(0, 10), sourceStats: projection.sourceStats },
      );
    }
    return CourseMapProposalSchema.parse(normalized);
  }

  private validateClassification(
    projection: CourseSourceProjection,
    proposal: z.infer<typeof SourceClassificationProposalSchema>,
  ) {
    const expectedMaterials = projection.materials.map(({ id }) => id).sort();
    const proposedMaterials = [...proposal.sourceMaterialIds].sort();
    const classifiedMaterials = proposal.sources
      .map(({ materialId }) => materialId)
      .sort();
    if (
      proposal.courseId !== projection.course.id ||
      JSON.stringify(expectedMaterials) !== JSON.stringify(proposedMaterials) ||
      JSON.stringify(expectedMaterials) !== JSON.stringify(classifiedMaterials) ||
      !this.referencesExist(projection, proposal.sources.flatMap(({ evidence }) => evidence))
    ) {
      throw new LearningWorkflowError(
        "invalid_source_references",
        "Codex returned classifications that do not match the supplied course evidence.",
      );
    }
  }

  private validateCourseMap(
    projection: CourseSourceProjection,
    proposal: z.infer<typeof CourseMapProposalSchema>,
  ) {
    const expectedMaterials = projection.materials.map(({ id }) => id).sort();
    const proposedMaterials = [...proposal.sourceMaterialIds].sort();
    const references = [
      ...proposal.concepts.flatMap(({ sourceReferences }) => sourceReferences),
      ...proposal.modules.flatMap(({ sourceReferences }) => sourceReferences),
      ...proposal.assessments.flatMap(({ sourceReferences }) => sourceReferences),
    ];
    const missingMaterialIds = expectedMaterials.filter((id) => !proposedMaterials.includes(id));
    const unexpectedMaterialIds = proposedMaterials.filter((id) => !expectedMaterials.includes(id));
    const supplied = new Set(projection.materials.flatMap((material) => material.passages.map((passage) => `${material.id}:${passage.id}`)));
    const invalidReferences = references.filter(({ materialId, passageId }) => !supplied.has(`${materialId}:${passageId}`));
    const suppliedMaterialIds = new Set(projection.materials.map(({ id }) => id));
    const invalidReferenceMaterialCount = invalidReferences.filter(({ materialId }) => !suppliedMaterialIds.has(materialId)).length;
    const courseIdMatches = proposal.courseId === projection.course.id;
    if (!courseIdMatches || missingMaterialIds.length > 0 || unexpectedMaterialIds.length > 0 || invalidReferences.length > 0) {
      throw new LearningWorkflowError(
        "invalid_source_references",
        "Codex returned a course map that does not match the supplied course evidence. " +
          `Diagnostics: course ID ${courseIdMatches ? "matches" : "does not match"}; ` +
          `${missingMaterialIds.length} supplied material ID(s) missing; ` +
          `${unexpectedMaterialIds.length} unexpected material ID(s); ` +
          `${invalidReferences.length} of ${references.length} evidence reference(s) are invalid (${invalidReferenceMaterialCount} use unknown material IDs). ` +
          (invalidReferences.length ? `Sample invalid reference: ${invalidReferences[0]!.materialId}/${invalidReferences[0]!.passageId}. ` : "") +
          `Source set: ${projection.sourceStats.materialCount} materials, ${projection.sourceStats.passageCount} passages, ${projection.sourceStats.characterCount} characters; ${projection.omittedPassageCount} passages omitted.`,
        {
          courseIdMatches,
          missingMaterialIds: missingMaterialIds.slice(0, 5),
          unexpectedMaterialIds: unexpectedMaterialIds.slice(0, 5),
          invalidReferenceCount: invalidReferences.length,
          invalidReferenceMaterialCount,
          invalidReferenceSamples: invalidReferences.slice(0, 5),
          referenceCount: references.length,
          sourceStats: projection.sourceStats,
          omittedPassageCount: projection.omittedPassageCount,
        },
      );
    }
  }

  private referencesExist(
    projection: CourseSourceProjection,
    references: Array<{ materialId: string; passageId: string }>,
  ) {
    const supplied = new Set(
      projection.materials.flatMap((material) =>
        material.passages.map(
          (passage) => `${material.id}:${passage.id}`,
        ),
      ),
    );
    return references.every(({ materialId, passageId }) =>
      supplied.has(`${materialId}:${passageId}`),
    );
  }
}
