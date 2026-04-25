import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

@Catch(PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(exception: PrismaClientKnownRequestError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Database error';

    switch (exception.code) {
      case 'P2025':
        statusCode = HttpStatus.NOT_FOUND;
        message = 'Record not found';
        throw new NotFoundException(message);

      case 'P2002':
        statusCode = HttpStatus.CONFLICT;
        const field = (exception.meta?.target as string[])?.[0];
        message = `Duplicate value for field: ${field}`;
        throw new ConflictException(message);

      case 'P2003':
        statusCode = HttpStatus.BAD_REQUEST;
        message = 'Foreign key constraint failed';
        throw new BadRequestException(message);

      case 'P2014':
        statusCode = HttpStatus.BAD_REQUEST;
        message = 'Required relation violation';
        throw new BadRequestException(message);

      default:
        throw exception;
    }
  }
}
