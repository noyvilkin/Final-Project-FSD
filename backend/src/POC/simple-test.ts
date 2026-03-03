import "dotenv/config";

interface GeminiModel {
  name: string;
  displayName: string;
  supportedGenerationMethods?: string[];
}

interface ModelsResponse {
  models: GeminiModel[];
}

interface GeminiResponse {
  candidates?: Array<{
    content: {
      parts: Array<{ text: string }>;
    };
  }>;
}

console.log("🚀 Simple Gemini API Test");
console.log("=========================\n");

// Check environment variable
if (!process.env.GEMINI_API_KEY) {
  console.error("❌ GEMINI_API_KEY is not set in .env file");
  console.log("Add your Gemini API key to your .env file:");
  console.log("GEMINI_API_KEY=your_api_key_here");
  process.exit(1);
}

console.log("✅ GEMINI_API_KEY found in environment");
console.log(`Key starts with: ${process.env.GEMINI_API_KEY.substring(0, 10)}...`);

async function listAvailableModels() {
  const apiKey = process.env.GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

  try {
    console.log("📋 Checking available models...");
    const response = await fetch(url);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ Failed to list models:", errorText);
      return [];
    }

    const data = await response.json() as ModelsResponse;
    
    if (data.models) {
      console.log("✅ Available models:");
      data.models.forEach(model => {  
        console.log(`  - ${model.name} (${model.displayName})`);
      });
      
      // Find a suitable model for generateContent
      const generateContentModels = data.models.filter(model => 
        model.supportedGenerationMethods?.includes('generateContent')
      );
      
      if (generateContentModels.length > 0) {
        console.log("\n📝 Models that support generateContent:");
        generateContentModels.forEach(model => {
          console.log(`  - ${model.name}`);
        });
        return generateContentModels.map(m => m.name);
      }
    }
    
    return [];
  } catch (error) {
    console.error("💥 Error listing models:", error instanceof Error ? error.message : String(error));
    return [];
  }
}

async function testGeminiAPI() {
  const apiKey = process.env.GEMINI_API_KEY;
  
  // First, list available models
  const availableModels = await listAvailableModels();
  
  if (availableModels.length === 0) {
    console.error("❌ No suitable models found");
    return false;
  }
  
  // Use the first available model
  const modelName = availableModels[0];
  console.log(`\n🤖 Using model: ${modelName}`);
  
  const url = `https://generativelanguage.googleapis.com/v1beta/${modelName}:generateContent?key=${apiKey}`;

  const payload = {
    contents: [{
      parts: [{
        text: "Hello! Please respond with a simple JSON object: {\"status\": \"working\", \"message\": \"AI is functional\"}"
      }]
    }]
  };

  try {
    console.log("🌐 Making request to Gemini API...");
    console.log(`URL: ${url.replace(apiKey!, 'API_KEY_HIDDEN')}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });

    console.log(`📡 Response status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ API request failed:");
      console.error(errorText);
      return false;
    }

    const data = await response.json() as GeminiResponse;
    console.log("📦 Raw response:", JSON.stringify(data, null, 2));

    if (data.candidates && data.candidates[0]) {
      const content = data.candidates[0].content;
      const text = content.parts.map(p => p.text).join('');
      
      console.log("\n✅ AI Response received:");
      console.log(text);

      try {
        // Extract JSON from markdown code blocks if present
        const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/\{[\s\S]*\}/);
        const jsonText = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : text;
        
        const parsed = JSON.parse(jsonText.trim());
        console.log("\n🎉 SUCCESS: JSON response parsed:");
        console.log(`Status: ${parsed.status}`);
        console.log(`Message: ${parsed.message}`);
      } catch {
        console.log("\n✅ Response received and API is working (JSON parsing had minor issues, but that's normal)");
      }

      return true;
    } else {
      console.error("❌ No candidates in response");
      return false;
    }

  } catch (error) {
    console.error("💥 Fetch error:", error instanceof Error ? error.message : String(error));
    return false;
  }
}

testGeminiAPI()
  .then(success => {
    if (success) {
      console.log("\n🎉 POC Test PASSED! Your AI analysis setup is working.");
      console.log("You can now proceed with the full system integration.");
    } else {
      console.log("\n❌ POC Test FAILED. Check your API key and connection.");
    }
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error("Fatal error:", error.message);
    process.exit(1);
  });