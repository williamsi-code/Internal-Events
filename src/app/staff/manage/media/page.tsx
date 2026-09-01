import { redirect } from 'next/navigation';
import Link from 'next/link';
import Masthead from '@/components/Masthead';
import MediaLibrary from '@/components/MediaLibrary';
import { getSessionUser } from '@/lib/auth';
import { listMedia, getCloudinaryStatus } from '@/lib/media';

export const metadata = { title: 'Images - back office' };
export const dynamic = 'force-dynamic';

export default async function MediaPage() {
  const user = await getSessionUser();
  if (!user) redirect('/sign-in');
  const isStaff =
    user.roles.includes('events_staff') || user.roles.includes('admin');
  if (!isStaff) redirect('/');

  const [media, cloudinary] = await Promise.all([
    listMedia(),
    Promise.resolve(getCloudinaryStatus()),
  ]);

  return (
    <>
      <Masthead />
      <main id="main">
        <div className="shell" style={{ paddingTop: '1.5rem', maxWidth: '64rem' }}>
          <Link href="/staff/manage" className="backlink-inline">
            &larr; Back office
          </Link>
          <div className="pagehead" style={{ padding: '0 0 1.25rem' }}>
            <h1>Images</h1>
            <p className="lede">
              Photographs for the front page &mdash; news, menu spotlights, staff
              profiles and the gallery. Upload once here, then use the same image
              anywhere.
            </p>
          </div>

          <MediaLibrary media={media} configured={cloudinary.configured} />
        </div>
      </main>
    </>
  );
}
