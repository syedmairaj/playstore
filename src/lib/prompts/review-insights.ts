/**
 * Review → retention / ASO insights brief (evals, docs, or future AI routes).
 */
export const reviewInsightsPrompt = (appName: string, reviewsSummary: string) => `
You are a Retention & ASO Specialist.

App: ${appName}

Recent reviews summary: ${reviewsSummary}

Extract:
1. Top 3 positive themes
2. Top 3 pain points / complaints
3. Specific actionable improvements for next update (metadata + in-app)

Output as clear bullet points with priority level (High/Medium).
`.trim();
