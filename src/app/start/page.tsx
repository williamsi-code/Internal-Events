import { redirect } from 'next/navigation';
import Masthead from '@/components/Masthead';
import { getSessionUser } from '@/lib/auth';

export const metadata = { title: 'Start creating your event' };

export default async function StartPage() {
  const user = await getSessionUser();
  if (!user) redirect('/sign-in');

  return (
    <>
      {/* @ts-expect-error async server component */}
      <Masthead current="/start" />
      <main id="main">
        <div className="pagehead">
          <h1>Start creating your event</h1>
          <p className="lede">
            Signed in as {user.full_name}. The intake form is being built — this
            page confirms your account and database connection are working.
          </p>
        </div>
        <div className="shell">
          <div className="card">
            <h2>Next to build</h2>
            <p className="hint">
              Sections A to D of the intake form, ported from the prototype.
              The submission API route already exists and is ready to receive it.
            </p>
          </div>
        </div>
      </main>
    </>
  );
}
