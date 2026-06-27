'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Play, Settings, Terminal as TerminalIcon, GitPullRequest, 
  CheckCircle2, XCircle, AlertTriangle, Code, GitBranch, 
  Database, RefreshCw, Layers, ShieldAlert, Cpu, Eye, EyeOff, Info,
  LogOut, Plus, Trash2, Calendar, FileText
} from 'lucide-react';
import { authClient } from '@/lib/auth-client';

interface ASTNode {
  name: string;
  type: 'function' | 'class' | 'variable';
  line: number;
  x?: number;
  y?: number;
}

interface ASTLink {
  caller: string;
  callee: string;
  line: number;
}

interface DiffLine {
  type: 'added' | 'removed' | 'normal';
  content: string;
  lineNumber?: number;
}

interface AgentState {
  status: 'idle' | 'running' | 'success' | 'failed';
  message: string;
}

interface AnalysisRun {
  id: string;
  status: string;
  errorLog: string | null;
  prMarkdown: string | null;
  diffJson: string | null;
  createdAt: string;
}

interface DBRepository {
  id: string;
  name: string;
  url: string;
  branch: string;
  testCommand: string;
  createdAt: string;
  runs: AnalysisRun[];
}

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

export default function Dashboard() {
  const { data: session, isPending } = authClient.useSession();
  const router = useRouter();

  // Toast System
  const [toasts, setToasts] = useState<Toast[]>([]);
  const addToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  // Settings & Keys (Database backend integration)
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [githubTokenInput, setGithubTokenInput] = useState('');
  const [dbHasGeminiKey, setDbHasGeminiKey] = useState(false);
  const [dbHasGithubToken, setDbHasGithubToken] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showGithubToken, setShowGithubToken] = useState(false);

  // Repository Management
  const [savedRepos, setSavedRepos] = useState<DBRepository[]>([]);
  const [selectedRepoId, setSelectedRepoId] = useState<string>('preset-calculator');
  
  // Custom Repo Addition form
  const [isAddRepoOpen, setIsAddRepoOpen] = useState(false);
  const [newRepoName, setNewRepoName] = useState('');
  const [newRepoUrl, setNewRepoUrl] = useState('');
  const [newRepoBranch, setNewRepoBranch] = useState('main');
  const [newRepoTestCmd, setNewRepoTestCmd] = useState('npm test');
  const [addRepoError, setAddRepoError] = useState('');

  // Delete confirmation dialog
  const [deleteRepoId, setDeleteRepoId] = useState<string | null>(null);

  // Active run config
  const [customStackTrace, setCustomStackTrace] = useState<string>('');
  const [isSimulate, setIsSimulate] = useState<boolean>(true);
  
  // Pipeline Run States
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'pr' | 'diff' | 'ast'>('pr');
  
  // AST Click interactivity
  const [selectedASTNode, setSelectedASTNode] = useState<ASTNode | null>(null);

  // Agents States
  const [criticAgent, setCriticAgent] = useState<AgentState>({ status: 'idle', message: 'Ready' });
  const [coderAgent, setCoderAgent] = useState<AgentState>({ status: 'idle', message: 'Ready' });
  const [sandboxAgent, setSandboxAgent] = useState<AgentState>({ status: 'idle', message: 'Ready' });

  // Outputs
  const [prMarkdown, setPrMarkdown] = useState<string>('');
  const [gitDiff, setGitDiff] = useState<DiffLine[]>([]);
  const [astNodes, setAstNodes] = useState<ASTNode[]>([]);
  const [astLinks, setAstLinks] = useState<ASTLink[]>([]);
  const [diffFile, setDiffFile] = useState<string>('');
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  const terminalContainerRef = useRef<HTMLDivElement>(null);

  // Authentication Redirect
  useEffect(() => {
    if (!isPending && !session) {
      router.push('/login');
    }
  }, [session, isPending, router]);

  // Load repositories and user settings
  useEffect(() => {
    if (session) {
      fetchRepositories();
      fetchUserSettings();
    }
  }, [session]);

  // Auto populate trace for presets
  useEffect(() => {
    if (selectedRepoId === 'preset-calculator') {
      setCustomStackTrace(`TEST SUITE FAILED:
AssertionError [ERR_ASSERTION]: Average of empty array should not be NaN (should return 0)
    at Object.<anonymous> (calculator/test.js:20:10)`);
    } else if (selectedRepoId === 'preset-auth') {
      setCustomStackTrace(`TEST SUITE FAILED:
TypeError: Cannot read properties of undefined (reading 'toString')
    at generateToken (auth/auth.js:15:26)`);
    } else {
      setCustomStackTrace('');
    }
    setSelectedASTNode(null);
  }, [selectedRepoId]);

  useEffect(() => {
    if (terminalContainerRef.current) {
      terminalContainerRef.current.scrollTop = terminalContainerRef.current.scrollHeight;
    }
  }, [terminalLogs]);

  // DB API Helpers
  const fetchRepositories = async () => {
    try {
      const res = await fetch('/api/repositories');
      if (res.ok) {
        const data = await res.json();
        setSavedRepos(data);
      }
    } catch (e) {}
  };

  const fetchUserSettings = async () => {
    try {
      const res = await fetch('/api/user/settings');
      if (res.ok) {
        const data = await res.json();
        setDbHasGeminiKey(data.hasGeminiKey);
        setDbHasGithubToken(data.hasGithubToken);
        setApiKeyInput(data.geminiApiKey);
        setGithubTokenInput(data.githubToken);
      }
    } catch (e) {}
  };

  const handleSaveSettings = async () => {
    try {
      const res = await fetch('/api/user/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          geminiApiKey: apiKeyInput,
          githubToken: githubTokenInput
        })
      });
      if (res.ok) {
        await fetchUserSettings();
        addToast('Settings saved successfully!');
        setIsSettingsOpen(false);
      } else {
        addToast('Failed to save settings.', 'error');
      }
    } catch (e) {
      addToast('Error saving settings.', 'error');
    }
  };

  const handleAddRepository = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddRepoError('');
    try {
      const res = await fetch('/api/repositories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newRepoName,
          url: newRepoUrl,
          branch: newRepoBranch,
          testCommand: newRepoTestCmd
        })
      });
      if (res.ok) {
        const repo = await res.json();
        await fetchRepositories();
        setSelectedRepoId(repo.id);
        addToast(`Repository "${newRepoName}" added!`);
        setIsAddRepoOpen(false);
        setNewRepoName('');
        setNewRepoUrl('');
        setNewRepoBranch('main');
        setNewRepoTestCmd('npm test');
      } else {
        const err = await res.json();
        setAddRepoError(err.error || 'Failed to save repository.');
      }
    } catch (e) {
      setAddRepoError('An unexpected connection error occurred.');
    }
  };

  const handleDeleteRepository = async (id: string) => {
    try {
      const res = await fetch(`/api/repositories?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchRepositories();
        addToast('Repository profile deleted successfully.');
        setSelectedRepoId('preset-calculator');
      } else {
        addToast('Failed to delete repository.', 'error');
      }
    } catch (e) {
      addToast('Error deleting repository.', 'error');
    }
  };

  const handleLoadPastRun = (run: AnalysisRun) => {
    setPrMarkdown(run.prMarkdown || 'No PR description saved.');
    
    if (run.diffJson) {
      try {
        const parsed = JSON.parse(run.diffJson);
        setGitDiff(parsed.diff || []);
        setDiffFile(parsed.file || 'unknown');
      } catch (e) {
        setGitDiff([]);
      }
    } else {
      setGitDiff([]);
    }
    
    if (run.errorLog) {
      setTerminalLogs([
        `[SYSTEM] Loaded historical analysis run executed at ${new Date(run.createdAt).toLocaleString()}`,
        `[SYSTEM] Baseline Error Log:`,
        ...run.errorLog.split('\n').map(l => `[BASELINE] ${l}`),
        `[SYSTEM] Analysis Status: ${run.status.toUpperCase()}`
      ]);
    }
    
    setAstNodes([]);
    setAstLinks([]);
    setSelectedASTNode(null);
    setActiveTab('pr');
    addToast('Loaded historical run data.');
  };

  const handleSignOut = async () => {
    addToast('Signing out...');
    await authClient.signOut();
    router.push('/login');
    router.refresh();
  };

  const handleTriggerPipeline = () => {
    if (isRunning) return;
    
    setIsRunning(true);
    setTerminalLogs(['[SYSTEM] Initializing self-healing agent run...']);
    setCriticAgent({ status: 'idle', message: 'Ready' });
    setCoderAgent({ status: 'idle', message: 'Ready' });
    setSandboxAgent({ status: 'idle', message: 'Ready' });
    setPrMarkdown('');
    setGitDiff([]);
    setAstNodes([]);
    setAstLinks([]);
    setSelectedASTNode(null);
    
    const params = new URLSearchParams();
    
    if (selectedRepoId.startsWith('preset-')) {
      const scenarioName = selectedRepoId.replace('preset-', '');
      params.append('scenario', scenarioName);
    } else {
      params.append('repositoryId', selectedRepoId);
    }
    
    if (customStackTrace) params.append('stackTrace', customStackTrace);
    params.append('simulate', isSimulate.toString());

    const eventSource = new EventSource(`/api/agent-stream?${params.toString()}`);
    
    eventSource.addEventListener('log', (event: any) => {
      const data = JSON.parse(event.data);
      setTerminalLogs(prev => [...prev, `[SYSTEM] ${data.message}`]);
    });

    eventSource.addEventListener('agent-start', (event: any) => {
      const data = JSON.parse(event.data);
      updateAgentStatus(data.agent, 'running', data.message);
    });

    eventSource.addEventListener('agent-progress', (event: any) => {
      const data = JSON.parse(event.data);
      const lines = data.log.split('\n').filter(Boolean);
      setTerminalLogs(prev => [...prev, ...lines.map((l: string) => `[${data.agent.toUpperCase()}] ${l}`)]);
    });

    eventSource.addEventListener('agent-complete', (event: any) => {
      const data = JSON.parse(event.data);
      updateAgentStatus(data.agent, data.success !== false ? 'success' : 'failed', data.message);
    });

    eventSource.addEventListener('ast-data', (event: any) => {
      const data = JSON.parse(event.data);
      const nodes = data.nodes.map((n: ASTNode, index: number) => {
        const angle = (index / data.nodes.length) * 2 * Math.PI;
        const radius = n.type === 'class' ? 30 : 100;
        return {
          ...n,
          x: 250 + radius * Math.cos(angle),
          y: 180 + radius * Math.sin(angle)
        };
      });
      setAstNodes(nodes);
      setAstLinks(data.links);
      setActiveTab('ast');
      addToast('AST parsed! Network tree generated.');
    });

    eventSource.addEventListener('complete', (event: any) => {
      const data = JSON.parse(event.data);
      setTerminalLogs(prev => [...prev, `[SYSTEM] Pipeline finished. PR generated successfully!`, `[SYSTEM] ${data.message}`]);
      setPrMarkdown(data.prMarkdown);
      if (data.diff) setGitDiff(data.diff);
      if (data.file) setDiffFile(data.file);
      setActiveTab('pr');
      setIsRunning(false);

      // Resolve any running agents to success status
      setCriticAgent(prev => prev.status === 'running' ? { status: 'success', message: 'Analysis complete.' } : prev);
      setCoderAgent(prev => prev.status === 'running' ? { status: 'success', message: 'Analysis complete.' } : prev);
      setSandboxAgent(prev => prev.status === 'running' ? { status: 'success', message: 'Analysis complete.' } : prev);

      eventSource.close();
      addToast('Pipeline completed! Codebase healed.');
      fetchRepositories();
    });

    eventSource.addEventListener('error', (event: any) => {
      let msg = 'Unknown connection error occurred.';
      try {
        const data = JSON.parse(event.data);
        msg = data.message;
      } catch (e) {}
      
      setTerminalLogs(prev => [...prev, `[ERROR] ${msg}`]);
      setIsRunning(false);
      
      // Update any active running agent to failed status
      setCriticAgent(prev => prev.status === 'running' ? { status: 'failed', message: msg } : prev);
      setCoderAgent(prev => prev.status === 'running' ? { status: 'failed', message: msg } : prev);
      setSandboxAgent(prev => prev.status === 'running' ? { status: 'failed', message: msg } : prev);

      eventSource.close();
      addToast('Pipeline failed: ' + msg, 'error');
      fetchRepositories();
    });
  };

  const updateAgentStatus = (agent: string, status: any, message: string) => {
    const state = { status, message };
    if (agent === 'critic') setCriticAgent(state);
    else if (agent === 'coder') setCoderAgent(state);
    else if (agent === 'sandbox') setSandboxAgent(state);
  };

  // Custom Inline Markdown Renderer (Bigger, more legible text)
  const renderMarkdown = (md: string) => {
    if (!md) return null;
    const lines = md.split('\n');
    let inCodeBlock = false;
    let codeLines: string[] = [];

    const parseInline = (text: string) => {
      const parts = [];
      const regex = /(\*\*.*?\*\*|`.*?`)/g;
      let match;
      let lastIdx = 0;

      while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIdx) {
          parts.push(text.slice(lastIdx, match.index));
        }
        const matched = match[0];
        if (matched.startsWith('**') && matched.endsWith('**')) {
          parts.push(<strong key={match.index} className="font-bold text-white text-sm md:text-base">{matched.slice(2, -2)}</strong>);
        } else if (matched.startsWith('`') && matched.endsWith('`')) {
          parts.push(<code key={match.index} className="bg-slate-900 px-1.5 py-0.5 rounded text-cyan-400 font-mono text-xs md:text-sm">{matched.slice(1, -1)}</code>);
        }
        lastIdx = regex.lastIndex;
      }
      if (lastIdx < text.length) {
        parts.push(text.slice(lastIdx));
      }
      return parts.length > 0 ? parts : text;
    };

    return lines.map((line, idx) => {
      if (line.startsWith('```')) {
        if (inCodeBlock) {
          inCodeBlock = false;
          const code = codeLines.join('\n');
          codeLines = [];
          return (
            <pre key={idx} className="bg-slate-950/90 border border-slate-800/80 p-3.5 rounded-lg text-xs md:text-sm font-mono overflow-x-auto text-slate-300 my-3">
              <code>{code}</code>
            </pre>
          );
        } else {
          inCodeBlock = true;
          return null;
        }
      }

      if (inCodeBlock) {
        codeLines.push(line);
        return null;
      }

      if (line.startsWith('# ')) {
        return <h1 key={idx} className="text-xl md:text-2xl font-bold text-white border-b border-slate-800 pb-2 mt-6 mb-3 font-sans">{line.replace('# ', '')}</h1>;
      }
      if (line.startsWith('## ')) {
        return (
          <div key={idx} className="mt-8 pt-5 border-t border-slate-800/80 first:border-t-0 first:mt-0 first:pt-0">
            <h2 className="text-base md:text-lg font-bold text-cyan-400 mb-3.5 font-sans tracking-wide uppercase">
              {line.replace('## ', '')}
            </h2>
          </div>
        );
      }
      if (line.startsWith('### ')) {
        return <h3 key={idx} className="text-sm md:text-base font-semibold text-white mt-4 mb-2 font-sans">{line.replace('### ', '')}</h3>;
      }

      if (line.startsWith('- ') || line.startsWith('* ')) {
        return (
          <li key={idx} className="ml-5 list-disc text-sm text-slate-300 leading-relaxed mb-1.5 font-sans">
            {parseInline(line.slice(2))}
          </li>
        );
      }

      const numMatch = line.match(/^(\d+)\.\s+(.*)/);
      if (numMatch) {
        return (
          <li key={idx} className="ml-5 list-decimal text-sm text-slate-300 leading-relaxed mb-1.5 font-sans">
            {parseInline(numMatch[2])}
          </li>
        );
      }

      if (line.trim() === '') return <div key={idx} className="h-2.5" />;
      return <p key={idx} className="text-sm text-slate-300 leading-relaxed my-2 font-sans">{parseInline(line)}</p>;
    });
  };

  if (isPending || !session) {
    return (
      <div className="min-h-screen flex justify-center items-center bg-[#020617]">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="h-8 w-8 animate-spin text-cyan-400" />
          <p className="text-sm font-mono text-slate-500">Checking auth token credentials...</p>
        </div>
      </div>
    );
  }

  const activeRepo = savedRepos.find(r => r.id === selectedRepoId);
  const repoRuns = activeRepo ? activeRepo.runs : [];

  return (
    <div className="min-h-screen pb-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      {/* Toast Notification Container */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 max-w-sm pointer-events-none">
        {toasts.map(t => (
          <div 
            key={t.id} 
            className={`pointer-events-auto p-4 rounded-xl border shadow-2xl text-sm font-semibold flex items-center gap-3 transition-all duration-300 translate-y-0 opacity-100 ${
              t.type === 'error' ? 'bg-red-950/80 border-red-500/50 text-red-400' :
              t.type === 'info' ? 'bg-slate-950/80 border-cyan-500/50 text-cyan-400' :
              'bg-slate-950/80 border-green-500/50 text-green-400'
            }`}
          >
            <span className={`h-2.5 w-2.5 rounded-full ${
              t.type === 'error' ? 'bg-red-500' : t.type === 'info' ? 'bg-cyan-500' : 'bg-green-500 animate-pulse'
            }`}></span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>

      {/* Navbar */}
      <header className="py-6 mb-8 border-b border-slate-800 flex flex-col sm:flex-row gap-4 justify-between sm:items-center">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-magenta-500 flex items-center justify-center glow-cyan">
            <Cpu className="h-6 w-6 text-white animate-pulse-slow" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              HYDRA AGENT
            </h1>
            <p className="text-xs text-slate-400 font-mono">Autonomous Self-Healing CI/CD Platform</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="text-right hidden sm:block font-sans">
            <p className="text-sm font-semibold text-slate-300">{session.user.name}</p>
            <p className="text-xs text-slate-500 font-mono">{session.user.email}</p>
          </div>

          <div className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-800 text-sm">
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isSimulate ? 'bg-amber-400' : 'bg-green-400'}`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${isSimulate ? 'bg-amber-500' : 'bg-green-500'}`}></span>
            </span>
            <span className="text-slate-300 font-semibold">
              {isSimulate ? 'Simulation Mode' : 'Live Mode (Docker)'}
            </span>
          </div>

          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
            title="API Credentials Settings"
          >
            <Settings className="h-5.5 w-5.5" />
          </button>

          <button 
            onClick={handleSignOut}
            className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-red-950/20 hover:border-red-900 text-slate-400 hover:text-red-400 transition-colors"
            title="Sign Out"
          >
            <LogOut className="h-5.5 w-5.5" />
          </button>
        </div>
      </header>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="glass-panel max-w-lg w-full p-6 rounded-2xl border border-slate-700 shadow-2xl">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-xl font-bold flex items-center gap-2 text-white">
                <Settings className="h-5.5 w-5.5 text-cyan-400" />
                SaaS Settings (Profile keys)
              </h3>
              <button onClick={() => setIsSettingsOpen(false)} className="text-slate-400 hover:text-white text-base">✕</button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-300 uppercase tracking-wider mb-1.5 flex justify-between">
                  <span>Google Gemini API Key</span>
                  <span className="text-xs font-mono text-cyan-400 lowercase font-normal">
                    {dbHasGeminiKey ? 'Saved' : 'Not Set'}
                  </span>
                </label>
                <div className="relative">
                  <input 
                    type={showApiKey ? 'text' : 'password'} 
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder={dbHasGeminiKey ? '••••••••••••••••' : 'Enter Gemini key, or leave blank to use server key'}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-lg py-2.5 pl-3 pr-10 text-sm md:text-base text-slate-300 outline-none transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-3 top-3 text-slate-500 hover:text-slate-300"
                  >
                    {showApiKey ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
                <p className="text-xs text-slate-500 mt-1.5 flex items-center gap-1 font-mono leading-relaxed">
                  <Info className="h-3.5 w-3.5 shrink-0" /> Enter your Gemini key, otherwise it will default to our server key. Your keys are stored safely.
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-300 uppercase tracking-wider mb-1.5 flex justify-between">
                  <span>GitHub Personal Access Token (PAT)</span>
                  <span className="text-xs font-mono text-cyan-400 lowercase font-normal">
                    {dbHasGithubToken ? 'Saved' : 'Not Set'}
                  </span>
                </label>
                <div className="relative">
                  <input 
                    type={showGithubToken ? 'text' : 'password'} 
                    value={githubTokenInput}
                    onChange={(e) => setGithubTokenInput(e.target.value)}
                    placeholder={dbHasGithubToken ? '••••••••••••••••' : 'Enter GitHub PAT'}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-lg py-2.5 pl-3 pr-10 text-sm md:text-base text-slate-300 outline-none transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowGithubToken(!showGithubToken)}
                    className="absolute right-3 top-3 text-slate-500 hover:text-slate-300"
                  >
                    {showGithubToken ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
                <p className="text-xs text-slate-500 mt-1.5 font-mono leading-relaxed">
                  Your keys are stored safely. Required only for cloning your **private** repositories.
                </p>
              </div>

              <div className="pt-2.5 border-t border-slate-800">
                <label className="block text-sm font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Execution Environment
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setIsSimulate(true)}
                    className={`py-2 px-3 rounded-lg border text-sm font-medium transition-all ${
                      isSimulate 
                        ? 'bg-amber-950/30 border-amber-500 text-amber-300 glow-cyan font-semibold' 
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    Simulation Mode
                  </button>
                  <button
                    onClick={() => setIsSimulate(false)}
                    className={`py-2 px-3 rounded-lg border text-sm font-medium transition-all ${
                      !isSimulate 
                        ? 'bg-green-950/30 border-green-500 text-green-300 glow-green font-semibold' 
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    Live Mode (Docker)
                  </button>
                </div>
                <p className="text-xs text-slate-500 mt-2.5 leading-relaxed">
                  <strong>Simulation Mode:</strong> Runs sandbox verification runs for fast web-only previews and serverless cloud environments (like Vercel). Works for any code logic.
                  <br />
                  <strong>Live Mode:</strong> Requires Docker Desktop/Engine running on the host machine. 
                  <em> (Note: If this site is currently hosted on a serverless provider like Vercel, Live Mode is unavailable on the web. You must run this codebase locally on your machine).</em>
                  <br />
                  <span className="mt-1.5 block text-slate-400">
                    <strong>Docker Management:</strong> Simply open Docker Desktop on your machine. The agent manages everything automatically. It pulls the lightweight test runner image once (which is cached and reused instantly for future runs), spins up a new isolated container for the codebase verification, and automatically destroys the container immediately after completion to keep your host system clean.
                  </span>
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button 
                onClick={handleSaveSettings}
                className="bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white font-semibold text-sm md:text-base py-2.5 px-5 rounded-lg shadow-lg transition-all"
              >
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Repository Modal */}
      {isAddRepoOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <form onSubmit={handleAddRepository} className="glass-panel max-w-md w-full p-6 rounded-2xl border border-slate-700 shadow-2xl space-y-4">
            <div className="flex justify-between items-start">
              <h3 className="text-lg font-bold flex items-center gap-2 text-white">
                <Plus className="h-5.5 w-5.5 text-cyan-400" />
                Add New Git Repository
              </h3>
              <button type="button" onClick={() => setIsAddRepoOpen(false)} className="text-slate-400 hover:text-white text-base">✕</button>
            </div>

            {addRepoError && (
              <div className="p-3 rounded-lg bg-red-950/30 border border-red-900/50 text-sm text-red-400 font-sans">
                {addRepoError}
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Profile Name
              </label>
              <input 
                type="text" 
                required
                value={newRepoName}
                onChange={(e) => setNewRepoName(e.target.value)}
                placeholder="My API Service"
                className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-lg py-2 px-3 text-sm md:text-base text-slate-300 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Git HTTPS Clone URL
              </label>
              <input 
                type="text" 
                required
                value={newRepoUrl}
                onChange={(e) => setNewRepoUrl(e.target.value)}
                placeholder="https://github.com/username/project.git"
                className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-lg py-2 px-3 text-sm md:text-base text-slate-300 outline-none font-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Target Branch
                </label>
                <input 
                  type="text" 
                  required
                  value={newRepoBranch}
                  onChange={(e) => setNewRepoBranch(e.target.value)}
                  placeholder="main"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-lg py-2 px-3 text-sm md:text-base text-slate-300 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Test Script Command
                </label>
                <input 
                  type="text" 
                  required
                  value={newRepoTestCmd}
                  onChange={(e) => setNewRepoTestCmd(e.target.value)}
                  placeholder="npm test"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-lg py-2 px-3 text-sm md:text-base text-slate-300 outline-none font-mono"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-4">
              <button 
                type="button" 
                onClick={() => setIsAddRepoOpen(false)}
                className="py-2 px-4 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-sm font-semibold text-slate-400"
              >
                Cancel
              </button>
              <button 
                type="submit"
                className="bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white font-semibold text-sm md:text-base py-2 px-4 rounded-lg shadow-lg"
              >
                Save Profile
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Confirmation Dialog */}
      {deleteRepoId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="glass-panel max-w-sm w-full p-6 rounded-2xl border border-slate-700 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-red-500 animate-pulse" />
              Confirm Deletion
            </h3>
            <p className="text-xs md:text-sm text-slate-400 leading-normal">
              Are you sure you want to delete this repository profile? This action will permanently remove all run history from the database.
            </p>
            <div className="flex justify-end gap-2.5 pt-2">
              <button 
                onClick={() => setDeleteRepoId(null)}
                className="py-1.5 px-3.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-xs font-semibold text-slate-400"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  handleDeleteRepository(deleteRepoId);
                  setDeleteRepoId(null);
                }}
                className="py-1.5 px-3.5 rounded-lg bg-red-950/40 border border-red-500/50 hover:bg-red-900 text-white text-xs font-semibold"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column - Config & Status */}
        <div className="lg:col-span-4 space-y-6 w-full">
          
          {/* Config Panel */}
          <div className="glass-panel p-5 rounded-2xl border border-slate-800">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm md:text-base font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <Database className="h-4 w-4 text-cyan-400" />
                Target Repositories
              </h3>
              <button 
                onClick={() => setIsAddRepoOpen(true)}
                className="flex items-center gap-1 text-[11px] uppercase font-bold font-mono tracking-wider text-cyan-400 hover:text-cyan-300 border border-cyan-900/60 rounded px-1.5 py-0.5 bg-cyan-950/20"
              >
                <Plus className="h-3.5 w-3.5" /> Add Repo
              </button>
            </div>

            {/* Selector */}
            <div className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Active Codebase Select
                </label>
                <div className="flex gap-2">
                  <select
                    value={selectedRepoId}
                    onChange={(e) => setSelectedRepoId(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-lg py-2 px-3 text-xs md:text-sm text-slate-300 outline-none"
                  >
                    <optgroup label="Preset Demos">
                      <option value="preset-calculator">Preset: Calculator Bug</option>
                      <option value="preset-auth">Preset: Auth Service Bug</option>
                    </optgroup>
                    {savedRepos.length > 0 && (
                      <optgroup label="Saved Repositories">
                        {savedRepos.map(repo => (
                          <option key={repo.id} value={repo.id}>{repo.name}</option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                  
                  {!selectedRepoId.startsWith('preset-') && (
                    <button 
                      onClick={() => setDeleteRepoId(selectedRepoId)}
                      className="p-2 bg-red-950/20 border border-red-900/60 rounded-lg text-red-400 hover:bg-red-900 hover:text-white transition-colors"
                      title="Delete profile"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Display repo url info */}
              {!selectedRepoId.startsWith('preset-') && activeRepo && (
                <div className="bg-slate-950/40 border border-slate-900 rounded-lg p-3 text-[11px] md:text-xs font-mono text-slate-400 space-y-1">
                  <p className="truncate"><span className="text-slate-500 font-sans">URL:</span> {activeRepo.url}</p>
                  <p><span className="text-slate-500 font-sans">Branch:</span> {activeRepo.branch}</p>
                  <p><span className="text-slate-500 font-sans">Test Command:</span> {activeRepo.testCommand}</p>
                </div>
              )}
            </div>

            {/* Error stacktrace input */}
            <div className="mt-4">
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                CI/CD Error Stacktrace / Fail Logs
              </label>
              <textarea 
                rows={5}
                value={customStackTrace}
                onChange={(e) => setCustomStackTrace(e.target.value)}
                placeholder="Paste compiler/test crash logs here... (If blank, we will run the tests first to capture logs)"
                className="w-full bg-slate-950 border border-slate-800/80 focus:border-cyan-500 rounded-lg py-2 px-3 text-xs md:text-sm text-slate-400 outline-none font-mono resize-none leading-relaxed"
              />
            </div>

            <button
              onClick={handleTriggerPipeline}
              disabled={isRunning}
              className="w-full mt-6 py-3 px-4 rounded-xl font-bold text-sm md:text-base tracking-wide flex justify-center items-center gap-2 transition-all bg-gradient-to-r from-cyan-500 via-indigo-500 to-magenta-500 text-white shadow-xl glow-cyan hover:brightness-110 active:scale-[0.98]"
            >
              {isRunning ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Healing Codebase...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 fill-current" />
                  Trigger Webhook & Fix
                </>
              )}
            </button>
          </div>

          {/* Repository Past Runs History (Neon DB) */}
          <div className="glass-panel p-5 rounded-2xl border border-slate-800">
            <h3 className="text-sm md:text-base font-bold uppercase tracking-wider text-slate-400 mb-3.5 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-green-400" />
              Analysis History (Runs)
            </h3>

            {repoRuns.length === 0 ? (
              <div className="text-xs font-sans text-slate-600 text-center py-6">
                No past runs documented for this repository. Trigger a fix to save runs.
              </div>
            ) : (
              <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                {repoRuns.map(run => (
                  <button
                    key={run.id}
                    onClick={() => handleLoadPastRun(run)}
                    className="w-full text-left p-2.5 rounded-lg border border-slate-900 bg-slate-950/20 hover:border-slate-800 hover:bg-slate-900/40 flex justify-between items-center transition-all font-mono text-[11px] md:text-xs"
                  >
                    <div className="space-y-0.5 truncate">
                      <p className="text-slate-300 font-semibold truncate flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                        Run: {run.id.slice(0, 8)}
                      </p>
                      <p className="text-[10px] text-slate-500">
                        {new Date(run.createdAt).toLocaleString()}
                      </p>
                    </div>
                    
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      run.status === 'success' ? 'bg-green-950/30 text-green-400 border border-green-900' : 'bg-red-950/30 text-red-400 border border-red-900'
                    }`}>
                      {run.status.toUpperCase()}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Agents Pipeline Monitor */}
          <div className="glass-panel p-5 rounded-2xl border border-slate-800">
            <h3 className="text-sm md:text-base font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-2">
              <Cpu className="h-4 w-4 text-magenta-400" />
              Agent Workspaces
            </h3>

            <div className="space-y-4">
              <div className={`p-3.5 rounded-xl border transition-all ${
                criticAgent.status === 'running' ? 'bg-cyan-950/20 border-cyan-500/50' : 
                criticAgent.status === 'success' ? 'bg-slate-900/60 border-slate-800' : 'bg-slate-950/40 border-slate-900'
              }`}>
                <div className="flex justify-between items-center mb-1 text-sm">
                  <span className="font-bold font-mono tracking-wider flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${
                      criticAgent.status === 'running' ? 'bg-cyan-400 animate-pulse' :
                      criticAgent.status === 'success' ? 'bg-green-500' : 
                      criticAgent.status === 'failed' ? 'bg-red-500' : 'bg-slate-700'
                    }`} />
                    AGENT 1: THE CRITIC
                  </span>
                  <span className="text-[11px] text-slate-500 font-mono capitalize">{criticAgent.status}</span>
                </div>
                <p className="text-xs md:text-sm text-slate-400 leading-normal">{criticAgent.message || 'Waiting to parse stack trace...'}</p>
              </div>

              <div className={`p-3.5 rounded-xl border transition-all ${
                coderAgent.status === 'running' ? 'bg-magenta-950/20 border-magenta-500/50' : 
                coderAgent.status === 'success' ? 'bg-slate-900/60 border-slate-800' : 'bg-slate-950/40 border-slate-900'
              }`}>
                <div className="flex justify-between items-center mb-1 text-sm">
                  <span className="font-bold font-mono tracking-wider flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${
                      coderAgent.status === 'running' ? 'bg-magenta-400 animate-pulse' :
                      coderAgent.status === 'success' ? 'bg-green-500' : 
                      coderAgent.status === 'failed' ? 'bg-red-500' : 'bg-slate-700'
                    }`} />
                    AGENT 2: THE CODER
                  </span>
                  <span className="text-[11px] text-slate-500 font-mono capitalize">{coderAgent.status}</span>
                </div>
                <p className="text-xs md:text-sm text-slate-400 leading-normal">{coderAgent.message || 'Waiting to write source patch...'}</p>
              </div>

              <div className={`p-3.5 rounded-xl border transition-all ${
                sandboxAgent.status === 'running' ? 'bg-amber-950/20 border-amber-500/50' : 
                sandboxAgent.status === 'success' ? 'bg-slate-900/60 border-slate-800' : 'bg-slate-950/40 border-slate-900'
              }`}>
                <div className="flex justify-between items-center mb-1 text-sm">
                  <span className="font-bold font-mono tracking-wider flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${
                      sandboxAgent.status === 'running' ? 'bg-amber-400 animate-pulse' :
                      sandboxAgent.status === 'success' ? 'bg-green-500' : 
                      sandboxAgent.status === 'failed' ? 'bg-red-500' : 'bg-slate-700'
                    }`} />
                    AGENT 3: QA SANDBOX
                  </span>
                  <span className="text-[11px] text-slate-500 font-mono capitalize">{sandboxAgent.status}</span>
                </div>
                <p className="text-xs md:text-sm text-slate-400 leading-normal">{sandboxAgent.message || 'Waiting to verify test results...'}</p>
              </div>
            </div>
          </div>

        </div>

        {/* Right Column - Terminal Console & Code Outputs */}
        <div className="lg:col-span-8 space-y-6 w-full">
          
          {/* Live Terminal Console */}
          <div className="glass-panel rounded-2xl border border-slate-800 overflow-hidden flex flex-col h-[340px] terminal-scanline">
            <div className="bg-slate-950 px-4 py-2 border-b border-slate-900 flex justify-between items-center">
              <span className="text-xs md:text-sm font-mono text-slate-400 flex items-center gap-2">
                <TerminalIcon className="h-4 w-4 text-cyan-400" />
                Live Agent Orchestration Console
              </span>
              <span className="text-[10px] bg-slate-900 text-slate-500 px-2 py-0.5 rounded border border-slate-800 font-mono">
                STDOUT/STDERR
              </span>
            </div>

            <div ref={terminalContainerRef} className="flex-1 bg-black/95 p-4 overflow-auto font-mono text-xs md:text-sm text-green-400 leading-relaxed">
              {terminalLogs.length === 0 ? (
                <div className="text-slate-600 italic">Waiting for pipeline trigger... click &apos;Trigger Webhook & Fix&apos; to launch.</div>
              ) : (
                <div className="space-y-1">
                  {terminalLogs.map((log, index) => {
                    let colorClass = 'text-slate-300';
                    if (log.startsWith('[ERROR]')) colorClass = 'text-red-400';
                    else if (log.startsWith('[SYSTEM]')) colorClass = 'text-cyan-400';
                    else if (log.startsWith('[CRITIC]')) colorClass = 'text-cyan-300';
                    else if (log.startsWith('[CODER]')) colorClass = 'text-magenta-300';
                    else if (log.startsWith('[SANDBOX]')) colorClass = 'text-amber-300';
                    
                    return (
                      <div key={index} className={`${colorClass} whitespace-nowrap`}>
                        {log}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Outputs Tab Area */}
          <div className="glass-panel rounded-2xl border border-slate-800 overflow-hidden min-h-[460px] flex flex-col">
            <div className="bg-slate-950 px-4 py-1.5 border-b border-slate-900 flex justify-between items-center">
              <div className="flex gap-2">
                <button
                  onClick={() => setActiveTab('pr')}
                  className={`py-2 px-3 border-b-2 text-xs md:text-sm font-semibold transition-all ${
                    activeTab === 'pr' ? 'border-cyan-500 text-white' : 'border-transparent text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <GitPullRequest className="h-3.5 w-3.5 inline mr-1" />
                  Generated Pull Request
                </button>
                <button
                  onClick={() => setActiveTab('diff')}
                  disabled={gitDiff.length === 0}
                  className={`py-2 px-3 border-b-2 text-xs md:text-sm font-semibold transition-all disabled:opacity-50 ${
                    activeTab === 'diff' ? 'border-cyan-500 text-white' : 'border-transparent text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <Code className="h-3.5 w-3.5 inline mr-1" />
                  Code Diff
                </button>
                <button
                  onClick={() => setActiveTab('ast')}
                  disabled={astNodes.length === 0}
                  className={`py-2 px-3 border-b-2 text-xs md:text-sm font-semibold transition-all disabled:opacity-50 ${
                    activeTab === 'ast' ? 'border-cyan-500 text-white' : 'border-transparent text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <Layers className="h-3.5 w-3.5 inline mr-1" />
                  AST Tree View
                </button>
              </div>
            </div>

            <div className="flex-1 p-6 overflow-auto bg-slate-950/40">
              {/* PR TAB */}
              {activeTab === 'pr' && (
                <div className="prose prose-invert max-w-none text-sm md:text-base text-slate-300 space-y-4">
                  {prMarkdown ? (
                    <div className="max-h-[480px] overflow-y-auto pr-container p-4 bg-slate-950/80 rounded-xl border border-slate-800/80 pr-2">
                      {renderMarkdown(prMarkdown)}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-16 text-slate-600 text-center font-sans">
                      <GitPullRequest className="h-10 w-10 mb-2 opacity-50" />
                      <p className="font-semibold text-sm">No Pull Request Generated Yet</p>
                      <p className="text-xs md:text-sm max-w-xs mt-1">Once the agents locate, patch, and verify the bug, the simulated PR will be displayed here.</p>
                    </div>
                  )}
                </div>
              )}

              {/* DIFF TAB */}
              {activeTab === 'diff' && (
                <div>
                  {gitDiff.length > 0 ? (
                    <div className="space-y-4">
                      <div className="flex justify-between items-center text-xs md:text-sm font-mono text-slate-500 border-b border-slate-900 pb-2">
                        <span>File: {diffFile}</span>
                        <span className="text-[10px] md:text-xs px-2 py-0.5 bg-green-950/30 text-green-400 border border-green-900 rounded font-semibold">Patched</span>
                      </div>
                      
                      <div className="font-mono text-xs md:text-sm rounded-xl border border-slate-900 overflow-hidden bg-slate-950 leading-relaxed max-h-[480px] overflow-y-auto">
                        {gitDiff.map((line, index) => {
                          let lineClass = 'text-slate-400 px-4 py-0.5 border-l-2 border-transparent';
                          let prefix = ' ';
                          if (line.type === 'added') {
                            lineClass = 'diff-added px-4 py-0.5 border-l-2 border-green-500';
                            prefix = '+';
                          } else if (line.type === 'removed') {
                            lineClass = 'diff-removed px-4 py-0.5 border-l-2 border-red-500';
                            prefix = '-';
                          }

                          return (
                            <div key={index} className={`${lineClass} flex`}>
                              <span className="w-10 select-none text-slate-700 text-right pr-3">{line.lineNumber || ''}</span>
                              <span className="w-4 select-none opacity-60">{prefix}</span>
                              <span className="whitespace-pre">{line.content}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-16 text-slate-600 text-center font-sans">
                      <Code className="h-10 w-10 mb-2 opacity-50" />
                      <p className="font-semibold text-sm text-slate-400">No Diff Available</p>
                    </div>
                  )}
                </div>
              )}

              {/* AST TAB */}
              {activeTab === 'ast' && (
                <div>
                  {astNodes.length > 0 ? (
                    <div className="space-y-4">
                      <p className="text-xs md:text-sm text-slate-400 font-sans">
                        Visualizing structural dependencies parsed directly via the Abstract Syntax Tree (AST) of the failing file:
                      </p>
                      
                      <div className="border border-slate-900 rounded-xl bg-slate-950 flex flex-col md:flex-row items-center justify-center p-4 overflow-hidden relative min-h-[380px]">
                        
                        {/* Interactive AST details panel */}
                        {selectedASTNode && (
                          <div className="absolute top-4 left-4 z-10 glass-panel p-4 rounded-xl border border-cyan-500/35 max-w-xs text-xs md:text-sm font-mono space-y-2.5 animate-fade-in bg-slate-950/90 shadow-2xl">
                            <div className="flex justify-between items-center border-b border-slate-800 pb-1.5">
                              <span className="text-cyan-400 font-bold">Node Details</span>
                              <button onClick={() => setSelectedASTNode(null)} className="text-slate-500 hover:text-white text-sm">✕</button>
                            </div>
                            <p className="text-slate-300 truncate"><span className="text-slate-500">Name:</span> {selectedASTNode.name}</p>
                            <p className="capitalize"><span className="text-slate-500">Type:</span> {selectedASTNode.type}</p>
                            <p><span className="text-slate-500">Line:</span> {selectedASTNode.line}</p>
                            <div className="text-[10px] md:text-xs text-slate-500 leading-normal border-t border-slate-900 pt-2">
                              Identified during compilation path. Used by the Coder Agent to inject targeted search-and-replace scopes.
                            </div>
                          </div>
                        )}

                        <svg className="w-full max-w-[500px] h-[360px]" viewBox="0 0 500 360">
                          {/* Links */}
                          {astLinks.map((link, i) => {
                            const sourceNode = astNodes.find(n => n.name === link.caller);
                            const targetNode = astNodes.find(n => n.name === link.callee);
                            if (!sourceNode || !targetNode || 
                                sourceNode.x === undefined || sourceNode.y === undefined || 
                                targetNode.x === undefined || targetNode.y === undefined) return null;
                            
                            return (
                              <g key={i}>
                                <path
                                  d={`M ${sourceNode.x} ${sourceNode.y} Q ${(sourceNode.x + targetNode.x)/2 + 20} ${(sourceNode.y + targetNode.y)/2 - 20} ${targetNode.x} ${targetNode.y}`}
                                  fill="none"
                                  stroke="rgba(217, 70, 239, 0.65)"
                                  strokeWidth="1.8"
                                  strokeDasharray="4 3"
                                  className="animate-pulse"
                                />
                                <text
                                  x={(sourceNode.x + targetNode.x) / 2 + 12}
                                  y={(sourceNode.y + targetNode.y) / 2 - 4}
                                  fill="rgba(217, 70, 239, 0.85)"
                                  fontSize="9"
                                  fontFamily="monospace"
                                >
                                  calls
                                </text>
                              </g>
                            );
                          })}

                          {/* Nodes */}
                          {astNodes.map((node, i) => {
                            if (node.x === undefined || node.y === undefined) return null;
                            const isSelected = selectedASTNode?.name === node.name;
                            return (
                              <g 
                                key={i} 
                                className="ast-node cursor-pointer group"
                                onClick={() => {
                                  setSelectedASTNode(node);
                                  addToast(`Selected node: ${node.name}`, 'info');
                                }}
                              >
                                <circle
                                  cx={node.x}
                                  cy={node.y}
                                  r={node.type === 'class' ? 14 : 9}
                                  fill={node.type === 'class' ? 'url(#classGrad)' : 'url(#funcGrad)'}
                                  stroke={isSelected ? '#f59e0b' : node.type === 'class' ? '#10b981' : '#06b6d4'}
                                  strokeWidth={isSelected ? '2.5' : '1.5'}
                                  className="transition-all duration-300 group-hover:stroke-amber-400 group-hover:stroke-[2.5px]"
                                />
                                <text
                                  x={node.x}
                                  y={node.y - 16}
                                  textAnchor="middle"
                                  fill={isSelected ? '#f59e0b' : '#f8fafc'}
                                  fontSize="10"
                                  fontFamily="monospace"
                                  className="font-semibold select-none"
                                >
                                  {node.name}
                                </text>
                                <text
                                  x={node.x}
                                  y={node.y + 22}
                                  textAnchor="middle"
                                  fill="rgba(255,255,255,0.4)"
                                  fontSize="8.5"
                                  fontFamily="monospace"
                                  className="select-none"
                                >
                                  Line {node.line}
                                </text>
                              </g>
                            );
                          })}

                          {/* Definitions */}
                          <defs>
                            <radialGradient id="classGrad">
                              <stop offset="0%" stopColor="#10b981" />
                              <stop offset="100%" stopColor="#065f46" />
                            </radialGradient>
                            <radialGradient id="funcGrad">
                              <stop offset="0%" stopColor="#06b6d4" />
                              <stop offset="100%" stopColor="#0891b2" />
                            </radialGradient>
                          </defs>
                        </svg>
                        
                        {/* Legend */}
                        <div className="absolute bottom-3 right-3 flex flex-wrap gap-3 bg-slate-900/80 px-3 py-1.5 rounded-lg border border-slate-800 text-[10px] md:text-xs font-mono">
                          <div className="flex items-center gap-1.5 text-green-400">
                            <span className="h-2 w-2 rounded-full bg-green-500"></span> Class
                          </div>
                          <div className="flex items-center gap-1.5 text-cyan-400">
                            <span className="h-2 w-2 rounded-full bg-cyan-500"></span> Method/Function
                          </div>
                          <div className="flex items-center gap-1.5 text-magenta-400">
                            <span className="h-2 w-2 rounded-full bg-magenta-500"></span> Dependency Call
                          </div>
                          <div className="text-slate-500 hidden md:block">
                            (Click node to inspect)
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-16 text-slate-600 text-center font-sans">
                      <Layers className="h-10 w-10 mb-2 opacity-50" />
                      <p className="font-semibold text-sm">No AST Report Generated</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
