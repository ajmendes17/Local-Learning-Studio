import { randomUUID } from "node:crypto";
import type { CourseMapProposal } from "@local-learning-studio/contracts";
import type { DatabaseSync } from "node:sqlite";

export class CourseStructureLibrary {
  constructor(private readonly database: DatabaseSync) {}

  replaceFromCourseMap(courseId: string, proposal: CourseMapProposal) {
    if (proposal.courseId !== courseId) {
      throw new Error("Course-map proposal belongs to another course.");
    }

    this.database
      .prepare("DELETE FROM assessments WHERE course_id = ?")
      .run(courseId);
    this.database
      .prepare("DELETE FROM module_concepts WHERE course_id = ?")
      .run(courseId);
    this.database
      .prepare("DELETE FROM concept_learning_objectives WHERE course_id = ?")
      .run(courseId);
    this.database
      .prepare("DELETE FROM concept_prerequisites WHERE course_id = ?")
      .run(courseId);
    this.database.prepare("DELETE FROM concepts WHERE course_id = ?").run(courseId);
    this.database.prepare("DELETE FROM modules WHERE course_id = ?").run(courseId);

    const moduleIds = new Map<string, string>();
    const conceptIds = new Map<string, string>();
    const insertModule = this.database.prepare(`
      INSERT INTO modules (id, course_id, title, position, description, origin)
      VALUES (?, ?, ?, ?, ?, 'syllabus')
    `);
    const insertConcept = this.database.prepare(`
      INSERT INTO concepts (id, course_id, title, description, origin)
      VALUES (?, ?, ?, ?, 'syllabus')
    `);

    for (const module of [...proposal.modules].sort(
      (left, right) => left.position - right.position,
    )) {
      const id = randomUUID();
      moduleIds.set(module.key, id);
      insertModule.run(
        id,
        courseId,
        module.title,
        module.position,
        module.description,
      );
    }

    for (const concept of proposal.concepts) {
      const id = randomUUID();
      conceptIds.set(concept.key, id);
      insertConcept.run(id, courseId, concept.title, concept.description);
      const insertObjective = this.database.prepare(`
        INSERT INTO concept_learning_objectives (
          course_id, concept_id, position, objective
        ) VALUES (?, ?, ?, ?)
      `);
      concept.learningObjectives.forEach((objective, position) => {
        insertObjective.run(courseId, id, position, objective);
      });
    }

    const insertPrerequisite = this.database.prepare(`
      INSERT INTO concept_prerequisites (
        course_id, concept_id, prerequisite_concept_id
      ) VALUES (?, ?, ?)
    `);
    for (const concept of proposal.concepts) {
      for (const prerequisiteKey of concept.prerequisiteKeys) {
        insertPrerequisite.run(
          courseId,
          conceptIds.get(concept.key)!,
          conceptIds.get(prerequisiteKey)!,
        );
      }
    }

    const insertModuleConcept = this.database.prepare(`
      INSERT INTO module_concepts (
        course_id, module_id, concept_id, position
      ) VALUES (?, ?, ?, ?)
    `);
    for (const module of proposal.modules) {
      module.conceptKeys.forEach((conceptKey, position) => {
        insertModuleConcept.run(
          courseId,
          moduleIds.get(module.key)!,
          conceptIds.get(conceptKey)!,
          position,
        );
      });
    }

    const insertAssessment = this.database.prepare(`
      INSERT INTO assessments (
        id, course_id, module_id, title, kind, due_at, weight_percent, origin
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'syllabus')
    `);
    for (const assessment of proposal.assessments) {
      insertAssessment.run(
        randomUUID(),
        courseId,
        assessment.moduleKey ? moduleIds.get(assessment.moduleKey)! : null,
        assessment.title,
        assessment.kind,
        assessment.dueAt,
        assessment.weightPercent,
      );
    }

    this.database
      .prepare("UPDATE courses SET updated_at = ? WHERE id = ?")
      .run(new Date().toISOString(), courseId);
  }
}
