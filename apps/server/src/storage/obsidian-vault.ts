import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, realpath, rename, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { allocateAssessmentStudyPlan, assessmentDeadlineLabel, type SourcePassage } from "@local-learning-studio/contracts";

const START = "<!-- LLS:GENERATED:START -->";
const END = "<!-- LLS:GENERATED:END -->";

export interface ObsidianConfig {
  vaultPath: string;
  folderPath: string;
}

export interface ObsidianCourseExport {
  course: { id: string; title: string; code: string; term: string; materials: Array<{ id: string; originalName: string; kind: string; status: string; mediaType: string; sizeBytes: number; passageCount: number; errorMessage: string | null; createdAt: string; passages: SourcePassage[] }> };
  map: { modules: Array<{ key: string; title: string; description: string; position: number; conceptKeys: string[]; sourceReferences: Array<{ materialId: string; passageId: string }> }>; concepts: Array<{ key: string; title: string; description: string; learningObjectives: string[]; prerequisiteKeys: string[]; sourceReferences: Array<{ materialId: string; passageId: string }> }>; assessments: Array<{ title: string; kind: string; moduleKey: string | null; dueAt: string | null; weightPercent: number | null; sourceReferences: Array<{ materialId: string; passageId: string }> }> } | null;
  profile: { concepts: Array<{ title: string; attemptCount: number; scoredAttemptCount?: number; correctCount: number; latestOutcome: string | null; lastPracticedAt: string | null; sessionCount: number; lastSessionAt: string | null }>; sources?: Array<{ materialId: string; attemptCount: number; scoredAttemptCount?: number; correctCount: number; sessionCount: number; lastSessionAt: string | null; topics: Array<{ title: string; attemptCount: number; scoredAttemptCount?: number; correctCount: number; latestOutcome: string | null; lastPracticedAt: string | null; sessionCount: number; lastSessionAt: string | null }> }>; assessments: Array<{ id: string; title: string; kind: string; scheduledAt: string | null; availableMinutes?: number | null; attemptCount: number; scoredAttemptCount?: number; correctCount: number; sessionCount: number; lastSessionAt: string | null; topics: Array<{ title: string; provenance: string; importance?: "low" | "normal" | "high"; attemptCount: number; scoredAttemptCount?: number; correctCount: number; latestOutcome: string | null; lastPracticedAt: string | null; sessionCount: number; lastSessionAt: string | null }> }> };
  methodProgress?: Array<{ method: string; attemptCount: number; scoredAttemptCount: number; confidenceRatedAttemptCount: number; meanConfidenceGap: number | null; correctCount: number; topicCount: number; topicTitles: string[]; topicProgress: Array<{ conceptId: string | null; title: string; attemptCount: number; scoredAttemptCount: number; correctCount: number; confidenceRatedAttemptCount: number; meanConfidenceGap: number | null; lastPracticedAt: string | null }>; highConfidenceMissCount: number; lowConfidenceCorrectCount: number; lastPracticedAt: string | null }>;
}

function scoredProgress(attemptCount: number, scoredAttemptCount: number | undefined, correctCount: number) {
  const scored = scoredAttemptCount ?? attemptCount;
  const unscored = Math.max(0, attemptCount - scored);
  if (scored === 0) return attemptCount ? `${attemptCount} saved attempt${attemptCount === 1 ? "" : "s"}; none scored` : "No checks recorded";
  return `${correctCount}/${scored} scored checks correct${unscored ? `; ${unscored} unscored` : ""}`;
}

function needsReview(outcome: string | null | undefined) {
  return outcome === "incorrect" || outcome === "incomplete" || outcome === "unsupported" || outcome === "not-graded";
}

function slug(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || "note";
}

function collisionSafePaths(keys: string[], folder: string) {
  const counts = new Map<string, number>();
  for (const key of keys) {
    const name = slug(key);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return new Map(keys.map((key) => {
    const name = slug(key);
    const suffix = counts.get(name)! > 1 ? `--${createHash("sha256").update(key).digest("hex").slice(0, 8)}` : "";
    return [key, `${folder}/${name}${suffix}.md`] as const;
  }));
}

function yaml(value: string) {
  return JSON.stringify(value);
}

function escapeImportedWikilinks(content: string) {
  return content.replace(/(!?)\[\[([^\]\n]+)\]\]/g, (_match, embed: string, target: string) =>
    `${embed}&#91;&#91;${target}&#93;&#93;`,
  );
}

function studyMethodLabel(method: string) {
  switch (method) {
    case "explanation": return "Clear explanation";
    case "worked-example": return "Worked example";
    case "quiz":
    case "retrieval-practice": return "Quiz first";
    case "analogy": return "Use an analogy";
    default: return method.trim() ? method.replaceAll("-", " ") : "Method not recorded";
  }
}

function passageLocation(location: SourcePassage["location"]) {
  switch (location.kind) {
    case "page": return location.pageStart === location.pageEnd ? `Page ${location.pageStart}` : `Pages ${location.pageStart}–${location.pageEnd}`;
    case "lines": return `Lines ${location.lineStart}–${location.lineEnd}${location.heading ? ` · ${location.heading}` : ""}`;
    case "paragraphs": return `Paragraphs ${location.paragraphStart}–${location.paragraphEnd}${location.heading ? ` · ${location.heading}` : ""}`;
    case "slides": return `Slides ${location.slideStart}–${location.slideEnd}${location.title ? ` · ${location.title}` : ""}`;
  }
}

function pathIsInside(parent: string, candidate: string) {
  const rel = relative(parent, candidate);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

async function replaceManagedSection(path: string, id: string, title: string, generated: string) {
  let previous = "";
  try { previous = await readFile(path, "utf8"); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const hasStart = previous.includes(START);
  const hasEnd = previous.includes(END);
  if (hasStart !== hasEnd) throw new Error(`Managed section markers are incomplete in ${path}.`);
  const block = `${START}\n${generated.trim()}\n${END}`;
  let next: string;
  if (hasStart) {
    const start = previous.indexOf(START);
    const end = previous.indexOf(END, start) + END.length;
    if (previous.indexOf(START, start + START.length) !== -1 || previous.indexOf(END, end) !== -1) {
      throw new Error(`Multiple managed sections found in ${path}.`);
    }
    next = `${previous.slice(0, start)}${block}${previous.slice(end)}`;
  } else if (previous) {
    next = `${previous.trimEnd()}\n\n${block}\n`;
  } else {
    next = `---\nid: ${yaml(id)}\n---\n\n# ${title}\n\n${block}\n\n## My notes\n\n`;
  }
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, next, { encoding: "utf8", flag: "wx" });
  await rename(temporary, path);
}

async function ensureSafeManagedPath(root: string, path: string) {
  if (!pathIsInside(root, path)) throw new Error("A generated note path resolves outside the class folder.");
  const parts = relative(root, dirname(path)).split(sep).filter(Boolean);
  let current = root;
  for (const part of parts) {
    current = join(current, part);
    try {
      await mkdir(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    const info = await lstat(current);
    if (info.isSymbolicLink()) throw new Error("A folder inside the class notes is a symbolic link; remove it before exporting.");
    if (!info.isDirectory() || !pathIsInside(root, await realpath(current))) {
      throw new Error("A generated note folder resolves outside the class folder.");
    }
  }
  try {
    const info = await lstat(path);
    if (info.isSymbolicLink()) throw new Error("A generated note is a symbolic link; remove it before exporting.");
    if (!info.isFile()) throw new Error("A generated note path is not a regular file.");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

export class ObsidianVault {
  constructor(private readonly configPath: string) {}

  async getConfig(): Promise<ObsidianConfig | null> {
    try {
      const parsed = JSON.parse(await readFile(this.configPath, "utf8")) as ObsidianConfig;
      if (typeof parsed.vaultPath !== "string" || typeof parsed.folderPath !== "string") return null;
      return parsed;
    } catch { return null; }
  }

  async configure(vaultPath: string, folderPath = "Codex/Local Learning Studio") {
    if (!isAbsolute(vaultPath.trim())) throw new Error("Choose an absolute path to an existing Obsidian vault.");
    const absoluteVault = resolve(vaultPath.trim());
    const vaultInfo = await stat(absoluteVault);
    if (!vaultInfo.isDirectory()) throw new Error("The selected vault path is not a folder.");
    const normalizedFolder = folderPath.trim().replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
    if (!normalizedFolder || normalizedFolder.split("/").some((part) => !part || part === "." || part === "..")) {
      throw new Error("Choose a safe folder path inside the vault.");
    }
    const config = { vaultPath: absoluteVault, folderPath: normalizedFolder };
    await mkdir(dirname(this.configPath), { recursive: true });
    const temporary = `${this.configPath}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(config, null, 2), { encoding: "utf8", flag: "wx" });
    await rename(temporary, this.configPath);
    return config;
  }

  async exportCourse(data: ObsidianCourseExport) {
    const config = await this.getConfig();
    if (!config) throw new Error("Configure an Obsidian vault before exporting class notes.");
    const vaultRealPath = await realpath(config.vaultPath);
    if (!(await stat(vaultRealPath)).isDirectory()) throw new Error("The configured Obsidian vault folder is no longer available.");
    const root = resolve(vaultRealPath, config.folderPath);
    if (!pathIsInside(vaultRealPath, root)) throw new Error("The configured notes folder must stay inside the selected vault.");
    await mkdir(root, { recursive: true });
    const rootRealPath = await realpath(root);
    if (!pathIsInside(vaultRealPath, rootRealPath)) throw new Error("The configured notes folder resolves outside the selected vault.");
    const courseFolder = resolve(rootRealPath, `${slug(data.course.title)}--${data.course.id.slice(0, 8)}`);
    if (!pathIsInside(rootRealPath, courseFolder)) throw new Error("The class note folder must stay inside the configured vault folder.");
    await mkdir(courseFolder, { recursive: true });
    if ((await lstat(courseFolder)).isSymbolicLink()) throw new Error("The class note folder is a symbolic link; remove it before exporting.");
    const courseFolderRealPath = await realpath(courseFolder);
    if (!pathIsInside(rootRealPath, courseFolderRealPath)) throw new Error("The class note folder resolves outside the configured notes folder.");
    const vaultRelativeCoursePath = relative(vaultRealPath, courseFolderRealPath).split(sep).join("/");
    const wikilink = (relativeNotePath: string, title: string) => `[[${vaultRelativeCoursePath}/${relativeNotePath.replace(/\.md$/, "")}|${title}]]`;
    const exportedAt = new Date().toISOString();

    const profileByTitle = new Map(data.profile.concepts.map((item) => [item.title.trim().toLocaleLowerCase(), item]));
    const topicPaths = collisionSafePaths((data.map?.concepts ?? []).map((item) => item.key), "topics");
    const modulePaths = collisionSafePaths((data.map?.modules ?? []).map((item) => item.key), "modules");
    const assessmentPaths = new Map(data.profile.assessments.map((item) => [item.id, `assessments/${slug(item.title)}--${item.id.slice(0, 8)}.md`]));
    const sourcePaths = new Map(data.course.materials.map((item) => [item.id, `sources/${slug(item.originalName.replace(/\.[^.]+$/, ""))}--${item.id.slice(0, 8)}.md`]));
    const passageById = new Map(data.course.materials.flatMap((material) => material.passages.map((passage) => [passage.id, { materialId: material.id, ordinal: passage.ordinal }] as const)));
    const mapAssessmentPaths = (data.map?.assessments ?? []).map((item, index) => `assessments/${slug(item.title)}--course-${index + 1}.md`);
    const managed: Array<{ path: string; id: string; title: string; body: string }> = [];
    const sourceCitation = (reference: { materialId: string; passageId: string }) => {
      const material = data.course.materials.find(({ id }) => id === reference.materialId);
      const passage = passageById.get(reference.passageId);
      if (!material || !sourcePaths.has(material.id)) return null;
      const passageRecord = passage ? material.passages.find(({ id }) => id === reference.passageId) : undefined;
      const title = passageRecord ? `Passage ${passageRecord.ordinal + 1} · ${passageLocation(passageRecord.location)}` : material.originalName;
      const heading = passageRecord ? `#Passage ${passageRecord.ordinal + 1}` : undefined;
      const target = `${vaultRelativeCoursePath}/${sourcePaths.get(material.id)!.replace(/\.md$/, "")}${heading ?? ""}`;
      return `[[${target}|${title}]]`;
    };

    for (const material of data.course.materials) {
      const sourceProgress = data.profile.sources?.find(({ materialId }) => materialId === material.id);
      const relatedConcepts = (data.map?.concepts ?? []).filter((concept) =>
        concept.sourceReferences.some((reference) => reference.materialId === material.id),
      );
      const sourceTopicKey = (title: string) => title.trim().normalize("NFKC").toLocaleLowerCase();
      const sourceTopicProgress = new Map((sourceProgress?.topics ?? []).map((topic) => [sourceTopicKey(topic.title), topic]));
      const relatedTopics = relatedConcepts.map((concept) => `- ${wikilink(topicPaths.get(concept.key)!, concept.title)}`).join("\n") || "- No accepted course-map topics cite this source yet.";
      const relatedAssessmentLinks = (data.map?.assessments ?? []).flatMap((assessment, index) =>
        assessment.sourceReferences.some((reference) => reference.materialId === material.id)
          || ((assessment.kind === "assignment" || /homework|assignment|problem\s*set|pset/i.test(assessment.title))
            && (material.kind === "assignment" || /homework|assignment|problem\s*set|pset/i.test(material.originalName)))
          ? [wikilink(mapAssessmentPaths[index]!, assessment.title)]
          : [],
      );
      const relatedAssessments = relatedAssessmentLinks.length
        ? relatedAssessmentLinks.map((link) => `- ${link}`).join("\n")
        : "- No accepted assessment directly cites this source yet.";
      const linkedTopicKeys = new Set(relatedConcepts.map(({ title }) => sourceTopicKey(title)));
      const practicedMappedTopicCount = relatedConcepts.filter((concept) => (sourceTopicProgress.get(sourceTopicKey(concept.title))?.attemptCount ?? 0) > 0).length;
      const startedMappedTopicCount = relatedConcepts.filter((concept) => (sourceTopicProgress.get(sourceTopicKey(concept.title))?.sessionCount ?? 0) > 0).length;
      const practiceTopicLines = [
        ...relatedConcepts.map((concept) => {
          const topic = sourceTopicProgress.get(sourceTopicKey(concept.title));
          const status = topic
            ? topic.attemptCount
              ? `${scoredProgress(topic.attemptCount, topic.scoredAttemptCount, topic.correctCount)}; latest ${topic.latestOutcome ?? "not recorded"}${topic.lastPracticedAt ? `; last checked ${topic.lastPracticedAt}` : ""}`
              : `Lesson opened; no checks saved${topic.lastSessionAt ? `; last lesson ${topic.lastSessionAt}` : ""}`
            : "Not practiced yet";
          return `- ${wikilink(topicPaths.get(concept.key)!, concept.title)}: ${status}`;
        }),
        ...(sourceProgress?.topics ?? [])
          .filter((topic) => !linkedTopicKeys.has(sourceTopicKey(topic.title)))
          .map((topic) => `- **${topic.title}:** ${topic.attemptCount ? `${scoredProgress(topic.attemptCount, topic.scoredAttemptCount, topic.correctCount)}; latest ${topic.latestOutcome ?? "not recorded"}${topic.lastPracticedAt ? `; last checked ${topic.lastPracticedAt}` : ""}` : `Lesson opened; no checks saved${topic.lastSessionAt ? `; last lesson ${topic.lastSessionAt}` : ""}`}`),
      ];
      const mappedTopicSessions = (sourceProgress?.topics ?? []).reduce((sum, topic) => sum + topic.sessionCount, 0);
      const unlinkedSourceSessions = Math.max(0, (sourceProgress?.sessionCount ?? 0) - mappedTopicSessions);
      if (unlinkedSourceSessions) practiceTopicLines.push(`- **Homework-level sessions:** ${unlinkedSourceSessions} lesson session${unlinkedSourceSessions === 1 ? "" : "s"} started without a mapped topic; open a mapped topic to track topic-level progress.`);
      const practiceTopics = practiceTopicLines.join("\n") || "- No accepted course-map topics or saved practice attempts cite this source yet.";
      const extracted = material.passages.map((passage) => [
        `### Passage ${passage.ordinal + 1}`,
        `_${passageLocation(passage.location)}_`,
        escapeImportedWikilinks(passage.content).replaceAll(START, "&lt;!-- LLS:GENERATED:START --&gt;").replaceAll(END, "&lt;!-- LLS:GENERATED:END --&gt;"),
      ].join("\n\n")).join("\n\n---\n\n") || (material.status === "ready" ? "No extracted passages were stored." : `No extracted text is available because this material is ${material.status}.${material.errorMessage ? `\n\n${material.errorMessage}` : ""}`);
      const generated = [
          `**Course:** ${wikilink("Course.md", data.course.title)}`,
        `**Original file:** ${material.originalName}`,
        `**Kind:** ${material.kind}`,
        `**Extraction:** ${material.status}`,
        `**Extracted passages:** ${material.passages.length}`,
        `**Practice activity:** ${scoredProgress(sourceProgress?.attemptCount ?? 0, sourceProgress?.scoredAttemptCount, sourceProgress?.correctCount ?? 0)}`,
        `**Mapped topics practiced:** ${relatedConcepts.length ? `${practicedMappedTopicCount}/${relatedConcepts.length}` : "No accepted topic links"}`,
        `**Mapped topics with lessons started:** ${relatedConcepts.length ? `${startedMappedTopicCount}/${relatedConcepts.length}` : "No accepted topic links"}`,
        `**Lesson sessions opened:** ${sourceProgress?.sessionCount ?? 0}${sourceProgress?.lastSessionAt ? ` · last ${sourceProgress.lastSessionAt}` : ""}`,
        `**Imported:** ${material.createdAt}`,
        "", "## Related course topics", relatedTopics,
        "", "## Related assessments", relatedAssessments,
        "", "## Practice by topic", practiceTopics,
        "", "## Extracted source text", extracted,
        "", "_Practice activity is evidence of study, not mastery. This note mirrors locally extracted text; the original upload remains stored in Local Learning Studio. Passage numbers and locators preserve source provenance._",
      ].join("\n");
      managed.push({ path: join(courseFolder, sourcePaths.get(material.id)!), id: `source:${material.id}`, title: material.originalName, body: generated });
    }

    if (data.map) {
      for (const concept of data.map.concepts) {
        const progress = profileByTitle.get(concept.title.trim().toLocaleLowerCase());
        const moduleTitles = data.map.modules.filter((module) => module.conceptKeys.includes(concept.key)).map((module) => wikilink(modulePaths.get(module.key)!, module.title));
        const prerequisites = concept.prerequisiteKeys.map((key) => topicPaths.get(key) ? wikilink(topicPaths.get(key)!, data.map!.concepts.find((item) => item.key === key)?.title ?? key) : key);
        const objectives = concept.learningObjectives.map((objective) => `- ${objective}`).join("\n") || "- No learning objectives listed yet.";
        const evidenceLinks = concept.sourceReferences.map(sourceCitation).filter((link): link is string => Boolean(link));
        const generated = [
          `**Course:** ${wikilink("Course.md", data.course.title)}`,
          `**Modules:** ${moduleTitles.join(", ") || "Not assigned"}`,
          `**Practice evidence:** ${progress ? `${scoredProgress(progress.attemptCount, progress.scoredAttemptCount, progress.correctCount)}; latest: ${progress.latestOutcome ?? "not checked"}` : "No checks recorded yet."}`,
          `**Last practiced:** ${progress?.lastPracticedAt ?? "Never"}`,
          `**Lesson sessions opened:** ${progress?.sessionCount ?? 0}${progress?.lastSessionAt ? ` · last ${progress.lastSessionAt}` : ""}`,
          "", "## Overview", concept.description || "No description provided.",
          "", "## Learning objectives", objectives,
          "", "## Prerequisites", prerequisites.join(", ") || "None listed.",
          "", "## Source evidence", evidenceLinks.map((link) => `- ${link}`).join("\n") || "- No imported-source links available.",
        ].join("\n");
        managed.push({ path: join(courseFolder, topicPaths.get(concept.key)!), id: `topic:${concept.key}`, title: concept.title, body: generated });
      }
      for (const module of data.map.modules) {
        const moduleConcepts = module.conceptKeys.map((key) => data.map!.concepts.find((item) => item.key === key)).filter((concept): concept is NonNullable<typeof concept> => Boolean(concept));
        const topics = moduleConcepts.map((concept) => {
          return topicPaths.get(concept.key) ? `- ${wikilink(topicPaths.get(concept.key)!, concept.title)}` : null;
        }).filter(Boolean).join("\n") || "- No topics listed.";
        const moduleProgress = moduleConcepts.map((concept) => profileByTitle.get(concept.title.trim().toLocaleLowerCase()));
        const startedTopics = moduleProgress.filter((item) => (item?.sessionCount ?? 0) > 0).length;
        const checkedTopics = moduleProgress.filter((item) => (item?.attemptCount ?? 0) > 0).length;
        const reviewTopics = moduleProgress.filter((item) => needsReview(item?.latestOutcome)).length;
        const uncheckedTopics = Math.max(0, moduleConcepts.length - checkedTopics);
        const attemptCount = moduleProgress.reduce((sum, item) => sum + (item?.attemptCount ?? 0), 0);
        const scoredAttemptCount = moduleProgress.reduce((sum, item) => sum + (item?.scoredAttemptCount ?? item?.attemptCount ?? 0), 0);
        const correctCount = moduleProgress.reduce((sum, item) => sum + (item?.correctCount ?? 0), 0);
        const unscoredAttemptCount = Math.max(0, attemptCount - scoredAttemptCount);
        const progress = [
          `**Lesson coverage:** ${startedTopics}/${moduleConcepts.length} topics studied`,
          `**Knowledge-check coverage:** ${checkedTopics}/${moduleConcepts.length} topics checked`,
          `**Topics needing review:** ${reviewTopics}`,
          `**Topics without a saved check:** ${uncheckedTopics}`,
          `**Scored checks:** ${correctCount}/${scoredAttemptCount} correct${unscoredAttemptCount ? `; ${unscoredAttemptCount} unscored` : ""}`,
        ].join("\n");
        const evidenceLinks = module.sourceReferences.map(sourceCitation).filter((link): link is string => Boolean(link));
        managed.push({ path: join(courseFolder, modulePaths.get(module.key)!), id: `module:${module.key}`, title: module.title, body: `**Course:** ${wikilink("Course.md", data.course.title)}\n\n${module.description}\n\n## Progress\n${progress}\n\n## Topics\n${topics}\n\n## Source evidence\n${evidenceLinks.map((link) => `- ${link}`).join("\n") || "- No imported-source links available."}` });
      }
    }

    for (const assessment of data.profile.assessments) {
      const studyPlan = assessment.availableMinutes == null ? [] : allocateAssessmentStudyPlan(assessment.topics, assessment.availableMinutes);
      const plannedMinutes = new Map(studyPlan.map(({ topic, minutes }) => [topic.title.trim().normalize("NFKC").toLocaleLowerCase(), minutes]));
      const deadline = assessmentDeadlineLabel(assessment.scheduledAt);
      const scope = assessment.topics.map((topic) => {
        const matchingConcept = (data.map?.concepts ?? []).find(({ title }) => title.trim().toLocaleLowerCase() === topic.title.trim().toLocaleLowerCase());
        const noteLink = matchingConcept && topicPaths.get(matchingConcept.key) ? ` · ${wikilink(topicPaths.get(matchingConcept.key)!, "open topic")}` : "";
        const planMinutes = plannedMinutes.get(topic.title.trim().normalize("NFKC").toLocaleLowerCase());
        const activity = topic.attemptCount
          ? `${scoredProgress(topic.attemptCount, topic.scoredAttemptCount, topic.correctCount)}; latest: ${topic.latestOutcome ?? "not checked"}; last checked: ${topic.lastPracticedAt ?? "never"}`
          : `${topic.sessionCount} lesson sessions; no checks saved${topic.lastSessionAt ? `; last lesson: ${topic.lastSessionAt}` : ""}`;
        return `- ${topic.title} _(source: ${topic.provenance}; priority: ${topic.importance ?? "normal"}${planMinutes == null ? "" : `; suggested time: ${planMinutes} min`}; ${activity})_${noteLink}`;
      }).join("\n") || "- No topic scope added yet.";
      const reviewTopics = assessment.topics.filter((topic) => needsReview(topic.latestOutcome)).length;
      const checkedTopics = assessment.topics.filter((topic) => topic.attemptCount > 0).length;
      const uncheckedTopics = Math.max(0, assessment.topics.length - checkedTopics);
      const studyPlanText = studyPlan.length
        ? studyPlan.map(({ topic, minutes }) => `- **${minutes} min** — ${topic.title}`).join("\n")
        : "No available study-time budget saved.";
      managed.push({ path: join(courseFolder, assessmentPaths.get(assessment.id)!), id: `assessment:${assessment.id}`, title: assessment.title, body: `**Course:** ${wikilink("Course.md", data.course.title)}\n**Type:** ${assessment.kind}\n**Date:** ${assessment.scheduledAt ? `${assessment.scheduledAt}${deadline ? ` (${deadline})` : ""}` : "Not set"}\n**Available study time:** ${assessment.availableMinutes == null ? "Not set" : `${assessment.availableMinutes} minutes`}\n**Practice activity:** ${scoredProgress(assessment.attemptCount, assessment.scoredAttemptCount, assessment.correctCount)}\n\n## Progress summary\n**Topics checked:** ${checkedTopics}/${assessment.topics.length}\n**Topics needing review:** ${reviewTopics}\n**Topics without a saved check:** ${uncheckedTopics}\n\n## Suggested study plan\n${studyPlanText}\n\n## Topics to study\n${scope}\n\n_Practice counts are evidence of activity, not mastery. Suggested time rebalances as saved topic evidence changes._` });
    }

    for (const [index, assessment] of (data.map?.assessments ?? []).entries()) {
      const module = assessment.moduleKey ? data.map?.modules.find(({ key }) => key === assessment.moduleKey) : null;
      const evidence = assessment.sourceReferences.map(sourceCitation).filter((link): link is string => Boolean(link)).map((link) => `- ${link}`).join("\n") || "- No source material cited.";
      const isAssignment = assessment.kind === "assignment" || /homework|assignment|problem\s*set|pset/i.test(assessment.title);
      const assessmentReferences = new Set(assessment.sourceReferences.map((reference) => `${reference.materialId}:${reference.passageId}`));
      const assignmentMaterialIds = new Set<string>();
      if (isAssignment) {
        for (const material of data.course.materials) {
          if (material.kind === "assignment" || /homework|assignment|problem\s*set|pset/i.test(material.originalName)) assignmentMaterialIds.add(material.id);
        }
      }
      const relatedMaterialIds = new Set([...assessmentReferences].map((key) => key.slice(0, key.indexOf(":"))).concat([...assignmentMaterialIds]));
      const relatedMaterials = data.course.materials.filter(({ id }) => relatedMaterialIds.has(id));
      const connectedModules = (data.map?.modules ?? []).filter((candidate) => candidate.conceptKeys.some((key) => {
        const concept = data.map?.concepts.find((item) => item.key === key);
        return concept?.sourceReferences.some((reference) => assessmentReferences.has(`${reference.materialId}:${reference.passageId}`)
          || assignmentMaterialIds.has(reference.materialId));
      }));
      const fallbackModule = module && !connectedModules.length ? [module] : [];
      const moduleKeys = new Set([...connectedModules, ...fallbackModule].map(({ key }) => key));
      const mappedAssignmentConcepts = (data.map?.concepts ?? []).filter((concept) =>
        concept.sourceReferences.some(({ materialId }) => assignmentMaterialIds.has(materialId)),
      );
      const connectedConcepts = isAssignment && mappedAssignmentConcepts.length
        ? mappedAssignmentConcepts
        : (data.map?.concepts ?? []).filter((concept) =>
          concept.sourceReferences.some((reference) => assessmentReferences.has(`${reference.materialId}:${reference.passageId}`))
          || (moduleKeys.size > 0 && (data.map?.modules ?? []).some((candidate) => moduleKeys.has(candidate.key) && candidate.conceptKeys.includes(concept.key))),
        );
      const progressMaterialIds = isAssignment && assignmentMaterialIds.size ? assignmentMaterialIds : relatedMaterialIds;
      const relatedMaterialNotes = relatedMaterials.map((material) => `- ${wikilink(sourcePaths.get(material.id)!, material.originalName)}`).join("\n") || "- No uploaded material linked.";
      const connectedTopicLines = connectedConcepts.map((concept) => {
        const signals = isAssignment
          ? (data.profile.sources ?? []).filter(({ materialId }) => progressMaterialIds.has(materialId)).flatMap((source) =>
            source.topics.filter(({ title }) => title.trim().normalize("NFKC").toLocaleLowerCase() === concept.title.trim().normalize("NFKC").toLocaleLowerCase()),
          )
          : [profileByTitle.get(concept.title.trim().normalize("NFKC").toLocaleLowerCase())].filter((signal): signal is NonNullable<typeof signal> => Boolean(signal));
        const attempts = signals.reduce((sum, signal) => sum + signal.attemptCount, 0);
        const scoredAttempts = signals.reduce((sum, signal) => sum + (signal.scoredAttemptCount ?? signal.attemptCount), 0);
        const correct = signals.reduce((sum, signal) => sum + signal.correctCount, 0);
        const sessions = signals.reduce((sum, signal) => sum + signal.sessionCount, 0);
        const latest = signals.filter((signal) => signal.lastPracticedAt).sort((a, b) =>
          Date.parse(b.lastPracticedAt ?? "") - Date.parse(a.lastPracticedAt ?? ""),
        )[0];
        const status = attempts
          ? `${scoredProgress(attempts, scoredAttempts, correct)}; latest ${latest?.latestOutcome ?? "not recorded"}${latest?.lastPracticedAt ? `; last practiced ${latest.lastPracticedAt}` : ""}`
          : sessions ? "Lesson opened (no checks saved)" : "Not practiced yet";
        return `- ${wikilink(topicPaths.get(concept.key)!, concept.title)} — ${status}`;
      }).join("\n") || "- No accepted course topics linked.";
      const linkedModuleNotes = [...moduleKeys].map((key) => {
        const linked = data.map?.modules.find((candidate) => candidate.key === key);
        return linked ? `- ${wikilink(modulePaths.get(key)!, linked.title)}` : null;
      }).filter(Boolean).join("\n") || "- Not assigned";
      const id = `course-assessment:${data.course.id}:${index}:${slug(assessment.title)}`;
      const path = mapAssessmentPaths[index]!;
      const generated = `**Course:** ${wikilink("Course.md", data.course.title)}\n**Assessment type:** ${assessment.kind}\n**Due:** ${assessment.dueAt ?? "Not set"}\n**Weight:** ${assessment.weightPercent == null ? "Not specified" : `${assessment.weightPercent}%`}\n\n## Connected modules\n${linkedModuleNotes}\n\n## Related uploaded materials\n${relatedMaterialNotes}\n\n## Connected topics and practice\n${connectedTopicLines}\n\n## Source evidence\n${evidence}\n\n_Lesson sessions show study activity; checks show answered practice. Neither alone establishes mastery._`;
      managed.push({ path: join(courseFolder, path), id, title: assessment.title, body: generated });
    }

    const moduleLinks = (data.map?.modules ?? []).map((module) => `- ${wikilink(modulePaths.get(module.key)!, module.title)}`).join("\n") || "- No accepted course map yet.";
    const courseAssessmentLinks = (data.map?.assessments ?? []).map((assessment, index) => `- ${wikilink(mapAssessmentPaths[index]!, assessment.title)}`).join("\n") || "- No accepted course assessments yet.";
    const learnerAssessmentLinks = data.profile.assessments.map((assessment) => `- ${wikilink(assessmentPaths.get(assessment.id)!, assessment.title)}`).join("\n") || "- No learner-added topic scopes yet.";
    const materialList = data.course.materials.map((material) => `- ${wikilink(sourcePaths.get(material.id)!, `${material.originalName} · ${material.kind}; ${material.status}; ${material.passages.length} passages`)}`).join("\n") || "- No files added.";
    const methodProgress = (data.methodProgress ?? []).map((item) => {
      const scored = item.scoredAttemptCount;
      const unscored = Math.max(0, item.attemptCount - scored);
      const signals = [
        scored ? `${item.correctCount}/${scored} scored checks correct` : "No scored checks",
        item.meanConfidenceGap == null ? "confidence alignment not available" : `confidence gap ${Math.round(item.meanConfidenceGap * 100)}% across ${item.confidenceRatedAttemptCount} rated check${item.confidenceRatedAttemptCount === 1 ? "" : "s"} (lower is closer to outcomes)`,
        `${item.attemptCount} total attempt${item.attemptCount === 1 ? "" : "s"}`,
        `across ${item.topicCount} topic${item.topicCount === 1 ? "" : "s"}`,
        ...(item.topicTitles.length ? [`topics: ${item.topicTitles.join(", ")}`] : []),
        ...(unscored ? [`${unscored} unscored`] : []),
        ...(item.topicProgress.length ? [`by topic: ${item.topicProgress.map((topic) => {
          const topicUnscored = Math.max(0, topic.attemptCount - topic.scoredAttemptCount);
          const result = topic.scoredAttemptCount ? `${topic.correctCount}/${topic.scoredAttemptCount} scored correct` : "no scored checks";
          const confidence = topic.meanConfidenceGap == null ? "confidence unavailable" : `${Math.round(topic.meanConfidenceGap * 100)}% confidence gap across ${topic.confidenceRatedAttemptCount} rated`;
          return `${topic.title} (${result}${topicUnscored ? `; ${topicUnscored} unscored` : ""}; ${confidence}${topic.lastPracticedAt ? `; last practiced ${topic.lastPracticedAt}` : ""})`;
        }).join(" | ")}`] : []),
        `${item.highConfidenceMissCount} confident miss${item.highConfidenceMissCount === 1 ? "" : "es"}`,
        `${item.lowConfidenceCorrectCount} low-confidence correct`,
        ...(item.lastPracticedAt ? [`last used ${item.lastPracticedAt}`] : []),
      ];
      return `- **${studyMethodLabel(item.method)}:** ${signals.join("; ")}`;
    }).join("\n") || "- No saved knowledge checks yet.";
    managed.push({
      path: join(courseFolder, "Course.md"), id: `course:${data.course.id}`, title: data.course.title,
      body: `**Course code:** ${data.course.code || "Not set"}\n**Term:** ${data.course.term || "Not set"}\n**Notes last exported:** ${exportedAt}\n\n## Modules\n${moduleLinks}\n\n## Syllabus assessments\n${courseAssessmentLinks}\n\n## My exam topic lists\n${learnerAssessmentLinks}\n\n## Practice by study approach\n${methodProgress}\n\n_These are descriptive study signals. Different topics and small samples make method comparisons uncertain._\n\n## Course materials\n${materialList}\n\n_Progress counts show practice activity; they are not mastery estimates._`,
    });

    for (const note of managed) await ensureSafeManagedPath(courseFolderRealPath, note.path);
    for (const note of managed) await replaceManagedSection(note.path, note.id, note.title, note.body);
    return { courseFolder: vaultRelativeCoursePath, notesWritten: managed.length, exportedAt };
  }
}
