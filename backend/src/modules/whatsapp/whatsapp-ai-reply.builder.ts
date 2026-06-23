import { WhatsAppAiIntent } from '@prisma/client';
import type { WhatsAppAiContextSnapshot, WhatsAppAiToolResult } from './whatsapp-ai.types';

export function buildSuggestedReply(
  intent: WhatsAppAiIntent,
  ctx: WhatsAppAiContextSnapshot,
  toolResults: WhatsAppAiToolResult[],
  humanRequired: boolean,
): string {
  if (humanRequired) {
    return buildHumanHandoverReply(intent);
  }

  if (!ctx.customer) {
    return 'Ich kann deine Zuordnung gerade nicht sicher bestätigen. Ich leite deine Nachricht an unser Team weiter.';
  }

  const toolSummary = (name: string) => toolResults.find((t) => t.tool === name && t.ok)?.summary;

  switch (intent) {
    case WhatsAppAiIntent.LOCATION: {
      const loc = toolSummary('getVehicleLocationSummary');
      if (loc) return loc;
      return 'Aktuell kann ich keinen verlässlichen Standort nennen. Unser Team prüft das und meldet sich bei dir.';
    }
    case WhatsAppAiIntent.VEHICLE_STATUS: {
      const status = toolSummary('getVehicleStatus');
      if (status) return `${status}. Bei Rückfragen melde dich gerne.`;
      return 'Aktuell liegen keine verlässlichen Fahrzeugdaten vor. Unser Team hilft dir weiter.';
    }
    case WhatsAppAiIntent.VEHICLE_WARNING:
      return 'Danke für die Info. Bitte fahre vorsichtig weiter und sende uns ein Foto der Warnmeldung. Ich leite das direkt an unser Team weiter.';
    case WhatsAppAiIntent.BOOKING_STATUS: {
      const summary = toolSummary('getBookingSummary');
      if (summary) return summary;
      if (!ctx.booking) return 'Ich finde aktuell keine verknüpfte Buchung. Unser Team schaut sich deine Anfrage an.';
      return `Deine Buchung ist im Status „${ctx.booking.status}". Bei Fragen melde dich gerne.`;
    }
    case WhatsAppAiIntent.PICKUP_INFO: {
      const pickup = toolSummary('getPickupInstructions');
      if (pickup) return pickup;
      if (ctx.booking?.pickupStationName) {
        return `Abholung an Station ${ctx.booking.pickupStationName}. Details findest du in deiner Buchungsbestätigung.`;
      }
      return 'Für Abholhinweise leite ich deine Anfrage an unser Team weiter.';
    }
    case WhatsAppAiIntent.RETURN_INFO: {
      const ret = toolSummary('getReturnInstructions');
      if (ret) return ret;
      if (ctx.booking?.returnStationName) {
        return `Rückgabe an Station ${ctx.booking.returnStationName}. Bitte halte Tankfüllung und Kilometerstand laut Vertrag ein.`;
      }
      return 'Für Rückgabehinweise leite ich deine Anfrage an unser Team weiter.';
    }
    case WhatsAppAiIntent.DOCUMENTS: {
      const docs = toolSummary('getMissingDocuments');
      if (docs) return docs;
      return 'Ich prüfe deine Dokumente und leite die Anfrage an unser Team weiter.';
    }
    case WhatsAppAiIntent.DEPOSIT: {
      const pay = toolSummary('getPaymentDepositStatus');
      if (pay) return pay;
      return 'Zu Kaution und Zahlung meldet sich unser Team mit den Details aus deiner Buchung.';
    }
    case WhatsAppAiIntent.GENERAL:
    case WhatsAppAiIntent.SUPPORT:
    case WhatsAppAiIntent.UNKNOWN:
    default:
      if (ctx.booking && ctx.hasActiveBooking) {
        return `Danke für deine Nachricht. Wir bearbeiten deine Anfrage zur Buchung (${ctx.booking.status}). Ein Mitarbeiter meldet sich bei Bedarf.`;
      }
      return 'Danke für deine Nachricht. Unser Team kümmert sich darum und meldet sich zeitnah bei dir.';
  }
}

function buildHumanHandoverReply(intent: WhatsAppAiIntent): string {
  switch (intent) {
    case WhatsAppAiIntent.ACCIDENT:
      return 'Das tut mir leid. Bitte stelle deine Sicherheit sicher und rufe bei Bedarf den Notruf. Ich leite deine Nachricht sofort an unser Team weiter.';
    case WhatsAppAiIntent.DAMAGE:
    case WhatsAppAiIntent.COMPLAINT:
      return 'Danke für deine Nachricht. Ich leite das an unser Team weiter — ein Mitarbeiter meldet sich bei dir.';
    case WhatsAppAiIntent.PAYMENT:
    case WhatsAppAiIntent.BOOKING_CHANGE:
      return 'Für dieses Anliegen kümmert sich ein Mitarbeiter persönlich. Wir melden uns zeitnah bei dir.';
    case WhatsAppAiIntent.VEHICLE_WARNING:
      return 'Danke für die Info. Bitte fahre vorsichtig weiter und sende uns ein Foto der Warnmeldung. Ich leite das direkt an unser Team weiter.';
    default:
      return 'Ich leite deine Nachricht an unser Team weiter. Ein Mitarbeiter meldet sich zeitnah bei dir.';
  }
}
