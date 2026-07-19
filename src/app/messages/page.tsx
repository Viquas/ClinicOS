import { getMessages } from "@/db/queries/messages";
import { getActiveClinicId } from "@/lib/auth/current-clinic";
import { requireRouteAccess } from "@/lib/auth/route-access";
import { MessagesBoard } from "./messages-board";

/*
 * Always render against current clinic state — a message log frozen at build
 * time would hide a token confirmation queued minutes ago. Any page reading
 * mutable clinic data must be dynamic.
 */
export const dynamic = "force-dynamic";


export default async function MessagesPage() {
  await requireRouteAccess(await getActiveClinicId(), "/messages");
  const messages = await getMessages(await getActiveClinicId());

  return (
    <MessagesBoard
      messages={messages.map((m) => ({
        ...m,
        createdAt: m.createdAt.toISOString(),
      }))}
    />
  );
}
