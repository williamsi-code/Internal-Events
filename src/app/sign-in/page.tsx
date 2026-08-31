import { Suspense } from 'react';
import AuthForm from '@/components/AuthForm';

export const metadata = { title: 'Sign in - Central College Catering' };

export default function SignInPage() {
  return (
    <main id="main" className="narrow">
      <Suspense fallback={null}>
        <AuthForm mode="sign-in" />
      </Suspense>
    </main>
  );
}
