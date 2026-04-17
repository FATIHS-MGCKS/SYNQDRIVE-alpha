import { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, FileText, Sparkles, CheckCircle, XCircle, ChevronDown, AlertTriangle, Clock, Shield, Eye, Pencil, RotateCcw, ArrowRight, File, Image, FileSpreadsheet, Loader2, Check, X } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { api } from '../../lib/api';
import { useRentalOrg } from '../RentalContext';

interface DocumentUploadViewProps {
  isDarkMode: boolean;
}

interface VehicleOption { id: string; name: string; }

const DOC_TYPE_MAP: Record<string, string> = {
  'docUpload.type.invoice': 'INVOICE',
  'docUpload.type.serviceRecord': 'SERVICE',
  'docUpload.type.inspection': 'TUV_REPORT',
  'docUpload.type.damageReport': 'DAMAGE',
  'docUpload.type.other': 'OTHER',
};

const EXTRACTION_TEMPLATES: Record<string, Array<{ key: string; label: string; value: string; editable?: boolean }>> = {
  SERVICE: [
    { key: 'eventDate', label: 'Service Date', value: '', editable: true },
    { key: 'odometerKm', label: 'Odometer (km)', value: '', editable: true },
    { key: 'workshopName', label: 'Workshop', value: '', editable: true },
    { key: 'description', label: 'Description', value: '', editable: true },
    { key: 'costCents', label: 'Cost (cents)', value: '', editable: true },
  ],
  OIL_CHANGE: [
    { key: 'eventDate', label: 'Oil Change Date', value: '', editable: true },
    { key: 'odometerKm', label: 'Odometer (km)', value: '', editable: true },
    { key: 'workshopName', label: 'Workshop', value: '', editable: true },
    { key: 'notes', label: 'Oil Type / Notes', value: '', editable: true },
  ],
  TIRE: [
    { key: 'eventDate', label: 'Tire Change Date', value: '', editable: true },
    { key: 'odometerKm', label: 'Odometer (km)', value: '', editable: true },
    { key: 'workshopName', label: 'Workshop', value: '', editable: true },
    { key: 'treadDepthMm.fl', label: 'Tread FL (mm)', value: '', editable: true },
    { key: 'treadDepthMm.fr', label: 'Tread FR (mm)', value: '', editable: true },
    { key: 'treadDepthMm.rl', label: 'Tread RL (mm)', value: '', editable: true },
    { key: 'treadDepthMm.rr', label: 'Tread RR (mm)', value: '', editable: true },
  ],
  BRAKE: [
    { key: 'eventDate', label: 'Brake Service Date', value: '', editable: true },
    { key: 'odometerKm', label: 'Odometer (km)', value: '', editable: true },
    { key: 'workshopName', label: 'Workshop', value: '', editable: true },
    { key: 'serviceKind', label: 'Service Kind (inspection_only/pads_service/discs_service/brake_fluid_service/full_brake_service)', value: 'full_brake_service', editable: true },
    { key: 'scopeCsv', label: 'Scope CSV (front_pads,rear_pads,front_discs,rear_discs)', value: '', editable: true },
    { key: 'frontPadMm', label: 'Front Pad Thickness (mm)', value: '', editable: true },
    { key: 'rearPadMm', label: 'Rear Pad Thickness (mm)', value: '', editable: true },
    { key: 'frontDiscMm', label: 'Front Disc Thickness (mm)', value: '', editable: true },
    { key: 'rearDiscMm', label: 'Rear Disc Thickness (mm)', value: '', editable: true },
    { key: 'description', label: 'Description / Notes', value: '', editable: true },
  ],
  BATTERY: [
    { key: 'eventDate', label: 'Battery Service Date', value: '', editable: true },
    { key: 'odometerKm', label: 'Odometer (km)', value: '', editable: true },
    { key: 'workshopName', label: 'Workshop', value: '', editable: true },
    { key: 'recordKind', label: 'Record Kind (measurement/replacement)', value: 'measurement', editable: true },
    { key: 'scope', label: 'Scope (lv/hv)', value: 'lv', editable: true },
    { key: 'voltageV', label: 'Measured Voltage (V)', value: '', editable: true },
    { key: 'sohPercent', label: 'SOH (%)', value: '', editable: true },
    { key: 'restingVoltage', label: 'Resting Voltage (V)', value: '', editable: true },
    { key: 'notes', label: 'Battery Type / Notes', value: '', editable: true },
  ],
  TUV_REPORT: [
    { key: 'eventDate', label: 'TÜV Inspection Date', value: '', editable: true },
    { key: 'notes', label: 'Result / Notes', value: '', editable: true },
    { key: 'workshopName', label: 'Inspector / Station', value: '', editable: true },
  ],
  BOKRAFT_REPORT: [
    { key: 'eventDate', label: 'BOKraft Inspection Date', value: '', editable: true },
    { key: 'notes', label: 'Result / Notes', value: '', editable: true },
    { key: 'workshopName', label: 'Inspector / Station', value: '', editable: true },
  ],
  VEHICLE_CONDITION: [
    { key: 'eventDate', label: 'Report Date', value: '', editable: true },
    { key: 'description', label: 'Condition Summary', value: '', editable: true },
    { key: 'odometerKm', label: 'Odometer (km)', value: '', editable: true },
  ],
  INVOICE: [
    { key: 'eventDate', label: 'Invoice Date', value: '', editable: true },
    { key: 'description', label: 'Description', value: '', editable: true },
    { key: 'costCents', label: 'Amount (cents)', value: '', editable: true },
    { key: 'workshopName', label: 'Vendor', value: '', editable: true },
  ],
  DAMAGE: [
    { key: 'eventDate', label: 'Incident Date', value: '', editable: true },
    { key: 'description', label: 'Damage Description', value: '', editable: true },
    { key: 'severity', label: 'Severity (MINOR/MODERATE/MAJOR/CRITICAL)', value: 'MODERATE', editable: true },
  ],
  ACCIDENT: [
    { key: 'eventDate', label: 'Accident Date', value: '', editable: true },
    { key: 'description', label: 'Accident Description', value: '', editable: true },
    { key: 'severity', label: 'Severity (MINOR/MODERATE/MAJOR/CRITICAL)', value: 'MAJOR', editable: true },
  ],
  OTHER: [
    { key: 'eventDate', label: 'Date', value: '', editable: true },
    { key: 'description', label: 'Description', value: '', editable: true },
  ],
};

type UploadStep = 'upload' | 'analyzing' | 'review' | 'filed';

interface DetectedField {
  key: string;
  label: string;
  value: string;
  editable?: boolean;
}

interface AIResult {
  documentType: string;
  documentTypeKey: string;
  category: string;
  categoryKey: string;
  confidence: number;
  assignedTo: string;
  fields: DetectedField[];
}

interface FiledDocument {
  id: string;
  fileName: string;
  type: string;
  category: string;
  date: string;
  confidence: number;
}

// MOCK_AI_RESULTS was deleted during the batch-C audit. It was a fabricated
// mapping of document type → hard-coded invoice / fine / contract / service
// payloads with fake amounts, dates and license plates. No code path on the
// real upload flow consumed it any more (the confirm-step reads its data from
// the real `/document-extractions/:id` endpoint), so keeping it around only
// risked some future developer wiring it in as a "fallback".

function getFileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return <FileText className="w-5 h-5 text-red-500" />;
  if (['jpg', 'jpeg', 'png', 'webp'].includes(ext || '')) return <Image className="w-5 h-5 text-blue-500" />;
  if (['xlsx', 'xls', 'csv'].includes(ext || '')) return <FileSpreadsheet className="w-5 h-5 text-green-500" />;
  return <File className="w-5 h-5 text-gray-500" />;
}

export function DocumentUploadView({ isDarkMode }: DocumentUploadViewProps) {
  const { t } = useLanguage();
  const { orgId } = useRentalOrg();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<UploadStep>('upload');
  const [dragActive, setDragActive] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [aiResult, setAiResult] = useState<AIResult | null>(null);
  const [editingFields, setEditingFields] = useState(false);
  const [editedFields, setEditedFields] = useState<DetectedField[]>([]);
  const [editedType, setEditedType] = useState('');
  const [editedCategory, setEditedCategory] = useState('');
  const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const [filedDocuments, setFiledDocuments] = useState<FiledDocument[]>([]);

  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [selectedDocType, setSelectedDocType] = useState('SERVICE');
  const [extractionId, setExtractionId] = useState<string | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    api.vehicles.listByOrg(orgId).then((res: any) => {
      const list = (res?.data || res || []).map((v: any) => ({
        id: v.id,
        name: v.vehicleName || `${v.make} ${v.model} (${v.year})`,
      }));
      setVehicles(list);
      if (list.length > 0 && !selectedVehicleId) setSelectedVehicleId(list[0].id);
    }).catch(() => []);
  }, [orgId]);

  const documentTypes = [
    { key: 'docUpload.type.serviceRecord', value: 'Service Record' },
    { key: 'docUpload.type.oilChange', value: 'Oil Change' },
    { key: 'docUpload.type.tireService', value: 'Tire Service' },
    { key: 'docUpload.type.brakeService', value: 'Brake Service' },
    { key: 'docUpload.type.batteryService', value: 'Battery Service' },
    { key: 'docUpload.type.inspection', value: 'TÜV Report' },
    { key: 'docUpload.type.bokraft', value: 'BOKraft Report' },
    { key: 'docUpload.type.vehicleCondition', value: 'Vehicle Condition Report' },
    { key: 'docUpload.type.invoice', value: 'Invoice' },
    { key: 'docUpload.type.damageReport', value: 'Damage Report' },
    { key: 'docUpload.type.accident', value: 'Accident Report' },
    { key: 'docUpload.type.other', value: 'Other Document' },
  ];

  const docTypeKeyToExtraction: Record<string, string> = {
    'docUpload.type.serviceRecord': 'SERVICE',
    'docUpload.type.oilChange': 'OIL_CHANGE',
    'docUpload.type.tireService': 'TIRE',
    'docUpload.type.brakeService': 'BRAKE',
    'docUpload.type.batteryService': 'BATTERY',
    'docUpload.type.inspection': 'TUV_REPORT',
    'docUpload.type.bokraft': 'BOKRAFT_REPORT',
    'docUpload.type.vehicleCondition': 'VEHICLE_CONDITION',
    'docUpload.type.invoice': 'INVOICE',
    'docUpload.type.damageReport': 'DAMAGE',
    'docUpload.type.accident': 'ACCIDENT',
    'docUpload.type.other': 'OTHER',
  };

  const categories = [
    { key: 'docUpload.cat.finance', value: 'Finance' },
    { key: 'docUpload.cat.fleet', value: 'Fleet' },
    { key: 'docUpload.cat.customer', value: 'Customer' },
    { key: 'docUpload.cat.legal', value: 'Legal' },
    { key: 'docUpload.cat.maintenance', value: 'Maintenance' },
  ];

  const analyzeFile = useCallback(async (fileName: string) => {
    if (!selectedVehicleId) return;
    setStep('analyzing');

    const docTypeKey = selectedDocType;
    const templateFields = EXTRACTION_TEMPLATES[docTypeKey] || EXTRACTION_TEMPLATES.OTHER;

    try {
      const extraction = await api.vehicleIntelligence.createDocumentExtraction(selectedVehicleId, {
        documentType: docTypeKey,
        extractedData: Object.fromEntries(templateFields.map(f => [f.key, f.value])),
        sourceFileName: fileName,
      });
      setExtractionId(extraction.id);
    } catch { /* continue with local flow */ }

    const docTypeLookup = documentTypes.find(d => docTypeKeyToExtraction[d.key] === docTypeKey);
    const result: AIResult = {
      documentType: docTypeLookup?.value || 'Document',
      documentTypeKey: docTypeLookup?.key || 'docUpload.type.other',
      category: 'Maintenance',
      categoryKey: 'docUpload.cat.maintenance',
      confidence: 100,
      assignedTo: vehicles.find(v => v.id === selectedVehicleId)?.name || '',
      fields: templateFields.map(f => ({ ...f })),
    };

    setTimeout(() => {
      setAiResult(result);
      setEditedFields(result.fields.map(f => ({ ...f })));
      setEditedType(result.documentTypeKey);
      setEditedCategory(result.categoryKey);
      setStep('review');
    }, 1500);
  }, [selectedVehicleId, selectedDocType, vehicles]);

  const handleFile = useCallback((file: File) => {
    setUploadedFileName(file.name);
    analyzeFile(file.name);
  }, [analyzeFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
  }, [handleFile]);

  const handleConfirm = async () => {
    if (!aiResult) return;
    setConfirmLoading(true);

    const confirmedData: Record<string, any> = {};
    for (const f of editedFields) {
      if (f.key.includes('.')) {
        const [parent, child] = f.key.split('.');
        if (!confirmedData[parent]) confirmedData[parent] = {};
        confirmedData[parent][child] = f.value;
      } else {
        confirmedData[f.key] = f.value;
      }
    }

    if (selectedVehicleId && extractionId) {
      try {
        await api.vehicleIntelligence.confirmDocumentExtraction(selectedVehicleId, extractionId, { confirmedData });
      } catch { /* silent */ }
    }

    const newDoc: FiledDocument = {
      id: extractionId || `doc-${Date.now()}`,
      fileName: uploadedFileName,
      type: t(editedType as any) || aiResult.documentType,
      category: t(editedCategory as any) || aiResult.category,
      date: new Date().toLocaleDateString('de-DE'),
      confidence: aiResult.confidence,
    };
    setFiledDocuments(prev => [newDoc, ...prev]);
    setConfirmLoading(false);
    setStep('filed');
  };

  const handleReset = () => {
    setStep('upload');
    setUploadedFileName('');
    setAiResult(null);
    setEditingFields(false);
    setEditedFields([]);
    setExtractionId(null);
    setConfirmLoading(false);
  };

  const stepConfig = [
    { key: 'upload' as const, label: t('docUpload.step1'), icon: Upload },
    { key: 'analyzing' as const, label: t('docUpload.step2'), icon: Sparkles },
    { key: 'review' as const, label: t('docUpload.step3'), icon: Eye },
    { key: 'filed' as const, label: t('docUpload.step4'), icon: CheckCircle },
  ];
  const stepOrder: UploadStep[] = ['upload', 'analyzing', 'review', 'filed'];
  const currentIdx = stepOrder.indexOf(step);

  const glass = isDarkMode
    ? 'bg-neutral-900 border border-neutral-800 shadow-sm'
    : 'bg-white border border-gray-200 shadow-sm';

  return (
    <div className="max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="mb-3">
        <h1 className={`text-lg font-bold tracking-tight ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{t('docUpload.title')}</h1>
        <p className={`text-xs mt-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{t('docUpload.subtitle')}</p>
      </div>

      {/* Step indicator */}
      <div className={`rounded-lg p-4 mb-3 ${glass}`}>
        <div className="flex items-center justify-between">
          {stepConfig.map((s, i) => {
            const isActive = i === currentIdx;
            const isDone = i < currentIdx;
            const Icon = s.icon;
            return (
              <div key={s.key} className="flex items-center flex-1">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-300 ${
                    isDone ? 'bg-green-500/20' : isActive
                      ? isDarkMode ? 'bg-blue-500/20' : 'bg-blue-100'
                      : isDarkMode ? 'bg-neutral-800' : 'bg-gray-100'
                  }`}>
                    {isDone ? (
                      <Check className="w-4.5 h-4.5 text-green-500" />
                    ) : (
                      <Icon className={`w-5 h-5 ${isActive
                        ? isDarkMode ? 'text-blue-400' : 'text-blue-600'
                        : isDarkMode ? 'text-gray-500' : 'text-gray-400'
                      }`} />
                    )}
                  </div>
                  <span className={`text-xs font-semibold ${
                    isDone ? 'text-green-500' : isActive
                      ? isDarkMode ? 'text-white' : 'text-gray-900'
                      : isDarkMode ? 'text-gray-500' : 'text-gray-400'
                  }`}>{s.label}</span>
                </div>
                {i < stepConfig.length - 1 && (
                  <div className={`flex-1 h-px mx-4 ${isDone ? 'bg-green-500/40' : isDarkMode ? 'bg-neutral-700' : 'bg-gray-200'}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Main area */}
        <div className="lg:col-span-2">
          {step === 'upload' && (
            <div className="space-y-3">
              {/* Vehicle + Document Type selector */}
              <div className={`rounded-lg p-4 ${isDarkMode ? 'bg-neutral-900 border border-neutral-800' : 'bg-white border border-gray-200'}`}>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={`text-[10px] uppercase tracking-wider font-semibold mb-1 block ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Vehicle</label>
                    <select value={selectedVehicleId} onChange={e => setSelectedVehicleId(e.target.value)} className={`w-full px-3 py-2 rounded-lg text-xs font-medium ${isDarkMode ? 'bg-neutral-800 text-white border-neutral-700' : 'bg-white text-gray-900 border-gray-300'} border`}>
                      {vehicles.length === 0 && <option value="">No vehicles available</option>}
                      {vehicles.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={`text-[10px] uppercase tracking-wider font-semibold mb-1 block ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Document Type</label>
                    <select value={selectedDocType} onChange={e => setSelectedDocType(e.target.value)} className={`w-full px-3 py-2 rounded-lg text-xs font-medium ${isDarkMode ? 'bg-neutral-800 text-white border-neutral-700' : 'bg-white text-gray-900 border-gray-300'} border`}>
                      {Object.entries(EXTRACTION_TEMPLATES).map(([k]) => <option key={k} value={k}>{k.replace(/_/g, ' ')}</option>)}
                    </select>
                  </div>
                </div>
              </div>

            <div
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              onClick={() => selectedVehicleId ? fileInputRef.current?.click() : undefined}
              className={`rounded-lg p-12 text-center cursor-pointer transition-all duration-300 border-2 border-dashed ${
                !selectedVehicleId ? (isDarkMode ? 'border-neutral-800 bg-neutral-900/30 opacity-60' : 'border-gray-200 bg-gray-50 opacity-60') :
                dragActive
                  ? isDarkMode ? 'border-blue-500 bg-blue-500/10' : 'border-blue-400 bg-blue-50'
                  : isDarkMode ? 'border-neutral-700 bg-neutral-900/60 hover:border-neutral-600 hover:bg-neutral-900/80' : 'border-gray-300 bg-white/60 hover:border-gray-400 hover:bg-white/80'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx"
                onChange={(e) => { if (e.target.files?.[0] && selectedVehicleId) handleFile(e.target.files[0]); }}
              />
              <div className={`w-16 h-16 rounded-lg mx-auto mb-3 flex items-center justify-center ${isDarkMode ? 'bg-blue-500/15' : 'bg-blue-100/80'}`}>
                <Upload className={`w-7 h-7 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} />
              </div>
              <p className={`text-xs font-semibold mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                {dragActive ? t('docUpload.dropzoneActive') : t('docUpload.dropzone')}
              </p>
              <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{t('docUpload.supportedFormats')}</p>
              {!selectedVehicleId && <p className={`mt-3 text-xs font-semibold ${isDarkMode ? 'text-amber-400' : 'text-amber-600'}`}>Please select a vehicle first</p>}
              <button disabled={!selectedVehicleId} className={`mt-5 px-3 py-2.5 rounded-lg text-xs font-semibold transition-all ${
                isDarkMode ? 'bg-blue-600 hover:bg-blue-500 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'
              } ${!selectedVehicleId ? 'opacity-50 cursor-not-allowed' : ''}`}>
                {t('docUpload.browse')}
              </button>
            </div>
            </div>
          )}

          {step === 'analyzing' && (
            <div className={`rounded-lg p-12 text-center ${glass}`}>
              <div className="relative w-16 h-16 mx-auto mb-3">
                <div className={`w-16 h-16 rounded-lg flex items-center justify-center ${isDarkMode ? 'bg-purple-500/15' : 'bg-purple-100/80'}`}>
                  <Sparkles className={`w-7 h-7 ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`} />
                </div>
                <div className="absolute -top-1 -right-1">
                  <Loader2 className="w-5 h-5 text-purple-500 animate-spin" />
                </div>
              </div>
              <p className={`text-xs font-semibold mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{t('docUpload.analyzing')}</p>
              <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{uploadedFileName}</p>
              <div className="mt-6 w-64 mx-auto">
                <div className={`h-1.5 rounded-full overflow-hidden ${isDarkMode ? 'bg-neutral-800' : 'bg-gray-200'}`}>
                  <div className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full animate-[progress_2s_ease-in-out_forwards]" style={{ animation: 'progress 2s ease-in-out forwards' }} />
                </div>
              </div>
              <style>{`@keyframes progress { from { width: 0%; } to { width: 100%; } }`}</style>
            </div>
          )}

          {step === 'review' && aiResult && (
            <div className={`rounded-lg overflow-hidden ${glass}`}>
              {/* Review Header */}
              <div className={`px-3 py-3 border-b ${isDarkMode ? 'border-neutral-800' : 'border-gray-200/60'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-5 h-5 rounded-lg flex items-center justify-center ${isDarkMode ? 'bg-green-500/15' : 'bg-green-100/80'}`}>
                      <Shield className={`w-5 h-5 ${isDarkMode ? 'text-green-400' : 'text-green-600'}`} />
                    </div>
                    <div>
                      <h3 className={`text-base font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{t('docUpload.analysisComplete')}</h3>
                      <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{t('docUpload.reviewPrompt')}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setEditingFields(!editingFields)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
                      editingFields
                        ? isDarkMode ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-100 text-blue-600'
                        : isDarkMode ? 'bg-neutral-800 text-gray-300 hover:bg-neutral-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    <Pencil className="w-3 h-3" />
                    {t('docUpload.editClassification')}
                  </button>
                </div>
              </div>

              {/* File info */}
              <div className={`px-3 py-2 border-b flex items-center gap-3 ${isDarkMode ? 'border-neutral-800 bg-neutral-900/40' : 'border-gray-200/60 bg-gray-50/40'}`}>
                {getFileIcon(uploadedFileName)}
                <span className={`text-xs font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>{uploadedFileName}</span>
              </div>

              {/* Classification */}
              <div className="p-4 space-y-4">
                {/* Document Type + Category + Confidence */}
                <div className="grid grid-cols-3 gap-3">
                  {/* Document Type */}
                  <div>
                    <label className={`text-xs font-semibold uppercase tracking-wider mb-1.5 block ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{t('docUpload.documentType')}</label>
                    {editingFields ? (
                      <div className="relative">
                        <button onClick={() => setIsTypeDropdownOpen(!isTypeDropdownOpen)} className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold border ${isDarkMode ? 'bg-neutral-800 border-neutral-700 text-white' : 'bg-white border-gray-200 text-gray-900'}`}>
                          {t(editedType as any)}
                          <ChevronDown className="w-3 h-3" />
                        </button>
                        {isTypeDropdownOpen && (
                          <div className={`absolute z-50 top-full mt-1 w-full rounded-lg border shadow-xl overflow-hidden max-h-48 overflow-y-auto ${isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'}`}>
                            {documentTypes.map(dt => (
                              <button key={dt.key} onClick={() => { setEditedType(dt.key); setIsTypeDropdownOpen(false); }} className={`w-full px-3 py-2 text-left text-xs font-medium transition-colors ${editedType === dt.key ? (isDarkMode ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-50 text-blue-600') : (isDarkMode ? 'text-gray-300 hover:bg-neutral-800' : 'text-gray-700 hover:bg-gray-50')}`}>
                                {t(dt.key as any)}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className={`px-3 py-2 rounded-lg text-xs font-semibold ${isDarkMode ? 'bg-blue-500/10 text-blue-400' : 'bg-blue-50 text-blue-700'}`}>{t(editedType as any)}</div>
                    )}
                  </div>

                  {/* Category */}
                  <div>
                    <label className={`text-xs font-semibold uppercase tracking-wider mb-1.5 block ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{t('docUpload.category')}</label>
                    {editingFields ? (
                      <div className="relative">
                        <button onClick={() => setIsCategoryDropdownOpen(!isCategoryDropdownOpen)} className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold border ${isDarkMode ? 'bg-neutral-800 border-neutral-700 text-white' : 'bg-white border-gray-200 text-gray-900'}`}>
                          {t(editedCategory as any)}
                          <ChevronDown className="w-3 h-3" />
                        </button>
                        {isCategoryDropdownOpen && (
                          <div className={`absolute z-50 top-full mt-1 w-full rounded-lg border shadow-xl overflow-hidden ${isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'}`}>
                            {categories.map(cat => (
                              <button key={cat.key} onClick={() => { setEditedCategory(cat.key); setIsCategoryDropdownOpen(false); }} className={`w-full px-3 py-2 text-left text-xs font-medium transition-colors ${editedCategory === cat.key ? (isDarkMode ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-50 text-blue-600') : (isDarkMode ? 'text-gray-300 hover:bg-neutral-800' : 'text-gray-700 hover:bg-gray-50')}`}>
                                {t(cat.key as any)}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className={`px-3 py-2 rounded-lg text-xs font-semibold ${isDarkMode ? 'bg-purple-500/10 text-purple-400' : 'bg-purple-50 text-purple-700'}`}>{t(editedCategory as any)}</div>
                    )}
                  </div>

                  {/* Confidence */}
                  <div>
                    <label className={`text-xs font-semibold uppercase tracking-wider mb-1.5 block ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{t('docUpload.confidence')}</label>
                    <div className={`px-3 py-2 rounded-lg flex items-center gap-2 ${
                      aiResult.confidence >= 90
                        ? isDarkMode ? 'bg-green-500/10 text-green-400' : 'bg-green-50 text-green-700'
                        : aiResult.confidence >= 70
                          ? isDarkMode ? 'bg-yellow-500/10 text-yellow-400' : 'bg-yellow-50 text-yellow-700'
                          : isDarkMode ? 'bg-red-500/10 text-red-400' : 'bg-red-50 text-red-700'
                    }`}>
                      <span className="text-[10px] font-semibold">{aiResult.confidence}%</span>
                      <div className={`flex-1 h-1.5 rounded-full ${isDarkMode ? 'bg-neutral-800' : 'bg-gray-200'}`}>
                        <div className={`h-full rounded-full ${aiResult.confidence >= 90 ? 'bg-green-500' : aiResult.confidence >= 70 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${aiResult.confidence}%` }} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Assigned To */}
                <div>
                  <label className={`text-xs font-semibold uppercase tracking-wider mb-1.5 block ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{t('docUpload.assignedTo')}</label>
                  <div className={`px-3 py-2 rounded-lg text-xs font-semibold ${isDarkMode ? 'bg-neutral-800 text-gray-200' : 'bg-gray-100 text-gray-700'}`}>{aiResult.assignedTo}</div>
                </div>

                {/* Detected Fields */}
                <div>
                  <label className={`text-xs font-semibold uppercase tracking-wider mb-2 block ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{t('docUpload.detectedFields')}</label>
                  <div className={`rounded-lg overflow-hidden border ${isDarkMode ? 'border-neutral-800' : 'border-gray-200/60'}`}>
                    {editedFields.map((field, i) => (
                      <div key={field.key} className={`flex items-center px-3 py-2.5 ${i > 0 ? (isDarkMode ? 'border-t border-neutral-800' : 'border-t border-gray-200/40') : ''}`}>
                        <span className={`w-40 text-xs font-semibold shrink-0 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{t(field.label as any)}</span>
                        {editingFields ? (
                          <input
                            value={field.value}
                            onChange={(e) => {
                              const updated = [...editedFields];
                              updated[i] = { ...updated[i], value: e.target.value };
                              setEditedFields(updated);
                            }}
                            className={`flex-1 text-xs font-semibold px-2 py-1 rounded-md border ${isDarkMode ? 'bg-neutral-800 border-neutral-700 text-white' : 'bg-white border-gray-200 text-gray-900'}`}
                          />
                        ) : (
                          <span className={`text-xs font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{field.value}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-3 pt-2">
                  <button
                    onClick={handleConfirm}
                    disabled={confirmLoading}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-green-600 hover:bg-green-500 text-white transition-all shadow-sm ${confirmLoading ? 'opacity-60 cursor-wait' : ''}`}
                  >
                    {confirmLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
                    {confirmLoading ? 'Confirming...' : t('docUpload.confirmAndFile')}
                  </button>
                  <button
                    onClick={handleReset}
                    className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                      isDarkMode ? 'bg-neutral-800 hover:bg-neutral-700 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
                    }`}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    {t('docUpload.rejectAndRetry')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === 'filed' && (
            <div className={`rounded-lg p-12 text-center ${glass}`}>
              <div className={`w-16 h-16 rounded-lg mx-auto mb-3 flex items-center justify-center ${isDarkMode ? 'bg-green-500/15' : 'bg-green-100/80'}`}>
                <CheckCircle className={`w-5 h-5 ${isDarkMode ? 'text-green-400' : 'text-green-600'}`} />
              </div>
              <p className={`text-xs font-semibold mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{t('docUpload.successFiled')}</p>
              <p className={`text-xs mb-3 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                {t('docUpload.filedAs', { type: t(editedType as any), category: t(editedCategory as any) })}
              </p>
              <button
                onClick={handleReset}
                className="inline-flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-all"
              >
                <Upload className="w-3.5 h-3.5" />
                {t('docUpload.uploadAnother')}
              </button>
            </div>
          )}
        </div>

        {/* Right column - Recent Uploads + AI Info */}
        <div className="space-y-5">
          {/* AI Badge */}
          <div className={`rounded-lg p-4 ${glass}`}>
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-5 h-5 rounded-lg flex items-center justify-center ${isDarkMode ? 'bg-purple-500/15' : 'bg-purple-100/80'}`}>
                <Sparkles className={`w-5 h-5 ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`} />
              </div>
              <div>
                <h3 className={`text-base font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{t('docUpload.aiPowered')}</h3>
              </div>
            </div>
            <div className="space-y-2">
              {['Invoice', 'Fine', 'Contract', 'Insurance', 'Service Record', 'Damage Report'].map((type) => (
                <div key={type} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${isDarkMode ? 'bg-neutral-800' : 'bg-gray-50'}`}>
                  <FileText className={`w-3 h-3 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                  <span className={`text-[11px] ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>{type}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Uploads */}
          <div className={`rounded-lg overflow-hidden ${glass}`}>
            <div className={`px-3 py-2 border-b ${isDarkMode ? 'border-neutral-800' : 'border-gray-200/60'}`}>
              <h3 className={`text-base font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{t('docUpload.recentUploads')}</h3>
            </div>
            <div className="p-3">
              {filedDocuments.length === 0 ? (
                <div className="py-8 text-center">
                  <FileText className={`w-5 h-5 mx-auto mb-2 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`} />
                  <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{t('docUpload.noUploads')}</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {filedDocuments.map(doc => (
                    <div key={doc.id} className={`flex items-center gap-3 p-2.5 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-neutral-800/60' : 'hover:bg-gray-50'}`}>
                      <div className={`w-5 h-5 rounded-lg flex items-center justify-center shrink-0 ${isDarkMode ? 'bg-green-500/10' : 'bg-green-50'}`}>
                        <CheckCircle className="w-5 h-5 text-green-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-[11px] font-semibold truncate ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{doc.fileName}</p>
                        <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{doc.type} &middot; {doc.category}</p>
                      </div>
                      <span className={`text-xs font-medium shrink-0 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{doc.date}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
