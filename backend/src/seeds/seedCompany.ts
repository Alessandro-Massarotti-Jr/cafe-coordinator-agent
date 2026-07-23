import * as fs from "fs";
import * as path from "path";
import { ICompanyRepository } from "../repositories/companyRepository/interfaces/ICompanyRepository";
import { IEmbeddingProvider } from "../providers/EmbeddingProvider/interfaces/IEmbeddingProvider";

const TARGET_CHUNK_SIZE = 700;
const OVERLAP_SENTENCES = 1;
const SOURCE = "company.txt";

export type CompanyChunk = {
  text: string;
  section: string;
  title: string;
  chunkIndex: number;
};

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

export function splitSections(text: string): Section[] {
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

export function splitSentences(paragraph: string): string[] {
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

export function deriveTitle(body: string, fallback: string): string {
  const firstLine = body.split("\n")[0] ?? "";
  const label = firstLine.match(/^([^:]{2,60}):\s/);
  return label?.[1]?.trim() ?? fallback;
}

export function chunkCompanyDocument(text: string): CompanyChunk[] {
  const chunks: CompanyChunk[] = [];

  for (const section of splitSections(text)) {
    let buffer: string[] = [];

    const flush = () => {
      if (buffer.length === 0) return;

      const body = buffer.join("\n\n");
      const title = deriveTitle(body, section.title);
      chunks.push({
        text: `${section.title} — ${title}\n\n${body}`,
        section: section.title,
        title,
        chunkIndex: chunks.length,
      });

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

export async function seedCompany(
  repository: ICompanyRepository,
  embedding: IEmbeddingProvider,
): Promise<void> {
  const filePath = path.join(__dirname, "../samples/company.txt");
  const content = fs.readFileSync(filePath, "utf-8");

  const chunks = chunkCompanyDocument(content);

  console.log(`Deleting existing chunks for source="${SOURCE}"...`);
  await repository.deleteBySource({ source: SOURCE });

  console.log(
    `Seeding ${chunks.length} chunks (target=${TARGET_CHUNK_SIZE}, overlap=${OVERLAP_SENTENCES} frase(s))...`,
  );

  for (const chunk of chunks) {
    const vector = await embedding.embed({ text: chunk.text });
    await repository.upsert({
      id: chunk.chunkIndex,
      vector,
      payload: {
        text: chunk.text,
        source: SOURCE,
        section: chunk.section,
        title: chunk.title,
        chunkIndex: chunk.chunkIndex,
      },
    });
    console.log(`  Indexed chunk id=${chunk.chunkIndex} section="${chunk.section}"`);
  }

  console.log("Company seeding complete.");
}
