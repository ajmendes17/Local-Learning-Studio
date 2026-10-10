export function appendInstructorTopicWording(currentText: string, submittedText: string, dateLabel: string) {
  const additionalWording = `Additional instructor topics (${dateLabel}):\n${submittedText}`;
  if (currentText.includes(additionalWording)) return currentText;
  return currentText.trim() ? `${currentText.trimEnd()}\n\n${additionalWording}` : submittedText;
}

function topicKey(title: string) {
  return title.trim().normalize("NFKC").toLocaleLowerCase();
}

export function partitionInstructorTopics(topics: string[], existingTitles: string[]) {
  const existing = new Set(existingTitles.map(topicKey));
  const newTopics: string[] = [];
  const alreadyListedTopics: string[] = [];
  for (const title of topics) {
    (existing.has(topicKey(title)) ? alreadyListedTopics : newTopics).push(title);
  }
  return { newTopics, alreadyListedTopics };
}
