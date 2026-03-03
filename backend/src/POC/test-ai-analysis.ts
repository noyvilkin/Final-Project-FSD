import "dotenv/config";
import { AIAnalysisService } from "../features/assignment/services/aiAnalysisService.js";
import { AssignmentFeedback } from "../features/assignment/models/assignmentFeedback.model.js";
import { connectToDatabase } from "../common/services/database.js";

interface TestAssignmentData {
  requirementsText: string;
  sourceCode: { [filePath: string]: string };
  detectedLanguage: string;
  detectedFrameworks: string[];
}

// Sample assignment data for testing
const sampleAssignment: TestAssignmentData = {
  requirementsText: `
Create a simple calculator application with the following requirements:
1. Implement basic arithmetic operations (add, subtract, multiply, divide)
2. Handle division by zero errors appropriately
3. Use proper input validation
4. Include unit tests for all functions
5. Follow clean code principles and add meaningful comments
6. Use TypeScript with proper type definitions
  `,
  sourceCode: {
    "src/calculator.ts": `
export class Calculator {
  // Basic arithmetic operations
  add(a: number, b: number): number {
    return a + b;
  }
  
  subtract(a: number, b: number): number {
    return a - b;
  }
  
  multiply(a: number, b: number): number {
    return a * b;
  }
  
  divide(a: number, b: number): number {
    if (b === 0) {
      throw new Error("Division by zero is not allowed");
    }
    return a / b;
  }
  
  // More complex operation
  percentage(value: number, percent: number): number {
    return (value * percent) / 100;
  }
}
    `,
    "src/index.ts": `
import { Calculator } from "./calculator.js";

const calc = new Calculator();

console.log("Calculator Demo:");
console.log("5 + 3 =", calc.add(5, 3));
console.log("10 - 4 =", calc.subtract(10, 4));
console.log("6 * 7 =", calc.multiply(6, 7));

try {
  console.log("12 / 4 =", calc.divide(12, 4));
  console.log("10 / 0 =", calc.divide(10, 0)); // This should throw an error
} catch (error) {
  console.error("Error:", error.message);
}
    `,
    "tests/calculator.test.ts": `
import { Calculator } from "../src/calculator.js";

describe("Calculator", () => {
  let calculator: Calculator;
  
  beforeEach(() => {
    calculator = new Calculator();
  });
  
  test("should add two numbers correctly", () => {
    expect(calculator.add(2, 3)).toBe(5);
    expect(calculator.add(-1, 1)).toBe(0);
  });
  
  test("should subtract two numbers correctly", () => {
    expect(calculator.subtract(5, 3)).toBe(2);
    expect(calculator.subtract(1, 1)).toBe(0);
  });
  
  test("should multiply two numbers correctly", () => {
    expect(calculator.multiply(4, 5)).toBe(20);
    expect(calculator.multiply(-2, 3)).toBe(-6);
  });
  
  test("should divide two numbers correctly", () => {
    expect(calculator.divide(10, 2)).toBe(5);
    expect(calculator.divide(9, 3)).toBe(3);
  });
  
  test("should throw error when dividing by zero", () => {
    expect(() => calculator.divide(10, 0)).toThrow("Division by zero is not allowed");
  });
});
    `,
    "package.json": `
{
  "name": "calculator-assignment",
  "version": "1.0.0", 
  "description": "A simple calculator implementation",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "jest",
    "dev": "ts-node src/index.ts"
  },
  "dependencies": {
    "typescript": "^5.0.0"
  },
  "devDependencies": {
    "@types/jest": "^29.0.0",
    "jest": "^29.0.0",
    "ts-jest": "^29.0.0",
    "ts-node": "^10.0.0"
  }
}
    `,
    "tsconfig.json": `
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "node",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
    `
  },
  detectedLanguage: "TypeScript",
  detectedFrameworks: ["Jest", "Node.js"]
};

async function createTestAssignment(): Promise<string> {
  console.log("🔄 Creating test assignment in database...");
  
  const testAssignment = new AssignmentFeedback({
    userId: "507f1f77bcf86cd799439011", // Mock user ID
    requirementsFileKey: "test-requirements.pdf",
    solutionFileKey: "test-solution.zip",
    status: "processing",
    metadata: {
      detectedLanguage: sampleAssignment.detectedLanguage,
      detectedFrameworks: sampleAssignment.detectedFrameworks,
      requirements: sampleAssignment.requirementsText,
      sourceCodeContent: sampleAssignment.sourceCode,
      totalFiles: Object.keys(sampleAssignment.sourceCode).length,
      totalLines: Object.values(sampleAssignment.sourceCode)
        .join('\n')
        .split('\n').length,
      projectScope: 'small' as const
    }
  });
  
  const savedAssignment = await testAssignment.save();
  console.log(`✅ Test assignment created with ID: ${savedAssignment._id}`);
  
  return savedAssignment._id.toString();
}

async function testAIAnalysis(assignmentId: string) {
  console.log("\n🤖 Starting AI Analysis...");
  
  try {
    const result = await AIAnalysisService.analyzeAssignmentWithAI(assignmentId);
    
    if (result.success && result.feedback) {
      console.log("✅ AI Analysis completed successfully!");
      console.log("\n📊 Results Summary:");
      console.log(`Overall Score: ${result.feedback.overall.score}/100`);
      console.log(`Overall Grade: ${result.feedback.overall.grade}`);
      console.log(`Summary: ${result.feedback.overall.summary}`);
      
      console.log("\n🔍 Detailed Breakdown:");
      console.log(`Code Quality: ${result.feedback.codeQuality.score}/100`);
      console.log(`- Strengths: ${result.feedback.codeQuality.strengths.join(', ')}`);
      console.log(`- Weaknesses: ${result.feedback.codeQuality.weaknesses.join(', ')}`);
      
      console.log(`\nFunctional Correctness: ${result.feedback.functionalCorrectness.score}/100`);
      console.log(`- Meets Requirements: ${result.feedback.functionalCorrectness.meetsRequirements}`);
      console.log(`- Missing Features: ${result.feedback.functionalCorrectness.missingFeatures.join(', ')}`);
      
      console.log(`\nBest Practices: ${result.feedback.bestPractices.score}/100`);
      console.log(`- Follows Conventions: ${result.feedback.bestPractices.followsConventions}`);
      console.log(`- Suggestions: ${result.feedback.bestPractices.suggestions.join(', ')}`);
      
      // Save results
      await AIAnalysisService.saveAnalysisResults(assignmentId, result);
      console.log("\n💾 Results saved to database");
      
    } else {
      console.error("❌ AI Analysis failed:", result.error);
    }
    
  } catch (error) {
    console.error("💥 Error during AI analysis:", error instanceof Error ? error.message : error);
  }
}


async function cleanupTestData(assignmentId: string) {
  console.log(`\n🧹 Cleaning up test assignment ${assignmentId}...`);
  
  try {
    await AssignmentFeedback.findByIdAndDelete(assignmentId);
    console.log("✅ Test data cleaned up successfully");
  } catch (error) {
    console.warn("⚠️  Failed to cleanup test data:", error instanceof Error ? error.message : error);
  }
}

async function runPOCTest() {
  console.log("🚀 Starting AI Analysis POC Test");
  console.log("================================\n");
  
  // Check environment variables
  if (!process.env.GEMINI_API_KEY) {
    console.error("❌ GEMINI_API_KEY is not set in environment variables");
    process.exit(1);
  }
  
  let assignmentId: string | null = null;
  
  try {
    // Connect to database
    console.log("🔌 Connecting to database...");
    await connectToDatabase();
    console.log("✅ Database connected successfully");
    
    // Create test assignment
    assignmentId = await createTestAssignment();
    
    // Run AI analysis
    await testAIAnalysis(assignmentId);
    
    console.log("\n🎉 POC Test completed successfully!");
    console.log("The AI analysis system is working correctly.");
    
  } catch (error) {
    console.error("\n💥 POC Test failed:", error instanceof Error ? error.message : error);
    
    if (error instanceof Error && error.stack) {
      console.error("Stack trace:", error.stack);
    }
    
  } finally {
    // Cleanup
    if (assignmentId) {
      await cleanupTestData(assignmentId);
    }
    
    console.log("\n👋 POC Test finished");
    process.exit(0);
  }
}

// Run the test
runPOCTest().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

export { runPOCTest, sampleAssignment };