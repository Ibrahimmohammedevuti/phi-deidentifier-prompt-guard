import test from 'node:test';
import assert from 'node:assert/strict';
import { TEST_PAYLOADS, analyzeClinicalInput } from './clinicalAnalyzer';
import {
  INITIAL_HEALTH_TIMELINE,
  appendNoteToHealthTimeline,
  applyManualOverridesToAnalysis,
  clearAllManualOverrides,
  createInitialUndoRedoState,
  pushManualOverride,
  redoManualOverride,
  undoManualOverride,
} from './redactionHistory';

test('Undo/Redo history stack tracks manual entity redaction adjustments and restores states', () => {
  let stack = createInitialUndoRedoState();
  assert.equal(stack.past.length, 0);
  assert.equal(stack.future.length, 0);

  // Step 1: Bypass redaction for phi-3 (Evelyn Vance)
  stack = pushManualOverride(
    stack,
    {
      targetId: 'phi-3',
      enabled: false,
      label: 'Evelyn Vance',
    },
    'Bypassed redaction for Evelyn Vance',
    '2026-11-09T09:31:00.000Z'
  );
  assert.equal(stack.past.length, 1);
  assert.equal(stack.present.overrides['phi-3'].enabled, false);

  // Step 2: Set custom pseudonym token for phi-5 (MRN-8492014)
  stack = pushManualOverride(
    stack,
    {
      targetId: 'phi-5',
      enabled: true,
      customToken: '[CUSTOM_MRN_999]',
      label: 'MRN-8492014',
    },
    'Customized token for MRN-8492014 to [CUSTOM_MRN_999]',
    '2026-11-09T09:32:00.000Z'
  );
  assert.equal(stack.past.length, 2);
  assert.equal(stack.present.overrides['phi-5'].customToken, '[CUSTOM_MRN_999]');

  // Undo Step 2 -> back to Step 1
  stack = undoManualOverride(stack);
  assert.equal(stack.past.length, 1);
  assert.equal(stack.future.length, 1);
  assert.equal(stack.present.overrides['phi-5'], undefined);
  assert.equal(stack.present.overrides['phi-3'].enabled, false);

  // Redo Step 2 -> forward to Step 2
  stack = redoManualOverride(stack);
  assert.equal(stack.past.length, 2);
  assert.equal(stack.future.length, 0);
  assert.equal(stack.present.overrides['phi-5'].customToken, '[CUSTOM_MRN_999]');

  // Clear all overrides -> adds to past stack and resets present overrides
  stack = clearAllManualOverrides(stack, '2026-11-09T09:33:00.000Z');
  assert.equal(Object.keys(stack.present.overrides).length, 0);
  assert.equal(stack.past.length, 3);
});

test('applyManualOverridesToAnalysis updates sanitized text and compliance audit counts', () => {
  const base = analyzeClinicalInput(TEST_PAYLOADS[0].rawClinicalNote);
  const firstEntity = base.entities[0]; // Mount Sinai Metro Trauma Center

  const modified = applyManualOverridesToAnalysis(base, {
    [firstEntity.id]: {
      targetId: firstEntity.id,
      enabled: false,
      label: firstEntity.originalText,
    },
  });

  // Total scrubbed entities decrements by 1 when bypassed
  assert.equal(
    modified.auditCertificate.phiDeIdentificationSummary.totalScrubbedEntities,
    base.entities.length - 1
  );
  // Compliance status reflects manual exemption
  assert.equal(
    modified.auditCertificate.regulatoryReadiness.hipaaSafeHarborStatus,
    'REQUIRES_REDACTION'
  );

  // Custom token override preserves compliance and replaces token in sanitizedText
  const customModified = applyManualOverridesToAnalysis(base, {
    [firstEntity.id]: {
      targetId: firstEntity.id,
      enabled: true,
      customToken: '[TRAUMA_CENTER_CUSTOM_01]',
      label: firstEntity.originalText,
    },
  });
  assert.ok(customModified.sanitizedText.includes('[TRAUMA_CENTER_CUSTOM_01]'));
  assert.equal(
    customModified.auditCertificate.regulatoryReadiness.hipaaSafeHarborStatus,
    'COMPLIANT_SAFE_HARBOR_45_CFR_164_514'
  );
});

test('Sanitization Health Dashboard maintains rolling 5-note window', () => {
  assert.equal(INITIAL_HEALTH_TIMELINE.length, 5);

  const updated = appendNoteToHealthTimeline(INITIAL_HEALTH_TIMELINE, {
    runId: 'run-06',
    payloadId: 'custom-note-06',
    payloadShortTitle: 'ED Triage Custom Note',
    specialty: 'Emergency Medicine',
    injectionRiskScore: 51,
    riskClassification: 'HIGH',
    scrubbedPhiCount: 14,
    bypassedPhiCount: 0,
    evaluatedAt: '09:35:12',
  });

  assert.equal(updated.length, 5);
  assert.equal(updated[4].runId, 'run-06');
  assert.equal(updated[4].injectionRiskScore, 51);
  assert.equal(updated[0].runId, 'run-02');
});
