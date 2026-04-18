# BuildTrack RAG Server (Python)

This folder provides a Python 3.13 implementation of the same RAG logic used by the Node server.

## Features

- Same endpoints:
  - GET /rag/api/health
  - POST /rag/api/chat
  - POST /rag/api/reindex
- Same retrieval flow:
  - Build index from selected docs/source files
  - Optional Gemini embeddings
  - Hybrid ranking (cosine + keyword)

## Setup

1. Create virtual environment (optional but recommended):

   python -m venv .venv

2. Activate environment:

   - PowerShell: .venv\Scripts\Activate.ps1
   - Linux/macOS: source .venv/bin/activate

3. Install dependencies:

   pip install -r rag-server-py/requirements.txt

4. Create environment file:

   - Copy rag-server-py/.env.example to .env at project root

## Run

- Start API server:

  python rag-server-py/app.py

- Rebuild index manually:

  python rag-server-py/build_index.py

The default port is 4001, so existing UI proxy /rag can stay unchanged.
