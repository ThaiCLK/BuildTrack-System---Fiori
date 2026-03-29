"use strict";

require("dotenv").config();

const path = require("path");
const { reindexKnowledge } = require("../src/knowledgeBase");

(async () => {
  try {
    const stats = await reindexKnowledge();
    console.log("[RAG] Reindex completed.");
    console.log(JSON.stringify(stats, null, 2));
  } catch (error) {
    console.error("[RAG] Reindex failed:", error.message);
    process.exit(1);
  }
})();
