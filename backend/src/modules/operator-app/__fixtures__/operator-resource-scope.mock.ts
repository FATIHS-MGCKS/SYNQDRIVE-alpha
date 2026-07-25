export function makeOperatorResourceScopeMock() {
  const bypassContext = {
    bypassScope: true,
    allowedStationIds: null,
    organizationId: 'org-1',
    fieldAgentAccess: true,
    permissions: null,
    membershipRole: null,
    userId: 'user-1',
  };
  return {
    resolve: jest.fn().mockResolvedValue(bypassContext),
    resolveStationFilter: jest.fn(),
    buildBookingListScopeWhere: jest.fn().mockReturnValue(null),
    buildTaskListScopeWhere: jest.fn().mockResolvedValue(null),
    assertBookingReadable: jest.fn(),
    assertBookingWritable: jest.fn(),
    assertTaskReadable: jest.fn(),
    assertTaskCompletable: jest.fn().mockReturnValue({ overrideApplied: false }),
    assertVehicleReadable: jest.fn().mockReturnValue({ overrideApplied: false }),
    assertFieldAgent: jest.fn(),
    validateHandoverActualStation: jest.fn(),
    recordScopeOverrideAudit: jest.fn().mockResolvedValue(undefined),
  };
}
