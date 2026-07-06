
> playstore-xyz@0.1.0 test:watch
> vitest --reporter=verbose


 DEV  v2.1.9 /Users/syedmairaj/Documents/playstore

 ✓ src/lib/gemini/__tests__/load-theme.test.ts > Theme Store — Load Theme > getBaseSchema > loads minimalist-professional schema
 ✓ src/lib/gemini/__tests__/load-theme.test.ts > Theme Store — Load Theme > getBaseSchema > loads all five base schemas
 ✓ src/lib/gemini/__tests__/load-theme.test.ts > Theme Store — Load Theme > getBaseSchema > throws error for invalid schema ID
 ✓ src/lib/gemini/__tests__/load-theme.test.ts > Theme Store — Load Theme > getAllBaseSchemas > returns all five schemas
 ✓ src/lib/gemini/__tests__/load-theme.test.ts > Theme Store — Load Theme > getAllBaseSchemas > all schemas have required properties
 ✓ src/lib/gemini/__tests__/load-theme.test.ts > Theme Store — Load Theme > getAllBaseSchemas > all schemas support RTL
 ✓ src/lib/gemini/__tests__/load-theme.test.ts > Theme Store — Load Theme > validateSchema > validates correct schema
 ✓ src/lib/gemini/__tests__/load-theme.test.ts > Theme Store — Load Theme > validateSchema > rejects schema with missing id
 ✓ src/lib/gemini/__tests__/load-theme.test.ts > Theme Store — Load Theme > validateSchema > rejects null/non-object
 ✓ src/lib/gemini/__tests__/load-theme.test.ts > Theme Store — Load Theme > validateSchema > warns about missing RTL overrides
 ✓ src/lib/gemini/__tests__/load-theme.test.ts > Theme Store — Load Theme > validateSchema > detects invalid hex colors
 ✓ src/lib/gemini/__tests__/load-theme.test.ts > Theme Store — Load Theme > mergeSchemaOverride > merges color overrides
 ✓ src/lib/gemini/__tests__/load-theme.test.ts > Theme Store — Load Theme > mergeSchemaOverride > merges typography overrides
 ✓ src/lib/gemini/__tests__/load-theme.test.ts > Theme Store — Load Theme > mergeSchemaOverride > merges RTL overrides
 ✓ src/lib/gemini/__tests__/load-theme.test.ts > Theme Store — Load Theme > mergeSchemaOverride > preserves base schema when no overrides
 ✓ src/lib/gemini/__tests__/load-theme.test.ts > Theme Store — Load Theme > mergeSchemaOverride > does not mutate base schema
 ✓ src/lib/gemini/__tests__/load-theme.test.ts > Theme Store — Load Theme > RTL Support Validation > supportsRTL returns true for all base schemas
 ✓ src/lib/gemini/__tests__/load-theme.test.ts > Theme Store — Load Theme > RTL Support Validation > getRTLTextAlignment defaults to right
 ✓ src/lib/gemini/__tests__/load-theme.test.ts > Theme Store — Load Theme > RTL Support Validation > getRTLTextAlignment respects override
 ✓ src/lib/gemini/__tests__/load-theme.test.ts > Theme Store — Load Theme > RTL Support Validation > Arabic and Hebrew schemas are included in RTL locale filter
 ✓ src/lib/gemini/__tests__/load-theme.test.ts > Theme Store — Load Theme > RTL Support Validation > LTR locales get all schemas
 ✓ src/lib/gemini/__tests__/load-theme.test.ts > Theme Store — Load Theme > Category Affinity > getSchemasForCategory returns relevant schemas
 ✓ src/lib/gemini/__tests__/load-theme.test.ts > Theme Store — Load Theme > Category Affinity > gaming category returns energetic and bold schemas
 ✓ src/lib/gemini/__tests__/load-theme.test.ts > Theme Store — Load Theme > Category Affinity > health category returns organic schema
 ✓ src/lib/gemini/__tests__/load-theme.test.ts > Theme Store — Load Theme > Category Affinity > returns empty array for unknown category
 ✓ src/lib/gemini/__tests__/load-theme.test.ts > Theme Store — Load Theme > Color Palette Consistency (LTR/RTL Parity) > all schemas have valid hex colors
 ✓ src/lib/gemini/__tests__/load-theme.test.ts > Theme Store — Load Theme > Color Palette Consistency (LTR/RTL Parity) > text color has sufficient contrast with background
 ✓ src/lib/gemini/__tests__/load-theme.test.ts > Theme Store — Load Theme > Color Palette Consistency (LTR/RTL Parity) > all schemas have consistent saturation across primaries
 ✓ src/lib/gemini/__tests__/load-theme.test.ts > Theme Store — Load Theme > Compositing Engine Compatibility > schemas work with compose-screenshot flow
 ✓ src/lib/gemini/__tests__/load-theme.test.ts > Theme Store — Load Theme > Compositing Engine Compatibility > RTL schemas work with flop-composite-flop pipeline
 ✓ src/lib/gemini/__tests__/load-theme.test.ts > Theme Store — Load Theme > Compositing Engine Compatibility > all schemas support the flop-composite-flop RTL strategy
stdout | src/lib/play-store/__tests__/publish-e2e.test.ts > publishListingToPlayStore — Play Console character limit enforcement > clamps title to 30 characters before sending to API

[DRY-RUN] publishListingToPlayStore captured API payload:
{
  "dryRun": true,
  "sandboxed": true,
  "noLiveApiCallMade": true,
  "input": {
    "workspaceId": "ws-test-001",
    "packageName": "com.example.myapp",
    "locale": "en"
  },
  "capturedListingsUpdateArgs": {
    "packageName": "com.example.myapp",
    "editId": "mock-edit-id-001",
    "language": "en-US",
    "requestBody": {
      "language": "en-US",
      "title": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      "shortDescription": "Build lasting habits with streaks, reminders, and smart insights.",
      "fullDescription": "Habit Tracker Pro helps you build and maintain powerful daily habits. Features include streak tracking, adaptive reminders, progress analytics, and a beautiful minimal interface. Trusted by 500 000+ users worldwide."
    }
  },
  "functionResult": {
    "ok": true,
    "editId": "mock-edit-id-001",
    "language": "en-US"
  }
}

stdout | src/lib/play-store/__tests__/publish-e2e.test.ts > publishListingToPlayStore — Play Console character limit enforcement > clamps shortDescription to 80 characters

[DRY-RUN] publishListingToPlayStore captured API payload:
{
  "dryRun": true,
  "sandboxed": true,
  "noLiveApiCallMade": true,
  "input": {
    "workspaceId": "ws-test-001",
    "packageName": "com.example.myapp",
    "locale": "en"
  },
  "capturedListingsUpdateArgs": {
    "packageName": "com.example.myapp",
    "editId": "mock-edit-id-001",
    "language": "en-US",
    "requestBody": {
      "language": "en-US",
      "title": "Habit Tracker Pro",
      "shortDescription": "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
      "fullDescription": "Habit Tracker Pro helps you build and maintain powerful daily habits. Features include streak tracking, adaptive reminders, progress analytics, and a beautiful minimal interface. Trusted by 500 000+ users worldwide."
    }
  },
  "functionResult": {
    "ok": true,
    "editId": "mock-edit-id-001",
    "language": "en-US"
  }
}

stdout | src/lib/play-store/__tests__/publish-e2e.test.ts > publishListingToPlayStore — Play Console character limit enforcement > clamps fullDescription to 4 000 characters

[DRY-RUN] publishListingToPlayStore captured API payload:
{
  "dryRun": true,
  "sandboxed": true,
  "noLiveApiCallMade": true,
  "input": {
    "workspaceId": "ws-test-001",
    "packageName": "com.example.myapp",
    "locale": "en"
  },
  "capturedListingsUpdateArgs": {
    "packageName": "com.example.myapp",
    "editId": "mock-edit-id-001",
    "language": "en-US",
    "requestBody": {
      "language": "en-US",
      "title": "Habit Tracker Pro",
      "shortDescription": "Build lasting habits with streaks, reminders, and smart insights.",
      "fullDescription": "CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC"
    }
  },
  "functionResult": {
    "ok": true,
    "editId": "mock-edit-id-001",
    "language": "en-US"
  }
}

stdout | src/lib/play-store/__tests__/publish-e2e.test.ts > publishListingToPlayStore — Play Console character limit enforcement > does NOT truncate fields that are within limits

[DRY-RUN] publishListingToPlayStore captured API payload:
{
  "dryRun": true,
  "sandboxed": true,
  "noLiveApiCallMade": true,
  "input": {
    "workspaceId": "ws-test-001",
    "packageName": "com.example.myapp",
    "locale": "en"
  },
  "capturedListingsUpdateArgs": {
    "packageName": "com.example.myapp",
    "editId": "mock-edit-id-001",
    "language": "en-US",
    "requestBody": {
      "language": "en-US",
      "title": "Habit Tracker Pro",
      "shortDescription": "Build lasting habits with streaks, reminders, and smart insights.",
      "fullDescription": "Habit Tracker Pro helps you build and maintain powerful daily habits. Features include streak tracking, adaptive reminders, progress analytics, and a beautiful minimal interface. Trusted by 500 000+ users worldwide."
    }
  },
  "functionResult": {
    "ok": true,
    "editId": "mock-edit-id-001",
    "language": "en-US"
  }
}

stdout | src/lib/play-store/__tests__/publish-e2e.test.ts > publishListingToPlayStore — Play Console character limit enforcement > trims leading and trailing whitespace from all three fields

[DRY-RUN] publishListingToPlayStore captured API payload:
{
  "dryRun": true,
  "sandboxed": true,
  "noLiveApiCallMade": true,
  "input": {
    "workspaceId": "ws-test-001",
    "packageName": "com.example.myapp",
    "locale": "en"
  },
  "capturedListingsUpdateArgs": {
    "packageName": "com.example.myapp",
    "editId": "mock-edit-id-001",
    "language": "en-US",
    "requestBody": {
      "language": "en-US",
      "title": "My App",
      "shortDescription": "Short desc",
      "fullDescription": "Long desc"
    }
  },
  "functionResult": {
    "ok": true,
    "editId": "mock-edit-id-001",
    "language": "en-US"
  }
}

stdout | src/lib/play-store/__tests__/publish-e2e.test.ts > publishListingToPlayStore — happy path > sends requestBody with the correct shape to edits.listings.update

[DRY-RUN] publishListingToPlayStore captured API payload:
{
  "dryRun": true,
  "sandboxed": true,
  "noLiveApiCallMade": true,
  "input": {
    "workspaceId": "ws-test-001",
    "packageName": "com.example.myapp",
    "locale": "en"
  },
  "capturedListingsUpdateArgs": {
    "packageName": "com.example.myapp",
    "editId": "mock-edit-id-001",
    "language": "en-US",
    "requestBody": {
      "language": "en-US",
      "title": "Habit Tracker Pro",
      "shortDescription": "Build lasting habits with streaks, reminders, and smart insights.",
      "fullDescription": "Habit Tracker Pro helps you build and maintain powerful daily habits. Features include streak tracking, adaptive reminders, progress analytics, and a beautiful minimal interface. Trusted by 500 000+ users worldwide."
    }
  },
  "functionResult": {
    "ok": true,
    "editId": "mock-edit-id-001",
    "language": "en-US"
  }
}

stdout | src/lib/play-store/__tests__/publish-e2e.test.ts > publishListingToPlayStore — happy path > sends Arabic listing with language tag 'ar' inside requestBody

[DRY-RUN] publishListingToPlayStore captured API payload:
{
  "dryRun": true,
  "sandboxed": true,
  "noLiveApiCallMade": true,
  "input": {
    "workspaceId": "ws-test-001",
    "packageName": "com.example.myapp",
    "locale": "ar"
  },
  "capturedListingsUpdateArgs": {
    "packageName": "com.example.myapp",
    "editId": "mock-edit-id-001",
    "language": "ar",
    "requestBody": {
      "language": "ar",
      "title": "متتبع العادات برو",
      "shortDescription": "أنشئ عادات دائمة مع التسلسلات والتذكيرات والرؤى الذكية.",
      "fullDescription": "يساعدك متتبع العادات برو على بناء عادات يومية قوية والحفاظ عليها. تشمل الميزات: تتبع التسلسل، والتذكيرات التكيفية، وتحليلات التقدم، وواجهة أنيقة بسيطة. موثوق به من قبل أكثر من 500,000 مستخدم حول العالم."
    }
  },
  "functionResult": {
    "ok": true,
    "editId": "mock-edit-id-001",
    "language": "ar"
  }
}

stdout | src/lib/play-store/__tests__/publish-e2e.test.ts > Dry-run mode — capture and inspect API payloads without live calls > captures the English listing requestBody and confirms its exact Play Console shape

[DRY-RUN] publishListingToPlayStore captured API payload:
{
  "dryRun": true,
  "sandboxed": true,
  "noLiveApiCallMade": true,
  "input": {
    "workspaceId": "ws-test-001",
    "packageName": "com.example.myapp",
    "locale": "en"
  },
  "capturedListingsUpdateArgs": {
    "packageName": "com.example.myapp",
    "editId": "mock-edit-id-001",
    "language": "en-US",
    "requestBody": {
      "language": "en-US",
      "title": "Habit Tracker Pro",
      "shortDescription": "Build lasting habits with streaks, reminders, and smart insights.",
      "fullDescription": "Habit Tracker Pro helps you build and maintain powerful daily habits. Features include streak tracking, adaptive reminders, progress analytics, and a beautiful minimal interface. Trusted by 500 000+ users worldwide."
    }
  },
  "functionResult": {
    "ok": true,
    "editId": "mock-edit-id-001",
    "language": "en-US"
  }
}

stdout | src/lib/play-store/__tests__/publish-e2e.test.ts > Dry-run mode — capture and inspect API payloads without live calls > captures the Arabic listing requestBody and validates Arabic Unicode

[DRY-RUN] publishListingToPlayStore captured API payload:
{
  "dryRun": true,
  "sandboxed": true,
  "noLiveApiCallMade": true,
  "input": {
    "workspaceId": "ws-test-001",
    "packageName": "com.example.myapp",
    "locale": "ar"
  },
  "capturedListingsUpdateArgs": {
    "packageName": "com.example.myapp",
    "editId": "mock-edit-id-001",
    "language": "ar",
    "requestBody": {
      "language": "ar",
      "title": "متتبع العادات برو",
      "shortDescription": "أنشئ عادات دائمة مع التسلسلات والتذكيرات والرؤى الذكية.",
      "fullDescription": "يساعدك متتبع العادات برو على بناء عادات يومية قوية والحفاظ عليها. تشمل الميزات: تتبع التسلسل، والتذكيرات التكيفية، وتحليلات التقدم، وواجهة أنيقة بسيطة. موثوق به من قبل أكثر من 500,000 مستخدم حول العالم."
    }
  },
  "functionResult": {
    "ok": true,
    "editId": "mock-edit-id-001",
    "language": "ar"
  }
}

stdout | src/lib/play-store/__tests__/publish-e2e.test.ts > Dry-run mode — capture and inspect API payloads without live calls > dry-run confirms no live network call occurs (mock returns deterministic editId)

[DRY-RUN] publishListingToPlayStore captured API payload:
{
  "dryRun": true,
  "sandboxed": true,
  "noLiveApiCallMade": true,
  "input": {
    "workspaceId": "ws-test-001",
    "packageName": "com.example.myapp",
    "locale": "en"
  },
  "capturedListingsUpdateArgs": {
    "packageName": "com.example.myapp",
    "editId": "mock-edit-id-001",
    "language": "en-US",
    "requestBody": {
      "language": "en-US",
      "title": "Habit Tracker Pro",
      "shortDescription": "Build lasting habits with streaks, reminders, and smart insights.",
      "fullDescription": "Habit Tracker Pro helps you build and maintain powerful daily habits. Features include streak tracking, adaptive reminders, progress analytics, and a beautiful minimal interface. Trusted by 500 000+ users worldwide."
    }
  },
  "functionResult": {
    "ok": true,
    "editId": "mock-edit-id-001",
    "language": "en-US"
  }
}

stdout | src/lib/play-store/__tests__/publish-e2e.test.ts > Dry-run mode — capture and inspect API payloads without live calls > multi-locale dry-run produces distinct payloads for en + ar

[DRY-RUN] publishListingToPlayStore captured API payload:
{
  "dryRun": true,
  "sandboxed": true,
  "noLiveApiCallMade": true,
  "input": {
    "workspaceId": "ws-test-001",
    "packageName": "com.example.myapp",
    "locale": "en"
  },
  "capturedListingsUpdateArgs": {
    "packageName": "com.example.myapp",
    "editId": "mock-edit-id-001",
    "language": "en-US",
    "requestBody": {
      "language": "en-US",
      "title": "Habit Tracker Pro",
      "shortDescription": "Build lasting habits with streaks, reminders, and smart insights.",
      "fullDescription": "Habit Tracker Pro helps you build and maintain powerful daily habits. Features include streak tracking, adaptive reminders, progress analytics, and a beautiful minimal interface. Trusted by 500 000+ users worldwide."
    }
  },
  "functionResult": {
    "ok": true,
    "editId": "mock-edit-id-001",
    "language": "en-US"
  }
}

[DRY-RUN] publishListingToPlayStore captured API payload:
{
  "dryRun": true,
  "sandboxed": true,
  "noLiveApiCallMade": true,
  "input": {
    "workspaceId": "ws-test-001",
    "packageName": "com.example.myapp",
    "locale": "ar"
  },
  "capturedListingsUpdateArgs": {
    "packageName": "com.example.myapp",
    "editId": "mock-edit-id-001",
    "language": "ar",
    "requestBody": {
      "language": "ar",
      "title": "متتبع العادات برو",
      "shortDescription": "أنشئ عادات دائمة مع التسلسلات والتذكيرات والرؤى الذكية.",
      "fullDescription": "يساعدك متتبع العادات برو على بناء عادات يومية قوية والحفاظ عليها. تشمل الميزات: تتبع التسلسل، والتذكيرات التكيفية، وتحليلات التقدم، وواجهة أنيقة بسيطة. موثوق به من قبل أكثر من 500,000 مستخدم حول العالم."
    }
  },
  "functionResult": {
    "ok": true,
    "editId": "mock-edit-id-001",
    "language": "ar"
  }
}

 ✓ src/lib/play-store/__tests__/publish-e2e.test.ts > resolvePlayLanguage — locale → BCP-47 Play Console mapping > maps 'en' to 'en-US'
 ✓ src/lib/play-store/__tests__/publish-e2e.test.ts > resolvePlayLanguage — locale → BCP-47 Play Console mapping > maps 'ar' to 'ar'
 ✓ src/lib/play-store/__tests__/publish-e2e.test.ts > resolvePlayLanguage — locale → BCP-47 Play Console mapping > passes 'en-US' through unchanged
 ✓ src/lib/play-store/__tests__/publish-e2e.test.ts > resolvePlayLanguage — locale → BCP-47 Play Console mapping > passes 'en-GB' through unchanged
 ✓ src/lib/play-store/__tests__/publish-e2e.test.ts > resolvePlayLanguage — locale → BCP-47 Play Console mapping > passes unknown locale codes through as-is (safe passthrough fallback)
 ✓ src/lib/play-store/__tests__/publish-e2e.test.ts > publishListingToPlayStore — input validation > returns no_package_name when packageName is empty string
 ✓ src/lib/play-store/__tests__/publish-e2e.test.ts > publishListingToPlayStore — input validation > returns no_package_name when packageName is whitespace-only
 ✓ src/lib/play-store/__tests__/publish-e2e.test.ts > publishListingToPlayStore — input validation > returns validation_error when title is empty
 ✓ src/lib/play-store/__tests__/publish-e2e.test.ts > publishListingToPlayStore — input validation > returns validation_error when shortDescription is empty
 ✓ src/lib/play-store/__tests__/publish-e2e.test.ts > publishListingToPlayStore — input validation > returns validation_error when fullDescription is empty
 ✓ src/lib/play-store/__tests__/publish-e2e.test.ts > publishListingToPlayStore — input validation > returns validation_error when all fields are whitespace-only
 ✓ src/lib/play-store/__tests__/publish-e2e.test.ts > publishListingToPlayStore — input validation > does NOT call the Google API for any validation failure
 ✓ src/lib/play-store/__tests__/publish-e2e.test.ts > publishListingToPlayStore — Play Console character limit enforcement > clamps title to 30 characters before sending to API
 ✓ src/lib/play-store/__tests__/publish-e2e.test.ts > publishListingToPlayStore — Play Console character limit enforcement > clamps shortDescription to 80 characters
 ✓ src/lib/play-store/__tests__/publish-e2e.test.ts > publishListingToPlayStore — Play Console character limit enforcement > clamps fullDescription to 4 000 characters
 ✓ src/lib/play-store/__tests__/publish-e2e.test.ts > publishListingToPlayStore — Play Console character limit enforcement > does NOT truncate fields that are within limits
 ✓ src/lib/play-store/__tests__/publish-e2e.test.ts > publishListingToPlayStore — Play Console character limit enforcement > trims leading and trailing whitespace from all three fields
 ✓ src/lib/play-store/__tests__/publish-e2e.test.ts > publishListingToPlayStore — missing credentials (not_connected / silently skipped) > returns { ok: false, code: 'not_connected' } when no account is connected
 ✓ src/lib/play-store/__tests__/publish-e2e.test.ts > publishListingToPlayStore — missing credentials (not_connected / silently skipped) > does NOT throw — batch callers can silently skip without try/catch
 ✓ src/lib/play-store/__tests__/publish-e2e.test.ts > publishListingToPlayStore — missing credentials (not_connected / silently skipped) > never calls the Google API when credentials are missing
 ✓ src/lib/play-store/__tests__/publish-e2e.test.ts > publishListingToPlayStore — happy path > returns { ok: true, editId, language } for a successful English publish
 ✓ src/lib/play-store/__tests__/publish-e2e.test.ts > publishListingToPlayStore — happy path > maps locale 'ar' to Play language 'ar' and returns ok: true
 ✓ src/lib/play-store/__tests__/publish-e2e.test.ts > publishListingToPlayStore — happy path > accepts 'en-US' as an explicit locale and passes it through to Play
 ✓ src/lib/play-store/__tests__/publish-e2e.test.ts > publishListingToPlayStore — happy path > defaults to locale 'en' / Play language 'en-US' when locale is omitted
 ✓ src/lib/play-store/__tests__/publish-e2e.test.ts > publishListingToPlayStore — happy path > sends requestBody with the correct shape to edits.listings.update
 ✓ src/lib/play-store/__tests__/publish-e2e.test.ts > publishListingToPlayStore — happy path > sends Arabic listing with language tag 'ar' inside requestBody
 ✓ src/lib/play-store/__tests__/publish-e2e.test.ts > publishListingToPlayStore — happy path > executes exactly 3 API calls: edits.insert → edits.listings.update → edits.commit
 ✓ src/lib/play-store/__tests__/publish-e2e.test.ts > publishListingToPlayStore — happy path > calls edits.insert with the correct packageName
 ✓ src/lib/play-store/__tests__/publish-e2e.test.ts > publishListingToPlayStore — happy path > calls edits.commit with the packageName and editId from edits.insert
 ✓ src/lib/play-store/__tests__/publish-e2e.test.ts > publishListingToPlayStore — multi-locale batch > locale ''en'' → Play language ''en-US''
 ✓ src/lib/play-store/__tests__/publish-e2e.test.ts > publishListingToPlayStore — multi-locale batch > locale ''en-US'' → Play language ''en-US''
 ✓ src/lib/play-store/__tests__/publish-e2e.test.ts > publishListingToPlayStore — multi-locale batch > locale ''en-GB'' → Play language ''en-GB''
 ✓ src/lib/play-store/__tests__/publish-e2e.test.ts > publishListingToPlayStore — multi-locale batch > locale ''ar'' → Play language ''ar''
 ✓ src/lib/play-store/__tests__/publish-e2e.test.ts > publishListingToPlayStore — multi-locale batch > locale ''fr'' → Play language ''fr''
 ✓ src/lib/play-store/__tests__/publish-e2e.test.ts > publishListingToPlayStore — multi-locale batch > locale ''de-DE'' → Play language ''de-DE''
 ✓ src/lib/play-store/__tests__/publish-e2e.test.ts > publishListingToPlayStore — multi-locale batch > publishes to en + ar concurrently and returns ok for each
 ✓ src/lib/play-store/__tests__/publish-e2e.test.ts > publishListingToPlayStore — Google API error classification > classifies 'invalid_grant' as auth_error
 ✓ src/lib/play-store/__tests__/publish-e2e.test.ts > publishListingToPlayStore — Google API error classification > classifies '401 unauthorized' as auth_error
 ✓ src/lib/play-store/__tests__/publish-e2e.test.ts > publishListingToPlayStore — Google API error classification > classifies 'Token has been expired' as auth_error
 ✓ src/lib/play-store/__tests__/publish-e2e.test.ts > publishListingToPlayStore — Google API error classification > classifies '403 does not have permission' as auth_error with a role hint
 ✓ src/lib/play-store/__tests__/publish-e2e.test.ts > publishListingToPlayStore — Google API error classification > classifies a generic API error as api_error
 ✓ src/lib/play-store/__tests__/publish-e2e.test.ts > publishListingToPlayStore — Google API error classification > returns api_error when edits.insert returns no editId
 ✓ src/lib/play-store/__tests__/publish-e2e.test.ts > Dry-run mode — capture and inspect API payloads without live calls > captures the English listing requestBody and confirms its exact Play Console shape
 ✓ src/lib/play-store/__tests__/publish-e2e.test.ts > Dry-run mode — capture and inspect API payloads without live calls > captures the Arabic listing requestBody and validates Arabic Unicode
 ✓ src/lib/play-store/__tests__/publish-e2e.test.ts > Dry-run mode — capture and inspect API payloads without live calls > dry-run confirms no live network call occurs (mock returns deterministic editId)
 ✓ src/lib/play-store/__tests__/publish-e2e.test.ts > Dry-run mode — capture and inspect API payloads without live calls > multi-locale dry-run produces distinct payloads for en + ar
stdout | src/lib/gemini/__tests__/listing-captions-uifocus.test.ts > LISTING_CAPTIONS_SCHEMA static shape > includes "uiFocus" in the item required array (critical — missing here = Gemini may omit it)
Caption item required fields: [ 'order', 'caption', 'theme', 'uiFocus' ]

stdout | src/lib/gemini/__tests__/listing-captions-uifocus.test.ts > getGenerativeModel receives structured-output config > passes responseMimeType: application/json
getGenerativeModel config: {
  "responseMimeType": "application/json",
  "responseSchema": {
    "type": "OBJECT",
    "properties": {
      "captions": {
        "type": "ARRAY",
        "items": {
          "type": "OBJECT",
          "properties": {
            "order": {
              "type": "INTEGER"
            },
            "caption": {
              "type": "STRING"
            },
            "theme": {
              "type": "STRING"
            },
            "uiFocus": {
              "type": "STRING"
            }
          },
          "required": [
            "order",
            "caption",
            "theme",
            "uiFocus"
          ]
        }
      }
    },
    "required": [
      "captions"
    ]
  },
  "maxOutputTokens": 1200
}

stdout | src/lib/gemini/__tests__/listing-captions-uifocus.test.ts > getGenerativeModel receives structured-output config > passes responseSchema that declares uiFocus as required on each item
Schema item required: [ 'order', 'caption', 'theme', 'uiFocus' ]

stdout | src/lib/gemini/__tests__/listing-captions-uifocus.test.ts > getGenerativeModel receives structured-output config > passes maxOutputTokens >= 1200 (7 captions × caption + uiFocus > 300 default)
maxOutputTokens: 1200

stdout | src/lib/gemini/__tests__/listing-captions-uifocus.test.ts > generateListingPipelineCaptions — uiFocus present in response > returns 7 captions
Generated Captions: {
  "captions": [
    {
      "order": 1,
      "caption": "Your habit, reimagined",
      "theme": "hook",
      "uiFocus": "dark dashboard #1A73E8 accent streak chart"
    },
    {
      "order": 2,
      "caption": "Build habits in seconds",
      "theme": "feature",
      "uiFocus": "minimal onboarding screen #1A73E8 primary button"
    },
    {
      "order": 3,
      "caption": "Smart reminders that adapt",
      "theme": "feature",
      "uiFocus": "reminder settings panel #1A73E8 toggle highlighted"
    },
    {
      "order": 4,
      "caption": "Track streaks with precision",
      "theme": "feature",
      "uiFocus": "streak calendar dark mode #1A73E8 completed days"
    },
    {
      "order": 5,
      "caption": "Feel the momentum",
      "theme": "benefit",
      "uiFocus": "celebration screen gradient #1A73E8 confetti"
    },
    {
      "order": 6,
      "caption": "Skip the willpower battle",
      "theme": "benefit",
      "uiFocus": "insights chart pale #1A73E8 progress line"
    },
    {
      "order": 7,
      "caption": "Start your first habit now",
      "theme": "cta",
      "uiFocus": "CTA screen centered #1A73E8 button full-width"
    }
  ]
}

stdout | src/lib/gemini/__tests__/listing-captions-uifocus.test.ts > generateListingPipelineCaptions — uiFocus present in response > every caption carries a non-empty uiFocus string
caption[1].uiFocus = dark dashboard #1A73E8 accent streak chart
caption[2].uiFocus = minimal onboarding screen #1A73E8 primary button
caption[3].uiFocus = reminder settings panel #1A73E8 toggle highlighted
caption[4].uiFocus = streak calendar dark mode #1A73E8 completed days
caption[5].uiFocus = celebration screen gradient #1A73E8 confetti
caption[6].uiFocus = insights chart pale #1A73E8 progress line
caption[7].uiFocus = CTA screen centered #1A73E8 button full-width

stdout | src/lib/gemini/__tests__/listing-captions-uifocus.test.ts > generateListingPipelineCaptions — Arabic locale (RTL parity) > processes Arabic captions and preserves uiFocus
Arabic Generated Captions: {
  "captions": [
    {
      "order": 1,
      "caption": "عادتك من جديد",
      "theme": "hook",
      "uiFocus": "شاشة رئيسية داكنة لون #1A73E8"
    },
    {
      "order": 2,
      "caption": "بناء العادات في ثوانٍ",
      "theme": "feature",
      "uiFocus": "لوحة تأهيل بزر أزرق #1A73E8"
    },
    {
      "order": 3,
      "caption": "تذكيرات ذكية",
      "theme": "feature",
      "uiFocus": "إعدادات التذكير باللون #1A73E8"
    },
    {
      "order": 4,
      "caption": "تتبع التسلسلات",
      "theme": "feature",
      "uiFocus": "تقويم داكن أيام #1A73E8"
    },
    {
      "order": 5,
      "caption": "اشعر بالزخم",
      "theme": "benefit",
      "uiFocus": "شاشة احتفال #1A73E8"
    },
    {
      "order": 6,
      "caption": "تجاوز معركة الإرادة",
      "theme": "benefit",
      "uiFocus": "مخطط تقدم #1A73E8"
    },
    {
      "order": 7,
      "caption": "ابدأ عادتك الأولى الآن",
      "theme": "cta",
      "uiFocus": "شاشة CTA #1A73E8 زر كامل"
    }
  ]
}

 ✓ src/lib/gemini/__tests__/listing-captions-uifocus.test.ts > LISTING_CAPTIONS_SCHEMA static shape > exports a schema whose top-level required contains "captions"
 ✓ src/lib/gemini/__tests__/listing-captions-uifocus.test.ts > LISTING_CAPTIONS_SCHEMA static shape > defines captions as an ARRAY of OBJECTs
 ✓ src/lib/gemini/__tests__/listing-captions-uifocus.test.ts > LISTING_CAPTIONS_SCHEMA static shape > declares uiFocus in item properties as STRING
 ✓ src/lib/gemini/__tests__/listing-captions-uifocus.test.ts > LISTING_CAPTIONS_SCHEMA static shape > includes "uiFocus" in the item required array (critical — missing here = Gemini may omit it)
 ✓ src/lib/gemini/__tests__/listing-captions-uifocus.test.ts > LISTING_CAPTIONS_SCHEMA static shape > includes all four expected required fields: order, caption, theme, uiFocus
 ✓ src/lib/gemini/__tests__/listing-captions-uifocus.test.ts > getGenerativeModel receives structured-output config > passes responseMimeType: application/json
 ✓ src/lib/gemini/__tests__/listing-captions-uifocus.test.ts > getGenerativeModel receives structured-output config > passes responseSchema that declares uiFocus as required on each item
 ✓ src/lib/gemini/__tests__/listing-captions-uifocus.test.ts > getGenerativeModel receives structured-output config > passes maxOutputTokens >= 1200 (7 captions × caption + uiFocus > 300 default)
 ✓ src/lib/gemini/__tests__/listing-captions-uifocus.test.ts > generateListingPipelineCaptions — uiFocus present in response > returns 7 captions
 ✓ src/lib/gemini/__tests__/listing-captions-uifocus.test.ts > generateListingPipelineCaptions — uiFocus present in response > every caption carries a non-empty uiFocus string
 ✓ src/lib/gemini/__tests__/listing-captions-uifocus.test.ts > generateListingPipelineCaptions — uiFocus present in response > uiFocus is capped at 300 characters
 ✓ src/lib/gemini/__tests__/listing-captions-uifocus.test.ts > generateListingPipelineCaptions — uiFocus present in response > uiFocus contains brand color reference when brandKit is provided
 ✓ src/lib/gemini/__tests__/listing-captions-uifocus.test.ts > generateListingPipelineCaptions — uiFocus present in response > captions are ordered correctly (1–7)
 ✓ src/lib/gemini/__tests__/listing-captions-uifocus.test.ts > generateListingPipelineCaptions — uiFocus present in response > themes match expected distribution (hook / feature / benefit / cta)
 ✓ src/lib/gemini/__tests__/listing-captions-uifocus.test.ts > generateListingPipelineCaptions — uiFocus absent (pre-fix simulation) > returns null uiFocus (not undefined, not throw) when field missing
 ✓ src/lib/gemini/__tests__/listing-captions-uifocus.test.ts > generateListingPipelineCaptions — uiFocus absent (pre-fix simulation) > does not throw when model returns only 3 captions
 ✓ src/lib/gemini/__tests__/listing-captions-uifocus.test.ts > generateListingPipelineCaptions — Arabic locale (RTL parity) > processes Arabic captions and preserves uiFocus
 ✓ src/lib/gemini/__tests__/listing-captions-uifocus.test.ts > generateListingPipelineCaptions — Arabic locale (RTL parity) > passes the same schema config for Arabic as for English
stdout | src/__tests__/integration/backwards-compatibility.test.ts > Backward Compatibility - No Breaking Changes > Token-Aware Synthesis (No Breaking Changes) > should extract context without breaking existing synthesis
[SynthesisContextBuilder] Building context: {
  locale: 'en',
  appId: '550e8400-e29b-41d4-a716-446655440001',
  featuresAvailable: [ 'keyword_tracker', 'competitor_spy', 'review_analysis' ]
}
[SynthesisContextBuilder] ✅ Context built: {
  locale: 'en',
  estimatedTokens: 211,
  keywordCount: 1,
  competitorCount: 5,
  reviewThemes: 0
}

stdout | src/__tests__/integration/backwards-compatibility.test.ts > Backward Compatibility - No Breaking Changes > Token-Aware Synthesis (No Breaking Changes) > should respect locale when building synthesis context
[SynthesisContextBuilder] Building context: {
  locale: 'en',
  appId: '550e8400-e29b-41d4-a716-446655440001',
  featuresAvailable: [ 'keyword_tracker' ]
}
[SynthesisContextBuilder] ✅ Context built: {
  locale: 'en',
  estimatedTokens: 128,
  keywordCount: 1,
  competitorCount: 0,
  reviewThemes: 0
}
[SynthesisContextBuilder] Building context: {
  locale: 'ar',
  appId: '550e8400-e29b-41d4-a716-446655440001',
  featuresAvailable: [ 'keyword_tracker' ]
}
[SynthesisContextBuilder] ✅ Context built: {
  locale: 'ar',
  estimatedTokens: 128,
  keywordCount: 1,
  competitorCount: 0,
  reviewThemes: 0
}

stdout | src/__tests__/integration/backwards-compatibility.test.ts > Backward Compatibility - No Breaking Changes > Token-Aware Synthesis (No Breaking Changes) > should handle missing features gracefully
[SynthesisContextBuilder] Building context: {
  locale: 'en',
  appId: '550e8400-e29b-41d4-a716-446655440001',
  featuresAvailable: []
}
[SynthesisContextBuilder] ✅ Context built: {
  locale: 'en',
  estimatedTokens: 105,
  keywordCount: 0,
  competitorCount: 0,
  reviewThemes: 0
}

 ✓ src/__tests__/integration/backwards-compatibility.test.ts > Backward Compatibility - No Breaking Changes > Core Architecture Properties > should maintain vault structure compatibility
 ✓ src/__tests__/integration/backwards-compatibility.test.ts > Backward Compatibility - No Breaking Changes > Core Architecture Properties > should preserve bilingual isolation
 ✓ src/__tests__/integration/backwards-compatibility.test.ts > Backward Compatibility - No Breaking Changes > Core Architecture Properties > should support multiple concurrent features without conflicts
 ✓ src/__tests__/integration/backwards-compatibility.test.ts > Backward Compatibility - No Breaking Changes > Core Architecture Properties > should maintain change_count for audit trail
 ✓ src/__tests__/integration/backwards-compatibility.test.ts > Backward Compatibility - No Breaking Changes > Core Architecture Properties > should support soft-delete pattern
 ✓ src/__tests__/integration/backwards-compatibility.test.ts > Backward Compatibility - No Breaking Changes > Producer Isolation (No Breaking Changes) > should prevent producer from touching other features
 ✓ src/__tests__/integration/backwards-compatibility.test.ts > Backward Compatibility - No Breaking Changes > Producer Isolation (No Breaking Changes) > should prevent producer from touching other locale
 ✓ src/__tests__/integration/backwards-compatibility.test.ts > Backward Compatibility - No Breaking Changes > Producer Isolation (No Breaking Changes) > should track which producer last modified vault
 ✓ src/__tests__/integration/backwards-compatibility.test.ts > Backward Compatibility - No Breaking Changes > Token-Aware Synthesis (No Breaking Changes) > should extract context without breaking existing synthesis
 ✓ src/__tests__/integration/backwards-compatibility.test.ts > Backward Compatibility - No Breaking Changes > Token-Aware Synthesis (No Breaking Changes) > should respect locale when building synthesis context
 ✓ src/__tests__/integration/backwards-compatibility.test.ts > Backward Compatibility - No Breaking Changes > Token-Aware Synthesis (No Breaking Changes) > should handle missing features gracefully
 ✓ src/__tests__/integration/backwards-compatibility.test.ts > Backward Compatibility - No Breaking Changes > Vault Operations (No Breaking Changes) > should support creating new vault
 ✓ src/__tests__/integration/backwards-compatibility.test.ts > Backward Compatibility - No Breaking Changes > Vault Operations (No Breaking Changes) > should support updating existing vault
 ✓ src/__tests__/integration/backwards-compatibility.test.ts > Backward Compatibility - No Breaking Changes > Vault Operations (No Breaking Changes) > should support archiving vault (soft delete)
 ✓ src/__tests__/integration/backwards-compatibility.test.ts > Backward Compatibility - No Breaking Changes > Vault Operations (No Breaking Changes) > should support restoring archived vault
 ✓ src/__tests__/integration/backwards-compatibility.test.ts > Backward Compatibility - No Breaking Changes > API Endpoint Compatibility > should support GET /staging/vault?appId=...
 ✓ src/__tests__/integration/backwards-compatibility.test.ts > Backward Compatibility - No Breaking Changes > API Endpoint Compatibility > should support POST /staging/vault with feature payload
 ✓ src/__tests__/integration/backwards-compatibility.test.ts > Backward Compatibility - No Breaking Changes > API Endpoint Compatibility > should return proper response format
 ✓ src/__tests__/integration/backwards-compatibility.test.ts > Backward Compatibility - No Breaking Changes > Migration Path (No Breaking Changes) > should allow old /staging/add endpoint to coexist with new /staging/vault
 ✓ src/__tests__/integration/backwards-compatibility.test.ts > Backward Compatibility - No Breaking Changes > Migration Path (No Breaking Changes) > should allow gradual migration to new architecture
 ✓ src/__tests__/integration/backwards-compatibility.test.ts > Backward Compatibility - No Breaking Changes > Migration Path (No Breaking Changes) > should support A/B testing old vs new system
 ✓ src/__tests__/integration/backwards-compatibility.test.ts > Backward Compatibility - No Breaking Changes > Production Readiness Checks > should pass schema validation
 ✓ src/__tests__/integration/backwards-compatibility.test.ts > Backward Compatibility - No Breaking Changes > Production Readiness Checks > should have all required audit fields
 ✓ src/__tests__/integration/backwards-compatibility.test.ts > Backward Compatibility - No Breaking Changes > Production Readiness Checks > should support RLS policies
 ✓ src/__tests__/integration/backwards-compatibility.test.ts > Backward Compatibility - No Breaking Changes > Production Readiness Checks > should have performance indexes in place
 ✓ src/lib/retry/__tests__/error-classifier.test.ts > Error Classifier > Runware Error Classification > retryable errors > classifies ECONNRESET as retryable
 ✓ src/lib/retry/__tests__/error-classifier.test.ts > Error Classifier > Runware Error Classification > retryable errors > classifies ETIMEDOUT as retryable
 ✓ src/lib/retry/__tests__/error-classifier.test.ts > Error Classifier > Runware Error Classification > retryable errors > classifies socket hang up as retryable
 ✓ src/lib/retry/__tests__/error-classifier.test.ts > Error Classifier > Runware Error Classification > retryable errors > classifies 5xx errors as retryable
 ✓ src/lib/retry/__tests__/error-classifier.test.ts > Error Classifier > Runware Error Classification > retryable errors > classifies 502 Bad Gateway as retryable
 ✓ src/lib/retry/__tests__/error-classifier.test.ts > Error Classifier > Runware Error Classification > retryable errors > classifies 503 Service Unavailable as retryable
 ✓ src/lib/retry/__tests__/error-classifier.test.ts > Error Classifier > Runware Error Classification > retryable errors > classifies 429 Rate Limit as retryable
 ✓ src/lib/retry/__tests__/error-classifier.test.ts > Error Classifier > Runware Error Classification > retryable errors > classifies 408 Request Timeout as retryable
 ✓ src/lib/retry/__tests__/error-classifier.test.ts > Error Classifier > Runware Error Classification > non-retryable errors > classifies 400 Bad Request as non-retryable
 ✓ src/lib/retry/__tests__/error-classifier.test.ts > Error Classifier > Runware Error Classification > non-retryable errors > classifies 401 Unauthorized as non-retryable
 ✓ src/lib/retry/__tests__/error-classifier.test.ts > Error Classifier > Runware Error Classification > non-retryable errors > classifies 403 Forbidden as non-retryable
 ✓ src/lib/retry/__tests__/error-classifier.test.ts > Error Classifier > Runware Error Classification > non-retryable errors > classifies 404 Not Found as non-retryable
 ✓ src/lib/retry/__tests__/error-classifier.test.ts > Error Classifier > Runware Error Classification > non-retryable errors > classifies 3xx redirects as non-retryable
 ✓ src/lib/retry/__tests__/error-classifier.test.ts > Error Classifier > Gemini Error Classification > retryable errors > classifies INTERNAL as retryable
 ✓ src/lib/retry/__tests__/error-classifier.test.ts > Error Classifier > Gemini Error Classification > retryable errors > classifies UNAVAILABLE as retryable
 ✓ src/lib/retry/__tests__/error-classifier.test.ts > Error Classifier > Gemini Error Classification > retryable errors > classifies DEADLINE_EXCEEDED as retryable
 ✓ src/lib/retry/__tests__/error-classifier.test.ts > Error Classifier > Gemini Error Classification > retryable errors > classifies RESOURCE_EXHAUSTED as retryable
 ✓ src/lib/retry/__tests__/error-classifier.test.ts > Error Classifier > Gemini Error Classification > retryable errors > classifies connection errors as retryable
 ✓ src/lib/retry/__tests__/error-classifier.test.ts > Error Classifier > Gemini Error Classification > retryable errors > classifies 5xx HTTP errors as retryable
 ✓ src/lib/retry/__tests__/error-classifier.test.ts > Error Classifier > Gemini Error Classification > retryable errors > classifies 429 HTTP Rate Limit as retryable
 ✓ src/lib/retry/__tests__/error-classifier.test.ts > Error Classifier > Gemini Error Classification > non-retryable errors > classifies INVALID_ARGUMENT as non-retryable
 ✓ src/lib/retry/__tests__/error-classifier.test.ts > Error Classifier > Gemini Error Classification > non-retryable errors > classifies PERMISSION_DENIED as non-retryable
 ✓ src/lib/retry/__tests__/error-classifier.test.ts > Error Classifier > Gemini Error Classification > non-retryable errors > classifies NOT_FOUND as non-retryable
 ✓ src/lib/retry/__tests__/error-classifier.test.ts > Error Classifier > Gemini Error Classification > non-retryable errors > classifies 4xx HTTP errors as non-retryable
 ✓ src/lib/retry/__tests__/error-classifier.test.ts > Error Classifier > Gemini Error Classification > non-retryable errors > classifies 401 Unauthorized as non-retryable
 ✓ src/lib/retry/__tests__/error-classifier.test.ts > Error Classifier > Helper Functions > isRunwareRetryable returns boolean
 ✓ src/lib/retry/__tests__/error-classifier.test.ts > Error Classifier > Helper Functions > isGeminiRetryable returns boolean
stdout | tests/api-route-integration.test.ts > POST /api/listings/generate > returns 202 with WAITING_FOR_PHASES when orchestrator read-check detects missing phases
--- [DEBUG] Pipeline Entry Point: POST /api/listings/generate ---
[DEBUG] Route: createClient() resolved — fetching auth user
[DEBUG] Route: supabase.auth.getUser() resolved { hasUser: true }
[listing-generate] Incoming Payload: {
  "appName": "TestApp",
  "category": "Productivity",
  "targetKeywords": [
    "focus",
    "habit"
  ],
  "appFeatures": "Track habits and stay focused",
  "toneStyle": "professional",
  "workspaceId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "vaultLocale": "en",
  "queueHash": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  "generationStep": "pipeline",
  "lockedKeywords": [],
  "includeOptimizerContext": false
}
[listing-generate] Parsed payload summary: {
  generationStep: 'pipeline',
  lockedKeywords: [],
  hasOrchestration: false,
  hasModularListing: false,
  contextTitle: undefined
}
[DEBUG] DB: initiating stampAndCompileListingContext {
  workspaceId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  appId: null,
  queueHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  vaultLocale: 'en',
  step: 'pipeline'
}
[DEBUG] DB: stampAndCompileListingContext completed { elapsedMs: 0, signalCount: 0, keywordCount: 0 }

stdout | tests/api-route-integration.test.ts > POST /api/listings/generate > returns 202 with WAITING_FOR_PHASES and includes jobId when an active job is already running
--- [DEBUG] Pipeline Entry Point: POST /api/listings/generate ---
[DEBUG] Route: createClient() resolved — fetching auth user
[DEBUG] Route: supabase.auth.getUser() resolved { hasUser: true }
[listing-generate] Incoming Payload: {
  "appName": "TestApp",
  "category": "Productivity",
  "targetKeywords": [
    "focus",
    "habit"
  ],
  "appFeatures": "Track habits and stay focused",
  "toneStyle": "professional",
  "workspaceId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "vaultLocale": "en",
  "queueHash": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  "generationStep": "pipeline",
  "lockedKeywords": [],
  "includeOptimizerContext": false
}
[listing-generate] Parsed payload summary: {
  generationStep: 'pipeline',
  lockedKeywords: [],
  hasOrchestration: false,
  hasModularListing: false,
  contextTitle: undefined
}
[DEBUG] DB: initiating stampAndCompileListingContext {
  workspaceId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  appId: null,
  queueHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  vaultLocale: 'en',
  step: 'pipeline'
}
[DEBUG] DB: stampAndCompileListingContext completed { elapsedMs: 0, signalCount: 0, keywordCount: 0 }

stdout | tests/api-route-integration.test.ts > POST /api/listings/generate > returns 202 with jobId when generation is successfully enqueued
--- [DEBUG] Pipeline Entry Point: POST /api/listings/generate ---
[DEBUG] Route: createClient() resolved — fetching auth user
[DEBUG] Route: supabase.auth.getUser() resolved { hasUser: true }
[listing-generate] Incoming Payload: {
  "appName": "TestApp",
  "category": "Productivity",
  "targetKeywords": [
    "focus",
    "habit"
  ],
  "appFeatures": "Track habits and stay focused",
  "toneStyle": "professional",
  "workspaceId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "vaultLocale": "en",
  "queueHash": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  "generationStep": "pipeline",
  "lockedKeywords": [],
  "includeOptimizerContext": false
}
[listing-generate] Parsed payload summary: {
  generationStep: 'pipeline',
  lockedKeywords: [],
  hasOrchestration: false,
  hasModularListing: false,
  contextTitle: undefined
}
[DEBUG] DB: initiating stampAndCompileListingContext {
  workspaceId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  appId: null,
  queueHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  vaultLocale: 'en',
  step: 'pipeline'
}
[DEBUG] DB: stampAndCompileListingContext completed { elapsedMs: 0, signalCount: 0, keywordCount: 0 }

stdout | tests/api-route-integration.test.ts > POST /api/listings/generate > returns 202 immediately (skips job creation) when an existing pending job is found
--- [DEBUG] Pipeline Entry Point: POST /api/listings/generate ---
[DEBUG] Route: createClient() resolved — fetching auth user
[DEBUG] Route: supabase.auth.getUser() resolved { hasUser: true }
[listing-generate] Incoming Payload: {
  "appName": "TestApp",
  "category": "Productivity",
  "targetKeywords": [
    "focus",
    "habit"
  ],
  "appFeatures": "Track habits and stay focused",
  "toneStyle": "professional",
  "workspaceId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "vaultLocale": "en",
  "queueHash": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  "generationStep": "pipeline",
  "lockedKeywords": [],
  "includeOptimizerContext": false
}
[listing-generate] Parsed payload summary: {
  generationStep: 'pipeline',
  lockedKeywords: [],
  hasOrchestration: false,
  hasModularListing: false,
  contextTitle: undefined
}
[DEBUG] DB: initiating stampAndCompileListingContext {
  workspaceId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  appId: null,
  queueHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  vaultLocale: 'en',
  step: 'pipeline'
}
[DEBUG] DB: stampAndCompileListingContext completed { elapsedMs: 0, signalCount: 0, keywordCount: 0 }

 ✓ tests/api-route-integration.test.ts > POST /api/listings/generate > returns 202 with WAITING_FOR_PHASES when orchestrator read-check detects missing phases
 ✓ tests/api-route-integration.test.ts > POST /api/listings/generate > returns 202 with WAITING_FOR_PHASES and includes jobId when an active job is already running
 ✓ tests/api-route-integration.test.ts > POST /api/listings/generate > returns 202 with jobId when generation is successfully enqueued
 ✓ tests/api-route-integration.test.ts > POST /api/listings/generate > returns 202 immediately (skips job creation) when an existing pending job is found
 ✓ tests/api-route-integration.test.ts > POST /api/listings/worker > returns 409 and marks job failed when the queueHash does not match the live vault
 ✓ tests/api-route-integration.test.ts > POST /api/listings/worker > returns 200 and processes the job when the vault hash matches
 ✓ tests/api-route-integration.test.ts > POST /api/listings/worker > returns 404 when the job is not found in the database
 ✓ tests/api-route-integration.test.ts > POST /api/listings/worker > idempotently skips already-completed jobs
 ✓ src/lib/gemini/__tests__/aso-report-card.test.ts > ASO Report Card > buildAsoAnalysisPrompt > builds prompt for English (LTR) input
 ✓ src/lib/gemini/__tests__/aso-report-card.test.ts > ASO Report Card > buildAsoAnalysisPrompt > builds prompt for Arabic (RTL) input
 ✓ src/lib/gemini/__tests__/aso-report-card.test.ts > ASO Report Card > buildAsoAnalysisPrompt > includes target keywords in prompt
 ✓ src/lib/gemini/__tests__/aso-report-card.test.ts > ASO Report Card > buildAsoAnalysisPrompt > includes previous generation context if provided
 ✓ src/lib/gemini/__tests__/aso-report-card.test.ts > ASO Report Card > buildAsoAnalysisPrompt > prompt is clean (no dangerous keywords)
 ✓ src/lib/gemini/__tests__/aso-report-card.test.ts > ASO Report Card > buildAsoAnalysisPrompt > prompt specifies JSON output format
 ✓ src/lib/gemini/__tests__/aso-report-card.test.ts > ASO Report Card > buildAsoAnalysisPrompt > prompt includes validation checklist
 ✓ src/lib/gemini/__tests__/aso-report-card.test.ts > ASO Report Card > verifyAnalysisResponse > validates correct response
 ✓ src/lib/gemini/__tests__/aso-report-card.test.ts > ASO Report Card > verifyAnalysisResponse > rejects invalid JSON
 ✓ src/lib/gemini/__tests__/aso-report-card.test.ts > ASO Report Card > verifyAnalysisResponse > detects missing required fields
 ✓ src/lib/gemini/__tests__/aso-report-card.test.ts > ASO Report Card > verifyAnalysisResponse > validates score ranges
 ✓ src/lib/gemini/__tests__/aso-report-card.test.ts > ASO Report Card > verifyAnalysisResponse > validates exactly 3 actionable tips
 ✓ src/lib/gemini/__tests__/aso-report-card.test.ts > ASO Report Card > verifyAnalysisResponse > detects missing tip fields
 ✓ src/lib/gemini/__tests__/aso-report-card.test.ts > ASO Report Card > extractJsonFromResponse > extracts JSON from markdown code block
 ✓ src/lib/gemini/__tests__/aso-report-card.test.ts > ASO Report Card > extractJsonFromResponse > extracts JSON from code block without language tag
 ✓ src/lib/gemini/__tests__/aso-report-card.test.ts > ASO Report Card > extractJsonFromResponse > returns raw input if no code block
 ✓ src/lib/gemini/__tests__/aso-report-card.test.ts > ASO Report Card > extractJsonFromResponse > trims whitespace
 ✓ src/lib/gemini/__tests__/aso-report-card.test.ts > ASO Report Card > validateReportCard > validates correct report card
 ✓ src/lib/gemini/__tests__/aso-report-card.test.ts > ASO Report Card > validateReportCard > rejects report with missing fields
 ✓ src/lib/gemini/__tests__/aso-report-card.test.ts > ASO Report Card > validateReportCard > detects out-of-range scores
 ✓ src/lib/gemini/__tests__/aso-report-card.test.ts > ASO Report Card > RTL/LTR Localization > English prompt has no RTL-specific language
 ✓ src/lib/gemini/__tests__/aso-report-card.test.ts > ASO Report Card > RTL/LTR Localization > Arabic prompt includes RTL considerations
 ✓ src/lib/gemini/__tests__/aso-report-card.test.ts > ASO Report Card > RTL/LTR Localization > market context differs by locale
 ✓ src/__tests__/integration/optimization-queue-active-context.test.ts > optimization queue active context > rejects empty queue payloads
 ✓ src/__tests__/integration/optimization-queue-active-context.test.ts > optimization queue active context > maps review pain points into Review Insights partition
 ✓ src/__tests__/integration/optimization-queue-active-context.test.ts > optimization queue active context > keeps user-staged review pain points visible (backlog_id / explicitly_staged)
 ✓ src/__tests__/integration/optimization-queue-active-context.test.ts > optimization queue active context > routes competitor spy keyword gaps to Competitor Strengths (not Market Intel)
 ✓ src/__tests__/integration/optimization-queue-active-context.test.ts > optimization queue active context > excludes legacy keyword curation from competitor spy pills
 ✓ src/__tests__/integration/optimization-queue-active-context.test.ts > optimization queue active context > includes ACTIVE competitor_strength in competitor spy pills
 ✓ src/__tests__/integration/optimization-queue-active-context.test.ts > optimization queue active context > excludes AUDIT strengths from competitor spy pills
 ✓ src/__tests__/integration/optimization-queue-active-context.test.ts > optimization queue active context > excludes legacy metadata-only flags without top-level status
 ✓ src/__tests__/integration/optimization-queue-active-context.test.ts > optimization queue active context > isolates competitor spy items by vault locale branch
 ✓ src/lib/retry/__tests__/retry-engine.test.ts > Retry Engine > calculateBackoffDelay > calculates exponential backoff without jitter for deterministic testing
 ✓ src/lib/retry/__tests__/retry-engine.test.ts > Retry Engine > calculateBackoffDelay > applies jitter as ±20% variance
 ✓ src/lib/retry/__tests__/retry-engine.test.ts > Retry Engine > calculateBackoffDelay > prevents negative delays
 ✓ src/lib/retry/__tests__/retry-engine.test.ts > Retry Engine > retryWithBackoff > succeeds on first attempt if function succeeds
 ✓ src/lib/retry/__tests__/retry-engine.test.ts > Retry Engine > retryWithBackoff > retries failed attempts and eventually succeeds
 ✓ src/lib/retry/__tests__/retry-engine.test.ts > Retry Engine > retryWithBackoff > stops retrying after maxRetries exhausted
 ✓ src/lib/retry/__tests__/retry-engine.test.ts > Retry Engine > retryWithBackoff > respects isRetryable classifier and stops on non-retryable error
 ✓ src/lib/gemini/__tests__/json-recovery.test.ts > json-recovery > recoverPartialJson > recovers object truncated mid-string
 ✓ src/lib/gemini/__tests__/json-recovery.test.ts > json-recovery > recoverPartialJson > recovers array truncated mid-string
 ✓ src/lib/gemini/__tests__/json-recovery.test.ts > json-recovery > recoverPartialJson > recovers nested object with truncation
 ✓ src/lib/gemini/__tests__/json-recovery.test.ts > json-recovery > recoverPartialJson > preserves Arabic text (RTL) without modification
 ✓ src/lib/gemini/__tests__/json-recovery.test.ts > json-recovery > recoverPartialJson > preserves mixed English and Arabic content
 ✓ src/lib/gemini/__tests__/json-recovery.test.ts > json-recovery > recoverPartialJson > handles escaped quotes correctly
 ✓ src/lib/gemini/__tests__/json-recovery.test.ts > json-recovery > recoverPartialJson > returns null for empty string
 ✓ src/lib/gemini/__tests__/json-recovery.test.ts > json-recovery > recoverPartialJson > returns null for non-JSON
 ✓ src/lib/gemini/__tests__/json-recovery.test.ts > json-recovery > recoverPartialJson > handles valid complete JSON (no truncation)
 ✓ src/lib/gemini/__tests__/json-recovery.test.ts > json-recovery > recoverPartialJson > recovers deeply nested structure
 ✓ src/lib/gemini/__tests__/json-recovery.test.ts > json-recovery > parseJsonWithRecovery > parses complete JSON directly
 ✓ src/lib/gemini/__tests__/json-recovery.test.ts > json-recovery > parseJsonWithRecovery > parses truncated JSON via recovery
 ✓ src/lib/gemini/__tests__/json-recovery.test.ts > json-recovery > parseJsonWithRecovery > returns null if recovery fails
 ✓ src/lib/gemini/__tests__/json-recovery.test.ts > json-recovery > parseJsonWithRecovery > returns null for empty string
 ✓ src/lib/gemini/__tests__/json-recovery.test.ts > json-recovery > recoverSentimentJson > recovers complete sentiment JSON
 ✓ src/lib/gemini/__tests__/json-recovery.test.ts > json-recovery > recoverSentimentJson > recovers truncated sentiment JSON
 ✓ src/lib/gemini/__tests__/json-recovery.test.ts > json-recovery > recoverSentimentJson > fills missing fields with empty arrays
 ✓ src/lib/gemini/__tests__/json-recovery.test.ts > json-recovery > recoverSentimentJson > preserves Arabic keywords
 ✓ src/lib/gemini/__tests__/json-recovery.test.ts > json-recovery > recoverSentimentJson > slices arrays to max 6 items
 ✓ src/lib/gemini/__tests__/json-recovery.test.ts > json-recovery > recoverSentimentJson > returns null if recovery impossible
 ✓ src/lib/gemini/__tests__/json-recovery.test.ts > json-recovery > recoverSentimentJson > coerces non-string array items to strings
 ✓ src/lib/gemini/__tests__/json-recovery.test.ts > json-recovery > recoverSentimentJson > handles mixed English and Arabic keywords
 ✓ src/lib/retry/__tests__/retry-engine.test.ts > Retry Engine > retryWithBackoff > applies timeout to each attempt
 ✓ src/lib/retry/__tests__/retry-engine.test.ts > Retry Engine > retryWithBackoff > tracks total duration including retries
 ✓ src/lib/retry/__tests__/retry-engine.test.ts > Retry Engine > retryWithBackoff > returns correct error information on final failure
 ✓ src/lib/keywords/__tests__/optimizer-context-routing.test.ts > optimizer context category routing > routes tracker category to keyword_tracker widget
 ✓ src/lib/keywords/__tests__/optimizer-context-routing.test.ts > optimizer context category routing > blocks competitor_spy from keyword tracker and reroutes to market opportunities
 ✓ src/lib/keywords/__tests__/optimizer-context-routing.test.ts > optimizer context category routing > partitions queue items by category without leaking competitor keywords into tracker
 ✓ src/lib/keywords/__tests__/optimizer-context-routing.test.ts > optimizer context category routing > flattenQueueToActiveItems assigns targetWidget from category routing table
 ✓ src/lib/retry/__tests__/retry-engine.test.ts > Retry Engine > realistic scenario: transient then success > recovers from transient Runware-like errors
 ✓ src/lib/optimization-queue/__tests__/optimization-queue-hash.test.ts > optimization-queue-hash > produces stable hash for identical queue snapshots
 ✓ src/lib/optimization-queue/__tests__/optimization-queue-hash.test.ts > optimization-queue-hash > changes hash when content or lifecycle status changes
 ✓ src/lib/optimization-queue/__tests__/optimization-queue-hash.test.ts > optimization-queue-hash > isolates EN and AR vault branches
 ✓ src/lib/optimization-queue/__tests__/optimization-queue-hash.test.ts > optimization-queue-hash > normalizes category and growth tags via SSOT resolvers
 ✓ src/__tests__/integration/cluster-to-generate.test.ts > cluster-to-generate pipeline > assigns signalCluster and partitions into offensive/defensive/market
 ✓ src/__tests__/integration/cluster-to-generate.test.ts > cluster-to-generate pipeline > injects cluster JSON and strategy instructions into LLM messages
 ✓ src/__tests__/integration/cluster-to-generate.test.ts > cluster-to-generate pipeline > infers cluster for legacy rows missing signalCluster
 ✓ src/lib/market-capture/__tests__/market-capture-engine.test.ts > market-capture-engine > partitions queue into growth vs oppositional context
 ✓ src/lib/market-capture/__tests__/market-capture-engine.test.ts > market-capture-engine > builds staged changes without auto-approve
 ✓ src/lib/market-capture/__tests__/market-capture-engine.test.ts > market-capture-engine > applyApprovedStagedChanges merges only approved fields
 ✓ src/lib/listing/__tests__/apply-orchestration-output.test.ts > assembleExpansionFullDescription > joins hook, features, trust, and cta
 ✓ src/lib/listing/__tests__/apply-orchestration-output.test.ts > applyOrchestrationToListingOutput > maps anchor and primary variation to root fields
 ✓ src/lib/listing/__tests__/apply-orchestration-output.test.ts > mergeOrchestrationModule > replaces only the requested module
 ✓ src/__tests__/integration/active-context-synthesis-feedback.test.ts > active context synthesis feedback loop > includes structured cluster JSON in listing optimizer messages
 ✓ src/__tests__/integration/active-context-synthesis-feedback.test.ts > active context synthesis feedback loop > isolates cluster buckets by vault locale branch
 ✓ src/lib/optimizer/__tests__/context-adapter.test.ts > OptimizerContextAdapter > deduplicates by content_preview using a Set
 ✓ src/lib/optimizer/__tests__/context-adapter.test.ts > OptimizerContextAdapter > hard-caps prioritized signals to 5
 ✓ src/lib/optimizer/__tests__/context-adapter.test.ts > OptimizerContextAdapter > prioritizes review_analysis in buildOptimizedContextFromItems
 ✓ src/lib/market/__tests__/categorize-market-intel.test.ts > categorize-market-intel > prioritizes by search volume and conversion impact blend
 ✓ src/lib/market/__tests__/categorize-market-intel.test.ts > categorize-market-intel > migrates legacy spotlight into growth keywords and ux insights
 ✓ src/lib/market/__tests__/categorize-market-intel.test.ts > categorize-market-intel > builds categorized report from model output
 ✓ src/lib/competitor-spy/__tests__/strength-audit-ssot.test.ts > strength-audit-ssot > approves ACTIVE status only (strict top-level column)
 ✓ src/lib/competitor-spy/__tests__/strength-audit-ssot.test.ts > strength-audit-ssot > filters audit queue by status === AUDIT
 ✓ src/lib/competitor-spy/__tests__/strength-audit-ssot.test.ts > strength-audit-ssot > filters active context by status === ACTIVE
 ✓ src/lib/competitor-spy/__tests__/strength-audit-ssot.test.ts > strength-audit-ssot > demote preserves row and sets status AUDIT
 ✓ supabase/tests/pipeline-integration.test.ts > Async Listing Pipeline Integration Tests > Read Mode (Producer Guard) > should return WAITING_FOR_PHASES when title is missing
 ✓ supabase/tests/pipeline-integration.test.ts > Async Listing Pipeline Integration Tests > Read Mode (Producer Guard) > should return ok: true when all prerequisites are met
 ✓ supabase/tests/pipeline-integration.test.ts > Async Listing Pipeline Integration Tests > Execute Mode (Worker Assertion) > should throw modular_phase_order_conflict if worker runs out of order
 ✓ supabase/tests/pipeline-integration.test.ts > Async Listing Pipeline Integration Tests > Execute Mode (Worker Assertion) > should execute successfully when state matches requirements
 ✓ src/lib/gemini/__tests__/parse-gemini-json-response.test.ts > parse-gemini-json-response > isTruncatedFinishReason detects MAX_TOKENS and LENGTH
 ✓ src/lib/gemini/__tests__/parse-gemini-json-response.test.ts > parse-gemini-json-response > prepareGeminiJsonText heals missing closing brace
 ✓ src/lib/gemini/__tests__/parse-gemini-json-response.test.ts > parse-gemini-json-response > parseGeminiJsonText parses complete JSON
 ✓ src/lib/gemini/__tests__/parse-gemini-json-response.test.ts > parse-gemini-json-response > parseGeminiJsonText flags truncated parse failures
 ✓ src/lib/gemini/__tests__/parse-gemini-json-response.test.ts > parse-gemini-json-response > parseGeminiJsonText recovers partial nested JSON
 ✓ src/lib/optimization-queue/__tests__/auto-stage-top-insights.test.ts > pickTopAutoStageInsightInputs > prioritizes competitor vulnerabilities from vault audit rows
 ✓ src/lib/optimization-queue/__tests__/auto-stage-top-insights.test.ts > pickTopAutoStageInsightInputs > returns at most three inputs
 ✓ src/lib/competitor-spy/__tests__/competitive-edge-report.test.ts > competitive-edge-report > maps paywall pain to shortDescription counter-feature
 ✓ src/lib/competitor-spy/__tests__/competitive-edge-report.test.ts > competitive-edge-report > builds structured report with three optimizer categories
 ✓ src/lib/utils/__tests__/json-repair.test.ts > robustParseJson > parses complete JSON object
 ✓ src/lib/utils/__tests__/json-repair.test.ts > robustParseJson > strips markdown fences
 ✓ src/lib/utils/__tests__/json-repair.test.ts > robustParseJson > extracts first { to last } from conversational filler
 ✓ src/lib/utils/__tests__/json-repair.test.ts > robustParseJson > balances missing closing brace
 ✓ src/lib/utils/__tests__/json-repair.test.ts > robustParseJson > preserves Arabic UTF-8 content
 ✓ src/lib/utils/__tests__/json-repair.test.ts > robustParseJson > returns null when parsing is impossible
 ✓ src/lib/utils/__tests__/json-repair.test.ts > robustParseJson > pads truncated modular long JSON when features key is present
 ✓ src/lib/competitor-spy/__tests__/competitor-strength-lifecycle.test.ts > signal-lifecycle > reads top-level status first
 ✓ src/lib/competitor-spy/__tests__/competitor-strength-lifecycle.test.ts > signal-lifecycle > migrates legacy metadata.status on read (normalization only)
 ✓ src/lib/competitor-spy/__tests__/competitor-strength-lifecycle.test.ts > signal-lifecycle > applySignalLifecycleStatus sets top-level and strips legacy metadata
 ✓ src/lib/staging-vault/__tests__/staging-vault-metadata.test.ts > staging-vault-metadata > enriches canonical JSONB fields for market intel signals
 ✓ src/lib/staging-vault/__tests__/staging-vault-metadata.test.ts > staging-vault-metadata > forces review signals into review section even when miscategorized
 ✓ src/lib/staging-vault/__tests__/staging-vault-metadata.test.ts > staging-vault-metadata > prevents review queue items from resolving to opportunity category
 ✓ src/lib/staging-vault/__tests__/staging-vault-metadata.test.ts > staging-vault-metadata > assigns market intel to opportunity section
 ✓ src/lib/keywords/__tests__/discovery-ai-suggestions.test.ts > buildContextualDiscoverySuggestions > prioritizes brand keywords for salt sugar app
 ✓ src/lib/keywords/__tests__/discovery-ai-suggestions.test.ts > buildContextualDiscoverySuggestions > dedupes ai listing and heuristics
 ✓ src/lib/keywords/__tests__/keyword-tracking-match.test.ts > keywordTrackingMatchKeys > includes raw and stripped forms for bracket-prefixed AI suggestions
 ✓ src/lib/keywords/__tests__/keyword-tracking-match.test.ts > isKeywordTrackedOnApp > matches suggestion prefix when watchlist stores stripped term
 ✓ src/lib/keywords/__tests__/keyword-tracking-match.test.ts > isKeywordTrackedOnApp > matches when watchlist stores full prefixed term
 ✓ src/lib/market/__tests__/parse-spotlight-json.test.ts > parseSpotlightJson > parses valid JSON
 ✓ src/lib/market/__tests__/parse-spotlight-json.test.ts > parseSpotlightJson > repairs truncated JSON with jsonrepair
 ✓ src/lib/market/__tests__/parse-spotlight-json.test.ts > parseSpotlightJson > throws on unrecoverable garbage
 ✓ src/lib/utils/__tests__/listing-guardrails.test.ts > validateGenerationReadiness > blocks generation when the optimization queue is empty
 ✓ src/lib/utils/__tests__/listing-guardrails.test.ts > validateGenerationReadiness > allows generation when at least one queue item is staged
 ✓ src/lib/competitor-spy/__tests__/praise-signal-curation.test.ts > praise-signal-curation > splits baseline vs market-dominating by impact threshold

 Test Files  31 passed (31)
      Tests  287 passed (287)
   Start at  07:09:28
   Duration  2.78s (transform 1.10s, setup 0ms, collect 2.42s, tests 435ms, environment 5ms, prepare 2.00s)

 PASS  Waiting for file changes...
       press h to show help, press q to quit
Cancelling test run. Press CTRL+c again to exit forcefully.

