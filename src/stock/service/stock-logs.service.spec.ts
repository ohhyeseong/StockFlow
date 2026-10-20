import { BadRequestException } from '@nestjs/common';
import type {
  DataSource,
  FindManyOptions,
  FindOperator,
  FindOptionsWhere,
  Repository,
} from 'typeorm';
import type { Stock } from '../entity/stock.entity';
import type { StockLog } from '../entity/stock-log.entity';
import { StockService } from './stock.service';

describe('StockService.findLogs date boundaries (no database)', () => {
  let find: jest.Mock<Promise<StockLog[]>, [FindManyOptions<StockLog>]>;
  let service: StockService;

  beforeEach(() => {
    find = jest
      .fn<Promise<StockLog[]>, [FindManyOptions<StockLog>]>()
      .mockResolvedValue([]);
    service = new StockService(
      {} as Repository<Stock>,
      { find } as unknown as Repository<StockLog>,
      {} as DataSource,
    );
  });

  const createdAtFilter = (): FindOperator<Date> => {
    const where = find.mock.calls[0][0].where as FindOptionsWhere<StockLog>;
    return where.createdAt as FindOperator<Date>;
  };

  it('keeps unfiltered queries, relations, and descending order', async () => {
    await expect(service.findLogs({})).resolves.toEqual([]);
    expect(find).toHaveBeenCalledWith({
      where: {},
      relations: { item: true, user: true },
      order: { createdAt: 'DESC' },
    });
  });

  it.each([
    [
      '2026-08-11',
      '2026-08-11',
      '2026-08-10T15:00:00.000Z',
      '2026-08-11T15:00:00.000Z',
    ],
    [
      '2026-08-01',
      '2026-08-11',
      '2026-07-31T15:00:00.000Z',
      '2026-08-11T15:00:00.000Z',
    ],
    [
      '2024-02-29',
      '2024-02-29',
      '2024-02-28T15:00:00.000Z',
      '2024-02-29T15:00:00.000Z',
    ],
    [
      '2026-12-31',
      '2026-12-31',
      '2026-12-30T15:00:00.000Z',
      '2026-12-31T15:00:00.000Z',
    ],
  ])(
    'uses inclusive KST start and exclusive next-day end for %s through %s',
    async (startDate, endDate, expectedStart, expectedEnd) => {
      await service.findLogs({ startDate, endDate });
      const filter = createdAtFilter();
      expect(filter.type).toBe('and');
      const [start, end] = filter.value as unknown as FindOperator<Date>[];
      expect(start.type).toBe('moreThanOrEqual');
      expect(start.value.toISOString()).toBe(expectedStart);
      expect(end.type).toBe('lessThan');
      expect(end.value.toISOString()).toBe(expectedEnd);
    },
  );

  it('uses an inclusive start when only startDate is present', async () => {
    await service.findLogs({ startDate: '2026-08-11' });
    const filter = createdAtFilter();
    expect(filter.type).toBe('moreThanOrEqual');
    expect(filter.value.toISOString()).toBe('2026-08-10T15:00:00.000Z');
  });

  it('uses an exclusive next-day end when only endDate is present', async () => {
    await service.findLogs({ endDate: '2026-08-11' });
    const filter = createdAtFilter();
    expect(filter.type).toBe('lessThan');
    expect(filter.value.toISOString()).toBe('2026-08-11T15:00:00.000Z');
  });

  it('rejects a reversed range with HTTP 400 before querying', () => {
    expect(() =>
      service.findLogs({
        startDate: '2026-08-12',
        endDate: '2026-08-11',
      }),
    ).toThrow(BadRequestException);
    expect(find).not.toHaveBeenCalled();
  });

  it('preserves the item filter with a date filter', async () => {
    await service.findLogs({ itemId: 3, startDate: '2026-08-11' });
    const where = find.mock.calls[0][0].where as FindOptionsWhere<StockLog>;
    expect(where.item).toEqual({ id: 3 });
  });
});
