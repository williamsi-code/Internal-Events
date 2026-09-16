import { redirect } from 'next/navigation';
import Link from 'next/link';
import Masthead from '@/components/Masthead';
import RoomRequests from '@/components/RoomRequests';
import { getSessionUser } from '@/lib/auth';
import { listRoomRequests, listRecentRoomDecisions } from '@/lib/rooms';

export const metadata = { title: 'Room bookings' };
export const dynamic = 'force-dynamic';

export default async function RoomsPage() {
  const user = await getSessionUser();
  if (!user) redirect('/sign-in');
  const isStaff =
    user.roles.includes('events_staff') || user.roles.includes('admin');
  if (!isStaff) redirect('/');

  const [requests, recent] = await Promise.all([
    listRoomRequests(),
    listRecentRoomDecisions(),
  ]);

  return (
    <>
      <Masthead />
      <main id="main">
        <div className="pagehead">
          <h1>Room bookings</h1>
          <p className="lede">
            Rooms asked for through the scheduler, with no catering attached.
            The person who asked has the slot held and is assuming it is
            theirs, so these are worth answering quickly.
          </p>
        </div>

        <div className="shell" style={{ maxWidth: '54rem' }}>
          <RoomRequests requests={requests} recent={recent} />

          <p className="sub" style={{ marginTop: '1.5rem' }}>
            <Link href="/staff/schedule">Open the schedule</Link> to see these
            in context, or to book a room yourself.
          </p>
        </div>
      </main>
    </>
  );
}
