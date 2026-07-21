import { describe, expect, it } from "vitest";
import { toWhatsAppNumber, whatsAppLink } from "./whatsapp";

describe("toWhatsAppNumber", () => {
  it("prefixes 91 onto a bare 10-digit mobile", () => {
    expect(toWhatsAppNumber("9845012233")).toBe("919845012233");
  });

  it("keeps a number that already carries 91", () => {
    expect(toWhatsAppNumber("919845012233")).toBe("919845012233");
    expect(toWhatsAppNumber("+91 98450 12233")).toBe("919845012233");
  });

  it("drops an STD-style leading zero before prefixing", () => {
    expect(toWhatsAppNumber("09845012233")).toBe("919845012233");
  });

  it("returns null when there is nothing dialable", () => {
    expect(toWhatsAppNumber(null)).toBeNull();
    expect(toWhatsAppNumber("")).toBeNull();
    expect(toWhatsAppNumber("12345")).toBeNull();
  });
});

describe("whatsAppLink", () => {
  it("builds a wa.me url with an encoded message", () => {
    expect(whatsAppLink("9845012233", "Rx: Amoxicillin 1-0-1")).toBe(
      "https://wa.me/919845012233?text=Rx%3A%20Amoxicillin%201-0-1",
    );
  });

  it("is null when the number can't be dialed", () => {
    expect(whatsAppLink("nope", "hi")).toBeNull();
  });
});
