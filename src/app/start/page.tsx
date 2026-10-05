import { redirect } from 'next/navigation';
import Link from 'next/link';
import Masthead from '@/components/Masthead';
import IntakeForm from '@/components/IntakeForm';
import { getSessionUser } from '@/lib/auth';
import { getOrderSpaces, getPublicMenu } from '@/lib/orders';
import { getChoiceGroups } from '@/lib/choices';
import { bookingAccess } from '@/lib/campus';
import { query } from '@/lib/db';

export const metadata = { title: 'Request an event - Central College' };
export const dynamic = 'force-dynamic';

interface EventType {
  id: string;
  name: string;
  guidance: string | null;
  group_name: string;
  group_order: number;
}

interface CatererOption {
  id: string;
  business_name: string;
  cuisine_notes: string | null;
  insurance_lapsed: boolean;
  license_lapsed: boolean;
}

export default async function StartPage({
  searchParams,
}: {
  searchParams: Promise<{ need?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/sign-in?next=/start');

  const sp = await searchParams;
  const need = sp.need;
  const access = bookingAccess(user);

  /* ---------- the question that saves most people the form ---------- */
  if (need !== 'food' && need !== 'setup') {
    return (
      <>
        <Masthead />
        <main id="main">
          <div className="pagehead">
            <h1>What do you need?</h1>
            <p className="lede">
              Most things on campus are a room and nothing else, and that takes
              about twenty seconds. The longer form is only for events where we
              are cooking or setting up.
            </p>
          </div>

          <div className="shell" style={{ maxWidth: '46rem' }}>
            <div className="need-choices">
              {access.canBook ? (
                <Link href="/book" className="need-card">
                  <span className="need-eyebrow">Quickest</span>
                  <h2>A room, as it is</h2>
                  <p>
                    A meeting, a rehearsal, somewhere to sit. Pick a free slot
                    on the schedule and it is yours. No food, no setup, no
                    questions about who is paying.
                  </p>
                  <span className="need-go">Open the schedule &rarr;</span>
                </Link>
              ) : (
                <div className="need-card disabled">
                  <h2>A room, as it is</h2>
                  <p>
                    Direct room booking is for Central staff and faculty. Ask
                    us below and we will arrange it.
                  </p>
                </div>
              )}

              <Link href="/start?need=setup" className="need-card">
                <h2>A room, set up a particular way</h2>
                <p>
                  Rounds of eight, a podium, a projector. We will arrange the
                  room and the equipment, but nobody is cooking.
                </p>
                <span className="need-go">Tell us about it &rarr;</span>
              </Link>

              <Link href="/start?need=food" className="need-card">
                <h2>An event with food</h2>
                <p>
                  Anything we are catering, anything an outside caterer is
                  doing, or food you are bringing in. This is the full request,
                  and it takes a few minutes.
                </p>
                <span className="need-go">Tell us about it &rarr;</span>
              </Link>
            </div>

            <p className="sub" style={{ marginTop: '1.5rem' }}>
              Not sure which? Start with the room and add food later &mdash;
              every booking can grow into an event without losing the slot.
              Or <Link href="/enquiry">just ask us</Link>.
            </p>
          </div>
        </main>
      </>
    );
  }

  /* ---------- the form ---------- */
  const [spaces, eventTypes, menu, choiceGroups, caterers] =
    await Promise.all([
      getOrderSpaces(),
      query<EventType>(
        `SELECT id, name, guidance, group_name, group_order
           FROM event_types WHERE is_active
          ORDER BY group_order, group_name, sort_order, name`
      ),
      need === 'food' ? getPublicMenu() : Promise.resolve([]),
      need === 'food' ? getChoiceGroups() : Promise.resolve({}),
      need === 'food'
        ? query<CatererOption>(
            `SELECT id, business_name, cuisine_notes,
                    insurance_lapsed, license_lapsed
               FROM usable_caterers
              ORDER BY business_name`
          )
        : Promise.resolve([]),
    ]);

  return (
    <>
      <Masthead />
      <main id="main">
        <div className="pagehead">
          <Link href="/start" className="backlink-inline">
            &larr; Something else
          </Link>
          <h1>
            {need === 'setup' ? 'A room, set up for you' : 'An event with food'}
          </h1>
          <p className="lede">
            {need === 'setup'
              ? 'One form. Tell us where, when, and how you want it arranged.'
              : 'One form. Tell us what you know and leave the rest. If you already know your menu, you can choose it here and be done.'}
          </p>
        </div>

        <div className="shell" style={{ maxWidth: '46rem' }}>
          <IntakeForm
            spaces={spaces}
            eventTypes={eventTypes}
            menu={menu}
            choiceGroups={choiceGroups}
            caterers={caterers}
            needsFood={need === 'food'}
            defaultName={user.full_name}
            defaultOrg={user.department_org}
            defaultEmail={user.email}
          />
        </div>
      </main>
    </>
  );
}
