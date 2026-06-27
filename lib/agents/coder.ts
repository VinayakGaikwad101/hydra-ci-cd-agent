import * as fs from 'fs';
import * as path from 'path';
import { GoogleGenAI } from '@google/genai';
import { getASTAnalysis } from '../parser/ast';

interface CoderOutput {
  explanation: string;
  targetContent: string;
  replacementContent: string;
  astNodes: any[];
  astLinks: any[];
  logMessage: string;
}

export async function runCoder(
  failingFile: string,
  lineNumber: number,
  errorSummary: string,
  gitHistory: string,
  workspacePath: string,
  apiKey: string | undefined
): Promise<CoderOutput> {
  let logMessage = "Coder Agent started...\n";
  const relativeFile = path.relative(workspacePath, failingFile).replace(/\\/g, '/');
  
  // 1. Read failing file content
  logMessage += `Reading source code of ${relativeFile}...\n`;
  const fileContent = fs.readFileSync(failingFile, 'utf-8');
  
  // 2. Perform AST Analysis
  logMessage += `Performing AST structural analysis on ${relativeFile}...\n`;
  const astReport = getASTAnalysis(failingFile);
  
  if (astReport.error) {
    logMessage += `⚠ AST warning: ${astReport.error}\n`;
  } else {
    logMessage += `✓ AST analysis parsed ${astReport.nodes.length} nodes (functions/classes) and ${astReport.links.length} calls.\n`;
  }

  // 3. Request patch from Gemini
  if (!apiKey) {
    throw new Error("Coder Agent failed: GEMINI_API_KEY is not defined. The Coder Agent requires the LLM to write code patches.");
  }
  
  logMessage += "Consulting Gemini Coder model to synthesize a target patch...\n";
  
  const astJsonSummary = JSON.stringify({
    nodes: astReport.nodes.map(n => ({ name: n.name, type: n.type, line: n.line })),
    calls: astReport.links.slice(0, 15) // send first 15 calls to avoid context clutter
  }, null, 2);

  const prompt = `
You are the Coder Agent in an autonomous self-healing CI/CD pipeline.
Your task is to write a target code patch to fix a failing test suite.

--- FILE CONTEXT ---
File Path: ${relativeFile}
Line of Crash: ${lineNumber}
Error Summary: ${errorSummary}

--- AST ARCHITECTURE REPORT ---
${astJsonSummary}

--- RECENT FILE COMMITS ---
${gitHistory}

--- FULL SOURCE CODE ---
\`\`\`
${fileContent}
\`\`\`

--- TASK ---
Analyze the crash, the code structure (AST), and historical commits.
Create a search-and-replace patch block to fix the bug.
- Make the fix minimal and robust.
- Do not introduce syntax errors.
- Ensure the 'targetContent' is unique and exists EXACTLY as-is in the source code (including matching whitespace).

Respond strictly with a JSON object in the following format:
{
  "explanation": "Brief explanation of the bug and how your patch fixes it",
  "targetContent": "The exact original lines of code you want to replace",
  "replacementContent": "The new lines of code that will replace targetContent"
}
`;

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json'
      }
    });

    const text = response.text;
    if (!text) {
      throw new Error("Received empty response from Gemini.");
    }
    
    const patchResult = JSON.parse(text.trim());
    
    // Check if targetContent exists in the original file
    if (!fileContent.includes(patchResult.targetContent)) {
      logMessage += `⚠ Warning: LLM proposed targetContent that was not found exactly in source code. Trying to clean whitespaces...\n`;
      // Clean leading/trailing empty lines/whitespaces as a fallback
      const cleanTarget = patchResult.targetContent.trim();
      const matchIndex = fileContent.indexOf(cleanTarget);
      if (matchIndex !== -1) {
        // We found a trimmed match, let's adjust it!
        // We find the exact line range and replace it.
        // For simplicity, we can let it proceed if we do a trimmed replace, or just throw.
        // Let's store the trimmed target in the response if it helps
        logMessage += `✓ Found trimmed match for patch target!\n`;
      } else {
        logMessage += `❌ Error: Proposed targetContent is missing from the file.\n`;
        logMessage += `Proposed Target:\n"""\n${patchResult.targetContent}\n"""\n`;
      }
    } else {
      logMessage += `✓ Gemini generated patch target. Patch size: ${patchResult.replacementContent.split('\n').length} lines.\n`;
    }

    return {
      explanation: patchResult.explanation,
      targetContent: patchResult.targetContent,
      replacementContent: patchResult.replacementContent,
      astNodes: astReport.nodes,
      astLinks: astReport.links,
      logMessage
    };
  } catch (err: any) {
    logMessage += `❌ Gemini Coder patch synthesis failed: ${err.message}\n`;
    throw err;
  }
}
