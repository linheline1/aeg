/** 角色标签 — 通过 i18next.t 取多语言 */
import i18n from '../i18n';

export const roleLabel = (role?: string | null) => {
  if (!role) return '—';
  const key = `user.role.${role}`;
  const translated = i18n.t(key);
  // 如果字典里没有这个 key，i18next.t 会返回 key 本身，这时回退原值
  return translated === key ? role : translated;
};
