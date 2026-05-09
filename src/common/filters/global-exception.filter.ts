import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const now = new Date();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      message =
        typeof exceptionResponse === 'object' && 'message' in exceptionResponse
          ? (exceptionResponse as any).message
          : exception.message;
    } else if (exception instanceof Error) {
      const errorMessage = exception.message.toLowerCase();

      if (errorMessage.includes('binance') || errorMessage.includes('api')) {
        status = HttpStatus.BAD_GATEWAY;
        message = 'External API error: ' + exception.message;
      } else if (
        errorMessage.includes('not found') ||
        errorMessage.includes('cannot find')
      ) {
        status = HttpStatus.NOT_FOUND;
        message = 'Resource not found';
      } else if (
        errorMessage.includes('invalid') ||
        errorMessage.includes('validation')
      ) {
        status = HttpStatus.BAD_REQUEST;
        message = exception.message;
      } else {
        status = HttpStatus.INTERNAL_SERVER_ERROR;
        message = exception.message;
      }
    }

    this.logger.error(
      `[${request.method}] ${request.url} - Status: ${status} - Message: ${message}`,
      exception instanceof Error ? exception.stack : JSON.stringify(exception),
    );

    response.status(status).json({
      statusCode: status,
      message,
      timestamp: now.toISOString(),
      path: request.url,
    });
  }
}
