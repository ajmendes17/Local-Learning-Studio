export function appendInstructorTopicWording(currentText: string, submittedText: string, dateLabel: string) {
  const additionalWording = `Additional instructor topics (${dateLabel}):\n${submittedText}`;
  if (currentText.includes(additionalWording)) return currentText;
  return currentText.trim() ? `${currentText.trimEnd()}\n\n${additionalWording}` : submittedText;
}
