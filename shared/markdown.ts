/** Protocol markers inside fenced code are content, never answer-section boundaries. */
export function sectionHeaders(markdown: string) {
  const headers: { name: string; index: number; contentStart: number }[] = [];
  let offset = 0;
  let fence: { character: string; length: number } | null = null;
  for (const line of markdown.split(/(?<=\n)/)) {
    const marker = line.match(/^[ \t]*(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = { character: marker[1][0], length: marker[1].length };
      else if (marker[1][0] === fence.character && marker[1].length >= fence.length) fence = null;
    } else if (!fence) {
      const header = line.match(/^#{1,3}[ \t]*\[([A-Z_]+)\][ \t]*(?:\r?\n|$)/);
      if (header)
        headers.push({ name: header[1], index: offset, contentStart: offset + header[0].length });
    }
    offset += line.length;
  }
  return headers;
}
export function answerSections(markdown: string) {
  const headers = sectionHeaders(markdown),
    sections: Record<string, string> = {};
  headers.forEach((header, index) => {
    sections[header.name] ??= markdown
      .slice(header.contentStart, headers[index + 1]?.index ?? markdown.length)
      .trim();
  });
  return sections;
}
export function replaceSection(markdown: string, name: string, content: string) {
  const headers = sectionHeaders(markdown);
  const index = headers.findIndex((header) => header.name === name);
  if (index < 0) return `${markdown}\n# [${name}]\n${content}\n`;
  return `${markdown.slice(0, headers[index].index)}# [${name}]\n${content}\n${markdown.slice(headers[index + 1]?.index ?? markdown.length)}`;
}
