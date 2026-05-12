# Prompt Library

> **Implementation note:** The live Phase 1 listing optimizer uses the versioned prompt builder in `lib/prompts/listing-optimizer.ts` (JSON-only Gemini output). See `docs/listing-optimizer.md` for the end-to-end prompt flow.

## Title Generator Prompt
Generate 10 Google Play title options for this app. Keep them short, clear, keyword-rich, and natural. Avoid spammy or repetitive language.

## Short Description Prompt
Write 5 Google Play short descriptions. Focus on clarity, value, and conversion. Keep each one concise and human.

## Long Description Prompt
Write a Google Play long description that explains the app clearly, includes relevant keywords naturally, and highlights benefits without sounding robotic.

## Competitor Analysis Prompt
Compare this app with its top competitors. Summarize keyword gaps, copy differences, feature gaps, and opportunities in a simple format.

## Review Insights Prompt
Analyze these reviews and summarize top complaints, top praise, recurring themes, and feature requests. Keep the output practical and concise.

## Localization Prompt
Adapt this app listing for Arabic, English, and selected target markets. Keep the meaning accurate while adjusting wording for local relevance.

## ASO Score Prompt
Evaluate this listing and provide a score from 1 to 100. Explain the score using clarity, keyword use, conversion strength, and localization readiness.
