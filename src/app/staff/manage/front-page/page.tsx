import { redirect } from 'next/navigation';
import Link from 'next/link';
import Masthead from '@/components/Masthead';
import SiteEditor from '@/components/SiteEditor';
import { getSessionUser } from '@/lib/auth';
import {
  getSiteSettings,
  getAllSiteBlocks,
  listMenuItemOptions,
} from '@/lib/site';
import { listMedia } from '@/lib/media';

export const metadata = { title: 'Front page - back office' };
export const dynamic = 'force-dynamic';

export default async function FrontPageEditor() {
  const user = await getSessionUser();
  if (!user) redirect('/sign-in');
  const isStaff =
    user.roles.includes('events_staff') || user.roles.includes('admin');
  if (!isStaff) redirect('/');

  const [settings, blocks, media, menuItems] = await Promise.all([
    getSiteSettings(),
    getAllSiteBlocks(),
    listMedia(),
    listMenuItemOptions(),
  ]);

  const placeholders = blocks.filter((b) =>
    b.title.startsWith('PLACEHOLDER')
  ).length;

  return (
    <>
      <Masthead />
      <main id="main">
        <div className="shell" style={{ paddingTop: '1.5rem', maxWidth: '62rem' }}>
          <Link href="/staff/manage" className="backlink-inline">
            &larr; Back office
          </Link>
          <div className="pagehead" style={{ padding: '0 0 1.25rem' }}>
            <h1>Front page</h1>
            <p className="lede">
              What visitors see before they sign in. Changes appear immediately,
              so it is worth opening the front page in another tab while you
              work.
            </p>
          </div>

          {placeholders > 0 && (
            <div className="callout c-warn">
              <strong>
                {placeholders} placeholder item{placeholders === 1 ? '' : 's'}{' '}
                still showing
              </strong>
              These were seeded to give the page shape. They say PLACEHOLDER and
              are visible to anyone who visits.
            </div>
          )}

          {media.length === 0 && (
            <div className="callout c-default">
              <strong>No images uploaded yet</strong>
              The page works without them, but it is built for photographs.{' '}
              <Link href="/staff/manage/media">Upload some first</Link>.
            </div>
          )}

          <SiteEditor
            settings={settings}
            blocks={blocks}
            media={media}
            menuItems={menuItems}
          />
        </div>
      </main>
    </>
  );
}
