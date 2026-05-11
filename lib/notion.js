import { Client } from "@notionhq/client";

export const notion = new Client({ auth: process.env.NOTION_TOKEN });

// Helper: pull a number/text/select from a Notion property safely
export function getProp(page, name) {
  const p = page.properties[name];
  if (!p) return null;
  switch (p.type) {
    case "title": return p.title?.[0]?.plain_text || "";
    case "rich_text": return p.rich_text?.[0]?.plain_text || "";
    case "number": return p.number;
    case "select": return p.select?.name || "";
    case "email": return p.email || "";
    case "phone_number": return p.phone_number || "";
    case "date": return p.date?.start || null;
    case "url": return p.url || "";
    case "formula":
      if (p.formula.type === "number") return p.formula.number;
      if (p.formula.type === "string") return p.formula.string;
      return null;
    case "rollup":
      if (p.rollup.type === "number") return p.rollup.number;
      return null;
    case "relation": return p.relation?.map(r => r.id) || [];
    case "unique_id": return `${p.unique_id.prefix || ""}${p.unique_id.number}`;
    default: return null;
  }
}

// Find investor by email
export async function findInvestorByEmail(email) {
  const res = await notion.databases.query({
    database_id: process.env.NOTION_INVESTORS_DB,
    filter: { property: "Email", email: { equals: email } },
  });
  return res.results[0] || null;
}

// Get all pages from a database (handles pagination)
export async function queryAll(database_id, filter = undefined) {
  const results = [];
  let cursor;
  do {
    const res = await notion.databases.query({
      database_id, filter, start_cursor: cursor, page_size: 100,
    });
    results.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return results;
}
