"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { GLOBAL_QUERY_DEFAULTS } from "@/lib/client/query-cache-policy";

export function ReactQueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: GLOBAL_QUERY_DEFAULTS.staleTime,
            gcTime: GLOBAL_QUERY_DEFAULTS.gcTime,
            refetchOnWindowFocus: GLOBAL_QUERY_DEFAULTS.refetchOnWindowFocus,
            refetchOnReconnect: GLOBAL_QUERY_DEFAULTS.refetchOnReconnect,
            refetchOnMount: GLOBAL_QUERY_DEFAULTS.refetchOnMount,
            retry: GLOBAL_QUERY_DEFAULTS.retry,
            networkMode: GLOBAL_QUERY_DEFAULTS.networkMode,
            structuralSharing: GLOBAL_QUERY_DEFAULTS.structuralSharing,
          },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
