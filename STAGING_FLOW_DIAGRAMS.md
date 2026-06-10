# Staging Flow - Visual Diagrams

## 1. User Journey Diagram

### English Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ COMPETITOR SPY PAGE                                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Competitor Analysis Results                                   │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ Competitor: Apple Inc                                    │ │
│  │ Category: Fitness Apps                                   │ │
│  │                                                           │ │
│  │ ☑ fitness app (High-Volume)                             │ │
│  │ ☑ workout tracking (Intent-Based)                       │ │
│  │ ☑ health monitor (Competitor Gap)                       │ │
│  │ ☐ ... more keywords ...                                 │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 🟢 FLOATING ACTION BAR (Bottom)                          │  │
│  │ ┌──────────────────────────────────────────────────────┐ │  │
│  │ │ 3 Keywords Selected                                │ │  │
│  │ │ • 1 High-Volume                                    │ │  │
│  │ │ • 1 Intent-Based                                   │ │  │
│  │ │ • 1 Competitor Gap                                 │ │  │
│  │ │                                                     │ │  │
│  │ │ [🗑️ Clear]  [📤 Send to AI Optimizer]             │ │  │
│  │ └──────────────────────────────────────────────────────┘ │  │
│  └──────────────────────────────────────────────────────────┘  │
│                       ↓ (User clicks Send)                      │
└─────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────┐
│ STAGING IN PROGRESS                      │
├──────────────────────────────────────────┤
│                                          │
│ 🔄 Sending... (spinner animation)       │
│                                          │
│ Network: POST /api/workspaces/.../      │
│          staging/add                    │
│                                          │
│ Processing: Validation + Database       │
│                                          │
└──────────────────────────────────────────┘
            ↓ (1-2 seconds)

┌──────────────────────────────────────────────┐
│ ✅ SUCCESS TOAST                             │
├──────────────────────────────────────────────┤
│ Keywords staged for AI Listing Optimizer    │
│ Sent 3 keywords from Apple analysis         │
│                                             │
│ [Go to Optimizer ➜]  [Dismiss]             │
└──────────────────────────────────────────────┘

        ↙ Click Action              ↘ Dismiss

┌─────────────────────┐      ┌──────────────────────────────┐
│ NAVIGATE TO         │      │ STAY IN COMPETITOR SPY       │
│ OPTIMIZER PAGE      │      │                              │
│                     │      │ Floating bar replaced with   │
│ Load optimizer...   │      │ action prompt:               │
│ Display staged      │      │                              │
│ keywords in        │      │ ✅ Keywords Staged           │
│ ActiveContext      │      │ You can add more signals     │
│                     │      │ before generating.           │
│ User can:          │      │                              │
│ - Review keywords  │      │ [Go to Optimizer]            │
│ - Add more signals  │      │ [Continue Later]             │
│ - Click "Generate"  │      │                              │
│                     │      │ User can continue:           │
│ Generated listing   │      │ - Select more keywords       │
│ includes staged     │      │ - Add review issues          │
│ keywords           │      │ - Add market opportunities   │
└─────────────────────┘      │ - Then navigate to optimizer │
                              └──────────────────────────────┘
```

### Arabic Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ صفحة تحليل المنافسين                                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  نتائج تحليل المنافسين                                         │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ المنافس: Apple Inc                                      │ │
│  │ الفئة: تطبيقات اللياقة البدنية                         │ │
│  │                                                           │ │
│  │ ☑ تطبيق لياقة (عالي الحجم)                             │ │
│  │ ☑ تتبع التمرين (موجه بالنية)                          │ │
│  │ ☑ مراقب الصحة (فجوة تنافسية)                           │ │
│  │ ☐ ... كلمات أخرى ...                                   │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 🟢 شريط الإجراء العائم (الأسفل)                        │  │
│  │ ┌──────────────────────────────────────────────────────┐ │  │
│  │ │ 3 كلمات مختارة                                      │ │  │
│  │ │ • 1 عالي الحجم                                      │ │  │
│  │ │ • 1 موجه بالنية                                     │ │  │
│  │ │ • 1 فجوة تنافسية                                    │ │  │
│  │ │                                                     │ │  │
│  │ │ [إرسال للمحسِّن 📤]  [مسح 🗑️]                       │ │  │
│  │ └──────────────────────────────────────────────────────┘ │  │
│  └──────────────────────────────────────────────────────────┘  │
│                  ↓ (ينقر المستخدم الإرسال)                     │
└─────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────┐
│ جاري الإرسال                             │
├──────────────────────────────────────────┤
│                                          │
│ 🔄 جاري الإرسال... (رسالة دوارة)        │
│                                          │
│ الشبكة: POST /api/workspaces/.../       │
│        staging/add                      │
│                                          │
│ المعالجة: التحقق + قاعدة البيانات      │
│                                          │
└──────────────────────────────────────────┘
         ↓ (ثانية إلى ثانيتين)

┌──────────────────────────────────────────────┐
│ ✅ إشعار النجاح                              │
├──────────────────────────────────────────────┤
│ تم إرسال الكلمات إلى محسِّن القائمة بنجاح  │
│ تم إرسال 3 كلمات من تحليل Apple            │
│                                             │
│ [انتقل إلى المحسِّن ➜]  [إغلاق]            │
└──────────────────────────────────────────────┘

        ↙ انقر الإجراء       ↘ إغلاق

┌─────────────────────┐      ┌──────────────────────────────┐
│ انتقل إلى صفحة      │      │ البقاء في تحليل المنافسين   │
│ محسِّن القائمة      │      │                              │
│                     │      │ يتم استبدال الشريط العائم    │
│ تحميل المحسِّن...  │      │ برسالة الإجراء:             │
│ عرض الكلمات         │      │                              │
│ المعدة في            │      │ ✅ تم إعداد الكلمات          │
│ ActiveContext       │      │ يمكنك إضافة إشارات أخرى     │
│                     │      │ قبل الإنشاء                 │
│ يمكن للمستخدم:     │      │                              │
│ - مراجعة الكلمات    │      │ [انتقل إلى المحسِّن]        │
│ - إضافة إشارات أخرى │      │ [المتابعة لاحقاً]           │
│ - النقر على الإنشاء  │      │                              │
│                     │      │ يمكن للمستخدم المتابعة:    │
│ القائمة النهائية    │      │ - اختيار كلمات إضافية      │
│ تتضمن الكلمات       │      │ - إضافة مشاكل المراجعات    │
│ المعدة             │      │ - إضافة فرص السوق          │
│                     │      │ - ثم الانتقال للمحسِّن      │
└─────────────────────┘      └──────────────────────────────┘
```

---

## 2. State Machine Diagram

```
                    ┌─────────────────────┐
                    │   INITIAL STATE     │
                    │  (Keywords Selected)│
                    └──────────┬──────────┘
                               │
                        User clicks Send
                               │
                               ↓
                    ┌─────────────────────┐
                    │   VALIDATING        │
                    │ • Check array       │
                    │ • Check term/cat    │
                    │ • Check strings     │
                    └────┬─────────┬──────┘
                         │         │
                  Valid ↓         ↓ Invalid
                    ┌──────┐   ┌────────────┐
                    │      │   │ ERROR      │
                    │      │   │ Show toast │
                    │      │   │ Reset UI   │
                    │      │   └────────────┘
                    │      │
                    ↓      │ (user retries)
        ┌──────────────────┘
        │
        ↓
    ┌──────────────────┐
    │ SUBMITTING       │
    │ POST to vault    │
    │ Loading...       │
    └────┬──────┬──────┘
         │      │
    Success│   │Network Error
         │      │
         ↓      ↓
    ┌─────────────────────┐  ┌──────────────────┐
    │ SUCCESS             │  │ ERROR            │
    │ • Show toast        │  │ • Show error msg │
    │ • Store signal ID   │  │ • Reset form     │
    │ • Clear selection   │  │ • Allow retry    │
    │ • Show action menu  │  └──────────────────┘
    └────┬────────┬───────┘
         │        │
    Navigate    Continue
        │        Later
        ↓        ↓
    [Optimizer] [Stay in Spy]
```

---

## 3. Data Flow Diagram

```
┌──────────────────────────────────────────────────────────────┐
│ COMPETITOR SPY COMPONENT                                     │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  selectedKeywords: KeywordPayload[]                         │
│  ├─ { term: "fitness app", category: "high_volume" }       │
│  ├─ { term: "workout", category: "intent_based" }          │
│  └─ { term: "health", category: "competitor_gap" }         │
│                                                              │
│  ↓ User clicks "Send to AI Optimizer"                      │
│                                                              │
│  handleSend() validates and calls                           │
│  ↓                                                           │
└──────────────────────────────────────────────────────────────┘
                    │
                    ↓
┌──────────────────────────────────────────────────────────────┐
│ STAGING FLOW SERVICE                                        │
│ competitor-spy-staging-flow.ts                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  stageKeywordsNoNavigation({                               │
│    supabase,                                                │
│    workspaceId: "ws-123",                                  │
│    selectedKeywords: [...],                                │
│    competitorName: "Apple",                                │
│    competitorId: "comp-456",                               │
│    appId: "app-789",                                       │
│    locale: "en"                                            │
│  })                                                         │
│                                                              │
│  ✓ Validates keywords                                       │
│  ✓ Builds metadata                                          │
│  ✓ Calls addSignalToVault()                                │
│                                                              │
│  ↓                                                           │
└──────────────────────────────────────────────────────────────┘
                    │
                    ↓
┌──────────────────────────────────────────────────────────────┐
│ VAULT SERVICE (Backend)                                      │
│ staging-vault-service.ts                                     │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  addSignalToVault({                                         │
│    signalType: "optimizer_selection",                       │
│    content: "Selected 3 keywords from Apple...",           │
│    source: "competitor_spy",                               │
│    metadata: {                                              │
│      competitor_id: "comp-456",                            │
│      competitor_name: "Apple",                             │
│      selected_keywords_count: 3,                           │
│      selected_at: "2026-06-08T10:30:00Z",                 │
│      app_id: "app-789",                                    │
│      locale: "en"                                          │
│    },                                                       │
│    keywords: [...]                                          │
│  })                                                         │
│                                                              │
│  ✓ Validates signal                                         │
│  ✓ Checks workspace RLS                                    │
│  ✓ Inserts into database                                   │
│  ✓ Returns signal ID                                        │
│                                                              │
│  ↓                                                           │
└──────────────────────────────────────────────────────────────┘
                    │
                    ↓
┌──────────────────────────────────────────────────────────────┐
│ SUPABASE DATABASE                                            │
│ workspace_staging_vault table                                │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  INSERT INTO workspace_staging_vault (                      │
│    id: "sig-uuid-12345",                                    │
│    workspace_id: "ws-123",                                  │
│    signal_type: "optimizer_selection",                      │
│    content: "Selected 3 keywords from Apple...",           │
│    source: "competitor_spy",                               │
│    metadata: {...},                 // JSONB               │
│    keywords: [...],                 // JSONB               │
│    language: "en",                                          │
│    created_at: NOW(),                                       │
│    created_by: "user-uuid"                                 │
│  )                                                          │
│                                                              │
│  ↓ Return: { id, message }                                 │
│                                                              │
└──────────────────────────────────────────────────────────────┘
                    │
                    ↓
┌──────────────────────────────────────────────────────────────┐
│ RESULT HANDLING                                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  if (stagingResult.success) {                              │
│    toast.success("Keywords staged...")                      │
│    show ActionPrompt([                                      │
│      { label: "Go to Optimizer", action: navigate() },    │
│      { label: "Continue Later", action: dismiss() }       │
│    ])                                                       │
│    onSuccess(signalId)                                      │
│    onStagingComplete(signalId, count)                      │
│  } else {                                                   │
│    toast.error(stagingResult.message)                      │
│    show ErrorBox()                                          │
│  }                                                          │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## 4. Component Interaction Diagram

```
┌─────────────────────────────────────────┐
│ CompetitorSpyClient.tsx                 │
├─────────────────────────────────────────┤
│                                         │
│  State:                                 │
│  • selectedKeywords[]                   │
│  • locale (en/ar)                       │
│  • workspaceId                          │
│  • competitorId                         │
│                                         │
│  ↓                                      │
│  Renders:                               │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ CompetitorSpyCountryTabs        │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ CompetitorSpyKeywordGapTable    │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ KeywordSelectionProvider        │   │
│  │  └─ KeywordCurationModeProvider │   │
│  │     └─ KeywordSelectionContext  │   │
│  │        └─ Your Selection UI     │   │
│  │           └─ Checkboxes        │   │
│  │              onSelect handler   │   │
│  └─────────────────────────────────┘   │
│          ↓ User checks keywords        │
│          ↓ selectedKeywords[] updated  │
│          ↓                             │
│  ┌─────────────────────────────────┐   │
│  │ KeywordCurationFloatingBar ✨   │   │
│  │ ┌─────────────────────────────┐ │   │
│  │ │ Props:                      │ │   │
│  │ │ • selectedKeywords          │ │   │
│  │ │ • competitorName            │ │   │
│  │ │ • workspaceId               │ │   │
│  │ │ • onClear                   │ │   │
│  │ │ • onSuccess                 │ │   │
│  │ │ • onStagingComplete (NEW!)  │ │   │
│  │ └─────────────────────────────┘ │   │
│  │ ↓ User clicks "Send"            │   │
│  │ handleSend()                    │   │
│  │ ↓                               │   │
│  │ stageKeywordsNoNavigation()     │   │
│  │ ↓                               │   │
│  │ Shows: Success Toast + Prompt   │   │
│  │ Calls: onSuccess(signalId)      │   │
│  │        onStagingComplete(...)   │   │
│  │ ↓                               │   │
│  │ User chooses:                   │   │
│  │ A) Go to Optimizer → navigate() │   │
│  │ B) Continue Later → stay        │   │
│  └─────────────────────────────────┘   │
│                                         │
└─────────────────────────────────────────┘
```

---

## 5. Message Flow (Bilingual)

```
ENGLISH FLOW                          ARABIC FLOW
═══════════════════════════════════════════════════════════════════════

1. INITIAL STATE
┌─────────────────────────┐         ┌──────────────────────────┐
│ 3 Keywords Selected     │         │ 3 كلمات مختارة          │
│ • 2 High-Volume         │         │ • 2 عالية الحجم         │
│ • 1 Intent-Based        │         │ • 1 موجهة بالنية        │
└─────────────────────────┘         └──────────────────────────┘

2. SUBMITTING
┌─────────────────────────┐         ┌──────────────────────────┐
│ 🔄 Sending...           │         │ 🔄 جاري الإرسال...      │
└─────────────────────────┘         └──────────────────────────┘

3. SUCCESS TOAST
┌──────────────────────────┐        ┌───────────────────────────┐
│ ✅ Keywords staged for   │        │ ✅ تم إرسال الكلمات إلى │
│    AI Listing Optimizer  │        │    محسِّن القائمة بنجاح  │
│                          │        │                           │
│ Sent 3 keywords from     │        │ تم إرسال 3 كلمات من      │
│ Apple analysis           │        │ تحليل Apple              │
└──────────────────────────┘        └───────────────────────────┘

4. ACTION PROMPT
┌───────────────────────────┐       ┌────────────────────────────┐
│ ✅ Keywords Staged        │       │ ✅ تم إعداد الكلمات        │
│                           │       │                            │
│ You can add more signals  │       │ يمكنك إضافة إشارات أخرى   │
│ before generating         │       │ قبل الإنشاء               │
│                           │       │                            │
│ [Go to Optimizer]         │       │ [انتقل إلى المحسِّن]      │
│ [Continue Later]          │       │ [المتابعة لاحقاً]         │
└───────────────────────────┘       └────────────────────────────┘

5. ERROR STATE (if applicable)
┌──────────────────────────┐        ┌───────────────────────────┐
│ ❌ Failed to stage       │        │ ❌ فشل إرسال الكلمات     │
│    keywords. Try again   │        │    حاول مرة أخرى.        │
└──────────────────────────┘        └───────────────────────────┘
```

---

## 6. Validation Pipeline Flow

```
        START: handleSend()
                 │
                 ↓
    ┌────────────────────────┐
    │ Validate: Is array?    │
    └────┬──────────┬────────┘
         │          │
        YES        NO → ERROR: "Not an array"
         │
         ↓
    ┌────────────────────────┐
    │ Validate: Not empty?   │
    └────┬──────────┬────────┘
         │          │
        YES        NO → ERROR: "Empty selection"
         │
         ↓
    ┌────────────────────────────────────┐
    │ For each keyword:                   │
    │ ├─ Has term property?              │
    │ ├─ Term is non-empty string?       │
    │ ├─ Has category property?          │
    │ ├─ Category is non-empty string?   │
    │ └─ Is serializable (JSON.stringify)│
    └────┬──────────┬─────────────────────┘
         │          │
        ALL OK    ANY FAIL → ERROR: "Invalid keyword at index X"
         │
         ↓
    ┌────────────────────────────┐
    │ Call addSignalToVault()    │
    │ POST to Supabase           │
    └────┬──────────┬────────────┘
         │          │
    SUCCESS        ERROR
         │          │
         ↓          ↓
    ┌──────────┐  ┌──────────────┐
    │ SUCCESS  │  │ API_ERROR    │
    │ TOAST +  │  │ Show Error   │
    │ PROMPT   │  │ "Network..., │
    │          │  │  Try Again"  │
    └──────────┘  └──────────────┘
         │
         ↓
    ┌────────────────────────────┐
    │ User chooses:              │
    ├─ Go to Optimizer → NAVIGATE│
    └─ Continue Later → STAY     │
         │
         ↓
        END
```

---

## 7. RTL Layout Diagram (Arabic)

```
LTR (English)              RTL (Arabic)
═══════════════════════════════════════════════════════════════

[🗑️ Clear]  [📤 Send]     [📤 Send]  [🗑️ Clear]
Left        Right         Right      Left

┌────────────────────────┐  ┌────────────────────────┐
│ 3 Keywords Selected    │  │    3 كلمات مختارة      │
│ • 2 High-Volume        │  │        • 2 عالية       │
│ • 1 Intent-Based       │  │        • 1 موجهة      │
└────────────────────────┘  └────────────────────────┘
Text: Left-to-Right        Text: Right-to-Left

Icon + Text Layout         Icon + Text Layout
[Icon] Text               Text [Icon]
(Icon on left)            (Icon on right)

Button Flex Direction
flex row (LTR)          flex row-reverse (RTL)
├─ Item 1              ├─ Item 2
├─ Item 2              ├─ Item 1
└─ Item 3              └─ Item 3

Action Buttons
┌──────────────┐      ┌──────────────┐
│ Go to Opt.   │      │ انتقل للمح.  │
└──────────────┘      └──────────────┘
[Go to Opt.]  [Later]  [متابعة]  [انتقل]
(Top to bottom)        (Right to left order)
```

---

**These diagrams provide visual understanding of:**
- ✅ User journey (both languages)
- ✅ Component state flow
- ✅ Data transformation pipeline
- ✅ Message localization
- ✅ RTL layout handling
- ✅ Validation logic
- ✅ Component interaction
