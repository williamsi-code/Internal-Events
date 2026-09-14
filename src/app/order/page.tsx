import { redirect } from 'next/navigation';
import Masthead from '@/components/Masthead';
import OrderForm from '@/components/OrderForm';
import { getSessionUser } from '@/lib/auth';
import { getPublicMenu, getOrderSpaces } from '@/lib/orders';
import { getChoiceGroups } from '@/lib/choices';

export const metadata = { title: 'Order catering - Central College' };
export const dynamic = 'force-dynamic';

export default async function OrderPage() {
  const user = await getSessionUser();
  if (!user) redirect('/sign-in?next=/order');

  const [menu, spaces, choiceGroups] = await Promise.all([
    getPublicMenu(),
    getOrderSpaces(),
    getChoiceGroups(),
  ]);

  return (
    <>
      <Masthead />
      <main id="main">
        <div className="shell" style={{ paddingTop: '1.5rem' }}>
                  <OrderForm
            menu={menu}
            spaces={spaces}
            choiceGroups={choiceGroups}
            defaultName={user.full_name}
          />
        </div>
      </main>
    </>
  );
}
