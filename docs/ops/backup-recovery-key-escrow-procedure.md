# Backup Recovery Key Escrow Procedure

**Finding context:** `MA-BKP-P0-002` / `MA-BKP-P1-001`  
**Recipient:** `backup@synqdrive.eu`  
**Fingerprint:** `D50BCE8EB4A747F582B9D9C37439FE8C4034183A`

## Rules

- Production VPS holds **public key only** (`GNUPGHOME=/opt/synqdrive/shared/gpg-backup`).
- Private recovery key must live in an **independent** secure store (password manager, encrypted offline media, HSM).
- Never commit, log, chat, or document private key material.

## Operator steps

1. Choose a strong escrow passphrase and store it in your password manager.
2. Add `BACKUP_RECOVERY_ESCROW_PASSPHRASE` to Cursor Cloud Agent secrets (Runtime Secret) **or** export from your secure workstation.
3. On a machine that holds the private key (NOT production):

```bash
export GNUPGHOME=/path/to/recovery-keyring
export BACKUP_RECOVERY_ESCROW_PASSPHRASE='(from password manager)'
bash backend/scripts/ops/vps-export-backup-recovery-escrow.sh
```

4. Store the output `backup-recovery-private-key-escrow.gpg` in your password manager file vault or encrypted offline backup.
5. Optionally upload the encrypted escrow bundle to offsite path `recovery-escrow/` (still requires passphrase to decrypt).
6. Verify production has zero secret keys:

```bash
sudo GNUPGHOME=/opt/synqdrive/shared/gpg-backup gpg --list-secret-keys
# Expected: no output / 0 secret keys
```

## Restore (disaster)

1. Retrieve escrow bundle + passphrase from password manager.
2. In isolated recovery environment:

```bash
gpg --decrypt backup-recovery-private-key-escrow.gpg | gpg --import
export GNUPGHOME=/path/to/recovery-keyring
gpg --decrypt backup.dump.gpg > backup.dump
pg_restore --list backup.dump
```

3. Remove temporary keyring after drill.

## Acceptance checklist

- [ ] Encrypted escrow bundle stored outside production
- [ ] Operator knows storage location
- [ ] Fingerprint matches `D50BCE8EB4A747F582B9D9C37439FE8C4034183A`
- [ ] Production `gpg --list-secret-keys` → 0
- [ ] Repository contains public key only (`keys/synqdrive-backup-recovery.pub.asc`)

---

## Escrow status (2026-08-18 UTC)

| Check | Result |
|-------|--------|
| Recipient | `backup@synqdrive.eu` |
| Fingerprint | `D50BCE8EB4A747F582B9D9C37439FE8C4034183A` |
| Ephemeral agent secret key (`GNUPGHOME=/tmp/synqdrive-backup-keygen`) | **Present** (1 `sec`) |
| `BACKUP_RECOVERY_ESCROW_PASSPHRASE` Runtime Secret | **Not set** — export blocked |
| Escrow artifact `backup-recovery-private-key-escrow.gpg` | **Not created** |
| Export | **PENDING** — awaiting operator passphrase |
| Production secret keys | **0** |
| Repository private key material | **None** |

**Operator action:** Add `BACKUP_RECOVERY_ESCROW_PASSPHRASE` to Cursor Cloud Agents → Secrets (Runtime Secret), then re-run escrow export. Ephemeral keyring must remain until operator confirms secure storage of the encrypted bundle.
