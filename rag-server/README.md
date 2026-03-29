# BuildTrack RAG Server

## Endpoints

- GET /rag/api/health
- POST /rag/api/chat
- POST /rag/api/reindex

## Notes

- Service reads GEMINI_API_KEY from environment.
- Knowledge index is generated at rag-server/storage/knowledge-index.json.
- Index source scope is defined in src/indexBuilder.js (TARGETS).
