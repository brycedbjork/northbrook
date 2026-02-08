import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import type { ResearchEntry } from "../store/types.js";
import { paths } from "./paths.js";

const MD_EXT_REGEX = /\.md$/;

/** Raw position data from markdown frontmatter (no financial fields). */
export type RawPosition = {
  slug: string;
  symbol: string;
  orderIds: string[];
  strategy: string | null;
  openedAt: string | null;
  content: string;
};

/** Raw strategy data from markdown frontmatter (no financial fields). */
export type RawStrategy = {
  slug: string;
  name: string;
  status: string;
  lastEvaluatedAt: string | null;
  positions: string[];
  content: string;
};

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readMarkdownFiles(
  dir: string
): { slug: string; frontmatter: Record<string, unknown>; content: string }[] {
  ensureDir(dir);
  try {
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
    return files.map((file) => {
      const raw = fs.readFileSync(path.join(dir, file), "utf-8");
      const { data, content } = matter(raw);
      return {
        slug: file.replace(MD_EXT_REGEX, ""),
        frontmatter: data,
        content: content.trim(),
      };
    });
  } catch {
    return [];
  }
}

export function loadStrategies(): RawStrategy[] {
  return readMarkdownFiles(paths.strategiesDir).map(
    ({ slug, frontmatter, content }) => ({
      slug,
      name: (frontmatter.name as string) ?? slug,
      status: (frontmatter.status as string) ?? "unknown",
      lastEvaluatedAt: (frontmatter.last_evaluated_at as string) ?? null,
      positions: (frontmatter.positions as string[]) ?? [],
      content,
    })
  );
}

export function loadPositions(): RawPosition[] {
  return readMarkdownFiles(paths.positionsDir).map(
    ({ slug, frontmatter, content }) => ({
      slug,
      symbol:
        (frontmatter.symbol as string) ?? slug.split("-")[0].toUpperCase(),
      orderIds: (frontmatter.order_ids as string[]) ?? [],
      strategy: (frontmatter.strategy as string) ?? null,
      openedAt: (frontmatter.opened_at as string) ?? null,
      content,
    })
  );
}

export function loadResearch(): ResearchEntry[] {
  return readMarkdownFiles(paths.researchDir).map(
    ({ slug, frontmatter, content }) => ({
      slug,
      title: (frontmatter.title as string) ?? slug,
      completedAt: (frontmatter.completed_at as string) ?? null,
      tags: (frontmatter.tags as string[]) ?? [],
      content,
    })
  );
}
