import { NextRequest } from 'next/server';
import { query, one } from '@/lib/db';

/**
 * A subscribable calendar feed.
 *
 * Unauthenticated by necessity - Outlook fetches with no credentials -
 * so the token in the URL is the whole of the security. It is 48 hex
 * characters and a feed can be revoked, which is what makes that
 * acceptable.
 *
 * Written by hand rather than with a library because RFC 5545 is
 * mostly string formatting and the awkward parts are line folding and
 * escaping, which a dependency would not save us from understanding.
 */

export const dynamic = 'force-dynamic';

/** Times go out as UTC. Outlook converts to the viewer's zone, which
 *  is right for a campus with visitors. */
function stamp(d: Date) {
  return (
    d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  );
}

/** Commas, semicolons and backslashes are structural in ICS. */
function esc(text: string | null) {
  if (!text) return '';
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Lines over 75 octets must be folded, continued with a space.
 *  Outlook is tolerant; some clients are not. */
function fold(line: string) {
  if (line.length <= 74) return line;
  const parts: string[] = [line.slice(0, 74)];
  let rest = line.slice(74);
  while (rest.length > 73) {
    parts.push(' ' + rest.slice(0, 73));
    rest = rest.slice(73);
  }
  if (rest) parts.push(' ' + rest);
  return parts.join('\r\n');
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  // Strip a .ics suffix so both forms of the URL work; some clients
  // insist on the extension.
  const clean = token.replace(/\.ics$/i, '');

  const settings = await one<{ label: string; show_details: boolean }>(
    'SELECT * FROM feed_settings($1)',
    [clean]
  );

  if (!settings) {
    return new Response('Calendar not found or no longer available.', {
      status: 404,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  const rows = await query<{
    id: string;
    title: string;
    space_name: string;
    building: string | null;
    starts_at: Date;
    ends_at: Date;
    event_starts_at: Date | null;
    event_ends_at: Date | null;
    status: string;
    is_blackout: boolean;
    note: string | null;
    attendance: number | null;
    reference_code: string | null;
    updated_at: Date;
  }>('SELECT * FROM feed_bookings($1)', [clean]);

  await query('SELECT record_feed_fetch($1)', [clean]).catch(() => {});

  const now = stamp(new Date());
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Central College//Events and Conferences//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(settings.label)}`,
    'X-WR-TIMEZONE:America/Chicago',
    // A hint to clients about how often to poll. Outlook largely
    // ignores it, but the well-behaved ones honour it.
    'X-PUBLISHED-TTL:PT1H',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
  ];

  for (const b of rows) {
    const location = b.building
      ? `${b.building} — ${b.space_name}`
      : b.space_name;

    // A feed without details says the room is busy and nothing more,
    // which is what a facilities calendar usually wants.
    const summary = settings.show_details
      ? b.is_blackout
        ? `${b.title} — ${b.space_name}`
        : `${b.title}${b.status === 'tentative' ? ' (tentative)' : ''}`
      : b.is_blackout
        ? `${b.space_name} unavailable`
        : `${b.space_name} in use`;

    const description: string[] = [];
    if (settings.show_details) {
      if (b.event_starts_at && b.starts_at < b.event_starts_at) {
        description.push(
          `Room held from ${b.starts_at.toLocaleTimeString('en-US', {
            timeZone: 'America/Chicago',
            hour: 'numeric',
            minute: '2-digit',
          })} for setup.`
        );
      }
      if (b.attendance) description.push(`${b.attendance} guests expected.`);
      if (b.note) description.push(b.note);
      if (b.reference_code) description.push(`Reference ${b.reference_code}.`);
      if (b.status === 'tentative' && !b.is_blackout) {
        description.push('This is a tentative hold, not yet confirmed.');
      }
    }

    lines.push(
      'BEGIN:VEVENT',
      `UID:${b.id}@central-events`,
      `DTSTAMP:${now}`,
      `DTSTART:${stamp(new Date(b.starts_at))}`,
      `DTEND:${stamp(new Date(b.ends_at))}`,
      fold(`SUMMARY:${esc(summary)}`),
      fold(`LOCATION:${esc(location)}`),
      // Tentative holds show as such in clients that support it, so a
      // provisional booking does not look settled.
      `STATUS:${b.status === 'confirmed' || b.is_blackout ? 'CONFIRMED' : 'TENTATIVE'}`,
      'TRANSP:OPAQUE',
      `LAST-MODIFIED:${stamp(new Date(b.updated_at))}`
    );

    if (description.length > 0) {
      lines.push(fold(`DESCRIPTION:${esc(description.join(' '))}`));
    }

    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');

  return new Response(lines.join('\r\n') + '\r\n', {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `inline; filename="${clean}.ics"`,
      // Short cache: clients poll on their own schedule anyway, and a
      // long cache would make an updated booking take even longer to
      // appear than Outlook already makes it.
      'Cache-Control': 'public, max-age=300',
    },
  });
}
