import { createHmac, timingSafeEqual } from 'crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface OperatorDocumentPreviewClaims {
  kind: 'customer';
  organizationId: string;
  customerId: string;
  documentId: string;
  userId: string;
  exp: number;
}

export type OperatorGeneratedDocumentPreviewClaims = {
  kind: 'generated';
  organizationId: string;
  bookingId: string;
  documentId: string;
  userId: string;
  exp: number;
};

const PREVIEW_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class OperatorDocumentPreviewService {
  constructor(private readonly config: ConfigService) {}

  issueCustomerDocumentPreviewToken(
    claims: Omit<OperatorDocumentPreviewClaims, 'exp' | 'kind'>,
  ): { token: string; expiresAt: Date } {
    const expiresAt = new Date(Date.now() + PREVIEW_TTL_MS);
    const payload: OperatorDocumentPreviewClaims = {
      kind: 'customer',
      ...claims,
      exp: expiresAt.getTime(),
    };
    return { token: this.sign(payload), expiresAt };
  }

  issueGeneratedDocumentPreviewToken(
    claims: Omit<OperatorGeneratedDocumentPreviewClaims, 'exp' | 'kind'>,
  ): { token: string; expiresAt: Date } {
    const expiresAt = new Date(Date.now() + PREVIEW_TTL_MS);
    const payload: OperatorGeneratedDocumentPreviewClaims = {
      kind: 'generated',
      ...claims,
      exp: expiresAt.getTime(),
    };
    return { token: this.sign(payload), expiresAt };
  }

  verifyToken(
    token: string,
  ): OperatorDocumentPreviewClaims | OperatorGeneratedDocumentPreviewClaims {
    const payload = this.verify<
      OperatorDocumentPreviewClaims | OperatorGeneratedDocumentPreviewClaims
    >(token);
    if (payload.kind === 'customer') {
      if (!payload.customerId || !payload.documentId) {
        throw new UnauthorizedException('Invalid preview token');
      }
      return payload;
    }
    if (!payload.bookingId || !payload.documentId) {
      throw new UnauthorizedException('Invalid preview token');
    }
    return payload;
  }

  verifyCustomerDocumentToken(token: string): OperatorDocumentPreviewClaims {
    const payload = this.verifyToken(token);
    if (payload.kind !== 'customer') {
      throw new UnauthorizedException('Invalid preview token kind');
    }
    return payload;
  }

  verifyGeneratedDocumentToken(token: string): OperatorGeneratedDocumentPreviewClaims {
    const payload = this.verifyToken(token);
    if (payload.kind !== 'generated') {
      throw new UnauthorizedException('Invalid preview token kind');
    }
    return payload;
  }

  private sign(payload: object): string {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = createHmac('sha256', this.secret()).update(body).digest('base64url');
    return `${body}.${sig}`;
  }

  private verify<T extends { exp: number }>(token: string): T {
    const [body, sig] = token.split('.');
    if (!body || !sig) {
      throw new UnauthorizedException('Invalid preview token');
    }
    const expected = createHmac('sha256', this.secret()).update(body).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Invalid preview token');
    }
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T;
    if (!payload.exp || payload.exp < Date.now()) {
      throw new UnauthorizedException('Preview token expired');
    }
    return payload;
  }

  private secret(): string {
    return (
      this.config.get<string>('OPERATOR_DOCUMENT_PREVIEW_SECRET') ??
      this.config.get<string>('JWT_SECRET') ??
      'operator-preview-dev-only'
    );
  }
}
