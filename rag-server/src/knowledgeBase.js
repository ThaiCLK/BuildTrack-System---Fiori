"use strict";

const fs = require("fs/promises");
const path = require("path");
const { embedText, generateAnswer } = require("./geminiClient");
const { buildKnowledgeIndex } = require("./indexBuilder");

const INDEX_PATH = path.join(__dirname, "..", "storage", "knowledge-index.json");
const PROJECT_ROOT = path.join(__dirname, "..", "..");

let _knowledgeIndex;

function normalizeForSearch(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text) {
  const normalized = normalizeForSearch(text);
  return normalized ? normalized.split(" ").filter((token) => token.length > 1) : [];
}

function keywordSimilarity(question, chunkText) {
  const qTokens = tokenize(question);
  if (!qTokens.length) {
    return 0;
  }

  const chunk = normalizeForSearch(chunkText);
  let hits = 0;

  for (const token of qTokens) {
    if (chunk.includes(token)) {
      hits += 1;
    }
  }

  return hits / qTokens.length;
}

async function loadKnowledge() {
  if (_knowledgeIndex) {
    return {
      generatedAt: _knowledgeIndex.generatedAt,
      chunkCount: _knowledgeIndex.chunks.length,
      source: "memory"
    };
  }

  try {
    const content = await fs.readFile(INDEX_PATH, "utf8");
    _knowledgeIndex = JSON.parse(content);
    return {
      generatedAt: _knowledgeIndex.generatedAt,
      chunkCount: _knowledgeIndex.chunks.length,
      source: "disk"
    };
  } catch {
    const stats = await reindexKnowledge();
    return {
      generatedAt: new Date().toISOString(),
      chunkCount: stats.chunkCount,
      source: "reindexed"
    };
  }
}

async function reindexKnowledge() {
  const buildStats = await buildKnowledgeIndex(PROJECT_ROOT, INDEX_PATH);
  const content = await fs.readFile(INDEX_PATH, "utf8");
  _knowledgeIndex = JSON.parse(content);

  return {
    ...buildStats,
    generatedAt: _knowledgeIndex.generatedAt
  };
}

function cosineSimilarity(vectorA, vectorB) {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vectorA.length; i += 1) {
    const a = vectorA[i];
    const b = vectorB[i] || 0;
    dot += a * b;
    normA += a * a;
    normB += b * b;
  }

  if (!normA || !normB) {
    return 0;
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function pickRelevantChunks(question, questionEmbedding, topK) {
  const scored = _knowledgeIndex.chunks.map((chunk) => ({
    ...chunk,
    score: (() => {
      const keywordScore = keywordSimilarity(question, chunk.text);
      const hasVector = Array.isArray(questionEmbedding) && Array.isArray(chunk.embedding);

      if (!hasVector) {
        return keywordScore;
      }

      const vectorScore = cosineSimilarity(questionEmbedding, chunk.embedding);
      return vectorScore * 0.75 + keywordScore * 0.25;
    })()
  }));

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .filter((chunk) => chunk.score > 0.05);
}

function formatHistory(history) {
  return history
    .slice(-6)
    .map((turn) => {
      const role = turn.role === "user" ? "User" : "Assistant";
      return `${role}: ${String(turn.text || "")}`;
    })
    .join("\n");
}

function buildPrompt(question, history, contexts) {
  const contextBlock = contexts
    .map((ctx, idx) => `[${idx + 1}] Source: ${ctx.source}\n${ctx.text}`)
    .join("\n\n");

  const historyBlock = formatHistory(history);

  return [
    "You are BuildTrack Assistant for an SAPUI5/Fiori construction management app.",
    "Your task is to guide end users on how to use the software based strictly on context.",
    "Rules:",
    "1) Reply in Vietnamese.",
    "2) Give practical click-by-click steps when possible.",
    "3) If context is not enough, clearly say what is missing and suggest next action.",
    "4) Keep feature names consistent with BuildTrack screens.",
    "",
    "Conversation history:",
    historyBlock || "(No previous conversation)",
    "",
    "Knowledge context:",
    contextBlock || "(No retrieved context)",
    "",
    `User question: ${question}`,
    "",
    "Answer format:",
    "- Start with a direct answer.",
    "- Then provide a short numbered guide.",
    "- End with one caution or best practice if relevant."
  ].join("\n");
}

async function answerQuestion({ question, history = [] }) {
  await loadKnowledge();

  if (!_knowledgeIndex?.chunks?.length) {
    throw new Error("Knowledge index is empty.");
  }

  let questionEmbedding = null;
  try {
    questionEmbedding = await embedText(question);
  } catch {
    questionEmbedding = null;
  }

  const contexts = pickRelevantChunks(question, questionEmbedding, 6);
  const prompt = buildPrompt(question, history, contexts);

  const answer = await generateAnswer(prompt);
  const citations = Array.from(new Set(contexts.map((ctx) => ctx.source)));

  return {
    answer,
    citations,
    contextCount: contexts.length
  };
}

module.exports = {
  answerQuestion,
  loadKnowledge,
  reindexKnowledge
};
