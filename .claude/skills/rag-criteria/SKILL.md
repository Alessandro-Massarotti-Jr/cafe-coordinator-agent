---
name: rag-criteria
description: criteria for RAG (Retrieval Augmented Generation) evaluation and testing
---

A RAG system is basicaly three steps:

1. Chunking the documents into smaller, manageable pieces.
2. Indexing and retrieving relevant chunks based on user queries.
3. Generating responses by combining retrieved chunks with a language model.

this skill is for show how to evaluate and test RAG systems effectively.

## chunking strategies

1. split into chunks with a fixed number of tokens or characters to ensure consistent chunk sizes and improve retrieval performance, usually with chunking overlap to maintain context between chunks

2. use semantic or content-based chunking to split documents at natural boundaries, such as paragraphs or sections, to preserve context and improve retrieval relevance

3. combine both fixed-size and semantic chunking to balance consistency and context preservation, ensuring that chunks are both manageable in size and semantically meaningful

4. chunk by page, splitting documents based on page boundaries to maintain the original document structure and context

## search and retrieval strategies

1. naive search, retrieving chunks based on simple keyword matching without considering semantic meaning

2. hybrid search, combining both keyword-based and semantic search to improve retrieval accuracy and relevance

## Criteria for RAG Evaluation

1. have some common questions of the users with the respective answer data set, including questions with common typos and variations in phrasing

2. slice document into smaller chunks to improve retrieval accuracy and efficiency
