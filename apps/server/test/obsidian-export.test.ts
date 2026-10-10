import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { access, appendFile, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
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

async function assertInternalWikiLinksResolve(vaultPath: string, courseFolder: string) {
  async function markdownFiles(folder: string): Promise<string[]> {
    const entries = await readdir(folder, { withFileTypes: true });
    const nested = await Promise.all(entries.map(async (entry) => {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) return markdownFiles(path);
      return entry.isFile() && entry.name.endsWith(".md") ? [path] : [];
    }));
    return nested.flat();
  }

  const files = await markdownFiles(join(vaultPath, courseFolder));
  const broken: Array<{ file: string; target: string }> = [];
  let checked = 0;
  for (const file of files) {
    const body = await readFile(file, "utf8");
    for (const match of body.matchAll(/\[\[([^\]\n]+)\]\]/g)) {
      const target = match[1]!.split("|", 1)[0]!.split("#", 1)[0]!;
      if (!target.startsWith("Codex/Local Learning Studio/")) continue;
      checked += 1;
      try {
        await access(join(vaultPath, `${target}.md`));
      } catch {
        broken.push({ file, target });
      }
    }
  }
  assert.ok(checked > 0, "the exported class should contain internal Obsidian links");
  assert.deepEqual(broken, [], "every internal Obsidian link should resolve to an exported note");
  return checked;
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
    const sourceUpload = markdownUpload("Bell-states-reading.md", "# Bell states\n\nOBSIDIAN_SOURCE_SENTINEL: local-state vectors can be entangled; |0〉 and |1〉 combine as (|0〉 + |1〉)/√2.\n\nRelated note: [[Other Class/Exam#Coverage|coverage]].\n\nEmbedded note: ![[private-class-note]].\n\n## Extraction boundary\n\n<!-- LLS:GENERATED:START -->\nThis marker came from source text and must remain inert.\n<!-- LLS:GENERATED:END -->");
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
      payload: { passageId: firstPassageId, body: "Professor emphasis: compare |0〉 and |1〉 in (|0〉 + |1〉)/√2.\nSee [[Other Class/Exam]]." },
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
    const lessonSessionId = randomUUID();
    const lessonCreatedAt = new Date().toISOString();
    const sessionDatabase = openDatabase(databasePath);
    sessionDatabase.prepare("INSERT INTO study_sessions (id,course_id,concept_id,topic,method,content_json,created_at) VALUES (?,?,?,?,?,?,?)")
      .run(lessonSessionId, courseId, conceptResponse.json().id, "Bell states", "explanation", JSON.stringify({ assessmentId: assessmentResponse.json().id, topic: "Bell states", method: "explanation" }), lessonCreatedAt);
    sessionDatabase.close();
    const attemptResponse = await app.inject({
      method: "POST", url: `/api/courses/${courseId}/learner/attempts`,
      payload: {
        conceptId: conceptResponse.json().id, assessmentId: assessmentResponse.json().id,
        activityType: "recognition", prompt: "Which state is $\\lvert\\Phi^+\\rangle$ and $\u007f\\ket{0}$?", response: "Not sure, maybe [[other class]] ![image](https://example.invalid/pixel.png)", reasoning: "",
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
    assert.equal(firstExport.json().notesWritten, 4);
    assert.match(firstExport.json().courseFolder, /^Codex\/Local Learning Studio\//);
    assert.doesNotMatch(firstExport.json().courseFolder, /(^|\/)\.\.(\/|$)/);
    assert.ok(await assertInternalWikiLinksResolve(vaultPath, firstExport.json().courseFolder) >= 6);
    const initialValidation = await app.inject({ method: "GET", url: `/api/courses/${courseId}/obsidian/validate` });
    assert.equal(initialValidation.statusCode, 200, initialValidation.body);
    assert.equal(initialValidation.json().healthy, true);
    assert.equal(initialValidation.json().notesChecked, 4);
    assert.ok(initialValidation.json().linksChecked >= 6);
    const validationDatabase = openDatabase(databasePath);
    validationDatabase.prepare("UPDATE source_passages SET content_hash=? WHERE course_id=? AND material_id=? AND id=?")
      .run("f".repeat(64), courseId, uploaded.json().id, firstPassageId);
    validationDatabase.close();
    const staleSourceValidation = await app.inject({ method: "GET", url: `/api/courses/${courseId}/obsidian/validate` });
    assert.equal(staleSourceValidation.json().healthy, false);
    assert.ok(staleSourceValidation.json().issues.some((issue: string) => issue.includes("Source note is out of date")));
    const unchangedDatabase = openDatabase(databasePath);
    unchangedDatabase.prepare("UPDATE source_passages SET content_hash=? WHERE course_id=? AND material_id=? AND id=?")
      .run(uploadedPassages.json().passages[0].contentHash, courseId, uploaded.json().id, firstPassageId);
    unchangedDatabase.close();
    const courseNotePath = join(vaultPath, firstExport.json().courseFolder, "Course.md");
    const intactCourseNote = await readFile(courseNotePath, "utf8");
    await writeFile(courseNotePath, intactCourseNote.replace(/^id: .*\r?\n/m, ""));
    const missingIdentityValidation = await app.inject({ method: "GET", url: `/api/courses/${courseId}/obsidian/validate` });
    assert.equal(missingIdentityValidation.json().healthy, false);
    assert.ok(missingIdentityValidation.json().issues.some((issue: string) => issue.includes("Managed note identity is missing: Course.md")));
    await writeFile(courseNotePath, intactCourseNote);
    await writeFile(courseNotePath, intactCourseNote.replace(/^id: .*$/m, `id: "source:${uploaded.json().id}"`));
    const mismatchedIdentityValidation = await app.inject({ method: "GET", url: `/api/courses/${courseId}/obsidian/validate` });
    assert.equal(mismatchedIdentityValidation.json().healthy, false);
    assert.ok(mismatchedIdentityValidation.json().issues.some((issue: string) => issue.includes("Managed note identity does not match the class export: Course.md")));
    await writeFile(courseNotePath, intactCourseNote);
    const missingSourceNotePath = join(vaultPath, firstExport.json().courseFolder, "sources", `bell-states-reading--${uploaded.json().id.slice(0, 8)}.md`);
    const missingSourceNoteBody = await readFile(missingSourceNotePath, "utf8");
    await rm(missingSourceNotePath);
    const missingNoteValidation = await app.inject({ method: "GET", url: `/api/courses/${courseId}/obsidian/validate` });
    assert.equal(missingNoteValidation.json().healthy, false);
    assert.ok(missingNoteValidation.json().issues.some((issue: string) => issue.includes(`Expected class note is missing: sources/bell-states-reading--${uploaded.json().id.slice(0, 8)}.md`)));
    await writeFile(missingSourceNotePath, missingSourceNoteBody);
    const unexpectedNotePath = join(vaultPath, firstExport.json().courseFolder, "topics", "removed-topic.md");
    await mkdir(join(vaultPath, firstExport.json().courseFolder, "topics"), { recursive: true });
    await writeFile(unexpectedNotePath, `---\nid: "topic:removed-topic"\n---\n\n# Removed topic\n\n${"<!-- LLS:GENERATED:START -->"}\nOld map entry\n${"<!-- LLS:GENERATED:END -->"}\n`);
    const obsoleteNoteValidation = await app.inject({ method: "GET", url: `/api/courses/${courseId}/obsidian/validate` });
    assert.equal(obsoleteNoteValidation.json().healthy, false);
    assert.ok(obsoleteNoteValidation.json().issues.some((issue: string) => issue.includes("Unexpected managed note for this export: topics/removed-topic.md")));
    await rm(unexpectedNotePath);
    const journalForAnchorTestPath = join(vaultPath, firstExport.json().courseFolder, "Study Journal.md");
    const journalForAnchorTest = await readFile(journalForAnchorTestPath, "utf8");
    const brokenPassageTarget = `${firstExport.json().courseFolder}/sources/bell-states-reading--${uploaded.json().id.slice(0, 8)}#Passage 999`;
    await appendFile(journalForAnchorTestPath, `\n[[${brokenPassageTarget}]]\n`);
    const brokenAnchorValidation = await app.inject({ method: "GET", url: `/api/courses/${courseId}/obsidian/validate` });
    assert.equal(brokenAnchorValidation.json().healthy, false);
    assert.ok(brokenAnchorValidation.json().issues.some((issue: string) => issue.includes(`Unresolved class link heading in Study Journal.md: ${brokenPassageTarget}`)));
    await writeFile(journalForAnchorTestPath, journalForAnchorTest);
    const courseNote = await readFile(courseNotePath, "utf8");
    assert.match(courseNote, /\[\[Codex\/Local Learning Studio\/[^\]]+\/assessments\/midterm-2-professor-scope--/);
    assert.match(courseNote, /<!-- LLS:GENERATED:START -->/);
    assert.match(courseNote, /Notes last exported:/);
    assert.match(courseNote, /sources\/bell-states-reading--/);
    assert.match(courseNote, /## Practice by study approach[\s\S]*Quiz first:\*\* 0\/1 scored checks correct; No independent scored checks; 0\/1 correct with hints; confidence gap 50% across 1 rated check \(lower is closer to outcomes\); 1 total attempt/);
    assert.match(courseNote, /Clear explanation:\*\* No scored checks; No independent scored checks; confidence alignment not available; 1 total attempt; across 1 topic; topics: Bell states; 1 unscored/);
    assert.match(courseNote, /Different topics and small samples make method comparisons uncertain/);
    assert.match(courseNote, /## Study journal[\s\S]*\[\[.*Study Journal\]\] · 2 saved attempts/);
    const studyJournalPath = join(vaultPath, firstExport.json().courseFolder, "Study Journal.md");
    const studyJournal = await readFile(studyJournalPath, "utf8");
    assert.match(studyJournal, /Which state is \$\\lvert\\Phi\^\+\\rangle\$ and/);
    assert.match(studyJournal, /and \$\\ket\{0\}\$\?/);
    assert.equal(studyJournal.includes("\u007f"), false);
    assert.match(studyJournal, /Not sure, maybe &#91;&#91;other class&#93;&#93;/);
    assert.match(studyJournal, /!&#91;image\]\(https:\/\/example\.invalid\/pixel\.png\)/);
    assert.doesNotMatch(studyJournal, /!\[image\]\(https:\/\//);
    assert.match(studyJournal, /\[\[.*sources\/bell-states-reading--/);
    assert.match(studyJournal, /not-graded · unknown/);
    const professorAssessmentNote = await readFile(join(vaultPath, firstExport.json().courseFolder, "assessments", `midterm-2-professor-scope--${assessmentResponse.json().id.slice(0, 8)}.md`), "utf8");
    assert.match(professorAssessmentNote, /## Professor’s original wording[\s\S]*Exam topics:\n1\. Bell states\n2\. Partial trace\nNote: do not use/);
    assert.match(professorAssessmentNote, /&#91;&#91;another class&#93;&#93;/);
    assert.doesNotMatch(professorAssessmentNote, /\[\[another class\]\]/);
    const sourceFiles = await readdir(join(vaultPath, firstExport.json().courseFolder, "sources"));
    assert.equal(sourceFiles.length, 1);
    const sourceNote = await readFile(join(vaultPath, firstExport.json().courseFolder, "sources", sourceFiles[0]!), "utf8");
    assert.match(sourceNote, /OBSIDIAN_SOURCE_SENTINEL/);
    assert.match(sourceNote, /OBSIDIAN_SOURCE_SENTINEL:[\s\S]*\$\\ket\{0\}\$ and \$\\ket\{1\}\$ combine as \(\$\\ket\{0\}\$ \+ \$\\ket\{1\}\$\)\/\$\\sqrt\{2\}\$\./);
    assert.match(sourceNote, /Source text|Extracted source text/);
    assert.match(sourceNote, /Lines \d+–\d+/);
    assert.match(sourceNote, /&lt;!-- LLS:GENERATED:START --&gt;/);
    assert.match(sourceNote, /marker came from source text and must remain inert/i);
    assert.match(sourceNote, /&#91;&#91;Other Class\/Exam#Coverage\|coverage&#93;&#93;/);
    assert.match(sourceNote, /!&#91;&#91;private-class-note&#93;&#93;/);
    assert.doesNotMatch(sourceNote, /(?<!!)\[\[Other Class\/Exam|!\[\[private-class-note/);
    assert.match(sourceNote, /Passage 1[\s\S]*Professor emphasis: compare \$\\ket\{0\}\$ and \$\\ket\{1\}\$ in \(\$\\ket\{0\}\$ \+ \$\\ket\{1\}\$\)\/\$\\sqrt\{2\}\$\.[\s\S]*&#91;&#91;Other Class\/Exam&#93;&#93;/);
    assert.match(sourceNote, /## Review notes[\s\S]*Passages with comments:\*\* 1\/\d+[\s\S]*\[Passage 1 · Lines \d+–\d+[^\]]*\]\(#passage-1\) — Professor emphasis: compare \$\\ket\{0\}\$ and \$\\ket\{1\}\$ in \(\$\\ket\{0\}\$ \+ \$\\ket\{1\}\$\)\/\$\\sqrt\{2\}\$\.\n\n## Extracted source text/);
    assert.match(sourceNote, /<a id="passage-1"><\/a>[\s\S]*### Passage 1/);
    assert.doesNotMatch(sourceNote, /\[\[Other Class\/Exam\]\]/);
    assert.match(sourceNote, /\*\*Practice activity:\*\* 0\/1 scored checks correct; 1 unscored/);
    assert.match(sourceNote, /\*\*Lesson sessions opened:\*\* 0/);
    assert.match(sourceNote, /## Practice by topic[\s\S]*Bell states:\*\* 0\/1 scored checks correct; 1 unscored; latest not-graded/);
    assert.match(sourceNote, /^source_hash: "[a-f0-9]{64}"$/m);
    assert.match(sourceNote, /LLS:OBSIDIAN:COMMENTS:GUIDE:START[\s\S]*- \[Passage 3\] The professor emphasized this derivation\./);
    await appendFile(join(vaultPath, firstExport.json().courseFolder, "sources", sourceFiles[0]!), "\n- [Passage 1] Imported from Obsidian: compare the two basis states.\n");
    const firstImport = await app.inject({ method: "POST", url: `/api/courses/${courseId}/obsidian/import-comments` });
    assert.equal(firstImport.statusCode, 200, firstImport.body);
    assert.deepEqual([firstImport.json().commentsFound, firstImport.json().importedCount, firstImport.json().duplicateCount], [1, 1, 0]);
    const duplicateImport = await app.inject({ method: "POST", url: `/api/courses/${courseId}/obsidian/import-comments` });
    assert.equal(duplicateImport.statusCode, 200, duplicateImport.body);
    assert.deepEqual([duplicateImport.json().commentsFound, duplicateImport.json().importedCount, duplicateImport.json().duplicateCount], [1, 0, 1]);
    const savedComments = await app.inject({ method: "GET", url: `/api/courses/${courseId}/materials/${uploaded.json().id}/annotations` });
    assert.equal(savedComments.statusCode, 200);
    const importedAnnotation = savedComments.json().find((annotation: { body: string }) => annotation.body === "Imported from Obsidian: compare the two basis states.");
    assert.ok(importedAnnotation);
    const editedAnnotation = await app.inject({
      method: "PATCH", url: `/api/courses/${courseId}/materials/${uploaded.json().id}/annotations/${importedAnnotation.id}`,
      payload: { body: "Edited in the app; this should remain the only version." },
    });
    assert.equal(editedAnnotation.statusCode, 200, editedAnnotation.body);
    const retryAfterEdit = await app.inject({ method: "POST", url: `/api/courses/${courseId}/obsidian/import-comments` });
    assert.equal(retryAfterEdit.statusCode, 200, retryAfterEdit.body);
    assert.deepEqual([retryAfterEdit.json().importedCount, retryAfterEdit.json().duplicateCount], [0, 1]);
    const commentsAfterEdit = await app.inject({ method: "GET", url: `/api/courses/${courseId}/materials/${uploaded.json().id}/annotations` });
    const editedBodies = commentsAfterEdit.json().map((annotation: { body: string }) => annotation.body);
    assert.ok(editedBodies.includes("Edited in the app; this should remain the only version."));
    assert.equal(editedBodies.includes("Imported from Obsidian: compare the two basis states."), false);
    const assessmentFiles = await readdir(join(vaultPath, firstExport.json().courseFolder, "assessments"));
    const assessmentNotePath = join(vaultPath, firstExport.json().courseFolder, "assessments", assessmentFiles[0]!);
    const assessmentNote = await readFile(assessmentNotePath, "utf8");
    assert.match(assessmentNote, /Bell states/);
    assert.match(assessmentNote, /Partial trace/);
    assert.match(assessmentNote, /\*\*Date:\*\* .+ \(due in \d+ days\)/);
    assert.match(assessmentNote, /\*\*Available study time:\*\* 90 minutes/);
    assert.match(assessmentNote, /\*\*Daily target:\*\* 30 minutes/);
    assert.match(assessmentNote, /## Suggested study plan[\s\S]*\*\*\d+ min\*\* — Bell states[\s\S]*\*\*\d+ min\*\* — Partial trace/);
    assert.match(assessmentNote, /Bell states _\(why: latest response needs another pass/);
    assert.match(assessmentNote, /Partial trace _\(why: not practiced yet\)/);
    const plannedMinutes = [...assessmentNote.matchAll(/\*\*(\d+) min\*\* —/g)].map((match) => Number(match[1]));
    assert.equal(plannedMinutes.reduce((sum, minutes) => sum + minutes, 0), 90);
    assert.match(assessmentNote, /## Day-by-day schedule[\s\S]*Bell states/);
    const dailyMinutes = [...assessmentNote.matchAll(/\*\*\d{4}-\d{2}-\d{2} · (\d+) min\*\*/g)].map((match) => Number(match[1]));
    assert.equal(dailyMinutes.reduce((sum, minutes) => sum + minutes, 0), 90);
    assert.ok(dailyMinutes.every((minutes) => minutes <= 30));
    assert.match(assessmentNote, /Practice activity:\*\* 0\/1 scored checks correct; 1 unscored/);
    assert.match(assessmentNote, /## Progress summary[\s\S]*Topics studied:\*\* 1\/2[\s\S]*Lesson sessions opened:\*\* 1[\s\S]*Topics checked:\*\* 1\/2[\s\S]*Knowledge-check attempts:\*\* 2 \(1 scored\)[\s\S]*Topics needing review:\*\* 1[\s\S]*Topics without a saved check:\*\* 1/);
    assert.match(assessmentNote, /Bell states .*1 lesson session; last lesson: .+; 0\/1 scored checks correct; 1 unscored; latest: not-graded/);
    assert.match(assessmentNote, /Practice counts are evidence of activity, not mastery/);

    await appendFile(courseNotePath, "\n## My reflection\nKeep my instructor's phrasing here.\n");
    await appendFile(studyJournalPath, "\n## My journal note\nReview eigenstate notation next week.\n");
    const changedExtraction = openDatabase(databasePath);
    changedExtraction.prepare("UPDATE source_passages SET content_hash=? WHERE course_id=? AND material_id=? AND id=?")
      .run("e".repeat(64), courseId, uploaded.json().id, firstPassageId);
    changedExtraction.close();
    const sourceNotePath = join(vaultPath, firstExport.json().courseFolder, "sources", sourceFiles[0]!);
    await appendFile(sourceNotePath, "\n- [Passage 1] This line is stale after re-extraction.\n");
    const staleImport = await app.inject({ method: "POST", url: `/api/courses/${courseId}/obsidian/import-comments` });
    assert.equal(staleImport.statusCode, 200, staleImport.body);
    assert.equal(staleImport.json().importedCount, 0);
    assert.ok(staleImport.json().issues.some((issue: string) => issue.includes("out of date")));
    await app.inject({
      method: "POST", url: `/api/courses/${courseId}/learner/assessments`,
      payload: { title: "Final exam scope", kind: "exam", topics: [{ title: "No-signaling", importance: "normal", provenance: "learner" }] },
    });
    const secondExport = await app.inject({ method: "POST", url: `/api/courses/${courseId}/obsidian/export` });
    assert.equal(secondExport.statusCode, 200);
    const refreshedCourseNote = await readFile(courseNotePath, "utf8");
    assert.match(refreshedCourseNote, /Keep my instructor's phrasing here\./);
    assert.match(refreshedCourseNote, /Final exam scope/);
    const refreshedJournal = await readFile(studyJournalPath, "utf8");
    assert.match(refreshedJournal, /Review eigenstate notation next week\./);
    assert.match(refreshedJournal, /Which state is \$\\lvert\\Phi\^\+\\rangle\$ and \$\\ket\{0\}\$\?/);
    const refreshedSourceNote = await readFile(join(vaultPath, firstExport.json().courseFolder, "sources", sourceFiles[0]!), "utf8");
    assert.match(refreshedSourceNote, /## Comments from older source versions[\s\S]*OBSIDIAN_SOURCE_SENTINEL[\s\S]*Professor emphasis: compare \|0〉 and \|1〉 in \(\|0〉 \+ \|1〉\)\/√2/);
    assert.match(refreshedSourceNote, /^source_hash: "[a-f0-9]{64}"$/m);
    assert.match(refreshedSourceNote, /- \[Passage 1\] This line is stale after re-extraction\./);
    const staleRetry = await app.inject({ method: "POST", url: `/api/courses/${courseId}/obsidian/import-comments` });
    assert.equal(staleRetry.json().importedCount, 0, "refreshing the note must not relabel old comments as current");
    const finalJournal = await readFile(studyJournalPath, "utf8");
    assert.match(finalJournal, /Review eigenstate notation next week\./);
    assert.equal(finalJournal.includes("\u007f"), false);
    await appendFile(studyJournalPath, `\n[[${firstExport.json().courseFolder}/topics/missing-topic|Missing topic]]\n`);
    const damagedValidation = await app.inject({ method: "GET", url: `/api/courses/${courseId}/obsidian/validate` });
    assert.equal(damagedValidation.statusCode, 200, damagedValidation.body);
    assert.equal(damagedValidation.json().healthy, false);
    assert.ok(damagedValidation.json().issues.some((issue: string) => issue.includes("Unresolved class link")));
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
    const tensorTopic = await readFile(join(folder, "topics", "tensor-products.md"), "utf8");
    assert.match(tensorTopic, /^---\nid: "topic:tensor-products"\ncourse_id: "course-id"\ncourse_code: "PHGN 519"\ntopic_key: "tensor-products"\npractice_status: "review-needed"\nattempt_count: 2\nscored_attempt_count: 1\ncorrect_count: 1\n[\s\S]*modules:[\s\S]*source_count: 1\n---/);
    assert.match(tensorTopic, /independent_scored_attempt_count: 0\nindependent_correct_count: 0\nevidence_level: "supported-practice"/);
    assert.match(tensorTopic, /\*\*Evidence level:\*\* Supported practice\n\*\*Sample size:\*\* Early signal[^\n]*\n\*\*Independent checks:\*\* 0\/0 correct/);
    assert.match(tensorTopic, /\*\*Sample size:\*\* Early signal · at least 3 scored checks give a steadier topic-level signal\./);
    const withLearnerProperty = tensorTopic.replace("course_id: \"course-id\"", "course_id: \"course-id\"\nlearner_tag: \"exam-focus\"");
    await writeFile(join(folder, "topics", "tensor-products.md"), withLearnerProperty);
    const syllabusTopic = await readFile(join(folder, "topics", "syllabus-only.md"), "utf8");
    assert.match(syllabusTopic, /practice_status: "not-started"/);
    assert.match(syllabusTopic, /attempt_count: 0/);
    const moduleOnlyTopic = await readFile(join(folder, "topics", "module-context-only.md"), "utf8");
    assert.match(moduleOnlyTopic, /practice_status: "review-needed"/);
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
    await vault.exportCourse({
      course: { id: "course-id", title: "Quantum Information", code: "PHGN 519", term: "Fall 2026", materials: [] },
      map: {
        modules: [{ key: "composite-systems", title: "Composite Systems", description: "Composite states", position: 1, conceptKeys: ["tensor-products"], sourceReferences: [] }],
        concepts: [{ key: "tensor-products", title: "Tensor Products", description: "Combine systems", learningObjectives: [], prerequisiteKeys: [], sourceReferences: [] }],
        assessments: [],
      },
      profile: {
        concepts: [{ title: "Tensor Products", attemptCount: 4, scoredAttemptCount: 4, correctCount: 4, independentScoredAttemptCount: 3, independentCorrectCount: 3, latestOutcome: "correct", lastPracticedAt: "2026-10-10T00:00:00.000Z", sessionCount: 3, lastSessionAt: "2026-10-10T00:00:00.000Z" }],
        assessments: [],
      },
      methodProgress: [{ method: "retrieval-practice", attemptCount: 4, scoredAttemptCount: 3, independentScoredAttemptCount: 3, independentCorrectCount: 3, hintedScoredAttemptCount: 0, hintedCorrectCount: 0, assistedScoredAttemptCount: 0, assistedCorrectCount: 0, unknownIndependenceScoredAttemptCount: 0, unknownIndependenceCorrectCount: 0, confidenceRatedAttemptCount: 3, meanConfidenceGap: 0.1, correctCount: 3, topicCount: 1, topicTitles: ["Tensor Products"], topicProgress: [], highConfidenceMissCount: 0, lowConfidenceCorrectCount: 0, lastPracticedAt: "2026-10-10T00:00:00.000Z" }],
    } as any);
    const refreshedTopic = await readFile(join(folder, "topics", "tensor-products.md"), "utf8");
    assert.match(refreshedTopic, /learner_tag: "exam-focus"/);
    assert.match(refreshedTopic, /practice_status: "checked"/);
    assert.match(refreshedTopic, /independent_scored_attempt_count: 3\nindependent_correct_count: 3\nevidence_level: "repeated-independent-success"/);
    assert.match(refreshedTopic, /\*\*Evidence level:\*\* Repeated independent success\n\*\*Independent checks:\*\* 3\/3 correct/);
    assert.doesNotMatch(refreshedTopic, /\*\*Sample size:\*\* Early signal/);
    assert.match(refreshedTopic, /^---\n[\s\S]*\n---\n\n# Tensor Products\n/);
    const refreshedCourse = await readFile(join(folder, "Course.md"), "utf8");
    assert.match(refreshedCourse, /Quiz first:[^\n]*3\/3 scored checks correct/);
    assert.doesNotMatch(refreshedCourse, /Quiz first:[^\n]*Early signal/);
    await vault.exportCourse({
      course: { id: "course-id", title: "Quantum Information", code: "PHGN 519", term: "Fall 2026", materials: [] },
      map: {
        modules: [{ key: "composite-systems", title: "Composite Systems", description: "Composite states", position: 1, conceptKeys: ["tensor-products"], sourceReferences: [] }],
        concepts: [{ key: "tensor-products", title: "Tensor Products", description: "Combine systems", learningObjectives: [], prerequisiteKeys: [], sourceReferences: [] }],
        assessments: [],
      },
      profile: {
        concepts: [{ title: "Tensor Products", attemptCount: 5, scoredAttemptCount: 5, correctCount: 2, independentScoredAttemptCount: 3, independentCorrectCount: 1, latestOutcome: "correct", lastPracticedAt: "2026-10-10T00:00:00.000Z", sessionCount: 3, lastSessionAt: "2026-10-10T00:00:00.000Z" }],
        assessments: [],
      },
    } as any);
    const mixedOutcomeTopic = await readFile(join(folder, "topics", "tensor-products.md"), "utf8");
    assert.match(mixedOutcomeTopic, /independent_scored_attempt_count: 3\nindependent_correct_count: 1\nevidence_level: "low-scored-accuracy"/);
    assert.match(mixedOutcomeTopic, /\*\*Evidence level:\*\* Low scored accuracy/);
    assert.doesNotMatch(mixedOutcomeTopic, /\*\*Sample size:\*\* Early signal/);
    assert.match(mixedOutcomeTopic, /\*\*Suggested next step:\*\* Take another quiz in Local Learning Studio to see whether accuracy improves\./);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
