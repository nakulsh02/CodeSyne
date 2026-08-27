import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Terminal, Code2, Users, Cpu, GitBranch, Zap, Play, ChevronRight, ChevronDown, HelpCircle, Star, MessageSquare, Download, X, Github, Mail, Shield, AlertTriangle, FileText, Calendar, BookOpen, Layers, ArrowUpRight, CheckCircle, ArrowLeft, User, Sparkles, Copy, Check, ExternalLink } from 'lucide-react';
import { FAQS, TESTIMONIALS } from '@shared/mockData';
import InstallDownloadModal from './InstallDownloadModal';

const CONTACT_SUBJECTS = [
  {
    id: 'General Inquiry',
    label: 'General Inquiry',
    badge: 'Inquiry',
    desc: 'General platform queries, feature requests & feedback',
    icon: MessageSquare,
    color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20'
  },
  {
    id: 'Technical Support',
    label: 'Technical Support',
    badge: 'Dev Desk',
    desc: 'IDE execution, compilers, container runtime & bug assistance',
    icon: Cpu,
    color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20'
  },
  {
    id: 'Enterprise Account',
    label: 'Enterprise Quota Upgrade',
    badge: 'Pro Tier',
    desc: 'High-compute environments, multi-seat teams & custom limits',
    icon: Zap,
    color: 'text-amber-400 bg-amber-500/10 border-amber-500/20'
  },
  {
    id: 'Bug Report',
    label: 'Vulnerability / Bug Report',
    badge: 'Security',
    desc: 'Security disclosures, edge-case vulnerabilities & error logs',
    icon: AlertTriangle,
    color: 'text-rose-400 bg-rose-500/10 border-rose-500/20'
  },
];

interface LandingPageProps {
  onGetStarted: () => void;
  onLogin: () => void;
  currentUser?: any;
  onGoToDashboard?: () => void;
}

function HeroFloatingCodeSymbols() {
  const symbols = [
    { text: '</>', left: '5%', top: '18%', delay: 0, size: 'text-sm sm:text-base' },
    { text: '{ code }', left: '8%', top: '48%', delay: 1.2, size: 'text-xs sm:text-sm' },
    { text: '=> fn()', left: '12%', top: '78%', delay: 2.1, size: 'text-xs' },
    { text: 'async ()', right: '6%', top: '22%', delay: 0.7, size: 'text-xs sm:text-sm' },
    { text: '// realtime sync', right: '9%', top: '55%', delay: 1.8, size: 'text-xs' },
    { text: 'git checkout -b', right: '5%', top: '82%', delay: 2.8, size: 'text-[11px] sm:text-xs' },
  ];

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none select-none z-0">
      {symbols.map((sym, idx) => (
        <motion.div
          key={idx}
          initial={{ opacity: 0, y: 10 }}
          animate={{ 
            opacity: [0.25, 0.5, 0.25], 
            y: [-6, 6, -6], 
            rotate: idx % 2 === 0 ? [-2, 2, -2] : [2, -2, 2] 
          }}
          transition={{
            duration: 6 + (idx % 3),
            repeat: Infinity,
            ease: "easeInOut",
            delay: sym.delay
          }}
          style={{
            position: 'absolute',
            left: sym.left,
            right: sym.right,
            top: sym.top,
          }}
          className={`font-mono ${sym.size} text-cyan-400/60 bg-slate-900/60 border border-cyan-500/20 backdrop-blur-md px-2.5 py-1 rounded-lg shadow-lg shadow-cyan-950/40 hidden sm:flex items-center gap-1.5`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400/80 animate-pulse"></span>
          <span>{sym.text}</span>
        </motion.div>
      ))}
    </div>
  );
}

export default function LandingPage({ onGetStarted, onLogin, currentUser, onGoToDashboard }: LandingPageProps) {
  const [activeFaq, setActiveFaq] = useState<number | null>(null);
  const [canInstall, setCanInstall] = useState(false);
  const [activePolicyPage, setActivePolicyPage] = useState<'privacy' | 'terms' | 'contact' | 'about' | 'creator' | 'cookie' | 'disclaimer' | 'roadmap' | 'changelog' | 'docs' | null>(null);
  const [isInIframe, setIsInIframe] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);

  const handleCopyEmail = (emailStr: string) => {
    navigator.clipboard.writeText(emailStr);
    setCopiedEmail(true);
    setTimeout(() => setCopiedEmail(false), 2000);
  };
  
  // Contact Form states
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactSubject, setContactSubject] = useState('General Inquiry');
  const [isSubjectDropdownOpen, setIsSubjectDropdownOpen] = useState(false);
  const subjectDropdownRef = useRef<HTMLDivElement>(null);
  const [contactMessage, setContactMessage] = useState('');
  const [contactSuccess, setContactSuccess] = useState(false);
  const [contactLoading, setContactLoading] = useState(false);

  // Verification & Guest Flow States
  const [pendingVerification, setPendingVerification] = useState(false);
  const [pendingEmail, setPendingEmail] = useState('');
  const [verificationToken, setVerificationToken] = useState<string | null>(null);
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [useCustomEmail, setUseCustomEmail] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [verificationSuccessMsg, setVerificationSuccessMsg] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSuccess, setResendSuccess] = useState<string | null>(null);
  const [showDownloadModal, setShowDownloadModal] = useState(false);

  // Synchronize authenticated user credentials
  useEffect(() => {
    if (currentUser?.email) {
      if (!useCustomEmail) {
        setContactEmail(currentUser.email);
      }
      if (currentUser.username && !contactName) {
        setContactName(currentUser.username);
      }
      setIsEmailVerified(true);
    }
  }, [currentUser, useCustomEmail]);

  // Background glow element refs for smooth 60-120fps mouse parallax without React re-renders
  const bgGlow1Ref = useRef<HTMLDivElement>(null);
  const bgGlow2Ref = useRef<HTMLDivElement>(null);
  const bgGridRef = useRef<HTMLDivElement>(null);

  // Inspect URL parameters for contact verification token or hash routing
  useEffect(() => {
    let token: string | null = null;
    try {
      const search = window.location.search;
      const rawHash = window.location.hash || '';
      const cleanHash = rawHash.replace(/^#/, '').toLowerCase().trim();
      const params = new URLSearchParams(search);
      token = params.get('contact_verify_token') || params.get('contactVerifyToken') || params.get('contact_token');
      
      if (!token && rawHash) {
        const hashParams = new URLSearchParams(rawHash.includes('?') ? rawHash.substring(rawHash.indexOf('?')) : '');
        token = hashParams.get('contact_verify_token') || hashParams.get('contactVerifyToken') || hashParams.get('contact_token');
      }

      if (token) {
        handleOpenPolicyPage('contact');
        handleVerifyToken(token);
        return;
      }

      // Check if we have a stored contact token in localStorage as fallback
      const cachedToken = localStorage.getItem('codesyne_last_contact_verified');
      if (cachedToken && cleanHash === 'contact') {
        handleVerifyToken(cachedToken);
      }

      const validSubpages = ['creator', 'contact', 'about', 'docs', 'roadmap', 'changelog', 'privacy', 'terms', 'cookie', 'disclaimer', 'security', 'telemetry', 'faq'];
      let targetSubpage: any = null;

      if (cleanHash === 'contact' || search.includes('page=contact')) {
        targetSubpage = 'contact';
      } else if (cleanHash === 'creator' || cleanHash === 'about_creator' || cleanHash === 'about-creator') {
        targetSubpage = 'creator';
      } else if (validSubpages.includes(cleanHash)) {
        targetSubpage = cleanHash;
      } else {
        // If there is NO hash in URL (or hash is just home/features/etc), do NOT restore subpage:
        // Render the clean landing page!
        targetSubpage = null;
      }

      if (targetSubpage) {
        handleOpenPolicyPage(targetSubpage);
      } else {
        // Clean URL and ensure home landing view
        handleOpenPolicyPage(null);
      }
    } catch (e) {
      console.error('URL parse error:', e);
    }
  }, []);

  // Poll for contact verification when pendingVerification is active (handles multi-device/browser flow)
  useEffect(() => {
    if (!pendingVerification || !pendingEmail) return;

    let isMounted = true;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/contact/check-status?email=${encodeURIComponent(pendingEmail)}`);
        if (!res.ok || !isMounted) return;
        const data = await res.json();
        if (data.exists && data.isVerified && data.token) {
          setVerificationToken(data.token);
          localStorage.setItem('codesyne_last_contact_verified', data.token);
          setIsEmailVerified(true);
          setPendingVerification(false);
          if (data.contact) {
            setContactName(data.contact.name || '');
            setContactEmail(data.contact.email || '');
            setContactSubject(data.contact.subject || 'General Inquiry');
            setContactMessage(data.contact.message || '');
          }
          setVerificationSuccessMsg('Email verified in your other browser/device! You can now confirm and transmit your inquiry.');
        }
      } catch (err) {
        // Silent background check failure
      }
    }, 3500);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [pendingVerification, pendingEmail]);

  const handleVerifyToken = async (token: string) => {
    setContactLoading(true);
    setVerificationError(null);
    try {
      const res = await fetch(`/api/contact/verify?token=${encodeURIComponent(token)}`);
      const data = await res.json();
      if (res.ok && data.success && data.contact) {
        setVerificationToken(token);
        localStorage.setItem('codesyne_last_contact_verified', token);
        setIsEmailVerified(true);
        setPendingVerification(false);
        setContactName(data.contact.name || '');
        setContactEmail(data.contact.email || '');
        setContactSubject(data.contact.subject || 'General Inquiry');
        setContactMessage(data.contact.message || '');
        setVerificationSuccessMsg('Email verified successfully! You can now review your message and confirm transmission.');
        try {
          if (window.history && window.history.replaceState) {
            window.history.replaceState({}, document.title, window.location.pathname + '#contact');
          }
        } catch {}
      } else {
        setVerificationError(data.error || 'The verification link is invalid or has expired (24-hour limit).');
        if (data.email) {
          setPendingEmail(data.email);
        }
        localStorage.removeItem('codesyne_pending_contact_token');
        localStorage.removeItem('codesyne_last_contact_verified');
      }
    } catch (err: any) {
      console.error('Verify token error:', err);
      setVerificationError('Unable to connect to verification service. Please check your connection.');
    } finally {
      setContactLoading(false);
    }
  };

  const handleResendVerification = async () => {
    const targetEmail = (pendingEmail || contactEmail).trim();
    if (!targetEmail || resendCooldown > 0 || resendLoading) return;
    
    setResendLoading(true);
    setResendSuccess(null);
    setVerificationError(null);
    try {
      const res = await fetch('/api/contact/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: targetEmail })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setResendSuccess(`A fresh verification link has been dispatched to ${targetEmail}. Please check your inbox.`);
        setResendCooldown(30);
      } else {
        setVerificationError(data.error || 'Failed to resend verification link. Please try again.');
        if (data.remainingCooldown) {
          setResendCooldown(data.remainingCooldown);
        }
      }
    } catch (err) {
      console.error('Resend error:', err);
      setVerificationError('Network error while resending verification link.');
    } finally {
      setResendLoading(false);
    }
  };

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (subjectDropdownRef.current && !subjectDropdownRef.current.contains(event.target as Node)) {
        setIsSubjectDropdownOpen(false);
      }
    };
    if (isSubjectDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isSubjectDropdownOpen]);

  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  // High performance RAF mouse tracking for background parallax with zero React re-renders
  useEffect(() => {
    let rafId: number | null = null;

    const handleMouseMove = (e: MouseEvent) => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        const normX = (e.clientX / (window.innerWidth || 1) - 0.5) * 2;
        const normY = (e.clientY / (window.innerHeight || 1) - 0.5) * 2;
        if (bgGlow1Ref.current) {
          bgGlow1Ref.current.style.transform = `translate3d(${normX * -35}px, ${normY * -35}px, 0)`;
        }
        if (bgGlow2Ref.current) {
          bgGlow2Ref.current.style.transform = `translate3d(${normX * 30}px, ${normY * 30}px, 0)`;
        }
        if (bgGridRef.current) {
          bgGridRef.current.style.transform = `translate3d(${normX * 15}px, ${normY * 15}px, 0)`;
        }
        rafId = null;
      });
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  useEffect(() => {
    setIsInIframe(window.self !== window.top);
    
    // Detect if app is strictly running inside standalone PWA window mode (mobile/desktop app window)
    const isStandalone = typeof window !== 'undefined' && (
      window.matchMedia('(display-mode: standalone)').matches || 
      (navigator as any).standalone === true ||
      document.referrer.includes('android-app://')
    );
    
    setIsInstalled(isStandalone);
    if (!isStandalone && window.deferredPrompt) {
      setDeferredPrompt(window.deferredPrompt);
      setCanInstall(true);
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      window.deferredPrompt = e;
      setCanInstall(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    const handlePwaState = (e: any) => {
      if (e.detail) {
        setCanInstall(e.detail.installable && !e.detail.installed);
        if (e.detail.installed && isStandalone) {
          setIsInstalled(true);
        }
      }
    };
    window.addEventListener('pwa-installable-state', handlePwaState);

    const handleAppInstalled = () => {
      setCanInstall(false);
      setDeferredPrompt(null);
      window.deferredPrompt = null;
      const isStandaloneMode = typeof window !== 'undefined' && (
        window.matchMedia('(display-mode: standalone)').matches || 
        (navigator as any).standalone === true ||
        document.referrer.includes('android-app://')
      );
      setIsInstalled(isStandaloneMode);
    };
    window.addEventListener('appinstalled', handleAppInstalled);

    const handleOpenDownloadModal = () => {
      setShowDownloadModal(true);
    };
    window.addEventListener('open-download-modal', handleOpenDownloadModal);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('pwa-installable-state', handlePwaState);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('open-download-modal', handleOpenDownloadModal);
    };
  }, []);

  const triggerPwaPrompt = async () => {
    const promptEvent = deferredPrompt || window.deferredPrompt;
    if (promptEvent) {
      try {
        await promptEvent.prompt();
        const choiceResult = await promptEvent.userChoice;
        console.log('[PWA] User choice outcome:', choiceResult?.outcome);
        if (choiceResult?.outcome === 'accepted') {
          setIsInstalled(true);
        }
      } catch (err) {
        console.warn('[PWA] Prompt error:', err);
      }
      window.deferredPrompt = null;
      setDeferredPrompt(null);
      setCanInstall(false);
    } else {
      window.dispatchEvent(new CustomEvent('pwa-trigger-install'));
    }
  };

  const handleInstallApp = () => {
    setShowDownloadModal(true);
  };

  const scrollToTop = () => {
    try {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' as any });
      if (document.documentElement) {
        document.documentElement.scrollTop = 0;
      }
      if (document.body) {
        document.body.scrollTop = 0;
      }
      const container = document.getElementById('landing_container');
      if (container) {
        container.scrollTop = 0;
      }
    } catch (err) {
      console.warn('Scroll reset error:', err);
    }
  };

  const handleOpenPolicyPage = (page: typeof activePolicyPage) => {
    setActivePolicyPage(page);
    if (page) {
      try {
        sessionStorage.setItem('codesyne_active_subpage', page);
        if (page === 'contact') {
          sessionStorage.setItem('codesyne_contact_flow_active', 'true');
        } else {
          sessionStorage.removeItem('codesyne_contact_flow_active');
        }
        if (window.history && window.history.replaceState) {
          window.history.replaceState(null, '', '#' + page);
        }
      } catch {}
    } else {
      // User clicked Back to Home: Completely reset all subpage sessions and clear URL parameters
      try {
        sessionStorage.removeItem('codesyne_active_subpage');
        sessionStorage.removeItem('codesyne_contact_flow_active');
        localStorage.removeItem('codesyne_pending_contact_token');
        localStorage.removeItem('codesyne_last_contact_verified');
        if (window.history && window.history.replaceState) {
          window.history.replaceState(null, '', window.location.pathname);
        }
      } catch {}
    }
    scrollToTop();
    requestAnimationFrame(() => {
      scrollToTop();
      setTimeout(scrollToTop, 40);
      setTimeout(scrollToTop, 120);
    });
  };

  useEffect(() => {
    scrollToTop();
    const t1 = setTimeout(scrollToTop, 20);
    const t2 = setTimeout(scrollToTop, 100);
    const t3 = setTimeout(scrollToTop, 250);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [activePolicyPage]);

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = contactName.trim();
    const cleanEmail = (currentUser?.email || contactEmail).trim();
    const cleanSubject = contactSubject.trim() || 'General Inquiry';
    const cleanMessage = contactMessage.trim();

    if (!cleanName || !cleanEmail || !cleanMessage) {
      alert('Please fill out all required fields.');
      return;
    }

    setContactLoading(true);
    setVerificationError(null);

    try {
      // 1. If we have a verified token (guest came from email link):
      if (verificationToken) {
        const res = await fetch('/api/contact/confirm-verified', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: verificationToken,
            name: cleanName,
            subject: cleanSubject,
            message: cleanMessage
          })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          setContactSuccess(true);
          setVerificationToken(null);
          setVerificationSuccessMsg(null);
          setContactMessage('');
          try {
            sessionStorage.removeItem('codesyne_contact_flow_active');
            localStorage.removeItem('codesyne_pending_contact_token');
            localStorage.removeItem('codesyne_last_contact_verified');
          } catch {}
        } else {
          setVerificationError(data.error || 'Verification session expired. Please submit the form again.');
          setVerificationToken(null);
          setIsEmailVerified(false);
        }
        return;
      }

      // 2. If user is logged in (authenticated session) or regular submission:
      const jwtToken = localStorage.getItem('ide_jwt_token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (currentUser && jwtToken) {
        headers['Authorization'] = `Bearer ${jwtToken}`;
      }

      const res = await fetch('/api/contact', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: cleanName,
          email: cleanEmail,
          subject: cleanSubject,
          message: cleanMessage
        })
      });
      const data = await res.json();

      if (res.ok && data.success) {
        if (data.pendingVerification) {
          // Guest flow: Verification email dispatched
          setPendingVerification(true);
          setPendingEmail(data.email || cleanEmail);
          setResendCooldown(30);
          try {
            sessionStorage.setItem('codesyne_contact_flow_active', 'true');
          } catch {}
        } else {
          // Authenticated direct transmission
          setContactSuccess(true);
          setContactMessage('');
          try {
            sessionStorage.removeItem('codesyne_contact_flow_active');
            localStorage.removeItem('codesyne_pending_contact_token');
            localStorage.removeItem('codesyne_last_contact_verified');
          } catch {}
        }
      } else {
        alert(data.error || 'Failed to submit inquiry. Please try again.');
      }
    } catch (err) {
      console.error('Contact submit error:', err);
      alert('Network error while transmitting message. Please try again.');
    } finally {
      setContactLoading(false);
    }
  };

  return (
    <div id="landing_container" className="relative flex-1 w-full bg-[#03020c] text-slate-300 overflow-x-hidden font-sans flex flex-col">
      
      {/* Premium Animated Background with Interactive Mouse Parallax */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div 
          ref={bgGlow1Ref}
          className="absolute -top-[30%] -left-[20%] w-[70vw] h-[70vw] rounded-full bg-cyan-500/10 blur-[150px] transition-transform duration-300 ease-out will-change-transform" 
          style={{ 
            transform: 'translate3d(0px, 0px, 0)'
          }} 
        />
        <div 
          ref={bgGlow2Ref}
          className="absolute bottom-0 right-0 w-[50vw] h-[50vw] rounded-full bg-violet-600/10 blur-[140px] transition-transform duration-300 ease-out will-change-transform" 
          style={{ 
            transform: 'translate3d(0px, 0px, 0)'
          }} 
        />
        
        {/* Decorative Grid Overlay with Mouse Parallax Shift */}
        <div 
          ref={bgGridRef}
          className="absolute inset-0 bg-[linear-gradient(to_right,#020617_1px,transparent_1px),linear-gradient(to_bottom,#020617_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_40%,#000_70%,transparent_100%)] opacity-35 transition-transform duration-500 ease-out will-change-transform"
          style={{ 
            transform: 'translate3d(0px, 0px, 0)'
          }} 
        />
      </div>

      {/* Navbar Header */}
      <header id="landing_header" className="fixed top-0 left-0 right-0 z-50 bg-[#03020c]/90 backdrop-blur-xl border-b border-white/5 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-2">
          <div 
            onClick={() => handleOpenPolicyPage(null)}
            className="flex items-center space-x-2.5 cursor-pointer shrink-0"
          >
            <div className="p-1.5 sm:p-2 bg-gradient-to-tr from-cyan-400 to-indigo-500 rounded-xl shadow-lg shadow-cyan-500/20">
              <Code2 className="h-5 w-5 sm:h-6 sm:w-6 text-slate-950" />
            </div>
            <span className="font-sans font-bold text-base sm:text-lg tracking-tight bg-gradient-to-r from-cyan-400 to-indigo-400 bg-clip-text text-transparent">
              CodeSyne
            </span>
          </div>

          <nav className="hidden lg:flex items-center space-x-8 text-sm font-medium text-slate-300">
            <button onClick={() => { handleOpenPolicyPage(null); setTimeout(() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' }), 100); }} className="hover:text-cyan-400 transition-colors cursor-pointer bg-transparent border-none font-medium">Features</button>
            <button onClick={() => { handleOpenPolicyPage(null); setTimeout(() => document.getElementById('languages')?.scrollIntoView({ behavior: 'smooth' }), 100); }} className="hover:text-cyan-400 transition-colors cursor-pointer bg-transparent border-none font-medium">Languages</button>
            <button onClick={() => { handleOpenPolicyPage(null); setTimeout(() => document.getElementById('testimonials')?.scrollIntoView({ behavior: 'smooth' }), 100); }} className="hover:text-cyan-400 transition-colors cursor-pointer bg-transparent border-none font-medium">Testimonials</button>
            <button onClick={() => { handleOpenPolicyPage(null); setTimeout(() => document.getElementById('faq')?.scrollIntoView({ behavior: 'smooth' }), 100); }} className="hover:text-cyan-400 transition-colors cursor-pointer bg-transparent border-none font-medium">FAQs</button>
          </nav>

          <div className="flex items-center space-x-1.5 sm:space-x-3 shrink-0">
            {currentUser ? (
              <button 
                id="btn_nav_dashboard"
                onClick={onGoToDashboard || onGetStarted} 
                className="px-3.5 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-semibold text-slate-950 bg-gradient-to-r from-cyan-400 to-indigo-400 rounded-lg shadow-md shadow-cyan-400/10 hover:shadow-cyan-400/30 hover:scale-105 active:scale-95 transition-all cursor-pointer flex items-center space-x-1.5 shrink-0"
              >
                <Code2 className="h-4 w-4 text-slate-950" />
                <span>Go to Dashboard</span>
              </button>
            ) : (
              <>
                <button 
                  id="btn_nav_login"
                  onClick={onLogin} 
                  className="hidden sm:block px-3 py-2 text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-900 rounded-lg transition-colors cursor-pointer"
                >
                  Log In
                </button>
                <button 
                  id="btn_nav_get_started"
                  onClick={onGetStarted} 
                  className="px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-semibold text-slate-950 bg-gradient-to-r from-cyan-400 to-indigo-400 rounded-lg shadow-md shadow-cyan-400/10 hover:shadow-cyan-400/30 hover:scale-105 active:scale-95 transition-all cursor-pointer shrink-0"
                >
                  Get Started
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-grow flex flex-col relative z-10 pt-16">
        {/* Conditionally Render Active Page */}
      {activePolicyPage === null ? (
        <>
          {/* Hero Section */}
      <section id="landing_hero" className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 pt-10 sm:pt-14 md:pt-20 pb-16 sm:pb-24 text-center flex flex-col justify-center overflow-hidden">
        {/* Background Floating Code Symbols */}
        <HeroFloatingCodeSymbols />

        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center space-x-2 px-3.5 py-1.5 bg-slate-900/90 border border-slate-800 rounded-full text-xs sm:text-sm font-medium text-cyan-400 mb-4 sm:mb-6 shadow-md shadow-cyan-500/5 mx-auto relative z-10"
        >
          <Zap className="h-3.5 w-3.5 fill-cyan-400 shrink-0" />
          <span>Fully Managed Real-Time Collaboration & Hosting</span>
        </motion.div>

        <motion.h1 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-sans font-bold tracking-tight text-white max-w-4xl mx-auto leading-tight relative z-10"
        >
          Code Together.<br />
          <span className="bg-gradient-to-r from-cyan-400 via-indigo-400 to-violet-400 bg-clip-text text-transparent">
            Build Faster.
          </span>
        </motion.h1>

        <motion.p 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="text-xs sm:text-sm md:text-base lg:text-lg text-slate-400 max-w-2xl mx-auto mt-3 sm:mt-5 leading-relaxed px-2 relative z-10"
        >
          A state-of-the-art Collaborative Cloud IDE inspired by VS Code. Code in real-time, execute instantly, manage versions, and build side-by-side with teammates in modern sandbox containers.
        </motion.p>

        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mt-6 sm:mt-8 flex flex-col items-center justify-center gap-2.5 sm:gap-3.5 max-w-md sm:max-w-3xl mx-auto px-2 sm:px-4 w-full relative z-10"
        >
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 sm:gap-3.5 w-full max-w-xs sm:max-w-none">
            <button 
              id="btn_hero_launch"
              onClick={onGetStarted}
              className="w-full sm:w-auto px-5 py-2.5 sm:px-7 sm:py-3.5 bg-gradient-to-r from-cyan-400 via-sky-400 to-indigo-500 text-slate-950 font-extrabold text-xs sm:text-sm md:text-base rounded-xl sm:rounded-2xl shadow-lg shadow-cyan-400/20 hover:shadow-cyan-400/40 hover:scale-[1.02] active:scale-98 transition-all flex items-center justify-center space-x-1.5 sm:space-x-2 cursor-pointer shrink-0 tracking-wide"
            >
              <span>Launch Editor Free</span>
              <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
            </button>
            
            {!isInstalled && (
              <motion.button 
                id="btn_hero_install_pwa"
                onClick={handleInstallApp}
                whileHover={{ scale: 1.02, translateY: -1 }}
                whileTap={{ scale: 0.98 }}
                className="w-full sm:w-auto px-5 py-2.5 sm:px-7 sm:py-3.5 bg-gradient-to-r from-indigo-500 via-purple-600 to-pink-600 text-white font-extrabold text-xs sm:text-sm md:text-base rounded-xl sm:rounded-2xl shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/45 hover:from-indigo-400 hover:via-purple-500 hover:to-pink-500 transition-all flex items-center justify-center space-x-1.5 sm:space-x-2 cursor-pointer border border-indigo-500/30 shrink-0 relative overflow-hidden group font-sans tracking-wide"
              >
                {/* Glossy sweep shine animation */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full animate-shimmer pointer-events-none" />
                
                <Download className="h-4 w-4 sm:h-5 sm:w-5 text-white shrink-0 group-hover:scale-110 transition-transform" />
                <span>Install Codesyne</span>
              </motion.button>
            )}

            <a 
              href="#features" 
              className="w-full sm:w-auto px-5 py-2.5 sm:px-6 sm:py-3.5 bg-slate-900/90 border border-white/10 hover:border-cyan-500/40 text-slate-200 hover:text-white font-bold rounded-xl sm:rounded-2xl hover:bg-slate-800 transition-all flex items-center justify-center space-x-1.5 sm:space-x-2 text-xs sm:text-sm shrink-0 shadow-lg shadow-black/40 backdrop-blur-md"
            >
              <Play className="h-3.5 w-3.5 sm:h-4 sm:w-4 fill-current shrink-0" />
              <span>Watch Showcase</span>
            </a>
          </div>

          {isInIframe && (
            <div className="text-[10px] sm:text-[11px] text-indigo-300/90 font-medium bg-indigo-950/45 border border-indigo-500/20 px-3.5 py-2.5 rounded-xl flex items-center gap-2 max-w-lg mt-2 text-left shadow-sm">
              <span className="shrink-0 text-indigo-400 text-xs">💡</span>
              <span className="leading-relaxed">
                Running inside preview panel. Open the application in a <strong className="text-cyan-400 font-bold">New Tab</strong> (icon at top-right of the preview window) to install direct as a Desktop/Mobile App!
              </span>
            </div>
          )}
        </motion.div>

        {/* Floating IDE Hero Mockup */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="mt-12 sm:mt-16 md:mt-24 relative rounded-2xl glass-panel p-3.5 sm:p-5 md:p-6 shadow-2xl shadow-indigo-500/10 max-w-4xl mx-auto group overflow-hidden border border-white/10"
        >
          <div className="absolute inset-0 bg-gradient-to-tr from-cyan-500/10 to-indigo-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
          
          {/* Mock Window Header */}
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3 mb-3.5 sm:mb-4">
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-red-500/80" />
              <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-yellow-500/80" />
              <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-green-500/80" />
            </div>
            <span className="text-[10px] sm:text-xs text-slate-300 font-mono font-semibold truncate max-w-[200px] sm:max-w-none">
              collaborative_workspace_manager.tsx
            </span>
            <div className="w-8 sm:w-12 h-1.5 sm:h-2 rounded bg-slate-800" />
          </div>

          {/* Mock IDE Layout */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-left font-mono text-[11px] sm:text-xs md:text-sm leading-6 select-none">
            {/* Sidebar Explorer - Desktop/Tablet view */}
            <div className="hidden sm:block col-span-1 border-r border-slate-800/60 pr-3.5 text-slate-500 space-y-2 text-xs">
              <span className="text-[10px] font-bold text-slate-400 block mb-3 uppercase tracking-wider">Explorer</span>
              <div className="text-cyan-400 flex items-center space-x-2"><span className="text-xs">📂</span> <span className="truncate">components</span></div>
              <div className="pl-3 flex items-center space-x-1.5"><span className="text-xs">📄</span> <span className="truncate text-slate-300">EditorTabs.tsx</span></div>
              <div className="pl-3 text-slate-400 flex items-center space-x-1.5"><span className="text-xs">📄</span> <span className="truncate">SidebarTools.tsx</span></div>
              <div className="text-slate-400 flex items-center space-x-2"><span className="text-xs">📂</span> <span className="truncate">assets</span></div>
              <div className="text-slate-400 flex items-center space-x-2"><span className="text-xs">📄</span> <span className="truncate">index.html</span></div>
              <div className="text-slate-400 flex items-center space-x-2"><span className="text-xs">📄</span> <span className="truncate">package.json</span></div>
            </div>

            {/* Code lines - Overflow x auto to preserve code symmetry on narrow mobile displays */}
            <div className="col-span-1 sm:col-span-3 space-y-1.5 overflow-x-auto pb-1 scrollbar-none w-full max-w-full">
              <div className="flex items-center whitespace-nowrap min-w-0">
                <span className="text-slate-600 w-7 inline-block select-none text-right pr-2 shrink-0">1</span> 
                <div className="text-slate-200"><span className="text-indigo-400">import</span> React, &#123; useState, useEffect &#125; <span className="text-indigo-400">from</span> <span className="text-emerald-400">'react'</span>;</div>
              </div>
              <div className="flex items-center whitespace-nowrap min-w-0">
                <span className="text-slate-600 w-7 inline-block select-none text-right pr-2 shrink-0">2</span> 
                <div className="text-slate-200"><span className="text-indigo-400">import</span> &#123; createClient &#125; <span className="text-indigo-400">from</span> <span className="text-emerald-400">'@codesyne/client'</span>;</div>
              </div>
              <div className="flex items-center whitespace-nowrap min-w-0">
                <span className="text-slate-600 w-7 inline-block select-none text-right pr-2 shrink-0">3</span> 
                <div></div>
              </div>
              <div className="flex items-center whitespace-nowrap min-w-0">
                <span className="text-slate-600 w-7 inline-block select-none text-right pr-2 shrink-0">4</span> 
                <div className="text-slate-500">// Collaborative multi-cursor loop</div>
              </div>
              <div className="flex items-center whitespace-nowrap min-w-0">
                <span className="text-slate-600 w-7 inline-block select-none text-right pr-2 shrink-0">5</span> 
                <div className="text-slate-200"><span className="text-indigo-400">export function</span> <span className="text-cyan-400">SyncEngine</span>() &#123;</div>
              </div>
              <div className="flex items-center whitespace-nowrap min-w-0">
                <span className="text-slate-600 w-7 inline-block select-none text-right pr-2 shrink-0">6</span> 
                <div className="text-slate-200">&nbsp;&nbsp;<span className="text-indigo-400">const</span> [users, setUsers] = <span className="text-cyan-400">useState</span>([]);</div>
              </div>
              <div className="flex items-center whitespace-nowrap min-w-0">
                <span className="text-slate-600 w-7 inline-block select-none text-right pr-2 shrink-0">7</span> 
                <div className="flex items-center space-x-1.5 text-slate-200">
                  <span>&nbsp;&nbsp;<span className="text-indigo-400">const</span> cursorColor = <span className="text-emerald-400">'#0ea5e9'</span>;</span>
                  <span className="w-1.5 h-4 bg-cyan-400 inline-block animate-pulse rounded-xs shrink-0" title="Active Editor Cursor" />
                </div>
              </div>
              <div className="flex items-center whitespace-nowrap min-w-0">
                <span className="text-slate-600 w-7 inline-block select-none text-right pr-2 shrink-0">8</span> 
                <div className="text-slate-400">&nbsp;&nbsp;return &lt;<span className="text-cyan-400">CollaboratorPanel</span> users=&#123;users&#125; /&gt;;</div>
              </div>
              <div className="flex items-center whitespace-nowrap min-w-0">
                <span className="text-slate-600 w-7 inline-block select-none text-right pr-2 shrink-0">9</span> 
                <div className="text-slate-200">&#125;</div>
              </div>
            </div>
          </div>

          {/* Symmetrical IDE Footer Bar */}
          <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-2.5 text-[11px] sm:text-xs text-slate-400 font-mono">
            <div className="flex items-center space-x-2 shrink-0">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-slate-300 font-medium">Nakul is editing</span>
            </div>

            <div className="text-slate-500 hidden md:block shrink-0">TypeScript • UTF-8</div>
          </div>
        </motion.div>
      </section>

      {/* Core Features Grid Section */}
      <section id="features" className="relative pt-12 sm:pt-20 pb-16 sm:pb-24 border-t border-white/5 bg-transparent z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-10 sm:mb-16">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-sans font-bold text-white tracking-normal leading-tight">Everything you need to ship projects</h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-2 sm:mt-4 leading-relaxed">Say goodbye to local environment configuration. Enjoy full cloud-power compilation, real-time sync, and integrated smart capabilities.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-8">
            <div id="feat_collab" className="p-5 sm:p-8 rounded-xl sm:rounded-2xl glass-card glass-panel-hover transition-colors group">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-cyan-500/10 rounded-xl flex items-center justify-center mb-4 sm:mb-6 group-hover:scale-110 transition-transform">
                <Users className="h-5 w-5 sm:h-6 sm:w-6 text-cyan-400" />
              </div>
              <h3 className="text-base sm:text-lg md:text-xl font-bold text-white">Live Multiplayer Sync</h3>
              <p className="text-xs sm:text-sm text-slate-400 mt-2 sm:mt-3 leading-relaxed">Experience simultaneous real-time writing with absolute zero friction. Share cursor coordinate markers, selections, workspace chats, and active panels with invite keys.</p>
            </div>

            <div id="feat_ai" className="p-5 sm:p-8 rounded-xl sm:rounded-2xl glass-card glass-panel-hover transition-colors group">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-indigo-500/10 rounded-xl flex items-center justify-center mb-4 sm:mb-6 group-hover:scale-110 transition-transform">
                <Cpu className="h-5 w-5 sm:h-6 sm:w-6 text-indigo-400" />
              </div>
              <h3 className="text-base sm:text-lg md:text-xl font-bold text-white">Full Administrative Control</h3>
              <p className="text-xs sm:text-sm text-slate-400 mt-2 sm:mt-3 leading-relaxed">Manage multiple projects, view system logs, view connected active users, assign permissions, and control cloud sandbox environments on-the-fly.</p>
            </div>

            <div id="feat_runner" className="p-5 sm:p-8 rounded-xl sm:rounded-2xl glass-card glass-panel-hover transition-colors group">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-violet-500/10 rounded-xl flex items-center justify-center mb-4 sm:mb-6 group-hover:scale-110 transition-transform">
                <Terminal className="h-5 w-5 sm:h-6 sm:w-6 text-violet-400" />
              </div>
              <h3 className="text-base sm:text-lg md:text-xl font-bold text-white">Real-Time Code Execution</h3>
              <p className="text-xs sm:text-sm text-slate-400 mt-2 sm:mt-3 leading-relaxed">Press single-tap Run keys to launch Node.js or Python instances directly inside our sandboxed full-stack containers. Watch immediate stdout logs and performance stats.</p>
            </div>

            <div id="feat_explorer" className="p-5 sm:p-8 rounded-xl sm:rounded-2xl glass-card glass-panel-hover transition-colors group">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center mb-4 sm:mb-6 group-hover:scale-110 transition-transform">
                <Code2 className="h-5 w-5 sm:h-6 sm:w-6 text-emerald-400" />
              </div>
              <h3 className="text-base sm:text-lg md:text-xl font-bold text-white">VS Code Custom Editor</h3>
              <p className="text-xs sm:text-sm text-slate-400 mt-2 sm:mt-3 leading-relaxed">Integrated full-featured editor with customizable fonts, automatic closing brackets, find/replace patterns, file mini-maps, multiple tab states, and auto-saves.</p>
            </div>

            <div id="feat_git" className="p-5 sm:p-8 rounded-xl sm:rounded-2xl glass-card glass-panel-hover transition-colors group">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-rose-500/10 rounded-xl flex items-center justify-center mb-4 sm:mb-6 group-hover:scale-110 transition-transform">
                <GitBranch className="h-5 w-5 sm:h-6 sm:w-6 text-rose-400" />
              </div>
              <h3 className="text-base sm:text-lg md:text-xl font-bold text-white">Git Version Workflows</h3>
              <p className="text-xs sm:text-sm text-slate-400 mt-2 sm:mt-3 leading-relaxed">Initialize branches, staging-list files, write and commit changes, view diff comparisons, and review full commits logs timeline securely.</p>
            </div>

            <div id="feat_preview" className="p-5 sm:p-8 rounded-xl sm:rounded-2xl glass-card glass-panel-hover transition-colors group">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-amber-500/10 rounded-xl flex items-center justify-center mb-4 sm:mb-6 group-hover:scale-110 transition-transform">
                <Zap className="h-5 w-5 sm:h-6 sm:w-6 text-amber-400" />
              </div>
              <h3 className="text-base sm:text-lg md:text-xl font-bold text-white">Multi-Device Web Preview</h3>
              <p className="text-xs sm:text-sm text-slate-400 mt-2 sm:mt-3 leading-relaxed">Build web-centric apps and toggle responsive previews side-by-side on simulated Desktop, Tablet, and Mobile window wrappers, keeping HMR completely active.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Languages Showcase */}
      <section id="languages" className="py-12 sm:py-20 bg-transparent border-t border-white/5 z-10 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Full Syntax & Execution Ecosystem</h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-2 sm:mt-3 max-w-xl mx-auto">Our container layers support native syntax parsing, line auto-completions, and sandboxed runner servers for major languages.</p>
          
          <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-4 mt-6 sm:mt-10">
            {['HTML', 'CSS', 'JavaScript', 'TypeScript', 'Python', 'Go', 'Rust', 'JSON', 'Markdown', 'Bash'].map((lang, idx) => (
              <span key={idx} className="px-3.5 py-2 sm:px-5 sm:py-3 rounded-lg sm:rounded-xl glass-card font-mono text-xs sm:text-sm text-indigo-300 font-semibold hover:border-indigo-500/30 hover:scale-105 transition-all cursor-default">
                {lang}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="py-12 sm:py-24 border-t border-white/5 z-10 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-10 sm:mb-16">
            <h2 className="text-2xl sm:text-3xl font-bold text-white">Endorsed by Top Engineers</h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-2 sm:mt-3">Read what software builders are saying about our cloud workspace.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-8">
            {TESTIMONIALS.map((t, i) => (
              <div key={i} className="p-5 sm:p-8 rounded-xl sm:rounded-2xl glass-card relative flex flex-col justify-between">
                <div className="absolute top-5 right-5 sm:top-8 sm:right-8 text-cyan-500/15">
                  <MessageSquare className="h-8 w-8 sm:h-10 sm:w-10" />
                </div>
                <p className="text-slate-300 italic text-xs sm:text-sm leading-relaxed mb-4 sm:mb-6">"{t.text}"</p>
                <div className="flex items-center space-x-3">
                  <img 
                    src={t.avatar} 
                    alt={t.name} 
                    referrerPolicy="no-referrer" 
                    onError={(e) => {
                      const target = e.currentTarget;
                      target.onerror = null;
                      target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(t.name)}&background=6366f1&color=fff&bold=true`;
                    }}
                    className="w-10 h-10 sm:w-12 sm:h-12 rounded-full object-cover border-2 border-indigo-500/20 shadow-md shrink-0" 
                  />
                  <div>
                    <h4 className="text-xs sm:text-sm font-semibold text-white">{t.name}</h4>
                    <span className="text-[10px] sm:text-xs text-slate-500">{t.role}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing / Free Plan */}
      <section id="pricing" className="py-12 sm:py-20 bg-transparent border-t border-white/5 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-10 sm:mb-16">
            <h2 className="text-2xl sm:text-3xl font-bold text-white">Pricing Built for Everyone</h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-2 sm:mt-3">Start coding for free. No credit card required.</p>
          </div>

          <div className="max-w-md mx-auto p-5 sm:p-8 rounded-2xl sm:rounded-3xl glass-panel relative overflow-hidden shadow-2xl accent-glow-indigo">
            <div className="absolute top-0 right-0 px-3 py-1 sm:px-4 sm:py-1.5 bg-cyan-400 text-slate-950 font-bold font-sans text-[10px] sm:text-xs rounded-bl-xl tracking-wider uppercase">
              Current Special Offer
            </div>

            <h3 className="text-xl sm:text-2xl font-bold text-white">Developer Sandbox</h3>
            <p className="text-xs sm:text-sm text-slate-400 mt-1 sm:mt-2">Perfect for side projects, learning, and collaborative building.</p>

            <div className="mt-4 sm:mt-6 flex items-baseline">
              <span className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white">$0</span>
              <span className="text-slate-500 font-medium text-xs sm:text-sm ml-2">/ forever free</span>
            </div>

            <button 
              id="btn_pricing_get_started"
              onClick={onGetStarted}
              className="mt-6 sm:mt-8 w-full py-2.5 sm:py-3.5 bg-gradient-to-r from-cyan-400 to-indigo-500 text-slate-950 text-xs sm:text-sm font-extrabold rounded-xl shadow-lg shadow-cyan-500/10 hover:shadow-cyan-400/25 hover:scale-[1.02] transition-all cursor-pointer"
            >
              Start Coding Instantly
            </button>

            <ul className="mt-6 sm:mt-8 space-y-3 sm:space-y-4 text-xs sm:text-sm text-slate-300 border-t border-slate-800/80 pt-4 sm:pt-6">
              <li className="flex items-start space-x-3">
                <span className="text-cyan-400 font-bold shrink-0">✓</span> <span>Unlimited workspaces & file creations</span>
              </li>
              <li className="flex items-start space-x-3">
                <span className="text-cyan-400 font-bold shrink-0">✓</span> <span>Full live collaborative editing with WebSockets</span>
              </li>
              <li className="flex items-start space-x-3">
                <span className="text-cyan-400 font-bold shrink-0">✓</span> <span>Real-time JS, TS, and Python compiler running</span>
              </li>
              <li className="flex items-start space-x-3">
                <span className="text-cyan-400 font-bold shrink-0">✓</span> <span>Server-side Gemini 3.5 AI coding assistance</span>
              </li>
              <li className="flex items-start space-x-3">
                <span className="text-cyan-400 font-bold shrink-0">✓</span> <span>Responsive multi-device live browser preview</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* FAQs */}
      <section id="faq" className="py-12 sm:py-24 border-t border-white/5 relative z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-10 sm:mb-16">
            <h2 className="text-2xl sm:text-3xl font-bold text-white">Frequently Asked Questions</h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-2 sm:mt-3">Got questions? We've got structural answers.</p>
          </div>

          <div className="space-y-3 sm:space-y-4">
            {FAQS.map((faq, idx) => (
              <div 
                key={idx} 
                className="glass-card rounded-xl overflow-hidden transition-all duration-200"
              >
                <button
                  onClick={() => setActiveFaq(activeFaq === idx ? null : idx)}
                  className="w-full px-4 py-4 sm:px-6 sm:py-5 flex items-center justify-between text-left hover:bg-slate-900/50 transition-colors"
                >
                  <span className="font-semibold text-white text-xs sm:text-sm md:text-base flex items-center space-x-2 sm:space-x-3">
                    <HelpCircle className="h-4 w-4 sm:h-5 sm:w-5 text-cyan-400 shrink-0" />
                    <span>{faq.question}</span>
                  </span>
                  <span className="text-slate-500 text-lg sm:text-xl font-bold ml-3 sm:ml-4">
                    {activeFaq === idx ? '−' : '+'}
                  </span>
                </button>
                {activeFaq === idx && (
                  <div className="px-4 pb-4 pt-1 sm:px-6 sm:pb-5 sm:pt-1 text-slate-400 text-xs sm:text-sm leading-relaxed border-t border-slate-900/50">
                    {faq.answer}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Close the activePolicyPage === null condition */}
        </>
      ) : null}

      {/* Conditionally Render Active Page Content with smooth slide-up animation */}
      {activePolicyPage !== null && (
        <motion.div 
          id="policy_hub_view"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="max-w-7xl mx-auto px-4 sm:px-6 pt-4 sm:pt-6 pb-12 sm:pb-16 relative z-10 min-h-[85vh] font-sans"
        >
          {/* Top Responsive Sticky Header & Breadcrumb Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6 pb-4 border-b border-white/10 sticky top-16 z-30 bg-[#03020c]/90 backdrop-blur-xl pt-2 px-1 rounded-b-xl">
            <button 
              id="btn_back_to_home"
              onClick={() => handleOpenPolicyPage(null)}
              className="inline-flex items-center space-x-2.5 px-4 py-2.5 rounded-xl bg-[#09071c] border border-cyan-500/30 hover:border-cyan-400 text-cyan-300 hover:text-white hover:bg-indigo-950/60 text-xs sm:text-sm font-bold transition-all shadow-md active:scale-95 cursor-pointer group shrink-0"
            >
              <ArrowLeft className="h-4 w-4 text-cyan-400 group-hover:-translate-x-1 transition-transform shrink-0" />
              <span>Back to Home Page</span>
            </button>

            <div className="flex items-center space-x-2 text-xs text-slate-400 font-medium">
              <button 
                onClick={() => handleOpenPolicyPage(null)} 
                className="hover:text-cyan-400 cursor-pointer bg-transparent border-none p-0 text-slate-400 text-xs font-semibold"
              >
                Home
              </button>
              <span className="text-slate-600">/</span>
              <span className="text-cyan-400 font-bold uppercase text-[10px] sm:text-[11px] tracking-wider px-2.5 py-1 rounded-lg bg-cyan-950/50 border border-cyan-500/30">
                {activePolicyPage}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left Column: Premium Interactive Sidebar (Desktop) / Sliding Pill Slider (Mobile) */}
            <div className="lg:col-span-4 lg:sticky lg:top-24 bg-[#09071c]/60 border border-white/5 rounded-2xl p-4 md:p-6 backdrop-blur-md">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 px-3 hidden lg:block">Navigation Hub</h3>
              
              {/* Mobile Quick Pills Navigation */}
              <div className="flex lg:hidden overflow-x-auto pb-2 gap-2 scrollbar-none snap-x -mx-4 px-4">
                {[
                  { id: 'creator', label: 'About Creator', icon: Sparkles },
                  { id: 'about', label: 'About Us', icon: Users },
                  { id: 'contact', label: 'Contact Us', icon: Mail },
                  { id: 'docs', label: 'Docs', icon: BookOpen },
                  { id: 'roadmap', label: 'Roadmap', icon: Calendar },
                  { id: 'changelog', label: 'Changelog', icon: Layers },
                  { id: 'privacy', label: 'Privacy', icon: Shield },
                  { id: 'terms', label: 'Terms', icon: FileText },
                  { id: 'cookie', label: 'Cookies', icon: CheckCircle },
                  { id: 'disclaimer', label: 'Disclaimer', icon: AlertTriangle },
                ].map((tab) => {
                  const IconComponent = tab.icon;
                  const isActive = activePolicyPage === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => handleOpenPolicyPage(tab.id as any)}
                      className={`flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-medium cursor-pointer transition-all shrink-0 snap-align-start ${
                        isActive 
                          ? 'bg-gradient-to-r from-indigo-500/20 to-purple-500/20 text-cyan-400 border border-cyan-500/30' 
                          : 'bg-white/5 text-slate-400 border border-transparent hover:bg-white/10'
                      }`}
                    >
                      <IconComponent className={`h-3.5 w-3.5 ${isActive ? 'text-cyan-400 animate-pulse' : 'text-slate-500'}`} />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>
 
              {/* Desktop Interactive Stacked Navigation */}
              <div className="hidden lg:flex flex-col space-y-6 text-left">
                {/* Section 1: Product Hub */}
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-3 block">Product Hub</span>
                  {[
                    { id: 'docs', label: 'Documentation', icon: BookOpen },
                    { id: 'roadmap', label: 'Future Roadmap', icon: Calendar },
                    { id: 'changelog', label: 'Changelog Updates', icon: Layers },
                  ].map((tab) => {
                    const IconComponent = tab.icon;
                    const isActive = activePolicyPage === tab.id;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => handleOpenPolicyPage(tab.id as any)}
                        className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-xs font-semibold cursor-pointer transition-all ${
                          isActive 
                            ? 'bg-gradient-to-r from-indigo-500/10 to-purple-500/10 text-cyan-400 border border-indigo-500/20 shadow-md shadow-indigo-500/5' 
                            : 'bg-transparent text-slate-400 border border-transparent hover:bg-white/5 hover:text-white'
                        }`}
                      >
                        <IconComponent className={`h-4 w-4 ${isActive ? 'text-cyan-400' : 'text-slate-500'}`} />
                        <span>{tab.label}</span>
                      </button>
                    );
                  })}
                </div>
 
                {/* Section 2: Company */}
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-3 block">Company</span>
                  {[
                    { id: 'about', label: 'About Codesyne', icon: Users },
                    { id: 'creator', label: 'About Creator', icon: Sparkles },
                    { id: 'contact', label: 'Contact Support', icon: Mail },
                  ].map((tab) => {
                    const IconComponent = tab.icon;
                    const isActive = activePolicyPage === tab.id;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => handleOpenPolicyPage(tab.id as any)}
                        className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-xs font-semibold cursor-pointer transition-all ${
                          isActive 
                            ? 'bg-gradient-to-r from-indigo-500/10 to-purple-500/10 text-cyan-400 border border-indigo-500/20 shadow-md shadow-indigo-500/5' 
                            : 'bg-transparent text-slate-400 border border-transparent hover:bg-white/5 hover:text-white'
                        }`}
                      >
                        <IconComponent className={`h-4 w-4 ${isActive ? 'text-cyan-400' : 'text-slate-500'}`} />
                        <span>{tab.label}</span>
                      </button>
                    );
                  })}
                </div>
 
                {/* Section 3: Legal & Rules */}
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-3 block">Legal Framework</span>
                  {[
                    { id: 'privacy', label: 'Privacy Policy', icon: Shield },
                    { id: 'terms', label: 'Terms of Service', icon: FileText },
                    { id: 'cookie', label: 'Cookie Policy', icon: CheckCircle },
                    { id: 'disclaimer', label: 'Platform Disclaimer', icon: AlertTriangle },
                  ].map((tab) => {
                    const IconComponent = tab.icon;
                    const isActive = activePolicyPage === tab.id;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => handleOpenPolicyPage(tab.id as any)}
                        className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-xs font-semibold cursor-pointer transition-all ${
                          isActive 
                            ? 'bg-gradient-to-r from-indigo-500/10 to-purple-500/10 text-cyan-400 border border-indigo-500/20 shadow-md shadow-indigo-500/5' 
                            : 'bg-transparent text-slate-400 border border-transparent hover:bg-white/5 hover:text-white'
                        }`}
                      >
                        <IconComponent className={`h-4 w-4 ${isActive ? 'text-cyan-400' : 'text-slate-500'}`} />
                        <span>{tab.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Right Column: Dynamic Viewer Card */}
            <div className="lg:col-span-8">
              <AnimatePresence mode="wait">
                {activePolicyPage === 'privacy' && (
                  <motion.div 
                    key="privacy"
                    initial={{ opacity: 0, y: 15 }} 
                    animate={{ opacity: 1, y: 0 }} 
                    exit={{ opacity: 0, y: -15 }}
                    className="bg-[#09071c]/80 border border-white/5 p-6 md:p-10 rounded-2xl shadow-2xl backdrop-blur-md text-left"
                  >
                    <div className="flex items-center space-x-3 mb-6">
                      <div className="p-2.5 bg-cyan-500/10 rounded-xl">
                        <Shield className="h-6 w-6 text-cyan-400" />
                      </div>
                      <div>
                        <h1 className="text-2xl md:text-3xl font-sans font-extrabold text-white">Privacy Policy</h1>
                        <p className="text-[10px] text-cyan-400 font-mono tracking-widest uppercase">CODESYNE TRUST SHIELD</p>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 mb-8 font-mono">Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
                    
                    <div className="space-y-8 text-sm text-slate-300 leading-relaxed font-sans">
                      <section className="space-y-3">
                        <h2 className="text-base font-bold text-white flex items-center space-x-2 border-b border-white/5 pb-2">
                          <span className="text-cyan-400 font-mono text-sm">1.</span> <span>Data Collection Boundaries</span>
                        </h2>
                        <p>
                          Codesyne strictly collects telemetry required to sustain sandboxed filesystems, collaborative editing environments, and active local project persitences. We track:
                        </p>
                        <ul className="list-disc pl-5 text-xs text-slate-400 space-y-2 mt-2">
                          <li>User profile credentials (full name, email credentials, avatar placeholders) provided during registrations and logins.</li>
                          <li>Workspace metadata including file tree matrices, compilation metrics, sandbox execution statistics, and file change queues.</li>
                          <li>Basic device analytics such as browser version, operating system, IP references, and performance logs.</li>
                        </ul>
                      </section>

                      <section className="space-y-3">
                        <h2 className="text-base font-bold text-white flex items-center space-x-2 border-b border-white/5 pb-2">
                          <span className="text-cyan-400 font-mono text-sm">2.</span> <span>Account Information & Security</span>
                        </h2>
                        <p>
                          User records are encrypted at rest with industry-standard hashing protocols. Credentials and workspace configurations are strictly separated to prevent accidental metadata exposure or multi-tenant database cross-talk.
                        </p>
                      </section>

                      <section className="space-y-3">
                        <h2 className="text-base font-bold text-white flex items-center space-x-2 border-b border-white/5 pb-2">
                          <span className="text-cyan-400 font-mono text-sm">3.</span> <span>Cookieless Authentication Compliance</span>
                        </h2>
                        <p>
                          We prioritize a cookie-free compliance pipeline. Standard logins do not drop commercial tracking cookies. All user authorization cycles rely entirely on self-contained secure JSON Web Tokens (JWT) preserved in localized browser storage.
                        </p>
                      </section>

                      <section className="space-y-3">
                        <h2 className="text-base font-bold text-white flex items-center space-x-2 border-b border-white/5 pb-2">
                          <span className="text-cyan-400 font-mono text-sm">4.</span> <span>Security Safeguards</span>
                        </h2>
                        <p>
                          Compilation scripts and real-time previews are locked in highly secure, isolated sandboxes. We execute SSL/TLS handshakes across all communication rails, shielding file edits from unauthorized intercept or interception.
                        </p>
                      </section>

                      <section className="space-y-3">
                        <h2 className="text-base font-bold text-white flex items-center space-x-2 border-b border-white/5 pb-2">
                          <span className="text-cyan-400 font-mono text-sm">5.</span> <span>User Sovereignty & Rights</span>
                        </h2>
                        <p>
                          You retain complete ownership and sovereignty of your data. You may download full file directories in a structured ZIP archive, clear local cached workspaces instantly in 1 click, or contact our support team to request permanent account deletions.
                        </p>
                      </section>

                      <section className="space-y-3">
                        <h2 className="text-base font-bold text-white flex items-center space-x-2 border-b border-white/5 pb-2">
                          <span className="text-cyan-400 font-mono text-sm">6.</span> <span>Contact Information</span>
                        </h2>
                        <p>
                          For any inquiries regarding data sovereignty, audits, or structural deletion requests, reach out directly to our privacy officer at:
                        </p>
                        <p className="text-cyan-400 font-mono text-xs bg-cyan-400/5 border border-cyan-400/10 rounded-lg p-3 inline-block">
                          nakulsharma02011@gmail.com
                        </p>
                      </section>
                    </div>
                  </motion.div>
                )}

                {activePolicyPage === 'terms' && (
                  <motion.div 
                    key="terms"
                    initial={{ opacity: 0, y: 15 }} 
                    animate={{ opacity: 1, y: 0 }} 
                    exit={{ opacity: 0, y: -15 }}
                    className="bg-[#09071c]/80 border border-white/5 p-6 md:p-10 rounded-2xl shadow-2xl backdrop-blur-md text-left"
                  >
                    <div className="flex items-center space-x-3 mb-6">
                      <div className="p-2.5 bg-indigo-500/10 rounded-xl">
                        <FileText className="h-6 w-6 text-indigo-400" />
                      </div>
                      <div>
                        <h1 className="text-2xl md:text-3xl font-sans font-extrabold text-white">Terms of Service</h1>
                        <p className="text-[10px] text-indigo-400 font-mono tracking-widest uppercase">USER CONTRACT RULES</p>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 mb-8 font-mono">Effective Date: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
                    
                    <div className="space-y-8 text-sm text-slate-300 leading-relaxed font-sans text-left">
                      <section className="space-y-3">
                        <h2 className="text-base font-bold text-white flex items-center space-x-2 border-b border-white/5 pb-2">
                          <span className="text-indigo-400 font-mono text-sm">1.</span> <span>User Responsibilities & Credentials</span>
                        </h2>
                        <p>
                          By accessing Codesyne, you take full ownership of preserving the confidentiality of your session tokens and security states. You are entirely responsible for all file alterations and workspace operations initiated under your credentials.
                        </p>
                      </section>

                      <section className="space-y-3">
                        <h2 className="text-base font-bold text-white flex items-center space-x-2 border-b border-white/5 pb-2">
                          <span className="text-indigo-400 font-mono text-sm">2.</span> <span>Acceptable Use & Sandbox Safety</span>
                        </h2>
                        <p>
                          Codesyne provides sandboxed compute and compiler services. You agree not to exploit or flood terminal runtimes, server-side bridges, or file synchronizations. Specifically, you agree NOT to utilize execution sandboxes for:
                        </p>
                        <ul className="list-disc pl-5 text-xs text-slate-400 space-y-2 mt-2">
                          <li>Cryptocurrency harvesting, coin mining, or unauthorized proxy servers.</li>
                          <li>Deploying malicious tracking pixels, virus scripts, DDoS packages, or phishing engines.</li>
                          <li>Inundating network routes with spam loops intended to degrade global system availability.</li>
                        </ul>
                      </section>

                      <section className="space-y-3">
                        <h2 className="text-base font-bold text-white flex items-center space-x-2 border-b border-white/5 pb-2">
                          <span className="text-indigo-400 font-mono text-sm">3.</span> <span>Account Rules & Compute Quotas</span>
                        </h2>
                        <p>
                          Free sandboxes are bounded by structural bandwidth and cache quotas. Codesyne reserves the right to sweep stale, inactive file trees (with no workspace changes over 90 consecutive days) to keep servers clean.
                        </p>
                      </section>

                      <section className="space-y-3">
                        <h2 className="text-base font-bold text-white flex items-center space-x-2 border-b border-white/5 pb-2">
                          <span className="text-indigo-400 font-mono text-sm">4.</span> <span>Intellectual Property Ownership</span>
                        </h2>
                        <p>
                          Any source code, config file, project asset, or application layout you write inside Codesyne remains **100% your exclusive intellectual property**. Codesyne makes zero legal claims or licensing requests regarding your workspace contents.
                        </p>
                      </section>

                      <section className="space-y-3">
                        <h2 className="text-base font-bold text-white flex items-center space-x-2 border-b border-white/5 pb-2">
                          <span className="text-indigo-400 font-mono text-sm">5.</span> <span>Limitation of Liability</span>
                        </h2>
                        <p>
                          CODSYNE AND ITS AFFILIATES DELIVER SYSTEMS ON AN "AS IS" AND "AS AVAILABLE" BASE. We provide no structural warranties regarding compiler uptime, instant syncing SLA metrics, or loss of uncommitted local files.
                        </p>
                      </section>

                      <section className="space-y-3">
                        <h2 className="text-base font-bold text-white flex items-center space-x-2 border-b border-white/5 pb-2">
                          <span className="text-indigo-400 font-mono text-sm">6.</span> <span>Account Termination Protocols</span>
                        </h2>
                        <p>
                          We reserve the sole discretion to suspend user logins, revoke workspace tokens, or delete sandboxes immediately upon discovery of unacceptable use violations.
                        </p>
                      </section>
                    </div>
                  </motion.div>
                )}

                {activePolicyPage === 'cookie' && (
                  <motion.div 
                    key="cookie"
                    initial={{ opacity: 0, y: 15 }} 
                    animate={{ opacity: 1, y: 0 }} 
                    exit={{ opacity: 0, y: -15 }}
                    className="bg-[#09071c]/80 border border-white/5 p-6 md:p-10 rounded-2xl shadow-2xl backdrop-blur-md text-left"
                  >
                    <div className="flex items-center space-x-3 mb-6">
                      <div className="p-2.5 bg-emerald-500/10 rounded-xl">
                        <CheckCircle className="h-6 w-6 text-emerald-400" />
                      </div>
                      <div>
                        <h1 className="text-2xl md:text-3xl font-sans font-extrabold text-white">Cookie Policy</h1>
                        <p className="text-[10px] text-emerald-400 font-mono tracking-widest uppercase">ZERO-TRACKING COMPLIANCE</p>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 mb-8 font-mono">Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
                    
                    <div className="space-y-8 text-sm text-slate-300 leading-relaxed font-sans text-left">
                      <section className="space-y-3">
                        <h2 className="text-base font-bold text-white flex items-center space-x-2 border-b border-white/5 pb-2">
                          <span className="text-emerald-400 font-mono text-sm">1.</span> <span>Types of Cookies We Avoid</span>
                        </h2>
                        <p>
                          Codesyne is engineered with privacy at its center. We do **not** use marketing cookies, tracking pixels, behavioral cookies, or third-party advertising cookies of any description. 
                        </p>
                      </section>

                      <section className="space-y-3">
                        <h2 className="text-base font-bold text-white flex items-center space-x-2 border-b border-white/5 pb-2">
                          <span className="text-emerald-400 font-mono text-sm">2.</span> <span>Functional Client Storage Purpose</span>
                        </h2>
                        <p>
                          To maintain your workspaces, custom keybindings, terminal histories, and PWA configurations, we utilize localized web storage primitives such as:
                        </p>
                        <ul className="list-disc pl-5 text-xs text-slate-400 space-y-2 mt-2">
                          <li><strong className="text-white">localStorage</strong>: Keeps login JWT parameters and offline visual configurations active.</li>
                          <li><strong className="text-white">IndexedDB</strong>: Seamlessly stores local file trees and compiler caches so the IDE boots instantly offline.</li>
                          <li><strong className="text-white">SessionStorage</strong>: Manages collaborative room references and cursor tracking identifiers.</li>
                        </ul>
                      </section>

                      <section className="space-y-3">
                        <h2 className="text-base font-bold text-white flex items-center space-x-2 border-b border-white/5 pb-2">
                          <span className="text-emerald-400 font-mono text-sm">3.</span> <span>Managing Cache Storage</span>
                        </h2>
                        <p>
                          You hold absolute command over this metadata. At any moment, triggering your browser's "Clear Site Data" or "Clear History" options will instantly wipe all active local files and saved settings from the device.
                        </p>
                      </section>
                    </div>
                  </motion.div>
                )}

                {activePolicyPage === 'disclaimer' && (
                  <motion.div 
                    key="disclaimer"
                    initial={{ opacity: 0, y: 15 }} 
                    animate={{ opacity: 1, y: 0 }} 
                    exit={{ opacity: 0, y: -15 }}
                    className="bg-[#09071c]/80 border border-white/5 p-6 md:p-10 rounded-2xl shadow-2xl backdrop-blur-md text-left"
                  >
                    <div className="flex items-center space-x-3 mb-6">
                      <div className="p-2.5 bg-amber-500/10 rounded-xl">
                        <AlertTriangle className="h-6 w-6 text-amber-400" />
                      </div>
                      <div>
                        <h1 className="text-2xl md:text-3xl font-sans font-extrabold text-white">Disclaimer</h1>
                        <p className="text-[10px] text-amber-400 font-mono tracking-widest uppercase">LIABILITY SCOPE</p>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 mb-8 font-mono">Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
                    
                    <div className="space-y-8 text-sm text-slate-300 leading-relaxed font-sans text-left">
                      <section className="space-y-3">
                        <h2 className="text-base font-bold text-white flex items-center space-x-2 border-b border-white/5 pb-2">
                          <span className="text-amber-400 font-mono text-sm">1.</span> <span>General Playground Information</span>
                        </h2>
                        <p>
                          All information, compilers, sandboxes, and file engines featured on Codesyne are delivered strictly for developmental purposes. Codesyne provides a high-performance web runtime environment, but acts as a sandbox, not a replacement for local system backups.
                        </p>
                      </section>

                      <section className="space-y-3">
                        <h2 className="text-base font-bold text-white flex items-center space-x-2 border-b border-white/5 pb-2">
                          <span className="text-amber-400 font-mono text-sm">2.</span> <span>No Compilation Warranties</span>
                        </h2>
                        <p>
                          CODSYNE GIVES NO EXPLICIT WARRANTY OR ASSURANCE REGARDING COMPLIANCE RUNS, TERMINAL EXECUTION CORRECTNESS, OR PEER COLLABORATION SPEED. Code compiler engines depend heavily on client-side JS limits and connection rails.
                        </p>
                      </section>

                      <section className="space-y-3">
                        <h2 className="text-base font-bold text-white flex items-center space-x-2 border-b border-white/5 pb-2">
                          <span className="text-amber-400 font-mono text-sm">3.</span> <span>External Library Delivery CDN Links</span>
                        </h2>
                        <p>
                          Codesyne references and loads static CDN bundles (e.g. unpkg, esm.sh) to bootstrap package registries. We possess zero authority or liability for the correctness, stability, or licensing of external scripts called by your code.
                        </p>
                      </section>

                      <section className="space-y-3">
                        <h2 className="text-base font-bold text-white flex items-center space-x-2 border-b border-white/5 pb-2">
                          <span className="text-amber-400 font-mono text-sm">4.</span> <span>Limitation of Financial and Code Liability</span>
                        </h2>
                        <p>
                          UNDER NO CIRCUMSTANCES SHALL CODSYNE BE HELD ACCOUNTABLE FOR REVENUE LOSSES, REPUTATIONAL DAMAGE, OR CORRUPTED SYSTEM DIRECTORIES CAUSE BY LOGICAL BUGS IN YOUR COMPILED SCRIPTS OR UNCOMMITTABLE LOCAL STORAGE EXPIRY EVENTS.
                        </p>
                      </section>
                    </div>
                  </motion.div>
                )}

                {activePolicyPage === 'about' && (
                  <motion.div 
                    key="about"
                    initial={{ opacity: 0, y: 15 }} 
                    animate={{ opacity: 1, y: 0 }} 
                    exit={{ opacity: 0, y: -15 }}
                    className="bg-[#09071c]/80 border border-white/5 p-6 md:p-10 rounded-2xl shadow-2xl backdrop-blur-md text-left"
                  >
                    <div className="flex items-center space-x-3 mb-6">
                      <div className="p-2.5 bg-purple-500/10 rounded-xl">
                        <Users className="h-6 w-6 text-purple-400" />
                      </div>
                      <div>
                        <h1 className="text-2xl md:text-3xl font-sans font-extrabold text-white">About Codesyne</h1>
                        <p className="text-[10px] text-purple-400 font-mono tracking-widest uppercase">THE CODESYNE VISION</p>
                      </div>
                    </div>
                    
                    <div className="space-y-8 text-sm text-slate-300 leading-relaxed font-sans text-left">
                      <p className="text-base md:text-lg text-slate-200">
                        Codesyne was conceptualized with one fundamental thesis: <strong className="text-cyan-400 font-bold">your developer workflow should never be bound to a single computer.</strong>
                      </p>
                      <p>
                        We are a group of developers, system engineers, and layout architects dedicated to creating a collaborative virtual IDE matching the low latency, precision layout, and feature density of a desktop compiler, but with seamless instant cloud integrations natively available.
                      </p>
                      
                      {/* Grid Stats */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 my-8">
                        <div className="p-4 bg-white/5 border border-white/5 rounded-xl text-center">
                          <span className="block text-xl md:text-2xl font-extrabold text-cyan-400 font-sans">5M+</span>
                          <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold font-sans">Sandboxes Run</span>
                        </div>
                        <div className="p-4 bg-white/5 border border-white/5 rounded-xl text-center">
                          <span className="block text-xl md:text-2xl font-extrabold text-purple-400 font-sans">250K+</span>
                          <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold font-sans">Devs Connected</span>
                        </div>
                        <div className="p-4 bg-white/5 border border-white/5 rounded-xl text-center">
                          <span className="block text-xl md:text-2xl font-extrabold text-pink-400 font-sans">99.99%</span>
                          <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold font-sans">Uptime Metric</span>
                        </div>
                      </div>

                      <section className="space-y-3">
                        <h2 className="text-base font-bold text-white">Our Engineering Core</h2>
                        <p className="text-xs text-slate-400 leading-relaxed">
                          Codesyne combines secure virtual directories, fast React interfaces, client-side offline service workers, and instantaneous peer synchronization channels via highly performant WebSocket arrays. This guarantees you can write, verify, run, and share your projects with zero friction.
                        </p>
                      </section>

                      <section className="space-y-3">
                        <h2 className="text-base font-bold text-white">Our Mission</h2>
                        <p className="text-xs text-slate-400 leading-relaxed">
                          We believe in full accessibility for engineers globally. By avoiding heavy cloud vm pricing gates and moving core compilation loops into safe client-side containers, we provide full, responsive programming freedom to developers regardless of device specifications.
                        </p>
                      </section>

                      {/* Creator Banner inside About Us */}
                      <div className="p-4 rounded-xl bg-gradient-to-r from-cyan-500/10 via-indigo-500/10 to-purple-500/10 border border-cyan-500/20 flex flex-col sm:flex-row items-center justify-between gap-4 mt-6">
                        <div className="flex items-center space-x-3">
                          <div className="p-2 bg-cyan-500/20 rounded-lg">
                            <Sparkles className="h-5 w-5 text-cyan-400" />
                          </div>
                          <div>
                            <h3 className="text-xs font-bold text-white">Meet the Founder & Lead Developer</h3>
                            <p className="text-[11px] text-slate-400">Learn more about Nakul Sharma and the vision behind CodeSyne.</p>
                          </div>
                        </div>
                        <button
                          onClick={() => setActivePolicyPage('creator')}
                          className="px-3.5 py-1.5 bg-cyan-400 hover:bg-cyan-300 text-slate-950 text-xs font-bold rounded-lg transition-all shrink-0 cursor-pointer shadow-md shadow-cyan-400/20"
                        >
                          About Creator
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}

                {activePolicyPage === 'creator' && (
                  <motion.div 
                    key="creator"
                    initial={{ opacity: 0, y: 15 }} 
                    animate={{ opacity: 1, y: 0 }} 
                    exit={{ opacity: 0, y: -15 }}
                    className="bg-[#09071c]/80 border border-white/5 p-4 sm:p-6 md:p-10 rounded-2xl shadow-2xl backdrop-blur-md text-left"
                  >
                    <div className="flex items-center space-x-3 mb-6">
                      <div className="p-2.5 bg-gradient-to-tr from-cyan-500/20 to-indigo-500/20 rounded-xl border border-cyan-500/30 shrink-0">
                        <User className="h-6 w-6 text-cyan-400" />
                      </div>
                      <div>
                        <h1 className="text-xl sm:text-2xl md:text-3xl font-sans font-extrabold text-white">About the Creator</h1>
                        <p className="text-[10px] text-cyan-400 font-mono tracking-widest uppercase">FOUNDER & LEAD DEVELOPER</p>
                      </div>
                    </div>

                    <div className="space-y-6 text-sm text-slate-300 leading-relaxed font-sans">
                      <div className="p-5 sm:p-6 md:p-8 bg-gradient-to-br from-indigo-950/40 via-[#0c0824] to-[#080516] border border-indigo-500/20 rounded-2xl relative overflow-hidden shadow-2xl">
                        <div className="absolute top-0 right-0 w-72 h-72 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
                        
                        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 md:gap-6 relative z-10 text-center sm:text-left">
                          {/* Avatar & Badge Stack */}
                          <div className="flex flex-col items-center shrink-0">
                            <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl bg-gradient-to-tr from-cyan-400 via-indigo-500 to-purple-600 p-1 shadow-lg shadow-cyan-500/20">
                              <div className="w-full h-full bg-[#080516] rounded-[14px] flex items-center justify-center text-3xl font-black text-white tracking-wider">
                                NS
                              </div>
                            </div>
                            {/* Perfectly centered Founder badge below avatar */}
                            <span className="mt-2.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-[11px] font-bold tracking-wide font-mono flex items-center gap-1.5 shadow-md">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                              Founder
                            </span>
                          </div>

                          <div className="space-y-4 flex-1 w-full">
                            <div>
                              <h2 className="text-xl sm:text-2xl md:text-3xl font-black text-white tracking-tight">Nakul Sharma</h2>
                              <p className="text-xs sm:text-sm font-semibold text-cyan-400 font-mono tracking-wide mt-1">
                                Founder, CEO, and Lead Developer of CodeSyne
                              </p>
                            </div>

                            <div className="space-y-3 text-xs sm:text-sm text-slate-300 leading-relaxed border-t border-white/10 pt-4">
                              <p>
                                <strong className="text-white">Nakul Sharma</strong> is the Founder, CEO, and Lead Developer of <span className="text-cyan-300 font-semibold">CodeSyne</span>.
                              </p>

                              <p>
                                CodeSyne is an AI-powered coding platform created to help developers and students write, run, debug, and manage code efficiently using modern AI technology.
                              </p>

                              <p>
                                This project was designed and developed with a focus on speed, simplicity, and innovation to make coding more accessible for everyone.
                              </p>
                            </div>

                            <div className="pt-4 mt-4 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4">
                              <div className="text-center sm:text-left w-full sm:w-auto">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Contact Email</span>
                                <a 
                                  href="mailto:nakulsharma02011@gmail.com" 
                                  className="text-xs sm:text-sm font-mono font-bold text-cyan-300 hover:text-cyan-200 underline decoration-cyan-500/40 hover:decoration-cyan-300 transition-all break-all"
                                >
                                  nakulsharma02011@gmail.com
                                </a>
                              </div>

                              <div className="flex items-center space-x-2.5 w-full sm:w-auto justify-center sm:justify-end">
                                <button
                                  type="button"
                                  onClick={() => handleCopyEmail('nakulsharma02011@gmail.com')}
                                  className="px-3.5 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-semibold text-slate-200 transition-all flex items-center space-x-2 cursor-pointer active:scale-95 shrink-0"
                                >
                                  {copiedEmail ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5 text-cyan-400" />}
                                  <span>{copiedEmail ? 'Copied!' : 'Copy Email'}</span>
                                </button>

                                <a
                                  href="mailto:nakulsharma02011@gmail.com"
                                  className="px-4 py-2 bg-gradient-to-r from-cyan-400 to-indigo-500 hover:from-cyan-300 hover:to-indigo-400 text-slate-950 font-bold rounded-xl text-xs transition-all flex items-center space-x-1.5 shadow-md shadow-cyan-500/20 shrink-0"
                                >
                                  <Mail className="h-3.5 w-3.5" />
                                  <span>Send Email</span>
                                </a>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {activePolicyPage === 'contact' && (
                  <motion.div 
                    key="contact"
                    initial={{ opacity: 0, y: 15 }} 
                    animate={{ opacity: 1, y: 0 }} 
                    exit={{ opacity: 0, y: -15 }}
                    className="bg-[#09071c]/80 border border-white/5 p-4 sm:p-6 md:p-10 rounded-2xl shadow-2xl backdrop-blur-md text-left"
                  >
                    <div className="flex items-center space-x-3 mb-2">
                      <div className="p-2.5 bg-cyan-500/10 border border-cyan-500/20 rounded-xl">
                        <Mail className="h-6 w-6 text-cyan-400" />
                      </div>
                      <div>
                        <h1 className="text-xl sm:text-2xl md:text-3xl font-sans font-extrabold text-white">Contact Us</h1>
                        <p className="text-[10px] text-cyan-400 font-mono tracking-widest uppercase">SECURE COMMUNICATION RELAY</p>
                      </div>
                    </div>
                    <p className="text-slate-400 text-xs mb-6">
                      Reach our core engineering desk directly. Brevo-powered transactional routing ensures verified delivery.
                    </p>

                    {/* Success State */}
                    {contactSuccess ? (
                      <motion.div 
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="p-8 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-center space-y-4 shadow-xl shadow-emerald-500/5"
                      >
                        <div className="w-14 h-14 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-2 border border-emerald-500/30">
                          <CheckCircle className="h-7 w-7 text-emerald-400" />
                        </div>
                        <h3 className="text-xl font-bold text-white">Message Securely Transmitted</h3>
                        <p className="text-slate-300 text-xs sm:text-sm leading-relaxed max-w-md mx-auto font-sans">
                          Thank you! Your inquiry has been delivered directly to our founder & lead engineer (<strong className="text-cyan-300">nakulsharma02011@gmail.com</strong>). A reply will be sent to your verified email address.
                        </p>
                        <button 
                          onClick={() => {
                            setContactSuccess(false);
                            setPendingVerification(false);
                            setIsEmailVerified(!!currentUser);
                            setVerificationToken(null);
                            setVerificationSuccessMsg(null);
                          }}
                          className="px-6 py-2.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 hover:text-white rounded-xl text-xs font-semibold cursor-pointer transition-all border border-emerald-500/30 shadow-md"
                        >
                          Send Another Message
                        </button>
                      </motion.div>
                    ) : pendingVerification ? (
                      /* Guest Pending Verification State (Check Email) */
                      <motion.div 
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="p-6 sm:p-8 bg-gradient-to-b from-[#0e0a29] to-[#080517] border border-cyan-500/30 rounded-2xl text-center space-y-5 shadow-2xl relative overflow-hidden"
                      >
                        <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
                        
                        <div className="w-16 h-16 bg-cyan-500/10 rounded-2xl flex items-center justify-center mx-auto mb-2 border border-cyan-500/30 shadow-lg shadow-cyan-500/20 relative">
                          <Mail className="h-8 w-8 text-cyan-400 animate-pulse" />
                          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-cyan-400 ring-4 ring-[#080517] animate-ping" />
                        </div>

                        <div className="space-y-2.5 max-w-lg mx-auto">
                          <h3 className="text-lg sm:text-xl font-bold text-white">Check Your Email to Verify & Transmit</h3>
                          <div className="text-xs sm:text-sm text-slate-300 leading-relaxed font-sans flex flex-col items-center gap-1.5 pt-1">
                            <span>We have dispatched a secure verification link to:</span>
                            <span className="inline-block font-mono font-bold text-cyan-300 bg-cyan-950/80 border border-cyan-500/40 px-3.5 py-1 rounded-xl shadow-inner max-w-full overflow-hidden text-ellipsis select-all">
                              {pendingEmail}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 leading-relaxed pt-1">
                            To ensure authenticity and prevent automated spam, please click the link in your inbox. Once clicked, your message will be automatically finalized and forwarded to our engineering desk.
                          </p>
                        </div>

                        {resendSuccess && (
                          <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs rounded-xl max-w-md mx-auto">
                            {resendSuccess}
                          </div>
                        )}

                        {verificationError && (
                          <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs rounded-xl max-w-md mx-auto">
                            {verificationError}
                          </div>
                        )}

                        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                          <button
                            type="button"
                            onClick={handleResendVerification}
                            disabled={resendCooldown > 0 || resendLoading}
                            className="w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-cyan-400 to-indigo-500 text-slate-950 font-bold rounded-xl text-xs shadow-md shadow-cyan-500/20 hover:scale-105 active:scale-95 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center space-x-2"
                          >
                            {resendLoading ? (
                              <>
                                <span className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                                <span>Sending...</span>
                              </>
                            ) : resendCooldown > 0 ? (
                              <span>Resend in {resendCooldown}s</span>
                            ) : (
                              <>
                                <Mail className="w-3.5 h-3.5" />
                                <span>Resend Verification Email</span>
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setPendingVerification(false);
                              setVerificationError(null);
                              setResendSuccess(null);
                            }}
                            className="w-full sm:w-auto px-4 py-2.5 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white rounded-xl text-xs font-semibold cursor-pointer transition-all border border-white/10"
                          >
                            Edit Inquiry / Change Email
                          </button>
                        </div>
                      </motion.div>
                    ) : (
                      /* Active Form Column */
                      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                        <div className="lg:col-span-7">
                          {/* Alert Banners */}
                          {verificationSuccessMsg && (
                            <div className="mb-4 p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs flex items-center space-x-2.5">
                              <CheckCircle className="h-4 w-4 shrink-0 text-emerald-400" />
                              <span>{verificationSuccessMsg}</span>
                            </div>
                          )}

                          {verificationError && (
                            <div className="mb-4 p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center space-x-2.5">
                              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
                              <span>{verificationError}</span>
                            </div>
                          )}

                          <form onSubmit={handleContactSubmit} className="space-y-4 text-left">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
                              <div className="space-y-1.5 text-left">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Full Name</label>
                                <input 
                                  type="text" 
                                  required
                                  value={contactName}
                                  onChange={(e) => setContactName(e.target.value)}
                                  placeholder="e.g. John Doe"
                                  className="w-full bg-[#080516] border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-600 outline-none transition-all focus:border-cyan-500/50"
                                />
                              </div>
                              <div className="space-y-1.5 text-left">
                                <div className="flex items-center justify-between">
                                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Email Address</label>
                                  {currentUser ? (
                                    <div className="flex items-center space-x-2">
                                      <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-semibold">
                                        <CheckCircle className="w-2.5 h-2.5" />
                                        <span>{useCustomEmail ? 'Custom Email' : 'Verified User'}</span>
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setUseCustomEmail(!useCustomEmail);
                                          if (!useCustomEmail) {
                                            setContactEmail('');
                                          } else {
                                            setContactEmail(currentUser.email);
                                          }
                                        }}
                                        className="text-[9px] text-cyan-400 hover:text-cyan-300 underline underline-offset-2 cursor-pointer transition-colors"
                                      >
                                        {useCustomEmail ? 'Use Account Email' : 'Change Email'}
                                      </button>
                                    </div>
                                  ) : verificationToken ? (
                                    <div className="flex items-center space-x-2">
                                      <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-semibold">
                                        <CheckCircle className="w-2.5 h-2.5" />
                                        <span>Email Verified</span>
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setVerificationToken(null);
                                          setIsEmailVerified(false);
                                          setVerificationSuccessMsg(null);
                                          localStorage.removeItem('codesyne_pending_contact_token');
                                          localStorage.removeItem('codesyne_last_contact_verified');
                                        }}
                                        className="text-[9px] text-amber-400 hover:text-amber-300 underline underline-offset-2 cursor-pointer transition-colors"
                                      >
                                        Change Email
                                      </button>
                                    </div>
                                  ) : null}
                                </div>
                                <input 
                                  type="email" 
                                  required
                                  readOnly={Boolean((currentUser && !useCustomEmail) || verificationToken)}
                                  value={currentUser && !useCustomEmail ? currentUser.email : contactEmail}
                                  onChange={(e) => setContactEmail(e.target.value)}
                                  placeholder="youremail@example.com"
                                  className={`w-full border rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-600 outline-none transition-all ${
                                    (currentUser && !useCustomEmail) || verificationToken 
                                      ? 'bg-slate-900/60 border-emerald-500/30 text-slate-300 cursor-not-allowed' 
                                      : 'bg-[#080516] border-white/10 focus:border-cyan-500/50'
                                  }`}
                                />
                              </div>
                            </div>

                            <div className="space-y-1.5 text-left relative" ref={subjectDropdownRef}>
                              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                                <span>Inquiry Topic / Subject</span>
                                <span className="text-[9px] text-cyan-400/80 font-normal">Select category</span>
                              </label>
                              
                              {/* Custom Dropdown Trigger */}
                              {(() => {
                                const selectedSubjectObj = CONTACT_SUBJECTS.find(s => s.id === contactSubject) || CONTACT_SUBJECTS[0];
                                const SelectedIcon = selectedSubjectObj.icon;
                                return (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => setIsSubjectDropdownOpen(!isSubjectDropdownOpen)}
                                      className={`w-full bg-[#080516] border ${isSubjectDropdownOpen ? 'border-cyan-400/60 shadow-lg shadow-cyan-500/10 ring-1 ring-cyan-500/30' : 'border-white/10 hover:border-white/20'} rounded-xl px-3.5 py-2.5 text-xs text-white outline-none transition-all flex items-center justify-between cursor-pointer group`}
                                    >
                                      <div className="flex items-center space-x-2.5 min-w-0">
                                        <div className={`p-1.5 rounded-lg border flex-shrink-0 ${selectedSubjectObj.color}`}>
                                          <SelectedIcon className="w-3.5 h-3.5" />
                                        </div>
                                        <div className="text-left truncate">
                                          <div className="text-xs font-semibold text-white group-hover:text-cyan-300 transition-colors truncate">
                                            {selectedSubjectObj.label}
                                          </div>
                                          <div className="text-[10px] text-slate-400 truncate hidden sm:block">
                                            {selectedSubjectObj.desc}
                                          </div>
                                        </div>
                                      </div>
                                      <div className="flex items-center space-x-2 flex-shrink-0 ml-2">
                                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-slate-300 font-medium border border-white/5">
                                          {selectedSubjectObj.badge}
                                        </span>
                                        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isSubjectDropdownOpen ? 'rotate-180 text-cyan-400' : ''}`} />
                                      </div>
                                    </button>

                                    {/* Dropdown Menu */}
                                    <AnimatePresence>
                                      {isSubjectDropdownOpen && (
                                        <motion.div
                                          initial={{ opacity: 0, y: -4, scale: 0.98 }}
                                          animate={{ opacity: 1, y: 0, scale: 1 }}
                                          exit={{ opacity: 0, y: -4, scale: 0.98 }}
                                          transition={{ duration: 0.15, ease: 'easeOut' }}
                                          className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-[#0c081d] border border-cyan-500/30 rounded-xl shadow-2xl shadow-black/80 backdrop-blur-xl p-1.5 space-y-1 overflow-hidden"
                                        >
                                          {CONTACT_SUBJECTS.map((item) => {
                                            const ItemIcon = item.icon;
                                            const isSelected = item.id === contactSubject;
                                            return (
                                              <button
                                                key={item.id}
                                                type="button"
                                                onClick={() => {
                                                  setContactSubject(item.id);
                                                  setIsSubjectDropdownOpen(false);
                                                }}
                                                className={`w-full text-left px-3 py-2 rounded-lg transition-all flex items-center justify-between cursor-pointer ${isSelected ? 'bg-cyan-500/15 border border-cyan-500/30 text-white' : 'hover:bg-white/5 text-slate-300 border border-transparent'}`}
                                              >
                                                <div className="flex items-center space-x-2.5 min-w-0">
                                                  <div className={`p-1.5 rounded-lg border flex-shrink-0 ${item.color}`}>
                                                    <ItemIcon className="w-3.5 h-3.5" />
                                                  </div>
                                                  <div className="min-w-0">
                                                    <div className={`text-xs font-semibold ${isSelected ? 'text-cyan-300' : 'text-slate-200'}`}>
                                                      {item.label}
                                                    </div>
                                                    <div className="text-[10px] text-slate-400 truncate max-w-[220px] sm:max-w-xs">
                                                      {item.desc}
                                                    </div>
                                                  </div>
                                                </div>
                                                <div className="flex items-center space-x-1.5 flex-shrink-0 ml-2">
                                                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-slate-400 font-medium">
                                                    {item.badge}
                                                  </span>
                                                  {isSelected && <Check className="w-3.5 h-3.5 text-cyan-400" />}
                                                </div>
                                              </button>
                                            );
                                          })}
                                        </motion.div>
                                      )}
                                    </AnimatePresence>
                                  </>
                                );
                              })()}
                            </div>

                            <div className="space-y-1.5 text-left">
                              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider text-left">Message</label>
                              <textarea 
                                required
                                rows={5}
                                value={contactMessage}
                                onChange={(e) => setContactMessage(e.target.value)}
                                placeholder="Type your message or inquiry here..."
                                className="w-full bg-[#080516] border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-600 outline-none transition-all resize-none focus:border-cyan-500/50"
                              />
                            </div>

                            <button 
                              type="submit"
                              disabled={contactLoading}
                              className="w-full py-3 bg-gradient-to-r from-cyan-400 to-indigo-500 text-slate-950 font-bold rounded-xl shadow-lg shadow-cyan-400/10 hover:shadow-cyan-400/30 transition-all flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
                            >
                              {contactLoading ? (
                                <span className="flex items-center space-x-2">
                                  <span className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                                  <span>{verificationToken ? 'Confirming Transmission...' : 'Processing Request...'}</span>
                                </span>
                              ) : verificationToken ? (
                                <span>Confirm & Transmit Verified Inquiry</span>
                              ) : currentUser ? (
                                <span>Transmit Secure Inquiry</span>
                              ) : (
                                <span>Send Verification & Submit Inquiry</span>
                              )}
                            </button>
                          </form>
                        </div>

                        {/* Direct Metadata Column */}
                        <div className="lg:col-span-5 space-y-6">
                          <div className="bg-white/5 border border-white/5 p-5 rounded-2xl space-y-4">
                            <h3 className="text-xs font-bold text-white uppercase tracking-wider">Direct Desk Channels</h3>
                            
                            <div className="flex items-start space-x-3 text-xs">
                              <Mail className="h-4 w-4 text-cyan-400 shrink-0 mt-0.5" />
                              <div>
                                <span className="block text-slate-400 font-medium">Core Founder Desk</span>
                                <a href="mailto:nakulsharma02011@gmail.com" className="text-white hover:text-cyan-400 font-mono">nakulsharma02011@gmail.com</a>
                              </div>
                            </div>

                            <div className="flex items-start space-x-3 text-xs border-t border-white/5 pt-3">
                              <Github className="h-4 w-4 text-purple-400 shrink-0 mt-0.5" />
                              <div>
                                <span className="block text-slate-400 font-medium">Open Source Repository</span>
                                <a 
                                  href="https://github.com/codesyne-ide/codesyne" 
                                  target="_blank" 
                                  referrerPolicy="no-referrer"
                                  className="text-white hover:text-purple-400 font-mono flex items-center space-x-1"
                                >
                                  <span>github.com/codesyne-ide</span>
                                  <ArrowUpRight className="h-3 w-3 inline-block" />
                                </a>
                              </div>
                            </div>
                          </div>

                          <div className="p-5 border border-cyan-500/10 bg-cyan-500/5 rounded-2xl">
                            <span className="text-[10px] font-bold text-cyan-400 tracking-wider uppercase block mb-1">🛡️ Anti-Spam Security Protocol</span>
                            <p className="text-[11px] text-slate-400 leading-relaxed">
                              Guest inquiries require a one-click email confirmation to protect our founder desk against spam robots. Logged-in accounts transmit immediately without extra verification.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}

                {activePolicyPage === 'docs' && (
                  <motion.div 
                    key="docs"
                    initial={{ opacity: 0, y: 15 }} 
                    animate={{ opacity: 1, y: 0 }} 
                    exit={{ opacity: 0, y: -15 }}
                    className="bg-[#09071c]/80 border border-white/5 p-6 md:p-10 rounded-2xl shadow-2xl backdrop-blur-md text-left"
                  >
                    <div className="flex items-center space-x-3 mb-6">
                      <div className="p-2.5 bg-cyan-500/10 rounded-xl">
                        <BookOpen className="h-6 w-6 text-cyan-400" />
                      </div>
                      <div>
                        <h1 className="text-2xl md:text-3xl font-sans font-extrabold text-white">Documentation</h1>
                        <p className="text-[10px] text-cyan-400 font-mono tracking-widest uppercase">WORKSPACE USER GUIDE</p>
                      </div>
                    </div>

                    <div className="space-y-6 text-sm text-slate-300 leading-relaxed font-sans text-left">
                      <div className="p-4 bg-white/5 border border-white/5 rounded-xl">
                        <h3 className="text-white font-bold text-sm mb-1.5">🚀 Getting Started in 3 Steps</h3>
                        <p className="text-slate-400 text-xs">
                          Launch your collaborative terminal playground immediately:
                        </p>
                        <ol className="list-decimal pl-5 text-xs text-slate-400 mt-2 space-y-1">
                          <li>Click the <strong className="text-white">Launch Editor</strong> trigger on the hero frame.</li>
                          <li>Open the Sidebar Explorer to add virtual directories, custom scripts, or styles.</li>
                          <li>Observe the live viewport container to preview script compilations.</li>
                        </ol>
                      </div>

                      <div className="p-4 bg-white/5 border border-white/5 rounded-xl">
                        <h3 className="text-white font-bold text-sm mb-1.5">📱 Progressive Web App (PWA) Offline</h3>
                        <p className="text-slate-400 text-xs">
                          Codesyne is fully installable on Chrome, Safari, Edge, and mobile devices. Once installed, it launches as a borderless window, bypasses standard browser chrome margins, and loads in less than 300ms from the local Service Worker.
                        </p>
                      </div>

                      <div className="p-4 bg-white/5 border border-white/5 rounded-xl">
                        <h3 className="text-white font-bold text-sm mb-1.5">👥 Peer Collaboration and Syncing</h3>
                        <p className="text-slate-400 text-xs">
                          Invite teammates by generating visual links. Real-time changes are synchronized down to the microsecond. Concurrent edits are merged gracefully to eliminate merge conflicts.
                        </p>
                      </div>
                    </div>
                  </motion.div>
                )}

                {activePolicyPage === 'roadmap' && (
                  <motion.div 
                    key="roadmap"
                    initial={{ opacity: 0, y: 15 }} 
                    animate={{ opacity: 1, y: 0 }} 
                    exit={{ opacity: 0, y: -15 }}
                    className="bg-[#09071c]/80 border border-white/5 p-6 md:p-10 rounded-2xl shadow-2xl backdrop-blur-md text-left"
                  >
                    <div className="flex items-center space-x-3 mb-6">
                      <div className="p-2.5 bg-indigo-500/10 rounded-xl">
                        <Calendar className="h-6 w-6 text-indigo-400" />
                      </div>
                      <div>
                        <h1 className="text-2xl md:text-3xl font-sans font-extrabold text-white">Product Roadmap</h1>
                        <p className="text-[10px] text-indigo-400 font-mono tracking-widest uppercase">CODESYNE PROGRESS MATRIX</p>
                      </div>
                    </div>

                    <div className="relative border-l border-white/5 pl-6 ml-3 space-y-8 text-left font-sans text-sm">
                      <div className="relative">
                        <div className="absolute -left-[31px] top-1.5 w-4 h-4 rounded-full bg-emerald-500 border-4 border-[#09071c]" />
                        <span className="text-[10px] font-bold text-emerald-400 tracking-wider uppercase font-mono block">Phase 1: Foundation (COMPLETED)</span>
                        <h3 className="text-white font-bold text-sm mt-0.5">Sandbox Compilation & Local Storage Core</h3>
                        <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                          Initial web IDE launching framework, reactive file explorer tree, and comprehensive offline service worker caches.
                        </p>
                      </div>

                      <div className="relative">
                        <div className="absolute -left-[31px] top-1.5 w-4 h-4 rounded-full bg-cyan-400 border-4 border-[#09071c]" />
                        <span className="text-[10px] font-bold text-cyan-400 tracking-wider uppercase font-mono block">Phase 2: Sync Engine (IN PROGRESS)</span>
                        <h3 className="text-white font-bold text-sm mt-0.5">Real-time Collaboration & Standalone PWA</h3>
                        <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                          Microsecond file state sync, live collaborator tracking, and custom responsive layouts with glossy installation triggers.
                        </p>
                      </div>

                      <div className="relative">
                        <div className="absolute -left-[31px] top-1.5 w-4 h-4 rounded-full bg-indigo-500 border-4 border-[#09071c]" />
                        <span className="text-[10px] font-bold text-indigo-400 tracking-wider uppercase font-mono block">Phase 3: Deep AI Co-Architect (Q3 2026)</span>
                        <h3 className="text-white font-bold text-sm mt-0.5">Gemini Server-Side Workspace Context</h3>
                        <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                          Server-side secure Gemini proxy integrations offering automated refactoring, real-time bug explanations, and workspace autocompletions.
                        </p>
                      </div>

                      <div className="relative">
                        <div className="absolute -left-[31px] top-1.5 w-4 h-4 rounded-full bg-slate-600 border-4 border-[#09071c]" />
                        <span className="text-[10px] font-bold text-slate-500 tracking-wider uppercase font-mono block">Phase 4: Sovereign Exports (Q4 2026)</span>
                        <h3 className="text-white font-bold text-sm mt-0.5">Docker Image Bundler</h3>
                        <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                          Compress your workspace straight into clean self-contained Docker images or launch static sites to global CDN origins with 1-click.
                        </p>
                      </div>
                    </div>
                  </motion.div>
                )}

                {activePolicyPage === 'changelog' && (
                  <motion.div 
                    key="changelog"
                    initial={{ opacity: 0, y: 15 }} 
                    animate={{ opacity: 1, y: 0 }} 
                    exit={{ opacity: 0, y: -15 }}
                    className="bg-[#09071c]/80 border border-white/5 p-6 md:p-10 rounded-2xl shadow-2xl backdrop-blur-md text-left"
                  >
                    <div className="flex items-center space-x-3 mb-6">
                      <div className="p-2.5 bg-pink-500/10 rounded-xl">
                        <Layers className="h-6 w-6 text-pink-400" />
                      </div>
                      <div>
                        <h1 className="text-2xl md:text-3xl font-sans font-extrabold text-white">Changelog</h1>
                        <p className="text-[10px] text-pink-400 font-mono tracking-widest uppercase">CODESYNE RELEASE UPDATES</p>
                      </div>
                    </div>

                    <div className="space-y-8 text-left font-sans text-sm">
                      <div className="border-b border-white/5 pb-6">
                        <div className="flex items-center space-x-2.5">
                          <span className="px-2.5 py-0.5 bg-pink-500/10 text-pink-400 rounded-lg text-[10px] font-mono font-bold uppercase">v1.2.0</span>
                          <span className="text-xs text-slate-500 font-mono">July 11, 2026</span>
                        </div>
                        <h3 className="text-white font-bold text-sm mt-2">Legal Hub & Premium Footer Redeployment</h3>
                        <ul className="list-disc pl-5 text-xs text-slate-400 mt-2 space-y-1">
                          <li>Engineered an interactive responsive policy portal with sidebar layout.</li>
                          <li>Redesigned 5-column symmetrical footer with clean modern typography.</li>
                          <li>Wrote comprehensive documentation, cookie policies, disclaimers, and roadmap entries.</li>
                          <li>Added glossy shimmering standalone PWA installation prompts.</li>
                        </ul>
                      </div>

                      <div className="border-b border-white/5 pb-6">
                        <div className="flex items-center space-x-2.5">
                          <span className="px-2.5 py-0.5 bg-slate-800 text-slate-400 rounded-lg text-[10px] font-mono font-bold uppercase">v1.1.0</span>
                          <span className="text-xs text-slate-500 font-mono">June 18, 2026</span>
                        </div>
                        <h3 className="text-white font-bold text-sm mt-2">WebSocket Room Syncing</h3>
                        <ul className="list-disc pl-5 text-xs text-slate-400 mt-2 space-y-1">
                          <li>Wired end-to-end event loops for microsecond live editing broadcasts.</li>
                          <li>Implemented dynamic concurrent visual cursors.</li>
                          <li>Added local workspace history indexing.</li>
                        </ul>
                      </div>

                      <div>
                        <div className="flex items-center space-x-2.5">
                          <span className="px-2.5 py-0.5 bg-slate-800 text-slate-400 rounded-lg text-[10px] font-mono font-bold uppercase">v1.0.0</span>
                          <span className="text-xs text-slate-500 font-mono">May 02, 2026</span>
                        </div>
                        <h3 className="text-white font-bold text-sm mt-2">Public Core Rollout</h3>
                        <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                          Initial launching of the Codesyne virtual sandbox compiler, responsive editor layouts, file directory, and base system terminal runners.
                        </p>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      )}
      </main>

      {/* Symmetrical Revamped Footer */}
      <footer id="landing_footer" className="bg-[#020108] border-t border-white/5 pt-6 sm:pt-8 pb-3 sm:pb-4 relative z-10 font-sans mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-5 sm:gap-6 items-start mb-4">
          {/* Section 1: Codesyne */}
          <div className="space-y-3.5 col-span-2 sm:col-span-3 lg:col-span-1 flex flex-col items-center sm:items-start text-center sm:text-left">
            <div className="flex items-center space-x-2.5">
              <Code2 className="h-5 w-5 text-cyan-400" />
              <span className="font-sans font-extrabold text-base tracking-tight bg-gradient-to-r from-cyan-400 to-indigo-400 bg-clip-text text-transparent">CodeSyne</span>
            </div>
            <p className="text-[11px] sm:text-xs text-slate-400 leading-relaxed max-w-xs">
              Next-gen collaborative cloud IDE for modern developers.
            </p>
            <div className="flex items-center space-x-3.5 pt-1">
              <a 
                href="https://github.com/codesyne-ide/codesyne" 
                target="_blank" 
                referrerPolicy="no-referrer"
                className="text-slate-400 hover:text-cyan-400 hover:scale-110 transition-all duration-300"
                title="GitHub Repo"
              >
                <Github className="h-4 w-4" />
              </a>
              <a 
                href="mailto:nakulsharma02011@gmail.com" 
                className="text-slate-400 hover:text-cyan-400 hover:scale-110 transition-all duration-300"
                title="Email support"
              >
                <Mail className="h-4 w-4" />
              </a>
            </div>
          </div>

          {/* Section 2: Product */}
          <div className="space-y-3 col-span-1 flex flex-col items-center sm:items-start text-center sm:text-left">
            <h4 className="text-[10px] font-bold text-white uppercase tracking-widest">Product</h4>
            <ul className="space-y-2 text-[11px] sm:text-xs text-slate-400 flex flex-col items-center sm:items-start w-full">
              <li><button onClick={() => { handleOpenPolicyPage(null); setTimeout(() => { const el = document.getElementById('features'); if (el) { el.scrollIntoView({ behavior: 'smooth' }); } else { window.scrollTo({ top: 800, behavior: 'smooth' }); } }, 150); }} className="hover:text-cyan-400 transition-all duration-300 bg-transparent border-none p-0 cursor-pointer text-center sm:text-left block w-full focus:outline-none focus:text-cyan-400">Features</button></li>
              <li><button onClick={() => setShowDownloadModal(true)} className="hover:text-cyan-400 transition-all duration-300 bg-transparent border-none p-0 cursor-pointer text-center sm:text-left block w-full focus:outline-none focus:text-cyan-400 text-cyan-300 font-semibold">Download</button></li>
              <li><button onClick={() => handleOpenPolicyPage('roadmap')} className="hover:text-cyan-400 transition-all duration-300 bg-transparent border-none p-0 cursor-pointer text-center sm:text-left block w-full focus:outline-none focus:text-cyan-400">Roadmap</button></li>
              <li><button onClick={() => handleOpenPolicyPage('changelog')} className="hover:text-cyan-400 transition-all duration-300 bg-transparent border-none p-0 cursor-pointer text-center sm:text-left block w-full focus:outline-none focus:text-cyan-400">Changelog</button></li>
            </ul>
          </div>

          {/* Section 3: Resources */}
          <div className="space-y-3 col-span-1 flex flex-col items-center sm:items-start text-center sm:text-left">
            <h4 className="text-[10px] font-bold text-white uppercase tracking-widest">Resources</h4>
            <ul className="space-y-2 text-[11px] sm:text-xs text-slate-400 flex flex-col items-center sm:items-start w-full">
              <li><button onClick={() => handleOpenPolicyPage('docs')} className="hover:text-cyan-400 transition-all duration-300 bg-transparent border-none p-0 cursor-pointer text-center sm:text-left block w-full focus:outline-none focus:text-cyan-400">Documentation</button></li>
              <li><button onClick={() => { handleOpenPolicyPage(null); setTimeout(() => { const el = document.getElementById('faq'); if (el) { el.scrollIntoView({ behavior: 'smooth' }); } else { window.scrollTo({ top: 1500, behavior: 'smooth' }); } }, 150); }} className="hover:text-cyan-400 transition-all duration-300 bg-transparent border-none p-0 cursor-pointer text-center sm:text-left block w-full focus:outline-none focus:text-cyan-400">FAQ</button></li>
              <li><span className="text-slate-500 block text-center sm:text-left">Blog <span className="text-[8px] px-1.5 py-0.5 bg-slate-800/60 text-slate-400 rounded font-semibold ml-1">SOON</span></span></li>
            </ul>
          </div>

          {/* Section 4: Company */}
          <div className="space-y-3 col-span-1 flex flex-col items-center sm:items-start text-center sm:text-left">
            <h4 className="text-[10px] font-bold text-white uppercase tracking-widest">Company</h4>
            <ul className="space-y-2 text-[11px] sm:text-xs text-slate-400 flex flex-col items-center sm:items-start w-full">
              <li><button onClick={() => handleOpenPolicyPage('about')} className="hover:text-cyan-400 transition-all duration-300 bg-transparent border-none p-0 cursor-pointer text-center sm:text-left block w-full focus:outline-none focus:text-cyan-400">About Us</button></li>
              <li><button onClick={() => handleOpenPolicyPage('creator')} className="hover:text-cyan-400 transition-all duration-300 bg-transparent border-none p-0 cursor-pointer text-center sm:text-left block w-full focus:outline-none focus:text-cyan-400">About Creator</button></li>
              <li><button onClick={() => handleOpenPolicyPage('contact')} className="hover:text-cyan-400 transition-all duration-300 bg-transparent border-none p-0 cursor-pointer text-center sm:text-left block w-full focus:outline-none focus:text-cyan-400">Contact Us</button></li>
              <li><span className="text-slate-500 block text-center sm:text-left">Careers <span className="text-[8px] px-1.5 py-0.5 bg-slate-800/60 text-slate-400 rounded font-semibold ml-1">SOON</span></span></li>
            </ul>
          </div>

          {/* Section 5: Legal */}
          <div className="space-y-3 col-span-1 flex flex-col items-center sm:items-start text-center sm:text-left">
            <h4 className="text-[10px] font-bold text-white uppercase tracking-widest">Legal</h4>
            <ul className="space-y-2 text-[11px] sm:text-xs text-slate-400 flex flex-col items-center sm:items-start w-full">
              <li><button onClick={() => handleOpenPolicyPage('privacy')} className="hover:text-cyan-400 transition-all duration-300 bg-transparent border-none p-0 cursor-pointer text-center sm:text-left block w-full focus:outline-none focus:text-cyan-400">Privacy Policy</button></li>
              <li><button onClick={() => handleOpenPolicyPage('terms')} className="hover:text-cyan-400 transition-all duration-300 bg-transparent border-none p-0 cursor-pointer text-center sm:text-left block w-full focus:outline-none focus:text-cyan-400">Terms of Service</button></li>
              <li><button onClick={() => handleOpenPolicyPage('cookie')} className="hover:text-cyan-400 transition-all duration-300 bg-transparent border-none p-0 cursor-pointer text-center sm:text-left block w-full focus:outline-none focus:text-cyan-400">Cookie Policy</button></li>
              <li><button onClick={() => handleOpenPolicyPage('disclaimer')} className="hover:text-cyan-400 transition-all duration-300 bg-transparent border-none p-0 cursor-pointer text-center sm:text-left block w-full focus:outline-none focus:text-cyan-400">Disclaimer</button></li>
            </ul>
          </div>
        </div>

        {/* Symmetry Line and Bottom Meta */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 border-t border-white/5 pt-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left text-xs text-slate-500 font-sans">
          <p className="text-[11px] sm:text-xs text-slate-500">
            © {new Date().getFullYear()} CodeSyne. All Rights Reserved.
          </p>
          <div className="flex flex-wrap items-center justify-center sm:justify-end gap-x-4 gap-y-2 text-slate-500 text-[11px] sm:text-xs">
            <button onClick={() => handleOpenPolicyPage('privacy')} className="hover:text-cyan-400 transition-all duration-200 bg-transparent border-none p-0 cursor-pointer focus:outline-none focus:text-cyan-400">Privacy</button>
            <span className="text-slate-800">•</span>
            <button onClick={() => handleOpenPolicyPage('terms')} className="hover:text-cyan-400 transition-all duration-200 bg-transparent border-none p-0 cursor-pointer focus:outline-none focus:text-cyan-400">Terms</button>
            <span className="text-slate-800">•</span>
            <button onClick={() => handleOpenPolicyPage('creator')} className="hover:text-cyan-400 transition-all duration-200 bg-transparent border-none p-0 cursor-pointer focus:outline-none focus:text-cyan-400">About Creator</button>
            <span className="text-slate-800">•</span>
            <button onClick={() => handleOpenPolicyPage('contact')} className="hover:text-cyan-400 transition-all duration-200 bg-transparent border-none p-0 cursor-pointer focus:outline-none focus:text-cyan-400">Contact</button>
          </div>
        </div>

        {/* Subtle sleek dark bottom accent strip */}
        <div className="w-full h-1 mt-6 bg-gradient-to-r from-transparent via-slate-900 to-transparent border-t border-slate-800/40 opacity-80" />
      </footer>

      {/* Official Download & Install Modal (PWA, Windows .EXE, Android .APK) */}
      <InstallDownloadModal
        isOpen={showDownloadModal}
        onClose={() => setShowDownloadModal(false)}
        onInstallPwa={triggerPwaPrompt}
        canInstallPwa={canInstall}
      />

    </div>
  );
}
