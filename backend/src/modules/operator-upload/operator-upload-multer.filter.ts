import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import { MulterError } from 'multer';
import { OPERATOR_UPLOAD_ERROR } from './operator-upload.constants';

@Catch(MulterError)
export class OperatorUploadMulterExceptionFilter implements ExceptionFilter {
  catch(exception: MulterError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const status = HttpStatus.BAD_REQUEST;
    const message =
      exception.code === 'LIMIT_FILE_SIZE'
        ? 'File exceeds maximum allowed upload size'
        : 'Invalid multipart upload';

    response.status(status).json({
      statusCode: status,
      code: OPERATOR_UPLOAD_ERROR.VALIDATION,
      message,
      retryable: false,
      timestamp: new Date().toISOString(),
    });
  }
}
