from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from dotenv import load_dotenv
from document_parser import extract_text

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
    version="1.0"
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

MODELS = [
    "gemini-3.5-flash-lite",
    "gemini-3.8-flash",
    "gemini-3.7-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-flash-latest"
]

LAST_WORKING_MODEL = None


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

    MAX_CYCLES = 5
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
# Upload Document
# ==================================

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):

    global document_text

    file_path = file.filename

    with open(file_path, "wb") as f:
        f.write(await file.read())

    document_text = extract_text(file_path)

    print(
        f"Document Loaded Successfully - Length: {len(document_text)}"
    )

    return {
        "status": "success",
        "file_name": file.filename,
        "text_length": len(document_text),
        "message": "Document processed successfully"
    }


# ==================================
# Summary Endpoint
# ==================================

@app.get("/summary")
def get_summary():

    if not document_text:
        return {
            "error": "No document uploaded"
        }

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
# Runbook Endpoint
# ==================================

@app.get("/runbook")
def generate_runbook():

    if not document_text:
        return {
            "error": "No document uploaded"
        }

    prompt = f"""
Generate a complete support runbook.

Include:

- Incident Types
- Root Causes
- Troubleshooting Steps
- Resolution Process
- Escalation Matrix
- Best Practices

Return ONLY clean HTML.

Use:
<h2>
<h3>
<p>
<ul>
<li>

Do NOT use markdown.

KT Document:

{document_text[:10000]}
"""

    return generate_with_fallback(prompt)


# ==================================
# Ask Question Endpoint
# ==================================

@app.get("/ask")
def ask_question(question: str):

    if not document_text:
        return {
            "error": "No document uploaded"
        }

    prompt = f"""
You are a KT Assistant.

Answer ONLY from the KT document.

Question:

{question}

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
# Assessment Endpoint
# ==================================

@app.get("/assessment")
def generate_assessment():

    if not document_text:
        return {
            "error": "No document uploaded"
        }

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
# Health Check
# ==================================

@app.get("/")
def home():

    return {
        "message": "Binary Brains KT AI Platform Running",
        "available_models": MODELS,
        "last_working_model": LAST_WORKING_MODEL
    }