import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import Masthead from '@/components/Masthead';
import LayoutEditor from '@/components/LayoutEditor';
import ShareLayout from '@/components/ShareLayout';
import { getSessionUser } from '@/lib/auth';
import {
  getLayout,
  getLayoutItems,
  getLayoutSpace,
  listPieces,
  listLayouts,
} from '@/lib/layouts';

export const metadata = { title: 'Edit layout' };
export const dynamic = 'force-dynamic';

export default async function LayoutEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const user = await getSessionUser();
  if (!user) redirect('/sign-in');
  const isStaff =
    user.roles.includes('events_staff') || user.roles.includes('admin');
  if (!isStaff) redirect('/');

  const layout = await getLayout(id);
  if (!layout) notFound();

  const [space, items, pieces, allForSpace] = await Promise.all([
    getLayoutSpace(layout.space_id),
    getLayoutItems(id),
    listPieces(),
    listLayouts(layout.space_id),
  ]);

  if (!space) notFound();

  const templates = allForSpace.filter((l) => l.is_template && l.id !== id);

  return (
    <>
      <Masthead />
      <main id="main">
        <div className="shell" style={{ paddingTop: '1.5rem', maxWidth: '84rem' }}>
          <Link href="/staff/manage/layouts" className="backlink-inline">
            &larr; All layouts
          </Link>

          <div className="pagehead" style={{ padding: '0 0 1rem' }}>
            <h1>{layout.name}</h1>
            <p className="lede">
              {space.building ? `${space.building} \u2014 ` : ''}
              {space.name}
              {' \u00b7 '}
              {space.width_feet}
              {'\u00d7'}
              {space.length_feet} feet
              {layout.is_template ? ' \u00b7 template' : ''}
            </p>
          </div>

          {space.layout_notes?.startsWith('PLACEHOLDER') && (
            <div className="callout c-flag">
              <strong>These dimensions are estimated</strong>
              They were guessed from the room&rsquo;s capacity. Measure the room
              and correct them before sending a diagram to a customer.
            </div>
          )}

          <LayoutEditor
            layout={layout}
            space={space}
            items={items}
            pieces={pieces}
            templates={templates}
          />

          {layout.request_id && (
            <ShareLayout
              layoutId={layout.id}
              requestId={layout.request_id}
              sharedAt={layout.shared_at}
              sharedByName={layout.shared_by_name}
            />
          )}
        </div>
      </main>
    </>
  );
}
