import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Code2, Mail, Lock, User, Sparkles, ArrowLeft, ShieldCheck, Github, Loader2, CheckCircle2, RefreshCw, KeyRound } from 'lucide-react';
import { UserProfile } from '@shared/types';
import { safeFetch } from '../api';

const GoogleIcon = ({ className = "h-5 w-5" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24">
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
    />
  </svg>
);

interface AuthPageProps {
  onBack: () => void;
  onAuthSuccess: (user: UserProfile) => void;
  initialMode?: 'login' | 'signup';
}

export default function AuthPage({ onBack, onAuthSuccess, initialMode = 'login' }: AuthPageProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [isForgot, setIsForgot] = useState(false);
  const [resetTokenVal, setResetTokenVal] = useState<string | null>(null);

  // Verification & reset processing states
  const [verifying, setVerifying] = useState(false);
  const [resendingEmail, setResendingEmail] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);

  useEffect(() => {
    setIsLogin(initialMode === 'signup' ? false : true);
  }, [initialMode]);
  
  // Fields
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<'google' | 'github' | null>(null);
  const [successMsg, setSuccessMsg] = useState('');

  // Guard against duplicate authentication callbacks
  const hasLoggedInRef = React.useRef(false);

  // Check URL query params for verifyToken or resetToken on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const verifyToken = params.get('verifyToken');
    const resetToken = params.get('resetToken');

    if (verifyToken) {
      setVerifying(true);
      setError('');
      setSuccessMsg('');
      
      safeFetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: verifyToken })
      })
        .then(async (res) => {
          const data = await res.json();
          if (res.ok) {
            setSuccessMsg(data.message || 'Email verified successfully! Logging you into CodeSyne...');
            setIsLogin(true);
            setIsForgot(false);
            if (data.user && data.token) {
              if (data.token) {
                localStorage.setItem('ide_jwt_token', data.token);
              }
              localStorage.setItem('ide_session_user', JSON.stringify(data.user));
              const emailKey = (data.user.email || data.user.username || data.user.id || 'user').toLowerCase();
              localStorage.setItem(`ide_custom_user_${emailKey}`, JSON.stringify(data.user));
              setTimeout(() => {
                onAuthSuccess(data.user);
              }, 600);
            }
          } else {
            setError(data.error || 'Invalid or expired verification token.');
          }
        })
        .catch((err) => {
          setError(err.message || 'Failed to verify email. Please check your connection.');
        })
        .finally(() => {
          setVerifying(false);
          // Clean token from URL
          window.history.replaceState({}, document.title, window.location.pathname);
        });
    } else if (resetToken) {
      setResetTokenVal(resetToken);
      setIsForgot(false);
      setIsLogin(false);
      // Clean token from URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // Poll for account verification when waiting for verification email (e.g. user verifies in another tab or on mobile)
  useEffect(() => {
    if (!unverifiedEmail) return;

    let isMounted = true;
    const interval = setInterval(async () => {
      try {
        const res = await safeFetch(`/api/auth/check-status?email=${encodeURIComponent(unverifiedEmail)}`);
        if (!res.ok || !isMounted) return;
        const data = await res.json();
        if (data.verified && data.user) {
          if (data.token) {
            localStorage.setItem('ide_jwt_token', data.token);
          }
          localStorage.setItem('ide_session_user', JSON.stringify(data.user));
          const emailKey = (data.user.email || data.user.username || data.user.id || 'user').toLowerCase();
          localStorage.setItem(`ide_custom_user_${emailKey}`, JSON.stringify(data.user));
          setSuccessMsg('Account verified! Welcome to CodeSyne.');
          setUnverifiedEmail(null);
          setTimeout(() => {
            onAuthSuccess(data.user);
          }, 500);
        }
      } catch (e) {
        // Silent poll error
      }
    }, 3000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [unverifiedEmail]);

  // OAuth popup, BroadcastChannel, focus, and storage event listeners
  useEffect(() => {
    const handleLogin = (authUser: any, token?: string) => {
      if (!authUser || hasLoggedInRef.current) return;
      hasLoggedInRef.current = true;
      setSocialLoading(null);
      if (token) {
        localStorage.setItem('ide_jwt_token', token);
      }
      localStorage.setItem('ide_session_user', JSON.stringify(authUser));
      const emailKey = (authUser.email || authUser.username || authUser.id || 'user').toLowerCase();
      localStorage.setItem(`ide_custom_user_${emailKey}`, JSON.stringify(authUser));
      onAuthSuccess(authUser);
    };

    const checkExistingSession = (): boolean => {
      if (hasLoggedInRef.current) return true;
      const session = localStorage.getItem('ide_session_user');
      if (session) {
        try {
          const uObj = JSON.parse(session);
          if (uObj && (uObj.email || uObj.username || uObj.id)) {
            handleLogin(uObj);
            return true;
          }
        } catch {}
      }
      return false;
    };

    const handleOAuthMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS' && event.data?.user) {
        handleLogin(event.data.user, event.data.token);
      }
    };

    let bc: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        bc = new BroadcastChannel('codesyne_oauth_channel');
        bc.onmessage = (event) => {
          if (event.data?.type === 'OAUTH_AUTH_SUCCESS' && event.data?.user) {
            handleLogin(event.data.user, event.data.token);
          }
        };
      }
    } catch (e) {
      console.warn('BroadcastChannel listener error:', e);
    }

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'ide_session_user' || e.key === 'codesyne_oauth_signal') {
        checkExistingSession();
      }
    };

    const handleFocusOrVisibility = () => {
      const hasSession = checkExistingSession();
      if (!hasSession) {
        setSocialLoading(null);
      }
    };

    const handlePageShow = () => {
      const hasSession = checkExistingSession();
      if (!hasSession) {
        setSocialLoading(null);
      }
    };

    window.addEventListener('message', handleOAuthMessage);
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('focus', handleFocusOrVisibility);
    window.addEventListener('pageshow', handlePageShow);
    document.addEventListener('visibilitychange', handleFocusOrVisibility);

    return () => {
      window.removeEventListener('message', handleOAuthMessage);
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('focus', handleFocusOrVisibility);
      window.removeEventListener('pageshow', handlePageShow);
      document.removeEventListener('visibilitychange', handleFocusOrVisibility);
      if (bc) bc.close();
    };
  }, [onAuthSuccess]);

  const handleSocialLogin = async (provider: 'google' | 'github') => {
    if (socialLoading) return;

    const targetEmail = email ? email.trim() : '';
    const targetUsername = username ? username.trim() : '';

    setSocialLoading(provider);
    setError('');

    const safetyTimer = setTimeout(() => {
      setSocialLoading(prev => prev === provider ? null : prev);
    }, 45000);

    try {
      const currentOrigin = encodeURIComponent(window.location.origin);
      const redirectUri = encodeURIComponent(window.location.origin + '/api/auth/callback');
      const emailParam = targetEmail ? `&email=${encodeURIComponent(targetEmail)}` : '';
      const usernameParam = targetUsername ? `&username=${encodeURIComponent(targetUsername)}` : '';
      const response = await safeFetch(`/api/auth/${provider}/url?redirect_uri=${redirectUri}&frontend_origin=${currentOrigin}${emailParam}${usernameParam}`);
      const data = await response.json();

      if (data.url) {
        window.location.href = data.url;
        return;
      } else if (data.demoUser) {
        clearTimeout(safetyTimer);
        if (data.token) {
          localStorage.setItem('ide_jwt_token', data.token);
        }
        localStorage.setItem('ide_session_user', JSON.stringify(data.demoUser));
        const demoEmail = (data.demoUser.email || data.demoUser.username || 'user').toLowerCase();
        localStorage.setItem(`ide_custom_user_${demoEmail}`, JSON.stringify(data.demoUser));
        setSocialLoading(null);
        onAuthSuccess(data.demoUser);
      } else {
        clearTimeout(safetyTimer);
        setSocialLoading(null);
      }
    } catch (err: any) {
      clearTimeout(safetyTimer);
      console.error(`[${provider} OAuth Error]`, err);
      setError(err.message || `Failed to initiate ${provider} login. Backend might be starting up, please try again.`);
      setSocialLoading(null);
    }
  };

  const handleResendVerification = async (targetEmail: string) => {
    if (resendingEmail) return;
    setResendingEmail(true);
    setError('');
    setSuccessMsg('');

    try {
      const response = await safeFetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: targetEmail })
      });
      const data = await response.json();

      if (response.ok) {
        setSuccessMsg(data.message || 'Verification email sent! Please check your inbox.');
      } else {
        setError(data.error || 'Failed to resend verification email.');
      }
    } catch (err: any) {
      setError(err.message || 'Error connecting to server.');
    } finally {
      setResendingEmail(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setUnverifiedEmail(null);

    // 1. Password Reset Flow (via Token from Email)
    if (resetTokenVal) {
      if (!password || password.length < 5) {
        setError('New password must contain at least 5 characters.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match. Please enter matching passwords.');
        return;
      }

      setLoading(true);
      try {
        const response = await safeFetch('/api/auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: resetTokenVal, newPassword: password })
        });
        const data = await response.json();

        if (response.ok) {
          setSuccessMsg(data.message || 'Password reset successfully! You can now log in.');
          setResetTokenVal(null);
          setIsLogin(true);
          setPassword('');
          setConfirmPassword('');
        } else {
          setError(data.error || 'Failed to reset password. Token may be expired.');
        }
      } catch (err: any) {
        setError(err.message || 'Failed to connect to backend server.');
      } finally {
        setLoading(false);
      }
      return;
    }

    // 2. Forgot Password Request Flow
    if (isForgot) {
      if (!email) {
        setError('Please enter your email address to request password recovery.');
        return;
      }
      setLoading(true);
      try {
        const cleanEmail = email.trim().toLowerCase();
        const response = await safeFetch('/api/auth/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: cleanEmail })
        });
        const data = await response.json();

        if (response.ok) {
          setSuccessMsg(data.message || 'Password reset instructions have been sent to your email.');
        } else {
          setError(data.error || 'Failed to request password reset.');
        }
      } catch (err: any) {
        setError(err.message || 'Failed to submit password recovery request.');
      } finally {
        setLoading(false);
      }
      return;
    }

    // 3. Login or Registration Flow
    if (!email) {
      setError('Please provide a valid email address.');
      return;
    }

    if (!password || password.length < 5) {
      setError('Password must contain at least 5 characters.');
      return;
    }

    if (!isLogin && !username) {
      setError('Please choose a workspace developer handle username.');
      return;
    }

    setLoading(true);
    
    try {
      let cleanEmail = email.trim().toLowerCase();
      cleanEmail = cleanEmail.replace('@gamil.com', '@gmail.com');
      cleanEmail = cleanEmail.replace('@gmai.com', '@gmail.com');
      cleanEmail = cleanEmail.replace('@gmial.com', '@gmail.com');
      cleanEmail = cleanEmail.replace('@gamil.co', '@gmail.com');
      cleanEmail = cleanEmail.replace('@yaho.com', '@yahoo.com');
      cleanEmail = cleanEmail.replace('@hotmial.com', '@hotmail.com');

      const derivedUsername = username ? username.trim() : (cleanEmail.includes('@') ? cleanEmail.split('@')[0] : cleanEmail);

      let deviceId = '';
      try {
        deviceId = localStorage.getItem('codesyne_device_id') || '';
        if (!deviceId) {
          deviceId = 'dev_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now().toString(36);
          localStorage.setItem('codesyne_device_id', deviceId);
        }
      } catch (e) {
        deviceId = 'dev_client_' + Date.now();
      }

      const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
      const body = isLogin 
        ? { email: cleanEmail, password, username: derivedUsername, deviceId }
        : { username: derivedUsername, email: cleanEmail, password };

      const response = await safeFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.isUnverified) {
          setUnverifiedEmail(cleanEmail);
        }
        setError(data.error || 'Authentication request failed.');
        return;
      }
      
      if (!isLogin) {
        // Successful Account Registration (requires email verification)
        setSuccessMsg(data.message || 'Account created successfully! Please check your email to verify your account.');
        setUnverifiedEmail(cleanEmail);
        setIsLogin(true);
        setPassword('');
        return;
      }

      if (data.token && data.user) {
        localStorage.setItem('ide_jwt_token', data.token);
        localStorage.setItem('ide_session_user', JSON.stringify(data.user));
        const userEmailKey = (data.user.email || data.user.username || 'user').toLowerCase();
        localStorage.setItem(`ide_custom_user_${userEmailKey}`, JSON.stringify(data.user));
        onAuthSuccess(data.user);
      } else {
        throw new Error(data.error || 'Invalid authentication response from server.');
      }
    } catch (err: any) {
      console.error('[Auth Error]', err);
      setError(err.message || 'Authentication request failed. Please check backend server status.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="auth_container" className="relative min-h-screen w-full bg-transparent text-slate-300 flex flex-col items-center justify-between p-4 sm:p-6 md:p-8 font-sans overflow-x-hidden overflow-y-auto">
      
      {/* Decorative Blur Background Circles */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden max-w-full">
        <div className="absolute top-[10%] -left-[10%] w-[70vw] max-w-[400px] h-[70vw] max-h-[400px] rounded-full bg-indigo-600/10 blur-[100px] sm:blur-[120px]" />
        <div className="absolute bottom-[10%] -right-[10%] w-[70vw] max-w-[400px] h-[70vw] max-h-[400px] rounded-full bg-fuchsia-600/10 blur-[100px] sm:blur-[120px]" />
      </div>

      {/* TOP HEADER IN FLOW */}
      <div className="w-full max-w-md flex items-center justify-between pt-2 pb-3 relative z-20 shrink-0">
        <button
          id="btn_back_landing"
          onClick={() => {
            setSocialLoading(null);
            onBack();
          }}
          type="button"
          className="flex items-center space-x-2 text-xs sm:text-sm text-slate-300 hover:text-white glass-panel glass-panel-hover px-3.5 py-2 rounded-xl transition-all cursor-pointer shadow-md border border-white/10 hover:border-indigo-500/30"
        >
          <ArrowLeft className="h-4 w-4 text-indigo-400 shrink-0" />
          <span className="font-medium">Back to Landing</span>
        </button>

        {/* Quick Tab Toggle */}
        {!resetTokenVal && (
          <div className="flex items-center space-x-1 bg-[#0a0a0f]/90 backdrop-blur-md p-1 rounded-xl border border-white/10 text-[11px] font-mono">
            <button
              type="button"
              onClick={() => { setIsLogin(true); setIsForgot(false); setError(''); setSuccessMsg(''); setUnverifiedEmail(null); }}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                isLogin && !isForgot ? 'bg-indigo-600 text-white font-bold shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Log In
            </button>
            <button
              type="button"
              onClick={() => { setIsLogin(false); setIsForgot(false); setError(''); setSuccessMsg(''); setUnverifiedEmail(null); }}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                !isLogin && !isForgot ? 'bg-indigo-600 text-white font-bold shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Sign Up
            </button>
          </div>
        )}
      </div>

      {/* CENTERED AUTH FORM CARD */}
      <div className="flex-1 flex items-center justify-center w-full max-w-md my-auto py-2 z-10">
        <motion.div
          key={verifying ? 'verifying' : resetTokenVal ? 'reset' : isForgot ? 'forgot' : isLogin ? 'login' : 'signup'}
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="w-full glass-panel rounded-3xl p-5 sm:p-8 shadow-2xl accent-glow-indigo overflow-hidden relative border border-white/10"
        >
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500" />
          
          {verifying ? (
            <div className="flex flex-col items-center justify-center py-8 text-center space-y-4">
              <Loader2 className="h-10 w-10 text-indigo-400 animate-spin" />
              <h3 className="text-lg font-bold text-white">Verifying your email address...</h3>
              <p className="text-xs text-slate-400">Please wait while we confirm your CodeSyne developer credentials with the database.</p>
            </div>
          ) : (
            <>
              {/* Brand logo */}
              <div className="flex flex-col items-center text-center mb-6 sm:mb-8">
                <div className="p-3 bg-gradient-to-tr from-indigo-500 to-fuchsia-500 rounded-2xl shadow-lg shadow-indigo-500/20 mb-3">
                  <Code2 className="h-6 w-6 sm:h-7 sm:w-7 text-white" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold font-sans text-white tracking-tight">
                  {resetTokenVal 
                    ? 'Set New Password' 
                    : isForgot 
                      ? 'Password Recovery' 
                      : isLogin 
                        ? 'Access Workspace' 
                        : 'Create Developer ID'}
                </h2>
                <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                  {resetTokenVal
                    ? 'Enter a new security password for your account'
                    : isForgot 
                      ? 'Provide your email to receive a recovery authorization link' 
                      : isLogin 
                        ? 'Unlock your sandbox collaborative containers' 
                        : 'Sign up to begin real-time multi-user editing sessions'}
                </p>
              </div>

              {/* Form panel */}
              <form onSubmit={handleSubmit} className="space-y-4">
                
                {/* Error notifications */}
                {error && (
                  <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-400 leading-relaxed font-sans space-y-2">
                    <div>{error}</div>
                    {unverifiedEmail && (
                      <button
                        type="button"
                        onClick={() => handleResendVerification(unverifiedEmail)}
                        disabled={resendingEmail}
                        className="inline-flex items-center space-x-1.5 text-xs text-indigo-400 font-bold hover:underline cursor-pointer pt-1"
                      >
                        {resendingEmail ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3.5 w-3.5" />
                        )}
                        <span>Resend Verification Email</span>
                      </button>
                    )}
                  </div>
                )}

                {/* Success notifications */}
                {successMsg && (
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-400 leading-relaxed font-sans flex items-start space-x-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
                    <span>{successMsg}</span>
                  </div>
                )}

                {/* Reset Password Form Fields */}
                {resetTokenVal ? (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">New Password</label>
                      <div className="relative">
                        <Lock className="absolute left-3.5 top-3.5 h-4.5 w-4.5 text-slate-500" />
                        <input
                          type="password"
                          placeholder="••••••••"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="w-full glass-input rounded-xl pl-11 pr-4 py-3 text-sm placeholder-slate-600 outline-none transition-all"
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Confirm New Password</label>
                      <div className="relative">
                        <KeyRound className="absolute left-3.5 top-3.5 h-4.5 w-4.5 text-slate-500" />
                        <input
                          type="password"
                          placeholder="••••••••"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className="w-full glass-input rounded-xl pl-11 pr-4 py-3 text-sm placeholder-slate-600 outline-none transition-all"
                          required
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    {/* Username (Sign-up only) */}
                    {!isLogin && !isForgot && (
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Dev Handle</label>
                        <div className="relative">
                          <User className="absolute left-3.5 top-3.5 h-4.5 w-4.5 text-slate-500" />
                          <input
                            type="text"
                            placeholder="e.g. ManjuSharmaDev"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="w-full glass-input rounded-xl pl-11 pr-4 py-3 text-sm placeholder-slate-600 outline-none transition-all"
                            required
                          />
                        </div>
                      </div>
                    )}

                    {/* Email field */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Email Address</label>
                      <div className="relative">
                        <Mail className="absolute left-3.5 top-3.5 h-4.5 w-4.5 text-slate-500" />
                        <input
                          type="email"
                          placeholder="nakulsharma02011@gmail.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="w-full glass-input rounded-xl pl-11 pr-4 py-3 text-sm placeholder-slate-600 outline-none transition-all"
                          required
                        />
                      </div>
                    </div>

                    {/* Password field (Login & Sign-up only) */}
                    {!isForgot && (
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-center">
                          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Security Password</label>
                          {isLogin && (
                            <button 
                              type="button" 
                              onClick={() => { setIsForgot(true); setError(''); setSuccessMsg(''); }}
                              className="text-xs text-indigo-400 hover:underline hover:text-indigo-300 cursor-pointer"
                            >
                              Forgot?
                            </button>
                          )}
                        </div>
                        <div className="relative">
                          <Lock className="absolute left-3.5 top-3.5 h-4.5 w-4.5 text-slate-500" />
                          <input
                            type="password"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full glass-input rounded-xl pl-11 pr-4 py-3 text-sm placeholder-slate-600 outline-none transition-all"
                            required
                          />
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Action button */}
                <button
                  id="btn_auth_submit"
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 bg-gradient-to-r from-indigo-500 to-fuchsia-500 hover:scale-[1.01] active:scale-95 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/20 transition-all flex items-center justify-center space-x-2 cursor-pointer mt-2"
                >
                  {loading ? (
                    <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <Sparkles className="h-4.5 w-4.5 fill-current" />
                      <span>
                        {resetTokenVal 
                          ? 'Update Security Password' 
                          : isForgot 
                            ? 'Dispatch Recovery Email' 
                            : isLogin 
                              ? 'Access Cloud Editor' 
                              : 'Create Account'}
                      </span>
                    </>
                  )}
                </button>
              </form>

              {/* Social Quick Login Section - Google & GitHub Logos Only */}
              {!isForgot && !resetTokenVal && (
                <div className="mt-5 pt-4 border-t border-slate-800/80">
                  <div className="relative flex items-center justify-center mb-3.5">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-slate-800" />
                    </div>
                    <div className="relative px-3 bg-[#0d0e17] text-[10px] font-mono uppercase tracking-widest text-slate-500 rounded-full border border-slate-800/80">
                      Quick Sign In
                    </div>
                  </div>

                  <div className="flex items-center justify-center gap-4">
                    {/* Google Logo Icon Button */}
                    <button
                      id="btn_oauth_google"
                      type="button"
                      onClick={() => handleSocialLogin('google')}
                      disabled={socialLoading !== null}
                      title={socialLoading === 'google' ? 'Connecting to Google OAuth...' : 'Sign in with Google'}
                      aria-label="Sign in with Google"
                      className="relative flex items-center justify-center w-12 h-12 rounded-2xl bg-slate-900/80 hover:bg-slate-800/90 active:scale-95 border border-white/10 hover:border-indigo-500/50 text-white transition-all shadow-md cursor-pointer group disabled:opacity-80 disabled:cursor-wait"
                    >
                      {socialLoading === 'google' ? (
                        <Loader2 className="w-4 h-4 text-cyan-400 animate-spin drop-shadow-[0_0_8px_rgba(34,211,238,0.6)] shrink-0" />
                      ) : (
                        <GoogleIcon className="h-5.5 w-5.5 transition-transform group-hover:scale-110" />
                      )}
                    </button>

                    {/* GitHub Logo Icon Button */}
                    <button
                      id="btn_oauth_github"
                      type="button"
                      onClick={() => handleSocialLogin('github')}
                      disabled={socialLoading !== null}
                      title={socialLoading === 'github' ? 'Connecting to GitHub OAuth...' : 'Sign in with GitHub'}
                      aria-label="Sign in with GitHub"
                      className="relative flex items-center justify-center w-12 h-12 rounded-2xl bg-slate-900/80 hover:bg-slate-800/90 active:scale-95 border border-white/10 hover:border-purple-500/50 text-white transition-all shadow-md cursor-pointer group disabled:opacity-80 disabled:cursor-wait"
                    >
                      {socialLoading === 'github' ? (
                        <Loader2 className="w-4 h-4 text-purple-400 animate-spin drop-shadow-[0_0_8px_rgba(168,85,247,0.6)] shrink-0" />
                      ) : (
                        <Github className="h-5.5 w-5.5 text-slate-200 group-hover:text-white transition-transform group-hover:scale-110" />
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Toggle Account screens */}
              <div className="mt-6 sm:mt-8 pt-5 sm:pt-6 border-t border-slate-800/80 text-center text-xs text-slate-400">
                {isForgot ? (
                  <button 
                    type="button" 
                    onClick={() => { setIsForgot(false); setIsLogin(true); setError(''); setSuccessMsg(''); setUnverifiedEmail(null); }}
                    className="text-cyan-400 hover:underline cursor-pointer"
                  >
                    Return to Login Panel
                  </button>
                ) : isLogin ? (
                  <span>
                    Don't have an account?{' '}
                    <button 
                      type="button" 
                      onClick={() => { setIsLogin(false); setError(''); setSuccessMsg(''); setUnverifiedEmail(null); }}
                      className="text-cyan-400 hover:underline hover:text-cyan-300 font-bold cursor-pointer ml-1"
                    >
                      Create Account
                    </button>
                  </span>
                ) : (
                  <span>
                    Already have an account?{' '}
                    <button 
                      type="button" 
                      onClick={() => { setIsLogin(true); setError(''); setSuccessMsg(''); setUnverifiedEmail(null); }}
                      className="text-cyan-400 hover:underline hover:text-cyan-300 font-bold cursor-pointer ml-1"
                    >
                      Sign In
                    </button>
                  </span>
                )}
              </div>

              {/* Security Shield Badge */}
              <div className="mt-4 flex items-center justify-center space-x-1.5 text-[10px] text-slate-500 uppercase tracking-widest font-mono">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                <span>AES-256 Encrypted Auth Protocol</span>
              </div>
            </>
          )}

        </motion.div>
      </div>

      {/* FOOTER PROTOCOL BADGE */}
      <div className="w-full py-1 text-center text-[10px] text-slate-600 font-mono shrink-0">
        CodeSyne Security Protocol
      </div>
    </div>
  );
}
