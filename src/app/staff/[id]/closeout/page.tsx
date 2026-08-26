import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import Masthead from '@/components/Masthead';
import CloseoutForm from '@/components/CloseoutForm';
import { getSessionUser } from '@/lib/auth';
import { getCloseoutState } from '@/lib/closeout';

export const metadata = { title: 'Close out event' };
export const dynamic = 'force-dynamic';

export default async function CloseoutPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const user = await getSessionUser();
  if (!user) redirect('/sign-in');
  const isStaff =
    user.roles.includes('events_staff') || user.roles.includes('admin');
  if (!isStaff) redirect('/');

  const state = await getCloseoutState(id);
  if (!state) notFound();

  return (
    <>
      <Masthead />
      <main id="main">
        <div className="shell" style={{ paddingTop: '1.5rem', maxWidth: '46rem' }}>
          <Link href="/staff/closeout" className="backlink-inline">
            &larr; All events awaiting close-out
          </Link>
          <CloseoutForm state={state} />
        </div>
      </main>
    </>
  );
}
