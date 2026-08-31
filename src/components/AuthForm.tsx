'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

export default function AuthForm({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const router = useRouter();
  const params = useSearchParams();
  const isSignUp = mode === 'sign-up';

  // Where to go afterwards. Someone who clicked "order catering" and
  // was asked to sign in should land back on the order page, not on a
  // generic dashboard.
  const next = params.get('next') ?? '/my-requests';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [departmentOrg, setDepartmentOrg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError('');

    if (isSignUp && password.length < 12) {
      setError('Choose a password of at least 12 characters.');
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          isSignUp
            ? { email, password, fullName, departmentOrg }
            : { email, password }
        ),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong. Try again.');
        setBusy(false);
        return;
      }
      router.push(next);
      router.refresh();
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
      setBusy(false);
    }
  }

  const orderingContext = next === '/order';

  return (
    <div className="card">
      <span className="eyebrow">{isSignUp ? 'New account' : 'Sign in'}</span>
      <h2>{isSignUp ? 'Create an account' : 'Welcome back'}</h2>
      <p className="hint">
        {orderingContext
          ? 'An account lets you place an order and follow it afterwards \u2014 what you chose, what it costs, and where it stands.'
          : isSignUp
            ? 'You need an account to submit and track event requests.'
            : 'Sign in to place an order, submit a request, or check on one you have already sent.'}
      </p>

      {error && <div className="alert alert-error">{error}</div>}

      {isSignUp && (
        <>
          <div className="field">
            <label htmlFor="fullName">Your name<span className="req">*</span></label>
            <input
              id="fullName" type="text" autoComplete="name" value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="departmentOrg">
              {orderingContext ? 'Organization' : 'Department or organization'}
            </label>
            <p className="sub">
              {orderingContext ? 'Leave blank for a private event.' : ''}
            </p>
            <input
              id="departmentOrg" type="text" value={departmentOrg}
              onChange={(e) => setDepartmentOrg(e.target.value)}
            />
          </div>
        </>
      )}

      <div className="field">
        <label htmlFor="email">Email<span className="req">*</span></label>
        <input
          id="email" type="email" autoComplete="email" value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="password">Password<span className="req">*</span></label>
        {isSignUp && (
          <p className="sub">At least 12 characters. A short phrase works well.</p>
        )}
        <input
          id="password" type="password"
          autoComplete={isSignUp ? 'new-password' : 'current-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
        />
      </div>

      <button className="btn btn-primary btn-block" onClick={submit} disabled={busy}>
        {busy ? 'Just a moment\u2026' : isSignUp ? 'Create account' : 'Sign in'}
      </button>

      <p className="footnote">
        {isSignUp ? (
          <>
            Already have an account?{' '}
            <Link href={`/sign-in?next=${encodeURIComponent(next)}`}>Sign in</Link>
          </>
        ) : (
          <>
            Need an account?{' '}
            <Link href={`/sign-up?next=${encodeURIComponent(next)}`}>Create one</Link>
          </>
        )}
      </p>

      <p className="footnote">
        <Link href="/">Back to Central College Catering</Link>
      </p>
    </div>
  );
}
