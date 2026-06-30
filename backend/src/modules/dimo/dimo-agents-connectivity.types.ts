export interface DimoAgentsConnectivityDnsProbe {
  ok: boolean;
  errorCode?: string;
  errorMessage?: string;
}

export interface DimoAgentsConnectivityHttpProbe {
  ok: boolean;
  skipped?: boolean;
  statusCode?: number;
  service?: string;
  status?: string;
  version?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface DimoAgentsConnectivityResult {
  ok: boolean;
  baseUrl: string;
  hostname: string;
  dns: DimoAgentsConnectivityDnsProbe;
  http: DimoAgentsConnectivityHttpProbe;
  hint?: string;
}
