"use strict";

const { GoogleGenerativeAI } = require("@google/generative-ai");

let _client;

function getClient() {
  if (_client) {
    return _client;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY in environment.");
  }

  _client = new GoogleGenerativeAI(apiKey);
  return _client;
}

async function embedText(text) {
  const candidates = [
    process.env.RAG_EMBED_MODEL,
    "gemini-embedding-001",
    "models/gemini-embedding-001",
    "gemini-embedding-2-preview",
    "models/gemini-embedding-2-preview"
  ].filter(Boolean);

  let lastError;

  for (const modelName of candidates) {
    try {
      const model = getClient().getGenerativeModel({ model: modelName });
      const result = await model.embedContent(text);
      const values = result?.embedding?.values;

      if (Array.isArray(values) && values.length > 0) {
        return values;
      }
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Gemini returned an empty embedding.");
}

async function generateAnswer(prompt) {
  const candidates = [
    process.env.RAG_CHAT_MODEL,
    "gemini-2.0-flash",
    "models/gemini-2.0-flash",
    "gemini-2.5-flash",
    "models/gemini-2.5-flash",
    "gemini-flash-latest",
    "models/gemini-flash-latest"
  ].filter(Boolean);

  let lastError;

  for (const modelName of candidates) {
    try {
      const model = getClient().getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      const text = result?.response?.text?.();

      if (text) {
        return text.trim();
      }
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Gemini returned an empty answer.");
}

module.exports = {
  embedText,
  generateAnswer
};
