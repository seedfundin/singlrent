'use client';

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Building2,
  Check,
  CircleCheck,
  CircleX,
  Clock3,
  House,
  KeyRound,
  LoaderCircle,
  ShieldCheck,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AccountRole } from '@/lib/account';
import type { View } from '@/lib/routes';
import { api, ApiError, type ApiSession, type NinVerificationResult, registrationDraftStore, sessionStore } from '@/lib/api';
import './auth.css';
import './auth-overrides.css';

const roleCopy: Record<
  AccountRole,
  { label: string; detail: string; destination: View }
> = {
  tenant: {
    label: 'Tenant',
    detail: 'Find and rent a home.',
    destination: 'tenant',
  },
  landlord: {
    label: 'Landlord',
    detail: 'List homes and manage tenancies.',
    destination: 'landlord',
  },
  agent: {
    label: 'Agent',
    detail: 'Manage listings for landlord clients.',
    destination: 'agent',
  },
};

type GoogleCredentialResponse = { credential?: string };
type GoogleButtonText = 'continue_with' | 'signup_with';

type GoogleIdentityApi = {
  initialize(configuration: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
  }): void;
  renderButton(
    parent: HTMLElement,
    options: {
      type: 'standard';
      theme: 'outline';
      size: 'large';
      text: GoogleButtonText;
      shape: 'rectangular';
      width: number;
    },
  ): void;
};

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleIdentityApi } };
  }
}

let googleIdentityScript: Promise<GoogleIdentityApi> | null = null;

function loadGoogleIdentityServices(): Promise<GoogleIdentityApi> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Google sign-in is only available in a browser.'));
  const existingApi = window.google?.accounts?.id;
  if (existingApi) return Promise.resolve(existingApi);
  if (googleIdentityScript) return googleIdentityScript;

  googleIdentityScript = new Promise((resolve, reject) => {
    const resolveGoogle = () => {
      const api = window.google?.accounts?.id;
      if (api) resolve(api);
      else reject(new Error('Google sign-in did not load correctly.'));
    };
    const existingScript = document.querySelector<HTMLScriptElement>('script[data-singlerent-google-identity]');
    if (existingScript) {
      existingScript.addEventListener('load', resolveGoogle, { once: true });
      existingScript.addEventListener('error', () => reject(new Error('Google sign-in could not be loaded.')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.dataset.singlerentGoogleIdentity = 'true';
    script.addEventListener('load', resolveGoogle, { once: true });
    script.addEventListener('error', () => reject(new Error('Google sign-in could not be loaded.')), { once: true });
    document.head.appendChild(script);
  });
  return googleIdentityScript;
}

function AuthMark({ go }: { go: (view: View) => void }) {
  return (
    <button
      className="auth-mark"
      onClick={() => go('home')}
      aria-label="Go to SingleRent home"
    >
      <i>
        <House size={18} />
      </i>
      <b>
        Single<span>Rent</span>
      </b>
    </button>
  );
}

function AuthLayout({
  go,
  eyebrow,
  title,
  copy,
  children,
}: {
  go: (view: View) => void;
  eyebrow: string;
  title: string;
  copy: string;
  children: ReactNode;
}) {
  return (
    <div className="auth-page">
      <section className="auth-panel">
        <AuthMark go={go} />
        <div className="auth-copy">
          <small>{eyebrow}</small>
          <h1>{title}</h1>
          <p>{copy}</p>
        </div>
        {children}
      </section>
      <aside className="auth-aside">
        <div>
          <i>
            <ShieldCheck size={28} />
          </i>
          <small>Built for trusted renting</small>
          <h2>Verify your email now. Confirm your identity when it matters.</h2>
          <p>
            Your NIN is checked only when you first pay rent or withdraw funds,
            so you can explore and set up your account first.
          </p>
        </div>
        <span>
          <BadgeCheck size={15} /> Direct-to-landlord rentals, with clearer
          protection.
        </span>
      </aside>
    </div>
  );
}

function GoogleButton({
  label,
  text,
  disabled = false,
  onCredential,
  onError,
}: {
  label: string;
  text: GoogleButtonText;
  disabled?: boolean;
  onCredential: (idToken: string) => void;
  onError: (message: string) => void;
}) {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID?.trim();
  const buttonContainer = useRef<HTMLDivElement>(null);
  const onCredentialRef = useRef(onCredential);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onCredentialRef.current = onCredential;
    onErrorRef.current = onError;
  }, [onCredential, onError]);

  useEffect(() => {
    if (!clientId || disabled || !buttonContainer.current) return;
    let active = true;
    void loadGoogleIdentityServices()
      .then((google) => {
        if (!active || !buttonContainer.current) return;
        google.initialize({
          client_id: clientId,
          auto_select: false,
          cancel_on_tap_outside: true,
          callback: (response) => {
            const idToken = response.credential;
            if (!idToken) {
              onErrorRef.current('Google did not return a sign-in credential. Please try again.');
              return;
            }
            onCredentialRef.current(idToken);
          },
        });
        const container = buttonContainer.current;
        container.replaceChildren();
        google.renderButton(container, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text,
          shape: 'rectangular',
          width: Math.max(250, Math.min(400, Math.floor(container.getBoundingClientRect().width))),
        });
      })
      .catch(() => {
        if (active) onErrorRef.current('Google sign-in could not be loaded. Please try again.');
      });
    return () => {
      active = false;
    };
  }, [clientId, disabled, text]);

  if (!clientId) {
    return <Button type="button" variant="outline" className="google-button" onClick={() => onError('Google sign-in is not configured yet. Please try another sign-in method.')}><i>G</i>{label}</Button>;
  }
  if (disabled) {
    return <Button type="button" variant="outline" className="google-button" disabled><i>G</i>{label}</Button>;
  }
  return <div className="google-identity-button" ref={buttonContainer} aria-label={label} />;
}

export function SignIn({
  go,
  onAuthenticated,
}: {
  go: (view: View) => void;
  onAuthenticated: (session: ApiSession) => void;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resetStage, setResetStage] = useState<'login' | 'request' | 'confirm'>('login');
  const [resetPhone, setResetPhone] = useState('');
  const [resetChallengeId, setResetChallengeId] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const signInWithGoogle = async (idToken: string) => {
    setSubmitting(true);
    setError(null);
    try {
      const session = await api.auth.google({ idToken, role: 'TENANT' });
      onAuthenticated(session);
    } catch (cause: unknown) {
      setError(cause instanceof ApiError ? cause.message : 'Unable to sign in with Google right now.');
    } finally {
      setSubmitting(false);
    }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const session = await api.auth.login({ identifier, password });
      onAuthenticated(session);
    } catch (cause: unknown) {
      setError(cause instanceof ApiError ? cause.message : 'Unable to sign in right now.');
    } finally {
      setSubmitting(false);
    }
  };
  const requestReset = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const result = await api.auth.requestPasswordReset(resetPhone);
      setResetChallengeId(result.challengeId ?? '');
      setNotice('If that phone number belongs to an account, a six-digit reset code has been sent.');
      setResetStage('confirm');
      if (result.developmentCode) setResetCode(result.developmentCode);
    } catch (cause: unknown) {
      setError(cause instanceof ApiError ? cause.message : 'Unable to request a password reset right now.');
    } finally {
      setSubmitting(false);
    }
  };
  const confirmReset = async (event: FormEvent) => {
    event.preventDefault();
    if (resetPassword !== resetConfirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.auth.confirmPasswordReset({ phone: resetPhone, challengeId: resetChallengeId, code: resetCode, password: resetPassword, confirmPassword: resetConfirmPassword });
      setResetStage('login');
      setPassword('');
      setNotice('Your password has been reset. Sign in with your new password.');
    } catch (cause: unknown) {
      setError(cause instanceof ApiError ? cause.message : 'Unable to reset the password. Check the code and try again.');
    } finally {
      setSubmitting(false);
    }
  };
  if (resetStage === 'request') return <AuthLayout go={go} eyebrow="Account recovery" title="Reset your password" copy="Enter your phone number and we will send a six-digit code if an account exists.">
    <form className="auth-form" onSubmit={requestReset}><label>Phone number<input type="tel" inputMode="tel" placeholder="+2348012345678" autoComplete="tel" value={resetPhone} onChange={(event) => setResetPhone(event.target.value)} required /></label>{error && <p className="auth-error" role="alert">{error}</p>}<Button className="auth-submit" type="submit" disabled={submitting}>{submitting ? 'Sending…' : 'Send reset code'} <ArrowRight size={15} /></Button><p className="auth-switch"><button type="button" onClick={() => { setResetStage('login'); setError(null); }}>Back to sign in</button></p></form>
  </AuthLayout>;
  if (resetStage === 'confirm') return <AuthLayout go={go} eyebrow="Account recovery" title="Choose a new password" copy={`Enter the code sent to ${resetPhone}. It expires after 10 minutes.`}>
    <form className="auth-form" onSubmit={confirmReset}><label>Reset code<input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={resetCode} onChange={(event) => setResetCode(event.target.value.replace(/\D/g, '').slice(0, 6))} required /></label><label>New password<input type="password" autoComplete="new-password" value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} minLength={12} required /></label><label>Confirm new password<input type="password" autoComplete="new-password" value={resetConfirmPassword} onChange={(event) => setResetConfirmPassword(event.target.value)} minLength={12} required /></label>{notice && <p className="development-code">{notice}</p>}{error && <p className="auth-error" role="alert">{error}</p>}<Button className="auth-submit" type="submit" disabled={submitting || resetCode.length !== 6}>{submitting ? 'Resetting…' : 'Reset password'} <ArrowRight size={15} /></Button><p className="auth-switch"><button type="button" onClick={() => { setResetStage('request'); setError(null); }}>Use a different phone number</button></p></form>
  </AuthLayout>;
  return (
    <AuthLayout
      go={go}
      eyebrow="Welcome back"
      title="Sign in to SingleRent"
      copy="Use your phone number or email and password to continue."
    >
      <form className="auth-form" onSubmit={submit}>
        <label>
          Phone number or email
          <input
            type="text"
            placeholder="+2348012345678 or you@example.com"
            autoComplete="username"
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            required
          />
        </label>
        <label>
          Password<button type="button" className="label-action" onClick={() => { setResetPhone(identifier.includes('@') ? '' : identifier); setError(null); setNotice(null); setResetStage('request'); }}>Forgot password?</button>
          <div className="password-field">
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Enter your password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
        </label>
        {error && <p className="auth-error" role="alert">{error}</p>}
        {notice && <p className="development-code">{notice}</p>}
        <Button type="submit" className="auth-submit" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'} <ArrowRight size={15} />
        </Button>
        <div className="auth-divider">
          <span />
          or
          <span />
        </div>
        <GoogleButton
          label="Continue with Google"
          text="continue_with"
          disabled={submitting}
          onCredential={(idToken) => void signInWithGoogle(idToken)}
          onError={setError}
        />
        <p className="auth-switch">
          New to SingleRent?{' '}
          <button type="button" onClick={() => go('sign-up')}>
            Create an account
          </button>
        </p>
      </form>
    </AuthLayout>
  );
}

export function SignUp({
  go,
  onAuthenticated,
}: {
  go: (view: View) => void;
  onAuthenticated: (session: ApiSession) => void;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [googleSignUp, setGoogleSignUp] = useState(false);
  const [googleRole, setGoogleRole] = useState<AccountRole>('tenant');
  const [googleDateOfBirth, setGoogleDateOfBirth] = useState('');
  const [googlePhone, setGooglePhone] = useState('');
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    registrationDraftStore.set({ firstName, lastName, email, phone, password, confirmPassword });
    go('account-type');
  };
  const signUpWithGoogle = async (idToken: string) => {
    if (googleRole === 'agent' && !googleDateOfBirth) {
      setError('Agents must provide a date of birth and be at least 18 years old.');
      return;
    }
    if (!googlePhone.trim()) {
      setError('Enter the phone number that should receive your verification code.');
      return;
    }
    setGoogleSubmitting(true);
    setError(null);
    try {
      const session = await api.auth.google({
        idToken,
        phone: googlePhone,
        role: googleRole.toUpperCase() as 'TENANT' | 'LANDLORD' | 'AGENT',
        dateOfBirth: googleRole === 'agent' ? googleDateOfBirth : undefined,
      });
      onAuthenticated(session);
    } catch (cause: unknown) {
      setError(cause instanceof ApiError ? cause.message : 'Unable to continue with Google right now.');
    } finally {
      setGoogleSubmitting(false);
    }
  };
  if (googleSignUp) {
    return (
      <AuthLayout
        go={go}
        eyebrow="Create with Google"
        title="How will you use SingleRent?"
        copy="Choose the type of account and confirm the phone number you want to verify before continuing securely with Google."
      >
        <div className="role-picker google-role-picker">
          {(['tenant', 'landlord', 'agent'] as AccountRole[]).map((role) => {
            const Icon = role === 'tenant' ? UserRound : role === 'landlord' ? Building2 : KeyRound;
            return (
              <button key={role} type="button" className={googleRole === role ? 'selected' : ''} onClick={() => setGoogleRole(role)}>
                <i><Icon size={18} /></i>
                <span><b>{roleCopy[role].label}</b><small>{roleCopy[role].detail}</small></span>
                <em>{googleRole === role && <Check size={14} />}</em>
              </button>
            );
          })}
          {googleRole === 'agent' && <label className="agent-birth-date">Date of birth<input type="date" value={googleDateOfBirth} onChange={(event) => setGoogleDateOfBirth(event.target.value)} required /></label>}
          <label className="agent-birth-date">Phone number<input type="tel" inputMode="tel" autoComplete="tel" placeholder="+2348012345678" value={googlePhone} onChange={(event) => setGooglePhone(event.target.value)} required /></label>
          {error && <p className="auth-error" role="alert">{error}</p>}
          <div className="google-signup-actions">
            <Button type="button" variant="ghost" onClick={() => { setGoogleSignUp(false); setError(null); }}><ArrowLeft size={14} /> Back</Button>
            <GoogleButton
              label={googleSubmitting ? 'Connecting to Google…' : 'Sign up with Google'}
              text="signup_with"
              disabled={googleSubmitting || !googlePhone.trim() || (googleRole === 'agent' && !googleDateOfBirth)}
              onCredential={(idToken) => void signUpWithGoogle(idToken)}
              onError={setError}
            />
          </div>
        </div>
      </AuthLayout>
    );
  }
  return (
    <AuthLayout
      go={go}
      eyebrow="Create your account"
      title="Start with SingleRent"
      copy="Set up your account, choose your role, then confirm your phone number."
    >
      <form className="auth-form" onSubmit={submit}>
        <div className="auth-name-fields">
          <label>
            First name
            <input
              placeholder="First name"
              autoComplete="given-name"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              required
            />
          </label>
          <label>
            Last name
            <input
              placeholder="Last name"
              autoComplete="family-name"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              required
            />
          </label>
        </div>
        <label>
          Phone number
          <input
            type="tel"
            inputMode="tel"
            placeholder="+2348012345678"
            autoComplete="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            required
          />
          <small>We will send your verification code to this number.</small>
        </label>
        <label>
          Email address <small>(optional)</small>
          <input
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label>
          Password
          <div className="password-field">
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Create a password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
        </label>
        <label>
          Confirm password
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder="Confirm your password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
          />
        </label>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <Button type="submit" className="auth-submit">
          Create account <ArrowRight size={15} />
        </Button>
        <div className="auth-divider">
          <span />
          or
          <span />
        </div>
        <Button type="button" variant="outline" className="google-button" onClick={() => { setError(null); setGoogleSignUp(true); }}><i>G</i>Sign up with Google</Button>
        <p className="auth-switch">
          Already have an account?{' '}
          <button type="button" onClick={() => go('sign-in')}>
            Sign in
          </button>
        </p>
      </form>
    </AuthLayout>
  );
}

export function AccountType({
  go,
  onChoose,
}: {
  go: (view: View) => void;
  onChoose: (role: AccountRole) => Promise<void>;
}) {
  const [role, setRole] = useState<AccountRole>('tenant');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const choices: [AccountRole, LucideIcon][] = [
    ['tenant', UserRound],
    ['landlord', Building2],
    ['agent', KeyRound],
  ];
  return (
    <AuthLayout
      go={go}
      eyebrow="One last choice"
      title="How will you use SingleRent?"
      copy="We will send a verification code to your phone after you create your account."
    >
      <div className="role-picker">
        {choices.map(([id, Icon]) => (
          <button
            key={id}
            className={role === id ? 'selected' : ''}
            onClick={() => setRole(id)}
          >
            <i>
              <Icon size={18} />
            </i>
            <span>
              <b>{roleCopy[id].label}</b>
              <small>{roleCopy[id].detail}</small>
            </span>
            <em>{role === id && <Check size={14} />}</em>
          </button>
        ))}
        <p>
          <ShieldCheck size={15} /> Your selected role determines your workspace
          after your phone is verified.
        </p>
        {role === 'agent' && <label className="agent-birth-date">Date of birth<input type="date" value={dateOfBirth} onChange={(event) => setDateOfBirth(event.target.value)} required /></label>}
        <div className="auth-actions">
          <Button variant="ghost" onClick={() => go('sign-up')}>
            <ArrowLeft size={14} /> Back
          </Button>
          {error && <p className="auth-error" role="alert">{error}</p>}
          <Button
            disabled={submitting}
            onClick={async () => {
              setSubmitting(true);
              setError(null);
              try {
                if (role === 'agent' && !dateOfBirth) {
                  setError('Agents must provide a date of birth and be at least 18 years old.');
                  return;
                }
                const draft = registrationDraftStore.get();
                if (draft) registrationDraftStore.set({ ...draft, dateOfBirth: role === 'agent' ? dateOfBirth : undefined });
                await onChoose(role);
              } catch (cause: unknown) {
                setError(cause instanceof ApiError ? cause.message : 'Unable to create your account right now.');
              } finally {
                setSubmitting(false);
              }
            }}
          >
            {submitting ? 'Creating account…' : 'Continue to phone verification'} <ArrowRight size={14} />
          </Button>
        </div>
      </div>
    </AuthLayout>
  );
}

export function PhoneVerification({
  go,
  session,
  onVerified,
}: {
  go: (view: View) => void;
  session: ApiSession | null;
  onVerified: (session: ApiSession) => void;
}) {
  const [challenge, setChallenge] = useState(session?.phoneVerification ?? null);
  const [phone, setPhone] = useState(session?.user.phone ?? '');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  if (!session) {
    return (
      <AuthLayout go={go} eyebrow="Phone verification" title="Sign in to verify your phone" copy="Use the phone number or email and password you registered with, then enter your verification code.">
        <Button className="auth-submit" onClick={() => go('sign-in')}>Go to sign in <ArrowRight size={15} /></Button>
      </AuthLayout>
    );
  }
  const verify = async () => {
    if (!challenge) {
      setError('Request a new verification code first.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.auth.confirmPhoneVerification(session.accessToken, challenge.id, code);
      // The API client may have refreshed this session before completing the request.
      // Always retain the most recently rotated token pair.
      const activeSession = sessionStore.get() ?? session;
      const verifiedSession: ApiSession = { ...activeSession, user: { ...activeSession.user, phone, phoneVerified: true }, phoneVerification: undefined };
      onVerified(verifiedSession);
    } catch (cause: unknown) {
      setError(cause instanceof ApiError ? cause.message : 'Unable to verify your phone right now.');
    } finally {
      setSubmitting(false);
    }
  };
  const resend = async () => {
    setSubmitting(true);
    setError(null);
    try {
      setChallenge(await api.auth.issuePhoneVerification(session.accessToken, phone));
      setCode('');
    } catch (cause: unknown) {
      setError(cause instanceof ApiError ? cause.message : 'Unable to issue a new verification code.');
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <AuthLayout go={go} eyebrow="One quick check" title="Verify your phone" copy={`Enter the six-digit code sent to ${phone || 'your phone number'}.`}>
      <div className="auth-form">
        <label>
          Phone number
          <input type="tel" inputMode="tel" autoComplete="tel" placeholder="+2348012345678" value={phone} onChange={(event) => setPhone(event.target.value)} required />
        </label>
        <label>
          Verification code
          <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="123456" />
        </label>
        {challenge?.developmentCode && <p className="development-code">Development code: <b>{challenge.developmentCode}</b></p>}
        {error && <p className="auth-error" role="alert">{error}</p>}
        <Button className="auth-submit" disabled={submitting || code.length !== 6} onClick={verify}>
          {submitting ? 'Verifying…' : 'Verify phone'} <ArrowRight size={15} />
        </Button>
        <Button variant="ghost" disabled={submitting} onClick={resend}>Send a new code</Button>
      </div>
    </AuthLayout>
  );
}

export function AdminInvitationAcceptance({
  go,
  token,
}: {
  go: (view: View) => void;
  token: string;
}) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [accepted, setAccepted] = useState<{ email: string; role: 'ADMIN' | 'SUPER_ADMIN' } | null>(null);

  const accept = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) {
      setError('This invitation link is incomplete. Ask the person who invited you to send it again.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await api.admin.acceptInvitation({ token, firstName, lastName, password, confirmPassword });
      setAccepted({ email: result.email, role: result.role });
    } catch (cause: unknown) {
      setError(cause instanceof ApiError ? cause.message : 'We could not accept this invitation. It may have expired or already been used.');
    } finally {
      setSubmitting(false);
    }
  };

  if (accepted) {
    const role = accepted.role === 'SUPER_ADMIN' ? 'Super Admin' : 'Admin';
    return (
      <AuthLayout go={go} eyebrow="Invitation accepted" title="Your administrator account is ready" copy={`Your ${role} account for ${accepted.email} has been activated. You can now sign in with the password you created.`}>
        <div className="invitation-success" role="status">
          <i><BadgeCheck size={25} /></i>
          <p>Your invitation has been securely completed. Your email is already confirmed.</p>
          <Button className="auth-submit" onClick={() => go('sign-in')}>Sign in to SingleRent <ArrowRight size={15} /></Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout go={go} eyebrow="Administrator invitation" title="Join the SingleRent team" copy="Create your password to activate your administrator account. This invitation can only be used once.">
      <form className="auth-form" onSubmit={accept}>
        <div className="auth-name-fields">
          <label>First name<input value={firstName} onChange={(event) => setFirstName(event.target.value)} autoComplete="given-name" required /></label>
          <label>Last name<input value={lastName} onChange={(event) => setLastName(event.target.value)} autoComplete="family-name" required /></label>
        </div>
        <label>Create password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" minLength={12} required /></label>
        <label>Confirm password<input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={12} required /></label>
        <p className="invitation-note"><ShieldCheck size={14} /> Use a strong password with at least 12 characters. Your invitation expires after seven days.</p>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <Button className="auth-submit" type="submit" disabled={submitting || !firstName.trim() || !lastName.trim() || password.length < 12 || confirmPassword.length < 12}>
          {submitting ? <><LoaderCircle className="spin" size={15} /> Activating…</> : <>Activate administrator account <ArrowRight size={15} /></>}
        </Button>
        <p className="auth-switch"><button type="button" onClick={() => go('sign-in')}>Already have an account? Sign in</button></p>
      </form>
    </AuthLayout>
  );
}

export function KycFlow({
  go,
  role,
}: {
  go: (view: View) => void;
  role: AccountRole;
}) {
  const [step, setStep] = useState(1);
  const [complete, setComplete] = useState(false);
  const currentSession = sessionStore.get();
  const [firstName, setFirstName] = useState(currentSession?.user.firstName ?? '');
  const [lastName, setLastName] = useState(currentSession?.user.lastName ?? '');
  const [phone, setPhone] = useState('');
  const [nin, setNin] = useState('');
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [developmentCode, setDevelopmentCode] = useState<string | null>(null);
  const [verification, setVerification] = useState<NinVerificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const labels = [
    'Phone verified',
    'Start a transaction',
    'Dojah NIN check',
    'Continue',
  ];
  const heading =
    step === 1
      ? 'Identity verification happens later'
      : step === 2
        ? 'Verify your phone number'
        : step === 3
          ? 'Confirm your NIN'
          : 'Review verification';
  const copy =
    step === 1
      ? `You can use your ${roleCopy[role].label.toLowerCase()} workspace after confirming your phone number. SingleRent asks for NIN only before your first rent payment or withdrawal.`
      : step === 2
        ? `Enter the six-digit code sent to ${phone || 'your phone number'}.`
        : step === 3
          ? 'We will confirm that your NIN matches the NIMC record.'
          : 'Dojah has returned your verification result.';
  const continueKyc = async () => {
    if (!currentSession) {
      setError('Please sign in again to continue verification.');
      go('sign-in');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (step === 1) {
        setError('Start a rent payment or payout withdrawal when you are ready to complete one-time NIN verification.');
        return;
      } else if (step === 2) {
        if (!challengeId) throw new Error('Request a new phone verification code.');
        await api.users.confirmPhoneVerification(currentSession.accessToken, challengeId, code);
        setStep(3);
      } else if (step === 3) {
        const result = await api.users.submitNin(currentSession.accessToken, nin);
        setVerification(result);
        setStep(4);
        setComplete(true);
      }
    } catch (cause: unknown) {
      setError(cause instanceof ApiError ? cause.message : cause instanceof Error ? cause.message : 'Unable to continue verification.');
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <div className="kyc-flow">
      <header>
        <AuthMark go={go} />
        <button className="auth-back" onClick={() => go('home')}>
          <ArrowLeft size={14} /> Back to home
        </button>
      </header>
      <main>
        <div className="kyc-heading">
          <span>
            <small>Trust & safety</small>
            <h1>Verify your {roleCopy[role].label.toLowerCase()} account</h1>
            <p>
              Every tenant, agent and landlord completes KYC before accessing
              protected actions.
            </p>
          </span>
          <span className="role-pill">
            <UserRound size={14} /> {roleCopy[role].label}
          </span>
        </div>
        <section className="kyc-flow-card">
          <div className="kyc-progress">
            {labels.map((label, index) => (
              <span key={label} className={index + 1 <= step ? 'done' : ''}>
                <i>{index + 1 < step ? <Check size={12} /> : index + 1}</i>
                {label}
              </span>
            ))}
          </div>
          {complete ? (
            <div className="kyc-success">
              <i>
                {verification?.verified ? <CircleCheck size={30} /> : verification?.status === 'REJECTED' ? <CircleX size={30} /> : <Clock3 size={30} />}
              </i>
              <span>
                {verification?.verified ? <BadgeCheck size={13} /> : <Clock3 size={13} />} Dojah NIN check
              </span>
              <h2>
                {verification?.verified
                  ? 'Your identity has been verified.'
                  : verification?.status === 'REJECTED'
                    ? 'We could not verify this NIN.'
                    : 'Your NIN verification is pending.'}
              </h2>
              <p>
                {verification?.verified
                  ? 'Dojah confirmed your NIN and the phone number on the NIMC record matches your verified phone number.'
                  : verification?.status === 'REJECTED'
                    ? 'Check that your NIN and phone number match your NIMC record, then try again.'
                    : 'Your request is still being processed. Check your profile for the latest KYC status.'}
              </p>
              <div>
                <b>
                  <Check size={14} /> Phone verified
                </b>
                <b>
                  {verification?.verified ? <Check size={14} /> : <Clock3 size={14} />}{' '}
                  {verification?.verified
                    ? 'Dojah NIN verified'
                    : verification?.status === 'REJECTED'
                      ? 'Dojah NIN not verified'
                      : 'Dojah NIN pending'}
                </b>
              </div>
              {verification?.status === 'REJECTED' ? (
                <Button onClick={() => { setComplete(false); setVerification(null); setStep(3); }}>
                  Try another NIN <ArrowRight size={14} />
                </Button>
              ) : (
                <Button onClick={() => go('home')}>
                  Return to SingleRent <ArrowRight size={14} />
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="kyc-step-content">
                <h2>{heading}</h2>
                <p>{copy}</p>
                {step === 1 && (
                  <div className="auth-name-fields">
                    <label>
                      First name
                      <input value={firstName} onChange={(event) => setFirstName(event.target.value)} />
                    </label>
                    <label>
                      Last name
                      <input value={lastName} onChange={(event) => setLastName(event.target.value)} />
                    </label>
                    <label className="full-field">
                      Phone number
                      <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+234 803 555 0142" />
                    </label>
                    <label className="full-field">
                      NIN
                      <input value={nin} onChange={(event) => setNin(event.target.value.replace(/\D/g, '').slice(0, 11))} inputMode="numeric" placeholder="11-digit NIN" />
                    </label>
                  </div>
                )}
                {step === 2 && (
                  <div className="verify-block">
                    <i>
                      <KeyRound size={21} />
                    </i>
                    <b>Enter the six-digit code</b>
                    <div className="otp-row">
                      {Array.from({ length: 6 }, (_, index) => code[index] ?? '').map((value, index) => (
                        <input
                          aria-label={`Verification digit ${index + 1}`}
                          key={index}
                          value={value}
                          onChange={(event) => {
                            const digit = event.target.value.replace(/\D/g, '').slice(-1);
                            setCode((current) => `${current.slice(0, index)}${digit}${current.slice(index + 1)}`.slice(0, 6));
                          }}
                          maxLength={1}
                        />
                      ))}
                    </div>
                    {developmentCode && <small>Development code: {developmentCode}</small>}
                  </div>
                )}
                {step === 3 && (
                  <div className="nimc-block">
                    <i>
                      <ShieldCheck size={23} />
                    </i>
                    <span>
                      <StatusLine label="NIN provided" state="Ready" />
                      <StatusLine
                        label="Dojah NIN check"
                        state="Ready to verify"
                      />
                    </span>
                    <p>
                      Your encrypted NIN is sent to Dojah for NIMC verification. This action never
                      exposes the full NIN back to the browser.
                    </p>
                  </div>
                )}
                {step === 4 && (
                  <div className="review-list">
                    <span>
                      Account type <b>{roleCopy[role].label}</b>
                    </span>
                    <span>
                      Phone number{' '}
                      <b>
                        {phone} <em>Verified</em>
                      </b>
                    </span>
                    <span>
                      NIN{' '}
                      <b>
                        •••• •••• {nin.slice(-4)} <em>Dojah verification complete</em>
                      </b>
                    </span>
                  </div>
                )}
              </div>
              <div className="kyc-flow-actions">
                <Button
                  variant="ghost"
                  disabled={step === 1}
                  onClick={() => setStep(step - 1)}
                >
                  Back
                </Button>
                {error && <p className="auth-error" role="alert">{error}</p>}
                <Button disabled={submitting} onClick={continueKyc}>
                  {step === 3
                    ? 'Verify with Dojah'
                    : step === 4
                      ? 'Verification complete'
                      : submitting
                        ? 'Please wait…'
                        : 'Continue'}{' '}
                  <ArrowRight size={14} />
                </Button>
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}

function StatusLine({ label, state }: { label: string; state: string }) {
  return (
    <span>
      <b>{label}</b>
      <small>{state}</small>
    </span>
  );
}
