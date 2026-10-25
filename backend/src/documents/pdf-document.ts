// The documents remain server generated and access-controlled. This compact
// PDF writer avoids a heavyweight rendering dependency while producing a
// standards-compatible downloadable record for the current text-only terms
// and receipts. Keep content deliberately factual; legal wording is versioned
// and must be reviewed before a production launch.
export function createTextPdf(title: string, lines: string[]): Buffer {
  // Keep downloadable agreements comfortable to read at normal zoom. A
  // narrower line length and generous leading are more important here than
  // fitting the legal text into the fewest possible pages.
  const wrapped = lines.flatMap((line) => wrap(line, 76));
  const pages = chunk(wrapped, 39);
  const pageObjectIds = pages.map((_page, index) => 4 + index * 2);
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];

  pages.forEach((page, index) => {
    const content = [
      'BT',
      '/F1 18 Tf',
      '54 790 Td',
      `(${escapePdf(index === 0 ? title : `${title} continued`)}) Tj`,
      '/F1 9 Tf',
      '0 -25 Td',
      `(${escapePdf(`Page ${index + 1} of ${pages.length}`)}) Tj`,
      '/F1 11 Tf',
      '0 -28 Td',
      '16 TL',
      ...page.flatMap((line) => [`(${escapePdf(line)}) Tj`, 'T*']),
      'ET',
    ].join('\n');
    const contentId = pageObjectIds[index]! + 1;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`,
      `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
    );
  });
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index < offsets.length; index += 1) pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

export type ReceiptPdfInput = {
  title: string;
  receiptNumber: string;
  issuedAt: string;
  recipientName: string;
  recipientEmail: string;
  propertyTitle: string;
  propertyAddress: string | null;
  paymentReference: string;
  total: string;
  lineItems: Array<{ label: string; value: string }>;
  note: string;
  payoutReference?: string | null;
};

/**
 * Produces a compact, print-friendly receipt. Agreements intentionally use a
 * long-form document layout; receipts need a clear financial hierarchy at a
 * glance, so they have their own renderer rather than sharing createTextPdf.
 */
export function createReceiptPdf(input: ReceiptPdfInput): Buffer {
  const pageWidth = 612;
  const pageHeight = 842;
  const dark = '0.055 0.22 0.16';
  const green = '0.11 0.46 0.31';
  const gold = '0.76 0.55 0.12';
  const ink = '0.12 0.22 0.17';
  const muted = '0.35 0.45 0.39';
  const line = '0.80 0.88 0.82';
  const pale = '0.94 0.975 0.945';
  const white = '1 1 1';
  const content: string[] = [];
  const rectangle = (x: number, y: number, width: number, height: number, colour: string) => content.push(`q\n${colour} rg\n${x} ${y} ${width} ${height} re f\nQ`);
  const border = (x: number, y: number, width: number, height: number, colour: string, thickness = 1) => content.push(`q\n${colour} RG\n${thickness} w\n${x} ${y} ${width} ${height} re S\nQ`);
  const rule = (x1: number, y1: number, x2: number, y2: number, colour: string, thickness = 1) => content.push(`q\n${colour} RG\n${thickness} w\n${x1} ${y1} m\n${x2} ${y2} l S\nQ`);
  const text = (value: string, x: number, y: number, size: number, colour: string, bold = false) => content.push(`BT\n/${bold ? 'F2' : 'F1'} ${size} Tf\n${colour} rg\n${x} ${y} Td\n(${escapePdf(value)}) Tj\nET`);
  const rightText = (value: string, right: number, y: number, size: number, colour: string, bold = false) => text(value, Math.max(54, right - estimateTextWidth(value, size, bold)), y, size, colour, bold);
  const wrappedText = (value: string, x: number, y: number, maxWidth: number, size: number, colour: string, bold = false, maxLines = 2) => {
    const lines = wrap(value, Math.max(12, Math.floor(maxWidth / (size * 0.51)))).slice(0, maxLines);
    lines.forEach((entry, index) => text(index === maxLines - 1 && lines.length === maxLines ? ellipsize(entry, Math.floor(maxWidth / (size * 0.51))) : entry, x, y - index * (size + 4), size, colour, bold));
    return lines.length;
  };

  // Header
  rectangle(0, 696, pageWidth, 146, dark);
  rectangle(0, 689, pageWidth, 7, gold);
  text('Single', 54, 789, 25, white, true);
  text('Rent', 130, 789, 25, gold, true);
  text('VERIFIED TRANSACTION RECORD', 54, 767, 8, '0.78 0.88 0.81', true);
  rightText(input.title.toUpperCase(), 558, 786, 13, white, true);
  rightText('PAYMENT CONFIRMED', 558, 763, 8, '0.78 0.88 0.81', true);
  rule(54, 739, 558, 739, '0.25 0.42 0.33');
  text('RECEIPT NUMBER', 54, 720, 8, '0.78 0.88 0.81', true);
  text(ellipsize(input.receiptNumber, 52), 54, 705, 11, white, true);
  text('ISSUED', 367, 720, 8, '0.78 0.88 0.81', true);
  rightText(input.issuedAt, 558, 705, 10, white, true);

  // Total card
  rectangle(54, 603, 504, 68, pale);
  border(54, 603, 504, 68, line);
  text('TOTAL PAID', 72, 647, 9, green, true);
  text(input.total, 72, 618, 24, dark, true);
  rightText('Confirmed', 538, 641, 11, green, true);
  rightText('Transaction recorded', 538, 623, 9, muted);

  // Person and property details
  text('PAID BY', 54, 574, 8, muted, true);
  text('PROPERTY', 315, 574, 8, muted, true);
  wrappedText(input.recipientName, 54, 556, 220, 12, ink, true, 1);
  wrappedText(input.propertyTitle, 315, 556, 225, 12, ink, true, 1);
  wrappedText(input.recipientEmail, 54, 538, 220, 9, muted, false, 1);
  wrappedText(input.propertyAddress || 'Address recorded in SingleRent', 315, 538, 225, 9, muted, false, 1);
  rule(54, 516, 558, 516, line);

  // Financial table
  text('PAYMENT SUMMARY', 54, 493, 10, dark, true);
  rightText('AMOUNT', 558, 493, 8, muted, true);
  let tableY = 468;
  input.lineItems.slice(0, 6).forEach((item, index) => {
    if (index % 2 === 0) rectangle(54, tableY - 7, 504, 25, '0.975 0.988 0.978');
    text(item.label, 66, tableY, 10, ink);
    rightText(item.value, 546, tableY, 10, ink, true);
    tableY -= 26;
  });
  rule(54, tableY + 7, 558, tableY + 7, green, 1.3);
  text('TOTAL', 66, tableY - 13, 10, dark, true);
  rightText(input.total, 546, tableY - 13, 12, dark, true);
  tableY -= 49;

  // Transaction record
  const recordTop = tableY;
  rectangle(54, recordTop - 86, 504, 86, '0.985 0.992 0.986');
  border(54, recordTop - 86, 504, 86, line);
  text('TRANSACTION DETAILS', 70, recordTop - 20, 8, green, true);
  text('PAYMENT REFERENCE', 70, recordTop - 42, 8, muted, true);
  text('RECEIPT ID', 322, recordTop - 42, 8, muted, true);
  wrappedText(input.paymentReference, 70, recordTop - 57, 220, 9, ink, true, 1);
  wrappedText(input.receiptNumber, 322, recordTop - 57, 215, 9, ink, true, 1);
  if (input.payoutReference) {
    text('TRANSFER REFERENCE', 70, recordTop - 78, 8, muted, true);
    wrappedText(input.payoutReference, 190, recordTop - 78, 347, 8, ink, false, 1);
  }

  // Trust note and footer
  const noteY = recordTop - 122;
  rectangle(54, noteY - 48, 504, 48, '0.93 0.97 0.94');
  rectangle(54, noteY - 48, 4, 48, green);
  text('PAYMENT STATUS', 72, noteY - 17, 8, green, true);
  wrappedText(input.note, 72, noteY - 33, 455, 9, ink, false, 1);
  rule(54, 69, 558, 69, line);
  text('Generated by SingleRent from verified transaction records.', 54, 49, 8, muted);
  rightText('Keep this receipt for your records', 558, 49, 8, muted);

  const stream = content.join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [5 0 R] /Count 1 >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents 6 0 R >>',
    `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`,
  ];
  return buildPdf(objects);
}

function buildPdf(objects: string[]): Buffer {
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index < offsets.length; index += 1) pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

function estimateTextWidth(value: string, size: number, bold: boolean): number {
  return value.length * size * (bold ? 0.56 : 0.51);
}

function ellipsize(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, Math.max(1, maxLength - 3)).trimEnd()}...`;
}

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result.length ? result : [[]];
}

function escapePdf(value: string): string {
  // The compact writer deliberately uses Helvetica with a WinAnsi-like text
  // stream. Normalise typographic punctuation from the agreement before
  // emitting it so a quote cannot become a PDF control byte.
  return value
    .normalize('NFKD')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/[\\()]/g, '\\$&')
    .replace(/[\r\n]/g, ' ');
}

function wrap(value: string, width: number): string[] {
  const words = value.replace(/\s+/g, ' ').trim().split(' ');
  const result: string[] = [];
  let current = '';
  for (const word of words) {
    if (!current || `${current} ${word}`.length <= width) current = current ? `${current} ${word}` : word;
    else { result.push(current); current = word; }
  }
  if (current) result.push(current);
  return result.length ? result : [''];
}
