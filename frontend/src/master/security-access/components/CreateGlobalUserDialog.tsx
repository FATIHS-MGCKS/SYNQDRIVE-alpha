import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog';
import { api } from '../../../lib/api';
import { useSecurityAccessPresentation } from '../useSecurityAccessPresentation';

const INPUT =
  'w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm outline-none focus:border-ring';

export interface CreateGlobalUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (userId: string) => void;
}

export function CreateGlobalUserDialog({ open, onOpenChange, onCreated }: CreateGlobalUserDialogProps) {
  const { t } = useSecurityAccessPresentation();
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setEmail('');
    setFirstName('');
    setLastName('');
    setSubmitting(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      toast.error(t('master.securityAccess.users.create.validationEmail'));
      return;
    }
    if (!firstName.trim() && !lastName.trim()) {
      toast.error(t('master.securityAccess.users.create.validationName'));
      return;
    }
    setSubmitting(true);
    try {
      const result = await api.admin.securityAccess.createUser({
        email: normalizedEmail,
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
      });
      toast.success(t('master.securityAccess.users.create.success'));
      onCreated(result.user.id);
      reset();
      onOpenChange(false);
    } catch (err: unknown) {
      const code =
        err && typeof err === 'object' && 'code' in err
          ? String((err as { code?: string }).code)
          : '';
      if (code === 'IDENTITY_ALREADY_EXISTS' || (err as { status?: number })?.status === 409) {
        toast.error(t('master.securityAccess.users.create.conflict'));
      } else {
        toast.error(t('master.securityAccess.users.create.failed'));
      }
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md" data-testid="create-global-user-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-4 w-4" />
            {t('master.securityAccess.users.create.title')}
          </DialogTitle>
          <DialogDescription>{t('master.securityAccess.users.create.description')}</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={(e) => void handleSubmit(e)}>
          <label className="block space-y-1 text-xs">
            <span className="font-medium text-muted-foreground">{t('master.securityAccess.users.create.email')}</span>
            <input
              type="email"
              className={INPUT}
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
              autoComplete="off"
              data-testid="create-user-email"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block space-y-1 text-xs">
              <span className="font-medium text-muted-foreground">
                {t('master.securityAccess.users.create.firstName')}
              </span>
              <input
                type="text"
                className={INPUT}
                value={firstName}
                onChange={(ev) => setFirstName(ev.target.value)}
                data-testid="create-user-first-name"
              />
            </label>
            <label className="block space-y-1 text-xs">
              <span className="font-medium text-muted-foreground">
                {t('master.securityAccess.users.create.lastName')}
              </span>
              <input
                type="text"
                className={INPUT}
                value={lastName}
                onChange={(ev) => setLastName(ev.target.value)}
                data-testid="create-user-last-name"
              />
            </label>
          </div>
          <DialogFooter className="gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              {t('master.securityAccess.users.create.cancel')}
            </Button>
            <Button type="submit" disabled={submitting} data-testid="create-user-submit">
              {t('master.securityAccess.users.create.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}