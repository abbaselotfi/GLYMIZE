import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const stories = [
  "example-button--primary",
  "example-button--secondary",
  "example-button--large",
  "example-button--small",
  "example-header--logged-in",
  "example-header--logged-out",
  "example-page--logged-in",
  "example-page--logged-out",
] as const;

for (const storyId of stories) {
  test(`${storyId} has no automatically detectable WCAG A/AA violations`, async ({
    page,
  }) => {
    await page.goto(`/iframe.html?id=${storyId}&viewMode=story`);
    await page.locator("#storybook-root").waitFor();

    const results = await new AxeBuilder({ page })
      .include("#storybook-root")
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    expect(
      results.violations,
      results.violations
        .map((violation) => `${violation.id}: ${violation.help}`)
        .join("\n"),
    ).toEqual([]);
  });
}
