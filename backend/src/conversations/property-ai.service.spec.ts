import { PropertyAiService } from './property-ai.service';

describe('property assistant fact checking', () => {
  const service = new PropertyAiService({ getByPublicId: jest.fn().mockResolvedValue({
    annualRentKobo: 50000000n,
    serviceChargeKobo: 0n,
    cautionFeeKobo: 0n,
    bedrooms: 2,
    bathrooms: 1,
    amenities: [],
  }) } as any);

  it('answers a simple question from the stored listing', async () => {
    const reply = await service.answer('listing', 'How many bedrooms?');
    expect(reply.needsPropertyContactReply).toBe(false);
    expect(reply.body).toContain('2 bedrooms');
  });

  it.each(['Is rent negotiable?', 'Can I keep a pet?', 'What is the rent and can I pay monthly?'])('forwards an uncertain question: %s', async (question) => {
    expect((await service.answer('listing', question)).needsPropertyContactReply).toBe(true);
  });
});
