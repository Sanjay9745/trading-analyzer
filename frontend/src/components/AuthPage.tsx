import { useState } from 'react';
import { Mail, Lock, Loader2, Sparkles, TrendingUp, KeyRound } from 'lucide-react';

interface AuthPageProps {
  apiBase: string;
  onLoginSuccess: (token: string, email: string) => void;
}

export function AuthPage({ apiBase, onLoginSuccess }: AuthPageProps) {
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!email || !password) {
      setError('Please fill in all fields.');
      return;
    }

    if (isRegistering && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      if (isRegistering) {
        // Register flow
        const res = await fetch(`${apiBase}/api/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json();
        if (res.ok) {
          setSuccessMsg('Registration successful! Please log in.');
          setIsRegistering(false);
          setPassword('');
          setConfirmPassword('');
        } else {
          setError(data.detail || 'Registration failed.');
        }
      } else {
        // Login flow
        const res = await fetch(`${apiBase}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json();
        if (res.ok) {
          onLoginSuccess(data.token, data.email);
        } else {
          setError(data.detail || 'Invalid email or password.');
        }
      }
    } catch (err) {
      console.error('Auth request error:', err);
      setError('Failed to connect to the authentication server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#07090e] bg-radial-grid flex items-center justify-center p-6 relative overflow-hidden">
      
      {/* Decorative neon background glows */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-tv-green/10 blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full bg-blue-500/10 blur-[120px] pointer-events-none"></div>

      <div className="w-full max-w-md relative z-10">
        
        {/* Branding header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center space-x-2.5 bg-gradient-to-r from-tv-green/15 to-blue-500/15 border border-tv-green/20 px-4 py-2 rounded-2xl mb-4">
            <TrendingUp className="w-5 h-5 text-tv-green animate-pulse" />
            <span className="text-xs font-black tracking-widest text-white uppercase">ANTIGRAVITY QUANT</span>
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight uppercase">
            Trading Platform
          </h1>
          <p className="text-sm text-tv-muted mt-2">
            Secure client terminal for pattern detection & portfolio analytics.
          </p>
        </div>

        {/* Auth Panel */}
        <div className="glass-panel p-8 rounded-2xl border border-tv-border/40 relative overflow-hidden shadow-2xl">
          {/* Subtle line decoration */}
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-tv-green/40 to-blue-500/40"></div>

          <h2 className="text-xl font-bold text-white mb-6 uppercase flex items-center space-x-2">
            <KeyRound className="w-5 h-5 text-tv-green" />
            <span>{isRegistering ? 'Create Account' : 'Secure Login'}</span>
          </h2>

          {error && (
            <div className="bg-tv-red/10 border border-tv-red/30 text-tv-red text-xs p-3 rounded-lg mb-6 leading-relaxed">
              {error}
            </div>
          )}

          {successMsg && (
            <div className="bg-tv-green/10 border border-tv-green/30 text-tv-green text-xs p-3 rounded-lg mb-6 leading-relaxed">
              {successMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            
            {/* Email input */}
            <div>
              <label className="block text-[10px] font-bold text-tv-muted uppercase tracking-wider mb-1.5">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-tv-muted" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full bg-[#0c0f16] border border-tv-border hover:border-tv-muted focus:border-tv-green rounded-lg pl-10 pr-4 py-3 text-xs text-white focus:outline-none transition-all placeholder-tv-muted/70"
                  required
                />
              </div>
            </div>

            {/* Password input */}
            <div>
              <label className="block text-[10px] font-bold text-tv-muted uppercase tracking-wider mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-tv-muted" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-[#0c0f16] border border-tv-border hover:border-tv-muted focus:border-tv-green rounded-lg pl-10 pr-4 py-3 text-xs text-white focus:outline-none transition-all placeholder-tv-muted/70"
                  required
                />
              </div>
            </div>

            {/* Confirm Password input (only when registering) */}
            {isRegistering && (
              <div>
                <label className="block text-[10px] font-bold text-tv-muted uppercase tracking-wider mb-1.5">Confirm Password</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-tv-muted" />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-[#0c0f16] border border-tv-border hover:border-tv-muted focus:border-tv-green rounded-lg pl-10 pr-4 py-3 text-xs text-white focus:outline-none transition-all placeholder-tv-muted/70"
                    required
                  />
                </div>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-tv-green hover:bg-tv-green/90 text-white font-bold py-3 px-4 rounded-lg text-xs uppercase tracking-wider transition-colors flex items-center justify-center space-x-2 mt-6 shadow-lg shadow-tv-green/10"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <span>{isRegistering ? 'Register Account' : 'Sign In'}</span>
              )}
            </button>

          </form>

          {/* Toggle Register/Login Link */}
          <div className="text-center mt-6 pt-6 border-t border-tv-border/20">
            <button
              onClick={() => {
                setIsRegistering(!isRegistering);
                setError(null);
                setSuccessMsg(null);
              }}
              className="text-xs text-tv-muted hover:text-white transition-colors"
            >
              {isRegistering
                ? 'Already have an account? Sign In'
                : "Don't have an account? Sign Up"}
            </button>
          </div>

        </div>

        {/* Security disclaimer footer */}
        <div className="mt-8 text-center flex items-center justify-center space-x-2 text-[10px] text-tv-muted uppercase font-bold tracking-wider">
          <Sparkles className="w-3.5 h-3.5 text-tv-green animate-pulse" />
          <span>Encrypted Session tokens persisted uniquely per device.</span>
        </div>

      </div>
    </div>
  );
}
