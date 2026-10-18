import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function mediaBlocks(source: string, condition: string): string[] {
  const marker = `@media (${condition})`;
  const blocks: string[] = [];
  let cursor = 0;
  while (cursor < source.length) {
    const start = source.indexOf(marker, cursor);
    if (start < 0) break;
    const open = source.indexOf("{", start + marker.length);
    let depth = 1;
    let index = open + 1;
    while (index < source.length && depth > 0) {
      if (source[index] === "{") depth += 1;
      if (source[index] === "}") depth -= 1;
      index += 1;
    }
    blocks.push(source.slice(open + 1, index - 1));
    cursor = index;
  }
  return blocks;
}

describe("ERP tablet table layout", () => {
  it("keeps wide table action columns reachable from 821px through the 1120px breakpoint", () => {
    const css = readFileSync("app/globals.css", "utf8");
    const tabletContract = mediaBlocks(css, "max-width: 1120px").join("\n");

    expect(tabletContract).toMatch(/\.table-panel\s*\{[^}]*overflow-x:\s*auto/i);
    expect(tabletContract).toMatch(/\.data-table\s*\{[^}]*min-width:\s*(?:9\d{2}|[1-9]\d{3,})px/i);
  });
});
