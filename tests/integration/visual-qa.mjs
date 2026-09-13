import AxeBuilder from "@axe-core/playwright";
import { expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

export async function auditScreen(page, name) {
  const original = page.viewportSize();
  await mkdir("test-results/phase-5", { recursive: true });
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 960 });
    await page.evaluate(() => document.fonts.ready);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `${name} must fit ${width}px`,
    ).toBe(true);
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(
      result.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.map((n) => ({
          target: n.target,
          summary: n.failureSummary,
        })),
      })),
      `${name} at ${width}px`,
    ).toEqual([]);
    await page.screenshot({
      path: `test-results/phase-5/${name}-${width}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 320, height: 900 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    `${name} reflows at 320px`,
  ).toBe(true);
  if (original) await page.setViewportSize(original);
}
