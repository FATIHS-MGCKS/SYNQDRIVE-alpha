export const voiceAssistantEn = {
  'voice.header.eyebrow': 'AI Voice Command Center',
  'voice.header.testCall': 'Test call',

  'voice.builder.unsavedChanges': 'Unsaved changes',
  'voice.builder.unsavedHint': 'Save before activating or leaving this tab.',
  'voice.builder.savedHint':
    "Changes are saved to your organization's voice assistant configuration.",
  'voice.builder.section.behaviorRules': 'Behavior rules',
  'voice.builder.section.companyKnowledge': 'Company knowledge',
  'voice.builder.section.dataIntegrations': 'Data integrations',
  'voice.builder.section.rentalKnowledge': 'Rental knowledge',
  'voice.builder.section.knowledgeSnippets': 'Knowledge snippets',
  'voice.builder.section.systemPrompt': 'System prompt',
  'voice.builder.section.promptPreview': 'Prompt preview',
  'voice.builder.placeholder.name': 'e.g. SynqDrive Rental Assistant',
  'voice.builder.placeholder.role': 'Customer service & booking help',
  'voice.builder.placeholder.personality': 'Warm, professional, solution-oriented',
  'voice.builder.placeholder.greeting':
    'Hello! Welcome to our rental team. How can I help you today?',
  'voice.builder.placeholder.companyContext':
    'We are a vehicle rental company operating in… Our services include short-term rentals, fleet management…',
  'voice.builder.placeholder.additionalForbidden': 'Any additional restrictions…',
  'voice.builder.placeholder.systemPrompt':
    'Leave empty to auto-build from identity, company context, rules, and snippets…',
  'voice.builder.placeholder.businessRules':
    '• Minimum rental age is 21 with a valid license\n• Returns must be at the agreed station\n• Extensions require staff approval',
  'voice.builder.placeholder.knowledgeSnippets':
    "Q: What documents do I need?\nA: Valid driver's license and credit card…\n\nQ: Is fuel included?\nA: Vehicles are provided with a full tank…",
  'voice.builder.forbiddenActions': 'Forbidden actions',
  'voice.builder.forbiddenActionsHint':
    'Critical guardrails for rental operations. Recommended rules are pre-defined for fleet safety.',
  'voice.builder.escalationBehavior': 'Escalation behavior',
  'voice.builder.escalationHandoverHint':
    'Handover triggers and fallback messages are configured in the Escalation tab.',
  'voice.builder.editEscalation': 'Edit escalation',
  'voice.builder.manualOverrideActive': 'Manual override active',

  'voice.conversations.title': 'Conversation Logs',
  'voice.conversations.subtitle': 'Filter, review, and prepare follow-ups from synced calls.',
  'voice.conversations.loading': 'Loading conversations…',
  'voice.conversations.searchPlaceholder': 'Search summary, transcript, number…',
  'voice.conversations.filter.allDirections': 'All directions',
  'voice.conversations.filter.allOutcomes': 'All outcomes',
  'voice.conversations.filter.allCalls': 'All calls',
  'voice.conversations.filter.escalatedOnly': 'Escalated only',
  'voice.conversations.filter.hasTranscript': 'Has transcript',
  'voice.conversations.emptyTitle': 'No conversations match',
  'voice.conversations.noTranscript': 'No transcript available',
  'voice.conversations.linkBooking': 'Link to booking',
  'voice.conversations.linkCustomer': 'Link to customer',
  'voice.conversations.bookingLinkSoon': 'Booking link API coming soon',
  'voice.conversations.customerLinkSoon': 'Customer link API coming soon',
  'voice.conversations.trainingExample': 'Training example',
  'voice.conversations.toast.taskCreated': 'Task created from call',
  'voice.conversations.toast.taskCreateFailed': 'Could not create task',

  'voice.analytics.avgDuration': 'Avg Duration',
  'voice.analytics.callsByOutcome': 'Calls by outcome',
  'voice.analytics.escalationRate': 'Escalation Rate',
  'voice.analytics.knowledgeGaps': 'Knowledge gaps',
  'voice.analytics.emptyTitle': 'No analytics yet',
  'voice.analytics.notEnoughData': 'Not enough call data yet',
  'voice.analytics.topEscalationReasons': 'Top escalation reasons',
  'voice.analytics.totalTalkTime': 'Total Talk Time',

  'voice.permissions.matrixTitle': 'Tool & rights matrix',
  'voice.permissions.matrixIntroLead': 'Control what the voice assistant may do during calls.',
  'voice.permissions.suggestOnly': 'Suggest only',
  'voice.permissions.autonomous': 'Autonomous',
  'voice.permissions.matrixIntroMiddle':
    'means the assistant proposes an action — a human must confirm.',
  'voice.permissions.matrixIntroEnd': 'allows execution without confirmation.',
  'voice.permissions.enableAutonomous': 'Enable autonomous mode?',
  'voice.permissions.confirmAutonomous': 'Confirm autonomous',
  'voice.permissions.save': 'Save permissions',
  'voice.permissions.outboundDisabled':
    'Outbound telephony is disabled. Customer and vendor contact cannot be set to autonomous until enabled in Telephony.',

  'voice.selector.loadingVoices': 'Loading voices from ElevenLabs…',
  'voice.selector.providerElevenLabs': 'Provider: ElevenLabs',
  'voice.selector.selectVoice': 'Select a voice',

  'voice.launch.title': 'Launch checklist',
  'voice.launch.subtitle': 'Pre-flight validation before activating your voice assistant.',
  'voice.launch.required': '{complete}/{total} required',
  'voice.launch.optional': 'Optional',
  'voice.launch.fixIn': 'Fix in {tab}',

  'voice.availability.timezoneExample': 'Europe/Berlin',

  'voice.nav.group.setup': 'Setup',
  'voice.nav.group.operate': 'Operate',
  'voice.nav.group.improve': 'Improve',
  'voice.nav.tab.overview': 'Overview',
  'voice.nav.tab.config': 'Configuration',
  'voice.nav.tab.permissions': 'Permissions',
  'voice.nav.tab.escalation': 'Escalation',
  'voice.nav.tab.telephony': 'Telephony',
  'voice.nav.tab.test': 'Test Center',
  'voice.nav.tab.logs': 'Conversations',
  'voice.nav.tab.analytics': 'Analytics',
  'voice.nav.tab.knowledge': 'Knowledge Health',

  'voice.status.operator.active': 'Active',
  'voice.status.operator.ready': 'Ready',
  'voice.status.operator.inactive': 'Inactive',
  'voice.status.operator.degraded': 'Degraded',
  'voice.status.operator.error': 'Error',
  'voice.status.operator.draft': 'Draft',
  'voice.status.provider.error': 'Error',
  'voice.status.provider.degraded': 'Degraded',
  'voice.status.provider.notConfigured': 'Not configured',
  'voice.status.provider.connected': 'Connected',
  'voice.status.provider.twilioNotConfigured': 'Twilio not configured',
  'voice.status.provider.diagnosticPstn': 'Diagnostic PSTN only',
  'voice.status.provider.unknown': 'Unknown',
  'voice.status.telephony.disabled': 'Disabled',
  'voice.status.telephony.numberAssigned': 'Number assigned',
  'voice.status.telephony.notConnected': 'Not connected',
  'voice.status.lastCall.notAvailable': 'Not available',
  'voice.status.lastCall.noCalls': 'No calls yet',

  'voice.checklist.identity.label': 'Assistant identity',
  'voice.checklist.identity.description':
    'Name and role communicate who callers are speaking with.',
  'voice.checklist.voice.label': 'Voice selected',
  'voice.checklist.voice.description': 'Pick an ElevenLabs voice that matches your brand tone.',
  'voice.checklist.greeting.label': 'Greeting set',
  'voice.checklist.greeting.description': 'First spoken message when a caller connects.',
  'voice.checklist.systemPrompt.label': 'System prompt complete',
  'voice.checklist.systemPrompt.description': 'Core instructions that govern assistant behavior.',
  'voice.checklist.escalation.label': 'Escalation configured',
  'voice.checklist.escalation.description':
    'Human handover number or fallback message for edge cases.',
  'voice.checklist.elevenlabs.label': 'ElevenLabs connected',
  'voice.checklist.elevenlabs.description': 'Provider API must be configured on the server.',
  'voice.checklist.agentProvisioned.label': 'Agent provisioned',
  'voice.checklist.agentProvisioned.description':
    'Activate once to create or update the remote agent.',
  'voice.checklist.telephony.label': 'Telephony ready',
  'voice.checklist.telephony.description': 'Inbound number linked when telephony is enabled.',
  'voice.checklist.testCall.label': 'Test call passed',
  'voice.checklist.testCall.description': 'Run a signed test session before going live.',

  'voice.telephony.setup.title': 'Telephony setup',
  'voice.telephony.setup.checkingStatus': 'Checking status…',
  'voice.telephony.refreshStatus': 'Refresh status',
  'voice.telephony.openTestCenter': 'Open Test Center',
  'voice.telephony.stepStatus.complete': 'Complete',
  'voice.telephony.stepStatus.inProgress': 'In progress',
  'voice.telephony.stepStatus.pending': 'Pending',
  'voice.telephony.stepStatus.warning': 'Warning',
  'voice.telephony.step.provider.title': 'Provider connection',
  'voice.telephony.step.provider.description':
    'ElevenLabs must be configured on the SynqDrive server.',
  'voice.telephony.step.provider.connected':
    'ElevenLabs API is connected. Phone numbers can be loaded from your provider account.',
  'voice.telephony.step.provider.notConnected':
    'Provider not connected — ask your administrator to set ELEVENLABS_API_KEY on the server.',
  'voice.telephony.step.agent.title': 'Agent provisioning',
  'voice.telephony.step.agent.description':
    'A conversational agent must exist before linking a phone number.',
  'voice.telephony.step.agent.idLabel': 'Agent ID:',
  'voice.telephony.step.agent.notProvisioned':
    'No agent provisioned yet. Complete readiness checks and activate the assistant from the command center header.',
  'voice.telephony.step.phone.description':
    'Select a number from ElevenLabs and assign it to this assistant.',
  'voice.telephony.step.phone.connectProviderFirst': 'Connect the provider first.',
  'voice.telephony.step.phone.provisionAgentFirst':
    'Provision the agent before assigning a number.',
  'voice.telephony.step.phone.loadingNumbers': 'Loading provider numbers…',
  'voice.telephony.step.phone.noNumbers':
    'No phone numbers found in your ElevenLabs account. Import or purchase numbers in ElevenLabs, then refresh.',
  'voice.telephony.step.phone.assigned': 'Assigned: {number}',
  'voice.telephony.step.phone.numberLinked': 'Number linked',
  'voice.telephony.step.phone.unassign': 'Unassign number',
  'voice.telephony.step.phone.selectPlaceholder': 'Select a phone number',
  'voice.telephony.step.phone.optionCurrent': '(current)',
  'voice.telephony.step.phone.optionOtherAgent': '(other agent)',
  'voice.telephony.step.phone.assigning': 'Assigning…',
  'voice.telephony.step.phone.assign': 'Assign to assistant',
  'voice.telephony.error.loadNumbers': 'Failed to load phone numbers',
  'voice.telephony.error.refresh': 'Refresh failed',
  'voice.telephony.error.assign': 'Assign failed',
  'voice.telephony.step.inbound.title': 'Inbound calls',
  'voice.telephony.step.inbound.description': 'Accept incoming calls on the assigned number.',
  'voice.telephony.step.inbound.warningNoNumber':
    'Warning: inbound is enabled but no phone number is assigned.',
  'voice.telephony.toggle.inbound.label': 'Inbound enabled',
  'voice.telephony.toggle.inbound.hintAssigned':
    'Callers can reach this assistant on the assigned number.',
  'voice.telephony.toggle.inbound.hintNoNumber': 'Assign a phone number first.',
  'voice.telephony.toggle.telephony.label': 'Telephony enabled',
  'voice.telephony.toggle.telephony.hint': 'Master switch for phone live mode.',
  'voice.telephony.step.outbound.title': 'Outbound calls',
  'voice.telephony.step.outbound.description':
    'Allow the assistant to initiate calls — higher cost and compliance risk.',
  'voice.telephony.outbound.confirmTitle': 'Enable outbound telephony?',
  'voice.telephony.outbound.confirmBody':
    'Outbound calls may incur provider charges and require permission guardrails. Customer and vendor contact capabilities should remain on suggest-only unless explicitly approved.',
  'voice.telephony.outbound.confirmAction': 'I understand — enable outbound',
  'voice.telephony.toggle.outbound.label': 'Outbound enabled',
  'voice.telephony.toggle.outbound.hint':
    'Strongly recommended only with suggest-only contact permissions and monitoring.',
  'voice.telephony.step.test.title': 'Test',
  'voice.telephony.step.test.description': 'Validate the assistant before going live on phone.',
  'voice.telephony.step.test.body':
    'Run a signed test session in the Test Center — no phone charges apply.',

  'voice.test.subtitle':
    'Validate greeting, tone, escalation, and permissions before going live on phone.',
  'voice.test.readinessChip': 'Readiness {pct}%',
  'voice.test.readinessGaps': 'Readiness gaps',
  'voice.test.readinessIncomplete': 'Some checks are incomplete.',
  'voice.test.phase.active': 'Session active',
  'voice.test.phase.starting': 'Starting…',
  'voice.test.phase.expired': 'Session expired',
  'voice.test.phase.blocked': 'Blocked — fix configuration',
  'voice.test.phase.ready': 'Ready to test',
  'voice.test.row.provider': 'Provider',
  'voice.test.row.agent': 'Agent',
  'voice.test.row.voice': 'Voice',
  'voice.test.row.notProvisioned': 'Not provisioned',
  'voice.test.row.notSet': 'Not set',
  'voice.test.startSession': 'Start test session',
  'voice.test.startingSession': 'Starting session…',
  'voice.test.stopReset': 'Stop / reset',
  'voice.test.sessionExpired':
    'Test session expired. Start a new session to continue testing.',
  'voice.test.expiresAt': 'Expires {time}',
  'voice.test.micUnsupported':
    'Microphone not supported in this browser — live voice testing may be unavailable.',
  'voice.test.micUnsupportedStart':
    'Microphone access is not supported in this browser. Try Chrome or Edge on desktop.',
  'voice.test.startSessionError': 'Could not start test session',
  'voice.test.agentNotProvisioned.title': 'Agent not provisioned',
  'voice.test.agentNotProvisioned.description':
    'Activate the assistant from the command center to create an ElevenLabs agent before testing.',
  'voice.test.openLaunchChecklist': 'Open launch checklist',
  'voice.test.scenarios.title': 'Test scenarios',
  'voice.test.scenarios.subtitle':
    'Select a scenario to define expected behavior. No automated simulation — use it as an operator script.',
  'voice.test.scenarios.current': 'Current test scenario',
  'voice.test.scenarios.expectedBehavior': 'Expected behavior',
  'voice.test.scenarios.escalateWhen': 'Escalate when',
  'voice.test.scenarios.permissionsInvolved': 'Permissions involved: {permissions}',
  'voice.test.scenarios.reviewIn': 'Review in {tab} →',
  'voice.test.live.title': 'Live session',
  'voice.test.live.subtitle':
    'Real-time transcript and tool-policy decisions will appear here when live integration is enabled.',
  'voice.test.live.transcript': 'Live transcript',
  'voice.test.live.waitingStream': 'Waiting for live stream…',
  'voice.test.live.assistantResponse': 'Assistant response',
  'voice.test.live.noResponse': 'No response yet',
  'voice.test.live.detectedIntent': 'Detected intent',
  'voice.test.live.toolPolicy': 'Tool policy decision',
  'voice.test.live.escalationTriggered': 'Escalation triggered',
  'voice.test.live.latency': 'Latency',
  'voice.test.live.no': 'No',
  'voice.test.live.dash': '—',
  'voice.test.live.noActiveSession.title': 'No active session',
  'voice.test.live.noActiveSession.description':
    'Start a test session to see transcript and policy panels.',
  'voice.test.result.title': 'Test result',
  'voice.test.result.subtitle':
    'Record your operator verdict locally. Results are not saved to the server yet.',
  'voice.test.verdict.passed': 'Passed',
  'voice.test.verdict.needsReview': 'Needs review',
  'voice.test.verdict.failed': 'Failed',
  'voice.test.notesPlaceholder': 'Notes: what worked, what failed, escalation issues…',
  'voice.test.navTo': '→ {tab}',

  'voice.test.scenario.bookVehicle.title': 'Customer wants to book a vehicle',
  'voice.test.scenario.bookVehicle.prompt': 'I would like to rent a car for next weekend.',
  'voice.test.scenario.bookVehicle.expected.0':
    'Answer general questions about availability and process.',
  'voice.test.scenario.bookVehicle.expected.1':
    'May suggest creating a booking draft if permission allows.',
  'voice.test.scenario.bookVehicle.expected.2':
    'Must not quote binding prices without tariff data.',
  'voice.test.scenario.bookVehicle.escalate.0':
    'Customer insists on immediate confirmation with special terms.',
  'voice.test.scenario.bookVehicle.permission.0': 'Answer general questions',
  'voice.test.scenario.bookVehicle.permission.1': 'Create booking draft (suggest only)',

  'voice.test.scenario.modifyBooking.title': 'Customer wants to change a booking',
  'voice.test.scenario.modifyBooking.prompt': 'I need to move my reservation to another date.',
  'voice.test.scenario.modifyBooking.expected.0':
    'Search for the booking if lookup is enabled.',
  'voice.test.scenario.modifyBooking.expected.1':
    'Explain that changes require staff review unless autonomous modify is explicitly allowed.',
  'voice.test.scenario.modifyBooking.escalate.0':
    'Modification affects pricing, vehicle class, or same-day change.',
  'voice.test.scenario.modifyBooking.permission.0': 'Booking search',
  'voice.test.scenario.modifyBooking.permission.1': 'Modify booking (suggest only)',

  'voice.test.scenario.cancelBooking.title': 'Customer wants to cancel',
  'voice.test.scenario.cancelBooking.prompt': 'Please cancel my booking and refund me.',
  'voice.test.scenario.cancelBooking.expected.0':
    'Acknowledge the request and explain cancellation policy.',
  'voice.test.scenario.cancelBooking.expected.1': 'Must not confirm cancellation autonomously.',
  'voice.test.scenario.cancelBooking.escalate.0':
    'Always — cancellation requires human approval.',
  'voice.test.scenario.cancelBooking.permission.0': 'Cancel booking (disabled by default)',

  'voice.test.scenario.breakdown.title': 'Customer reports breakdown',
  'voice.test.scenario.breakdown.prompt': 'My rental car broke down on the highway.',
  'voice.test.scenario.breakdown.expected.0': 'Gather location and safety status.',
  'voice.test.scenario.breakdown.expected.1':
    'Open damage/breakdown case if permitted (suggest only).',
  'voice.test.scenario.breakdown.escalate.0':
    'Immediately if caller is in danger or on a live roadway.',
  'voice.test.scenario.breakdown.permission.0': 'Emergency escalation',
  'voice.test.scenario.breakdown.permission.1': 'Create damage case',

  'voice.test.scenario.accidentDamage.title': 'Customer reports accident / damage',
  'voice.test.scenario.accidentDamage.prompt':
    'I had a small accident and there is damage to the bumper.',
  'voice.test.scenario.accidentDamage.expected.0': 'Ensure caller safety first.',
  'voice.test.scenario.accidentDamage.expected.1':
    'Collect facts without assigning fault or legal advice.',
  'voice.test.scenario.accidentDamage.escalate.0':
    'Injuries, police involvement, or disputed liability.',
  'voice.test.scenario.accidentDamage.permission.0': 'Emergency escalation',
  'voice.test.scenario.accidentDamage.permission.1': 'Create damage case',

  'voice.test.scenario.priceQuote.title': 'Customer asks for price',
  'voice.test.scenario.priceQuote.prompt': 'How much would a week in a midsize car cost?',
  'voice.test.scenario.priceQuote.expected.0':
    'Explain that exact pricing depends on dates and vehicle class.',
  'voice.test.scenario.priceQuote.expected.1':
    'May provide indicative guidance only in suggest mode — never binding quotes.',
  'voice.test.scenario.priceQuote.escalate.0':
    'Customer needs a formal quote or contract terms.',
  'voice.test.scenario.priceQuote.permission.0': 'Quote prices (suggest only)',

  'voice.test.scenario.humanHandover.title': 'Customer wants a human',
  'voice.test.scenario.humanHandover.prompt': 'I want to speak to a real person please.',
  'voice.test.scenario.humanHandover.expected.0':
    'Acknowledge politely and initiate escalation flow.',
  'voice.test.scenario.humanHandover.escalate.0': 'Immediately on explicit human request.',
  'voice.test.scenario.humanHandover.permission.0': 'Emergency escalation',
  'voice.test.scenario.humanHandover.permission.1': 'Escalation on request',

  'voice.test.scenario.afterHours.title': 'Customer calls outside business hours',
  'voice.test.scenario.afterHours.prompt':
    'Hello, I am calling about my rental but I know it is late.',
  'voice.test.scenario.afterHours.expected.0': 'Play after-hours message if configured.',
  'voice.test.scenario.afterHours.expected.1':
    'Offer to take details or escalate per policy.',
  'voice.test.scenario.afterHours.escalate.0':
    'Emergency or safety issue regardless of hours.',
  'voice.test.scenario.afterHours.permission.0': 'Answer general questions',
} as const;
