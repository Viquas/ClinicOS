/**
 * Renders an audit entry as a human sentence (§7.8).
 *
 * The audit `detail` column is JSONB with a different shape per action, so the
 * mapping from a raw row to something an owner can read lives here as a pure
 * function — testable, and the one place that has to know each action's shape.
 *
 * An unrecognised action degrades to its slug rather than throwing: the audit
 * log is a legal record, so a new action type that predates a formatter update
 * must still display, never blank out or error.
 */

export type AuditTone = "neutral" | "warning" | "alert";

export type DescribedAudit = {
  title: string;
  detail: string;
  tone: AuditTone;
};

type Detail = Record<string, unknown>;

function str(detail: Detail, key: string): string | undefined {
  const v = detail[key];
  return typeof v === "string" ? v : undefined;
}

function num(detail: Detail, key: string): number | undefined {
  const v = detail[key];
  return typeof v === "number" ? v : undefined;
}

/** Paise → "₹4.34". Audit money is stored in paise, like everywhere else. */
function rupees(paise: number | undefined): string {
  if (paise === undefined) return "";
  return `₹${(paise / 100).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function describeAudit(
  action: string,
  rawDetail: unknown,
): DescribedAudit {
  const detail: Detail =
    rawDetail && typeof rawDetail === "object"
      ? (rawDetail as Detail)
      : {};

  switch (action) {
    case "token_issued":
      return {
        title: "Token issued",
        detail: `Token ${num(detail, "number") ?? "?"} for ${str(detail, "patientName") ?? "a patient"}${
          detail.isPriority ? " · priority" : ""
        }`,
        tone: "neutral",
      };

    case "patient_registered":
      return {
        title: "Patient registered",
        detail: `${str(detail, "name") ?? "New patient"}${
          str(detail, "phone") ? ` · ${str(detail, "phone")}` : ""
        }`,
        tone: "neutral",
      };

    case "patient_merged":
      return {
        title: "Patient merged",
        detail: `${str(detail, "duplicateName") ?? "A duplicate"} merged into ${
          str(detail, "survivorName") ?? "another record"
        }${
          num(detail, "movedVisits")
            ? ` · ${num(detail, "movedVisits")} visit(s) moved`
            : ""
        }`,
        tone: "neutral",
      };

    case "dispensed": {
      const lines = Array.isArray(detail.lines) ? detail.lines : [];
      return {
        title: "Dispensed",
        detail:
          lines.length > 0
            ? lines
                .map((l) => {
                  const line = l as Detail;
                  return `${str(line, "batchNo") ?? "batch"} ×${num(line, "quantity") ?? "?"}`;
                })
                .join(", ")
            : "medicines dispensed",
        /* Dispensing touches stock and, for H1, a statutory register. */
        tone: "warning",
      };
    }

    case "bill_recorded":
      return {
        title: "Bill recorded",
        detail: `${rupees(num(detail, "total"))} by ${(str(detail, "mode") ?? "").toUpperCase() || "payment"}`,
        tone: "neutral",
      };

    case "purchase_added":
      return {
        title: "Stock purchased",
        detail: `${str(detail, "batchNo") ?? "batch"} · ${num(detail, "quantity") ?? "?"} units · expires ${str(detail, "expiryDate") ?? "?"}`,
        tone: "neutral",
      };

    case "allergy_override":
      return {
        title: "Allergy override",
        detail: `${str(detail, "drug") ?? "A drug"} prescribed against a recorded allergy — “${str(detail, "reason") ?? "no reason given"}”`,
        /* The single most safety-critical thing an owner reviews. */
        tone: "alert",
      };

    case "discount":
      return {
        title: "Discount applied",
        detail: `${rupees(num(detail, "amount"))} off${
          str(detail, "reason") ? ` — “${str(detail, "reason")}”` : ""
        }`,
        tone: "warning",
      };

    default:
      /* Unknown action: show the slug, never blank. The record must display. */
      return {
        title: action.replace(/_/g, " "),
        detail: "",
        tone: "neutral",
      };
  }
}
