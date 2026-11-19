import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildVolunteerCertificatePdf,
  UnsupportedCertificateTextError,
} from "./certificate-pdf";

const certificate = {
  certificateId: "NSS-1234567890ABCDEF12345678",
  studentName: "தமிழ் Volunteer",
  collegeName: "Bannari Amman Institute of Technology",
  unitName: "National Service Scheme",
  eventTitle: "समुदाय सेवा",
  volunteerHours: 4,
  issuedAt: new Date("2025-01-15T10:00:00Z"),
};

test("certificate PDF embeds common Indian scripts and Latin text", async () => {
  const pdf = await buildVolunteerCertificatePdf(certificate);
  assert.equal(new TextDecoder().decode(pdf.subarray(0, 5)), "%PDF-");
});

test("certificate PDF reports unsupported glyphs explicitly", async () => {
  await assert.rejects(
    buildVolunteerCertificatePdf({ ...certificate, studentName: "Volunteer 🧑‍🎓" }),
    UnsupportedCertificateTextError,
  );
});
