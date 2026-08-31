import { redirect } from 'next/navigation';
import Link from 'next/link';
import Masthead from '@/components/Masthead';
import EnquiryForm from '@/components/EnquiryForm';
import { getSessionUser } from '@/lib/auth';

export const metadata = { title: 'Ask us something - Central College Catering' };

export default async function EnquiryPage() {
  const user = await getSessionUser();

  // An enquiry is the start of a conversation, so it needs somewhere
  // to happen. Without an account there is nowhere to show the reply.
  if (!user) redirect('/sign-in?next=/enquiry');

  return (
    <>
      <Masthead />
      <main
        id="main"
        className="shell"
        style={{ maxWidth: '44rem', paddingTop: '2rem' }}
      >
        <Link href="/" className="backlink-inline">
          &larr; Central College Catering
        </Link>
        <EnquiryForm source="enquiry-page" userName={user.full_name} />
      </main>
    </>
  );
}
