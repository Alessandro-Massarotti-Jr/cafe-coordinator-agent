const TARGET_CHUNK_SIZE = 700;
const OVERLAP_SENTENCES = 1;

type Section = {
  title: string;
  paragraphs: string[];
};

function isHeading(paragraph: string): boolean {
  if (paragraph.includes("\n")) return false;
  if (paragraph.length > 80) return false;
  if (/^#{1,6}\s/.test(paragraph)) return true;
  return !/[.!?]$/.test(paragraph.trim());
}

function cleanHeading(paragraph: string): string {
  return paragraph.replace(/^#{1,6}\s*/, "").replace(/:$/, "").trim();
}

function splitSections(text: string): Section[] {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const sections: Section[] = [];
  let current: Section = { title: "Geral", paragraphs: [] };

  for (const paragraph of paragraphs) {
    if (isHeading(paragraph)) {
      if (current.paragraphs.length > 0) sections.push(current);
      current = { title: cleanHeading(paragraph), paragraphs: [] };
      continue;
    }
    current.paragraphs.push(paragraph);
  }

  if (current.paragraphs.length > 0) sections.push(current);

  return sections;
}

function splitSentences(paragraph: string): string[] {
  return paragraph
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function splitLongParagraph(paragraph: string): string[] {
  const sentences = splitSentences(paragraph);
  const blocks: string[] = [];
  let buffer: string[] = [];

  for (const sentence of sentences) {
    const candidate = [...buffer, sentence].join(" ");
    if (buffer.length > 0 && candidate.length > TARGET_CHUNK_SIZE) {
      blocks.push(buffer.join(" "));
      buffer = [sentence];
      continue;
    }
    buffer.push(sentence);
  }

  if (buffer.length > 0) blocks.push(buffer.join(" "));
  return blocks;
}

function deriveTitle(body: string, fallback: string): string {
  const firstLine = body.split("\n")[0] ?? "";
  const label = firstLine.match(/^([^:]{2,60}):\s/);
  return label?.[1]?.trim() ?? fallback;
}

export function legacyHybridChunks(text: string): string[] {
  const chunks: string[] = [];

  for (const section of splitSections(text)) {
    let buffer: string[] = [];

    const flush = () => {
      if (buffer.length === 0) return;

      const body = buffer.join("\n\n");
      const title = deriveTitle(body, section.title);
      chunks.push(`${section.title} — ${title}\n\n${body}`);

      const sentences = splitSentences(body);
      buffer =
        OVERLAP_SENTENCES > 0 && sentences.length > OVERLAP_SENTENCES
          ? [sentences.slice(-OVERLAP_SENTENCES).join(" ")]
          : [];
    };

    for (const paragraph of section.paragraphs) {
      const pieces =
        paragraph.length > TARGET_CHUNK_SIZE
          ? splitLongParagraph(paragraph)
          : [paragraph];

      for (const piece of pieces) {
        const currentLength = buffer.join("\n\n").length;
        if (currentLength > 0 && currentLength + piece.length > TARGET_CHUNK_SIZE) {
          flush();
        }
        buffer.push(piece);
      }
    }

    flush();
  }

  return chunks;
}
