import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { GetStockLogsDto } from './get-stock-logs.dto';

describe('GetStockLogsDto date query validation (no database)', () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true });
  const validate = (query: Record<string, unknown>): Promise<GetStockLogsDto> =>
    pipe.transform(query, { type: 'query', metatype: GetStockLogsDto });

  it('allows a query without date filters', async () => {
    await expect(validate({})).resolves.toBeInstanceOf(GetStockLogsDto);
  });

  it.each(['2026-08-11', '2024-02-29', '2000-02-29', '2026-12-31'])(
    'accepts the calendar date %s and preserves itemId conversion',
    async (date) => {
      const result = await validate({
        startDate: date,
        endDate: date,
        itemId: '3',
      });
      expect(result.startDate).toBe(date);
      expect(result.endDate).toBe(date);
      expect(result.itemId).toBe(3);
    },
  );

  it.each(['startDate', 'endDate'])(
    'allows %s without the other date',
    async (field) => {
      await expect(validate({ [field]: '2026-08-11' })).resolves.toBeInstanceOf(
        GetStockLogsDto,
      );
    },
  );

  const invalidDates: unknown[] = [
    '2026-08-11T12:00:00Z',
    '2026-08-11T00:00:00+09:00',
    '2026-02-29',
    '1900-02-29',
    '2026-04-31',
    '2026-00-11',
    '2026-13-11',
    '2026-08-00',
    '2026-08-32',
    '2026-8-11',
    '20260811',
    '2026-08',
    ' 2026-08-11',
    '',
    'not-a-date',
    20260811,
    ['2026-08-11'],
  ];

  describe.each(['startDate', 'endDate'])('%s', (field) => {
    it.each(invalidDates.map((value) => ({ value })))(
      'rejects $value with HTTP 400',
      async ({ value }) => {
        await expect(validate({ [field]: value })).rejects.toBeInstanceOf(
          BadRequestException,
        );
      },
    );
  });
});
