// Author: yunnuo <ymz@ebox.vip>
// Description: Permission and dictionary hooks shared by pages; the server policy stays authoritative.
import { useQuery } from '@tanstack/react-query';
import type { Bootstrap } from '@unicore/sdk';
import { useMemo } from 'react';

// usePermissions exposes the signed-in user's permission points from bootstrap.
// Buttons and page sections render conditionally on it; the API policy layer
// remains the enforcement point.
export function usePermissions(data?: Bootstrap): { has: (permission: string) => boolean; permissions: string[] } {
  return useMemo(() => {
    const permissions = data?.current_user?.permissions ?? [];
    return { has: (permission: string) => permissions.includes(permission), permissions };
  }, [data?.current_user?.permissions]);
}

// useDictionary loads one business dictionary (active items) for form selects.
export function useDictionary(client: { dictionaryByCode(code: string): Promise<unknown> }, code: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['dictionary', code],
    enabled: enabled && !!code,
    queryFn: () => client.dictionaryByCode(code!),
    staleTime: 5 * 60 * 1000,
  });
}
