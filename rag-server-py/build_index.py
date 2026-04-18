"""Manual index rebuild entrypoint for the Python RAG server."""

from __future__ import annotations

import json

from dotenv import load_dotenv

from knowledge_base import reindex_knowledge


def main() -> None:
    load_dotenv()
    try:
        stats = reindex_knowledge()
        print("[RAG-PY] Reindex completed.")
        print(json.dumps(stats, indent=2))
    except Exception as error:  # pylint: disable=broad-except
        print(f"[RAG-PY] Reindex failed: {error}")
        raise SystemExit(1) from error


if __name__ == "__main__":
    main()
