/**
 * Number formatting shared by the HUD and the two end screens (issue #25).
 *
 * One function rather than a `toLocaleString` at each of the three call sites,
 * so the running total on the HUD and the final tally on the screen that
 * follows it can never disagree about grouping.
 *
 * The locale is pinned to `en-US` rather than left to the browser: the game's
 * copy is English throughout, and a total that reads `1.234.567` next to English
 * labels is a mismatch nobody asked for.
 */
export function formatNumber(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}
