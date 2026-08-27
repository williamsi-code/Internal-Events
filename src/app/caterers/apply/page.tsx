import Masthead from '@/components/Masthead';
import CatererApplication from '@/components/CatererApplication';

export const metadata = { title: 'Apply to cater - Central College' };

export default function CatererApplyPage() {
  return (
    <>
      <Masthead />
      <main id="main" className="shell" style={{ maxWidth: '46rem', paddingTop: '2rem' }}>
        <CatererApplication />
      </main>
    </>
  );
}
