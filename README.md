# HYDRA: Autonomous Self-Healing CI/CD Developer Agent

HYDRA is a full-stack Next.js platform that operates directly within the software development lifecycle to fix broken builds and production bugs autonomously. Rather than writing isolated code snippets, it coordinates specialized AI agents (Critic, Coder, and Sandbox) to clone repositories, parse code structures via Abstract Syntax Trees (AST), patch bugs, verify the fixes in isolated runtimes (Docker/Subprocess), and log results persistently.

---

## 🏗️ End-to-End System Workflow

HYDRA operates as a multi-agent orchestration pipeline:

```
[Webhook / UI Trigger] 
       │
       ▼
[Cloning & Dependency Installs]
       │
       ▼
[Baseline Test Suite Run] ──(Passes)──► [Codebase Healthy (No-op)]
       │ (Fails)
       ▼
[Agent 1: The Critic] (Parses trace, locates file, pulls git history)
       │
       ▼
[Agent 2: The Coder] (AST structural parse, queries Gemini for patch)
       │
       ▼
[Agent 3: QA Sandbox] (Boots Docker/Subprocess container, applies patch, runs tests)
       │
  ┌────┴────┐
  ▼         ▼
(Pass)   (Fail)
  │         │
  ▼         ▼
[PR Synthesized & Neon DB Log]  [Report Failure & Save Log]
```

### 1. Webhook Trigger & Workspace Setup
* The process is triggered when a compiler/test run fails in a repository (or manually via the dashboard selector).
* The backend clones the repository branch to a secure, temporary workspace (`temp-workspaces/agent-run-XXXX`).
* If a `package.json` is detected, it automatically runs `npm install` to download node modules.
* If no stack trace was provided, it runs a baseline execution (`npm run build` or `npm test`) to capture stdout/stderr failure logs.

### 2. Agent 1: The Critic (Bug Localization)
* Parses the crash stack trace using regex and LLM prompting to pinpoint the exact failing source file and line.
* Pulls the recent git commit history for the targeted file to establish context (helping the coder understand what changed recently).

### 3. Agent 2: The Coder (AST & Patch Generation)
* Performs a structural **Abstract Syntax Tree (AST)** analysis on the failing file (supporting JS/TS and Python files).
* Generates an interactive visual node-and-link network map of classes, functions, and internal dependencies.
* Queries the Google Gemini API (`gemini-2.5-flash`) to generate a targeted search-and-replace code patch.

### 4. Agent 3: QA Sandbox (Verification Runtime)
* **Live Mode (Docker)**: The agent connects to the local Docker daemon socket (`dockerode`), checks and pulls the lightweight `node:18-alpine` runner image, creates an isolated container, mounts the workspace, runs the test command, and collects exit codes.
* **Subprocess Fallback**: If Docker is not running or unavailable (e.g. on serverless hosting like Vercel), it runs a local subprocess sandboxed environment on the host machine.
* **Simulation Mode**: Mocks the runtime execution logs for instant, web-only portfolio displays.
* If tests pass, it proceeds. If they fail, it rejects the patch and reports the failure.

### 5. PR Generation & DB Persistence
* Computes a side-by-side Git Diff of the code changes.
* Queries Gemini to synthesize a complete Markdown Pull Request documentation post-mortem (Issue Summary, Proposed Fix, Validation, and Prevention suggestions).
* Encrypts and writes run records, diffs, and settings persistently to the **Neon PostgreSQL database** via Prisma.
* Cleans up and permanently deletes the temporary workspace and Docker container.

---

## 📁 Directory Structure Explained

```
├── app/                        # Next.js App Router Pages & API routes
│   ├── api/
│   │   ├── agent-stream/       # SSE endpoint coordinating Critic, Coder, and Sandbox
│   │   ├── auth/               # Better-Auth authentication endpoints
│   │   ├── repositories/       # DB endpoints managing user repository profiles
│   │   └── user/               # User Settings API (Saves keys to DB)
│   ├── login/                  # Glassmorphic Login view (with password toggle)
│   ├── register/               # Registration page (with validation)
│   ├── globals.css             # Main styling, glow effects, custom scrollbars
│   ├── layout.tsx              # Font loading & layout wrapper
│   └── page.tsx                # Dashboard UI (Console, Diff Viewer, AST Graph)
├── lib/                        # Core Logic & Agents
│   ├── agents/
│   │   ├── critic.ts           # Locates crash file and pulls git history
│   │   ├── coder.ts            # Manages Gemini prompts & patch generation
│   │   └── sandbox.ts          # Orchestrates Dockerode containers & subprocess runs
│   ├── parser/
│   │   ├── parse_ast.py        # Python AST parser script (uses standard 'ast' module)
│   │   └── ast.ts              # TS wrapper coordinating AST parsing
│   ├── auth-client.ts          # Better-Auth client library configuration
│   ├── auth.ts                 # Better-Auth main initialization config
│   └── prisma.ts               # Prisma Client initialization instance
├── prisma/                     # Database Models (Neon Postgres)
│   └── schema.prisma           # SQLite/Postgres auth schema & analysis records
├── scenarios/                  # Preset Demos (packaged with codebase)
│   ├── auth/                   # Presets: Auth Service Bug (test.js & auth.js)
│   └── calculator/             # Presets: Calculator Bug (test.js & calculator.js)
├── temp-workspaces/            # Runtime directories for active workspace clones (git-ignored)
├── .env                        # Local database and secret environment credentials
├── .env.local                  # Local backup environment configurations
├── next.config.ts              # Next.js bundler config (externalizes simple-git & dockerode)
├── run.py                      # Master console bootlauncher script
└── package.json                # Project script commands and dependencies
```

---

## ⚙️ Local Setup Instructions

### 1. Prerequisites
Ensure you have the following installed on your machine:
* **Node.js** (v18 or higher)
* **Python 3.x**
* **Docker Desktop** (Running, if testing in **Live Mode**)
* **Neon PostgreSQL Database** (Create a free project at [neon.tech](https://neon.tech))
* **Gemini API Key** (Create a free API key at [Google AI Studio](https://aistudio.google.com/))

### 2. Configure Environment Variables
Create a `.env` and `.env.local` file at the root of the project:

```env
# 1. Neon PostgreSQL Connection String (Paste your connection URL here)
DATABASE_URL="postgresql://neondb_owner:YOUR_PASSWORD@your-neon-host.neon.tech/neondb?sslmode=require"

# 2. Better-Auth Secret (Use any random string)
BETTER_AUTH_SECRET="hF9kZ5mX3rW1vP7sN9qD4tY2uA8iC0oE1bV5xZ8j"

# 3. Better-Auth URL (Origin URL for authentication callbacks)
BETTER_AUTH_URL="http://localhost:3000"

# 4. Google Gemini API Key (Fallback key - optional since users can set it in UI settings)
GEMINI_API_KEY=""
```

### 3. Sync Database Tables
Push the Prisma schemas directly to your Neon Database instance:
```bash
npx prisma db push
```

### 4. Run the Dev Server
Launch the platform using the master launcher script (it will automatically open the dashboard in your default browser):
```bash
python run.py
```
*(Alternatively, you can run `npm run dev` directly in your terminal).*

---

## 🚀 Deployment Guide (Vercel)

Deploying the platform to Vercel requires moving the database to Neon Postgres and enabling Simulation Mode for web-only users.

### Step 1: Push Your Code to GitHub
Create a repository on GitHub, commit your code, and push it:
```bash
git init
git add .
git commit -m "feat: initial commit"
git remote add origin https://github.com/your-username/your-repo-name.git
git push -u origin main
```

### Step 2: Deploy to Vercel
1. Open the [Vercel Dashboard](https://vercel.com) and click **Add New Project**.
2. Select your pushed GitHub repository.
3. Configure the following **Environment Variables**:
   * `DATABASE_URL`: *Your production Neon connection URL*
   * `BETTER_AUTH_SECRET`: *A secure random string*
   * `BETTER_AUTH_URL`: *Your Vercel deployment URL (e.g. `https://your-app-name.vercel.app`)*
   * `GEMINI_API_KEY`: *Your fallback Gemini API Key (so first-time visitors can test instantly)*
4. Click **Deploy**. Vercel will build the Next.js bundle and set up endpoints dynamically.

### Step 3: Run the Live Production Site
1. Open your deployed Vercel URL.
2. Register a new workspace account.
3. Go to **Settings (⚙️)**.
4. Keep the environment toggled to **Simulation Mode** (this is mandatory on Vercel as serverless Lambdas cannot run a local Docker daemon).
5. Select **Preset: Calculator Bug** or **Preset: Auth Service Bug** and click **Trigger Webhook & Fix** to test!


repo at: https://github.com/VinayakGaikwad101/hydra-ci-cd-agent