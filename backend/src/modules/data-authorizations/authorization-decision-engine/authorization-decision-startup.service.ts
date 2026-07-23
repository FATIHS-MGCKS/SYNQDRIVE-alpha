import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { readAuthorizationDecisionConfig } from './authorization-decision.config';
import { validateAuthorizationDecisionConfig } from './authorization-decision.config-validator';

@Injectable()
export class AuthorizationDecisionStartupService implements OnModuleInit {
  private readonly logger = new Logger(AuthorizationDecisionStartupService.name);

  onModuleInit(): void {
    const config = readAuthorizationDecisionConfig();
    const validation = validateAuthorizationDecisionConfig(config);

    for (const warning of validation.warnings) {
      this.logger.warn(`Authorization decision config: ${warning}`);
    }

    if (!validation.ok) {
      throw new Error(
        `Authorization decision engine unsafe configuration: ${validation.errors.join('; ')}`,
      );
    }

    this.logger.log(
      `Authorization decision engine ready (enforcement=${config.enforcementEnabled}, cache=${config.cacheEnabled}, globalDeny=${config.globalDenySwitch})`,
    );
  }
}
