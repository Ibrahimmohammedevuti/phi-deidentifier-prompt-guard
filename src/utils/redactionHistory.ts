import { AnalysisResult, DiffSegment } from './clinicalAnalyzer';

export interface EntityManualOverride {
  targetId: string; // e.g. 'phi-1' or 'inj-1'
  enabled: boolean; // true = redact/neutralize, false = bypass (keep raw text)
  customToken?: string; // optional custom replacement token
  label: string; // human-readable summary of the target
}

export interface OverrideHistoryEntry {
  overrides: Record<string, EntityManualOverride>;
  lastActionLabel: string;
  timestampIso: string;
}

export interface UndoRedoStackState {
  past: OverrideHistoryEntry[];
  present: OverrideHistoryEntry;
  future: OverrideHistoryEntry[];
}

export interface ClinicalNoteTimelinePoint {
  runId: string;
  slotLabel: string;
  payloadId: string;
  payloadShortTitle: string;
  specialty: string;
  injectionRiskScore: number;
  riskClassification: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  scrubbedPhiCount: number;
  bypassedPhiCount: number;
  evaluatedAt: string;
}

export function createInitialUndoRedoState(): UndoRedoStackState {
  return {
    past: [],
    present: {
      overrides: {},
      lastActionLabel: 'Initial automated Safe Harbor baseline',
      timestampIso: '2026-11-09T09:30:00.000Z',
    },
    future: [],
  };
}

export function pushManualOverride(
  stack: UndoRedoStackState,
  override: EntityManualOverride,
  actionLabel: string,
  timestampIso: string = new Date().toISOString()
): UndoRedoStackState {
  const nextOverrides: Record<string, EntityManualOverride> = {
    ...stack.present.overrides,
    [override.targetId]: override,
  };

  return {
    past: [...stack.past, stack.present],
    present: {
      overrides: nextOverrides,
      lastActionLabel: actionLabel,
      timestampIso,
    },
    future: [],
  };
}

export function undoManualOverride(stack: UndoRedoStackState): UndoRedoStackState {
  if (stack.past.length === 0) return stack;
  const previous = stack.past[stack.past.length - 1];
  const nextPast = stack.past.slice(0, stack.past.length - 1);

  return {
    past: nextPast,
    present: previous,
    future: [stack.present, ...stack.future],
  };
}

export function redoManualOverride(stack: UndoRedoStackState): UndoRedoStackState {
  if (stack.future.length === 0) return stack;
  const [nextPresent, ...remainingFuture] = stack.future;

  return {
    past: [...stack.past, stack.present],
    present: nextPresent,
    future: remainingFuture,
  };
}

export function clearAllManualOverrides(
  stack: UndoRedoStackState,
  timestampIso: string = new Date().toISOString()
): UndoRedoStackState {
  if (Object.keys(stack.present.overrides).length === 0) return stack;
  return {
    past: [...stack.past, stack.present],
    present: {
      overrides: {},
      lastActionLabel: 'Reverted all manual overrides to Safe Harbor defaults',
      timestampIso,
    },
    future: [],
  };
}

export function applyManualOverridesToAnalysis(
  baseAnalysis: AnalysisResult,
  overrides: Record<string, EntityManualOverride>
): AnalysisResult {
  if (!overrides || Object.keys(overrides).length === 0) {
    return baseAnalysis;
  }

  let bypassedPhiCount = 0;

  const updatedEntities = baseAnalysis.entities.map((ent) => {
    const ov = overrides[ent.id];
    if (!ov) return ent;
    const effectiveToken = !ov.enabled
      ? ent.originalText
      : ov.customToken && ov.customToken.trim().length > 0
      ? ov.customToken.trim()
      : ent.replacementToken;
    if (!ov.enabled) {
      bypassedPhiCount += 1;
    }
    return {
      ...ent,
      replacementToken: effectiveToken,
    };
  });

  const updatedInjections = baseAnalysis.injections.map((inj) => {
    const ov = overrides[inj.id];
    if (!ov) return inj;
    const effectiveToken = !ov.enabled
      ? inj.matchedText
      : ov.customToken && ov.customToken.trim().length > 0
      ? ov.customToken.trim()
      : inj.neutralizedToken;
    return {
      ...inj,
      neutralizedToken: effectiveToken,
    };
  });

  const updatedDiffSegments: DiffSegment[] = baseAnalysis.diffSegments.map((seg) => {
    if (seg.type === 'phi' && seg.entity) {
      const ov = overrides[seg.entity.id];
      if (!ov) return seg;
      const nextToken = !ov.enabled
        ? seg.rawText
        : ov.customToken && ov.customToken.trim().length > 0
        ? ov.customToken.trim()
        : seg.sanitizedText;
      return {
        ...seg,
        sanitizedText: nextToken,
        entity: {
          ...seg.entity,
          replacementToken: nextToken,
        },
      };
    }
    if (seg.type === 'injection' && seg.injection) {
      const ov = overrides[seg.injection.id];
      if (!ov) return seg;
      const nextToken = !ov.enabled
        ? seg.rawText
        : ov.customToken && ov.customToken.trim().length > 0
        ? ov.customToken.trim()
        : seg.sanitizedText;
      return {
        ...seg,
        sanitizedText: nextToken,
        injection: {
          ...seg.injection,
          neutralizedToken: nextToken,
        },
      };
    }
    return seg;
  });

  const updatedSanitizedText = updatedDiffSegments.map((s) => s.sanitizedText).join('');
  const activeScrubbedCount = Math.max(0, baseAnalysis.entities.length - bypassedPhiCount);

  const updatedUntrustedSanitized = `<untrusted_clinical_input source="clinguard_redaction_pipeline" phi_status="${
    bypassedPhiCount === 0 ? 'SCRUBBED_SAFE_HARBOR' : 'PARTIAL_MANUAL_EXEMPTION'
  }" active_overrides="${Object.keys(overrides).length}">
${updatedSanitizedText}
</untrusted_clinical_input>`;

  const updatedFullSanitizedPrompt = `${baseAnalysis.systemPromptArch.systemSafetyConstitution}\n\n${updatedUntrustedSanitized}\n\n${baseAnalysis.systemPromptArch.verificationGate}`;

  return {
    ...baseAnalysis,
    sanitizedText: updatedSanitizedText,
    entities: updatedEntities,
    injections: updatedInjections,
    diffSegments: updatedDiffSegments,
    systemPromptArch: {
      ...baseAnalysis.systemPromptArch,
      untrustedClinicalInputSanitized: updatedUntrustedSanitized,
      fullAssembledPromptSanitized: updatedFullSanitizedPrompt,
    },
    auditCertificate: {
      ...baseAnalysis.auditCertificate,
      phiDeIdentificationSummary: {
        ...baseAnalysis.auditCertificate.phiDeIdentificationSummary,
        totalScrubbedEntities: activeScrubbedCount,
      },
      regulatoryReadiness: {
        ...baseAnalysis.auditCertificate.regulatoryReadiness,
        hipaaSafeHarborStatus:
          bypassedPhiCount === 0 && baseAnalysis.rawText.trim().length > 0
            ? 'COMPLIANT_SAFE_HARBOR_45_CFR_164_514'
            : 'REQUIRES_REDACTION',
        gdprStatus:
          bypassedPhiCount === 0 && baseAnalysis.rawText.trim().length > 0
            ? 'READY_GDPR_ART_9_AND_32_PSEUDONYMIZED'
            : 'NON_COMPLIANT_RAW_PHI',
        llmIngestionCleared:
          bypassedPhiCount === 0 &&
          baseAnalysis.auditCertificate.regulatoryReadiness.llmIngestionCleared,
      },
    },
  };
}

export const INITIAL_HEALTH_TIMELINE: ClinicalNoteTimelinePoint[] = [
  {
    runId: 'run-01',
    slotLabel: 'Note #1 (09:12)',
    payloadId: 'baseline-triage-clean',
    payloadShortTitle: 'Outpatient Triage Intake (Clean)',
    specialty: 'Internal Medicine',
    injectionRiskScore: 12,
    riskClassification: 'LOW',
    scrubbedPhiCount: 19,
    bypassedPhiCount: 0,
    evaluatedAt: '09:12:10',
  },
  {
    runId: 'run-02',
    slotLabel: 'Note #2 (09:18)',
    payloadId: 'payload-04-cardio-indirect',
    payloadShortTitle: 'Cardiology Discharge + Covert Trap',
    specialty: 'Interventional Cardiology',
    injectionRiskScore: 89,
    riskClassification: 'CRITICAL',
    scrubbedPhiCount: 27,
    bypassedPhiCount: 0,
    evaluatedAt: '09:18:42',
  },
  {
    runId: 'run-03',
    slotLabel: 'Note #3 (09:22)',
    payloadId: 'payload-03-psych-exfil',
    payloadShortTitle: 'Telehealth Intake + Exfiltration',
    specialty: 'Psychiatry & Behavioral',
    injectionRiskScore: 100,
    riskClassification: 'CRITICAL',
    scrubbedPhiCount: 28,
    bypassedPhiCount: 0,
    evaluatedAt: '09:22:05',
  },
  {
    runId: 'run-04',
    slotLabel: 'Note #4 (09:26)',
    payloadId: 'payload-02-oncology-xml',
    payloadShortTitle: 'Oncology Consult + XML Breakout',
    specialty: 'Medical Oncology',
    injectionRiskScore: 100,
    riskClassification: 'CRITICAL',
    scrubbedPhiCount: 28,
    bypassedPhiCount: 0,
    evaluatedAt: '09:26:19',
  },
  {
    runId: 'run-05',
    slotLabel: 'Note #5 (Active)',
    payloadId: 'payload-01-trauma-all18',
    payloadShortTitle: 'Trauma ICU 18-ID + System Override',
    specialty: 'Trauma Surgery & ICU',
    injectionRiskScore: 100,
    riskClassification: 'CRITICAL',
    scrubbedPhiCount: 28,
    bypassedPhiCount: 0,
    evaluatedAt: '09:30:00',
  },
];

export function appendNoteToHealthTimeline(
  currentTimeline: ClinicalNoteTimelinePoint[],
  newPoint: Omit<ClinicalNoteTimelinePoint, 'slotLabel'>
): ClinicalNoteTimelinePoint[] {
  const combined = [...currentTimeline, { ...newPoint, slotLabel: '' }];
  const lastFive = combined.slice(-5);
  return lastFive.map((item, idx) => ({
    ...item,
    slotLabel:
      idx === lastFive.length - 1
        ? `Note #${idx + 1} (Latest)`
        : `Note #${idx + 1} (${item.evaluatedAt.slice(0, 5)})`,
  }));
}
