import { renderStage } from '../stage-page';

export const metadata = { title: 'Choose your menu' };
export const dynamic = 'force-dynamic';

export default async function MenuStepPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return renderStage(id, 'menu');
}
