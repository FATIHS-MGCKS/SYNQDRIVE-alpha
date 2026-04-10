export const LATEST_DTC_QUERY = `
  query GetLatestDTCs($tokenId: Int!) {
    signalsLatest(tokenId: $tokenId, signals: [obdDTCList]) {
      timestamp
      signal
      value
    }
  }
`;
