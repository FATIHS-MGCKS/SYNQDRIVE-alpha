import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

export class CommunicationAttachmentError {
  static unsupportedType(): BadRequestException {
    return new BadRequestException({ code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Unsupported file type' });
  }

  static mimeMismatch(): BadRequestException {
    return new BadRequestException({ code: 'UNSUPPORTED_MEDIA_TYPE', message: 'File content does not match declared type' });
  }

  static fileTooLarge(maxBytes: number): BadRequestException {
    return new BadRequestException({ code: 'FILE_TOO_LARGE', message: `File exceeds maximum size of ${maxBytes} bytes` });
  }

  static emptyFile(): BadRequestException {
    return new BadRequestException({ code: 'ATTACHMENT_NOT_ALLOWED', message: 'Empty files are not allowed' });
  }

  static notFound(): NotFoundException {
    return new NotFoundException({ code: 'ATTACHMENT_NOT_FOUND', message: 'Attachment not found' });
  }

  static notReady(): BadRequestException {
    return new BadRequestException({ code: 'ATTACHMENT_NOT_READY', message: 'Attachment is not ready' });
  }

  static conversationMismatch(): ForbiddenException {
    return new ForbiddenException({ code: 'FORBIDDEN', message: 'Attachment does not belong to this conversation' });
  }

  static sealed(): BadRequestException {
    return new BadRequestException({ code: 'ATTACHMENT_NOT_ALLOWED', message: 'Attachment is already referenced by a send' });
  }
}
