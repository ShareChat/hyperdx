import api from '@/api';
import { PRIVILEGED_EMAILS } from '@/config';

/**
 * Returns true if the current user may access privileged team settings.
 * When NEXT_PUBLIC_PRIVILEGED_EMAILS is unset or empty, all users are
 * privileged (preserves existing behaviour). Once the env var is populated,
 * only the listed emails have access.
 */
export function useIsPrivilegedUser(): boolean {
  const { data: me } = api.useMe();
  if (PRIVILEGED_EMAILS.length === 0) return true;
  if (!me?.email) return false;
  return PRIVILEGED_EMAILS.includes(me.email.toLowerCase());
}
