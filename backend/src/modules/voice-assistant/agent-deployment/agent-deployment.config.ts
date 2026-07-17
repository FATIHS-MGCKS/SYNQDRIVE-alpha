export function isAgentDeploymentStagingEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.VOICE_AI_PROVISIONING_STAGING_ENABLED?.trim().toLowerCase() === 'true';
}
