'use client';

import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { ConvexReactClient } from 'convex/react';
import { useMemo } from 'react';

export function AppConvexProvider({ children }: { children: React.ReactNode }) {
  const client = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_CONVEX_URL;
    return url ? new ConvexReactClient(url) : null;
  }, []);

  if (!client) {
    return <main className="flex min-h-screen items-center justify-center bg-zinc-950 text-sm text-rose-300">Database configuration is missing.</main>;
  }

  return <ConvexAuthProvider client={client}>{children}</ConvexAuthProvider>;
}
