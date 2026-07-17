export type TwilioPhoneNumberRecord = {
  phoneNumberSid: string;
  phoneNumber: string | null;
  friendlyName: string | null;
  voiceUrl: string | null;
  statusCallback: string | null;
};

export type TwilioInboundCallContext = {
  callSid: string;
  from: string;
  to: string;
  direction: string;
  accountSid?: string;
};

export type TwilioStatusCallbackContext = {
  callSid: string;
  callStatus: string;
  from: string;
  to: string;
  duration?: string;
  direction?: string;
};
