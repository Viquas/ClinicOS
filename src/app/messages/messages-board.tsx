"use client";

import { ScreenHeader } from "@/components/screen-header";
import { AlertBanner } from "@/components/ui/alert-banner";
import { Card, SectionLabel } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { maskPhone } from "@/components/ui/identity-header";
import { PrimaryButton } from "@/components/ui/primary-button";
import { SearchInput } from "@/components/ui/search-input";
import { StatusPill } from "@/components/ui/status";
import { StatTile } from "@/components/ui/stat-tile";
import { formatPaise } from "@/lib/billing/gst";
import { useState } from "react";

type MessageRow = {
  id: string;
  toPhone: string;
  templateName: string;
  status: string;
  payload: unknown;
  createdAt: string;
  failureReason: string | null;
};

/**
 * WhatsApp message log (§7.10).
 *
 * Every row is a real product event (currently: token issue), not a fixture.
 * There is no Meta Cloud API credential in this environment, so nothing here
 * progresses past "queued" — the stat tiles report what actually happened,
 * not what a finished integration would eventually show. A "Delivered" tile
 * reading zero is the honest state of a queue nothing has sent yet, not a
 * bug.
 *
 * Cost is an estimate derived from the PRD's stated utility rate (~₹0.115,
 * rounded to 12 paise), applied only to messages that have left "queued" —
 * there is no real per-message cost column, and this must never be presented
 * as billing-grade accuracy.
 */
const ESTIMATED_UTILITY_RATE_PAISE = 12;

const TEMPLATE_LABEL: Record<string, string> = {
  token_confirmation: "Token confirmation",
  prescription_share: "Prescription shared",
  bill_receipt_share: "Receipt shared",
  vaccination_reminder_share: "Vaccine reminder shared",
};

function humanizeTemplate(name: string): string {
  return TEMPLATE_LABEL[name] ?? name.replace(/_/g, " ");
}

function patientNameFrom(payload: unknown): string | null {
  if (payload && typeof payload === "object" && "patientName" in payload) {
    const v = (payload as { patientName?: unknown }).patientName;
    return typeof v === "string" ? v : null;
  }
  return null;
}

const STATUS_TONE: Record<string, "success" | "accent" | "neutral" | "alert"> =
  {
    delivered: "success",
    sent: "accent",
    queued: "neutral",
    failed: "alert",
    shared: "accent",
  };

export function MessagesBoard({ messages }: { messages: MessageRow[] }) {
  const [query, setQuery] = useState("");
  const queued = messages.filter((m) => m.status === "queued");
  const failed = messages.filter((m) => m.status === "failed");
  const billable = messages.filter(
    (m) => m.status === "sent" || m.status === "delivered",
  );
  const spentPaise = billable.length * ESTIMATED_UTILITY_RATE_PAISE;

  const q = query.trim().toLowerCase();
  const shown = q
    ? messages.filter((m) => {
        const name = patientNameFrom(m.payload)?.toLowerCase() ?? "";
        return (
          name.includes(q) ||
          m.toPhone.includes(q) ||
          m.status.toLowerCase().includes(q) ||
          humanizeTemplate(m.templateName).toLowerCase().includes(q)
        );
      })
    : messages;

  return (
    <>
      <ScreenHeader title="Messages" subtitle="WhatsApp" />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatTile tint="mint" label="Queued" value={queued.length} />
        <StatTile
          tint="plain"
          label="Failed"
          value={failed.length}
          footer={
            failed.length > 0 ? (
              <StatusPill tone="alert">Needs a phone call</StatusPill>
            ) : undefined
          }
        />
        <StatTile
          tint="sky"
          label="Spent (est.)"
          value={formatPaise(spentPaise)}
        />
      </div>

      {messages.length === 0 ? (
        <EmptyState
          title="No messages yet"
          hint="Issuing a token queues its WhatsApp confirmation here automatically. Prescription, receipt, and reminder shares are logged the moment they're opened in WhatsApp."
        />
      ) : (
        <>
          {failed.length > 0 ? (
            <div className="mb-5">
              <AlertBanner
                title={`${failed.length} message${failed.length > 1 ? "s" : ""} could not be delivered`}
                detail={failed
                  .map(
                    (f) =>
                      `${patientNameFrom(f.payload) ?? maskPhone(f.toPhone)} — ${f.failureReason ?? "unknown reason"}`,
                  )
                  .join("; ")}
              />
            </div>
          ) : null}

          {messages.length > 6 || query ? (
            <SearchInput
              className="mb-4"
              value={query}
              onChange={setQuery}
              placeholder="Search by name, phone, or status"
              ariaLabel="Search messages"
            />
          ) : null}

          <SectionLabel>Sent</SectionLabel>
          {shown.length === 0 ? (
            <EmptyState
              title={`No message matching “${query}”`}
              hint="Search by patient name, phone number, delivery status, or message type."
            />
          ) : null}
          <div className="mb-6 flex flex-col gap-2.5">
            {shown.map((message) => {
              const tone = STATUS_TONE[message.status] ?? "neutral";
              const name = patientNameFrom(message.payload);

              return (
                <Card key={message.id} className="flex items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[16px] font-semibold text-ink">
                        {humanizeTemplate(message.templateName)}
                      </span>
                      <StatusPill tone={tone}>
                        {message.status.charAt(0).toUpperCase() +
                          message.status.slice(1)}
                      </StatusPill>
                    </div>
                    <p className="text-[14px] text-ink-secondary">
                      {name ? `${name} · ` : ""}
                      {maskPhone(message.toPhone)} · {formatTime(message.createdAt)}
                      {message.failureReason
                        ? ` · ${message.failureReason}`
                        : ""}
                    </p>
                  </div>
                  <span className="tabular shrink-0 text-[14px] font-semibold text-ink-secondary">
                    {message.status === "sent" || message.status === "delivered"
                      ? formatPaise(ESTIMATED_UTILITY_RATE_PAISE)
                      : "—"}
                  </span>
                </Card>
              );
            })}
          </div>
        </>
      )}

      <SectionLabel>Broadcast</SectionLabel>
      <Card className="p-5">
        <h3 className="text-[17px] font-bold tracking-[-0.015em] text-ink">
          Send to a patient segment
        </h3>
        <p className="mt-1 text-[14px] leading-snug text-ink-secondary">
          Broadcasts need a WhatsApp Business send provider, which isn&apos;t
          connected in this environment yet.
        </p>

        <div className="mt-4">
          <PrimaryButton disabled>Not available yet</PrimaryButton>
        </div>
      </Card>
    </>
  );
}

/** ISO → "09:52" in clinic-local time. */
function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Kolkata",
  });
}
