/**
 * Tiny class-name combiner. Filters out falsy values and joins with a space.
 * Keeps JSX readable without pulling in a dependency.
 */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}
