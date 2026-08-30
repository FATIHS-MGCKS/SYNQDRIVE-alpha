import { toast } from 'sonner';

/** Positive fixture: toast host copy */
export function BadToastLiteral() {
  return (
    <button
      type="button"
      onClick={() => toast.success('Speichern fehlgeschlagen')}
    >
      X
    </button>
  );
}
