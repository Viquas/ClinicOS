import { getMessages } from "@/db/queries/messages";
import { requireRouteAccess } from "@/lib/auth/route-access";
import { MessagesBoard } from "./messages-board";

/*
 * Always render against current clinic state — a message log frozen at build
 * time would hide a token confirmation queued minutes ago. Any page reading
 * mutable clinic data must be dynamic.
 */
export const dynamic = "force-dynamic";

/* Until auth is wired, the clinic is fixed to the seeded scenario. */
const CLINIC_ID = "11111111-1111-1111-1111-111111111111";

export default async function MessagesPage() {
  await requireRouteAccess(CLINIC_ID, "/messages");
  const messages = await getMessages(CLINIC_ID);

  return (
    <MessagesBoard
      messages={messages.map((m) => ({
        ...m,
        createdAt: m.createdAt.toISOString(),
      }))}
    />
  );
}
