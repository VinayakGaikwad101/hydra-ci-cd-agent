import { NextRequest } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { GoogleGenAI } from '@google/genai';
import { runCritic } from '@/lib/agents/critic';
import { runCoder } from '@/lib/agents/coder';
import { runSandbox } from '@/lib/agents/sandbox';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const scenario = searchParams.get('scenario');
  const repositoryId = searchParams.get('repositoryId');
  const stackTraceInput = searchParams.get('stackTrace') || '';
  const simulate = searchParams.get('simulate') === 'true';

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: string, data: any) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      let tempDir = '';
      let repoDbId = '';
      
      try {
        sendEvent('log', { message: '🚀 Pipeline initialized.' });

        // 1. Authenticate user session
        const session = await auth.api.getSession({
          headers: request.headers
        });

        if (!session || !session.user) {
          throw new Error('Unauthorized access. Please login first.');
        }

        const userId = session.user.id;
        sendEvent('log', { message: `👤 Session verified for developer: ${session.user.name}` });

        // 2. Fetch User Settings (Gemini API Key and Github PAT)
        const userSettings = await prisma.userSetting.findUnique({
          where: { userId }
        });

        const apiKey = userSettings?.geminiApiKey || process.env.GEMINI_API_KEY;
        const githubToken = userSettings?.githubToken;

        if (!apiKey && !simulate) {
          throw new Error('Missing GEMINI_API_KEY. Please provide an API key in settings or .env.local file to execute LLM patches.');
        }

        // 3. Establish Repository Details
        let repoUrl = '';
        let branch = 'main';
        let testCommand = 'npm test';
        let repoName = '';

        if (repositoryId) {
          // Custom repository from DB
          const dbRepo = await prisma.repository.findUnique({
            where: { id: repositoryId }
          });
          if (!dbRepo || dbRepo.userId !== userId) {
            throw new Error('Repository profile not found or permission denied.');
          }
          repoUrl = dbRepo.url;
          branch = dbRepo.branch;
          testCommand = dbRepo.testCommand;
          repoName = dbRepo.name;
          repoDbId = dbRepo.id;
          sendEvent('log', { message: `📁 Loaded saved repository: ${repoName}` });
        } else {
          // Preset scenarios
          const scenarioName = scenario || 'calculator';
          repoName = `Preset: ${scenarioName === 'calculator' ? 'Calculator' : 'Auth Service'}`;
          
          // Find or create virtual repository for preset to associate runs
          let dbRepo = await prisma.repository.findFirst({
            where: { userId, url: `preset-${scenarioName}` }
          });
          
          if (!dbRepo) {
            dbRepo = await prisma.repository.create({
              data: {
                userId,
                name: repoName,
                url: `preset-${scenarioName}`,
                branch: 'main',
                testCommand: 'node test.js'
              }
            });
          }
          
          repoDbId = dbRepo.id;
          testCommand = dbRepo.testCommand;
          sendEvent('log', { message: `📦 Loading preset scenario: ${scenarioName}...` });
        }

        // 4. Create Workspace Directory
        const workspacesRoot = path.join(process.cwd(), 'temp-workspaces');
        if (!fs.existsSync(workspacesRoot)) {
          fs.mkdirSync(workspacesRoot, { recursive: true });
        }
        
        tempDir = fs.mkdtempSync(path.join(workspacesRoot, 'agent-run-'));
        sendEvent('log', { message: `📁 Temporary workspace created at: ${path.basename(tempDir)}` });

        let originalContent = '';
        let targetFilePath = '';
        let relativeTargetFile = '';
        
        // 5. Clone/Copy Code base
        if (repositoryId) {
          // Clone repo url. Securely inject GitHub Token if present.
          let cloneUrl = repoUrl;
          if (githubToken && repoUrl.includes('github.com')) {
            cloneUrl = repoUrl.replace('https://github.com/', `https://${githubToken}@github.com/`);
            sendEvent('log', { message: '🔐 Injecting GitHub Token for secure private cloning...' });
          }
          
          sendEvent('log', { message: `🌐 Cloning repository: ${repoUrl} (branch: ${branch})...` });
          sendEvent('agent-start', { agent: 'critic', message: 'Cloning and analyzing git history...' });
          
          try {
            const simpleGit = require('simple-git');
            const git = simpleGit(tempDir);
            await git.clone(cloneUrl, '.');
            if (branch !== 'main') {
              await git.checkout(branch);
            }
            sendEvent('log', { message: '✓ Repository cloned successfully.' });
            
            // Auto install dependencies if package.json exists in cloned workspace
            if (fs.existsSync(path.join(tempDir, 'package.json'))) {
              sendEvent('log', { message: '📦 Installing repository dependencies (npm install)...' });
              try {
                const { execSync } = require('child_process');
                execSync('npm install --no-audit --no-fund', { 
                  cwd: tempDir, 
                  stdio: 'pipe',
                  env: { ...process.env, NODE_ENV: 'development' } 
                });
                sendEvent('log', { message: '✓ Dependencies installed successfully.' });
              } catch (installErr: any) {
                sendEvent('log', { message: `⚠ Warning: Dependency installation failed: ${installErr.message}` });
              }
            }
          } catch (gitErr: any) {
            const errMsg = gitErr.message || '';
            if (
              errMsg.includes('terminal prompts disabled') || 
              errMsg.includes('Authentication failed') || 
              errMsg.includes('could not read Username') ||
              errMsg.includes('Repository not found')
            ) {
              throw new Error(`Git clone failed: Authentication failed. This repository may be private or invalid. Please configure your GitHub Personal Access Token (PAT) in settings (⚙️).`);
            }
            throw new Error(`Git clone failed: ${errMsg}`);
          }
        } else {
          // Preset scenarios copy
          sendEvent('agent-start', { agent: 'critic', message: 'Loading files and establishing baseline...' });
          const scenarioName = scenario || 'calculator';
          const scenarioSrcDir = path.join(process.cwd(), 'scenarios', scenarioName);
          
          if (!fs.existsSync(scenarioSrcDir)) {
            throw new Error(`Scenario src "${scenarioName}" not found.`);
          }
          
          fs.readdirSync(scenarioSrcDir).forEach(file => {
            fs.copyFileSync(
              path.join(scenarioSrcDir, file),
              path.join(tempDir, file)
            );
          });
          sendEvent('log', { message: '✓ Preset files copied to workspace.' });
        }

        // 6. Obtain Stack Trace
        let stackTrace = stackTraceInput;
        if (!stackTrace) {
          sendEvent('log', { message: 'Running test suite to capture baseline failure logs...' });
          try {
            execSync(testCommand, {
              cwd: tempDir,
              encoding: 'utf-8',
              stdio: 'pipe',
              env: { ...process.env, NODE_ENV: 'test' }
            });
            sendEvent('log', { message: '✓ All tests passed initially. No healing required!' });
            
            // Save successful run to DB
            await prisma.analysisRun.create({
              data: {
                repositoryId: repoDbId,
                status: 'success',
                prMarkdown: '# No Healing Required\nThe test suite runs and passes cleanly without modifications.'
              }
            });

            sendEvent('complete', { 
              success: true, 
              message: 'Code is already healthy. No bugs found.',
              prMarkdown: '# No Healing Required\nThe test suite runs and passes cleanly without modifications.' 
            });
            controller.close();
            cleanupDirectory(tempDir);
            return;
          } catch (testErr: any) {
            stackTrace = testErr.stdout + '\n' + testErr.stderr;
            sendEvent('log', { message: '✓ Captured failing test trace.' });
          }
        }

        // 7. Run Critic Agent (Locate Bug)
        sendEvent('agent-progress', { agent: 'critic', log: 'Starting Critic Agent...\n' });
        const criticResult = await runCritic(stackTrace, tempDir, apiKey);
        sendEvent('agent-progress', { agent: 'critic', log: criticResult.logMessage });
        
        targetFilePath = criticResult.failingFile;
        relativeTargetFile = path.relative(tempDir, targetFilePath).replace(/\\/g, '/');
        originalContent = fs.readFileSync(targetFilePath, 'utf-8');

        sendEvent('agent-complete', { 
          agent: 'critic', 
          message: `Critic located bug in ${relativeTargetFile} at line ${criticResult.lineNumber}` 
        });

        // 8. Run Coder Agent (AST + Patch generation)
        sendEvent('agent-start', { agent: 'coder', message: 'Analyzing code structure & synthesizing patch...' });
        sendEvent('agent-progress', { agent: 'coder', log: 'Starting Coder Agent...\n' });
        
        const coderResult = await runCoder(
          targetFilePath,
          criticResult.lineNumber,
          criticResult.errorSummary,
          criticResult.gitHistory,
          tempDir,
          apiKey
        );
        
        sendEvent('agent-progress', { agent: 'coder', log: coderResult.logMessage });
        
        sendEvent('ast-data', {
          nodes: coderResult.astNodes,
          links: coderResult.astLinks,
          file: relativeTargetFile
        });
        
        sendEvent('agent-complete', {
          agent: 'coder',
          message: `Coder synthesized patch for ${relativeTargetFile}.`
        });

        // 9. Run Sandbox Agent (QA Sandbox container runs tests)
        sendEvent('agent-start', { agent: 'sandbox', message: 'Spinning up sandbox to run validation tests...' });
        sendEvent('agent-progress', { agent: 'sandbox', log: 'Starting QA Sandbox Agent...\n' });
        
        const sandboxResult = await runSandbox(
          tempDir,
          testCommand,
          targetFilePath,
          coderResult.targetContent,
          coderResult.replacementContent,
          simulate
        );
        
        sendEvent('agent-progress', { 
          agent: 'sandbox', 
          log: sandboxResult.logMessage + `\n--- Sandbox Test Logs ---\n${sandboxResult.testLogs}\n` 
        });

        if (!sandboxResult.success) {
          sendEvent('agent-complete', {
            agent: 'sandbox',
            success: false,
            message: 'Sandbox tests FAILED. Patch rejected.'
          });
          throw new Error('Sandbox tests did not pass with the synthesized patch.');
        }

        sendEvent('agent-complete', {
          agent: 'sandbox',
          success: true,
          message: 'Sandbox tests PASSED! Patch validated successfully.'
        });

        // 10. Generate PR & Diff
        sendEvent('log', { message: '📝 Patch verified! Generating pull request documentation...' });
        
        const patchedContent = fs.readFileSync(targetFilePath, 'utf-8');
        const diffData = computeLineDiff(originalContent, patchedContent, coderResult.targetContent, coderResult.replacementContent);

        let prMarkdown = '';
        if (apiKey) {
          try {
            const ai = new GoogleGenAI({ apiKey });
            const prPrompt = `
You are the Post-Mortem Documentation Agent.
Write a professional, detailed GitHub Pull Request description in markdown.
The patch has successfully resolved a failing test.

Context of fix:
- File Fixed: ${relativeTargetFile}
- Error fixed: ${criticResult.errorSummary}
- Explanation of fix: ${coderResult.explanation}

Provide:
1. **Title**: An appropriate PR title.
2. **Issue Summary**: A brief explanation of the bug and its root cause.
3. **Proposed Fix**: Detailed explanation of the fix and why it works.
4. **Validation**: Document that tests passed in the isolated Docker QA sandbox.
5. **Post-Mortem / Prevention**: What coding practices or checks could prevent this bug in the future.

Make the markdown clean, well-structured with sections, lists, and code blocks.
`;
            const response = await ai.models.generateContent({
              model: 'gemini-2.5-flash',
              contents: prPrompt
            });
            prMarkdown = response.text || '';
          } catch (e: any) {
            prMarkdown = `
# Fix: Resolve Bug in ${relativeTargetFile}

## Summary
The Critic agent identified a crash originating in \`${relativeTargetFile}\` with the summary: \`${criticResult.errorSummary}\`.

## Changes Applied
- Fixed the issue in \`${relativeTargetFile}\`.
- Details: ${coderResult.explanation}

## Verification
- Successfully ran tests inside an isolated sandbox environment.
- Test logs showed exit code 0.
`;
          }
        } else {
          prMarkdown = `
# Fix: Resolve Bug in ${relativeTargetFile}
Auto-generated patch successfully passed sandbox verification tests.
`;
        }

        // 11. Save Run History to Database
        await prisma.analysisRun.create({
          data: {
            repositoryId: repoDbId,
            status: 'success',
            errorLog: stackTrace,
            prMarkdown: prMarkdown,
            diffJson: JSON.stringify({ file: relativeTargetFile, diff: diffData })
          }
        });

        sendEvent('complete', {
          success: true,
          message: 'Agent pipeline completed successfully! PR opened (simulated).',
          prMarkdown,
          diff: diffData,
          file: relativeTargetFile
        });
        
        controller.close();
      } catch (err: any) {
        const cleanMsg = cleanErrorMessage(err);
        sendEvent('log', { message: `❌ Error in pipeline: ${cleanMsg}` });
        
        // Save failed run to database if repository was established
        if (repoDbId) {
          await prisma.analysisRun.create({
            data: {
              repositoryId: repoDbId,
              status: 'failed',
              errorLog: cleanMsg
            }
          });
        }

        sendEvent('error', { message: cleanMsg });
        controller.close();
      } finally {
        if (tempDir && fs.existsSync(tempDir)) {
          cleanupDirectory(tempDir);
        }
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}

// Helpers
function cleanupDirectory(dir: string) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (e) {}
}

function cleanErrorMessage(err: any): string {
  let msg = err?.message || String(err);
  try {
    const trimmed = msg.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      const parsed = JSON.parse(trimmed);
      if (parsed.error && parsed.error.message) {
        msg = parsed.error.message;
      }
    }
  } catch (e) {}
  
  if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('Quota exceeded') || msg.includes('429')) {
    return 'Gemini API Quota Exceeded: You have reached the Google AI Studio free tier limits. Please wait a minute and retry, or configure your own API Key in Settings.';
  }
  
  return msg;
}

interface DiffLine {
  type: 'added' | 'removed' | 'normal';
  content: string;
  lineNumber?: number;
}

function computeLineDiff(
  original: string,
  modified: string,
  target: string,
  replacement: string
): DiffLine[] {
  const origLines = original.split('\n');
  const modLines = modified.split('\n');
  
  const targetLines = target.split('\n');
  const replacementLines = replacement.split('\n');
  
  let targetIndex = -1;
  for (let i = 0; i <= origLines.length - targetLines.length; i++) {
    let match = true;
    for (let j = 0; j < targetLines.length; j++) {
      if (origLines[i + j].trim() !== targetLines[j].trim()) {
        match = false;
        break;
      }
    }
    if (match) {
      targetIndex = i;
      break;
    }
  }
  
  const diffLines: DiffLine[] = [];
  
  if (targetIndex === -1) {
    let maxLen = Math.max(origLines.length, modLines.length);
    for (let i = 0; i < maxLen; i++) {
      if (i < origLines.length && i < modLines.length) {
        if (origLines[i] === modLines[i]) {
          diffLines.push({ type: 'normal', content: origLines[i], lineNumber: i + 1 });
        } else {
          diffLines.push({ type: 'removed', content: origLines[i], lineNumber: i + 1 });
          diffLines.push({ type: 'added', content: modLines[i], lineNumber: i + 1 });
        }
      } else if (i < origLines.length) {
        diffLines.push({ type: 'removed', content: origLines[i], lineNumber: i + 1 });
      } else if (i < modLines.length) {
        diffLines.push({ type: 'added', content: modLines[i], lineNumber: i + 1 });
      }
    }
    return diffLines;
  }
  
  for (let i = 0; i < targetIndex; i++) {
    diffLines.push({ type: 'normal', content: origLines[i], lineNumber: i + 1 });
  }
  
  for (let i = 0; i < targetLines.length; i++) {
    diffLines.push({ type: 'removed', content: targetLines[i], lineNumber: targetIndex + i + 1 });
  }
  
  for (let i = 0; i < replacementLines.length; i++) {
    diffLines.push({ type: 'added', content: replacementLines[i], lineNumber: targetIndex + i + 1 });
  }
  
  for (let i = targetIndex + targetLines.length; i < origLines.length; i++) {
    const lineOffset = replacementLines.length - targetLines.length;
    diffLines.push({ type: 'normal', content: origLines[i], lineNumber: i + lineOffset + 1 });
  }
  
  return diffLines;
}
