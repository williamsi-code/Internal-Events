import { NextResponse } from 'next/server';
import { destroySession } from '@/lib/auth';

export async function POST() {
  await destroySession();
  return NextResponse.redirect(
    new URL('/', process.env.AUTH_URL ?? 'http://localhost:3000'),
    { status: 303 }
  );
}
