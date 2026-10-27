import { askWeb, AGENT_PRESETS, Perplexity } from "../../lib/perplexity";

const MAX_QUESTION_LENGTH = 2000;

// POST /api/ask — web-grounded answers via the Perplexity Agent API (admin only; each call is billed)
// Body: { adminEmail, question, preset?: "fast" | "medium" | "high", previousResponseId? }
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { adminEmail, question, preset, previousResponseId } = req.body || {};
  if (adminEmail !== process.env.NEXT_PUBLIC_ADMIN_EMAIL) {
    return res.status(403).json({ error: "Forbidden" });
  }
  if (typeof question !== "string" || !question.trim()) {
    return res.status(400).json({ error: "Question required" });
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    return res.status(400).json({ error: `Question must be under ${MAX_QUESTION_LENGTH} characters` });
  }
  if (preset !== undefined && !AGENT_PRESETS.includes(preset)) {
    return res.status(400).json({ error: `Preset must be one of: ${AGENT_PRESETS.join(", ")}` });
  }

  try {
    const result = await askWeb(question.trim(), { preset, previousResponseId });
    res.status(200).json(result);
  } catch (err) {
    if (err instanceof Perplexity.APIError) {
      console.error("Perplexity API error:", err.status, err.name);
      if (err.status === 429) {
        const retryAfter = err.headers?.get?.("retry-after");
        if (retryAfter) res.setHeader("Retry-After", retryAfter);
        return res.status(429).json({ error: "Perplexity rate limit reached. Try again shortly." });
      }
      if (err.status === 401 || err.status === 403) {
        return res.status(502).json({ error: "Perplexity rejected the API key. Check PERPLEXITY_API_KEY." });
      }
      return res.status(502).json({ error: `Perplexity API error (${err.status ?? "network"})` });
    }
    console.error(err);
    res.status(err.status || 500).json({ error: err.message });
  }
}
