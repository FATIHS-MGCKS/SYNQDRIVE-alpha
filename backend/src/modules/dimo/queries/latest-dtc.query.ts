export const LATEST_DTC_QUERY = `
  query GetLatestDTCs($tokenId: Int!) {
    signalsLatest(tokenId: $tokenId) {
      obdDTCList { timestamp value }
    }
  }
`;
