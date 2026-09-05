export function summaryPrompt(transcriptText: string): string {
  return `Please summarize the following video transcript concisely. Focus on the key points and main topics. Output the summary directly in Markdown format, without any introductory phrases like "Here's a summary:".

Transcript:
${transcriptText}`;
}

export function reformatPrompt(transcriptChunk: string): string {
  return `You are converting a raw auto-generated YouTube transcript into clean, readable prose. Rules:
- Fix punctuation, capitalisation, and grammar artefacts from speech-to-text.
- Organise the text into logical paragraphs grouped by topic or speaker transition.
- Use Markdown subheadings (##) to break up major topic shifts.
- Preserve ALL the original content and meaning — do not summarize or omit anything.
- Do not add your own commentary or introductory/closing text.
- If the speaker uses technical terms, keep them as-is.

Raw transcript chunk:
${transcriptChunk}`;
}
