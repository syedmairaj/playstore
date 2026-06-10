# 🎨 ARCHITECTURE DIAGRAMS

Visual representation of the Universal Staged-State Architecture

---

## 1. Core Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER REQUEST                                │
│                    (Feature Data Input)                             │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 ▼
                    ┌────────────────────────┐
                    │   VaultRouterService   │
                    │                        │
                    │ 1. Validate locale     │
                    │ 2. Fetch vault         │
                    │ 3. Route to producer   │
                    │ 4. Persist result      │
                    └────────────┬───────────┘
                                 │
                 ┌───────────────┴────────────────┐
                 │                                │
                 ▼ (en)                       ▼ (ar)
        ┌──────────────────────┐      ┌──────────────────────┐
        │   ProducerRegistry   │      │  ProducerRegistry    │
        │                      │      │                      │
        │ (Isolation Enforcer) │      │ (Isolation Enforcer) │
        │                      │      │                      │
        │ 1. Route to producer │      │ 1. Route to producer │
        │ 2. Call produce()    │      │ 2. Call produce()    │
        │ 3. Verify isolation  │      │ 3. Verify isolation  │
        │ 4. Return result     │      │ 4. Return result     │
        └──────┬───────────────┘      └────┬─────────────────┘
               │                           │
         ┌─────┴──────────────┬────────────┴─────────────────┐
         │                    │                              │
         ▼                    ▼                              ▼
  ┌──────────────┐   ┌──────────────┐            ┌──────────────┐
  │   Keyword    │   │  Competitor  │    ...     │   User Pref  │
  │   Tracker    │   │     Spy      │            │   Producer   │
  │  Producer    │   │  Producer    │            │              │
  │              │   │              │            │              │
  │ Only touches │   │ Only touches │            │ Only touches │
  │ keyword_     │   │ competitor_  │            │ user_        │
  │ tracker key  │   │ spy key      │            │ preferences  │
  └──────┬───────┘   └──────┬───────┘            └──────┬───────┘
         │                  │                          │
         └──────────────────┼──────────────────────────┘
                            │
                            ▼
          ┌─────────────────────────────────┐
          │   Return to VaultRouterService  │
          │                                 │
          │ Updated Vault (only this        │
          │ feature modified, only this     │
          │ locale touched)                 │
          └────────────────┬────────────────┘
                           │
                           ▼
                ┌──────────────────────┐
                │  Save to Database    │
                │                      │
                │ INSERT/UPDATE        │
                │ workspace_staging_   │
                │ vault                │
                └────────────────┬─────┘
                                 │
                                 ▼
                       ┌──────────────────┐
                       │ Response to User │
                       │                  │
                       │ Feature data     │
                       │ (only requested  │
                       │ locale)          │
                       └──────────────────┘
```

---

## 2. Vault Structure (EN Locale)

```
┌─────────────────────────────────────────────────────────────────┐
│           workspace_staging_vault.state_en (JSON)               │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ features: {                                              │  │
│  │                                                          │  │
│  │   keyword_tracker: {                    ┌─────────────┐ │  │
│  │     keywords: [                         │ Maintained  │ │  │
│  │       {id, term, difficulty, volume}    │ by Keyword  │ │  │
│  │     ],                                  │ Tracker     │ │  │
│  │     metadata: {...}    ◄────────────────│ Producer    │ │  │
│  │   }                                     └─────────────┘ │  │
│  │                                                          │  │
│  │   competitor_spy: {                     ┌─────────────┐ │  │
│  │     competitors: [                      │ Maintained  │ │  │
│  │       {app_name, keywords, weaknesses}  │ by Competitor
│  │     ],                                  │ Spy         │ │  │
│  │     metadata: {...}    ◄────────────────│ Producer    │ │  │
│  │   }                                     └─────────────┘ │  │
│  │                                                          │  │
│  │   review_analysis: {                    ┌─────────────┐ │  │
│  │     summary: {...},                     │ Maintained  │ │  │
│  │     themes: [...],                      │ by Review   │ │  │
│  │     opportunities: [...]   ◄────────────│ Analysis    │ │  │
│  │   }                                     │ Producer    │ │  │
│  │                                         └─────────────┘ │  │
│  │   keyword_validator: {                  ┌─────────────┐ │  │
│  │     validated_keywords: [...]   ◄───────│ Maintained  │ │  │
│  │   }                                     │ by Keyword  │ │  │
│  │                                         │ Validator   │ │  │
│  │   experiment_snapshots: {               │ Producer    │ │  │
│  │     baselines: [...],                   └─────────────┘ │  │
│  │     variants: [...]                                      │  │
│  │   }                                                      │  │
│  │                                                          │  │
│  │   user_preferences: {       ┌──────────────────────┐    │  │
│  │     tone: "professional",   │ Can Add Today!       │    │  │
│  │     auto_generate: true      │ (New Producer)       │    │  │
│  │   }                          └──────────────────────┘    │  │
│  │                                                          │  │
│  │ }                                                        │  │
│  │                                                          │  │
│  │ metadata: {                                              │  │
│  │   locale: "en",                                          │  │
│  │   last_producer: "keyword_validator",                   │  │
│  │   last_producer_timestamp: "2026-06-10T14:30:00Z",      │  │
│  │   feature_count: 6,                                      │  │
│  │   dirty_flags: {                                         │  │
│  │     keyword_tracker: true,                              │  │
│  │     competitor_spy: false,                              │  │
│  │     ...                                                 │  │
│  │   }                                                      │  │
│  │ }                                                        │  │
│  │                                                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

                         ARABIC LOCALE
                         (Completely Separate)
                              ▼

┌─────────────────────────────────────────────────────────────────┐
│           workspace_staging_vault.state_ar (JSON)               │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ features: {                                              │  │
│  │   keyword_tracker: { ... }  (DIFFERENT DATA!)           │  │
│  │   competitor_spy: { ... }   (DIFFERENT DATA!)           │  │
│  │   review_analysis: { ... }  (DIFFERENT DATA!)           │  │
│  │   user_preferences: { ... } (DIFFERENT DATA!)           │  │
│  │   ...                                                    │  │
│  │ }                                                        │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Producer Isolation Enforcement

```
┌──────────────────────────────────────────────────────────────┐
│        ProducerRegistry.verifyIsolation()                    │
│                                                              │
│  GOAL: Ensure ONLY this feature was modified                │
│        in ONLY this locale                                  │
└────────────────────────────┬─────────────────────────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
         ▼                   ▼                   ▼
    ┌─────────┐         ┌─────────┐       ┌──────────┐
    │ Check 1 │         │ Check 2 │       │ Check 3  │
    │         │         │         │       │          │
    │ Other   │         │ Other   │       │ New      │
    │ locale  │         │ features│       │ features │
    │ (ar)    │         │ in same │       │ added?   │
    │ must be │         │ locale  │       │          │
    │ TOTALLY │         │ must be │       │ ❌ Not   │
    │ the     │         │ TOTALLY │       │ allowed  │
    │ same    │         │ the     │       │          │
    │         │         │ same    │       │          │
    └────┬────┘         └────┬────┘       └────┬─────┘
         │                   │                 │
         ▼                   ▼                 ▼
    ┌──────────┐         ┌──────────┐     ┌──────────┐
    │ ✅ PASS  │         │ ✅ PASS  │     │ ✅ PASS  │
    │          │         │          │     │          │
    │ state_ar │         │ keyword_ │     │ No new   │
    │ before   │         │ tracker, │     │ features │
    │ ==       │         │ review_  │     │ detected │
    │ state_ar │         │ analysis │     │          │
    │ after    │         │ unchanged│     │          │
    └──────────┘         └──────────┘     └──────────┘
         │                   │                 │
         └───────────────────┼─────────────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │   IF ALL PASS   │
                    │                 │
                    │ ✅ ISOLATION    │
                    │    VERIFIED     │
                    │                 │
                    │ Update persists │
                    └─────────────────┘
                             │
                    ┌────────────────────────┐
                    │  IF ANY CHECK FAILS    │
                    │                        │
                    │ ❌ IsolationViolation  │
                    │    Error thrown        │
                    │                        │
                    │ Update REJECTED        │
                    │ (Vault unchanged)      │
                    └────────────────────────┘
```

---

## 4. Token-Aware Synthesis Context Building

```
┌─────────────────────────────────────────────────────────────────┐
│         workspace_staging_vault.state_en.features               │
│                                                                 │
│  keyword_tracker: [...1000 keywords...]                        │
│  competitor_spy: [...500 competitors...]                       │
│  review_analysis: [...5000 reviews...]                         │
│  user_preferences: {...}                                       │
│                                                                 │
│  TOTAL SIZE: ~2.5 MB (way over token budget)                   │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
            ┌──────────────────────────────┐
            │ SynthesisContextBuilder      │
            │                              │
            │ Extract & Prioritize:        │
            └──────────┬───────────────────┘
                       │
         ┌─────────────┼─────────────┬─────────────┐
         │             │             │             │
         ▼             ▼             ▼             ▼
    ┌────────┐   ┌────────┐   ┌────────┐   ┌────────┐
    │ Filter │   │Summarize
│  Truncate  │   │ Estimate │
    │Priority│   │  Less    │   │ Tokens │   │
    │  1     │   │ Important│   │        │   │
    │        │   │  Data    │   │        │   │
    │Keywords│   │          │   │        │   │
    │ Top 20 │   │ - Reviews│   │ 4000   │   │
    │        │   │   Top 5  │   │ tokens │   │
    └────┬───┘   │ - Comp   │   │ ✅OK   │   │
         │       │   Top 2  │   │        │   │
    ┌────┴───┐   │ - Themes │   └────────┘   │
    │ Filter │   │   Top 3  │                │
    │Priority│   │          │                │
    │  2     │   └────┬─────┘                │
    │        │        │         ┌────────────┘
    │Compet  │        │         │
    │ Top 5  │        │         │ Under limit?
    │        │        │         │
    └────┬───┘        │         │
         │            │         ▼ ✅ YES
    ┌────┴───┐        │    ┌─────────────┐
    │ Filter │        │    │   DONE      │
    │Priority│        │    │             │
    │  3     │        │    │ SynthContext│
    │        │        │    │ Ready for   │
    │Reviews │        │    │ Gemini      │
    │ Top 5  │        │    └─────────────┘
    │        │        │
    └────┬───┘        │
         │            │ ❌ NO (over budget)
         │            │
         └────────────┼──────┐
              │       │      │
              │       └──────┼────┐
              │              │    │
              ▼              ▼    ▼
        ┌─────────────────────────────┐
        │ TRUNCATE Least Important    │
        │                             │
        │ Reviews: 5 → 3              │
        │ Competitors: 5 → 2          │
        │ Themes: 5 → 2               │
        │                             │
        │ Re-estimate: 3200 tokens ✅ │
        │                             │
        └────────────┬────────────────┘
                     │
                     ▼
        ┌────────────────────────────┐
        │  Final Synthesis Context   │
        │                            │
        │ - 20 keywords              │
        │ - 5 competitors            │
        │ - 5 review themes          │
        │ - 3 improvements           │
        │ - 2 feedback themes        │
        │                            │
        │ Tokens: ~3200 (safe ✅)    │
        │                            │
        │ Ready for Gemini 2.5-Flash │
        └────────────────────────────┘
```

---

## 5. 1-Day Feature Addition Timeline

```
    START                                          COMPLETE
     │                                                │
     ▼                                                ▼
    0min                                           60min
     │────────────────────────────────────────────────│
     │                                                │
     │◄─────10 min─────►                             │
     │ STEP 1: DEFINE SCHEMA                         │
     │ └─ Create .schema.ts                          │
     │    └─ JSON schema definition                  │
     │       └─ Properties, validation rules         │
     │                                                │
     │◄─────30 min──────────────────────────────────►│
     │ STEP 2: CREATE PRODUCER                      │
     │ └─ Create .producer.ts                        │
     │    └─ Copy template                           │
     │       └─ Implement produce() method           │
     │          └─ Transform, merge, validate        │
     │             └─ Return updated vault           │
     │                                                │
     │◄─────5 min────────────────────────────────────►│
     │ STEP 3: REGISTER PRODUCER                     │
     │ └─ Add to producer-registry.ts                │
     │    └─ producerRegistry.register(...)          │
     │                                                │
     │◄─────15 min───────────────────────────────────►│
     │ STEP 4: CREATE API ENDPOINT                   │
     │ └─ Create route.ts                            │
     │    └─ Input validation                        │
     │       └─ Route through vaultRouter            │
     │          └─ Return feature data               │
     │                                                │
     └────────────────────────────────────────────────┘
        READY FOR DEPLOYMENT
```

---

## 6. Bilingual Request Flow

```
                    USER REQUEST
                         │
        ┌────────────────┼────────────────┐
        │                                 │
        ▼                                 ▼
   locale: "en"                      locale: "ar"
        │                                 │
        ▼                                 ▼
   VaultRouterService              VaultRouterService
   routes to                        routes to
   state_en                         state_ar
        │                                 │
        ▼                                 ▼
  Producer                          Producer
  (Input EN)                        (Input AR)
  Process EN                        Process AR
  Modify state_en.features.xxx      Modify state_ar.features.xxx
        │                                 │
        ▼                                 ▼
  Return to                         Return to
  state_en only                     state_ar only
  (state_ar untouched)              (state_en untouched)
        │                                 ▼
        └────────────────┬────────────────┘
                         │
                         ▼
            ┌─────────────────────────┐
            │  SynthesisContextBuilder│
            │                         │
            │  Input: vault, locale   │
            │  - If locale="en"       │
            │    Extract from state_en│
            │  - If locale="ar"       │
            │    Extract from state_ar│
            │  - NEVER mix            │
            └────────────┬────────────┘
                         │
                         ▼
            ┌─────────────────────────┐
            │  Synthesizer (Gemini)   │
            │                         │
            │  Input: EN-only or      │
            │         AR-only context │
            │                         │
            │  Output: EN listing or  │
            │          AR listing     │
            └─────────────────────────┘
```

---

## 7. Producer Interaction Matrix

```
                                    Feature Keys (Vault Keys)
                    ┌──────────────────────────────────────────────┐
                    │ kt   cs   ra   kv   es   up   nf            │
                    │ (KT) (CS) (RA) (KV) (ES) (UP) (NF)           │
                ┌───┼──────────────────────────────────────────────┤
                │ KT│ ✓✓   ✗    ✗    ✗    ✗    ✗    ✗   ← Can modify own
    Producers   │ CS│ ✗    ✓✓   ✗    ✗    ✗    ✗    ✗            │
                │ RA│ ✗    ✗    ✓✓   ✗    ✗    ✗    ✗            │
                │ KV│ ✗    ✗    ✗    ✓✓   ✗    ✗    ✗            │
                │ ES│ ✗    ✗    ✗    ✗    ✓✓   ✗    ✗            │
                │ UP│ ✗    ✗    ✗    ✗    ✗    ✓✓   ✗            │
                │ NF│ ✗    ✗    ✗    ✗    ✗    ✗    ✓✓ ← New feature│
                └───┴──────────────────────────────────────────────┘

Legend:
  KT = Keyword Tracker
  CS = Competitor Spy
  RA = Review Analysis
  KV = Keyword Validator
  ES = Experiment Snapshots
  UP = User Preferences
  NF = New Feature (tomorrow)

  ✓✓ = ALLOWED (same feature, same producer)
  ✗  = BLOCKED (different feature, different producer)

System Guarantee:
  Producer can ONLY modify its own feature key
  ProducerRegistry.verifyIsolation() enforces this
```

---

## 8. Complete System Architecture

```
┌───────────────────────────────────────────────────────────────────────┐
│                                                                       │
│                         FRONTEND (React)                             │
│                     (User selects locale: EN/AR)                     │
│                                                                       │
└────────────────────────┬──────────────────────────────────────────────┘
                         │
                         ▼
        ┌────────────────────────────────────┐
        │  API Endpoint                      │
        │  POST /api/workspaces/[id]/.../... │
        │                                    │
        │  ✓ Auth check                      │
        │  ✓ Validation                      │
        │  ✓ Locale handling                 │
        └────────────┬───────────────────────┘
                     │
                     ▼
        ┌────────────────────────────────────┐
        │  VaultRouterService                │
        │                                    │
        │  ✓ Route to producer               │
        │  ✓ Fetch/create vault              │
        │  ✓ Persist result                  │
        └────────────┬───────────────────────┘
                     │
         ┌───────────┴────────────┐
         │                        │
         ▼                        ▼
      EN Locale               AR Locale
         │                        │
         ▼                        ▼
  ProducerRegistry         ProducerRegistry
  (Isolation Enforcer)    (Isolation Enforcer)
         │                        │
    ┌────┴──────┐            ┌────┴──────┐
    │            │            │            │
    ▼            ▼            ▼            ▼
 [Producers]  [Producers]  [Producers]  [Producers]
 state_en     state_en     state_ar     state_ar
    │            │            │            │
    └────────────┬────────────┴────────────┘
                 │
                 ▼
    ┌────────────────────────────────────┐
    │  workspace_staging_vault (DB)      │
    │                                    │
    │  state_en { features: {...} }      │
    │  state_ar { features: {...} }      │
    │  active_features: [...]            │
    │  last_modified_by, change_count... │
    └────────────┬───────────────────────┘
                 │
         ┌───────┴──────────┐
         │                  │
         ▼                  ▼
    API Response       SynthesisContextBuilder
    (Feature data)           │
    (Only requested           ├─ Extract all features
     locale)                  ├─ Prioritize by impact
                              ├─ Summarize to budget
                              ├─ Build context
                              │
                              ▼
                         Gemini 2.5-Flash
                         (Synthesize listing)
                              │
                              ▼
                         SynthesisOutput
                         (Title, Description,
                          Strategy, ASO Score)
```

---

These diagrams show:
1. ✅ Complete data flow
2. ✅ Vault structure for both locales
3. ✅ Isolation enforcement mechanism
4. ✅ Token-aware context extraction
5. ✅ 1-day feature timeline
6. ✅ Bilingual request routing
7. ✅ Producer interaction matrix
8. ✅ Complete system architecture

All diagrams confirm the architecture is:
- **Scalable** (unlimited features)
- **Isolated** (producers can't interfere)
- **Bilingual** (EN/AR completely separate)
- **Efficient** (token-aware)
- **Fast** (1-day feature addition)

---

*Last Updated: 2026-06-10*
