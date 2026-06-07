// test-vertex.js
// Test script to verify Google Gen AI SDK connectivity and authentication
//
// Usage:
// 1. Set environment variables:
//    export GOOGLE_CLOUD_PROJECT=playstore-496016
//    export GOOGLE_CLOUD_LOCATION=us-central1
//
// 2. Set up authentication:
//    gcloud auth application-default login
//    OR
//    export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json
//
// 3. Run the test:
//    node test-vertex.js

const { GoogleGenAI } = require("@google/genai");

// Ensure these environment variables are set in your shell
const project = process.env.GOOGLE_CLOUD_PROJECT;
const location = process.env.GOOGLE_CLOUD_LOCATION || "us-central1";

// Validation
if (!project) {
  console.error("❌ Error: GOOGLE_CLOUD_PROJECT environment variable is not set.");
  console.error("");
  console.error("Please set it and try again:");
  console.error("  export GOOGLE_CLOUD_PROJECT=playstore-496016");
  console.error("  export GOOGLE_CLOUD_LOCATION=us-central1");
  console.error("  node test-vertex.js");
  process.exit(1);
}

console.log("🔍 Testing Google Gen AI (Gemini 2.0 Flash)...");
console.log(`   Project: ${project}`);
console.log(`   Location: ${location}`);
console.log(`   Model: gemini-2.0-flash`);
console.log("");

async function testNewSDK() {
  try {
    console.log("📡 Initializing Google Gen AI client...");

    // The client automatically picks up your gcloud auth credentials (ADC)
    const ai = new GoogleGenAI({
      vertexai: {
        project: project,
        location: location,
      },
    });

    console.log("✅ Google Gen AI client initialized");
    console.log("");

    console.log("📝 Sending test request to Gemini...");
    const startTime = Date.now();

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: "Hello! Are you working? Reply with 'Yes, I am ready!' in exactly one sentence.",
    });

    const duration = Date.now() - startTime;

    console.log("✅ Response received");
    console.log(`⏱️  Duration: ${duration}ms`);
    console.log("");

    // Extract response text
    const responseText = response.text;

    if (!responseText) {
      throw new Error("No text content in response");
    }

    // Display success
    console.log("🎉 SUCCESS! Response from Gemini:");
    console.log("");
    console.log("─".repeat(60));
    console.log(responseText);
    console.log("─".repeat(60));
    console.log("");

    console.log("📊 Response Details:");
    console.log(`   Characters: ${responseText.length}`);
    console.log(`   Lines: ${responseText.split("\n").length}`);
    console.log("");

    console.log("✨ Google Gen AI SDK is working correctly!");
    console.log("");
    console.log("Next steps:");
    console.log("1. Update your app/api/ai/generate-response/route.ts with @google/genai");
    console.log("2. Restart your Next.js dev server");
    console.log("3. Test the API endpoint with curl:");
    console.log("");
    console.log("   curl -X POST http://localhost:3000/api/ai/generate-response \\");
    console.log('     -H "Content-Type: application/json" \\');
    console.log("     -d '{");
    console.log('       "prompt": "Say hello",');
    console.log('       "workspaceId": "test",');
    console.log('       "itemId": "test",');
    console.log('       "tone": "professional",');
    console.log('       "language": "en"');
    console.log("     }'");
    console.log("");
  } catch (error) {
    console.error("❌ Error connecting to Google Gen AI:");
    console.error("");

    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
      console.error("");

      // Authentication errors
      if (
        error.message.includes("permission") ||
        error.message.includes("credential") ||
        error.message.includes("authentication") ||
        error.message.includes("UNAUTHENTICATED")
      ) {
        console.error("🔑 Authentication Issue:");
        console.error("   Make sure you have set up Application Default Credentials:");
        console.error("");
        console.error("   Option 1: gcloud CLI");
        console.error("   $ gcloud auth application-default login");
        console.error("");
        console.error("   Option 2: Service Account");
        console.error("   $ export GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json");
        console.error("");
      }

      // Project not found
      if (
        error.message.includes("NOT_FOUND") ||
        error.message.includes("not found") ||
        error.message.includes("project")
      ) {
        console.error("📍 Project Issue:");
        console.error(`   Project '${project}' not found or not accessible.`);
        console.error("");
        console.error("   Verify your project ID:");
        console.error("   $ gcloud config get-value project");
        console.error("");
      }

      // API not enabled
      if (
        error.message.includes("PERMISSION_DENIED") ||
        error.message.includes("not enabled") ||
        error.message.includes("API not enabled")
      ) {
        console.error("🔌 API Not Enabled:");
        console.error("   Vertex AI API may not be enabled in your GCP project.");
        console.error("");
        console.error("   Enable it:");
        console.error("   https://console.cloud.google.com/apis/library/aiplatform.googleapis.com");
        console.error("");
      }

      // Rate limiting
      if (error.message.includes("RESOURCE_EXHAUSTED")) {
        console.error("⚠️  Rate Limit Hit:");
        console.error("   Your quota has been exceeded. Try again in a moment.");
        console.error("");
      }

      if (error.stack) {
        console.error("Stack trace:");
        console.error(error.stack);
      }
    } else {
      console.error(error);
    }

    console.error("");
    console.error("📖 For more help, visit:");
    console.error("   https://ai.google.dev/");
    console.error("   https://cloud.google.com/docs/authentication");
    console.error("");

    process.exit(1);
  }
}

testNewSDK().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
