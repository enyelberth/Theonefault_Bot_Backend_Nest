import { COLORS } from '../interfaces/colors';

export class LoggerMessages {
    constructor(private logger: { log: Function; warn: Function; error: Function }) { }

    logSuccess(message: string, ...args: any[]) {
        this.logger.log(`${COLORS.fgGreen}${message}${COLORS.reset}`, ...args);
    }

    logInfo(message: string, ...args: any[]) {
        this.logger.log(`${COLORS.fgCyan}${message}${COLORS.reset}`, ...args);
    }

    logWarn(message: string, ...args: any[]) {
        this.logger.warn(`${COLORS.fgYellow}ALERTA: ${message}${COLORS.reset}`, ...args);
    }

    logError(message: string, ...args: any[]) {
        this.logger.error(`${COLORS.fgRed}${message}${COLORS.reset}`, ...args);
    }
}
