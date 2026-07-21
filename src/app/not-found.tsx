import { ScreenHeader } from "@/components/screen-header";
import { Card } from "@/components/ui/card";
import Link from "next/link";

/**
 * The app-wide 404 (§8.4). Also the fallback that a page's `notFound()` call
 * lands on — e.g. a patient id that has been merged away, so the old link in
 * someone's WhatsApp history now points at nothing. It renders inside
 * AppChrome, so "back to Home" is one tap and the nav is already there.
 */
export default function NotFound() {
  return (
    <>
      <ScreenHeader title="Not found" />
      <Card className="flex flex-col items-center gap-3 px-6 py-12 text-center">
        <p className="max-w-[40ch] text-[15px] leading-snug text-ink-secondary">
          This record or page isn&apos;t here. It may have been merged, removed,
          or the link is old.
        </p>
        <Link
          href="/home"
          className="mt-2 text-[16px] font-semibold text-accent"
        >
          Back to Home
        </Link>
      </Card>
    </>
  );
}
