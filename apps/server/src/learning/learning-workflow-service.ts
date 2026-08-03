import { createHash } from "node:crypto";
import {
  CourseLearningArtifactsResponseSchema,
  CourseMapArtifactSchema,
  CourseMapProposalSchema,
  type CodexTask,
  SourceClassificationArtifactSchema,
  SourceClassificationProposalSchema,
} from "@local-learning-studio/contracts";
import type { z } from "zod";
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

export interface LearningCodexClient {
  status(): Promise<unknown>;
  run<T>(
    task: CodexTask,
    prompt: string,
    outputSchema: z.ZodType<T>,
  ): Promise<CodexRunResult<T>>;
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

  async classifySources(courseId: string, regenerate = false) {
    const projection = this.projection(courseId);
    if (!regenerate) {
      const cached = this.artifacts.findByFingerprint(
        courseId,
        "source-classification",
        projection.sourceFingerprint,
      );
      if (cached) return SourceClassificationArtifactSchema.parse(cached);
    }

    const result = await this.codex.run(
      "classify-course-sources",
      this.classificationPrompt(projection),
      SourceClassificationProposalSchema,
    );
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
      if (cached) return CourseMapArtifactSchema.parse(cached);
    }

    const result = await this.codex.run(
      "map-course",
      this.courseMapPrompt(projection, classification.payload),
      CourseMapProposalSchema,
    );
    this.validateCourseMap(projection, result.output);
    return this.artifacts.saveCourseMap({
      courseId,
      sourceFingerprint: mapFingerprint,
      model: result.model,
      payload: result.output,
    });
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
    classification: unknown,
  ) {
    return [
      "Use $map-course for this Local Learning Studio action.",
      "Return only the requested course-map.v1 structured output. Use only supplied passage IDs and material IDs.",
      projection.omittedPassageCount > 0
        ? `The deterministic projection omitted ${projection.omittedPassageCount} passages because of the input budget; include this limitation in warnings.`
        : "No passages were omitted from the deterministic projection.",
      "INPUT_JSON",
      JSON.stringify({ projection, classification }),
    ].join("\n\n");
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
    if (
      proposal.courseId !== projection.course.id ||
      JSON.stringify(expectedMaterials) !== JSON.stringify(proposedMaterials) ||
      !this.referencesExist(projection, references)
    ) {
      throw new LearningWorkflowError(
        "invalid_source_references",
        "Codex returned a course map that does not match the supplied course evidence.",
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
