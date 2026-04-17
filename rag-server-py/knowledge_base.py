"""Knowledge loading, retrieval, and answer orchestration."""

from __future__ import annotations

import json
import math
import re
import unicodedata
from pathlib import Path
from typing import Dict, List

from gemini_client import embed_text, generate_answer
from index_builder import build_knowledge_index

INDEX_PATH = Path(__file__).resolve().parent / "storage" / "knowledge-index.json"
PROJECT_ROOT = Path(__file__).resolve().parent.parent

_knowledge_index: Dict[str, object] | None = None


def normalize_for_search(text: str) -> str:
    normalized = unicodedata.normalize("NFD", str(text or "").lower())
    without_marks = "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")
    cleaned = re.sub(r"[^a-z0-9\s]", " ", without_marks)
    return re.sub(r"\s+", " ", cleaned).strip()


def tokenize(text: str) -> List[str]:
    normalized = normalize_for_search(text)
    if not normalized:
        return []
    return [token for token in normalized.split(" ") if len(token) > 1]


def keyword_similarity(question: str, chunk_text: str) -> float:
    question_tokens = tokenize(question)
    if not question_tokens:
        return 0.0

    chunk_normalized = normalize_for_search(chunk_text)
    hits = sum(1 for token in question_tokens if token in chunk_normalized)
    return hits / len(question_tokens)


def load_knowledge() -> Dict[str, object]:
    global _knowledge_index

    if _knowledge_index is not None:
        chunks = _knowledge_index.get("chunks", [])
        return {
            "generatedAt": _knowledge_index.get("generatedAt"),
            "chunkCount": len(chunks) if isinstance(chunks, list) else 0,
            "source": "memory",
        }

    try:
        content = INDEX_PATH.read_text(encoding="utf-8")
        _knowledge_index = json.loads(content)
        chunks = _knowledge_index.get("chunks", [])
        return {
            "generatedAt": _knowledge_index.get("generatedAt"),
            "chunkCount": len(chunks) if isinstance(chunks, list) else 0,
            "source": "disk",
        }
    except Exception:  # pylint: disable=broad-except
        stats = reindex_knowledge()
        return {
            "generatedAt": stats.get("generatedAt"),
            "chunkCount": stats.get("chunkCount", 0),
            "source": "reindexed",
        }


def reindex_knowledge() -> Dict[str, object]:
    global _knowledge_index

    build_stats = build_knowledge_index(PROJECT_ROOT, INDEX_PATH)
    content = INDEX_PATH.read_text(encoding="utf-8")
    _knowledge_index = json.loads(content)

    return {
        **build_stats,
        "generatedAt": _knowledge_index.get("generatedAt"),
    }


def cosine_similarity(vector_a: List[float], vector_b: List[float]) -> float:
    dot = 0.0
    norm_a = 0.0
    norm_b = 0.0

    for index, value_a in enumerate(vector_a):
        value_b = vector_b[index] if index < len(vector_b) else 0.0
        dot += value_a * value_b
        norm_a += value_a * value_a
        norm_b += value_b * value_b

    if not norm_a or not norm_b:
        return 0.0

    return dot / (math.sqrt(norm_a) * math.sqrt(norm_b))


def pick_relevant_chunks(question: str, question_embedding: List[float] | None, top_k: int) -> List[Dict[str, object]]:
    if _knowledge_index is None:
        return []

    scored: List[Dict[str, object]] = []
    chunks = _knowledge_index.get("chunks", [])
    if not isinstance(chunks, list):
        return []

    for chunk in chunks:
        if not isinstance(chunk, dict):
            continue

        chunk_text = str(chunk.get("text", ""))
        keyword_score = keyword_similarity(question, chunk_text)
        has_vector = isinstance(question_embedding, list) and isinstance(chunk.get("embedding"), list)

        if has_vector:
            vector_score = cosine_similarity(question_embedding, chunk.get("embedding", []))
            score = vector_score * 0.75 + keyword_score * 0.25
        else:
            score = keyword_score

        scored.append({**chunk, "score": score})

    scored.sort(key=lambda item: float(item.get("score", 0.0)), reverse=True)
    return [item for item in scored[:top_k] if float(item.get("score", 0.0)) > 0.05]


def format_history(history: List[Dict[str, str]]) -> str:
    lines: List[str] = []
    for turn in history[-6:]:
        role = "User" if turn.get("role") == "user" else "Assistant"
        lines.append(f"{role}: {str(turn.get('text', ''))}")
    return "\n".join(lines)


def build_prompt(question: str, history: List[Dict[str, str]], contexts: List[Dict[str, object]]) -> str:
    context_block = "\n\n".join(
        f"[{idx + 1}] Source: {ctx.get('source', '')}\n{ctx.get('text', '')}"
        for idx, ctx in enumerate(contexts)
    )
    history_block = format_history(history)

    return "\n".join(
        [
            "You are BuildTrack Assistant for an SAPUI5/Fiori construction management app.",
            "Your task is to guide end users on how to use the software based strictly on context.",
            "Rules:",
            "1) Reply in Vietnamese.",
            "2) Give practical click-by-click steps when possible.",
            "3) If context is not enough, clearly say what is missing and suggest next action.",
            "4) Keep feature names consistent with BuildTrack screens.",
            "",
            "Conversation history:",
            history_block or "(No previous conversation)",
            "",
            "Knowledge context:",
            context_block or "(No retrieved context)",
            "",
            f"User question: {question}",
            "",
            "Answer format:",
            "- Start with a direct answer.",
            "- Then provide a short numbered guide.",
            "- End with one caution or best practice if relevant.",
        ]
    )


def answer_question(question: str, history: List[Dict[str, str]] | None = None) -> Dict[str, object]:
    load_knowledge()

    if _knowledge_index is None:
        raise RuntimeError("Knowledge index is empty.")

    chunks = _knowledge_index.get("chunks", [])
    if not isinstance(chunks, list) or not chunks:
        raise RuntimeError("Knowledge index is empty.")

    question_embedding = None
    try:
        question_embedding = embed_text(question)
    except Exception:  # pylint: disable=broad-except
        question_embedding = None

    history_safe = history or []
    contexts = pick_relevant_chunks(question, question_embedding, 6)
    prompt = build_prompt(question, history_safe, contexts)

    answer = generate_answer(prompt)

    citations: List[str] = []
    seen = set()
    for ctx in contexts:
        source = str(ctx.get("source", ""))
        if source and source not in seen:
            seen.add(source)
            citations.append(source)

    return {
        "answer": answer,
        "citations": citations,
        "contextCount": len(contexts),
    }
