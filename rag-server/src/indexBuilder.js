"use strict";

const fs = require("fs/promises");
const path = require("path");
const { embedText } = require("./geminiClient");

const MAX_FILE_CHARACTERS = 20000;
const CHUNK_SIZE = 1200;
const CHUNK_OVERLAP = 160;
const ENABLE_EMBEDDINGS = String(process.env.RAG_ENABLE_EMBEDDINGS || "false") === "true";

const TARGETS = [
  "README.md",
  "ProjectScreen.md",
  "SiteScreen.md",
  "webapp/manifest.json",
  "webapp/i18n/i18n.properties",
  "webapp/controller",
  "webapp/view",
  "webapp/utils"
];

const ALLOWED_EXTENSIONS = new Set([".md", ".xml", ".js", ".properties", ".json"]);

async function readExistingFile(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function collectFiles(baseDir) {
  const files = [];

  for (const relativeTarget of TARGETS) {
    const absoluteTarget = path.join(baseDir, relativeTarget);
    if (!(await readExistingFile(absoluteTarget))) {
      await collectRecursively(absoluteTarget, files);
      continue;
    }

    files.push(absoluteTarget);
  }

  return files;
}

async function collectRecursively(entryPath, files) {
  try {
    const stat = await fs.stat(entryPath);

    if (stat.isFile()) {
      const ext = path.extname(entryPath).toLowerCase();
      if (ALLOWED_EXTENSIONS.has(ext)) {
        files.push(entryPath);
      }
      return;
    }

    if (!stat.isDirectory()) {
      return;
    }

    const entries = await fs.readdir(entryPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) {
        continue;
      }

      const absoluteChild = path.join(entryPath, entry.name);
      if (entry.isDirectory()) {
        await collectRecursively(absoluteChild, files);
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        if (ALLOWED_EXTENSIONS.has(ext)) {
          files.push(absoluteChild);
        }
      }
    }
  } catch {
    // Ignore missing paths so this script can run across environments.
  }
}

function normalizeText(rawText) {
  return rawText
    .replace(/\r/g, "")
    .replace(/\t/g, "    ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitIntoChunks(text) {
  if (!text) {
    return [];
  }

  const chunks = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    const chunkText = text.slice(start, end).trim();

    if (chunkText) {
      chunks.push(chunkText);
    }

    if (end >= text.length) {
      break;
    }

    start = Math.max(0, end - CHUNK_OVERLAP);
  }

  return chunks;
}

async function buildKnowledgeIndex(baseDir, outputPath) {
  const files = await collectFiles(baseDir);
  const chunks = [];
  let embeddingEnabled = ENABLE_EMBEDDINGS;
  let embeddedChunkCount = 0;
  let embeddingsDisabledReason = null;

  for (const absoluteFilePath of files) {
    const relativePath = path.relative(baseDir, absoluteFilePath).replace(/\\/g, "/");
    const rawText = await fs.readFile(absoluteFilePath, "utf8");
    const normalized = normalizeText(rawText).slice(0, MAX_FILE_CHARACTERS);
    const fileChunks = splitIntoChunks(normalized);

    for (let index = 0; index < fileChunks.length; index += 1) {
      const text = fileChunks[index];
      let embedding = null;

      if (embeddingEnabled) {
        try {
          embedding = await embedText(text);
          embeddedChunkCount += 1;
        } catch (error) {
          embeddingEnabled = false;
          embeddingsDisabledReason = error.message;
        }
      }

      chunks.push({
        id: `${relativePath}#${index + 1}`,
        source: relativePath,
        text,
        embedding
      });
    }
  }

  const indexData = {
    generatedAt: new Date().toISOString(),
    chunks
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(indexData, null, 2), "utf8");

  return {
    fileCount: files.length,
    chunkCount: chunks.length,
    embeddingEnabled,
    embeddedChunkCount,
    embeddingsDisabledReason,
    outputPath
  };
}

module.exports = {
  buildKnowledgeIndex
};
