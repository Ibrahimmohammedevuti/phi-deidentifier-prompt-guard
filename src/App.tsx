/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo, useState } from 'react';
import {
  ClinicalTestPayload,
  SanitizationConfig,
  TEST_PAYLOADS,
  analyzeClinicalInput,
} from './utils/clinicalAnalyzer';
import {
  ClinicalNoteTimelinePoint,
  EntityManualOverride,
  INITIAL_HEALTH_TIMELINE,
  UndoRedoStackState,
  appendNoteToHealthTimeline,
  applyManualOverridesToAnalysis,
  clearAllManualOverrides,
  createInitialUndoRedoState,
  pushManualOverride,
  redoManualOverride,
  undoManualOverride,
} from './utils/redactionHistory';
import { DualEngineAnalyzer } from './components/DualEngineAnalyzer';
import { RedactionDiffPipeline } from './components/RedactionDiffPipeline';
import { SystemPromptFirewall } from './components/SystemPromptFirewall';
import { ComplianceAuditGenerator } from './components/ComplianceAuditGenerator';

export default function App() {
  const [activePayloadId, setActivePayloadId] = useState<string>(TEST_PAYLOADS[0].id);
  const [rawText, setRawText] = useState<string>(TEST_PAYLOADS[0].rawClinicalNote);
  const [config, setConfig] = useState<SanitizationConfig>({
    dateShiftDays: 14,
    redactionStyle: 'pseudonymized',
    neutralizeInjections: true,
  });
  const [undoRedoStack, setUndoRedoStack] = useState<UndoRedoStackState>(() =>
    createInitialUndoRedoState()
  );
  const [healthTimeline, setHealthTimeline] = useState<ClinicalNoteTimelinePoint[]>(
    () => INITIAL_HEALTH_TIMELINE
  );
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('ALL');
  const [downloadFeedback, setDownloadFeedback] = useState<string | null>(null);

  const activePayload = useMemo(
    () => TEST_PAYLOADS.find((p) => p.id === activePayloadId),
    [activePayloadId]
  );

  const baseAnalysis = useMemo(
    () =>
      analyzeClinicalInput(rawText, config, {
        id: activePayload ? activePayload.id : 'custom-clinical-note',
        title: activePayload ? activePayload.title : 'Custom Clinical Intake Record',
      }),
    [rawText, config, activePayload]
  );

  const analysis = useMemo(
    () => applyManualOverridesToAnalysis(baseAnalysis, undoRedoStack.present.overrides),
    [baseAnalysis, undoRedoStack.present.overrides]
  );

  const handleSelectPayload = (payload: ClinicalTestPayload) => {
    setActivePayloadId(payload.id);
    setRawText(payload.rawClinicalNote);
    setSelectedCategoryFilter('ALL');
    setUndoRedoStack(createInitialUndoRedoState());

    const nextResult = analyzeClinicalInput(payload.rawClinicalNote, config, {
      id: payload.id,
      title: payload.title,
    });
    const nowTime = new Date().toISOString().slice(11, 19);
    setHealthTimeline((prev) =>
      appendNoteToHealthTimeline(prev, {
        runId: `run-${Date.now()}`,
        payloadId: payload.id,
        payloadShortTitle: payload.shortLabel,
        specialty: payload.specialty,
        injectionRiskScore: nextResult.injectionRiskScore,
        riskClassification: nextResult.riskLevel,
        scrubbedPhiCount: nextResult.entities.length,
        bypassedPhiCount: 0,
        evaluatedAt: nowTime,
      })
    );
  };

  const handleRecordCurrentNoteToTimeline = () => {
    const nowTime = new Date().toISOString().slice(11, 19);
    const activeScrubbed =
      analysis.auditCertificate.phiDeIdentificationSummary.totalScrubbedEntities;
    const bypassed = Math.max(0, baseAnalysis.entities.length - activeScrubbed);

    setHealthTimeline((prev) =>
      appendNoteToHealthTimeline(prev, {
        runId: `run-${Date.now()}`,
        payloadId: activePayload ? activePayload.id : 'custom-note',
        payloadShortTitle: activePayload ? activePayload.shortLabel : 'Custom Clinical Note',
        specialty: activePayload ? activePayload.specialty : 'Clinical Informatics',
        injectionRiskScore: analysis.injectionRiskScore,
        riskClassification: analysis.riskLevel,
        scrubbedPhiCount: activeScrubbed,
        bypassedPhiCount: bypassed,
        evaluatedAt: nowTime,
      })
    );
  };

  const handleApplyManualOverride = (
    override: EntityManualOverride,
    actionLabel: string
  ) => {
    setUndoRedoStack((prev) => pushManualOverride(prev, override, actionLabel));
  };

  const handleUndo = () => {
    setUndoRedoStack((prev) => undoManualOverride(prev));
  };

  const handleRedo = () => {
    setUndoRedoStack((prev) => redoManualOverride(prev));
  };

  const handleClearOverrides = () => {
    setUndoRedoStack((prev) => clearAllManualOverrides(prev));
  };

  const handleInspectCategory = (categoryId: string) => {
    setSelectedCategoryFilter(categoryId);
    const el = document.getElementById('redaction-pipeline');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleDownloadCertificate = () => {
    const cert = analysis.auditCertificate;
    const jsonString = JSON.stringify(cert, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${cert.certificateId.toLowerCase()}-hipaa-audit.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setDownloadFeedback(`Downloaded ${cert.certificateId.toLowerCase()}-hipaa-audit.json`);
    setTimeout(() => setDownloadFeedback(null), 3000);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-8 border-b border-slate-200 bg-white/95 px-6 py-4 backdrop-blur-xs">
        <a
          href="#top"
          className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
        >
          ClinGuard
        </a>

        <nav
          aria-label="Primary Workspace Navigation"
          className="hidden items-center gap-6 text-sm font-medium text-slate-600 md:flex"
        >
          <a
            href="#analyzer"
            className="transition-colors hover:text-slate-900 hover:underline hover:underline-offset-4 whitespace-nowrap shrink-0"
          >
            Input Analyzer
          </a>
          <a
            href="#redaction-pipeline"
            className="transition-colors hover:text-slate-900 hover:underline hover:underline-offset-4 whitespace-nowrap shrink-0"
          >
            Redaction Pipeline
          </a>
          <a
            href="#prompt-firewall"
            className="transition-colors hover:text-slate-900 hover:underline hover:underline-offset-4 whitespace-nowrap shrink-0"
          >
            Prompt Firewall
          </a>
          <a
            href="#compliance-audit"
            className="transition-colors hover:text-slate-900 hover:underline hover:underline-offset-4 whitespace-nowrap shrink-0"
          >
            Compliance Audit
          </a>
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handleDownloadCertificate}
            className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            Export Audit JSON
          </button>
        </div>
      </header>

      <main id="top" className="mx-auto max-w-[1360px] px-6 py-8">
        {/* Clinical Security Lead Attribution & Executive Header */}
        <div className="mb-8 border-b border-slate-200 pb-8">
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-600">
            <span className="font-semibold text-slate-900">Dr. Ibrahim Mohammed</span>
            <span aria-hidden="true">·</span>
            <span>MD</span>
            <span aria-hidden="true">·</span>
            <span>Health Informatics &amp; Security Lead</span>
            <span aria-hidden="true">·</span>
            <span>45 CFR §164.514(b)(2) Safe Harbor &amp; Clinical LLM Defense</span>
          </div>

          <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-4xl">
              <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                ClinGuard: HIPAA Safe Harbor PHI De-Identification &amp; Prompt Injection Firewall
              </h1>
              <p className="mt-2 text-base leading-relaxed text-slate-600">
                Deterministic clinical NLP sanitization workbench that scrubs all 18 HIPAA Safe
                Harbor PHI categories into cryptographic pseudonyms while isolating untrusted
                patient intake streams inside a three-layer XML Sandwich Firewall prior to LLM
                summarization.
              </p>
            </div>

            {downloadFeedback && (
              <div
                role="status"
                className="rounded-lg border border-emerald-300 bg-emerald-50 px-3.5 py-2 font-mono text-xs font-medium text-emerald-900 whitespace-nowrap shrink-0"
              >
                {downloadFeedback}
              </div>
            )}
          </div>

          {/* 4-Column Real-Time Clinical Security Telemetry Strip */}
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <span className="text-xs font-medium text-slate-500">
                HIPAA Safe Harbor Coverage
              </span>
              <div className="mt-1 font-mono text-2xl font-bold text-slate-900 tabular-nums">
                {analysis.coveredCategoriesCount}/18 Categories
              </div>
              <p className="mt-1 text-xs text-slate-500">
                45 CFR §164.514(b)(2)(i)(A)–(R)
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <span className="text-xs font-medium text-slate-500">
                Scrubbed PHI Entities
              </span>
              <div className="mt-1 font-mono text-2xl font-bold text-emerald-700 tabular-nums">
                {analysis.auditCertificate.phiDeIdentificationSummary.totalScrubbedEntities}{' '}
                Redacted
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Offset: {config.dateShiftDays >= 0 ? '+' : ''}
                {config.dateShiftDays}D · Mode:{' '}
                {config.redactionStyle === 'pseudonymized' ? 'Pseudonymized' : 'Strict Mask'}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <span className="text-xs font-medium text-slate-500">
                Adversarial Injection Risk Score
              </span>
              <div
                className={`mt-1 font-mono text-2xl font-bold tabular-nums ${
                  analysis.injectionRiskScore >= 75
                    ? 'text-red-600'
                    : analysis.injectionRiskScore >= 45
                    ? 'text-amber-600'
                    : 'text-emerald-600'
                }`}
              >
                {analysis.injectionRiskScore}/100 ({analysis.riskLevel})
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {analysis.injections.length} Adversarial Vector(s) Detected
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <span className="text-xs font-medium text-slate-500">
                XML Sandwich Firewall Status
              </span>
              <div className="mt-1 font-mono text-xl font-bold text-sky-800">
                3-Layer XML Enforced
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Constitution · Quarantine · Verification Gate
              </p>
            </div>
          </div>
        </div>

        {/* Core Feature Sections */}
        <div className="space-y-14">
          <DualEngineAnalyzer
            activePayloadId={activePayloadId}
            rawText={rawText}
            config={config}
            analysis={analysis}
            onSelectPayload={handleSelectPayload}
            onChangeRawText={(text) => {
              setRawText(text);
              const matched = TEST_PAYLOADS.find((p) => p.rawClinicalNote === text);
              setActivePayloadId(matched ? matched.id : 'custom');
            }}
            onChangeConfig={setConfig}
            onInspectCategory={handleInspectCategory}
          />

          <hr className="border-slate-200" />

          <RedactionDiffPipeline
            analysis={analysis}
            undoRedoStack={undoRedoStack}
            onApplyManualOverride={handleApplyManualOverride}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onClearOverrides={handleClearOverrides}
            selectedCategoryFilter={selectedCategoryFilter}
            onChangeCategoryFilter={setSelectedCategoryFilter}
            onRestoreDefaultPayload={() => handleSelectPayload(TEST_PAYLOADS[0])}
          />

          <hr className="border-slate-200" />

          <SystemPromptFirewall analysis={analysis} />

          <hr className="border-slate-200" />

          <ComplianceAuditGenerator
            analysis={analysis}
            healthTimeline={healthTimeline}
            onRecordCurrentNoteToTimeline={handleRecordCurrentNoteToTimeline}
            onDownloadCertificate={handleDownloadCertificate}
          />
        </div>
      </main>

      {/* Quiet Clinical Governance Footer */}
      <footer className="mt-16 border-t border-slate-200 bg-white px-6 py-8">
        <div className="mx-auto flex max-w-[1360px] flex-col items-start justify-between gap-4 text-xs text-slate-500 sm:flex-row sm:items-center">
          <div>
            <span className="font-semibold text-slate-800">
              ClinGuard Clinical Security Workbench
            </span>
            <span aria-hidden="true"> · </span>
            <span>Architected by Dr. Ibrahim Mohammed (MD | Health Informatics &amp; Security Lead)</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span>HIPAA 45 CFR §164.514(b)(2) Safe Harbor</span>
            <span aria-hidden="true">·</span>
            <span>GDPR Art. 9 &amp; 32 Pseudonymization</span>
            <span aria-hidden="true">·</span>
            <span>OWASP LLM01 Prompt Injection Defense</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
