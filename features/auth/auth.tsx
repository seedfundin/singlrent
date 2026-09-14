'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Building2,
  Check,
  CircleCheck,
  House,
  KeyRound,
  ShieldCheck,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AccountRole } from '@/lib/account';
import type { View } from '@/lib/routes';
import './auth.css';

const roleCopy: Record<
  AccountRole,
  { label: string; detail: string; destination: View }
> = {
  tenant: {
    label: 'Tenant',
    detail: 'Find and rent a verified home.',
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
          <h2>Every account is verified before it can transact.</h2>
          <p>
            Phone and identity checks help keep tenants, agents and landlords
            safer from the first conversation.
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

export function SignIn({ go }: { go: (view: View) => void }) {
  const [showPassword, setShowPassword] = useState(false);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    go('tenant');
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
        <Button type="submit" className="auth-submit">
          Sign in <ArrowRight size={15} />
        </Button>
        <div className="auth-divider">
          <span />
          or
          <span />
        </div>
        <GoogleButton
          label="Continue with Google"
          onClick={() => go('tenant')}
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
  const submit = (event: FormEvent) => {
    event.preventDefault();
    go('account-type');
  };
  return (
    <AuthLayout
      go={go}
      eyebrow="Create your account"
      title="Start with SingleRent"
      copy="Set up your account, then complete identity verification for your role."
    >
      <form className="auth-form" onSubmit={submit}>
        <div className="auth-name-fields">
          <label>
            First name
            <input
              placeholder="First name"
              autoComplete="given-name"
              required
            />
          </label>
          <label>
            Last name
            <input
              placeholder="Last name"
              autoComplete="family-name"
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
            required
          />
        </label>
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
          onClick={() => go('account-type')}
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
  onChoose: (role: AccountRole) => void;
}) {
  const [role, setRole] = useState<AccountRole>('tenant');
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
      copy="All account types must complete phone and identity verification."
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
          after verification.
        </p>
        <div className="auth-actions">
          <Button variant="ghost" onClick={() => go('sign-up')}>
            <ArrowLeft size={14} /> Back
          </Button>
          <Button onClick={() => onChoose(role)}>
            Continue to KYC <ArrowRight size={14} />
          </Button>
        </div>
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
  const destination = roleCopy[role].destination;
  const labels = [
    'Account details',
    'Phone verification',
    'NIMC confirmation',
    'Complete',
  ];
  const heading =
    step === 1
      ? 'Confirm your details'
      : step === 2
        ? 'Verify your phone number'
        : step === 3
          ? 'Confirm your NIN'
          : 'Review verification';
  const copy =
    step === 1
      ? `Your ${roleCopy[role].label.toLowerCase()} account needs a verified phone number and NIN before you can use its workspace.`
      : step === 2
        ? 'Enter the code sent to +234 803 555 0142.'
        : step === 3
          ? 'We will confirm that your NIN matches the NIMC record.'
          : 'Check the verification status before entering your workspace.';
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
                <CircleCheck size={30} />
              </i>
              <span>
                <BadgeCheck size={13} /> Verification complete
              </span>
              <h2>Your phone and NIN are confirmed.</h2>
              <p>
                Your phone was verified by one-time code. NIMC confirmation is
                represented here while the live NIMC connection is being
                implemented.
              </p>
              <div>
                <b>
                  <Check size={14} /> Phone verified
                </b>
                <b>
                  <Check size={14} /> NIN matched with NIMC
                </b>
              </div>
              <Button onClick={() => go(destination)}>
                Open {roleCopy[role].label.toLowerCase()} workspace{' '}
                <ArrowRight size={14} />
              </Button>
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
                      <input defaultValue="Adaeze" />
                    </label>
                    <label>
                      Last name
                      <input defaultValue="Okafor" />
                    </label>
                    <label className="full-field">
                      Phone number
                      <input defaultValue="+234 803 555 0142" />
                    </label>
                    <label className="full-field">
                      NIN
                      <input defaultValue="0123 4567 8910" />
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
                      {['3', '2', '', '', '', ''].map((value, index) => (
                        <input
                          aria-label={`Verification digit ${index + 1}`}
                          key={index}
                          defaultValue={value}
                          maxLength={1}
                        />
                      ))}
                    </div>
                    <button>Resend code in 00:42</button>
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
                        label="NIMC confirmation"
                        state="Ready to confirm"
                      />
                    </span>
                    <p>
                      <b>Test environment:</b> this screen represents the NIMC
                      response. It does not connect to NIMC or verify a real NIN
                      yet.
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
                        +234 803 555 0142 <em>Verified</em>
                      </b>
                    </span>
                    <span>
                      NIN{' '}
                      <b>
                        •••• •••• 8910 <em>Confirmed with NIMC</em>
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
                <Button
                  onClick={() =>
                    step < 4 ? setStep(step + 1) : setComplete(true)
                  }
                >
                  {step === 3
                    ? 'Confirm with NIMC'
                    : step === 4
                      ? 'Finish verification'
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
