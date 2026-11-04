import { useEffect, useState } from 'react';
import { ErrorMessage, Loading, SuccessMessage } from '../components/Feedback';
import Icon from '../components/Icon';
import { api, errorMessage } from '../store/auth';
import { dateTime } from '../utils/format';

interface Profile {
  id: string;
  username: string;
  role: string;
  status: string;
  created_at?: string;
  updated_at?: string;
}

/** Mensagens da API (chinês) traduzidas para o portal em português */
const PT_ERRORS: Record<string, string> = {
  '当前密码不正确': 'Senha atual incorreta.',
  '新密码至少 6 位': 'A nova senha deve ter pelo menos 6 caracteres.',
  '新密码不能包含首尾空格': 'A nova senha não pode começar ou terminar com espaços.',
  '新密码不能与当前密码相同': 'A nova senha não pode ser igual à senha atual.',
  '账户不存在': 'Conta não encontrada.'
};

const ptError = (reason: unknown, fallback: string) => {
  const raw = errorMessage(reason, fallback);
  return PT_ERRORS[raw] || raw;
};

export default function Profile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [success, setSuccess] = useState('');

  const load = async () => {
    setLoading(true); setLoadError('');
    try { setProfile((await api.get<Profile>('/api/customs/profile')).data); }
    catch (reason) { setLoadError(ptError(reason, 'Não foi possível carregar os dados da conta.')); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(''); setSuccess('');
    if (!currentPassword) { setFormError('Informe a senha atual.'); return; }
    if (newPassword !== newPassword.trim()) { setFormError('A nova senha não pode começar ou terminar com espaços.'); return; }
    if (newPassword.length < 6) { setFormError('A nova senha deve ter pelo menos 6 caracteres.'); return; }
    if (newPassword !== confirmPassword) { setFormError('As duas senhas não coincidem.'); return; }
    setSaving(true);
    try {
      await api.patch('/api/customs/profile/password', {
        current_password: currentPassword,
        new_password: newPassword
      });
      setSuccess('Senha atualizada. Use a nova senha no próximo acesso; esta sessão continua ativa.');
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch (reason) {
      setFormError(ptError(reason, 'Não foi possível alterar a senha.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Minha conta</span>
          <h1>Centro da conta</h1>
          <p>Consulte os dados de acesso e altere a senha do portal do despachante.</p>
        </div>
      </div>

      {loadError && <ErrorMessage message={loadError} onRetry={load} />}
      {loading && !profile ? <Loading label="Carregando dados da conta…" /> : profile && (
        <section className="card profile-card">
          <h2 className="profile-title"><Icon name="user" size={20} />Informações da conta</h2>
          <div className="profile-grid">
            <div><span className="profile-k">Usuário</span><strong>{profile.username}</strong></div>
            <div><span className="profile-k">Função</span><strong>Despachante aduaneiro</strong></div>
            <div><span className="profile-k">Status</span><strong>{profile.status === 'active' ? 'Ativa' : profile.status}</strong></div>
            <div><span className="profile-k">Portal</span><strong>Despacho aduaneiro</strong></div>
            <div><span className="profile-k">Criada em</span><strong>{dateTime(profile.created_at)}</strong></div>
            <div><span className="profile-k">Atualizada em</span><strong>{dateTime(profile.updated_at)}</strong></div>
          </div>
        </section>
      )}

      <section className="card profile-card">
        <h2 className="profile-title"><Icon name="edit" size={20} />Alterar senha</h2>
        <p className="profile-hint">Mínimo de 6 caracteres, sem espaços no início ou no fim.</p>
        {success && <SuccessMessage>{success}</SuccessMessage>}
        <form onSubmit={submit} className="profile-password-form">
          <div className="field">
            <label htmlFor="current-password">Senha atual</label>
            <input
              id="current-password"
              className="form-input"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={event => setCurrentPassword(event.target.value)}
              placeholder="Digite a senha em uso"
              disabled={saving}
            />
          </div>
          <div className="field">
            <label htmlFor="new-password">Nova senha</label>
            <input
              id="new-password"
              className="form-input"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={event => setNewPassword(event.target.value)}
              placeholder="Mínimo de 6 caracteres"
              disabled={saving}
            />
          </div>
          <div className="field">
            <label htmlFor="confirm-password">Confirmar nova senha</label>
            <input
              id="confirm-password"
              className="form-input"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={event => setConfirmPassword(event.target.value)}
              placeholder="Digite a nova senha novamente"
              disabled={saving}
            />
          </div>
          {formError && <div className="form-error" role="alert"><Icon name="alert" size={18} />{formError}</div>}
          <button className="btn" type="submit" disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar nova senha'}
          </button>
        </form>
      </section>
    </>
  );
}
