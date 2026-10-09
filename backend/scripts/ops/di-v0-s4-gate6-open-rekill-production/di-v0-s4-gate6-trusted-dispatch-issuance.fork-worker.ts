
      const { finalizeTrustedDispatchIssuanceSpendForLiveOpen } = require('./di-v0-s4-gate6-trusted-dispatch-issuance.lib');
      const nonce = process.env.GATE6_TEST_NONCE;
      const r = finalizeTrustedDispatchIssuanceSpendForLiveOpen(process.env, nonce);
      process.stdout.write(r.ok ? 'OK' : r.failure);
    