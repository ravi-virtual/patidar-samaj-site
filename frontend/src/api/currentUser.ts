// Only the id of the signed-in user is remembered, so a page reload knows which
// GET /api/auth/:id to call. It is not a credential: the HTTP-only session cookie is still
// what proves who the caller is, and the server rejects any id that is not the caller's own.
const KEY = 'samaj.userId';

export const getStoredUserId = (): string | null => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};

export const setStoredUserId = (id: string | null): void => {
  try {
    if (id) localStorage.setItem(KEY, id);
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable: the next reload simply starts signed out */
  }
};
