'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
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
  ShieldCheck,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AccountRole } from '@/lib/account';
import type { View } from '@/lib/routes';
import { api, ApiError, type ApiSession, type NinVerificationResult, registrationDraftStore, sessionStore } from '@/lib/api';
import './auth.css';

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
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      className="google-button"
      onClick={onClick}
    >
      <i>G</i>
      {label}
    </Button>
  );
}

export function SignIn({
  go,
  onAuthenticated,
}: {
  go: (view: View) => void;
  onAuthenticated: (session: ApiSession) => void;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const session = await api.auth.login({ email, password });
      onAuthenticated(session);
    } catch (cause: unknown) {
      setError(cause instanceof ApiError ? cause.message : 'Unable to sign in right now.');
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <AuthLayout
      go={go}
      eyebrow="Welcome back"
      title="Sign in to SingleRent"
      copy="Use your email and password to continue."
    >
      <form className="auth-form" onSubmit={submit}>
        <label>
          Email address
          <input
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label>
          Password<span className="label-action">Forgot password?</span>
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
          onClick={() => setError('Google sign-in will be available once the Google OAuth credentials are configured.')}
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

export function SignUp({ go }: { go: (view: View) => void }) {
  const [showPassword, setShowPassword] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    registrationDraftStore.set({ firstName, lastName, email, password, confirmPassword });
    go('account-type');
  };
  return (
    <AuthLayout
      go={go}
      eyebrow="Create your account"
      title="Start with SingleRent"
      copy="Set up your account, choose your role, then confirm your email address."
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
          Email address
          <input
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
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
        <GoogleButton
          label="Sign up with Google"
          onClick={() => setError('Google sign-up will be available once the Google OAuth credentials are configured.')}
        />
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
      copy="We will send a verification code to your email after you create your account."
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
          after your email is verified.
        </p>
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
                await onChoose(role);
              } catch (cause: unknown) {
                setError(cause instanceof ApiError ? cause.message : 'Unable to create your account right now.');
              } finally {
                setSubmitting(false);
              }
            }}
          >
            {submitting ? 'Creating account…' : 'Continue to email verification'} <ArrowRight size={14} />
          </Button>
        </div>
      </div>
    </AuthLayout>
  );
}

export function EmailVerification({
  go,
  session,
  onVerified,
}: {
  go: (view: View) => void;
  session: ApiSession | null;
  onVerified: (session: ApiSession) => void;
}) {
  const [challenge, setChallenge] = useState(session?.emailVerification ?? null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  if (!session) {
    return (
      <AuthLayout go={go} eyebrow="Email verification" title="Sign in to verify your email" copy="Use the email and password you registered with, then we will let you enter your verification code.">
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
      await api.auth.confirmEmailVerification(session.accessToken, challenge.id, code);
      // The API client may have refreshed this session before completing the request.
      // Always retain the most recently rotated token pair.
      const activeSession = sessionStore.get() ?? session;
      const verifiedSession: ApiSession = { ...activeSession, user: { ...activeSession.user, emailVerified: true }, emailVerification: undefined };
      onVerified(verifiedSession);
    } catch (cause: unknown) {
      setError(cause instanceof ApiError ? cause.message : 'Unable to verify your email right now.');
    } finally {
      setSubmitting(false);
    }
  };
  const resend = async () => {
    setSubmitting(true);
    setError(null);
    try {
      setChallenge(await api.auth.resendEmailVerification(session.accessToken));
      setCode('');
    } catch (cause: unknown) {
      setError(cause instanceof ApiError ? cause.message : 'Unable to issue a new verification code.');
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <AuthLayout go={go} eyebrow="One quick check" title="Verify your email" copy={`Enter the six-digit code sent to ${session.user.email}.`}>
      <div className="auth-form">
        <label>
          Verification code
          <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="123456" />
        </label>
        {challenge?.developmentCode && <p className="development-code">Development code: <b>{challenge.developmentCode}</b></p>}
        {error && <p className="auth-error" role="alert">{error}</p>}
        <Button className="auth-submit" disabled={submitting || code.length !== 6} onClick={verify}>
          {submitting ? 'Verifying…' : 'Verify email'} <ArrowRight size={15} />
        </Button>
        <Button variant="ghost" disabled={submitting} onClick={resend}>Send a new code</Button>
      </div>
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
    'Email verified',
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
      ? `You can use your ${roleCopy[role].label.toLowerCase()} workspace after confirming your email. SingleRent asks for NIN only before your first rent payment or withdrawal.`
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
