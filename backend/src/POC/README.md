# AI Analysis POC Tests

This folder contains tests to verify the AI Analysis functionality is working correctly.

## Prerequisites

1. **Environment Setup**: Make sure your `.env` file has the required variables:
   ```bash
   GEMINI_API_KEY=your_google_gemini_api_key_here
   MONGODB_URI=mongodb://localhost:27017/assignment-feedback  # Only for full test
   ```

2. **Google Gemini API Key**: Get your free API key from [Google AI Studio](https://makersuite.google.com/)

## Available Tests

### 1. Quick Test (Recommended)
**File**: `simple-test.ts`  
**Command**: `npm run test:ai` or `npm run poc`

This test runs **without database** and verifies:
- ✅ Gemini API connection
- ✅ AI Analysis Service functionality
- ✅ JSON response parsing
- ✅ Rate limiting and error handling

**Perfect for initial verification!**

### 2. Full Integration Test
**File**: `test-ai-analysis.ts`  
**Command**: `npm run test:ai-full`

This test requires database connection and verifies:
- ✅ Database operations
- ✅ Assignment creation workflow
- ✅ Full AI analysis pipeline
- ✅ Results storage and retrieval

## Running Tests

### Quick POC Test (No Database Required)
```bash
cd backend
npm run poc
```

### Full Integration Test (Database Required)
```bash
cd backend  
# Make sure MongoDB is running
npm run test:ai-full
```

## Expected Output

### Successful Quick Test Output:
```
⚡ Quick POC Test - No Database Required
=====================================

🔧 Testing Gemini API Connection Directly
=======================================

📝 Testing simple AI request...
✅ Gemini response received:
{
  "score": 85,
  "comment": "Simple and correct implementation"
}

🤖 Testing AI Analysis Service (Mocked)
=====================================

📦 Mock payload created
🚀 Sending analysis request to Gemini...
✅ Full AI Analysis Response:
📊 Parsed Analysis Results:
Overall Score: 82/100
Overall Grade: B
[...]

🏁 Test Results Summary:
========================
Gemini API Connection: ✅ Working
AI Analysis Service: ✅ Working

🎉 SUCCESS: AI Analysis POC is fully functional!
```

## Troubleshooting

### Common Issues:

1. **"GEMINI_API_KEY is not set"**
   - Add your API key to `.env`: `GEMINI_API_KEY=your_key_here`

2. **"Failed to connect to API"**
   - Check your internet connection
   - Verify your API key is valid
   - Check if you've exceeded rate limits

3. **"Database connection failed"** (Full test only)
   - Make sure MongoDB is running
   - Check your MONGODB_URI in `.env`

4. **"Rate limit exceeded"**
   - Wait a few minutes and try again
   - The free tier has limits: 15 requests/minute, 1500/day

## Sample Test Data

The tests use a realistic TypeScript calculator assignment with:
- ✅ Source code with proper TypeScript types
- ✅ Error handling (division by zero)
- ✅ Unit tests with Jest
- ✅ Package.json with dependencies
- ✅ TypeScript configuration

This simulates a real student submission for accurate AI analysis testing.

## Next Steps

Once these tests pass:
1. ✅ Your AI analysis is working
2. ✅ You can integrate with the upload system
3. ✅ Test with real ZIP file uploads
4. ✅ Set up the complete processing pipeline