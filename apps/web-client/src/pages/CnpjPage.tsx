import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import CnpjManager from '../components/CnpjManager';

export default function CnpjPage() {
  const { t } = useTranslation();
  return (
    <>
      <div className="page-head row-between">
        <div>
          <h1>{t('cnpj.pageTitle')}</h1>
          <p className="sub">{t('cnpj.pageSubtitle')}</p>
        </div>
        <Link className="btn btn-ghost" to="/profile">{t('cnpj.backProfile')}</Link>
      </div>
      <CnpjManager />
    </>
  );
}
