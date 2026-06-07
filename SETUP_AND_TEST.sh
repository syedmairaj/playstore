#!/bin/bash

# Setup and Test Script for Google Gen AI SDK
#
# This script sets up your environment and tests the Google Gen AI SDK
#
# Usage:
# bash SETUP_AND_TEST.sh
#
# OR manually:
# export GOOGLE_CLOUD_PROJECT=playstore-496016
# export GOOGLE_CLOUD_LOCATION=us-central1
# gcloud auth application-default login
# node test-vertex.js

echo "🔧 Setting up Google Gen AI SDK..."
echo ""

# Set environment variables
export GOOGLE_CLOUD_PROJECT=playstore-496016
export GOOGLE_CLOUD_LOCATION=us-central1

echo "✅ Environment Variables Set:"
echo "   GOOGLE_CLOUD_PROJECT=$GOOGLE_CLOUD_PROJECT"
echo "   GOOGLE_CLOUD_LOCATION=$GOOGLE_CLOUD_LOCATION"
echo ""

# Check if credentials are already set up
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" > /dev/null 2>&1; then
  echo "⚠️  No active gcloud credentials found."
  echo ""
  echo "🔑 Setting up authentication..."
  echo "   This will open a browser to authenticate with Google Cloud."
  echo ""
  gcloud auth application-default login
  echo ""
fi

# Verify authentication
echo "✅ Verifying authentication..."
if gcloud auth application-default print-access-token > /dev/null 2>&1; then
  echo "✅ Authentication successful!"
  echo ""
else
  echo "❌ Authentication failed!"
  exit 1
fi

# Run the test
echo "🧪 Running test script..."
echo ""
node test-vertex.js
