import React, { useState } from 'react';
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AnalysisResult } from '../utils/clinicalAnalyzer';
import { ClinicalNoteTimelinePoint } from '../utils/redactionHistory';

interface ComplianceAuditGeneratorProps {
  analysis: AnalysisResult;
  healthTimeline: ClinicalNoteTimelinePoint[];
  onRecordCurrentNoteToTimeline: () => void;
  onDownloadCertificate: () => void;
}

export const ComplianceAuditGenerator: React.FC<ComplianceAuditGeneratorProps> = ({
  analysis,
  healthTimeline,
  onRecordCurrentNoteToTimeline,
  onDownloadCertificate,
}) => {
  const [copiedJson, setCopiedJson] = useState(false);
  const cert = analysis.auditCertificate;
  const formattedJson = JSON.stringify(cert, null, 2);

  const handleCopyJson = async () => {
    try {
      await navigator.clipboard.writeText(formattedJson);
    } catch {
      // Fallback if clipboard restricted
    }
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  const averageRiskScore =
    healthTimeline.length > 0
      ? Math.round(
          healthTimeline.reduce((acc, pt) => acc + pt.injectionRiskScore, 0) /
            healthTimeline.length
        )
      : 0;

  const totalScrubbedAcrossFive = healthTimeline.reduce(
    (acc, pt) => acc + pt.scrubbedPhiCount,
    0
  );

  return (
    <section
      id="compliance-audit"
      aria-labelledby="compliance-audit-heading"
      className="scroll-mt-20"
    >
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-wider text-sky-700 uppercase">
            04. Compliance Audit Log Generator &amp; Sanitization Health Dashboard
          </p>
          <h2
            id="compliance-audit-heading"
            className="mt-1 text-2xl font-bold tracking-tight text-slate-900"
          >
            Cryptographic HIPAA Safe Harbor Certificate &amp; 5-Note Risk Trend
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Tracks injection risk score trajectories across the last 5 evaluated clinical notes and
            generates a machine-verifiable JSON compliance certificate logging scrubbed PHI counts
            and HIPAA/GDPR readiness status.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onRecordCurrentNoteToTimeline}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 whitespace-nowrap shrink-0"
          >
            Log Current Note to Timeline
          </button>
          <button
            type="button"
            onClick={handleCopyJson}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 whitespace-nowrap shrink-0"
          >
            {copiedJson ? 'Copied Certificate JSON' : 'Copy Audit JSON'}
          </button>
          <button
            type="button"
            onClick={onDownloadCertificate}
            className="rounded-lg bg-sky-700 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-sky-800 whitespace-nowrap shrink-0"
          >
            Download JSON Compliance Certificate
          </button>
        </div>
      </div>

      {/* Summary Audit Metrics Row */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <span className="text-xs font-medium text-slate-500">
            Scrubbed PHI Entities (Total)
          </span>
          <div
            data-testid="audit-scrubbed-phi-count"
            className="mt-1 font-mono text-2xl font-bold text-slate-900 tabular-nums"
          >
            {cert.phiDeIdentificationSummary.totalScrubbedEntities}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {cert.phiDeIdentificationSummary.uniqueHipaaCategoriesDetected}/18 Safe Harbor
            Categories Matched
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <span className="text-xs font-medium text-slate-500">
            Prompt Injection Risk Score
          </span>
          <div className="mt-1 font-mono text-2xl font-bold text-slate-900 tabular-nums">
            {cert.promptInjectionFirewallSummary.injectionRiskScore}/100
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {cert.promptInjectionFirewallSummary.detectedAttackVectorsCount} Vector(s) ·{' '}
            {cert.promptInjectionFirewallSummary.riskClassification}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <span className="text-xs font-medium text-slate-500">
            HIPAA 45 CFR §164.514(b)(2)
          </span>
          <div
            className={`mt-1 font-mono text-base font-bold ${
              cert.regulatoryReadiness.hipaaSafeHarborStatus ===
              'COMPLIANT_SAFE_HARBOR_45_CFR_164_514'
                ? 'text-emerald-700'
                : 'text-amber-700'
            }`}
          >
            {cert.regulatoryReadiness.hipaaSafeHarborStatus ===
            'COMPLIANT_SAFE_HARBOR_45_CFR_164_514'
              ? 'SAFE HARBOR COMPLIANT'
              : 'REQUIRES REDACTION'}
          </div>
          <p className="mt-1 truncate font-mono text-[11px] text-slate-500">
            {cert.regulatoryReadiness.hipaaSafeHarborStatus}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <span className="text-xs font-medium text-slate-500">
            GDPR Art. 9 &amp; Art. 32 Status
          </span>
          <div
            className={`mt-1 font-mono text-base font-bold ${
              cert.regulatoryReadiness.gdprStatus ===
              'READY_GDPR_ART_9_AND_32_PSEUDONYMIZED'
                ? 'text-emerald-700'
                : 'text-amber-700'
            }`}
          >
            {cert.regulatoryReadiness.gdprStatus === 'READY_GDPR_ART_9_AND_32_PSEUDONYMIZED'
              ? 'GDPR ART. 9 & 32 READY'
              : 'NON-COMPLIANT RAW PHI'}
          </div>
          <p className="mt-1 truncate font-mono text-[11px] text-slate-500">
            {cert.regulatoryReadiness.gdprStatus}
          </p>
        </div>
      </div>

      {/* Recharts Sanitization Health Dashboard (Last 5 Tested Clinical Notes) */}
      <div
        data-testid="sanitization-health-dashboard"
        className="mb-6 rounded-xl border border-slate-200 bg-white p-5"
      >
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Sanitization Health Dashboard (Last 5 Tested Clinical Notes)
            </h3>
            <p className="text-xs text-slate-500">
              Longitudinal telemetry of Prompt Injection Risk Scores (0–100) vs. Scrubbed PHI
              Entity Counts across evaluated notes
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 font-mono text-xs text-slate-600 tabular-nums">
            <span>5-Note Mean Risk: {averageRiskScore}/100</span>
            <span aria-hidden="true">·</span>
            <span>Cumulative Scrubbed PHI: {totalScrubbedAcrossFive} Entities</span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-center">
          <div className="h-72 min-h-[288px] w-full lg:col-span-7">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={healthTimeline}
                margin={{ top: 12, right: 16, left: 0, bottom: 8 }}
              >
                <defs>
                  <linearGradient id="riskScoreGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#dc2626" stopOpacity={0.22} />
                    <stop offset="95%" stopColor="#dc2626" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis
                  dataKey="slotLabel"
                  tick={{ fill: '#475569', fontSize: 11, fontFamily: 'IBM Plex Mono' }}
                  axisLine={{ stroke: '#cbd5e1' }}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="risk"
                  domain={[0, 100]}
                  tick={{ fill: '#475569', fontSize: 11, fontFamily: 'IBM Plex Mono' }}
                  axisLine={false}
                  tickLine={false}
                  unit=""
                />
                <YAxis
                  yAxisId="phi"
                  orientation="right"
                  domain={[0, 40]}
                  tick={{ fill: '#0369a1', fontSize: 11, fontFamily: 'IBM Plex Mono' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#1e293b',
                    borderRadius: '8px',
                    color: '#f8fafc',
                    fontSize: '12px',
                    fontFamily: 'IBM Plex Mono',
                  }}
                />
                <ReferenceLine
                  yAxisId="risk"
                  y={75}
                  stroke="#dc2626"
                  strokeDasharray="4 4"
                  label={{
                    value: 'Critical Threshold (75)',
                    position: 'insideTopLeft',
                    fill: '#dc2626',
                    fontSize: 10,
                  }}
                />
                <Bar
                  yAxisId="phi"
                  dataKey="scrubbedPhiCount"
                  name="Scrubbed PHI Entities"
                  fill="#0284c7"
                  radius={[4, 4, 0, 0]}
                  barSize={24}
                />
                <Area
                  yAxisId="risk"
                  type="monotone"
                  dataKey="injectionRiskScore"
                  name="Injection Risk Score (0-100)"
                  stroke="#dc2626"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#riskScoreGradient)"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* 5-Note Timeline Breakdown Table */}
          <div className="overflow-x-auto rounded-lg border border-slate-200 lg:col-span-5">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="bg-slate-100 text-[11px] font-semibold text-slate-700">
                <tr>
                  <th className="py-2 pr-2 pl-3">Seq</th>
                  <th className="px-2 py-2">Clinical Note</th>
                  <th className="px-2 py-2 text-right">PHI Scrubbed</th>
                  <th className="py-2 pr-3 pl-2 text-right">Risk Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {healthTimeline.map((pt) => (
                  <tr key={pt.runId} className="hover:bg-slate-50">
                    <td className="py-2 pr-2 pl-3 font-mono text-[11px] text-slate-600 whitespace-nowrap tabular-nums">
                      {pt.slotLabel}
                    </td>
                    <td className="px-2 py-2">
                      <div className="font-medium text-slate-900">{pt.payloadShortTitle}</div>
                      <div className="text-[11px] text-slate-500">{pt.specialty}</div>
                    </td>
                    <td className="px-2 py-2 text-right font-mono text-xs font-semibold text-sky-800 tabular-nums">
                      {pt.scrubbedPhiCount}
                    </td>
                    <td className="py-2 pr-3 pl-2 text-right font-mono text-xs font-bold tabular-nums">
                      <span
                        className={
                          pt.injectionRiskScore >= 75
                            ? 'text-red-600'
                            : pt.injectionRiskScore >= 45
                            ? 'text-amber-600'
                            : 'text-emerald-600'
                        }
                      >
                        {pt.injectionRiskScore}/100
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* JSON Certificate Preview & Attestation Panel */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-stretch">
        <div className="flex flex-col rounded-xl border border-slate-200 bg-white lg:col-span-5">
          <div className="border-b border-slate-200 px-5 py-3.5">
            <h3 className="text-sm font-semibold text-slate-900">
              Compliance Certificate Attestation Summary
            </h3>
            <p className="text-xs text-slate-500">
              Cryptographic metadata &amp; regulatory governance record
            </p>
          </div>

          <div className="flex-1 divide-y divide-slate-200 px-5 py-2 text-xs">
            <div className="py-3">
              <span className="block text-slate-500">Certificate Identifier</span>
              <span className="mt-0.5 block font-mono font-semibold text-slate-900">
                {cert.certificateId}
              </span>
            </div>
            <div className="py-3">
              <span className="block text-slate-500">Health Informatics &amp; Security Lead</span>
              <span className="mt-0.5 block font-medium text-slate-900">
                {cert.architectAttribution}
              </span>
            </div>
            <div className="py-3">
              <span className="block text-slate-500">Evaluated Clinical Payload</span>
              <span className="mt-0.5 block font-medium text-slate-900">
                {cert.payloadTitle} ({cert.payloadId})
              </span>
            </div>
            <div className="py-3">
              <span className="block text-slate-500">Redaction &amp; Date-Shift Policy</span>
              <span className="mt-0.5 block font-mono text-slate-800">
                {cert.configuration.redactionMode} · Offset {cert.configuration.dateShiftOffset}
              </span>
            </div>
            <div className="py-3">
              <span className="block text-slate-500">
                Sanitized Payload Integrity Digest (SHA-256)
              </span>
              <span className="mt-0.5 block break-all font-mono text-[11px] text-slate-700">
                {cert.regulatoryReadiness.sha256PayloadDigest}
              </span>
            </div>
            <div className="py-3">
              <span className="block text-slate-500">Downstream LLM Ingestion Clearance</span>
              <span
                className={`mt-0.5 block font-mono font-semibold ${
                  cert.regulatoryReadiness.llmIngestionCleared
                    ? 'text-emerald-700'
                    : 'text-amber-700'
                }`}
              >
                {cert.regulatoryReadiness.llmIngestionCleared
                  ? 'CLEARED FOR CLINICAL LLM INGESTION'
                  : 'HOLD — REVIEW UNFILTERED PAYLOAD'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-col rounded-xl border border-slate-200 bg-slate-900 text-slate-100 lg:col-span-7">
          <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3.5">
            <div>
              <h3 className="font-mono text-xs font-semibold text-white">
                {cert.certificateId.toLowerCase()}.json
              </h3>
              <p className="text-[11px] text-slate-400">
                Live serialized compliance audit artifact
              </p>
            </div>
            <span className="font-mono text-[11px] text-slate-400 tabular-nums">
              {formattedJson.length} bytes
            </span>
          </div>

          <div className="flex-1 p-5">
            <pre
              data-testid="compliance-json-preview"
              className="max-h-[420px] overflow-auto font-mono text-xs leading-relaxed text-emerald-300"
            >
              {formattedJson}
            </pre>
          </div>
        </div>
      </div>
    </section>
  );
};
