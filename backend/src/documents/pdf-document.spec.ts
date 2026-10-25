import { createReceiptPdf, createTextPdf } from './pdf-document';

describe('text PDF document', () => {
  it('writes every line across multiple pages without unsafe typography bytes', () => {
    const data = createTextPdf('Agreement', Array.from({ length: 100 }, (_value, index) => `Clause ${index + 1} — “reviewed”`));
    const pdf = data.toString('latin1');
    expect(pdf).toContain('/Count 3');
    expect(pdf).toContain('Clause 100');
    expect(pdf).toContain('"reviewed"');
  });

  it('renders a branded receipt with a financial summary and verified record', () => {
    const data = createReceiptPdf({
      title: 'Payment receipt',
      receiptNumber: 'SR-TP-123456',
      issuedAt: '25 Oct 2026, 16:03',
      recipientName: 'John Doe',
      recipientEmail: 'john@example.com',
      propertyTitle: 'A calm studio in Surulere',
      propertyAddress: 'Isolo Road, Lagos',
      paymentReference: 'sr_123456',
      total: 'NGN 158,000.00',
      lineItems: [
        { label: 'Annual rent', value: 'NGN 120,000.00' },
        { label: 'Caution deposit', value: 'NGN 20,000.00' },
      ],
      note: 'Your payment has been confirmed and recorded.',
    });
    const pdf = data.toString('latin1');
    expect(pdf).toContain('SingleRent');
    expect(pdf).toContain('PAYMENT SUMMARY');
    expect(pdf).toContain('NGN 158,000.00');
    expect(pdf).toContain('VERIFIED TRANSACTION RECORD');
  });
});
