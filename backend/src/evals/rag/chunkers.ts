import { chunkCompanyDocument } from "../../seeds/seedCompany";
import { legacyHybridChunks } from "./legacyHybridChunker";

export type RagChunk = {
  id: number;
  text: string;
};

export type Chunker = {
  name: string;
  chunk(document: string): RagChunk[];
};

const FIXED_CHUNK_SIZE = 400;
const FIXED_CHUNK_OVERLAP = 80;
const PAGE_SIZE = 1800;

function toChunks(texts: string[]): RagChunk[] {
  return texts
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text, id) => ({ id, text }));
}

export const fixedSizeChunker: Chunker = {
  name: "fixed-size",
  chunk(document) {
    const texts: string[] = [];
    const step = FIXED_CHUNK_SIZE - FIXED_CHUNK_OVERLAP;
    for (let start = 0; start < document.length; start += step) {
      texts.push(document.slice(start, start + FIXED_CHUNK_SIZE));
      if (start + FIXED_CHUNK_SIZE >= document.length) break;
    }
    return toChunks(texts);
  },
};

export const semanticChunker: Chunker = {
  name: "semantic",
  chunk(document) {
    return toChunks(document.split(/\n\s*\n/));
  },
};

export const hybridChunker: Chunker = {
  name: "hybrid",
  chunk(document) {
    return toChunks(legacyHybridChunks(document));
  },
};

export const pageChunker: Chunker = {
  name: "page",
  chunk(document) {
    const pages: string[] = [];
    for (const physicalPage of document.split("\f")) {
      let buffer = "";
      for (const line of physicalPage.split("\n")) {
        if (buffer.length > 0 && buffer.length + line.length + 1 > PAGE_SIZE) {
          pages.push(buffer);
          buffer = "";
        }
        buffer = buffer.length > 0 ? `${buffer}\n${line}` : line;
      }
      pages.push(buffer);
    }
    return toChunks(pages);
  },
};

export const topicChunker: Chunker = {
  name: "topic",
  chunk(document) {
    return toChunks(chunkCompanyDocument(document).map((chunk) => chunk.text));
  },
};

export const CHUNKERS: Chunker[] = [
  fixedSizeChunker,
  semanticChunker,
  hybridChunker,
  pageChunker,
  topicChunker,
];
