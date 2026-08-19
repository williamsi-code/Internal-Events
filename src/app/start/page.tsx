import { redirect } from 'next/navigation';
import Masthead from '@/components/Masthead';
import IntakeForm, {
  type EventTypeOption,
  type SpaceOption,
} from '@/components/IntakeForm';
import { getSessionUser } from '@/lib/auth';
import { query } from '@/lib/db';

export const metadata = { title: 'Start creating your event' };

// Reference data changes rarely but should not be baked in at build time,
// since staff edit event types and spaces directly in the database.
export const dynamic = 'force-dynamic';

export default async function StartPage() {
  const user = await getSessionUser();
  if (!user) redirect('/sign-in');

  const [eventTypes, spaces] = await Promise.all([
    query<EventTypeOption>(
      `SELECT et.id, et.name, c.name AS category,
              et.default_classification, et.always_review, et.guidance
         FROM event_types et
         JOIN event_type_categories c ON c.id = et.category_id
        WHERE et.is_active
        ORDER BY c.sort_order, et.sort_order`
    ),
    query<SpaceOption>(
      `SELECT id, name, building, capacity_seated, capacity_standing
         FROM spaces
        WHERE is_active
        ORDER BY sort_order, name`
    ),
  ]);

  return (
    <>
      <Masthead current="/start" />
      <main id="main">
        <div className="pagehead">
          <h1>Start creating your event</h1>
          <p className="lede">
            Every event begins here. Tell us what you are planning and how it is
            funded, and the events office will confirm how your event is
            classified &mdash; which determines the policies, pricing, and
            services that apply.
          </p>
        </div>
        <div className="shell">
          <IntakeForm
            eventTypes={eventTypes}
            spaces={spaces}
            defaultDepartment={user.department_org ?? ''}
          />
        </div>
      </main>
    </>
  );
}