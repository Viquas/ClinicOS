"use client";

import { ScreenHeader } from "@/components/screen-header";
import { AlertBanner } from "@/components/ui/alert-banner";
import { Card, SectionLabel } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PrimaryButton } from "@/components/ui/primary-button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { StatusPill } from "@/components/ui/status";
import type { StockItem } from "@/db/queries/pharmacy";
import type { H1Entry } from "@/db/queries/h1-register";
import { daysToExpiry, isExpired } from "@/lib/pharmacy/fefo";
import { cn } from "@/lib/utils";
import { useState, useTransition } from "react";
import { addPurchaseAction } from "./actions";

type FormularyItem = { id: string; name: string; unit: string };

export function InventoryBoard({
  stock,
  h1,
  formulary,
  today,
}: {
  stock: StockItem[];
  h1: H1Entry[];
  formulary: FormularyItem[];
  /** The clinic's own "today" (YYYY-MM-DD), resolved server-side. */
  today: string;
}) {
  const [tab, setTab] = useState<"stock" | "purchase" | "h1">("stock");

  return (
    <>
      <ScreenHeader
        title="Inventory"
        subtitle={`${stock.length} items in formulary`}
      />

      <SegmentedControl
        className="mb-5"
        value={tab}
        onChange={setTab}
        options={[
          { value: "stock", label: "Stock" },
          { value: "purchase", label: "Add purchase" },
          { value: "h1", label: "H1 register", badge: h1.length },
        ]}
      />

      {tab === "stock" ? <StockTab stock={stock} today={today} /> : null}
      {tab === "purchase" ? <PurchaseTab formulary={formulary} /> : null}
      {tab === "h1" ? <H1Tab entries={h1} /> : null}
    </>
  );
}

function StockTab({ stock, today }: { stock: StockItem[]; today: string }) {
  /* Noon UTC keeps `toIsoDate` on the same calendar day server-side used. */
  const TODAY = new Date(`${today}T12:00:00Z`);
  return (
    <div className="flex flex-col gap-3">
      {stock.map((item) => {
        const live = item.batches.filter((b) => !isExpired(b, TODAY));
        const qty = live.reduce((sum, b) => sum + b.quantityRemaining, 0);
        const expiredCount = item.batches.length - live.length;
        const isLow = qty <= item.reorderLevel;

        return (
          <Card key={item.id} className="p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-[17px] font-bold tracking-[-0.015em] text-ink">
                  {item.name}
                </h3>
                {item.scheduleClass !== "none" ? (
                  <StatusPill tone="warning">
                    Schedule {item.scheduleClass.toUpperCase()}
                  </StatusPill>
                ) : null}
                {item.isConsumable ? <StatusPill>Consumable</StatusPill> : null}
              </div>

              <div className="text-right">
                <div
                  className={cn(
                    "tabular text-[22px] font-extrabold leading-none",
                    isLow ? "text-warning" : "text-ink",
                  )}
                >
                  {qty}
                </div>
                <div className="text-[12px] font-semibold text-ink-secondary">
                  {item.unit}
                </div>
              </div>
            </div>

            <p className="mt-1 text-[14px] text-ink-secondary">
              {item.strength ?? item.form} · reorder at {item.reorderLevel}
            </p>

            {item.batches.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {item.batches.map((batch) => {
                  const days = daysToExpiry(batch, TODAY);
                  const expired = isExpired(batch, TODAY);
                  return (
                    <span
                      key={batch.id}
                      className={cn(
                        "tabular rounded-[var(--radius-pill)] px-3 py-1.5 text-[13px] font-semibold",
                        expired
                          ? "bg-alert-surface text-alert line-through"
                          : days <= 60
                            ? "bg-warning-surface text-warning"
                            : "bg-surface-sunken text-ink-secondary",
                      )}
                    >
                      {batch.batchNo} · {batch.quantityRemaining} ·{" "}
                      {expired ? "expired" : `${days}d`}
                    </span>
                  );
                })}
              </div>
            ) : (
              <p className="mt-3 text-[13px] text-ink-secondary">
                No batches — add a purchase to stock this item.
              </p>
            )}

            {isLow || expiredCount > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {isLow ? (
                  <StatusPill tone="warning">Below reorder level</StatusPill>
                ) : null}
                {expiredCount > 0 ? (
                  <StatusPill tone="alert">
                    {expiredCount} expired batch
                    {expiredCount > 1 ? "es" : ""} — write off
                  </StatusPill>
                ) : null}
              </div>
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}

function PurchaseTab({ formulary }: { formulary: FormularyItem[] }) {
  const [itemId, setItemId] = useState(formulary[0]?.id ?? "");
  const [batchNo, setBatchNo] = useState("");
  const [expiry, setExpiry] = useState("");
  const [quantity, setQuantity] = useState("");
  const [cost, setCost] = useState("");
  const [supplier, setSupplier] = useState("");
  const [invoice, setInvoice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    setSaved(null);
    startTransition(async () => {
      const result = await addPurchaseAction({
        itemId,
        batchNo,
        expiryDate: expiry,
        quantity: Number(quantity),
        costPerUnit: cost ? Number(cost) : null,
        supplierName: supplier || null,
        invoiceNo: invoice || null,
      });

      if (result.ok) {
        setSaved(`${batchNo} added to stock.`);
        setBatchNo("");
        setExpiry("");
        setQuantity("");
        setCost("");
        setInvoice("");
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <>
      <SectionLabel>New purchase</SectionLabel>
      <Card className="p-5">
        {error ? (
          <div className="mb-4">
            <AlertBanner title={error} />
          </div>
        ) : null}
        {saved ? (
          <div className="mb-4">
            <AlertBanner tone="warning" title={saved} />
          </div>
        ) : null}

        <label className="block">
          <span className="text-[12px] font-semibold uppercase tracking-[0.05em] text-ink-secondary">
            Item
          </span>
          <select
            value={itemId}
            onChange={(e) => setItemId(e.target.value)}
            className={cn(
              "mt-1 min-h-[var(--touch-min)] w-full rounded-[var(--radius-control)] bg-surface-sunken px-3.5",
              "text-[16px] text-ink outline-none",
            )}
          >
            {formulary.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Batch no." value={batchNo} onChange={setBatchNo} placeholder="PC-3418" />
          <Field label="Expiry (YYYY-MM-DD)" value={expiry} onChange={setExpiry} placeholder="2028-04-30" />
          <Field label="Quantity" value={quantity} onChange={setQuantity} placeholder="24" inputMode="numeric" />
          <Field label="Cost per unit (₹)" value={cost} onChange={setCost} placeholder="38.50" inputMode="decimal" />
          <Field label="Supplier" value={supplier} onChange={setSupplier} placeholder="Mysuru Pharma" />
          <Field label="Invoice no." value={invoice} onChange={setInvoice} placeholder="MPD/26-27/1184" />
        </div>

        <div className="mt-5">
          <AlertBanner
            tone="warning"
            title="Expiry is required and must be in the future"
            detail="FEFO selection and the dispensing block both depend on it — a batch without a valid expiry cannot be dispensed at all."
          />
        </div>

        <div className="mt-5">
          <PrimaryButton onClick={submit} disabled={isPending}>
            {isPending ? "Adding…" : "Add to stock"}
          </PrimaryButton>
        </div>
      </Card>
    </>
  );
}

function H1Tab({ entries }: { entries: H1Entry[] }) {
  return (
    <>
      <div className="mb-4">
        <AlertBanner
          tone="warning"
          title="Statutory record — Drugs & Cosmetics Rules"
          detail="Maintained automatically on every Schedule H1 dispense. Entries cannot be edited or deleted, only appended."
        />
      </div>

      {entries.length === 0 ? (
        <EmptyState
          title="No H1 dispensing yet"
          hint="Every Schedule H1 dispense is recorded here automatically, with patient, prescriber, drug, batch and quantity."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {entries.map((e) => (
            <Card key={e.id} className="p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-[16px] font-bold text-ink">{e.drugName}</h3>
                <span className="tabular text-[14px] font-semibold text-ink-secondary">
                  {e.dispensedOn}
                </span>
              </div>
              <dl className="mt-2 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
                <Detail label="Patient" value={e.patientName} />
                <Detail
                  label="Prescriber"
                  value={`${e.doctorName}${e.doctorRegistrationNo ? ` (${e.doctorRegistrationNo})` : ""}`}
                />
                <Detail label="Batch" value={e.batchNo} />
                <Detail label="Quantity" value={String(e.quantity)} />
              </dl>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  inputMode?: "numeric" | "decimal";
}) {
  return (
    <label className="block">
      <span className="text-[12px] font-semibold uppercase tracking-[0.05em] text-ink-secondary">
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        className={cn(
          "mt-1 min-h-[var(--touch-min)] w-full rounded-[var(--radius-control)] bg-surface-sunken px-3.5",
          "text-[16px] text-ink outline-none placeholder:text-ink-secondary/55",
          "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
        )}
      />
    </label>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-secondary">
        {label}
      </dt>
      <dd className="text-[14px] text-ink">{value}</dd>
    </div>
  );
}
