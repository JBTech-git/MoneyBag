import MoneyApp from '@/components/MoneyApp';
import PwaRegister from '@/components/PwaRegister';
import { I18nProvider } from '@/components/I18nProvider';

export default function HomePage() {
  return (
    <I18nProvider>
      <MoneyApp />
      <PwaRegister />
    </I18nProvider>
  );
}
