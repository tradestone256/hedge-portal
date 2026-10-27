import Perplexity from "@perplexity-ai/perplexity_ai";

// Agent API presets bundle model, tools (incl. web_search) and limits.
// "fast" for quick lookups, "medium" for analysis, "high" for deep research.
export const AGENT_PRESETS = ["fast", "medium", "high"];
const DEFAULT_PRESET = "fast";

// Created lazily so builds and pages that never call the API don't need the key.
// The SDK reads PERPLEXITY_API_KEY from the environment.
let client = null;
function getClient() {
  if (!process.env.PERPLEXITY_API_KEY) {
    const err = new Error("PERPLEXITY_API_KEY is not configured");
    err.status = 503;
    throw err;
  }
  if (!client) client = new Perplexity();
  return client;
}

// Collect unique sources from search_results output items and URL citation annotations
function extractSources(output = []) {
  const byUrl = new Map();
  for (const item of output) {
    if (item.type === "search_results") {
      for (const r of item.results || []) {
        if (r.url && !byUrl.has(r.url)) {
          byUrl.set(r.url, { id: r.id, title: r.title, url: r.url, date: r.date || null });
        }
      }
    }
    if (item.type === "message") {
      for (const part of item.content || []) {
        for (const a of part.annotations || []) {
          if (a.url && !byUrl.has(a.url)) {
            byUrl.set(a.url, { id: null, title: a.title || a.url, url: a.url, date: null });
          }
        }
      }
    }
  }
  return [...byUrl.values()];
}

// Ask a web-grounded question via the Perplexity Agent API.
// Pass previousResponseId to continue an earlier conversation.
export async function askWeb(question, { preset = DEFAULT_PRESET, previousResponseId, instructions } = {}) {
  const response = await getClient().responses.create({
    preset,
    input: question,
    ...(instructions && { instructions }),
    ...(previousResponseId && { previous_response_id: previousResponseId }),
  });

  if (response.status === "failed") {
    const err = new Error(response.error?.message || "Perplexity response failed");
    err.status = 502;
    throw err;
  }

  return {
    answer: response.output_text || "",
    sources: extractSources(response.output),
    responseId: response.id,
    model: response.model,
    usage: response.usage || null,
  };
}

export { Perplexity };
