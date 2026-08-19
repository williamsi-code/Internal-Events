import AuthForm from '@/components/AuthForm';
import Masthead from '@/components/Masthead';

export const metadata = { title: 'Sign in — Events & Conferences' };

export default function SignInPage() {
  return (
    <>
      <Masthead />
      <main id="main" className="narrow">
        <AuthForm mode="sign-in" />
      </main>
    </>
  );
}

