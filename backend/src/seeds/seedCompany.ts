import * as fs from "fs";
import * as path from "path";
import { ICompanyRepository } from "../repositories/companyRepository/interfaces/ICompanyRepository";
import { IEmbeddingProvider } from "../providers/EmbeddingProvider/interfaces/IEmbeddingProvider";

const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 100;
const SOURCE = "company.txt";

function chunkWithOverlap(text: string): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    chunks.push(text.slice(start, start + CHUNK_SIZE));
    start += CHUNK_SIZE - CHUNK_OVERLAP;
  }

  return chunks;
}

export async function seedCompany(
  repository: ICompanyRepository,
  embedding: IEmbeddingProvider,
): Promise<void> {
  const filePath = path.join(__dirname, "../samples/company.txt");
  const content = fs.readFileSync(filePath, "utf-8");

  const chunks = chunkWithOverlap(content);

  console.log(`Deleting existing chunks for source="${SOURCE}"...`);
  await repository.deleteBySource({ source: SOURCE });

  console.log(
    `Seeding ${chunks.length} chunks (size=${CHUNK_SIZE}, overlap=${CHUNK_OVERLAP})...`,
  );

  for (let i = 0; i < chunks.length; i++) {
    const text = chunks[i]!;
    const vector = await embedding.embed({ text });
    await repository.upsert({
      id: i,
      vector,
      payload: { text, source: SOURCE },
    });
    console.log(`  Indexed chunk id=${i}`);
  }

  console.log("Company seeding complete.");
}
