import Link from 'next/link';
import { getSessionUser } from '@/lib/auth';
import { getNotices } from '@/lib/notifications';
import Notifications from './Notifications';

/**
 * Two headers, one component.
 *
 * Public pages browse: menu, spaces, policies, classification. Signed-in
 * working pages do not - someone filling in an intake form does not need
 * a link to the policy page beside it, and offering one invites them to
 * wander off mid-task.
 */

const SECTIONS = [
  { href: '/info/catering-menu', label: 'Catering menu' },
  { href: '/info/event-spaces', label: 'Event spaces' },
  { href: '/info/internal-policies', label: 'Catering policies' },
  { href: '/info/external-policies', label: 'External event policies' },
  { href: '/info/classification', label: 'Classification of events' },
  { href: '/caterers', label: 'Outside caterers' },
];

export default async function Masthead({
  current,
  variant = 'app',
}: {
  current?: string;
  variant?: 'public' | 'app';
}) {
  const user = await getSessionUser();
  const isStaff =
    user?.roles.includes('events_staff') || user?.roles.includes('admin');
  // Security and facilities get the schedule and nothing else.
  const scheduleOnly = !isStaff && user?.roles.includes('schedule_viewer');

  const notices = user ? await getNotices(user.id, !!isStaff) : [];

  return (
    <>
      <header className="masthead">
        <div className="masthead-inner">
          <Link
            href="/"
            className="wordmark"
            style={{ textDecoration: 'none', color: 'inherit' }}
          >
            Central <span>College</span>
          </Link>
          <div className="unit">Events &amp; Conferences</div>

          <div className="masthead-right">
            {user ? (
              <>
                {isStaff && (
                  <>
                    <Link href="/staff">Queue</Link>
                    {' \u00b7 '}
                    <Link href="/staff/schedule">Schedule</Link>
                    {' \u00b7 '}
                    <Link href="/staff/manage">Back office</Link>
                    {' \u00b7 '}
                  </>
                )}
                {scheduleOnly && (
                  <>
                    <Link href="/staff/schedule">Schedule</Link>
                    {' \u00b7 '}
                  </>
                )}
                <Link href="/my-requests">My requests</Link>
                {' \u00b7 '}
                {user.full_name}
                {' \u00b7 '}
                <form
                  action="/api/auth/sign-out"
                  method="post"
                  style={{ display: 'inline' }}
                >
                  <button
                    type="submit"
                    style={{
                      background: 'none',
                      border: 0,
                      padding: 0,
                      font: 'inherit',
                      color: 'var(--crimson)',
                      cursor: 'pointer',
                    }}
                  >
                    Sign out
                  </button>
                </form>
                <Notifications notices={notices} />
              </>
            ) : (
              <Link href="/sign-in">Sign in</Link>
            )}
          </div>
        </div>
      </header>

      {variant === 'public' && (
        <nav className="sitenav" aria-label="Sections">
          <ul>
            {SECTIONS.map((s) => (
              <li key={s.href}>
                <Link
                  href={s.href}
                  aria-current={current === s.href ? 'page' : undefined}
                >
                  {s.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </>
  );
}
