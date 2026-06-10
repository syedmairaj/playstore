#!/bin/bash
# Audit script to find legacy AI SDK usage in the codebase
# This helps identify why you're still getting 429 errors

echo "🔍 LEGACY SDK AUDIT - Finding @google/generative-ai usage"
echo "==========================================================="
echo ""

FOUND_ISSUES=0

# Check 1: @google/generative-ai imports
echo "1️⃣ Searching for @google/generative-ai imports..."
if grep -r "@google/generative-ai" src/ 2>/dev/null | grep -v node_modules; then
    echo "   ❌ FOUND! Remove these imports."
    FOUND_ISSUES=$((FOUND_ISSUES + 1))
else
    echo "   ✅ Not found (good!)"
fi
echo ""

# Check 2: GoogleGenerativeAI usage
echo "2️⃣ Searching for GoogleGenerativeAI class instantiation..."
if grep -r "GoogleGenerativeAI" src/ 2>/dev/null | grep -v node_modules; then
    echo "   ❌ FOUND! Replace with getGenerativeModel()."
    FOUND_ISSUES=$((FOUND_ISSUES + 1))
else
    echo "   ✅ Not found (good!)"
fi
echo ""

# Check 3: API Key environment variables
echo "3️⃣ Searching for API key environment variables..."
if grep -rE "GEMINI_API_KEY|GOOGLE_API_KEY|GENERATIVE_AI_API_KEY" src/ 2>/dev/null | grep -v node_modules; then
    echo "   ❌ FOUND! These should not be in code."
    FOUND_ISSUES=$((FOUND_ISSUES + 1))
else
    echo "   ✅ Not found (good!)"
fi
echo ""

# Check 4: API key references in env files
echo "4️⃣ Checking .env files for API keys..."
if [ -f .env ] && grep -E "GEMINI_API_KEY|GOOGLE_API_KEY" .env; then
    echo "   ⚠️ FOUND! Remove these from .env"
    FOUND_ISSUES=$((FOUND_ISSUES + 1))
else
    echo "   ✅ Not found in .env (good!)"
fi

if [ -f .env.local ] && grep -E "GEMINI_API_KEY|GOOGLE_API_KEY" .env.local; then
    echo "   ⚠️ FOUND! Remove these from .env.local"
    FOUND_ISSUES=$((FOUND_ISSUES + 1))
else
    echo "   ✅ Not found in .env.local (good!)"
fi
echo ""

# Check 5: Multiple VertexAI instantiations
echo "5️⃣ Checking for multiple VertexAI client instantiations..."
VERTEX_COUNT=$(grep -r "new VertexAI" src/ 2>/dev/null | grep -v node_modules | wc -l)
if [ "$VERTEX_COUNT" -gt 1 ]; then
    echo "   ⚠️ Found $VERTEX_COUNT VertexAI instantiations (should be 1)"
    grep -rn "new VertexAI" src/ 2>/dev/null | grep -v node_modules
    FOUND_ISSUES=$((FOUND_ISSUES + 1))
elif [ "$VERTEX_COUNT" -eq 1 ]; then
    echo "   ✅ Found 1 VertexAI instantiation (correct)"
else
    echo "   ⚠️ No VertexAI instantiation found!"
    FOUND_ISSUES=$((FOUND_ISSUES + 1))
fi
echo ""

# Check 6: Package.json
echo "6️⃣ Checking package.json..."
if grep -q "@google/generative-ai" package.json 2>/dev/null; then
    echo "   ❌ FOUND! Run: npm uninstall @google/generative-ai"
    FOUND_ISSUES=$((FOUND_ISSUES + 1))
else
    echo "   ✅ Not in package.json (good!)"
fi

if ! grep -q "@google-cloud/vertexai" package.json 2>/dev/null; then
    echo "   ⚠️ @google-cloud/vertexai not found in package.json"
    echo "   Install with: npm install @google-cloud/vertexai"
    FOUND_ISSUES=$((FOUND_ISSUES + 1))
else
    echo "   ✅ @google-cloud/vertexai is installed (good!)"
fi
echo ""

# Check 7: Look for apiKey parameter usage
echo "7️⃣ Searching for apiKey parameter usage..."
if grep -r "apiKey:" src/ 2>/dev/null | grep -v node_modules | grep -v ".map"; then
    echo "   ⚠️ FOUND! Check if these are from legacy SDK"
    FOUND_ISSUES=$((FOUND_ISSUES + 1))
else
    echo "   ✅ Not found (good!)"
fi
echo ""

# Summary
echo "==========================================================="
echo "AUDIT SUMMARY"
echo "==========================================================="
if [ $FOUND_ISSUES -eq 0 ]; then
    echo "✅ No issues found! Your codebase is clean."
    echo ""
    echo "If you're still seeing 429 errors:"
    echo "1. Run validateVertexAISetup() to check endpoint"
    echo "2. Check production logs for actual request endpoints"
    echo "3. Verify GOOGLE_APPLICATION_CREDENTIALS is set correctly"
    echo "4. Check for client-side AI code in src/components/"
    exit 0
else
    echo "❌ Found $FOUND_ISSUES issue(s) to fix"
    echo ""
    echo "Next steps:"
    echo "1. Replace GoogleGenerativeAI with getGenerativeModel()"
    echo "2. Remove @google/generative-ai imports"
    echo "3. Remove API key environment variables"
    echo "4. Run this audit again to verify"
    exit 1
fi
