import * as fs from "fs";
import * as path from "path";
import { ICompanyRepository } from "../repositories/companyRepository/interfaces/ICompanyRepository";
import { IEmbeddingProvider } from "../providers/EmbeddingProvider/interfaces/IEmbeddingProvider";
import { documentSparseVectors } from "../services/rag/sparseVectors";

const MAX_CHUNK_SIZE = 300;
const DEFAULT_SECTION = "Geral";
const SOURCE = "company.txt";

export type CompanyChunk = {
  text: string;
  section: string;
  title: string;
  chunkIndex: number;
};

function isHeading(paragraph: string): boolean {
  return !/[.!?:]/.test(paragraph);
}

function labelOf(paragraph: string): string | undefined {
  return paragraph.match(/^([^:\n]{2,40}):\s/)?.[1]?.trim();
}

export function splitSentences(paragraph: string): string[] {
  return paragraph
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function splitByTopic(paragraph: string, label: string | undefined): string[] {
  if (paragraph.includes("\n")) return [paragraph];

  const body = label ? paragraph.slice(paragraph.indexOf(":") + 1).trim() : paragraph;
  const pieces: string[] = [];
  let buffer = "";

  for (const sentence of splitSentences(body)) {
    if (buffer && buffer.length + sentence.length + 1 > MAX_CHUNK_SIZE) {
      pieces.push(buffer);
      buffer = "";
    }
    buffer = buffer ? `${buffer} ${sentence}` : sentence;
  }
  if (buffer) pieces.push(buffer);

  return label ? pieces.map((piece) => `${label}: ${piece}`) : pieces;
}

export function chunkCompanyDocument(text: string): CompanyChunk[] {
  const chunks: CompanyChunk[] = [];
  let section = DEFAULT_SECTION;

  const paragraphs = text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  for (const paragraph of paragraphs) {
    if (isHeading(paragraph)) {
      section = paragraph.replace(/^#{1,6}\s*/, "").trim();
      continue;
    }

    const label = labelOf(paragraph);
    for (const piece of splitByTopic(paragraph, label)) {
      chunks.push({
        text: piece,
        section,
        title: label ?? section,
        chunkIndex: chunks.length,
      });
    }
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
    `Seeding ${chunks.length} chunks (um assunto por trecho, máximo ${MAX_CHUNK_SIZE} caracteres)...`,
  );

  const sparseVectors = documentSparseVectors(chunks.map((chunk) => chunk.text));

  for (const [position, chunk] of chunks.entries()) {
    const vector = await embedding.embed({ text: chunk.text });
    await repository.upsert({
      id: chunk.chunkIndex,
      vector,
      sparseVector: sparseVectors[position]!,
      payload: {
        text: chunk.text,
        source: SOURCE,
        section: chunk.section,
        title: chunk.title,
        chunkIndex: chunk.chunkIndex,
      },
    });
    console.log(`  Indexed chunk id=${chunk.chunkIndex} title="${chunk.title}"`);
  }

  console.log("Company seeding complete.");
}
