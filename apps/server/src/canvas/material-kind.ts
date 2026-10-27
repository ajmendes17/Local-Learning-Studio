import type { MaterialKind } from "@local-learning-studio/contracts";

// Use explicit title signals; a generic Canvas file or page is not necessarily a lecture.
export function inferCanvasMaterialKind(title: string, type?: string): MaterialKind {
  if (type === "syllabus") return "syllabus";
  if (type === "assignment") return "assignment";
  const name = title.replace(/[_-]+/g, " ").replace(/\.[a-z0-9]+$/i, "");
  if (/\bsyllabus\b/i.test(name)) return "syllabus";
  if (/\bstudy\s+guide\b|\breview\s+(?:sheet|guide)\b|\bpractice\s+(?:exam|test|midterm|final)\b|\b(?:exam|midterm|final)\s+(?:practice|review)\b/i.test(name)) return "study-guide";
  if (/\b(?:worksheet|activity|homework|lab|assignment|problem\s+set)\b|\b(?:hw|ps)\s*\d+/i.test(name)) return "assignment";
  if (/\b(?:reading|readings|textbook|reference|references|article|paper|chapter|thesis)\b/i.test(name)) return "reading";
  if (/\b(?:lecture|lectures|slides|notes|prelecture|postlecture)\b|\bL\d{1,3}\b/i.test(name)) return "lecture-notes";
  return "other";
}
