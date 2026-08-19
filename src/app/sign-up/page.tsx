import AuthForm from '@/components/AuthForm';
import Masthead from '@/components/Masthead';

export const metadata = { title: 'Create an account — Events & Conferences' };

export default function SignUpPage() {
  return (
    <>
      {/* @ts-expect-error async server component */}
      <Masthead />
      <main id="main" className="narrow">
        <AuthForm mode="sign-up" />
      </main>
    </>
  );
}
