export function summarizeSourceAnnotations(
  passageIds: string[],
  annotations: Array<{ passageId: string; isCurrent: boolean }>,
) {
  const currentPassageIds = new Set(passageIds);
  const currentComments = annotations.filter((annotation) => annotation.isCurrent);
  const commentedPassages = new Set(currentComments
    .filter((annotation) => currentPassageIds.has(annotation.passageId))
    .map((annotation) => annotation.passageId));
  return {
    commentedPassageCount: commentedPassages.size,
    currentCommentCount: currentComments.length,
    olderCommentCount: annotations.length - currentComments.length,
  };
}
