import Link from 'next/link';
import EnquiryForm from '@/components/EnquiryForm';

export const metadata = { title: 'Ask us something - Central College Catering' };

export default function EnquiryPage() {
  return (
    <main id="main" className="shell" style={{ maxWidth: '44rem', paddingTop: '2rem' }}>
      <Link href="/" className="backlink-inline">
        &larr; Central College Catering
      </Link>
      <EnquiryForm source="enquiry-page" />
    </main>
  );
}
