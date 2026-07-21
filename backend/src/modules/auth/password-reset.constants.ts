export const PASSWORD_RESET_REQUEST_NEUTRAL = {
  status: 'accepted' as const,
  message:
    'If an account exists for this request, password reset instructions will be sent to the verified email address.',
};

export const PASSWORD_RESET_TTL_MINUTES = parseInt(
  process.env.PASSWORD_RESET_TTL_MINUTES || '60',
  10,
);

export const PASSWORD_RESET_RATE_LIMITS = {
  ipPerHour: parseInt(process.env.PASSWORD_RESET_IP_LIMIT_PER_HOUR || '10', 10),
  emailPerHour: parseInt(
    process.env.PASSWORD_RESET_EMAIL_LIMIT_PER_HOUR || '5',
    10,
  ),
  orgPerHour: parseInt(
    process.env.PASSWORD_RESET_ORG_LIMIT_PER_HOUR || '20',
    10,
  ),
} as const;

export type PasswordResetRateScope = 'IP' | 'EMAIL' | 'ORGANIZATION';
