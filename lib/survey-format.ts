/** Keep survey question labels distinct from research record IDs such as Q01. */
export function formatSurveyQuestionNumbers(content: string): string {
  return content.replace(/(^|\n)([ \t]*(?:[-*+][ \t]+)?)(?:Q|Ｑ)([1-9]\d*)(?:[.．、:：][ \t]*|[ \t]+|(?=[（(]|\r?\n|$))/giu,
    (_match, lineStart: string, indent: string, number: string) => `${lineStart}${indent}${Number(number)}、`);
}
