import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HIPAA_IDENTIFIERS,
  TEST_PAYLOADS,
  analyzeClinicalInput,
} from './clinicalAnalyzer';

test('HIPAA_IDENTIFIERS defines all 18 Safe Harbor categories', () => {
  assert.equal(HIPAA_IDENTIFIERS.length, 18);
  const indices = HIPAA_IDENTIFIERS.map((i) => i.index);
  assert.deepEqual(
    indices,
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]
  );
});

test('All 4 pre-loaded test payloads detect all 18 HIPAA Safe Harbor categories and adversarial prompt injections', () => {
  assert.equal(TEST_PAYLOADS.length, 4);

  for (const payload of TEST_PAYLOADS) {
    const result = analyzeClinicalInput(
      payload.rawClinicalNote,
      {
        dateShiftDays: 14,
        redactionStyle: 'pseudonymized',
        neutralizeInjections: true,
      },
      { id: payload.id, title: payload.title }
    );

    // Every pre-loaded payload covers all 18 HIPAA Safe Harbor categories
    assert.equal(
      result.coveredCategoriesCount,
      18,
      `Payload ${payload.id} should cover all 18 HIPAA Safe Harbor identifiers, got ${result.coveredCategoriesCount}`
    );

    // Verify required tokens appear in sanitized text
    assert.ok(
      result.sanitizedText.includes('[PATIENT_REDACTED_01]'),
      `Payload ${payload.id} sanitized output must include [PATIENT_REDACTED_01]`
    );
    assert.ok(
      result.sanitizedText.includes('[DATE_SHIFT_+14D]'),
      `Payload ${payload.id} sanitized output must include [DATE_SHIFT_+14D]`
    );
    assert.ok(
      /\[MRN_HASH_[0-9A-F]{6}\]/.test(result.sanitizedText),
      `Payload ${payload.id} sanitized output must include [MRN_HASH_*]`
    );

    // Verify adversarial prompt injections are detected and scored > 0
    assert.ok(
      result.injections.length >= 1,
      `Payload ${payload.id} must detect adversarial prompt injection vectors`
    );
    assert.ok(
      result.injectionRiskScore > 50 && result.injectionRiskScore <= 100,
      `Payload ${payload.id} injection risk score should be in high/critical range (51-100), got ${result.injectionRiskScore}`
    );
  }
});

test('System Prompt Firewall generates exact XML Sandwich Defense tags', () => {
  const payload = TEST_PAYLOADS[1]; // XML escape payload
  const result = analyzeClinicalInput(payload.rawClinicalNote);

  assert.ok(
    result.systemPromptArch.fullAssembledPromptSanitized.includes('<system_safety_constitution>')
  );
  assert.ok(
    result.systemPromptArch.fullAssembledPromptSanitized.includes('<untrusted_clinical_input')
  );
  assert.ok(
    result.systemPromptArch.fullAssembledPromptSanitized.includes('<verification_gate>')
  );

  // Verify raw delimiter escape tags inside untrusted input are HTML-entity escaped
  assert.ok(
    result.systemPromptArch.untrustedClinicalInputRaw.includes('&lt;/untrusted_clinical_input&gt;')
  );
});

test('Compliance Audit Certificate logs scrubbed PHI counts, risk score, and HIPAA/GDPR readiness', () => {
  const payload = TEST_PAYLOADS[0];
  const result = analyzeClinicalInput(payload.rawClinicalNote);
  const cert = result.auditCertificate;

  assert.equal(
    cert.phiDeIdentificationSummary.totalScrubbedEntities,
    result.entities.length
  );
  assert.equal(cert.phiDeIdentificationSummary.uniqueHipaaCategoriesDetected, 18);
  assert.equal(
    cert.promptInjectionFirewallSummary.injectionRiskScore,
    result.injectionRiskScore
  );
  assert.equal(
    cert.regulatoryReadiness.hipaaSafeHarborStatus,
    'COMPLIANT_SAFE_HARBOR_45_CFR_164_514'
  );
  assert.equal(
    cert.regulatoryReadiness.gdprStatus,
    'READY_GDPR_ART_9_AND_32_PSEUDONYMIZED'
  );
  assert.equal(cert.regulatoryReadiness.llmIngestionCleared, true);
  assert.equal(cert.regulatoryReadiness.sha256PayloadDigest.length, 64);
});
