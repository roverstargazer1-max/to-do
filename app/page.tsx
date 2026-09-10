import { Suspense } from "react";
import { HomeClient } from "@/components/home/HomeClient";
import { HomeLoadingFallback } from "@/components/home/HomeLoadingFallback";

// Performance: Root page is now a Server Component (PERF-01).
// Interactivity is moved to HomeClient to minimize the client-side hydration tree.
export default function Home() {
  return (
    <Suspense fallback={<HomeLoadingFallback />}>
      <HomeClient />
    </Suspense>
  );
}
