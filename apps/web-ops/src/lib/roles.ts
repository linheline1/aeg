export const ROLE_CN: Record<string, string> = {
  operator: '报价员',
  sales: '业务员',
  admin: '管理员',
  customs: '报关行'
};

export const roleLabel = (role?: string | null) => (role ? ROLE_CN[role] || role : '—');
