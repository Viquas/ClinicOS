"use client"; // Error boundaries must be Client Components.

import { PrimaryButton } from "@/components/ui/primary-button";
import { ScreenHeader } from "@/components/screen-header";
import { Card } from "@/components/ui/card";
import { useEffect } from "react";

/**
 * The app-wide error fallback (§8.4 — a clinical tool never shows a stack
 * trace to a receptionist). It renders inside AppChrome, so the nav stays put
 * and the staff member can walk to another screen while this one recovers.
 *
 * `unstable_retry` rather than `reset`: this Next re-fetches and re-renders the
 * failed segment (Server Component data included), which for a transient DB
 * blip on a tier-3 connection is exactly the recovery a "Try again" promises —
 * `reset` alone would re-run the same failed render with the same stale data.
 */
export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    /* The digest is the only handle onto the server-side log line in
       production, where the real message is withheld from the client. */
    console.error(error);
  }, [error]);

  return (
    <>
      <ScreenHeader title="Something went wrong" />
      <Card className="flex flex-col items-center gap-3 px-6 py-12 text-center">
        <p className="max-w-[40ch] text-[15px] leading-snug text-ink-secondary">
          This screen couldn&apos;t load. Nothing was lost — your last saved
          work is safe. Try again, or move to another screen and come back.
        </p>
        {error.digest ? (
          <p className="text-[12px] text-ink-secondary/70">
            Reference: {error.digest}
          </p>
        ) : null}
        <div className="mt-2 w-full max-w-[280px]">
          <PrimaryButton onClick={() => unstable_retry()}>
            Try again
          </PrimaryButton>
        </div>
      </Card>
    </>
  );
}
