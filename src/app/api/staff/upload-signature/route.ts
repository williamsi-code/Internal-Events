import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';

/**
 * Signing a Cloudinary upload.
 *
 * The browser asks for a signature, then uploads the file directly to
 * Cloudinary. Two reasons for that shape: the API secret never leaves
 * the server, and a large image never passes through Vercel, which
 * has a request size limit an image can easily exceed.
 *
 * The folder is part of what is signed, so a signature obtained for
 * one folder cannot be reused to write somewhere else in the account.
 */

const FOLDERS = [
  'food',
  'staff',
  'events',
  'graham',
  'maytag',
  'chapel',
  'other',
] as const;

const Body = z.object({
  folder: z.enum(FOLDERS).default('other'),
});

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  const isStaff =
    user?.roles.includes('events_staff') || user?.roles.includes('admin');
  if (!isStaff) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    return NextResponse.json(
      {
        error:
          'Cloudinary is not configured. Add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.',
      },
      { status: 503 }
    );
  }

  let folder = 'other';
  try {
    const parsed = Body.safeParse(await req.json());
    if (parsed.success) folder = parsed.data.folder;
  } catch {
    // No body sent; the default folder stands.
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const fullFolder = `central-events/${folder}`;

  // Cloudinary signs the alphabetically sorted parameters, excluding
  // the file itself and the api_key.
  const params: Record<string, string> = {
    folder: fullFolder,
    timestamp: String(timestamp),
  };

  const toSign = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');

  const signature = createHash('sha1')
    .update(toSign + apiSecret)
    .digest('hex');

  return NextResponse.json({
    signature,
    timestamp,
    folder: fullFolder,
    apiKey,
    cloudName,
    uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
  });
}
