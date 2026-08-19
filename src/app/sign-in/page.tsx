import AuthForm from '@/components/AuthForm';
import Masthead from '@/components/Masthead';

export const metadata = { title: 'Sign in — Events & Conferences' };

export default function SignInPage() {
  return (
    <>
      {/* @ts-expect-error async server component */}
      <Masthead />
      <main id="main" className="narrow">
        <AuthForm mode="sign-in" />
      </main>
    </>
  );
}
