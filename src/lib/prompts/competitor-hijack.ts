/**
 * Markdown-style “Competitor Hijack” brief for ASO / strategy flows (evals, docs, or future AI routes).
 */
export const competitorHijackPrompt = (ourApp: string, competitors: string[]) => `
You are a sharp Competitive ASO Analyst.

Our App: ${ourApp}
Competitors: ${competitors.join(", ")}

Perform a "Competitor Hijack" analysis.

Output in this exact format:

**Quick Wins Against Competitors**
1. Keyword Gap → [Specific keyword + why it's winnable]
2. Messaging Opportunity → [What they miss that we can own]
3. Visual/Positioning Gap → [Suggestion]

**Recommended Title Options** (2 strong options)
**Recommended Subtitle / Short Description**

**3-Week Action Plan**
- Week 1: ...
- Week 2: ...
- Week 3: ...
`.trim();
