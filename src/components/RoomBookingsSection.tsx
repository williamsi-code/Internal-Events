import Link from 'next/link';
import AddCatering from '@/components/AddCatering';
import { query } from '@/lib/db';

/**
 * A person's room bookings, on their requests page.
 *
 * Shown beside their events because from where they sit it is the
 * same thing: something they asked for and are waiting on. The
 * difference is only that one has food.
 */

interface RoomBooking {
  booking_id: string;
  title: string;
  space_name: string;
  building: string | null;
  supports_catering: boolean;
  event_date: string;
  when: string;
  status: string;
  quick_state: string | null;
  quick_attendance: number | null;
}

export default async function RoomBookingsSection({
  userId,
  isStaff,
}: {
  userId: string;
  isStaff: boolean;
}) {
  const bookings = await query<RoomBooking>(
    `SELECT b.booking_id, b.title, b.space_name, b.building,
            b.supports_catering,
            to_char(b.event_date, 'FMDay, FMMonth FMDD') AS event_date,
            to_char(b.start_time, 'FMHH12:MI AM') || ' - ' ||
            to_char(b.end_time, 'FMHH12:MI AM') AS when,
            b.status, bk.quick_state::text, b.quick_attendance
       FROM bookings_without_events b
       JOIN bookings bk ON bk.id = b.booking_id
      WHERE b.requested_by = $1
      ORDER BY b.event_date, b.start_time`,
    [userId]
  );

  if (bookings.length === 0) return null;

  return (
    <>
      <h2 className="bo-heading">Rooms you have booked</h2>
      <div className="queue">
        {bookings.map((b) => (
          <div className="qcard static" key={b.booking_id}>
            <div className="qtop">
              <span className="qref">Room only</span>
              <span
                className={`pill ${
                  b.quick_state === 'requested' ? 'p-info' : 'p-type'
                }`}
              >
                {b.quick_state === 'requested'
                  ? 'With the events office'
                  : 'Booked'}
              </span>
            </div>
            <div className="qname">{b.title}</div>
            <div className="qmeta">
              {b.space_name}
              {b.building ? ` \u00b7 ${b.building}` : ''}
              {' \u00b7 '}
              {b.event_date} {'\u00b7'} {b.when}
            </div>

            <AddCatering
              bookingId={b.booking_id}
              title={b.title}
              attendance={b.quick_attendance}
              supportsCatering={b.supports_catering}
              isStaff={isStaff}
            />
          </div>
        ))}
      </div>

      <p className="sub">
        These are rooms only. <Link href="/staff/schedule">The schedule</Link>{' '}
        shows them alongside everything else on campus.
      </p>
    </>
  );
}
