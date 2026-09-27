import { redirect } from 'next/navigation';
import Masthead from '@/components/Masthead';
import IntakeForm from '@/components/IntakeForm';
import { getSessionUser } from '@/lib/auth';
import { getOrderSpaces, getPublicMenu } from '@/lib/orders';
import { getChoiceGroups } from '@/lib/choices';
import { query } from '@/lib/db';

export const metadata = { title: 'Request an event - Central College' };
export const dynamic = 'force-dynamic';

interface EventType {
  id: string;
  name: string;
  guidance: string | null;
}

export default async function StartPage() {
  const user = await getSessionUser();
  if (!user) redirect('/sign-in?next=/start');

  const [spaces, eventTypes, menu, choiceGroups] = await Promise.all([
    getOrderSpaces(),
    // Queried here rather than through a helper: the event type is
    // now only a label on the form and a column in the report, so it
    // does not need a module of its own.
    query<EventType>(
      `SELECT id, name, guidance
         FROM event_types
        WHERE is_active
        ORDER BY sort_order, name`
    ),
    getPublicMenu(),
    getChoiceGroups(),
  ]);

  return (
    <>
      <Masthead />
      <main id="main">
        <div className="pagehead">
          <h1>Request an event</h1>
          <p className="lede">
            One form. Tell us what you know and leave the rest &mdash; we will
            come back to you about anything that needs deciding. If you already
            know your menu, you can choose it here and be done.
          </p>
        </div>

        <div className="shell" style={{ maxWidth: '46rem' }}>
          <IntakeForm
            spaces={spaces}
            eventTypes={eventTypes}
            menu={menu}
            choiceGroups={choiceGroups}
            defaultName={user.full_name}
            defaultOrg={user.department_org}
            defaultEmail={user.email}
          />
        </div>
      </main>
    </>
  );
}
