import Link from 'next/link';
import { getSessionUser } from '@/lib/auth';

const SECTIONS = [
  { href: '/info/catering-menu', label: 'Catering menu' },
  { href: '/info/event-spaces', label: 'Event spaces' },
  { href: '/info/internal-policies', label: 'Internal event policies' },
  { href: '/info/external-policies', label: 'External event policies' },
  { href: '/info/classification', label: 'Classification of events' },
  { href: '/start', label: 'Start creating your event' },
];

export default async function Masthead({ current }: { current?: string }) {
  const user = await getSessionUser();
  const isStaff =
    user?.roles.includes('events_staff') || user?.roles.includes('admin');

  return (
    <>
      <header className="masthead">
        <div className="masthead-inner">
          <Link href="/" className="wordmark" style={{ textDecoration: 'none', color: 'inherit' }}>
            Central <span>College</span>
          </Link>
          <div className="unit">Events &amp; Conferences</div>
          <div className="masthead-right">
            {user ? (
              <>
                {isStaff && <Link href="/staff">Staff queue</Link>}
                {isStaff && ' · '}
                {user.full_name}
                {' · '}
                <form action="/api/auth/sign-out" method="post" style={{ display: 'inline' }}>
                  <button
                    type="submit"
                    style={{
                      background: 'none', border: 0, padding: 0,
                      font: 'inherit', color: 'var(--crimson)', cursor: 'pointer',
                    }}
                  >
                    Sign out
                  </button>
                </form>
              </>
            ) : (
              <Link href="/sign-in">Sign in</Link>
            )}
          </div>
        </div>
      </header>

      <nav className="sitenav" aria-label="Sections">
        <ul>
          {SECTIONS.map(s => (
            <li key={s.href}>
              <Link href={s.href} aria-current={current === s.href ? 'page' : undefined}>
                {s.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
