import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import "regenerator-runtime/runtime";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";

type CertificatePdfData = {
  certificateId: string;
  studentName: string;
  collegeName: string;
  unitName: string;
  eventTitle: string;
  volunteerHours: number;
  issuedAt: Date;
};

export class UnsupportedCertificateTextError extends Error {
  constructor() {
    super("Certificate name contains unsupported characters.");
    this.name = "UnsupportedCertificateTextError";
  }
}

const require = createRequire(import.meta.url);
let fontBytesPromise: Promise<{ latin: Buffer; latinExt: Buffer; devanagari: Buffer; tamil: Buffer }> | undefined;

function getFontBytes() {
  fontBytesPromise ??= Promise.all([
    readFile(require.resolve("@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff2")),
    readFile(require.resolve("@fontsource/noto-sans/files/noto-sans-latin-ext-400-normal.woff2")),
    readFile(require.resolve("@fontsource/noto-sans/files/noto-sans-devanagari-400-normal.woff2")),
    readFile(require.resolve("@fontsource/noto-sans-tamil/files/noto-sans-tamil-tamil-400-normal.woff2")),
  ]).then(([latin, latinExt, devanagari, tamil]) => ({
    latin,
    latinExt,
    devanagari,
    tamil,
  }));
  return fontBytesPromise;
}

function fontFor(character: string, fonts: Record<string, PDFFont>): PDFFont {
  const codePoint = character.codePointAt(0) ?? 0;
  if (codePoint >= 0x0b80 && codePoint <= 0x0bff) return fonts.tamil;
  if (codePoint >= 0x0900 && codePoint <= 0x097f) return fonts.devanagari;
  if (codePoint > 0x024f) {
    throw new UnsupportedCertificateTextError();
  }
  return codePoint > 0x007f ? fonts.latinExt : fonts.latin;
}

function textRuns(text: string, fonts: Record<string, PDFFont>) {
  const runs: Array<{ text: string; font: PDFFont }> = [];
  for (const character of text) {
    const font = fontFor(character, fonts);
    const last = runs[runs.length - 1];
    if (last?.font === font) last.text += character;
    else runs.push({ text: character, font });
  }
  return runs;
}

function textWidth(text: string, size: number, fonts: Record<string, PDFFont>) {
  return textRuns(text, fonts).reduce(
    (width, run) => width + run.font.widthOfTextAtSize(run.text, size),
    0,
  );
}

function drawCentered(
  page: PDFPage,
  text: string,
  y: number,
  size: number,
  color: ReturnType<typeof rgb>,
  fonts: Record<string, PDFFont>,
  maxWidth = 720,
) {
  const width = textWidth(text, size, fonts);
  const scale = width > maxWidth ? maxWidth / width : 1;
  const actualSize = size * scale;
  let x = (842 - textWidth(text, actualSize, fonts)) / 2;
  for (const run of textRuns(text, fonts)) {
    page.drawText(run.text, { x, y, size: actualSize, font: run.font, color });
    x += run.font.widthOfTextAtSize(run.text, actualSize);
  }
}

function wrapText(text: string, size: number, fonts: Record<string, PDFFont>) {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && textWidth(candidate, size, fonts) > 680) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function buildVolunteerCertificatePdf(data: CertificatePdfData) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const fontBytes = await getFontBytes();
  const fonts = {
    latin: await doc.embedFont(fontBytes.latin, { subset: false }),
    latinExt: await doc.embedFont(fontBytes.latinExt, { subset: false }),
    devanagari: await doc.embedFont(fontBytes.devanagari, { subset: false }),
    tamil: await doc.embedFont(fontBytes.tamil, { subset: false }),
  };
  const page = doc.addPage([842, 595]);
  const navy = rgb(0.08, 0.2, 0.35);
  const blue = rgb(0.1, 0.39, 0.62);
  const muted = rgb(0.31, 0.38, 0.46);
  const pale = rgb(0.83, 0.91, 0.96);

  page.drawRectangle({
    x: 24,
    y: 24,
    width: 794,
    height: 547,
    borderColor: pale,
    borderWidth: 3,
  });
  page.drawRectangle({
    x: 34,
    y: 34,
    width: 774,
    height: 527,
    borderColor: blue,
    borderWidth: 0.8,
  });
  drawCentered(page, "NATIONAL SERVICE SCHEME", 520, 14, blue, fonts);
  drawCentered(page, data.collegeName, 486, 23, navy, fonts);
  drawCentered(page, data.unitName, 460, 13, muted, fonts);
  drawCentered(page, "NSS VOLUNTEER CERTIFICATE", 408, 24, navy, fonts);
  drawCentered(page, "This certificate is proudly presented to", 370, 14, muted, fonts);
  drawCentered(page, data.studentName, 329, 27, blue, fonts);
  page.drawLine({
    start: { x: 190, y: 316 },
    end: { x: 652, y: 316 },
    color: pale,
    thickness: 1.4,
  });
  drawCentered(
    page,
    "in recognition of verified volunteer participation in",
    286,
    13,
    muted,
    fonts,
  );
  const eventLines = wrapText(data.eventTitle, 17, fonts);
  eventLines.forEach((line, index) =>
    drawCentered(page, line, 252 - index * 24, 17, navy, fonts),
  );
  const hoursY = 252 - eventLines.length * 24 - 8;
  drawCentered(
    page,
    `${data.volunteerHours.toFixed(2)} verified volunteer hours`,
    hoursY,
    16,
    blue,
    fonts,
  );
  const issueDate = new Intl.DateTimeFormat("en-IN", {
    dateStyle: "long",
    timeZone: "Asia/Kolkata",
  }).format(data.issuedAt);
  drawCentered(page, `Issued on ${issueDate}`, hoursY - 43, 12, muted, fonts);
  drawCentered(
    page,
    `Certificate ID: ${data.certificateId}`,
    62,
    10,
    muted,
    fonts,
  );
  return doc.save();
}
