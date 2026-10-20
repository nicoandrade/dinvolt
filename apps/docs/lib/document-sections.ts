export interface DocumentSection {
  title: string;
  anchors: string[];
  text: string;
}

const fenceStart = /^ {0,3}(?<marker>`{3,}|~{3,})/u;
const heading = /^(?<level>#{2,6})\s+(?<title>.+?)\s*#*$/u;
const inlineCode = /(?<!`)(?<marker>`+)(?!`)[\s\S]*?(?<!`)\k<marker>(?!`)/gu;

function mapInlineProse(prose: string, transform: (text: string) => string) {
  let result = "";
  let cursor = 0;
  for (const match of prose.matchAll(inlineCode)) {
    result += transform(prose.slice(cursor, match.index)) + match[0];
    cursor = match.index + match[0].length;
  }
  return result + transform(prose.slice(cursor));
}

function headingId(title: string): string {
  return title
    .toLowerCase()
    .replaceAll(/[`*_]/gu, "")
    .replaceAll(/[^\p{L}\p{N}\s-]/gu, "")
    .replaceAll(/\s/gu, "-");
}

/** Read top-level sections without mistaking headings inside examples for prose. */
export function documentSections(markdown: string): DocumentSection[] {
  const sections: DocumentSection[] = [];
  let section: DocumentSection = { title: "", anchors: [], text: "" };
  let fence = "";
  const occurrences = new Map<string, number>();

  for (const line of markdown.split("\n")) {
    const marker = fenceStart.exec(line)?.groups?.marker;
    if (fence) {
      if (
        marker &&
        marker[0] === fence[0] &&
        marker.length >= fence.length &&
        line.trim() === marker
      ) {
        fence = "";
      }
    } else if (marker) {
      fence = marker;
    } else {
      const match = heading.exec(line);
      if (match?.groups) {
        const { title = "", level } = match.groups;
        const id = headingId(title);
        const occurrence = occurrences.get(id) ?? 0;
        occurrences.set(id, occurrence + 1);
        if (level === "##") {
          sections.push(section);
          section = { title, anchors: [], text: "" };
        }
        section.anchors.push(occurrence ? `${id}-${occurrence}` : id);
      }
    }
    section.text += `${line}\n`;
  }
  sections.push(section);
  return sections;
}

/** A split page restarts duplicate-heading numbering; keep source links valid. */
export function sectionAnchorTargets(
  sections: DocumentSection[]
): ReadonlyMap<string, string> {
  const source = sections.flatMap(({ anchors }) => anchors);
  const rendered = documentSections(
    sections.map(({ text }) => text).join("")
  ).flatMap(({ anchors }) => anchors);
  return new Map(
    source.map((anchor, index) => [anchor, rendered[index] ?? anchor])
  );
}

/** Keep paths and Markdown examples unchanged while rewriting prose links. */
export function mapProse(
  markdown: string,
  transform: (prose: string) => string
): string {
  let result = "";
  let prose = "";
  let fence = "";
  for (const line of markdown.split("\n")) {
    const marker = fenceStart.exec(line)?.groups?.marker;
    if (fence) {
      result += `${line}\n`;
      if (
        marker &&
        marker[0] === fence[0] &&
        marker.length >= fence.length &&
        line.trim() === marker
      ) {
        fence = "";
      }
    } else if (marker || /^(?: {4}|\t)/u.test(line)) {
      result += mapInlineProse(prose, transform);
      prose = "";
      fence = marker ?? "";
      result += `${line}\n`;
    } else {
      prose += `${line}\n`;
    }
  }
  return result + mapInlineProse(prose, transform);
}
