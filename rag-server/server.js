"use strict";

const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const {
  answerQuestion,
  loadKnowledge,
  reindexKnowledge
} = require("./src/knowledgeBase");

dotenv.config();

const app = express();
const port = Number(process.env.RAG_PORT || 4001);
let startupState = {
  ready: false,
  error: null
};

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/rag/api/health", async (_req, res) => {
  try {
    if (!startupState.ready && !startupState.error) {
      return res.json({
        ok: true,
        status: "initializing",
        message: "Knowledge index is building in background."
      });
    }

    if (startupState.error) {
      return res.status(500).json({
        ok: false,
        status: "error",
        error: startupState.error
      });
    }

    const stats = await loadKnowledge();
    res.json({ ok: true, status: "ready", stats });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

app.post("/rag/api/chat", async (req, res) => {
  try {
    const question = String(req.body?.question || "").trim();
    const history = Array.isArray(req.body?.history) ? req.body.history : [];

    if (!question) {
      return res.status(400).json({
        ok: false,
        error: "Question is required."
      });
    }

    const result = await answerQuestion({ question, history });
    return res.json({ ok: true, ...result });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

app.post("/rag/api/reindex", async (_req, res) => {
  try {
    const stats = await reindexKnowledge();
    res.json({ ok: true, stats });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

(async () => {
  const server = app.listen(port, () => {
    console.log(`[RAG] BuildTrack assistant running on http://localhost:${port}`);
  });

  server.on("error", (error) => {
    if (error && error.code === "EADDRINUSE") {
      console.log(`[RAG] Port ${port} is already in use. Assuming assistant server is already running.`);
      process.exit(0);
    }

    console.error("[RAG] Server listen failed:", error.message);
    process.exit(1);
  });

  loadKnowledge()
    .then(() => {
      startupState.ready = true;
      startupState.error = null;
      console.log("[RAG] Knowledge index is ready.");
    })
    .catch((error) => {
      startupState.ready = false;
      startupState.error = error.message;
      console.error("[RAG] Knowledge initialization failed:", error.message);
    });
})();
