import { Link } from 'react-router-dom';
import CnpjManager from '../components/CnpjManager';

export default function CnpjPage() {
  return (
    <>
      <div className="page-head row-between">
        <div>
          <h1>开票资料</h1>
          <p className="sub">管理巴西公司的 CNPJ、IE 与发票抬头资料</p>
        </div>
        <Link className="btn btn-ghost" to="/profile">返回用户中心</Link>
      </div>
      <CnpjManager />
    </>
  );
}
