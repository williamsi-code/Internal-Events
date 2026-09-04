import { redirect } from 'next/navigation';
import Link from 'next/link';
import { headers } from 'next/headers';
import Masthead from '@/components/Masthead';
import CalendarFeeds from '@/components/CalendarFeeds';
import { getSessionUser } from '@/lib/auth';
import { listFeeds, listFeedTargets } from '@/lib/feeds';

export const metadata = { title: 'Calendar feeds - back office' };
export const dynamic = 'force-dynamic';

export default async function FeedsPage() {
  const user = await getSessionUser();
  if (!user) redirect('/sign-in');
  const isStaff =
    user.roles.includes('events_staff') || user.roles.includes('admin');
  if (!isStaff) redirect('/');

  const [feeds, targets] = await Promise.all([listFeeds(), listFeedTargets()]);

  // Build the public URL from the request rather than a setting, so
  // links are correct in development and production without anyone
  // configuring anything.
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = host.startsWith('localhost') ? 'http' : 'https';
  const baseUrl = `${proto}://${host}`;

  return (
    <>
      <Masthead />
      <main id="main">
        <div className="shell" style={{ paddingTop: '1.5rem', maxWidth: '58rem' }}>
          <Link href="/staff/manage" className="backlink-inline">
            &larr; Back office
          </Link>
          <div className="pagehead" style={{ padding: '0 0 1.25rem' }}>
            <h1>Calendar feeds</h1>
            <p className="lede">
              Read-only calendars people can subscribe to in Outlook, so
              security and facilities see what is happening without signing in.
            </p>
          </div>

          <details className="how-to">
            <summary>How to subscribe in Outlook</summary>
            <ol className="next-steps">
              <li>Copy the link for the calendar you want.</li>
              <li>
                In Outlook on the web, open the Calendar, then{' '}
                <strong>Add calendar</strong> and{' '}
                <strong>Subscribe from web</strong>.
              </li>
              <li>
                Paste the link, give the calendar a name, and choose a colour.
              </li>
              <li>
                In desktop Outlook it is{' '}
                <strong>Add Calendar &rarr; From Internet</strong>.
              </li>
            </ol>
            <p className="sub">
              Outlook decides how often to check for changes, usually every few
              hours. A booking made this morning may not appear until this
              afternoon, so the feed is right for knowing what is coming rather
              than for anything urgent.
            </p>
          </details>

          <CalendarFeeds
            feeds={feeds}
            buildings={targets.buildings}
            spaces={targets.spaces}
            categories={targets.categories}
            baseUrl={baseUrl}
          />
        </div>
      </main>
    </>
  );
}
