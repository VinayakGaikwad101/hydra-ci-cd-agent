import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { GoogleGenAI } from '@google/genai';

interface CriticOutput {
  failingFile: string;
  lineNumber: number;
  errorSummary: string;
  gitHistory: string;
  logMessage: string;
}

export async function runCritic(
  stackTrace: string,
  workspacePath: string,
  apiKey: string | undefined
): Promise<CriticOutput> {
  let logMessage = "Critic Agent started parsing stack trace...\n";
  
  // 1. Parse using simple regex first
  let detectedFile = "";
  let detectedLine = 0;
  
  // Look for patterns like "at functionName (path/file.js:12:34)" or "at path/file.js:12:34"
  const regex = /(?:at\s+.*\((.*?):(\d+):(\d+)\)|at\s+(.*?):(\d+):(\d+))/g;
  let match;
  const filesFound: { path: string; line: number }[] = [];
  
  while ((match = regex.exec(stackTrace)) !== null) {
    const filePath = match[1] || match[4];
    const lineNum = parseInt(match[2] || match[5], 10);
    
    if (filePath && !filePath.includes('node_modules') && !filePath.includes('node:') && fs.existsSync(filePath)) {
      filesFound.push({ path: filePath, line: lineNum });
    }
  }
  
  if (filesFound.length > 0) {
    // We prefer the first non-test file, or just the first file in the stack trace
    const nonTestFile = filesFound.find(f => !path.basename(f.path).includes('test') && !path.basename(f.path).includes('spec'));
    const chosen = nonTestFile || filesFound[0];
    detectedFile = chosen.path;
    detectedLine = chosen.line;
    logMessage += `✓ Regex matched file in stack trace: ${path.basename(detectedFile)} at line ${detectedLine}\n`;
  }

  // 2. If regex fails or to verify and summarize, use Gemini
  let errorSummary = "Unknown test execution crash.";
  let gitHistory = "No git history available.";
  
  if (apiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      logMessage += "Consulting Gemini Critic model for smart stack trace analysis...\n";
      
      const prompt = `
You are the Critic/Analyzer Agent in an autonomous self-healing CI/CD pipeline.
Analyze this stack trace/error log and identify:
1. The exact name of the file where the bug originated (not the test framework files, but the source file).
2. The line number.
3. A concise 1-sentence summary of the root cause of the error.

Error Log:
"""
${stackTrace}
"""

List of files available in workspace (relative to workspace root):
${listFilesInDir(workspacePath).join('\n')}

Respond strictly with a JSON object in this format:
{
  "failingFile": "relative/path/to/file.js",
  "lineNumber": 15,
  "errorSummary": "Description of the bug"
}
`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json'
        }
      });
      
      const responseText = response.text;
      if (responseText) {
        const parsed = JSON.parse(responseText.trim());
        errorSummary = parsed.errorSummary;
        
        // If our regex didn't find a file, or as a double check, use LLM result
        const llmPath = path.isAbsolute(parsed.failingFile) 
          ? parsed.failingFile 
          : path.join(workspacePath, parsed.failingFile);
          
        if (fs.existsSync(llmPath)) {
          detectedFile = llmPath;
          detectedLine = parsed.lineNumber || detectedLine;
          logMessage += `✓ Gemini identified source file: ${parsed.failingFile} at line ${detectedLine}\n`;
        }
      }
    } catch (err: any) {
      logMessage += `⚠ Gemini stack trace analysis failed: ${err.message}. Falling back to regex result.\n`;
    }
  } else {
    logMessage += "⚠ GEMINI_API_KEY not found. Running stack trace analysis purely via regex rules.\n";
    errorSummary = stackTrace.split('\n')[0] || "Assertion or syntax crash in tests.";
  }

  if (!detectedFile) {
    // Final fallback: look for any JS/TS or PY files in the directory
    const files = listFilesInDir(workspacePath);
    const sourceFiles = files.filter(f => f.endsWith('.js') || f.endsWith('.ts') || f.endsWith('.py'));
    const firstSrc = sourceFiles.find(f => !f.includes('test') && !f.includes('spec'));
    if (firstSrc) {
      detectedFile = path.join(workspacePath, firstSrc);
      detectedLine = 1;
      logMessage += `⚠ Stack trace parsing could not resolve exact file. Defaulting to first source file: ${firstSrc}\n`;
    } else {
      throw new Error("Critic Agent failed: No source files found in workspace to analyze.");
    }
  }

  // 3. Pull historical git commits for that file
  try {
    const relativePath = path.relative(workspacePath, detectedFile);
    logMessage += `Retrieving git commit history for: ${relativePath}...\n`;
    const gitLog = execSync(`git log -n 5 --oneline -- "${detectedFile}"`, {
      cwd: workspacePath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'] // ignore stderr if not a git repository
    });
    gitHistory = gitLog || "No recent commits (empty git repository or not a git repository).";
    logMessage += `✓ Found ${gitHistory.split('\n').filter(Boolean).length} history commits.\n`;
  } catch (e) {
    gitHistory = "No git history (not a git repository or git command failed).";
    logMessage += "ℹ Git repository history not found, skipping git analysis.\n";
  }

  return {
    failingFile: detectedFile,
    lineNumber: detectedLine,
    errorSummary,
    gitHistory,
    logMessage
  };
}

// Helper to list all files in directory recursively (excluding node_modules and .git)
function listFilesInDir(dir: string, baseDir = dir): string[] {
  let results: string[] = [];
  if (!fs.existsSync(dir)) return [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const fullPath = path.join(dir, file);
    if (file === 'node_modules' || file === '.git' || file === '.next') return;
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(listFilesInDir(fullPath, baseDir));
    } else {
      results.push(path.relative(baseDir, fullPath).replace(/\\/g, '/'));
    }
  });
  return results;
}
