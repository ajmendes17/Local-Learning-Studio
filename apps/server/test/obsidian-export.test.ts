import assert from "node:assert/strict";
import { appendFile, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildApp } from "../src/app.js";
import { openDatabase } from "../src/storage/database.js";
import { ObsidianVault } from "../src/storage/obsidian-vault.js";

function markdownUpload(filename: string, content: string) {
  const boundary = "obsidian-export-source-boundary";
  return {
    contentType: `multipart/form-data; boundary=${boundary}`,
    payload: [
      `--${boundary}`,
      `Content-Disposition: form-data; name="file"; filename="${filename}"`,
      "Content-Type: text/markdown",
      "",
      content,
      `--${boundary}--`,
      "",
    ].join("\r\n"),
  };
}

test("Obsidian export creates linked class notes and preserves learner-owned text on refresh", async () => {
  const root = await mkdtemp(join(tmpdir(), "learning-studio-obsidian-"));
  const vaultPath = join(root, "vault");
  const databasePath = join(root, "data", "studio.sqlite");
  await mkdir(vaultPath);
  const app = buildApp({
    databasePath,
    courseRoot: join(root, "courses"),
    obsidianConfigPath: join(root, "data", "obsidian.json"),
    codex: { run: async () => { throw new Error("The Obsidian export must not call Codex."); } } as any,
  });
  try {
    const courseResponse = await app.inject({ method: "POST", url: "/api/courses", payload: { title: "Quantum Information", code: "PHGN 519", term: "Fall 2026" } });
    const courseId = courseResponse.json().id as string;
    const configResponse = await app.inject({ method: "POST", url: "/api/obsidian/config", payload: { vaultPath } });
    assert.equal(configResponse.statusCode, 200, configResponse.body);
    const sourceUpload = markdownUpload("Bell-states-reading.md", "# Bell states\n\nOBSIDIAN_SOURCE_SENTINEL: local-state vectors can be entangled.\n\nRelated note: [[Other Class/Exam#Coverage|coverage]].\n\nEmbedded note: ![[private-class-note]].\n\n## Extraction boundary\n\n<!-- LLS:GENERATED:START -->\nThis marker came from source text and must remain inert.\n<!-- LLS:GENERATED:END -->");
    const uploaded = await app.inject({
      method: "POST", url: `/api/courses/${courseId}/materials?kind=reading`,
      headers: { "content-type": sourceUpload.contentType }, payload: sourceUpload.payload,
    });
    assert.equal(uploaded.statusCode, 201, uploaded.body);
    assert.equal(uploaded.json().status, "ready");
    const uploadedPassages = await app.inject({ method: "GET", url: `/api/courses/${courseId}/materials/${uploaded.json().id}/passages` });
    const firstPassageId = uploadedPassages.json().passages[0].id as string;
    const annotationResponse = await app.inject({
      method: "POST", url: `/api/courses/${courseId}/materials/${uploaded.json().id}/annotations`,
      payload: { passageId: firstPassageId, body: "Professor emphasis: know how Bell states are constructed. See [[Other Class/Exam]]." },
    });
    assert.equal(annotationResponse.statusCode, 201, annotationResponse.body);
    const conceptResponse = await app.inject({ method: "POST", url: `/api/courses/${courseId}/learner/concepts`, payload: { stableKey: "bell-states", title: "Bell states", description: "A topic used to verify exported practice evidence." } });
    assert.equal(conceptResponse.statusCode, 201, conceptResponse.body);
    const assessmentResponse = await app.inject({
      method: "POST", url: `/api/courses/${courseId}/learner/assessments`,
      payload: { title: "Midterm 2 professor scope", instructorText: "Exam topics:\n1. Bell states\n2. Partial trace\nNote: do not use [[another class]].", kind: "exam", scheduledAt: new Date(Date.now() + 10 * 86_400_000).toISOString(), availableMinutes: 90, dailyMinutes: 30, topics: [
        { title: "Bell states", conceptId: conceptResponse.json().id, importance: "normal", provenance: "learner" },
        { title: "Partial trace", importance: "normal", provenance: "learner" },
      ] },
    });
    assert.equal(assessmentResponse.statusCode, 201, assessmentResponse.body);
    const attemptResponse = await app.inject({
      method: "POST", url: `/api/courses/${courseId}/learner/attempts`,
      payload: {
        conceptId: conceptResponse.json().id, assessmentId: assessmentResponse.json().id,
        activityType: "recognition", prompt: "Which state is entangled?", response: "Not sure", reasoning: "",
        confidence: 0.5, hintCount: 1, method: "retrieval-practice", outcome: "incorrect", sourceRefs: [{ materialId: uploaded.json().id }],
        independence: "hinted", rationale: "Incorrect demo attempt to validate the export.",
      },
    });
    assert.equal(attemptResponse.statusCode, 201, attemptResponse.body);
    const ungradedAttemptResponse = await app.inject({
      method: "POST", url: `/api/courses/${courseId}/learner/attempts`,
      payload: {
        conceptId: conceptResponse.json().id, assessmentId: assessmentResponse.json().id,
        activityType: "explanation", prompt: "Explain the connection.", response: "I am unsure", reasoning: "",
        confidence: 0.2, hintCount: 0, method: "explanation", outcome: "not-graded", sourceRefs: [{ materialId: uploaded.json().id }],
        independence: "unknown", rationale: "Unscored response for denominator regression coverage.",
      },
    });
    assert.equal(ungradedAttemptResponse.statusCode, 201, ungradedAttemptResponse.body);

    const firstExport = await app.inject({ method: "POST", url: `/api/courses/${courseId}/obsidian/export` });
    assert.equal(firstExport.statusCode, 200, firstExport.body);
    assert.equal(firstExport.json().notesWritten, 3);
    assert.match(firstExport.json().courseFolder, /^Codex\/Local Learning Studio\//);
    assert.doesNotMatch(firstExport.json().courseFolder, /(^|\/)\.\.(\/|$)/);
    const courseNotePath = join(vaultPath, firstExport.json().courseFolder, "Course.md");
    const courseNote = await readFile(courseNotePath, "utf8");
    assert.match(courseNote, /\[\[Codex\/Local Learning Studio\/[^\]]+\/assessments\/midterm-2-professor-scope--/);
    assert.match(courseNote, /<!-- LLS:GENERATED:START -->/);
    assert.match(courseNote, /Notes last exported:/);
    assert.match(courseNote, /sources\/bell-states-reading--/);
    assert.match(courseNote, /## Practice by study approach[\s\S]*Quiz first:\*\* 0\/1 scored checks correct; No independent scored checks; 0\/1 correct with hints; confidence gap 50% across 1 rated check \(lower is closer to outcomes\); 1 total attempt/);
    assert.match(courseNote, /Clear explanation:\*\* No scored checks; No independent scored checks; confidence alignment not available; 1 total attempt; across 1 topic; topics: Bell states; 1 unscored/);
    assert.match(courseNote, /Different topics and small samples make method comparisons uncertain/);
    const professorAssessmentNote = await readFile(join(vaultPath, firstExport.json().courseFolder, "assessments", `midterm-2-professor-scope--${assessmentResponse.json().id.slice(0, 8)}.md`), "utf8");
    assert.match(professorAssessmentNote, /## Professor’s original wording[\s\S]*Exam topics:\n1\. Bell states\n2\. Partial trace\nNote: do not use/);
    assert.match(professorAssessmentNote, /&#91;&#91;another class&#93;&#93;/);
    assert.doesNotMatch(professorAssessmentNote, /\[\[another class\]\]/);
    const sourceFiles = await readdir(join(vaultPath, firstExport.json().courseFolder, "sources"));
    assert.equal(sourceFiles.length, 1);
    const sourceNote = await readFile(join(vaultPath, firstExport.json().courseFolder, "sources", sourceFiles[0]!), "utf8");
    assert.match(sourceNote, /OBSIDIAN_SOURCE_SENTINEL/);
    assert.match(sourceNote, /Source text|Extracted source text/);
    assert.match(sourceNote, /Lines \d+–\d+/);
    assert.match(sourceNote, /&lt;!-- LLS:GENERATED:START --&gt;/);
    assert.match(sourceNote, /marker came from source text and must remain inert/i);
    assert.match(sourceNote, /&#91;&#91;Other Class\/Exam#Coverage\|coverage&#93;&#93;/);
    assert.match(sourceNote, /!&#91;&#91;private-class-note&#93;&#93;/);
    assert.doesNotMatch(sourceNote, /(?<!!)\[\[Other Class\/Exam|!\[\[private-class-note/);
    assert.match(sourceNote, /Passage 1[\s\S]*Professor emphasis: know how Bell states are constructed[\s\S]*&#91;&#91;Other Class\/Exam&#93;&#93;/);
    assert.match(sourceNote, /## Review notes[\s\S]*Passages with comments:\*\* 1\/\d+[\s\S]*\[Passage 1 · Lines \d+–\d+[^\]]*\]\(#passage-1\) — Professor emphasis: know how Bell states are constructed/);
    assert.match(sourceNote, /<a id="passage-1"><\/a>[\s\S]*### Passage 1/);
    assert.doesNotMatch(sourceNote, /\[\[Other Class\/Exam\]\]/);
    assert.match(sourceNote, /\*\*Practice activity:\*\* 0\/1 scored checks correct; 1 unscored/);
    assert.match(sourceNote, /\*\*Lesson sessions opened:\*\* 0/);
    assert.match(sourceNote, /## Practice by topic[\s\S]*Bell states:\*\* 0\/1 scored checks correct; 1 unscored; latest not-graded/);
    const assessmentFiles = await readdir(join(vaultPath, firstExport.json().courseFolder, "assessments"));
    const assessmentNotePath = join(vaultPath, firstExport.json().courseFolder, "assessments", assessmentFiles[0]!);
    const assessmentNote = await readFile(assessmentNotePath, "utf8");
    assert.match(assessmentNote, /Bell states/);
    assert.match(assessmentNote, /Partial trace/);
    assert.match(assessmentNote, /\*\*Date:\*\* .+ \(due in \d+ days\)/);
    assert.match(assessmentNote, /\*\*Available study time:\*\* 90 minutes/);
    assert.match(assessmentNote, /\*\*Daily target:\*\* 30 minutes/);
    assert.match(assessmentNote, /## Suggested study plan[\s\S]*\*\*\d+ min\*\* — Bell states[\s\S]*\*\*\d+ min\*\* — Partial trace/);
    const plannedMinutes = [...assessmentNote.matchAll(/\*\*(\d+) min\*\* —/g)].map((match) => Number(match[1]));
    assert.equal(plannedMinutes.reduce((sum, minutes) => sum + minutes, 0), 90);
    assert.match(assessmentNote, /## Day-by-day schedule[\s\S]*Bell states/);
    const dailyMinutes = [...assessmentNote.matchAll(/\*\*\d{4}-\d{2}-\d{2} · (\d+) min\*\*/g)].map((match) => Number(match[1]));
    assert.equal(dailyMinutes.reduce((sum, minutes) => sum + minutes, 0), 90);
    assert.ok(dailyMinutes.every((minutes) => minutes <= 30));
    assert.match(assessmentNote, /Practice activity:\*\* 0\/1 scored checks correct; 1 unscored/);
    assert.match(assessmentNote, /## Progress summary[\s\S]*Topics checked:\*\* 1\/2[\s\S]*Topics needing review:\*\* 1[\s\S]*Topics without a saved check:\*\* 1/);
    assert.match(assessmentNote, /Bell states .*0\/1 scored checks correct; 1 unscored; latest: not-graded/);
    assert.match(assessmentNote, /Practice counts are evidence of activity, not mastery/);

    await appendFile(courseNotePath, "\n## My reflection\nKeep my instructor's phrasing here.\n");
    const changedExtraction = openDatabase(databasePath);
    changedExtraction.prepare("UPDATE source_passages SET content_hash=? WHERE course_id=? AND material_id=? AND id=?")
      .run("e".repeat(64), courseId, uploaded.json().id, firstPassageId);
    changedExtraction.close();
    await app.inject({
      method: "POST", url: `/api/courses/${courseId}/learner/assessments`,
      payload: { title: "Final exam scope", kind: "exam", topics: [{ title: "No-signaling", importance: "normal", provenance: "learner" }] },
    });
    const secondExport = await app.inject({ method: "POST", url: `/api/courses/${courseId}/obsidian/export` });
    assert.equal(secondExport.statusCode, 200);
    const refreshedCourseNote = await readFile(courseNotePath, "utf8");
    assert.match(refreshedCourseNote, /Keep my instructor's phrasing here\./);
    assert.match(refreshedCourseNote, /Final exam scope/);
    const refreshedSourceNote = await readFile(join(vaultPath, firstExport.json().courseFolder, "sources", sourceFiles[0]!), "utf8");
    assert.match(refreshedSourceNote, /## Comments from older source versions[\s\S]*OBSIDIAN_SOURCE_SENTINEL[\s\S]*Professor emphasis: know how Bell states are constructed/);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("Obsidian configuration rejects a non-folder vault path", async () => {
  const root = await mkdtemp(join(tmpdir(), "learning-studio-obsidian-invalid-"));
  const app = buildApp({ databasePath: join(root, "data", "studio.sqlite"), obsidianConfigPath: join(root, "data", "obsidian.json") });
  try {
    const response = await app.inject({ method: "POST", url: "/api/obsidian/config", payload: { vaultPath: join(root, "missing-vault") } });
    assert.equal(response.statusCode, 422);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("Obsidian export refuses a symlinked notes folder without writing outside the vault", async () => {
  const root = await mkdtemp(join(tmpdir(), "learning-studio-obsidian-symlink-"));
  const vaultPath = join(root, "vault");
  const outsidePath = join(root, "outside");
  const vault = new ObsidianVault(join(root, "obsidian.json"));
  await mkdir(vaultPath);
  await mkdir(outsidePath);
  try {
    await vault.configure(vaultPath);
    const courseFolder = join(vaultPath, "Codex", "Local Learning Studio", "quantum-information--course-i");
    await mkdir(courseFolder, { recursive: true });
    await symlink(outsidePath, join(courseFolder, "sources"), "dir");

    await assert.rejects(vault.exportCourse({
      course: {
        id: "course-id", title: "Quantum Information", code: "", term: "", materials: [{
          id: "source-id", originalName: "Reading.md", kind: "reading", status: "ready", mediaType: "text/markdown",
          sizeBytes: 10, passageCount: 0, errorMessage: null, createdAt: "2026-10-10T00:00:00.000Z", passages: [],
        }],
      },
      map: null,
      profile: { concepts: [], sources: [], assessments: [] },
      methodProgress: [],
    }), /symbolic link/);
    assert.deepEqual(await readdir(outsidePath), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Obsidian export refuses a class-folder symlink even when it points inside the vault", async () => {
  const root = await mkdtemp(join(tmpdir(), "learning-studio-obsidian-class-symlink-"));
  const vaultPath = join(root, "vault");
  const notesRoot = join(vaultPath, "Codex", "Local Learning Studio");
  const otherClass = join(notesRoot, "another-course--87654321");
  const classFolder = join(notesRoot, "quantum-information--course-i");
  const vault = new ObsidianVault(join(root, "obsidian.json"));
  await mkdir(vaultPath);
  await mkdir(otherClass, { recursive: true });
  await writeFile(join(otherClass, "Course.md"), "Keep this other class untouched.");
  try {
    await vault.configure(vaultPath);
    await symlink(otherClass, classFolder, "dir");
    await assert.rejects(vault.exportCourse({
      course: { id: "course-id", title: "Quantum Information", code: "", term: "", materials: [] },
      map: null,
      profile: { concepts: [], sources: [], assessments: [] },
      methodProgress: [],
    }), /class note folder is a symbolic link/);
    assert.equal(await readFile(join(otherClass, "Course.md"), "utf8"), "Keep this other class untouched.");
    assert.deepEqual(await readdir(otherClass), ["Course.md"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Obsidian source notes link assignments to their accepted topics and assessments", async () => {
  const root = await mkdtemp(join(tmpdir(), "learning-studio-obsidian-links-"));
  const vaultPath = join(root, "vault");
  await mkdir(vaultPath);
  const vault = new ObsidianVault(join(root, "obsidian.json"));
  try {
    await vault.configure(vaultPath);
    const result = await vault.exportCourse({
      course: {
        id: "course-id", title: "Quantum Information", code: "PHGN 519", term: "Fall 2026",
        materials: [{
          id: "homework-material", originalName: "Homework3_student.pdf", kind: "assignment", status: "ready",
          mediaType: "application/pdf", sizeBytes: 100, passageCount: 1, errorMessage: null, createdAt: "2026-10-09T00:00:00.000Z",
          passages: [{ id: "homework-passage", ordinal: 0, content: "Tensor products and entanglement", location: { kind: "page", pageStart: 1, pageEnd: 1 } }],
        }, {
          id: "syllabus-material", originalName: "Course-syllabus.pdf", kind: "syllabus", status: "ready",
          mediaType: "application/pdf", sizeBytes: 100, passageCount: 2, errorMessage: null, createdAt: "2026-10-09T00:00:00.000Z",
          passages: [
            { id: "syllabus-assessment-passage", ordinal: 0, content: "Homework is worth twenty percent", location: { kind: "page", pageStart: 1, pageEnd: 1 } },
            { id: "syllabus-topic-passage", ordinal: 1, content: "Quantum foundations and qubits", location: { kind: "page", pageStart: 2, pageEnd: 2 } },
          ],
        }],
      },
      map: {
        modules: [
          { key: "composite-systems", title: "Composite Systems", description: "Composite states", position: 1, conceptKeys: ["tensor-products", "module-context-only"], sourceReferences: [{ materialId: "homework-material", passageId: "homework-passage" }] },
          { key: "composite systems", title: "Composite Systems alternate", description: "A distinct module with a key that normalizes to the same filename", position: 3, conceptKeys: [], sourceReferences: [] },
          { key: "quantum-foundations", title: "Quantum Foundations", description: "Qubit states", position: 2, conceptKeys: ["syllabus-only"], sourceReferences: [{ materialId: "syllabus-material", passageId: "syllabus-topic-passage" }] },
        ],
        concepts: [
          { key: "tensor-products", title: "Tensor Products", description: "Combine systems", learningObjectives: [], prerequisiteKeys: [], sourceReferences: [{ materialId: "homework-material", passageId: "homework-passage" }] },
          { key: "module-context-only", title: "Module-only topic", description: "Connected by its module, not the homework", learningObjectives: [], prerequisiteKeys: [], sourceReferences: [{ materialId: "syllabus-material", passageId: "syllabus-topic-passage" }] },
          { key: "syllabus-only", title: "Syllabus-only topic", description: "Not in the homework", learningObjectives: [], prerequisiteKeys: [], sourceReferences: [{ materialId: "syllabus-material", passageId: "syllabus-topic-passage" }] },
          { key: "no-signaling", title: "No-signaling", description: "First filename collision case", learningObjectives: [], prerequisiteKeys: [], sourceReferences: [] },
          { key: "no signaling", title: "No signaling", description: "Second filename collision case", learningObjectives: [], prerequisiteKeys: [], sourceReferences: [] },
        ],
        assessments: [{ title: "Homework assignments", kind: "assignment", moduleKey: null, dueAt: null, weightPercent: null, sourceReferences: [{ materialId: "syllabus-material", passageId: "syllabus-assessment-passage" }] }],
      },
      profile: {
        concepts: [
          { title: "Tensor Products", attemptCount: 2, scoredAttemptCount: 1, correctCount: 1, latestOutcome: "not-graded", lastPracticedAt: "2026-10-09T01:00:00.000Z", sessionCount: 1, lastSessionAt: "2026-10-09T01:00:00.000Z" },
          { title: "Module-only topic", attemptCount: 1, scoredAttemptCount: 0, correctCount: 0, latestOutcome: "incomplete", lastPracticedAt: "2026-10-09T02:00:00.000Z", sessionCount: 1, lastSessionAt: "2026-10-09T02:00:00.000Z" },
          { title: "Syllabus-only topic", attemptCount: 0, scoredAttemptCount: 0, correctCount: 0, latestOutcome: null, lastPracticedAt: null, sessionCount: 0, lastSessionAt: null },
        ],
        sources: [{ materialId: "homework-material", attemptCount: 0, correctCount: 0, sessionCount: 2, lastSessionAt: "2026-10-09T01:00:00.000Z", topics: [{ title: "Tensor Products", attemptCount: 0, correctCount: 0, latestOutcome: null, lastPracticedAt: null, sessionCount: 1, lastSessionAt: "2026-10-09T01:00:00.000Z" }] }],
        assessments: [{ id: "exam-id", title: "Midterm", kind: "exam", scheduledAt: null, attemptCount: 0, correctCount: 0, sessionCount: 1, lastSessionAt: "2026-10-09T01:00:00.000Z", topics: [{ title: "Tensor Products", provenance: "learner", attemptCount: 0, correctCount: 0, latestOutcome: null, lastPracticedAt: null, sessionCount: 1, lastSessionAt: "2026-10-09T01:00:00.000Z" }] }],
      },
    } as any);
    const folder = join(vaultPath, result.courseFolder);
    const moduleFiles = await readdir(join(folder, "modules"));
    const compositeModuleNotes = await Promise.all(moduleFiles.filter((name) => name.startsWith("composite-systems")).map(async (name) => ({ name, text: await readFile(join(folder, "modules", name), "utf8") })));
    const moduleNote = compositeModuleNotes.find(({ text }) => text.includes("Lesson coverage:** 2/2 topics studied"))?.text;
    assert.ok(moduleNote);
    assert.match(moduleNote, /## Progress[\s\S]*Lesson coverage:\*\* 2\/2 topics studied/);
    assert.match(moduleNote, /Knowledge-check coverage:\*\* 2\/2 topics checked/);
    assert.match(moduleNote, /Topics needing review:\*\* 2/);
    assert.match(moduleNote, /Topics without a saved check:\*\* 0/);
    assert.match(moduleNote, /Scored checks:\*\* 1\/1 correct; 2 unscored/);
    const unpracticedModuleNote = await readFile(join(folder, "modules", "quantum-foundations.md"), "utf8");
    assert.match(unpracticedModuleNote, /Lesson coverage:\*\* 0\/1 topics studied/);
    assert.match(unpracticedModuleNote, /Knowledge-check coverage:\*\* 0\/1 topics checked/);
    assert.match(unpracticedModuleNote, /Scored checks:\*\* 0\/0 correct/);
    assert.equal(moduleFiles.filter((name) => name.startsWith("composite-systems")).length, 2);
    const topicFiles = await readdir(join(folder, "topics"));
    const noSignalingFiles = topicFiles.filter((name) => name.startsWith("no-signaling"));
    assert.equal(noSignalingFiles.length, 2);
    const noSignalingNotes = await Promise.all(noSignalingFiles.map((name) => readFile(join(folder, "topics", name), "utf8")));
    assert.match(noSignalingNotes[0]!, /First filename collision case|Second filename collision case/);
    assert.notEqual(noSignalingNotes[0], noSignalingNotes[1]);
    const actualSourceNote = await readFile(join(folder, "sources", "homework3-student--homework.md"), "utf8");
    assert.match(actualSourceNote, /## Related course topics[\s\S]*\[\[.*topics\/tensor-products\|Tensor Products\]\]/);
    assert.match(actualSourceNote, /Mapped topics practiced:\*\* 0\/1/);
    assert.match(actualSourceNote, /Mapped topics with lessons started:\*\* 1\/1/);
    assert.match(actualSourceNote, /Lesson sessions opened:\*\* 2/);
    assert.match(actualSourceNote, /Homework-level sessions:\*\* 1 lesson session started without a mapped topic/);
    assert.match(actualSourceNote, /## Practice by topic[\s\S]*Tensor Products\]\]: Lesson opened; no checks saved/);
    assert.match(actualSourceNote, /Practice activity is evidence of study, not mastery/);
    assert.match(actualSourceNote, /## Related assessments[\s\S]*\[\[.*assessments\/homework-assignments--course-1\|Homework assignments\]\]/);
    assert.match(actualSourceNote, /Passage 1/);
    const assessmentNote = await readFile(join(folder, "assessments", "homework-assignments--course-1.md"), "utf8");
    assert.match(assessmentNote, /## Related uploaded materials[\s\S]*\[\[.*sources\/homework3-student--homework\|Homework3_student\.pdf\]\]/);
    assert.match(assessmentNote, /## Connected topics and practice[\s\S]*\[\[.*topics\/tensor-products\|Tensor Products\]\] — Lesson opened \(no checks saved\)/);
    assert.doesNotMatch(assessmentNote, /syllabus-only|module-context-only|Module-only topic|Quantum Foundations/);
    assert.match(assessmentNote, /## Connected modules[\s\S]*\[\[.*modules\/composite-systems[^|]*\|Composite Systems\]\]/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
