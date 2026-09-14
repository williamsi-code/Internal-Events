import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import Masthead from '@/components/Masthead';
import SpaceDetailEditor from '@/components/SpaceDetailEditor';
import SpaceOptionsEditor from '@/components/SpaceOptionsEditor';
import { getSessionUser } from '@/lib/auth';
import { getSpaceById, getSpacePhotos } from '@/lib/space-detail';
import { listMedia } from '@/lib/media';
import { listAllOptions, getSpaceOptionIds } from '@/lib/setup-options';

export const metadata = { title: 'Edit space - back office' };
export const dynamic = 'force-dynamic';

export default async function SpaceEditorPage({
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

  const space = await getSpaceById(id);
  if (!space) notFound();

  const [photos, media, allOptions, selectedOptions] = await Promise.all([
    getSpacePhotos(id),
    listMedia(),
    listAllOptions(),
    getSpaceOptionIds(id),
  ]);

  const isPlaceholder = space.tagline?.startsWith('PLACEHOLDER');

  return (
    <>
      <Masthead />
      <main id="main">
        <div className="shell" style={{ paddingTop: '1.5rem', maxWidth: '58rem' }}>
          <Link href="/staff/manage/spaces" className="backlink-inline">
            &larr; All spaces
          </Link>

          <div className="pagehead" style={{ padding: '0 0 1.25rem' }}>
            <h1>{space.name}</h1>
            <p className="lede">
              {space.building}
              {space.externally_bookable
                ? ' \u00b7 visible to outside customers'
                : ' \u00b7 internal only'}
            </p>
          </div>

          {/* What the room can do comes first: it affects every request,
              whereas the public page only affects browsing. */}
          <SpaceOptionsEditor
            spaceId={id}
            allOptions={allOptions}
            selected={selectedOptions}
          />

          {isPlaceholder && (
            <div className="callout c-warn" style={{ marginTop: '1.5rem' }}>
              <strong>This room still has placeholder text</strong>
              The description and setup options were seeded to show the shape.
              They are visible to anyone who opens this room.
            </div>
          )}

          {!space.externally_bookable && (
            <div className="callout c-default" style={{ marginTop: '1.5rem' }}>
              <strong>Not publicly visible</strong>
              This room is internal only, so the detail page below redirects
              outside visitors to the spaces list. You can still fill it in.
            </div>
          )}

          <SpaceDetailEditor space={space} photos={photos} media={media} />
        </div>
      </main>
    </>
  );
}
