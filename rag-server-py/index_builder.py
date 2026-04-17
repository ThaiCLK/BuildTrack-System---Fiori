"""Knowledge index builder for BuildTrack RAG."""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List

from gemini_client import embed_text

MAX_FILE_CHARACTERS = 20000
CHUNK_SIZE = 1200
CHUNK_OVERLAP = 160
ENABLE_EMBEDDINGS = os.getenv("RAG_ENABLE_EMBEDDINGS", "false").lower() == "true"

TARGETS = [
    "README.md",
    "ProjectScreen.md",
    "SiteScreen.md",
    "webapp/manifest.json",
    "webapp/i18n/i18n.properties",
    "webapp/controller",
    "webapp/view",
    "webapp/utils",
]

ALLOWED_EXTENSIONS = {".md", ".xml", ".js", ".properties", ".json"}


def collect_recursively(entry_path: Path, files: List[Path]) -> None:
    try:
        if entry_path.is_file():
            if entry_path.suffix.lower() in ALLOWED_EXTENSIONS:
                files.append(entry_path)
            return

        if not entry_path.is_dir():
            return

        for child in entry_path.iterdir():
            if child.name.startswith("."):
                continue
            if child.is_dir():
                collect_recursively(child, files)
            elif child.suffix.lower() in ALLOWED_EXTENSIONS:
                files.append(child)
    except FileNotFoundError:
        # Ignore missing paths so this script can run across environments.
        return


def collect_files(base_dir: Path) -> List[Path]:
    files: List[Path] = []

    for relative_target in TARGETS:
        absolute_target = base_dir / relative_target
        if absolute_target.is_file():
            files.append(absolute_target)
            continue
        collect_recursively(absolute_target, files)

    return files


def normalize_text(raw_text: str) -> str:
    return (
        raw_text.replace("\r", "")
        .replace("\t", "    ")
        .replace("\n\n\n", "\n\n")
        .strip()
    )


def split_into_chunks(text: str) -> List[str]:
    if not text:
        return []

    chunks: List[str] = []
    start = 0
    length = len(text)

    while start < length:
        end = min(start + CHUNK_SIZE, length)
        chunk_text = text[start:end].strip()
        if chunk_text:
            chunks.append(chunk_text)

        if end >= length:
            break

        start = max(0, end - CHUNK_OVERLAP)

    return chunks


def build_knowledge_index(base_dir: Path, output_path: Path) -> Dict[str, object]:
    files = collect_files(base_dir)
    chunks: List[Dict[str, object]] = []

    embedding_enabled = ENABLE_EMBEDDINGS
    embedded_chunk_count = 0
    embeddings_disabled_reason = None

    for absolute_file_path in files:
        relative_path = absolute_file_path.relative_to(base_dir).as_posix()
        raw_text = absolute_file_path.read_text(encoding="utf-8")
        normalized = normalize_text(raw_text)[:MAX_FILE_CHARACTERS]
        file_chunks = split_into_chunks(normalized)

        for index, text in enumerate(file_chunks, start=1):
            embedding = None
            if embedding_enabled:
                try:
                    embedding = embed_text(text)
                    embedded_chunk_count += 1
                except Exception as error:  # pylint: disable=broad-except
                    embedding_enabled = False
                    embeddings_disabled_reason = str(error)

            chunks.append(
                {
                    "id": f"{relative_path}#{index}",
                    "source": relative_path,
                    "text": text,
                    "embedding": embedding,
                }
            )

    generated_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    index_data = {
        "generatedAt": generated_at,
        "chunks": chunks,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(index_data, ensure_ascii=True, indent=2), encoding="utf-8")

    return {
        "fileCount": len(files),
        "chunkCount": len(chunks),
        "embeddingEnabled": embedding_enabled,
        "embeddedChunkCount": embedded_chunk_count,
        "embeddingsDisabledReason": embeddings_disabled_reason,
        "outputPath": str(output_path),
    }
