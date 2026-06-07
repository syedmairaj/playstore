# Vertex AI SDK Setup - Next Steps

**Status:** ✅ SDK Installed Successfully  
**Next Step:** Configure Environment & Authenticate

---

## ✅ What's Done

```
✅ @google-cloud/vertexai SDK installed (116 packages)
✅ test-vertex.js ready to run
✅ API endpoint refactored
```

## ⚠️ What's Needed

You need to provide:
1. Your GCP Project ID
2. GCP Region (default: us-central1)
3. Authentication credentials

---

## Step 1: Get Your GCP Project ID

Go to [GCP Console](https://console.cloud.google.com):

1. Click the project selector at the top
2. Look for your project name
3. Copy the **Project ID** (not the project name)

Example: `my-project-abc123`

---

## Step 2: Set Environment Variables

Run these commands in your terminal:

```bash
# Replace with YOUR actual project ID
export GOOGLE_CLOUD_PROJECT=your-project-id-here
export GOOGLE_CLOUD_REGION=us-central1
```

**Verify they're set:**
```bash
echo $GOOGLE_CLOUD_PROJECT
echo $GOOGLE_CLOUD_REGION
```

---

## Step 3: Authenticate with Google Cloud

Choose **ONE** option:

### Option A: Local Development (Recommended)

```bash
# This opens a browser to authenticate
gcloud auth application-default login

# Then select your account and project
# Credentials are saved automatically
```

### Option B: Using Service Account (if you have a JSON key)

```bash
# If you have a service account key file:
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json
```

### Option C: Cloud Run (No Setup Needed)

If deploying to Cloud Run:
- Cloud Run automatically attaches a service account
- No environment variable needed
- Just ensure the service account has "Vertex AI Compute Admin" role

---

## Step 4: Test Your Setup

```bash
# From the playstore directory
node test-vertex.js
```

**Expected output:**
```
🔍 Testing Vertex AI Gemini 2.0 Flash...
   Project: your-project-id
   Region: us-central1
   Model: gemini-2.0-flash

📡 Initializing Vertex AI client...
✅ Vertex AI client initialized

🤖 Getting generative model...
✅ Generative model retrieved

📝 Sending test request to Gemini...
✅ Response received
⏱️  Duration: 1234ms

🎉 SUCCESS! Response from Gemini:

────────────────────────────────────
Yes, I am ready!
────────────────────────────────────

✨ Vertex AI SDK is working correctly!
```

---

## Troubleshooting

### Error: "GOOGLE_CLOUD_PROJECT not set"

```bash
# Check if it's set
echo $GOOGLE_CLOUD_PROJECT

# If empty, set it
export GOOGLE_CLOUD_PROJECT=your-project-id

# Try again
node test-vertex.js
```

### Error: "Authentication failed"

```bash
# Re-authenticate
gcloud auth application-default login

# Check credentials are set
gcloud auth list

# Print access token (should work)
gcloud auth application-default print-access-token
```

### Error: "Permission denied"

Go to [GCP Console - IAM](https://console.cloud.google.com/iam-admin):

1. Find your user or service account
2. Click the pencil icon to edit
3. Add role: **Vertex AI Service User** OR **Vertex AI Compute Admin**
4. Save

Wait 1-2 minutes for permissions to propagate, then try again.

### Error: "Project not found"

```bash
# Verify correct project ID
gcloud config get-value project

# List your projects
gcloud projects list

# Set the correct one
gcloud config set project YOUR_CORRECT_PROJECT_ID
```

### Error: "Vertex AI API not enabled"

Go to [APIs & Services](https://console.cloud.google.com/apis/library):

1. Search: "Vertex AI API"
2. Click it
3. Click "Enable"
4. Wait 1-2 minutes
5. Try again

---

## Quick Copy-Paste Setup

Replace `your-project-id` with your actual project ID from GCP Console:

```bash
# Set environment
export GOOGLE_CLOUD_PROJECT=your-project-id
export GOOGLE_CLOUD_REGION=us-central1

# Authenticate
gcloud auth application-default login

# Test
cd /path/to/playstore
node test-vertex.js
```

---

## Once Test Passes ✅

1. Your API endpoint is ready
2. No more setup needed
3. Your React app will work without changes
4. Start your dev server: `npm run dev`

---

## Need Help?

### Check Your Setup

```bash
# Is npm working?
npm --version

# Is gcloud working?
gcloud --version

# Are credentials set?
gcloud auth list

# Is Vertex AI SDK installed?
npm list @google-cloud/vertexai
```

### Common Issues

| Issue | Solution |
|-------|----------|
| "Module not found" | Run `npm install @google-cloud/vertexai` |
| "Project not found" | Check `echo $GOOGLE_CLOUD_PROJECT` matches GCP Console |
| "Permission denied" | Add "Vertex AI Compute Admin" role in IAM |
| "API not enabled" | Enable it in GCP Console → APIs & Services |
| "Credentials expired" | Run `gcloud auth application-default login` again |

---

## Important Files

- ✅ `test-vertex.js` - Test script (run this first)
- ✅ `app/api/ai/generate-response/route.ts` - Your refactored endpoint
- ✅ Documentation in `VERTEXAI_SDK_MIGRATION_GUIDE.md`

---

## Next: Testing Your API

Once `node test-vertex.js` passes:

```bash
# Start dev server
npm run dev

# In another terminal, test the API
curl -X POST http://localhost:3000/api/ai/generate-response \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Say hello",
    "workspaceId": "test",
    "itemId": "test-1",
    "tone": "professional",
    "language": "en"
  }'

# Should return:
# { "response": "Hello! How can I help you?", "characterCount": 28, ... }
```

---

**You're almost there! 🎯 Set your environment variables and run `node test-vertex.js`**
