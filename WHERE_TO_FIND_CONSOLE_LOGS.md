# Where to Find Console Logs - Complete Guide

**Updated:** 2026-06-04

---

## Quick Answer

**Console logs appear LIVE in your browser - NOT in a file on your computer.**

They show in real-time as your code executes.

---

## Step-by-Step: How to Access Console Logs

### STEP 1: Open Developer Tools

Choose your browser:

**Chrome/Edge/Brave:**
- Press `F12` (or right-click page → "Inspect")
- On Mac: `Cmd + Option + I`

**Firefox:**
- Press `F12` (or right-click page → "Inspect Element")
- On Mac: `Cmd + Option + I`

**Safari:**
- Press `Cmd + Option + I`
- First time? Enable: Safari menu → Preferences → Advanced → "Show Develop menu in menu bar"

---

### STEP 2: Click the "Console" Tab

Once Developer Tools opens:

1. Look at the top tabs: **Elements** | **Console** | **Network** | **Sources** | etc.
2. Click on **"Console"** tab
3. You should see a blank area with a `>` prompt at the bottom

---

### STEP 3: Trigger the Stage Button

1. Go back to your app (Developer Tools stays open)
2. **Click the "Stage Issue" button**
3. Immediately switch to Developer Tools Console tab
4. Watch the logs appear in real-time

---

## What You'll See in Console

### ✅ SUCCESS Example:

```
🎯 [UnifiedStageButton] Stage button clicked, triggering action...
[UnifiedStageButton] Passing guard conditions, initializing...
[UnifiedStageButton] Building staging metadata...
[UnifiedStageButton] Metadata built successfully: {stagedAt: "2026-06-04T...", language: "en", signalType: "review_issue"}
[UnifiedStageButton] API Call Details: {url: "/api/workspaces/abc123/staging/add", method: "POST", payload: {…}}
[UnifiedStageButton] API Response received: {status: 200, statusText: "OK", ok: true}
[UnifiedStageButton] API Response data: {id: "xyz789", signalType: "review_issue", stagedAt: "2026-06-04T..."}
[UnifiedStageButton] Marking button as staged...
[UnifiedStageButton] Executing onArchiveItem callback...
[UnifiedStageButton] onArchiveItem callback completed
[UnifiedStageButton] Executing handleStageSuccess callback...
[UnifiedStageButton] handleStageSuccess callback completed
[UnifiedStageButton] Showing success toast: Moved to optimization history
✅ [UnifiedStageButton] Staging completed successfully!
[UnifiedStageButton] Cleanup: setting loading to false
```

### ❌ ERROR Example:

```
🎯 [UnifiedStageButton] Stage button clicked, triggering action...
[UnifiedStageButton] Passing guard conditions, initializing...
[UnifiedStageButton] Building staging metadata...
[UnifiedStageButton] API Call Details: {url: "/api/workspaces/abc123/staging/add", method: "POST", payload: {…}}
[UnifiedStageButton] API Response received: {status: 404, statusText: "Not Found", ok: false}
[UnifiedStageButton] API Error Response Body: {error: "Endpoint not found"}
❌ [UnifiedStageButton] Error during staging: Error: Failed to stage: 404 Not Found
[UnifiedStageButton] Error stack: Error: Failed to stage...
    at UnifiedStageButton.tsx:150
    at async handleStage (UnifiedStageButton.tsx:140)
[UnifiedStageButton] Executing onStageError callback...
[UnifiedStageButton] Showing error toast: Failed to stage
❌ [UnifiedStageButton] Staging failed!
```

---

## How to Copy Console Logs to Share

If you want to copy the logs to send to someone:

### Option 1: Screenshot

1. Open Console (F12)
2. Click Stage button
3. Take screenshot of console output (Cmd+Shift+5 on Mac, Snip on Windows)
4. Share the screenshot

### Option 2: Copy as Text

1. Open Console (F12)
2. Click Stage button
3. Select all text in console:
   - Windows: `Ctrl + A`
   - Mac: `Cmd + A`
4. Copy: `Ctrl + C` (or `Cmd + C` on Mac)
5. Paste into email/Slack/etc.

### Option 3: Export Console

Some browsers allow exporting:

**Chrome/Edge:**
1. Right-click in console
2. Look for "Save as" or "Save all" option
3. Save to file

**Firefox:**
1. Right-click in console
2. "Export visible messages to"

---

## Console Filters & Searching

### Filter by Log Level

In console, you'll see colored logs:
- 📝 **Gray/Black** = `console.log()` - Normal logs
- 🟡 **Yellow** = `console.warn()` - Warnings
- 🔴 **Red** = `console.error()` - Errors

### Search in Console

1. Open Console
2. Press `Ctrl + F` (or `Cmd + F` on Mac)
3. Type search term:
   - `[UnifiedStageButton]` - Filter to button logs
   - `API Call` - Find API-related logs
   - `Error` - Find error logs
   - `🎯` - Find click detection logs

### Clear Console

If console gets too crowded:
1. Right-click in console
2. Click "Clear console"
3. Or press `Ctrl + L`

---

## Browser-Specific Instructions

### Chrome

**To open Console:**
- Shortcut: `F12` or `Ctrl + Shift + J`
- Menu: ⋮ (top-right) → More Tools → Developer Tools → Console tab

**To save logs:**
- Right-click in console → "Save as"

### Firefox

**To open Console:**
- Shortcut: `F12` or `Ctrl + Shift + K`
- Menu: ☰ (top-right) → More → Developer Tools → Console tab

**To export:**
- Right-click in console → "Export visible messages to"

### Safari

**To open Console:**
- Shortcut: `Cmd + Option + I`
- Menu: Safari → Develop → Show JavaScript Console
- (If Develop menu doesn't exist, enable it in Preferences first)

### Edge

**To open Console:**
- Shortcut: `F12`
- Menu: ⋮ (top-right) → More Tools → Developer Tools → Console tab

---

## Real-Time Monitoring

### Keep Console Open While Testing

1. Open Developer Tools (F12)
2. Resize window so you can see both app and console
3. Click Stage button
4. Watch logs appear in real-time in console

**Example Layout:**
```
┌─────────────────────────────────────────┐
│  Your App (Left Side)                   │
│  [Stage Issue Button]                   │
│                                         │
├─────────────────────────────────────────┤
│  Developer Tools Console (Bottom)       │
│  🎯 [UnifiedStageButton] clicked...    │
│  [UnifiedStageButton] API Call...      │
│  ✅ [UnifiedStageButton] Success!      │
└─────────────────────────────────────────┘
```

---

## Network Tab (Related - Also Important)

In addition to Console logs, you should also check **Network tab** to see API requests:

1. Open Developer Tools (F12)
2. Click **"Network"** tab (not Console)
3. Click Stage button
4. Look for request named `staging/add`
5. Check status (200 = success, red = error)

---

## Troubleshooting: "I Don't See Any Logs"

If you click Stage button but see NO logs in console:

1. **Make sure Console tab is active** - Click "Console" tab at top
2. **Make sure page is loaded** - Refresh page (F5)
3. **Clear console** - Right-click → "Clear console"
4. **Click Stage button again** - Watch console immediately
5. **Check for errors** - Look for any red text in console

If STILL no logs:
- The onClick handler is not firing
- The button might not be using UnifiedStageButton
- Check parent component is rendering it correctly

---

## Advanced: Saving Console History

### Method 1: Browser DevTools Settings

Some browsers let you preserve console history across page refreshes:

**Chrome:**
1. F12 → Settings (⚙️) → Console
2. Check "Preserve log"

**Firefox:**
1. F12 → Settings (⚙️) → Console
2. Check "Persist logs"

**Edge:**
1. F12 → Settings (⚙️) → Debugger
2. Check "Preserve log upon navigation"

### Method 2: Copy Before Refresh

1. Select all console text (Ctrl+A)
2. Copy (Ctrl+C)
3. Paste into text editor
4. Save as file (console_log.txt)
5. Can now refresh page without losing logs

---

## Common Console Issues

### Issue 1: Console Text Too Small

**Solution:**
- Zoom in: `Ctrl +` (or `Cmd +` on Mac)
- Zoom out: `Ctrl -` (or `Cmd -` on Mac)
- Reset: `Ctrl 0` (or `Cmd 0` on Mac)

### Issue 2: Can't See Full Error Messages

**Solution:**
1. Click on the log message (it expands)
2. Or expand the object: click ▶ arrow next to object name

### Issue 3: Logs Disappearing When Page Refreshes

**Solution:**
1. Check "Preserve log" in Console settings
2. Or copy logs before refreshing

### Issue 4: Logs From Other Pages/Tabs

**Solution:**
1. Make sure you're in the right browser tab
2. Clear console between tests
3. Focus console on current page

---

## What Each Log Message Means

| Log | Meaning |
|-----|---------|
| `🎯 [UnifiedStageButton] Stage button clicked` | onClick fired ✓ |
| `[UnifiedStageButton] Passing guard conditions` | Guard check passed ✓ |
| `[UnifiedStageButton] Building staging metadata` | Metadata creation started |
| `[UnifiedStageButton] Metadata built successfully` | Metadata created ✓ |
| `[UnifiedStageButton] API Call Details` | Shows URL & payload being sent |
| `[UnifiedStageButton] API Response received` | Response arrived |
| `✅ [UnifiedStageButton] Staging completed` | Everything worked! ✓ |
| `❌ [UnifiedStageButton] Error during staging` | Something failed ✗ |
| `[UnifiedStageButton] Error stack` | Full error details |

---

## Final Checklist

Before reporting issues, gather console logs this way:

- [ ] Open DevTools (F12)
- [ ] Click Console tab
- [ ] Click Stage button
- [ ] Wait for logs to appear
- [ ] Select all logs (Ctrl+A)
- [ ] Copy (Ctrl+C)
- [ ] Paste into text document
- [ ] Share the logs

---

## Quick Reference: Keyboard Shortcuts

| Action | Windows | Mac |
|--------|---------|-----|
| Open DevTools | F12 | Cmd+Option+I |
| Open Console | Ctrl+Shift+J | Cmd+Option+J |
| Refresh page | F5 | Cmd+R |
| Clear console | Ctrl+L | (Right-click → Clear) |
| Select all | Ctrl+A | Cmd+A |
| Copy | Ctrl+C | Cmd+C |
| Zoom in | Ctrl++ | Cmd++ |
| Zoom out | Ctrl+- | Cmd+- |
| Reset zoom | Ctrl+0 | Cmd+0 |

---

## Summary

**Console logs are NOT in a file - they appear LIVE in your browser's Developer Tools Console tab (F12 → Console).**

To see them:
1. Open DevTools (F12)
2. Click Console tab
3. Click Stage button
4. Watch logs appear in real-time

To save them:
1. Select all (Ctrl+A)
2. Copy (Ctrl+C)
3. Paste into text editor
4. Save as file

---

**Status:** Ready to view console logs  
**Next Step:** Open DevTools and click Stage button to see logs
