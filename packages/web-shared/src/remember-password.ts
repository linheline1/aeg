const REMEMBER_KEY = 'aeg.rememberPassword';
const USERNAME_KEY = 'aeg.rememberedUsername';

type SavedPassword = Credential & { id: string; password?: string };
type PasswordCredentialConstructor = new (data: { id: string; password: string }) => Credential;

export function rememberedUsername(): string {
  try {
    return localStorage.getItem(REMEMBER_KEY) === 'true'
      ? localStorage.getItem(USERNAME_KEY) || ''
      : '';
  } catch {
    return '';
  }
}

export function shouldRememberPassword(): boolean {
  try { return localStorage.getItem(REMEMBER_KEY) === 'true'; }
  catch { return false; }
}

export async function loadRememberedPassword(): Promise<SavedPassword | null> {
  if (!shouldRememberPassword() || !navigator.credentials?.get) return null;
  try {
    return await navigator.credentials.get({ password: true, mediation: 'silent' } as CredentialRequestOptions) as SavedPassword | null;
  } catch {
    return null;
  }
}

export async function saveRememberedPassword(username: string, password: string, remember: boolean): Promise<void> {
  try {
    if (!remember) {
      localStorage.removeItem(REMEMBER_KEY);
      localStorage.removeItem(USERNAME_KEY);
      return;
    }
    localStorage.setItem(REMEMBER_KEY, 'true');
    localStorage.setItem(USERNAME_KEY, username);
    const PasswordCredential = (window as Window & { PasswordCredential?: PasswordCredentialConstructor }).PasswordCredential;
    if (PasswordCredential && navigator.credentials?.store) {
      await navigator.credentials.store(new PasswordCredential({ id: username, password }));
    }
  } catch {
    // Browser password storage is optional; a failed prompt must not block login.
  }
}
