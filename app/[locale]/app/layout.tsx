import { ReactQueryProvider } from "@/components/providers/react-query-provider";

/** Lock dashboard subtree to the viewport so only inner `main` scrolls (see workspace layout). */
export default function AppAreaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-dvh min-h-0 overflow-hidden">
      <ReactQueryProvider>{children}</ReactQueryProvider>
    </div>
  );
}
