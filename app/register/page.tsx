'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authClient } from '@/lib/auth-client';
import { Lock, Mail, User, Cpu, RefreshCw, AlertCircle, Eye, EyeOff } from 'lucide-react';

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [toastMessage, setToastMessage] = useState('');
  const router = useRouter();

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      setLoading(false);
      return;
    }

    try {
      const response = await authClient.signUp.email({
        email,
        password,
        name,
        callbackURL: '/'
      });

      if (response?.error) {
        setError(response.error.message || 'Failed to register account.');
      } else {
        triggerToast('Account registered successfully! Redirecting...');
        setTimeout(() => {
          router.push('/');
          router.refresh();
        }, 800);
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center px-4 py-12">
      {/* Background radial glow */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_40%,#0f172a_0%,#020617_75%)]" />

      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed top-6 right-6 z-50 bg-slate-900 border border-green-500/50 text-green-400 px-4 py-2.5 rounded-xl shadow-2xl text-xs font-semibold flex items-center gap-2 animate-pulse">
          <span className="h-2 w-2 rounded-full bg-green-500 animate-ping"></span>
          {toastMessage}
        </div>
      )}

      {/* Logo */}
      <div className="flex items-center gap-3 mb-8">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-magenta-500 flex items-center justify-center glow-cyan">
          <Cpu className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-cyan-400 to-pink-400 bg-clip-text text-transparent">
            HYDRA AGENT
          </h1>
          <p className="text-xs text-slate-400 font-mono">Self-Healing CI/CD Platform</p>
        </div>
      </div>

      {/* Glassmorphic Form Card */}
      <div className="glass-panel w-full max-w-md p-8 rounded-2xl border border-slate-800 shadow-2xl">
        <h2 className="text-xl font-bold mb-1 text-white">Create workspace</h2>
        <p className="text-xs text-slate-400 mb-6">Register a new profile to access the dashboard.</p>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-950/30 border border-red-900/50 flex gap-2.5 text-xs text-red-400 leading-normal">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              Full Name
            </label>
            <div className="relative">
              <User className="absolute left-3 top-2.5 h-4.5 w-4.5 text-slate-500" />
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ada Lovelace"
                className="w-full bg-slate-950/80 border border-slate-800 focus:border-cyan-500 rounded-lg py-2 pl-10 pr-3 text-sm text-slate-300 outline-none transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-2.5 h-4.5 w-4.5 text-slate-500" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="developer@hydra.ai"
                className="w-full bg-slate-950/80 border border-slate-800 focus:border-cyan-500 rounded-lg py-2 pl-10 pr-3 text-sm text-slate-300 outline-none transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-2.5 h-4.5 w-4.5 text-slate-500" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 8 characters"
                className="w-full bg-slate-950/80 border border-slate-800 focus:border-cyan-500 rounded-lg py-2 pl-10 pr-10 text-sm text-slate-300 outline-none transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300 transition-colors"
              >
                {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              Confirm Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-2.5 h-4.5 w-4.5 text-slate-500" />
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm password"
                className="w-full bg-slate-950/80 border border-slate-800 focus:border-cyan-500 rounded-lg py-2 pl-10 pr-10 text-sm text-slate-300 outline-none transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300 transition-colors"
              >
                {showConfirmPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 bg-gradient-to-r from-cyan-500 via-indigo-500 to-magenta-500 hover:brightness-110 active:scale-[0.98] text-white font-bold text-sm py-2.5 rounded-lg shadow-lg flex justify-center items-center gap-2 transition-all"
          >
            {loading ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Creating account...
              </>
            ) : (
              'Create Account'
            )}
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-slate-500">
          Already have an account?{' '}
          <Link href="/login" className="text-cyan-400 hover:underline">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
