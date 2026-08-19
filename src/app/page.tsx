import Link from 'next/link';
import Masthead from '@/components/Masthead';

export default function Home() {
  return (
    <>
      <Masthead />
      <main id="main">
        <div className="pagehead">
          <h1>Events &amp; Conferences</h1>
          <p className="lede">
            Central College hosts hundreds of events each year, from department
            meetings to community banquets. Browse what&rsquo;s available, review
            the policies that apply, and start your request here.
          </p>
        </div>

        <div className="shell">
          <div className="tiles">
            <Link href="/start" className="tile primary">
              <h3>Start creating your event</h3>
              <p>
                Tell us what you&rsquo;re planning. The events office confirms how
                your event is classified before anything is booked.
              </p>
            </Link>
            <Link href="/info/catering-menu" className="tile">
              <h3>Catering menu</h3>
              <p>Meals, refreshments, and reception options with current pricing.</p>
            </Link>
            <Link href="/info/event-spaces" className="tile">
              <h3>Event spaces</h3>
              <p>Rooms and outdoor areas, with capacities and setup options.</p>
            </Link>
            <Link href="/info/internal-policies" className="tile">
              <h3>Internal event policies</h3>
              <p>What applies to departments, student organizations, and College programming.</p>
            </Link>
            <Link href="/info/external-policies" className="tile">
              <h3>External event policies</h3>
              <p>Requirements for outside organizations and private events on campus.</p>
            </Link>
            <Link href="/info/classification" className="tile">
              <h3>Classification of events</h3>
              <p>
                How events are classified as internal, affiliated, or external —
                and what each means for policies and pricing.
              </p>
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}

