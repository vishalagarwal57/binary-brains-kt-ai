from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from google import genai
from dotenv import load_dotenv
from document_parser import extract_text
from semantic_search import chunk_document, embed_chunks, semantic_search
from assignments import (
    create_assignment,
    get_all_assignments,
    mark_complete,
    delete_assignment,
    get_assignment_stats
)
import sharepoint_client

import os
import time
import concurrent.futures


# ==================================
# Load Environment Variables
# ==================================

load_dotenv()


# ==================================
# Gemini Client
# ==================================

client = genai.Client(
    api_key=os.getenv("GEMINI_API_KEY")
)


# ==================================
# FastAPI App
# ==================================

app = FastAPI(
    title="Binary Brains KT AI",
    description="AI-Powered Knowledge Mining & KT Delivery Platform",
    version="2.0"
)


# ==================================
# Enable CORS
# ==================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==================================
# Global Variables
# ==================================

document_text = ""
document_name = ""
document_chunks = []
chunk_embeddings = []
embeddings_ready = False

MODELS = [
    "gemini-3.8-flash",
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-flash-latest",
    "gemini-pro-latest"
]

LAST_WORKING_MODEL = None


# ==================================
# Pydantic Models
# ==================================

class AssignmentRequest(BaseModel):
    document: str
    assignee: str
    due_date: str
    assigned_by: str = "Manager"


# ==================================
# Gemini Call
# ==================================

def call_model(model_name, prompt):

    print(f"Generating with {model_name}")

    response = client.models.generate_content(
        model=model_name,
        contents=prompt
    )

    return response.text


# ==================================
# Smart Fallback Logic
# ==================================

def generate_with_fallback(prompt):

    global LAST_WORKING_MODEL

    MAX_CYCLES = 2
    last_error = None

    if LAST_WORKING_MODEL and LAST_WORKING_MODEL in MODELS:

        models_to_try = [
            LAST_WORKING_MODEL
        ] + [
            model
            for model in MODELS
            if model != LAST_WORKING_MODEL
        ]

    else:

        models_to_try = MODELS.copy()

    for cycle in range(MAX_CYCLES):

        print(
            f"\n========== CYCLE {cycle + 1} =========="
        )

        for model_name in models_to_try:

            try:

                print(
                    f"Trying Model: {model_name}"
                )

                with concurrent.futures.ThreadPoolExecutor() as executor:

                    future = executor.submit(
                        call_model,
                        model_name,
                        prompt
                    )

                    result = future.result(timeout=15)

                LAST_WORKING_MODEL = model_name

                print(
                    f"SUCCESS: {model_name}"
                )

                return {
                    "status": "success",
                    "model_used": model_name,
                    "response": result
                }

            except concurrent.futures.TimeoutError:

                print(
                    f"TIMEOUT: {model_name}"
                )

                last_error = f"{model_name} timeout"

                continue

            except Exception as e:

                print(
                    f"FAILED: {model_name}"
                )

                print(str(e))

                last_error = str(e)

                continue

        print(
            "All models failed. Retrying in 5 seconds..."
        )

        time.sleep(5)

    return {
        "status": "error",
        "message": "All models failed",
        "last_error": last_error
    }


# ==================================
# Build Embeddings (Background)
# ==================================

def build_embeddings_in_background():

    global document_chunks, chunk_embeddings, embeddings_ready

    print("Building semantic search index...")

    document_chunks = chunk_document(document_text)

    print(f"Created {len(document_chunks)} chunks. Embedding now...")

    chunk_embeddings = embed_chunks(client, document_chunks)

    embeddings_ready = True

    print("Semantic search index ready!")


# ==================================
# Health Check
# ==================================

@app.get("/")
def home():

    return {
        "message": "Binary Brains KT AI Platform v2.0",
        "available_models": MODELS,
        "last_working_model": LAST_WORKING_MODEL,
        "document_loaded": bool(document_text),
        "semantic_search_ready": embeddings_ready,
        "chunks_indexed": len(document_chunks)
    }


# ==================================
# Upload Document
# ==================================

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):

    global document_text, document_name, embeddings_ready
    global document_chunks, chunk_embeddings

    file_path = file.filename

    with open(file_path, "wb") as f:
        f.write(await file.read())

    document_text = extract_text(file_path)
    document_name = file.filename

    # Reset embeddings for new document
    embeddings_ready = False
    document_chunks = []
    chunk_embeddings = []

    print(
        f"Document Loaded: {file.filename} — {len(document_text)} chars"
    )

    # Build semantic index in a true background thread (non-blocking)
    import threading
    threading.Thread(target=build_embeddings_in_background, daemon=True).start()

    return {
        "status": "success",
        "file_name": file.filename,
        "text_length": len(document_text),
        "message": "Document processed. Semantic index building in background..."
    }


# ==================================
# Summary Endpoint
# ==================================

@app.get("/summary")
def get_summary():

    if not document_text:
        return {"error": "No document uploaded"}

    prompt = f"""
Analyze the KT document and provide:

1. Application Name
2. Business Purpose
3. Technology Stack
4. Common Issues
5. Escalation Process
6. Key Support Activities

Return ONLY clean HTML.

Use:
<h2>
<p>
<ul>
<li>

Do NOT use markdown.

KT Document:

{document_text[:10000]}
"""

    return generate_with_fallback(prompt)


# ==================================
# Ask Question — Semantic Search + Citations
# ==================================

@app.get("/ask")
def ask_question(question: str):

    if not document_text:
        return {"error": "No document uploaded"}

    # Use semantic search if embeddings are ready
    if embeddings_ready and document_chunks and chunk_embeddings:

        print(f"Using semantic search for: {question}")

        top_chunks = semantic_search(
            client,
            question,
            document_chunks,
            chunk_embeddings,
            top_k=3
        )

        # Build context from top chunks
        context = "\n\n---\n\n".join([
            f"[Source {i+1}]: {r['chunk']['text']}"
            for i, r in enumerate(top_chunks)
        ])

        # Build citation data
        citations = [
            {
                "index": i + 1,
                "chunk_index": r["chunk"]["index"],
                "similarity": r["similarity"],
                "preview": r["chunk"]["preview"]
            }
            for i, r in enumerate(top_chunks)
        ]

    else:

        # Fallback: use full document text
        print("Embeddings not ready. Using full text fallback.")

        context = document_text[:8000]
        citations = []

    prompt = f"""
You are a KT Assistant. Answer ONLY using the provided document excerpts.

Question: {question}

Document Excerpts:
{context}

Return ONLY clean HTML. Reference [Source 1], [Source 2], [Source 3] where relevant.

Use:
<h2>
<p>
<ul>
<li>

Do NOT use markdown.
"""

    result = generate_with_fallback(prompt)

    # Attach citations to response
    result["citations"] = citations

    return result


# ==================================
# Assessment Endpoint
# ==================================

@app.get("/assessment")
def generate_assessment():

    if not document_text:
        return {"error": "No document uploaded"}

    prompt = f"""
Create 5 Multiple Choice Questions.

Requirements:
- 4 options
- Correct answer
- Beginner Friendly

Return ONLY clean HTML.

Example:

<h2>Assessment</h2>

<p>Question 1</p>

<ul>
<li>Option A</li>
<li>Option B</li>
<li>Option C</li>
<li>Option D</li>
</ul>

<p><b>Answer:</b> Option B</p>

KT Document:

{document_text[:10000]}
"""

    return generate_with_fallback(prompt)


# ==================================
# Quiz Endpoint
# ==================================

@app.get("/quiz")
def generate_quiz():

    if not document_text:
        return {"error": "No document uploaded"}

    prompt = f"""
Create 5 Multiple Choice Quiz Questions based on this document.

Requirements:
- 4 options each (A, B, C, D)
- Mark the correct answer
- Beginner friendly
- Cover different topics from the document

Return ONLY clean HTML with this format:

<h2>Knowledge Quiz</h2>

<div class="quiz-question">
<p><b>Q1:</b> Question text here?</p>
<ul>
<li>A) Option A</li>
<li>B) Option B</li>
<li>C) Option C</li>
<li>D) Option D</li>
</ul>
<p><b>Answer:</b> B) Option B</p>
</div>

Document:

{document_text[:10000]}
"""

    return generate_with_fallback(prompt)


# ==================================
# Assignment Endpoints
# ==================================

@app.post("/assignments")
def create_new_assignment(req: AssignmentRequest):

    assignment = create_assignment(
        doc_name=req.document,
        assignee=req.assignee,
        due_date=req.due_date,
        assigned_by=req.assigned_by
    )

    return {
        "status": "success",
        "assignment": assignment
    }


@app.get("/assignments")
def list_assignments():

    assignments = get_all_assignments()
    stats = get_assignment_stats()

    return {
        "status": "success",
        "assignments": assignments,
        "stats": stats
    }


@app.put("/assignments/{assignment_id}/complete")
def complete_assignment(assignment_id: str):

    assignment = mark_complete(assignment_id)

    if assignment:
        return {
            "status": "success",
            "assignment": assignment
        }

    return {
        "status": "error",
        "message": "Assignment not found"
    }


@app.delete("/assignments/{assignment_id}")
def remove_assignment(assignment_id: str):

    deleted = delete_assignment(assignment_id)

    if deleted:
        return {"status": "success", "message": "Assignment deleted"}

    return {"status": "error", "message": "Assignment not found"}


# ==================================
# SharePoint Endpoints
# ==================================

@app.get("/sharepoint/status")
def sharepoint_status():

    configured = sharepoint_client.is_configured()

    return {
        "configured": configured,
        "message": (
            "SharePoint connected"
            if configured
            else "SharePoint not configured. Add SHAREPOINT_TENANT_ID, "
                 "SHAREPOINT_CLIENT_ID, SHAREPOINT_CLIENT_SECRET, "
                 "and SHAREPOINT_SITE_URL to your .env file."
        )
    }


@app.get("/sharepoint/documents")
def list_sharepoint_documents():

    if not sharepoint_client.is_configured():
        return {
            "status": "not_configured",
            "documents": [],
            "message": "SharePoint credentials not set. See /sharepoint/status for details."
        }

    try:

        documents = sharepoint_client.list_documents()

        return {
            "status": "success",
            "documents": documents,
            "count": len(documents)
        }

    except Exception as e:

        return {
            "status": "error",
            "documents": [],
            "message": str(e)
        }


@app.post("/sharepoint/fetch")
def fetch_from_sharepoint(doc_id: str):

    if not sharepoint_client.is_configured():
        return {
            "status": "not_configured",
            "message": "SharePoint credentials not set."
        }

    global document_text, document_name, embeddings_ready
    global document_chunks, chunk_embeddings

    try:

        filename, file_bytes = sharepoint_client.download_document(doc_id)

        # Save temporarily and extract text
        with open(filename, "wb") as f:
            f.write(file_bytes)

        document_text = extract_text(filename)
        document_name = filename

        # Reset and rebuild embeddings
        embeddings_ready = False
        document_chunks = []
        chunk_embeddings = []

        with concurrent.futures.ThreadPoolExecutor() as executor:
            executor.submit(build_embeddings_in_background)

        return {
            "status": "success",
            "file_name": filename,
            "text_length": len(document_text),
            "message": f"Loaded '{filename}' from SharePoint. Indexing in background..."
        }

    except Exception as e:

        return {
            "status": "error",
            "message": str(e)
        }