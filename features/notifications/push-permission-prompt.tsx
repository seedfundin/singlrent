'use client';

import { useEffect, useRef, useState } from 'react';
import { BellRing, Check, LoaderCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ApiSession } from '@/lib/api';
import {
  canOfferPushPermission,
  enablePush,
  pushPromptEvent,
} from './push-client';

type PromptState = 'hidden' | 'ready' | 'enabling' | 'enabled' | 'error';

export function PushPermissionPrompt({
  session,
}: {
  session: ApiSession | null;
}) {
  const [state, setState] = useState<PromptState>('hidden');
  const [message, setMessage] = useState('');
  const [shownFor, setShownFor] = useState<string | null>(null);
  const signInPromptedFor = useRef<string | null>(null);
  const sessionKey = session
    ? `${session.user.id}:${session.accessToken}`
    : null;

  useEffect(() => {
    if (!session || !sessionKey) return;
    if (
      signInPromptedFor.current === sessionKey ||
      !canOfferPushPermission()
    ) {
      return;
    }
    signInPromptedFor.current = sessionKey;
    const timer = window.setTimeout(() => {
      setMessage('');
      setState('ready');
      setShownFor(sessionKey);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [session, sessionKey]);

  useEffect(() => {
    const showAfterMilestone = () => {
      if (!session || !sessionKey || !canOfferPushPermission()) return;
      window.setTimeout(() => {
        setMessage('');
        setState('ready');
        setShownFor(sessionKey);
      }, 320);
    };
    window.addEventListener(pushPromptEvent, showAfterMilestone);
    return () => window.removeEventListener(pushPromptEvent, showAfterMilestone);
  }, [session, sessionKey]);

  const enable = async () => {
    if (!session) return;
    setState('enabling');
    setMessage('');
    try {
      await enablePush(session.accessToken, session.user.id);
      setState('enabled');
      setMessage('Notifications are on for this browser.');
      window.setTimeout(() => setState('hidden'), 1800);
    } catch (cause) {
      const denied =
        typeof Notification !== 'undefined' &&
        Notification.permission === 'denied';
      setState('error');
      setMessage(
        denied
          ? 'Notifications are blocked in your browser settings. You can allow them there whenever you are ready.'
          : cause instanceof Error
            ? cause.message
            : 'We could not turn on notifications just now.',
      );
    }
  };

  if (!session || shownFor !== sessionKey || state === 'hidden') return null;

  const active = state === 'ready' || state === 'enabling';
  return (
    <dialog
      open
      className="push-permission-prompt"
      aria-live="polite"
      aria-label="Browser notifications"
    >
      <button
        className="push-permission-dismiss"
        type="button"
        aria-label="Dismiss notification prompt"
        disabled={state === 'enabling'}
        onClick={() => setState('hidden')}
      >
        <X size={16} />
      </button>
      <i aria-hidden="true">
        {state === 'enabled' ? <Check size={19} /> : <BellRing size={19} />}
      </i>
      <div>
        <strong>
          {state === 'enabled'
            ? 'You are all set'
            : 'Stay updated on this device'}
        </strong>
        <p>
          {message ||
            'Get timely updates about your home, payments, messages and inspections.'}
        </p>
        {active && (
          <footer>
            <Button disabled={state === 'enabling'} onClick={() => void enable()}>
              {state === 'enabling' ? (
                <>
                  <LoaderCircle className="spin" size={14} /> Enabling…
                </>
              ) : (
                'Enable updates'
              )}
            </Button>
            <Button
              variant="ghost"
              disabled={state === 'enabling'}
              onClick={() => setState('hidden')}
            >
              Not now
            </Button>
          </footer>
        )}
      </div>
    </dialog>
  );
}
