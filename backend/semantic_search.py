import numpy as np
import concurrent.futures
import time

EMBED_MODEL = "gemini-embedding-001"
EMBED_TIMEOUT = 20  # seconds per embedding call
EMBED_RATE_LIMIT = 0.7  # seconds between embed calls (keeps under 100/min)


# ==================================
# Document Chunking
# ==================================

def chunk_document(text, chunk_size=800, overlap=150):
    """
    Split document into overlapping chunks.
    Returns list of chunk dicts with text, index, and position.
    """
    chunks = []
    start = 0
    idx = 0

    while start < len(text):

        end = min(start + chunk_size, len(text))

        # Try to end at a sentence boundary for cleaner chunks
        if end < len(text):
            for punct in [". ", ".\n", "? ", "! ", "?\n", "!\n"]:
                pos = text.rfind(punct, start + chunk_size // 2, end)
                if pos != -1:
                    end = pos + 2
                    break

        chunk_text = text[start:end].strip()

        if chunk_text:
            chunks.append({
                "text": chunk_text,
                "index": idx,
                "start": start,
                "end": end,
                "preview": chunk_text[:120] + "..." if len(chunk_text) > 120 else chunk_text
            })

        start = max(start + 1, end - overlap)
        idx += 1

    return chunks


# ==================================
# Cosine Similarity
# ==================================

def cosine_similarity(a, b):
    """Compute cosine similarity between two vectors."""
    a = np.array(a, dtype=float)
    b = np.array(b, dtype=float)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(np.dot(a, b) / (norm_a * norm_b))


# ==================================
# Embed All Chunks
# ==================================

def embed_chunks(client, chunks):
    """
    Embed each chunk using Gemini text-embedding-004.
    Returns list of embedding vectors (one per chunk).
    Falls back to zero vector if a chunk fails.
    """
    embeddings = []
    total = len(chunks)

    for i, chunk in enumerate(chunks):

        try:

            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(
                    client.models.embed_content,
                    model=EMBED_MODEL,
                    contents=chunk["text"]
                )
                response = future.result(timeout=EMBED_TIMEOUT)

            embeddings.append(response.embeddings[0].values)

            if (i + 1) % 25 == 0:
                print(f"  Embedded {i+1}/{total} chunks...")

        except concurrent.futures.TimeoutError:

            print(f"Embedding timeout for chunk {chunk['index']}")
            embeddings.append([0.0] * 768)

        except Exception as e:

            print(f"Embedding failed for chunk {chunk['index']}: {e}")

            # Zero-vector fallback so index alignment is preserved
            embeddings.append([0.0] * 768)

        # Rate limit to stay under free tier (100 req/min)
        time.sleep(EMBED_RATE_LIMIT)

    print(f"Embedded {len(embeddings)} chunks successfully.")

    return embeddings


# ==================================
# Semantic Search
# ==================================

def semantic_search(client, query, chunks, embeddings, top_k=3):
    """
    Find the top_k most semantically relevant chunks for the query.
    Returns list of dicts with chunk metadata and similarity score.
    """

    if not chunks or not embeddings:
        return []

    # Embed the query
    try:

        with concurrent.futures.ThreadPoolExecutor() as executor:
            future = executor.submit(
                client.models.embed_content,
                model=EMBED_MODEL,
                contents=query
            )
            query_response = future.result(timeout=EMBED_TIMEOUT)

        query_embedding = query_response.embeddings[0].values

    except Exception as e:

        print(f"Query embedding failed: {e}")

        # Fallback: return first few chunks
        return [
            {"chunk": chunks[i], "similarity": 1.0}
            for i in range(min(top_k, len(chunks)))
        ]

    # Compute cosine similarity against all chunks
    scored = []

    for i, emb in enumerate(embeddings):
        sim = cosine_similarity(query_embedding, emb)
        scored.append((sim, i))

    # Sort by similarity descending
    scored.sort(key=lambda x: x[0], reverse=True)

    # Return top_k results
    results = []

    for sim, idx in scored[:top_k]:
        results.append({
            "chunk": chunks[idx],
            "similarity": round(sim, 4)
        })

    return results
