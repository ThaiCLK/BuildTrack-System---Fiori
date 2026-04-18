"""BuildTrack RAG server implemented with FastAPI."""

from __future__ import annotations

import os
import threading
from typing import List

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from knowledge_base import answer_question, load_knowledge, reindex_knowledge

load_dotenv()

app = FastAPI(title="BuildTrack RAG Server", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

startup_state = {
    "ready": False,
    "error": None,
}


class HistoryTurn(BaseModel):
    role: str
    text: str


class ChatRequest(BaseModel):
    question: str
    history: List[HistoryTurn] = Field(default_factory=list)


def _initialize_knowledge() -> None:
    try:
        load_knowledge()
        startup_state["ready"] = True
        startup_state["error"] = None
        print("[RAG-PY] Knowledge index is ready.")
    except Exception as error:  # pylint: disable=broad-except
        startup_state["ready"] = False
        startup_state["error"] = str(error)
        print(f"[RAG-PY] Knowledge initialization failed: {error}")


@app.on_event("startup")
def on_startup() -> None:
    worker = threading.Thread(target=_initialize_knowledge, daemon=True)
    worker.start()


@app.get("/rag/api/health")
def health() -> dict:
    if not startup_state["ready"] and not startup_state["error"]:
        return {
            "ok": True,
            "status": "initializing",
            "message": "Knowledge index is building in background.",
        }

    if startup_state["error"]:
        raise HTTPException(
            status_code=500,
            detail={
                "ok": False,
                "status": "error",
                "error": startup_state["error"],
            },
        )

    try:
        stats = load_knowledge()
        return {"ok": True, "status": "ready", "stats": stats}
    except Exception as error:  # pylint: disable=broad-except
        raise HTTPException(status_code=500, detail={"ok": False, "error": str(error)}) from error


@app.post("/rag/api/chat")
def chat(payload: ChatRequest) -> dict:
    question = (payload.question or "").strip()
    history = [turn.model_dump() for turn in payload.history]

    if not question:
        raise HTTPException(status_code=400, detail={"ok": False, "error": "Question is required."})

    try:
        result = answer_question(question=question, history=history)
        return {"ok": True, **result}
    except Exception as error:  # pylint: disable=broad-except
        raise HTTPException(status_code=500, detail={"ok": False, "error": str(error)}) from error


@app.post("/rag/api/reindex")
def reindex() -> dict:
    try:
        stats = reindex_knowledge()
        startup_state["ready"] = True
        startup_state["error"] = None
        return {"ok": True, "stats": stats}
    except Exception as error:  # pylint: disable=broad-except
        raise HTTPException(status_code=500, detail={"ok": False, "error": str(error)}) from error


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("RAG_PORT", "4001"))
    uvicorn.run("app:app", host="0.0.0.0", port=port, reload=False)
