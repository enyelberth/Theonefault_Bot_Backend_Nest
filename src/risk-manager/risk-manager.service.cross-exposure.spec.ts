import { RiskManagerService } from './risk-manager.service';

function baseConfig(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    enabled: true,
    maxDailyLossQuote: null,
    maxDrawdownPct: null,
    maxOpenBots: null,
    maxLossPerBotQuote: null,
    minWinRatePct: null,
    minTradesForWinRateEval: 20,
    emergencyStopUntil: null,
    guardBufferPct: 4,
    guardConfirmTicks: 3,
    guardCooldownMinutes: 15,
    consecutiveLossLimit: null,
    includeUnrealizedInDailyLoss: false,
    maxCrossBotExposurePct: null,
    ...overrides,
  };
}

function buildService(opts: {
  maxCrossBotExposurePct: number;
  v2Runs: Array<{ id: number; initialEquity: number }>;
  v2OpenTrades: Array<{ entryPrice: number; quantity: number }>;
}) {
  const emergencyStopAll = jest.fn().mockResolvedValue({ stopped: 0 });
  const prisma = {
    riskConfig: {
      findUnique: jest
        .fn()
        .mockResolvedValue(baseConfig({ maxCrossBotExposurePct: opts.maxCrossBotExposurePct })),
    },
    botRun: { findMany: jest.fn().mockResolvedValue([]) },
    botRunnerRun: { findMany: jest.fn().mockResolvedValue(opts.v2Runs) },
    botRunnerTrade: {
      findMany: jest.fn().mockResolvedValue(opts.v2OpenTrades),
    },
  } as any;
  const botService = {} as any;
  const dashboard = {} as any;
  const botRunner = { list: jest.fn().mockReturnValue([]) } as any;
  const service = new RiskManagerService(prisma, botService, dashboard, botRunner);
  // emergencyStopAll hace side-effects (botRun/botRunner stop, riskConfig.update)
  // que no son el foco de este test -- se mockea directo en la instancia.
  (service as any).emergencyStopAll = emergencyStopAll;
  return { service, emergencyStopAll };
}

describe('RiskManagerService.checkAll -- cross-bot exposure (v2)', () => {
  it('does not trip the breaker when v2 exposure is below the threshold', async () => {
    const { service, emergencyStopAll } = buildService({
      maxCrossBotExposurePct: 80,
      v2Runs: [{ id: 1, initialEquity: 1000 }],
      v2OpenTrades: [{ entryPrice: 100, quantity: 2 }], // notional 200 / equity 1000 = 20%
    });

    await service.checkAll();

    expect(emergencyStopAll).not.toHaveBeenCalled();
  });

  it('trips the global breaker when v2 open-position notional breaches maxCrossBotExposurePct', async () => {
    const { service, emergencyStopAll } = buildService({
      maxCrossBotExposurePct: 50,
      v2Runs: [{ id: 1, initialEquity: 1000 }],
      v2OpenTrades: [{ entryPrice: 100, quantity: 7 }], // notional 700 / equity 1000 = 70%
    });

    await service.checkAll();

    expect(emergencyStopAll).toHaveBeenCalledWith(
      expect.stringContaining('Cross-bot exposure'),
    );
  });

  it('ignores v2 entirely when there are no active v2 runners', async () => {
    const { service, emergencyStopAll } = buildService({
      maxCrossBotExposurePct: 1, // umbral absurdamente bajo
      v2Runs: [],
      v2OpenTrades: [],
    });

    await service.checkAll();

    // equityBase queda 0 (sin runs legacy ni v2) -> el chequeo de % se
    // salta por completo (ver "if (equityBase > 0)").
    expect(emergencyStopAll).not.toHaveBeenCalled();
  });
});
