import { useOperatorShell } from '../context/OperatorShellContext';
import { OperatorAiUploadSheet } from './OperatorAiUploadSheet';
import { OperatorTireMeasureSheet } from './OperatorTireMeasureSheet';
import { OperatorTaskSheet } from './OperatorTaskSheet';

export function OperatorActionSheets() {
  const { sheetAction } = useOperatorShell();
  if (!sheetAction) return null;
  if (sheetAction.type === 'ai-upload') {
    return <OperatorAiUploadSheet action={sheetAction} />;
  }
  if (sheetAction.type === 'task-create' || sheetAction.type === 'task-detail') {
    return <OperatorTaskSheet action={sheetAction} />;
  }
  return <OperatorTireMeasureSheet action={sheetAction} />;
}
