import React, { useState } from 'react';
import {
  AnalysisResult,
  DetectedEntity,
  DetectedInjection,
  HIPAA_IDENTIFIERS,
} from '../utils/clinicalAnalyzer';
import {
  EntityManualOverride,
  UndoRedoStackState,
} from '../utils/redactionHistory';

interface RedactionDiffPipelineProps {
  analysis: AnalysisResult;
  undoRedoStack: UndoRedoStackState;
  onApplyManualOverride: (override: EntityManualOverride, actionLabel: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClearOverrides: () => void;
  selectedCategoryFilter: string;
  onChangeCategoryFilter: (cat: string) => void;
  onRestoreDefaultPayload: () => void;
}

export const RedactionDiffPipeline: React.FC<RedactionDiffPipelineProps> = ({
  analysis,
  undoRedoStack,
  onApplyManualOverride,
  onUndo,
  onRedo,
  onClearOverrides,
  selectedCategoryFilter,
  onChangeCategoryFilter,
  onRestoreDefaultPayload,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedSanitized, setCopiedSanitized] = useState(false);
  const [selectedSpanInfo, setSelectedSpanInfo] = useState<
    | { type: 'phi'; entity: DetectedEntity }
    | { type: 'injection'; injection: DetectedInjection }
    | null
  >(null);
  const [customTokenDraft, setCustomTokenDraft] = useState('');

  const activeOverrides = undoRedoStack.present.overrides;
  const activeOverridesCount = Object.keys(activeOverrides).length;

  const handleCopySanitized = async () => {
    try {
      await navigator.clipboard.writeText(analysis.sanitizedText);
    } catch {
      // Fallback if clipboard API restricted
    }
    setCopiedSanitized(true);
    setTimeout(() => setCopiedSanitized(false), 2000);
  };

  const handleSelectPhiSpan = (ent: DetectedEntity) => {
    setSelectedSpanInfo({ type: 'phi', entity: ent });
    const existing = activeOverrides[ent.id];
    setCustomTokenDraft(existing?.customToken ?? ent.replacementToken);
  };

  const handleSelectInjectionSpan = (inj: DetectedInjection) => {
    setSelectedSpanInfo({ type: 'injection', injection: inj });
    const existing = activeOverrides[inj.id];
    setCustomTokenDraft(existing?.customToken ?? inj.neutralizedToken);
  };

  const handleToggleEntityRedaction = (
    targetId: string,
    rawLabel: string,
    defaultToken: string
  ) => {
    const current = activeOverrides[targetId];
    const currentlyEnabled = current ? current.enabled : true;
    const nextEnabled = !currentlyEnabled;

    onApplyManualOverride(
      {
        targetId,
        enabled: nextEnabled,
        customToken: current?.customToken,
        label: rawLabel,
      },
      nextEnabled
        ? `Restored redaction (${defaultToken}) for "${rawLabel.slice(0, 28)}"`
        : `Bypassed redaction (manual exemption) for "${rawLabel.slice(0, 28)}"`
    );
  };

  const handleSaveCustomToken = (targetId: string, rawLabel: string) => {
    const trimmed = customTokenDraft.trim();
    if (!trimmed) return;
    onApplyManualOverride(
      {
        targetId,
        enabled: true,
        customToken: trimmed,
        label: rawLabel,
      },
      `Set custom token ${trimmed} for "${rawLabel.slice(0, 28)}"`
    );
  };

  const filteredEntities = analysis.entities.filter((ent) => {
    const matchesCategory =
      selectedCategoryFilter === 'ALL' ||
      selectedCategoryFilter === 'PHI_ONLY' ||
      ent.categoryId === selectedCategoryFilter;
    const matchesSearch =
      searchQuery.trim() === '' ||
      ent.originalText.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ent.replacementToken.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ent.categoryTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ent.cfrCitation.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const showInjections =
    selectedCategoryFilter === 'ALL' || selectedCategoryFilter === 'INJECTIONS_ONLY';

  const filteredInjections = showInjections
    ? analysis.injections.filter(
        (inj) =>
          searchQuery.trim() === '' ||
          inj.matchedText.toLowerCase().includes(searchQuery.toLowerCase()) ||
          inj.vectorTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
          inj.neutralizedToken.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  return (
    <section
      id="redaction-pipeline"
      aria-labelledby="redaction-pipeline-heading"
      className="scroll-mt-20"
    >
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-wider text-sky-700 uppercase">
            02. Interactive Sanitization &amp; Redaction Pipeline
          </p>
          <h2
            id="redaction-pipeline-heading"
            className="mt-1 text-2xl font-bold tracking-tight text-slate-900"
          >
            Side-by-Side Visual Diff Viewer &amp; Pseudonymization Ledger
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Compare the raw clinical intake stream (left) against the HIPAA Safe Harbor
            de-identified, pseudonymized output (right). Click any entity to customize or bypass
            redaction with full Undo/Redo history tracking.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleCopySanitized}
            className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            {copiedSanitized ? 'Copied De-Identified Output' : 'Copy De-Identified Text'}
          </button>
        </div>
      </div>

      {/* Undo / Redo History Stack Control Bar */}
      <div
        data-testid="redaction-undo-redo-bar"
        className="mb-6 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 lg:flex-row lg:items-center lg:justify-between"
      >
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold text-slate-900">
            Manual Redaction History Stack
          </span>
          <span aria-hidden="true" className="text-slate-400">
            ·
          </span>
          <span
            data-testid="active-overrides-count"
            className="font-mono font-medium text-sky-800 tabular-nums"
          >
            {activeOverridesCount} Custom Override(s)
          </span>
          <span aria-hidden="true" className="text-slate-400">
            ·
          </span>
          <span
            data-testid="history-last-action"
            className="font-mono text-slate-600"
          >
            Last Action: {undoRedoStack.present.lastActionLabel}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onUndo}
            disabled={undoRedoStack.past.length === 0}
            aria-label="Undo manual redaction edit"
            className={`rounded-lg border px-3 py-1.5 font-mono text-xs font-semibold transition-colors whitespace-nowrap shrink-0 tabular-nums ${
              undoRedoStack.past.length > 0
                ? 'border-slate-300 bg-white text-slate-800 hover:bg-slate-100'
                : 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400'
            }`}
          >
            Undo ({undoRedoStack.past.length})
          </button>

          <button
            type="button"
            onClick={onRedo}
            disabled={undoRedoStack.future.length === 0}
            aria-label="Redo manual redaction edit"
            className={`rounded-lg border px-3 py-1.5 font-mono text-xs font-semibold transition-colors whitespace-nowrap shrink-0 tabular-nums ${
              undoRedoStack.future.length > 0
                ? 'border-slate-300 bg-white text-slate-800 hover:bg-slate-100'
                : 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400'
            }`}
          >
            Redo ({undoRedoStack.future.length})
          </button>

          <button
            type="button"
            onClick={onClearOverrides}
            disabled={activeOverridesCount === 0}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              activeOverridesCount > 0
                ? 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100'
                : 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400'
            }`}
          >
            Revert All Custom Edits
          </button>
        </div>
      </div>

      {/* Empty State Handling */}
      {analysis.rawText.trim().length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
          <h3 className="text-base font-semibold text-slate-900">
            No Clinical Input Loaded in Redaction Pipeline
          </h3>
          <p className="mx-auto mt-1 max-w-md text-xs text-slate-600">
            The clinical input analyzer is currently empty. Load a pre-configured clinical test
            payload or enter custom progress notes above to inspect side-by-side redaction diffs.
          </p>
          <button
            type="button"
            onClick={onRestoreDefaultPayload}
            className="mt-4 rounded-lg bg-sky-700 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-800"
          >
            Load Default 18-Identifier Trauma Payload
          </button>
        </div>
      ) : (
        <>
          {/* Side-by-Side Visual Diff Viewer */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-stretch">
            {/* Left Pane: Raw Clinical Text with Highlighted PHI & Injection Spans */}
            <div className="flex flex-col rounded-xl border border-slate-200 bg-white">
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Raw Clinical Text (Untrusted Source)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Click any highlighted PHI entity or adversarial vector to customize redaction
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <span>Amber: PHI Identifier</span>
                  <span aria-hidden="true">·</span>
                  <span>Crimson: Prompt Injection</span>
                </div>
              </div>

              <div
                data-testid="diff-raw-panel"
                className="flex-1 overflow-x-auto p-5 font-mono text-xs leading-relaxed whitespace-pre-wrap text-slate-800"
              >
                {analysis.diffSegments.map((seg) => {
                  if (seg.type === 'plain') {
                    return <span key={seg.id}>{seg.rawText}</span>;
                  }
                  if (seg.type === 'phi' && seg.entity) {
                    const ent = seg.entity;
                    const ov = activeOverrides[ent.id];
                    const isBypassed = ov && !ov.enabled;
                    return (
                      <button
                        key={seg.id}
                        type="button"
                        onClick={() => handleSelectPhiSpan(ent)}
                        title={`${ent.categoryTitle} (${ent.cfrCitation}) → ${ent.replacementToken}`}
                        className={`mx-0.5 inline rounded border px-1 py-0.5 font-mono text-xs font-medium underline underline-offset-2 transition-colors ${
                          isBypassed
                            ? 'border-slate-300 bg-slate-100 text-slate-600 line-through decoration-slate-400'
                            : 'border-amber-300 bg-amber-100/90 text-amber-950 decoration-amber-500 decoration-dotted hover:bg-amber-200'
                        }`}
                      >
                        {seg.rawText}
                      </button>
                    );
                  }
                  if (seg.type === 'injection' && seg.injection) {
                    const inj = seg.injection;
                    const ov = activeOverrides[inj.id];
                    const isBypassed = ov && !ov.enabled;
                    return (
                      <button
                        key={seg.id}
                        type="button"
                        onClick={() => handleSelectInjectionSpan(inj)}
                        title={`Prompt Injection (${inj.vectorTitle}) → ${inj.neutralizedToken}`}
                        className={`mx-0.5 inline rounded border px-1 py-0.5 font-mono text-xs font-semibold underline underline-offset-2 transition-colors ${
                          isBypassed
                            ? 'border-slate-300 bg-slate-100 text-slate-600 line-through decoration-slate-400'
                            : 'border-red-300 bg-red-100/90 text-red-950 decoration-red-600 decoration-wavy hover:bg-red-200'
                        }`}
                      >
                        {seg.rawText}
                      </button>
                    );
                  }
                  return <span key={seg.id}>{seg.rawText}</span>;
                })}
              </div>
            </div>

            {/* Right Pane: De-Identified, Pseudonymized Clinical Text */}
            <div className="flex flex-col rounded-xl border border-slate-200 bg-white">
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    De-Identified, Pseudonymized Clinical Text
                  </h3>
                  <p className="text-xs text-slate-500">
                    HIPAA Safe Harbor tokens &amp; neutralized directives ready for LLM ingestion
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <span>Teal: Safe Harbor Token</span>
                  <span aria-hidden="true">·</span>
                  <span>Slate: Neutralized Threat</span>
                </div>
              </div>

              <div
                data-testid="diff-sanitized-panel"
                className="flex-1 overflow-x-auto p-5 font-mono text-xs leading-relaxed whitespace-pre-wrap text-slate-800"
              >
                {analysis.diffSegments.map((seg) => {
                  if (seg.type === 'plain') {
                    return <span key={seg.id}>{seg.sanitizedText}</span>;
                  }
                  if (seg.type === 'phi' && seg.entity) {
                    const ent = seg.entity;
                    const ov = activeOverrides[ent.id];
                    const isBypassed = ov && !ov.enabled;
                    const isCustomToken = Boolean(ov?.enabled && ov?.customToken);
                    return (
                      <button
                        key={seg.id}
                        type="button"
                        onClick={() => handleSelectPhiSpan(ent)}
                        title={`Original: ${ent.originalText} (${ent.cfrCitation})`}
                        className={`mx-0.5 inline rounded border px-1 py-0.5 font-mono text-xs font-semibold transition-colors ${
                          isBypassed
                            ? 'border-amber-400 bg-amber-50 text-amber-900'
                            : isCustomToken
                            ? 'border-sky-400 bg-sky-100 text-sky-950 hover:bg-sky-200'
                            : 'border-emerald-300 bg-emerald-100/80 text-emerald-950 hover:bg-emerald-200'
                        }`}
                      >
                        {seg.sanitizedText}
                      </button>
                    );
                  }
                  if (seg.type === 'injection' && seg.injection) {
                    const inj = seg.injection;
                    const ov = activeOverrides[inj.id];
                    const isBypassed = ov && !ov.enabled;
                    return (
                      <button
                        key={seg.id}
                        type="button"
                        onClick={() => handleSelectInjectionSpan(inj)}
                        title={`Neutralized Vector: ${inj.vectorTitle}`}
                        className={`mx-0.5 inline rounded border px-1 py-0.5 font-mono text-xs font-semibold transition-colors ${
                          isBypassed
                            ? 'border-red-400 bg-red-50 text-red-900'
                            : 'border-sky-300 bg-sky-100/90 text-sky-950 hover:bg-sky-200'
                        }`}
                      >
                        {seg.sanitizedText}
                      </button>
                    );
                  }
                  return <span key={seg.id}>{seg.sanitizedText}</span>;
                })}
              </div>
            </div>
          </div>

          {/* Interactive Selected Span Manual Override & Inspector Panel */}
          {selectedSpanInfo && (
            <div className="mt-4 flex flex-col justify-between gap-4 rounded-xl border border-slate-300 bg-white p-4 lg:flex-row lg:items-center">
              {selectedSpanInfo.type === 'phi' ? (
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                    <span className="font-semibold text-slate-900">
                      Manual PHI Entity Override Inspector
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{selectedSpanInfo.entity.categoryTitle}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono">{selectedSpanInfo.entity.cfrCitation}</span>
                  </div>
                  <p className="font-mono text-xs text-slate-800">
                    Raw PHI: &ldquo;{selectedSpanInfo.entity.originalText}&rdquo; &rarr; Active
                    Output: {selectedSpanInfo.entity.replacementToken}
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-red-700">
                    <span className="font-semibold">
                      Adversarial Prompt Injection Override Inspector
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{selectedSpanInfo.injection.vectorTitle}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono">
                      Severity Weight: +{selectedSpanInfo.injection.severityWeight}
                    </span>
                  </div>
                  <p className="font-mono text-xs text-slate-800">
                    Raw Attack: &ldquo;{selectedSpanInfo.injection.matchedText}&rdquo; &rarr;{' '}
                    {selectedSpanInfo.injection.neutralizedToken}
                  </p>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                {(() => {
                  const targetId =
                    selectedSpanInfo.type === 'phi'
                      ? selectedSpanInfo.entity.id
                      : selectedSpanInfo.injection.id;
                  const rawLabel =
                    selectedSpanInfo.type === 'phi'
                      ? selectedSpanInfo.entity.originalText
                      : selectedSpanInfo.injection.matchedText;
                  const currentToken =
                    selectedSpanInfo.type === 'phi'
                      ? selectedSpanInfo.entity.replacementToken
                      : selectedSpanInfo.injection.neutralizedToken;
                  const isCurrentlyEnabled = activeOverrides[targetId]
                    ? activeOverrides[targetId].enabled
                    : true;

                  return (
                    <>
                      <label htmlFor="custom-pseudonym-input" className="sr-only">
                        Custom Pseudonym Token
                      </label>
                      <input
                        id="custom-pseudonym-input"
                        type="text"
                        value={customTokenDraft}
                        onChange={(e) => setCustomTokenDraft(e.target.value)}
                        placeholder="Custom token..."
                        className="w-48 rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1.5 font-mono text-xs text-slate-900 focus:border-sky-600 focus:bg-white focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveCustomToken(targetId, rawLabel)}
                        className="rounded-lg bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-800 whitespace-nowrap shrink-0"
                      >
                        Apply Custom Token
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleToggleEntityRedaction(targetId, rawLabel, currentToken)
                        }
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 whitespace-nowrap shrink-0"
                      >
                        {isCurrentlyEnabled
                          ? 'Bypass Redaction (Keep Raw)'
                          : 'Re-Enable Redaction'}
                      </button>
                    </>
                  );
                })()}

                <button
                  type="button"
                  onClick={() => setSelectedSpanInfo(null)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 whitespace-nowrap shrink-0"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {/* Searchable & Filterable Redaction Transformation Ledger */}
          <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Entity &amp; Threat Transformation Audit Ledger
                </h3>
                <p className="text-xs text-slate-500">
                  Filter by HIPAA Safe Harbor identifier category or toggle individual entity
                  redactions (tracked in Undo/Redo stack)
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div>
                  <label htmlFor="ledger-category-filter" className="sr-only">
                    Filter by Category
                  </label>
                  <select
                    id="ledger-category-filter"
                    value={selectedCategoryFilter}
                    onChange={(e) => onChangeCategoryFilter(e.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 focus:border-sky-600 focus:outline-none"
                  >
                    <option value="ALL">
                      All Transformations ({analysis.entities.length + analysis.injections.length})
                    </option>
                    <option value="PHI_ONLY">
                      PHI Identifiers Only ({analysis.entities.length})
                    </option>
                    <option value="INJECTIONS_ONLY">
                      Prompt Injections Only ({analysis.injections.length})
                    </option>
                    {HIPAA_IDENTIFIERS.map((spec) => (
                      <option key={spec.id} value={spec.id}>
                        {String(spec.index).padStart(2, '0')}. {spec.title} (
                        {analysis.categoryCounts[spec.id] || 0})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="ledger-search-input" className="sr-only">
                    Search transformations
                  </label>
                  <input
                    id="ledger-search-input"
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search token, CFR rule, value..."
                    className="w-56 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="max-h-[300px] overflow-y-auto rounded-lg border border-slate-200">
              <table className="w-full border-collapse text-left text-xs">
                <thead className="sticky top-0 bg-slate-100 text-[11px] font-semibold text-slate-700">
                  <tr>
                    <th className="py-2.5 pr-2 pl-3">Type / Rule</th>
                    <th className="px-2 py-2.5">Category / Vector</th>
                    <th className="px-2 py-2.5">Raw Clinical Substring</th>
                    <th className="px-2 py-2.5">Sanitized Output Token</th>
                    <th className="px-2 py-2.5 text-right">Span Offset</th>
                    <th className="py-2.5 pr-3 pl-2 text-right">Manual Override</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {filteredInjections.map((inj) => {
                    const ov = activeOverrides[inj.id];
                    const isEnabled = ov ? ov.enabled : true;
                    return (
                      <tr key={inj.id} className="hover:bg-red-50/40">
                        <td className="py-2 pr-2 pl-3 font-mono text-[11px] font-semibold text-red-700">
                          INJECTION_FIREWALL
                        </td>
                        <td className="px-2 py-2 font-medium text-slate-900">
                          {inj.vectorTitle}
                        </td>
                        <td className="max-w-xs truncate px-2 py-2 font-mono text-[11px] text-red-900">
                          {inj.matchedText}
                        </td>
                        <td className="px-2 py-2 font-mono text-[11px] font-semibold text-sky-800">
                          {inj.neutralizedToken}
                        </td>
                        <td className="px-2 py-2 text-right font-mono text-[11px] text-slate-500 tabular-nums">
                          {inj.startIndex}–{inj.endIndex}
                        </td>
                        <td className="py-2 pr-3 pl-2 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              handleToggleEntityRedaction(
                                inj.id,
                                inj.matchedText,
                                inj.neutralizedToken
                              )
                            }
                            className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap shrink-0"
                          >
                            {isEnabled ? 'Bypass Vector' : 'Restore Block'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredEntities.map((ent) => {
                    const ov = activeOverrides[ent.id];
                    const isEnabled = ov ? ov.enabled : true;
                    return (
                      <tr key={ent.id} className="hover:bg-slate-50">
                        <td className="py-2 pr-2 pl-3 font-mono text-[11px] text-slate-600">
                          {ent.cfrCitation}
                        </td>
                        <td className="px-2 py-2 font-medium text-slate-900">
                          {ent.categoryTitle}
                        </td>
                        <td className="max-w-xs truncate px-2 py-2 font-mono text-[11px] text-amber-900">
                          {ent.originalText}
                        </td>
                        <td className="px-2 py-2 font-mono text-[11px] font-semibold text-emerald-800">
                          {ent.replacementToken}
                        </td>
                        <td className="px-2 py-2 text-right font-mono text-[11px] text-slate-500 tabular-nums">
                          {ent.startIndex}–{ent.endIndex}
                        </td>
                        <td className="py-2 pr-3 pl-2 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                handleToggleEntityRedaction(
                                  ent.id,
                                  ent.originalText,
                                  ent.replacementToken
                                )
                              }
                              className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap shrink-0"
                            >
                              {isEnabled ? `Bypass '${ent.originalText.slice(0, 14)}'` : `Redact '${ent.originalText.slice(0, 14)}'`}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSelectPhiSpan(ent)}
                              className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-sky-800 hover:bg-sky-50 whitespace-nowrap shrink-0"
                            >
                              Customize
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredEntities.length === 0 && filteredInjections.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-xs text-slate-500">
                        No matching PHI entities or injection vectors for the current filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  );
};
