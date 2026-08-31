import { Suspense } from 'react';
import AuthForm from '@/components/AuthForm';

export const metadata = { title: 'Create an account - Central College Catering' };

export default function SignUpPage() {
  return (
    <main id="main" className="narrow">
      <Suspense fallback={null}>
        <AuthForm mode="sign-up" />
      </Suspense>
    </main>
  );
}
