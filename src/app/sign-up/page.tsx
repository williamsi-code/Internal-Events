import AuthForm from '@/components/AuthForm';
import Masthead from '@/components/Masthead';

export const metadata = { title: 'Create an account — Events & Conferences' };

export default function SignUpPage() {
  return (
    <>
      <Masthead />
      <main id="main" className="narrow">
        <AuthForm mode="sign-up" />
      </main>
    </>
  );
}

