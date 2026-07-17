import { Injectable, Logger } from '@nestjs/common';
import { BotRunStatus, PrismaClient } from '@prisma/client';

const DEFAULT_SYMBOLS = ['BTCFDUSD', 'ETHFDUSD', 'BNBFDUSD', 'SOLFDUSD', 'XRPFDUSD', 'DOGEFDUSD', 'LINKFDUSD'];

@Injectable()
export class SymbolRegistryService {
  private readonly logger = new Logger(SymbolRegistryService.name);
  private extraSymbols = new Set<string>();

  constructor(private readonly prisma: PrismaClient) {}

  addSymbol(symbol: string): void {
    this.extraSymbols.add(symbol.toUpperCase());
  }

  removeSymbol(symbol: string): void {
    this.extraSymbols.delete(symbol.toUpperCase());
  }

  async getActiveSymbols(): Promise<string[]> {
    const runs = await this.prisma.botRun.findMany({
      where: { status: BotRunStatus.RUNNING },
      select: { symbol: true },
    });
    const set = new Set<string>(DEFAULT_SYMBOLS);
    for (const r of runs) set.add(r.symbol.toUpperCase());
    for (const s of this.extraSymbols) set.add(s);
    return Array.from(set);
  }
}
