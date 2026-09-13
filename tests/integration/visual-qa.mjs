import AxeBuilder from "@axe-core/playwright";
import { expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

export async function auditScreen(page, name) {
  const original = page.viewportSize();
  const originalScroll = await page.evaluate(() => scrollY);
  await mkdir("test-results/phase-5", { recursive: true });
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(() => scrollTo(0, 0));
    await page.evaluate(() => document.fonts.ready);
    const navigation = page.getByRole("navigation", {
      name: "Main navigation",
      exact: true,
    });
    if (await navigation.count()) {
      await expect(navigation.locator('[aria-current="page"]')).toHaveCount(1);
      const active = navigation.locator('[aria-current="page"]');
      const path = new URL(page.url()).pathname;
      const expected = path.startsWith("/admin/users")
        ? "/admin/users"
        : path.startsWith("/admin")
          ? "/admin"
          : path === "/history"
            ? "/history"
            : "/dashboard";
      await expect(active).toHaveAttribute("href", expected);
      await page.evaluate(() => scrollTo(0, document.body.scrollHeight / 2));
      const box = await navigation.boundingBox();
      expect(
        box.y,
        "navigation stays at the top after scrolling",
      ).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThan(150);
      await page.evaluate(() => scrollTo(0, 0));
    }
    if (["dashboard", "admin-surveys", "builder"].includes(name)) {
      const action = page.locator("main .primary-button").first();
      const box = await action.boundingBox();
      expect(
        box.y,
        `${name}: primary action starts in the viewport`,
      ).toBeGreaterThanOrEqual(0);
      expect(
        box.y + box.height,
        `${name}: primary action needs no scrolling`,
      ).toBeLessThanOrEqual(844);
      expect(
        await action.evaluate((element) => {
          const r = element.getBoundingClientRect();
          return element.contains(
            document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
          );
        }),
        `${name}: primary action is not obscured`,
      ).toBe(true);
    }
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
  await page.evaluate((y) => scrollTo(0, y), originalScroll);
}
