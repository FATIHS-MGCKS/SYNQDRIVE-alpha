import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { DimoAgentsService } from './dimo-agents.service';

interface FleetVehicleInfo {
  vehicleId: string;
  licensePlate: string | null;
  vehicleName: string | null;
  make: string;
  model: string;
  year: number;
  vin: string;
  fuelType: string;
  tokenId: number | null;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly agentsService: DimoAgentsService,
  ) {}

  async ensureAgent(orgId: string): Promise<{ agentName: string; dimoAgentId: string }> {
    const existing = await this.prisma.organizationChatAgent.findUnique({
      where: { organizationId: orgId },
    });
    if (existing) return { agentName: existing.agentName, dimoAgentId: existing.dimoAgentId };

    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { shortCode: true, companyName: true },
    });
    if (!org) throw new Error('Organization not found');

    const shortCode = org.shortCode || this.deriveShortCode(org.companyName);

    if (!org.shortCode) {
      await this.prisma.organization.update({
        where: { id: orgId },
        data: { shortCode },
      }).catch(() => {
        this.logger.warn(`[Chat] Could not auto-assign shortCode "${shortCode}" (may conflict)`);
      });
    }

    const agentName = `${shortCode}_chatagent`;
    this.logger.log(`[Chat] Creating DIMO agent "${agentName}" for org ${orgId}`);

    const result = await this.agentsService.createAgent();
    if (!result.success || !result.agentId) {
      throw new Error(result.error || 'Failed to create DIMO agent');
    }

    const record = await this.prisma.organizationChatAgent.create({
      data: {
        organizationId: orgId,
        agentName,
        dimoAgentId: result.agentId,
      },
    });

    return { agentName: record.agentName, dimoAgentId: record.dimoAgentId };
  }

  async sendMessage(orgId: string, content: string): Promise<{ role: string; content: string; createdAt: Date }> {
    let agent: { agentName: string; dimoAgentId: string };
    try {
      agent = await this.ensureAgent(orgId);
    } catch (err: any) {
      this.logger.error(`[Chat] ensureAgent failed for org ${orgId}: ${err.message}`);
      const errorMsg = "I'm sorry, I couldn't connect to the AI agent right now. Please try again in a moment.";
      const saved = await this.prisma.chatMessage.create({
        data: { organizationId: orgId, role: 'assistant', content: errorMsg },
      }).catch(() => ({ createdAt: new Date() }));
      return { role: 'assistant', content: errorMsg, createdAt: saved.createdAt };
    }

    await this.prisma.chatMessage.create({
      data: { organizationId: orgId, role: 'user', content },
    }).catch(() => {});

    const fleet = await this.getOrgFleetInfo(orgId);
    const tokenIds = fleet.map((v) => v.tokenId).filter((t): t is number => t != null);
    const enrichedMessage = this.buildEnrichedMessage(content, fleet);

    let result = await this.agentsService.sendMessage(agent.dimoAgentId, enrichedMessage, tokenIds);

    if (!result.success && (result.statusCode === 404 || result.statusCode === 410)) {
      this.logger.warn(`[Chat] Agent ${agent.dimoAgentId} expired, recreating...`);
      await this.prisma.organizationChatAgent.delete({ where: { organizationId: orgId } }).catch(() => {});
      try {
        const newAgent = await this.ensureAgent(orgId);
        result = await this.agentsService.sendMessage(newAgent.dimoAgentId, enrichedMessage, tokenIds);
      } catch (retryErr: any) {
        this.logger.error(`[Chat] Agent re-creation failed: ${retryErr.message}`);
        result = { success: false, error: 'Agent temporarily unavailable. Please try again.' };
      }
    }

    if (!result.success) {
      const errorMsg = `I'm sorry, I couldn't process your request right now. ${result.error || 'Please try again later.'}`;
      const saved = await this.prisma.chatMessage.create({
        data: { organizationId: orgId, role: 'assistant', content: errorMsg },
      }).catch(() => ({ createdAt: new Date() }));
      return { role: 'assistant', content: errorMsg, createdAt: saved.createdAt };
    }

    const responseText = result.response || 'No response received.';
    const saved = await this.prisma.chatMessage.create({
      data: { organizationId: orgId, role: 'assistant', content: responseText },
    }).catch(() => ({ createdAt: new Date() }));

    return { role: 'assistant', content: responseText, createdAt: saved.createdAt };
  }

  async getHistory(orgId: string, limit = 100, before?: string) {
    const where: any = { organizationId: orgId };
    if (before) {
      where.createdAt = { lt: new Date(before) };
    }

    const messages = await this.prisma.chatMessage.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: { id: true, role: true, content: true, createdAt: true },
    });

    return messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
    }));
  }

  async clearHistory(orgId: string) {
    await this.prisma.chatMessage.deleteMany({ where: { organizationId: orgId } });
    return { cleared: true };
  }

  async getAgentInfo(orgId: string) {
    const agent = await this.prisma.organizationChatAgent.findUnique({
      where: { organizationId: orgId },
      select: { agentName: true, dimoAgentId: true, createdAt: true },
    });
    const messageCount = await this.prisma.chatMessage.count({ where: { organizationId: orgId } });
    return { agent, messageCount };
  }

  private async getOrgFleetInfo(orgId: string): Promise<FleetVehicleInfo[]> {
    const vehicles = await this.prisma.vehicle.findMany({
      where: { organizationId: orgId },
      select: {
        id: true,
        licensePlate: true,
        vehicleName: true,
        make: true,
        model: true,
        year: true,
        vin: true,
        fuelType: true,
        dimoVehicle: { select: { tokenId: true } },
      },
    });
    return vehicles.map((v) => ({
      vehicleId: v.id,
      licensePlate: v.licensePlate,
      vehicleName: v.vehicleName,
      make: v.make,
      model: v.model,
      year: v.year,
      vin: v.vin,
      fuelType: v.fuelType,
      tokenId: v.dimoVehicle?.tokenId ?? null,
    }));
  }

  private buildEnrichedMessage(userMessage: string, fleet: FleetVehicleInfo[]): string {
    if (fleet.length === 0) return userMessage;

    const vehicleLines = fleet.map((v, i) => {
      const parts = [`#${i + 1}: ${v.make} ${v.model} ${v.year}`];
      if (v.licensePlate) parts.push(`plate="${v.licensePlate}"`);
      if (v.vehicleName) parts.push(`name="${v.vehicleName}"`);
      if (v.vin) parts.push(`VIN=${v.vin}`);
      if (v.tokenId) parts.push(`tokenId=${v.tokenId}`);
      parts.push(`fuel=${v.fuelType}`);
      return parts.join(', ');
    });

    const resolvedVehicle = this.tryResolveVehicle(userMessage, fleet);
    const resolutionHint = resolvedVehicle
      ? `\n[System: The user is likely referring to vehicle "${resolvedVehicle.make} ${resolvedVehicle.model} ${resolvedVehicle.year}"${resolvedVehicle.licensePlate ? ` (plate: ${resolvedVehicle.licensePlate})` : ''}${resolvedVehicle.tokenId ? `, tokenId=${resolvedVehicle.tokenId}` : ''}. Use this vehicle for data lookups.]`
      : '';

    return `[Fleet context — ${fleet.length} registered vehicles:\n${vehicleLines.join('\n')}\nUse this fleet data to identify vehicles when users refer to them by license plate, name, make/model, or VIN.]${resolutionHint}\n\nUser message: ${userMessage}`;
  }

  private tryResolveVehicle(message: string, fleet: FleetVehicleInfo[]): FleetVehicleInfo | null {
    const normalized = this.normalizePlate(message);
    const msgLower = message.toLowerCase();

    for (const v of fleet) {
      if (v.licensePlate && this.normalizePlate(v.licensePlate) === normalized) {
        return v;
      }
    }

    for (const v of fleet) {
      if (v.licensePlate) {
        const storedNorm = this.normalizePlate(v.licensePlate);
        if (storedNorm && normalized.includes(storedNorm)) return v;
        if (storedNorm && storedNorm.includes(normalized) && normalized.length >= 4) return v;
      }
    }

    for (const v of fleet) {
      if (v.vehicleName && msgLower.includes(v.vehicleName.toLowerCase())) return v;
    }

    const makeModelMatches = fleet.filter((v) => {
      const make = v.make.toLowerCase();
      const model = v.model.toLowerCase();
      return msgLower.includes(make) && msgLower.includes(model);
    });
    if (makeModelMatches.length === 1) return makeModelMatches[0];
    if (makeModelMatches.length > 1) {
      const withYear = makeModelMatches.filter((v) => msgLower.includes(String(v.year)));
      if (withYear.length === 1) return withYear[0];
    }

    for (const v of fleet) {
      if (v.vin && msgLower.includes(v.vin.toLowerCase())) return v;
    }

    const tokenMatch = message.match(/token\s*(?:id)?\s*[:#=]?\s*(\d+)/i);
    if (tokenMatch) {
      const tid = parseInt(tokenMatch[1], 10);
      const match = fleet.find((v) => v.tokenId === tid);
      if (match) return match;
    }

    return null;
  }

  private normalizePlate(input: string): string {
    return input
      .toUpperCase()
      .replace(/[-–—]/g, ' ')
      .replace(/[^A-Z0-9 ]/g, '')
      .replace(/\s+/g, '')
      .trim();
  }

  private deriveShortCode(companyName: string): string {
    const cleaned = companyName
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .trim()
      .toLowerCase();
    const words = cleaned.split(/\s+/).filter(Boolean);
    if (words.length === 0) return 'org';
    if (words.length === 1) return words[0].slice(0, 6);
    return words.map((w) => w[0]).join('').slice(0, 6);
  }
}
