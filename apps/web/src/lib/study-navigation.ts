export type SuggestedStudyMethod = "quiz";

export function suggestedStudyMethod(value: string | null | undefined): SuggestedStudyMethod | undefined {
  return value === "quiz" ? value : undefined;
}

export function studyTopicPath(
  courseId: string,
  topic: string,
  sourceMaterialId?: string,
  assessmentId?: string,
  method?: SuggestedStudyMethod,
  focus = false,
) {
  const query = new URLSearchParams({ topic });
  if (sourceMaterialId) query.set("sourceMaterialId", sourceMaterialId);
  if (assessmentId) query.set("assessmentId", assessmentId);
  if (method) query.set("method", method);
  if (focus) query.set("focus", "1");
  return `/courses/${encodeURIComponent(courseId)}/study?${query}`;
}
