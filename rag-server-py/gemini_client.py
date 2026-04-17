"""Gemini API client helpers for embedding and answer generation."""

from __future__ import annotations

import json
import os
from typing import Any, Dict, List
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

API_BASE = "https://generativelanguage.googleapis.com/v1beta"


def _get_api_key() -> str:
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("Missing GEMINI_API_KEY in environment.")
    return api_key


def _normalize_model_name(model_name: str) -> str:
    return model_name if model_name.startswith("models/") else f"models/{model_name}"


def _post_json(path: str, payload: Dict[str, Any], timeout: int = 60) -> Dict[str, Any]:
    query = urlencode({"key": _get_api_key()})
    url = f"{API_BASE}/{path}?{query}"
    body = json.dumps(payload).encode("utf-8")

    request = Request(
        url=url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw)
    except HTTPError as error:
        details = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Gemini HTTP {error.code}: {details}") from error
    except URLError as error:
        raise RuntimeError(f"Gemini request failed: {error.reason}") from error


def _extract_text_from_generate_response(result: Dict[str, Any]) -> str:
    for candidate in result.get("candidates", []):
        content = candidate.get("content", {})
        parts = content.get("parts", [])
        text_parts = [part.get("text", "") for part in parts if isinstance(part, dict) and part.get("text")]
        if text_parts:
            return "\n".join(text_parts).strip()
    return ""


def _extract_embedding_values(result: Dict[str, Any]) -> List[float]:
    embedding = result.get("embedding", {})
    values = embedding.get("values") if isinstance(embedding, dict) else None
    if isinstance(values, list) and values:
        return values

    embeddings = result.get("embeddings")
    if isinstance(embeddings, list) and embeddings:
        first = embeddings[0]
        if isinstance(first, dict):
            values = first.get("values")
            if isinstance(values, list) and values:
                return values

    return []


def embed_text(text: str) -> List[float]:
    candidates = [
        os.getenv("RAG_EMBED_MODEL"),
        "gemini-embedding-001",
        "models/gemini-embedding-001",
        "gemini-embedding-2-preview",
        "models/gemini-embedding-2-preview",
    ]
    models = [item for item in candidates if item]

    last_error: Exception | None = None
    for model_name in models:
        try:
            normalized = _normalize_model_name(model_name)
            result = _post_json(
                f"{normalized}:embedContent",
                {"content": {"parts": [{"text": text}]}}
            )
            values = _extract_embedding_values(result)
            if values:
                return values
        except Exception as error:  # pylint: disable=broad-except
            last_error = error

    if last_error:
        raise last_error
    raise RuntimeError("Gemini returned an empty embedding.")


def generate_answer(prompt: str) -> str:
    candidates = [
        os.getenv("RAG_CHAT_MODEL"),
        "gemini-2.0-flash",
        "models/gemini-2.0-flash",
        "gemini-2.5-flash",
        "models/gemini-2.5-flash",
        "gemini-flash-latest",
        "models/gemini-flash-latest",
    ]
    models = [item for item in candidates if item]

    last_error: Exception | None = None
    for model_name in models:
        try:
            normalized = _normalize_model_name(model_name)
            result = _post_json(
                f"{normalized}:generateContent",
                {"contents": [{"parts": [{"text": prompt}]}]},
            )
            text = _extract_text_from_generate_response(result)
            if text:
                return text
        except Exception as error:  # pylint: disable=broad-except
            last_error = error

    if last_error:
        raise last_error
    raise RuntimeError("Gemini returned an empty answer.")
