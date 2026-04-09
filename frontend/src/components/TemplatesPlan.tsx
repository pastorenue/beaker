import React from 'react';

type Approval = { role: string; name: string; date: string };
type Guardrail = { metric: string; threshold: string };
type Risk = { risk: string; mitigation: string };
type Tooling = { category: string; tool: string };
type SegmentNote = { segment: string; summary: string };
type ActionItem = { action: string; owner: string; date: string };

const emptyApproval: Approval = { role: '', name: '', date: '' };
const emptyGuardrail: Guardrail = { metric: '', threshold: '' };
const emptyRisk: Risk = { risk: '', mitigation: '' };
const emptyTool: Tooling = { category: '', tool: '' };
const emptySegment: SegmentNote = { segment: '', summary: '' };
const emptyAction: ActionItem = { action: '', owner: '', date: '' };

const line = (value: string) => (value.trim().length ? value : '--');
const removeAt = <T,>(
    index: number,
    fallback: () => T,
    setList: React.Dispatch<React.SetStateAction<T[]>>
) => {
    setList((prev) => (prev.length <= 1 ? [fallback()] : prev.filter((_, idx) => idx !== index)));
};

export const TemplatesPlan: React.FC = () => {
    const [docId, setDocId] = React.useState('');
    const [title, setTitle] = React.useState('');
    const [owner, setOwner] = React.useState('');
    const [contributors, setContributors] = React.useState('');
    const [createdAt, setCreatedAt] = React.useState('');
    const [updatedAt, setUpdatedAt] = React.useState('');
    const [status, setStatus] = React.useState('Draft');
    const [version, setVersion] = React.useState('v0.1');
    const [confidentiality, setConfidentiality] = React.useState('Internal');
    const [approvals, setApprovals] = React.useState<Approval[]>([
        { role: 'Product', name: '', date: '' },
        { role: 'Engineering', name: '', date: '' },
        { role: 'Data/Analytics', name: '', date: '' },
    ]);

    const [hypothesis, setHypothesis] = React.useState('');
    const [problemEvidence, setProblemEvidence] = React.useState('');
    const [expectedOutcome, setExpectedOutcome] = React.useState('');
    const [primarySources, setPrimarySources] = React.useState('');
    const [baselineMetric, setBaselineMetric] = React.useState('');
    const [baselineRange, setBaselineRange] = React.useState('');
    const [audienceSegment, setAudienceSegment] = React.useState('');

    const [experimentDescription, setExperimentDescription] = React.useState('');
    const [surface, setSurface] = React.useState('');
    const [change, setChange] = React.useState('');
    const [control, setControl] = React.useState('');
    const [variants, setVariants] = React.useState('');
    const [design, setDesign] = React.useState('A/B');
    const [randomizationUnit, setRandomizationUnit] = React.useState('User');
    const [allocation, setAllocation] = React.useState('50/50');
    const [rampPlan, setRampPlan] = React.useState('');
    const [eligibility, setEligibility] = React.useState('');
    const [duration, setDuration] = React.useState('');
    const [surfaces, setSurfaces] = React.useState('');
    const [tracking, setTracking] = React.useState('');
    const [qaPlan, setQaPlan] = React.useState('');
    const [rollbackPlan, setRollbackPlan] = React.useState('');

    const [successMetric, setSuccessMetric] = React.useState('');
    const [metricDefinition, setMetricDefinition] = React.useState('');
    const [metricFormula, setMetricFormula] = React.useState('');
    const [metricSource, setMetricSource] = React.useState('');
    const [measurementWindow, setMeasurementWindow] = React.useState('');
    const [baselineValue, setBaselineValue] = React.useState('');

    const [minUplift, setMinUplift] = React.useState('');
    const [confidenceLevel, setConfidenceLevel] = React.useState('95%');
    const [statsMethod, setStatsMethod] = React.useState('Frequentist');
    const [guardrails, setGuardrails] = React.useState<Guardrail[]>([emptyGuardrail]);

    const [buildWindow, setBuildWindow] = React.useState('');
    const [qaWindow, setQaWindow] = React.useState('');
    const [runWindow, setRunWindow] = React.useState('');
    const [analysisWindow, setAnalysisWindow] = React.useState('');
    const [decisionDate, setDecisionDate] = React.useState('');
    const [estimatedTime, setEstimatedTime] = React.useState('');

    const [blockers, setBlockers] = React.useState('');
    const [risks, setRisks] = React.useState<Risk[]>([emptyRisk]);
    const [tools, setTools] = React.useState<Tooling[]>([
        { category: 'Experiment platform', tool: '' },
        { category: 'Analytics', tool: '' },
        { category: 'Feature flags', tool: '' },
    ]);
    const [cost, setCost] = React.useState('');
    const [costBreakdown, setCostBreakdown] = React.useState('');

    const [impactScore, setImpactScore] = React.useState('3');
    const [confidenceScore, setConfidenceScore] = React.useState('3');
    const [easeScore, setEaseScore] = React.useState('3');
    const [impactRationale, setImpactRationale] = React.useState('');
    const [confidenceRationale, setConfidenceRationale] = React.useState('');
    const [easeRationale, setEaseRationale] = React.useState('');

    const [runStart, setRunStart] = React.useState('');
    const [runEnd, setRunEnd] = React.useState('');
    const [finalAllocation, setFinalAllocation] = React.useState('');
    const [incidentNotes, setIncidentNotes] = React.useState('');
    const [deviations, setDeviations] = React.useState('');

    const [result, setResult] = React.useState('Inconclusive');
    const [primaryChange, setPrimaryChange] = React.useState('');
    const [significance, setSignificance] = React.useState('');
    const [guardrailImpact, setGuardrailImpact] = React.useState('');
    const [keyTables, setKeyTables] = React.useState('');
    const [segments, setSegments] = React.useState<SegmentNote[]>([emptySegment]);

    const [learnings, setLearnings] = React.useState('');
    const [whatWorked, setWhatWorked] = React.useState('');
    const [whatDidNot, setWhatDidNot] = React.useState('');
    const [unexpected, setUnexpected] = React.useState('');
    const [methodImprovements, setMethodImprovements] = React.useState('');

    const [nextStep, setNextStep] = React.useState('');
    const [decision, setDecision] = React.useState('Hold');
    const [actions, setActions] = React.useState<ActionItem[]>([emptyAction]);
    const [appendices, setAppendices] = React.useState('');

    const iceTotal = Number(impactScore) + Number(confidenceScore) + Number(easeScore);

    const templateText = React.useMemo(() => {
        const approvalsLines = approvals
            .map((item) => `- ${line(item.role)}: ${line(item.name)} ${item.date ? `(${item.date})` : ''}`.trim())
            .join('\n');
        const guardrailLines = guardrails
            .filter((item) => item.metric || item.threshold)
            .map((item, idx) => `- Guardrail metric #${idx + 1}: ${line(item.metric)} -- ${line(item.threshold)}`)
            .join('\n');
        const riskLines = risks
            .filter((item) => item.risk || item.mitigation)
            .map((item) => `- Risk: ${line(item.risk)} -> Mitigation: ${line(item.mitigation)}`)
            .join('\n');
        const toolLines = tools
            .filter((item) => item.category || item.tool)
            .map((item) => `- ${line(item.category)}: ${line(item.tool)}`)
            .join('\n');
        const segmentLines = segments
            .filter((item) => item.segment || item.summary)
            .map((item) => `- Segment: ${line(item.segment)} -> ${line(item.summary)}`)
            .join('\n');
        const actionLines = actions
            .filter((item) => item.action || item.owner || item.date)
            .map((item) => `- ${line(item.action)} -- ${line(item.owner)} -- ${line(item.date)}`)
            .join('\n');

        return [
            '# Experimentation Plan & Report (Growth)',
            '',
            '## 0) Document Control',
            `Experiment ID: ${line(docId)}`,
            `Title: ${line(title)}`,
            `Owner: ${line(owner)}`,
            `Contributors: ${line(contributors)}`,
            `Date Created: ${line(createdAt)}`,
            `Last Updated: ${line(updatedAt)}`,
            `Status: ${line(status)}`,
            `Version: ${line(version)}`,
            `Confidentiality: ${line(confidentiality)}`,
            '',
            'Approvals',
            approvalsLines || '- --',
            '',
            '## 1) Hypothesis (Problem -> Solution -> Expected Outcome)',
            `We believe that ${line(hypothesis)}.`,
            `Because ${line(problemEvidence)}.`,
            `So that ${line(expectedOutcome)}.`,
            '',
            'Evidence & Context',
            `- Primary data source(s): ${line(primarySources)}`,
            `- Baseline metric value(s): ${line(baselineMetric)} (${line(baselineRange)})`,
            `- Audience/segment affected: ${line(audienceSegment)}`,
            '',
            '## 2) Experiment Description & Methodology',
            `To verify this, we will ${line(experimentDescription)}.`,
            '',
            'What we will test',
            `- Surface/step: ${line(surface)}`,
            `- Change being introduced: ${line(change)}`,
            `- Control vs. Variant(s): ${line(control)} / ${line(variants)}`,
            '',
            'Methodology',
            `- Design: ${line(design)}`,
            `- Randomization unit: ${line(randomizationUnit)}`,
            `- Allocation: ${line(allocation)}`,
            `- Ramp plan: ${line(rampPlan)}`,
            `- Exposures/eligibility: ${line(eligibility)}`,
            `- Duration: ${line(duration)}`,
            '',
            'Implementation Notes',
            `- Primary surfaces: ${line(surfaces)}`,
            `- Tracking requirements: ${line(tracking)}`,
            `- QA plan: ${line(qaPlan)}`,
            `- Rollback plan: ${line(rollbackPlan)}`,
            '',
            '## 3) Success Metric (Primary KPI)',
            `We will measure the evolution of ${line(successMetric)}.`,
            `- Definition: ${line(metricDefinition)}`,
            `- Calculation: ${line(metricFormula)}`,
            `- Source: ${line(metricSource)}`,
            `- Measurement window: ${line(measurementWindow)}`,
            `- Baseline: ${line(baselineValue)}`,
            '',
            '## 4) Success Criteria & Damage Control',
            `We are right if ${line(minUplift)} (confidence: ${line(confidenceLevel)}; method: ${line(statsMethod)}).`,
            'Success Criteria',
            `- Minimum uplift: ${line(minUplift)}`,
            `- Confidence level: ${line(confidenceLevel)}`,
            `- Statistical method: ${line(statsMethod)}`,
            '',
            'Damage Control (Guardrails)',
            guardrailLines || '- --',
            '',
            '## 5) Estimated Time',
            `The experiment will run during ${line(estimatedTime)}.`,
            `- Build: ${line(buildWindow)}`,
            `- QA / Validation: ${line(qaWindow)}`,
            `- Run: ${line(runWindow)}`,
            `- Analysis: ${line(analysisWindow)}`,
            `- Decision: ${line(decisionDate)}`,
            '',
            '## 6) Potential Blockers',
            `We've identified ${line(blockers)} as potential blockers.`,
            'Risks & Mitigations',
            riskLines || '- --',
            '',
            '## 7) Tools Needed',
            "We'll build the experiment with:",
            toolLines || '- --',
            '',
            '## 8) Estimated Cost',
            `The cost of the experiment is ${line(cost)}.`,
            `- Cost breakdown: ${line(costBreakdown)}`,
            '',
            '## 9) ICE Score (Prioritization)',
            `ICE Score: ${iceTotal || 0}`,
            `- Impact: ${line(impactScore)} (${line(impactRationale)})`,
            `- Confidence: ${line(confidenceScore)} (${line(confidenceRationale)})`,
            `- Ease: ${line(easeScore)} (${line(easeRationale)})`,
            '',
            '## 10) Execution Log (During Run)',
            `Run Start: ${line(runStart)}`,
            `Run End (Actual): ${line(runEnd)}`,
            `Allocation: ${line(finalAllocation)}`,
            `Notes/Incidents: ${line(incidentNotes)}`,
            `Deviations: ${line(deviations)}`,
            '',
            '## 11) Results & Analysis (Post-Run)',
            `Outcome: ${line(result)}`,
            `Primary metric change: ${line(primaryChange)}`,
            `Statistical significance: ${line(significance)}`,
            `Guardrail impact: ${line(guardrailImpact)}`,
            `Key tables: ${line(keyTables)}`,
            'Segment Analysis',
            segmentLines || '- --',
            '',
            '## 12) Learnings',
            `We've learned: ${line(learnings)}`,
            `- What worked: ${line(whatWorked)}`,
            `- What did not: ${line(whatDidNot)}`,
            `- Unexpected findings: ${line(unexpected)}`,
            `- Methodology improvements: ${line(methodImprovements)}`,
            '',
            '## 13) Next Steps',
            `We now have clear data to ${line(nextStep)}.`,
            `Decision: ${line(decision)}`,
            'Follow-up Actions',
            actionLines || '- --',
            '',
            '## 14) Appendices',
            line(appendices),
        ].join('\n');
    }, [
        actions,
        allocation,
        analysisWindow,
        appendices,
        approvals,
        audienceSegment,
        baselineMetric,
        baselineRange,
        baselineValue,
        blockers,
        buildWindow,
        change,
        confidenceLevel,
        confidenceRationale,
        confidenceScore,
        contributors,
        control,
        cost,
        costBreakdown,
        createdAt,
        decision,
        decisionDate,
        design,
        deviations,
        docId,
        duration,
        easeRationale,
        easeScore,
        eligibility,
        estimatedTime,
        experimentDescription,
        expectedOutcome,
        finalAllocation,
        guardrailImpact,
        guardrails,
        hypothesis,
        impactRationale,
        impactScore,
        incidentNotes,
        keyTables,
        learnings,
        measurementWindow,
        metricDefinition,
        metricFormula,
        metricSource,
        minUplift,
        nextStep,
        owner,
        primaryChange,
        primarySources,
        problemEvidence,
        qaPlan,
        qaWindow,
        rampPlan,
        randomizationUnit,
        result,
        risks,
        rollbackPlan,
        runEnd,
        runStart,
        runWindow,
        segments,
        significance,
        statsMethod,
        status,
        surface,
        successMetric,
        title,
        tools,
        tracking,
        updatedAt,
        variants,
        version,
    ]);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(templateText);
        } catch (error) {
            console.warn('Failed to copy template', error);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-medium text-slate-100">Templates / Plan</h2>
                    <p className="mt-1 text-slate-400">
                        Generate a formal experimentation plan and report template for growth teams.
                    </p>
                </div>
                <button className="btn-secondary" onClick={handleCopy}>
                    Copy plan as Markdown
                </button>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="space-y-6">
                    <div className="card space-y-4">
                        <h2>Document Control</h2>
                        <div className="grid gap-4 md:grid-cols-2">
                            <input
                                className="input"
                                placeholder="Experiment ID"
                                value={docId}
                                onChange={(event) => setDocId(event.target.value)}
                            />
                            <input
                                className="input"
                                placeholder="Title"
                                value={title}
                                onChange={(event) => setTitle(event.target.value)}
                            />
                            <input
                                className="input"
                                placeholder="Owner"
                                value={owner}
                                onChange={(event) => setOwner(event.target.value)}
                            />
                            <input
                                className="input"
                                placeholder="Contributors"
                                value={contributors}
                                onChange={(event) => setContributors(event.target.value)}
                            />
                            <input
                                className="input"
                                placeholder="Date Created"
                                value={createdAt}
                                onChange={(event) => setCreatedAt(event.target.value)}
                            />
                            <input
                                className="input"
                                placeholder="Last Updated"
                                value={updatedAt}
                                onChange={(event) => setUpdatedAt(event.target.value)}
                            />
                            <input
                                className="input"
                                placeholder="Status"
                                value={status}
                                onChange={(event) => setStatus(event.target.value)}
                            />
                            <input
                                className="input"
                                placeholder="Version"
                                value={version}
                                onChange={(event) => setVersion(event.target.value)}
                            />
                            <input
                                className="input"
                                placeholder="Confidentiality"
                                value={confidentiality}
                                onChange={(event) => setConfidentiality(event.target.value)}
                            />
                        </div>
                        <div className="space-y-3">
                            <div className="text-xs text-slate-500">Approvals</div>
                            {approvals.map((item, index) => (
                                <div
                                    key={`approval-${index}`}
                                    className="grid items-center gap-3 md:grid-cols-[1fr_1fr_160px_28px]"
                                >
                                    <input
                                        className="input"
                                        placeholder="Role"
                                        value={item.role}
                                        onChange={(event) => {
                                            const next = [...approvals];
                                            next[index] = { ...next[index], role: event.target.value };
                                            setApprovals(next);
                                        }}
                                    />
                                    <input
                                        className="input"
                                        placeholder="Approver"
                                        value={item.name}
                                        onChange={(event) => {
                                            const next = [...approvals];
                                            next[index] = { ...next[index], name: event.target.value };
                                            setApprovals(next);
                                        }}
                                    />
                                    <input
                                        className="input"
                                        placeholder="Date"
                                        value={item.date}
                                        onChange={(event) => {
                                            const next = [...approvals];
                                            next[index] = { ...next[index], date: event.target.value };
                                            setApprovals(next);
                                        }}
                                    />
                                    <button
                                        type="button"
                                        className="icon-action icon-action--close"
                                        aria-label="Remove approval"
                                        onClick={() => removeAt(index, () => ({ ...emptyApproval }), setApprovals)}
                                    >
                                        <span aria-hidden="true">&times;</span>
                                    </button>
                                </div>
                            ))}
                            <button
                                className="btn-secondary"
                                onClick={() => setApprovals((prev) => [...prev, { ...emptyApproval }])}
                            >
                                + Add approval
                            </button>
                        </div>
                    </div>

                    <div className="card space-y-4">
                        <h2>Hypothesis</h2>
                        <textarea
                            className="textarea"
                            placeholder="We believe that..."
                            value={hypothesis}
                            onChange={(event) => setHypothesis(event.target.value)}
                        />
                        <textarea
                            className="textarea"
                            placeholder="Problem identified and evidence..."
                            value={problemEvidence}
                            onChange={(event) => setProblemEvidence(event.target.value)}
                        />
                        <textarea
                            className="textarea"
                            placeholder="Expected growth outcome..."
                            value={expectedOutcome}
                            onChange={(event) => setExpectedOutcome(event.target.value)}
                        />
                        <div className="grid gap-4 md:grid-cols-2">
                            <input
                                className="input"
                                placeholder="Primary data sources"
                                value={primarySources}
                                onChange={(event) => setPrimarySources(event.target.value)}
                            />
                            <input
                                className="input"
                                placeholder="Audience/segment"
                                value={audienceSegment}
                                onChange={(event) => setAudienceSegment(event.target.value)}
                            />
                            <input
                                className="input"
                                placeholder="Baseline metric"
                                value={baselineMetric}
                                onChange={(event) => setBaselineMetric(event.target.value)}
                            />
                            <input
                                className="input"
                                placeholder="Baseline date range"
                                value={baselineRange}
                                onChange={(event) => setBaselineRange(event.target.value)}
                            />
                        </div>
                    </div>

                    <div className="card space-y-4">
                        <h2>Experiment Design</h2>
                        <textarea
                            className="textarea"
                            placeholder="Experiment description"
                            value={experimentDescription}
                            onChange={(event) => setExperimentDescription(event.target.value)}
                        />
                        <div className="grid gap-4 md:grid-cols-2">
                            <input
                                className="input"
                                placeholder="Surface / step"
                                value={surface}
                                onChange={(event) => setSurface(event.target.value)}
                            />
                            <input
                                className="input"
                                placeholder="Change introduced"
                                value={change}
                                onChange={(event) => setChange(event.target.value)}
                            />
                            <input
                                className="input"
                                placeholder="Control definition"
                                value={control}
                                onChange={(event) => setControl(event.target.value)}
                            />
                            <input
                                className="input"
                                placeholder="Variant(s)"
                                value={variants}
                                onChange={(event) => setVariants(event.target.value)}
                            />
                            <input
                                className="input"
                                placeholder="Design"
                                value={design}
                                onChange={(event) => setDesign(event.target.value)}
                            />
                            <input
                                className="input"
                                placeholder="Randomization unit"
                                value={randomizationUnit}
                                onChange={(event) => setRandomizationUnit(event.target.value)}
                            />
                            <input
                                className="input"
                                placeholder="Allocation"
                                value={allocation}
                                onChange={(event) => setAllocation(event.target.value)}
                            />
                            <input
                                className="input"
                                placeholder="Ramp plan"
                                value={rampPlan}
                                onChange={(event) => setRampPlan(event.target.value)}
                            />
                            <input
                                className="input"
                                placeholder="Eligibility"
                                value={eligibility}
                                onChange={(event) => setEligibility(event.target.value)}
                            />
                            <input
                                className="input"
                                placeholder="Estimated duration"
                                value={duration}
                                onChange={(event) => setDuration(event.target.value)}
                            />
                        </div>
                        <textarea
                            className="textarea"
                            placeholder="Primary surfaces / URLs"
                            value={surfaces}
                            onChange={(event) => setSurfaces(event.target.value)}
                        />
                        <textarea
                            className="textarea"
                            placeholder="Tracking requirements"
                            value={tracking}
                            onChange={(event) => setTracking(event.target.value)}
                        />
                        <textarea
                            className="textarea"
                            placeholder="QA plan"
                            value={qaPlan}
                            onChange={(event) => setQaPlan(event.target.value)}
                        />
                        <textarea
                            className="textarea"
                            placeholder="Rollback plan"
                            value={rollbackPlan}
                            onChange={(event) => setRollbackPlan(event.target.value)}
                        />
                    </div>

                    <div className="card space-y-4">
                        <h2>Success Metric & Guardrails</h2>
                        <input
                            className="input"
                            placeholder="Primary success metric"
                            value={successMetric}
                            onChange={(event) => setSuccessMetric(event.target.value)}
                        />
                        <div className="grid gap-4 md:grid-cols-2">
                            <input
                                className="input"
                                placeholder="Metric definition"
                                value={metricDefinition}
                                onChange={(event) => setMetricDefinition(event.target.value)}
                            />
                            <input
                                className="input"
                                placeholder="Metric formula"
                                value={metricFormula}
                                onChange={(event) => setMetricFormula(event.target.value)}
                            />
                            <input
                                className="input"
                                placeholder="Metric source"
                                value={metricSource}
                                onChange={(event) => setMetricSource(event.target.value)}
                            />
                            <input
                                className="input"
                                placeholder="Measurement window"
                                value={measurementWindow}
                                onChange={(event) => setMeasurementWindow(event.target.value)}
                            />
                            <input
                                className="input"
                                placeholder="Baseline value"
                                value={baselineValue}
                                onChange={(event) => setBaselineValue(event.target.value)}
                            />
                        </div>
                        <div className="grid gap-4 md:grid-cols-3">
                            <input
                                className="input"
                                placeholder="Minimum uplift"
                                value={minUplift}
                                onChange={(event) => setMinUplift(event.target.value)}
                            />
                            <input
                                className="input"
                                placeholder="Confidence level"
                                value={confidenceLevel}
                                onChange={(event) => setConfidenceLevel(event.target.value)}
                            />
                            <input
                                className="input"
                                placeholder="Statistical method"
                                value={statsMethod}
                                onChange={(event) => setStatsMethod(event.target.value)}
                            />
                        </div>
                        <div className="space-y-3">
                            <div className="text-xs text-slate-500">Guardrails</div>
                            {guardrails.map((item, index) => (
                                <div
                                    key={`guardrail-${index}`}
                                    className="grid items-center gap-3 md:grid-cols-[1fr_1fr_28px]"
                                >
                                    <input
                                        className="input"
                                        placeholder="Guardrail metric"
                                        value={item.metric}
                                        onChange={(event) => {
                                            const next = [...guardrails];
                                            next[index] = { ...next[index], metric: event.target.value };
                                            setGuardrails(next);
                                        }}
                                    />
                                    <input
                                        className="input"
                                        placeholder="Threshold"
                                        value={item.threshold}
                                        onChange={(event) => {
                                            const next = [...guardrails];
                                            next[index] = { ...next[index], threshold: event.target.value };
                                            setGuardrails(next);
                                        }}
                                    />
                                    <button
                                        type="button"
                                        className="icon-action icon-action--close"
                                        aria-label="Remove guardrail"
                                        onClick={() => removeAt(index, () => ({ ...emptyGuardrail }), setGuardrails)}
                                    >
                                        <span aria-hidden="true">&times;</span>
                                    </button>
                                </div>
                            ))}
                            <button
                                className="btn-secondary"
                                onClick={() => setGuardrails((prev) => [...prev, { ...emptyGuardrail }])}
                            >
                                + Add guardrail
                            </button>
                        </div>
                    </div>

                    <div className="card space-y-4">
                        <h2>Timeline & Blockers</h2>
                        <input
                            className="input"
                            placeholder="Estimated time (summary)"
                            value={estimatedTime}
                            onChange={(event) => setEstimatedTime(event.target.value)}
                        />
                        <div className="grid gap-4 md:grid-cols-2">
                            <input
                                className="input"
                                placeholder="Build window"
                                value={buildWindow}
                                onChange={(event) => setBuildWindow(event.target.value)}
                            />
                            <input
                                className="input"
                                placeholder="QA / Validation window"
                                value={qaWindow}
                                onChange={(event) => setQaWindow(event.target.value)}
                            />
                            <input
                                className="input"
                                placeholder="Run window"
                                value={runWindow}
                                onChange={(event) => setRunWindow(event.target.value)}
                            />
                            <input
                                className="input"
                                placeholder="Analysis window"
                                value={analysisWindow}
                                onChange={(event) => setAnalysisWindow(event.target.value)}
                            />
                            <input
                                className="input"
                                placeholder="Decision date"
                                value={decisionDate}
                                onChange={(event) => setDecisionDate(event.target.value)}
                            />
                        </div>
                        <textarea
                            className="textarea"
                            placeholder="Potential blockers"
                            value={blockers}
                            onChange={(event) => setBlockers(event.target.value)}
                        />
                        <div className="space-y-3">
                            <div className="text-xs text-slate-500">Risks & Mitigations</div>
                            {risks.map((item, index) => (
                                <div
                                    key={`risk-${index}`}
                                    className="grid items-center gap-3 md:grid-cols-[1fr_1fr_28px]"
                                >
                                    <input
                                        className="input"
                                        placeholder="Risk"
                                        value={item.risk}
                                        onChange={(event) => {
                                            const next = [...risks];
                                            next[index] = { ...next[index], risk: event.target.value };
                                            setRisks(next);
                                        }}
                                    />
                                    <input
                                        className="input"
                                        placeholder="Mitigation"
                                        value={item.mitigation}
                                        onChange={(event) => {
                                            const next = [...risks];
                                            next[index] = { ...next[index], mitigation: event.target.value };
                                            setRisks(next);
                                        }}
                                    />
                                    <button
                                        type="button"
                                        className="icon-action icon-action--close"
                                        aria-label="Remove risk"
                                        onClick={() => removeAt(index, () => ({ ...emptyRisk }), setRisks)}
                                    >
                                        <span aria-hidden="true">&times;</span>
                                    </button>
                                </div>
                            ))}
                            <button
                                className="btn-secondary"
                                onClick={() => setRisks((prev) => [...prev, { ...emptyRisk }])}
                            >
                                + Add risk
                            </button>
                        </div>
                    </div>

                    <div className="card space-y-4">
                        <h2>Tools & Cost</h2>
                        <div className="space-y-3">
                            {tools.map((item, index) => (
                                <div
                                    key={`tool-${index}`}
                                    className="grid items-center gap-3 md:grid-cols-[1fr_1fr_28px]"
                                >
                                    <input
                                        className="input"
                                        placeholder="Category"
                                        value={item.category}
                                        onChange={(event) => {
                                            const next = [...tools];
                                            next[index] = { ...next[index], category: event.target.value };
                                            setTools(next);
                                        }}
                                    />
                                    <input
                                        className="input"
                                        placeholder="Tool"
                                        value={item.tool}
                                        onChange={(event) => {
                                            const next = [...tools];
                                            next[index] = { ...next[index], tool: event.target.value };
                                            setTools(next);
                                        }}
                                    />
                                    <button
                                        type="button"
                                        className="icon-action icon-action--close"
                                        aria-label="Remove tool"
                                        onClick={() => removeAt(index, () => ({ ...emptyTool }), setTools)}
                                    >
                                        <span aria-hidden="true">&times;</span>
                                    </button>
                                </div>
                            ))}
                            <button
                                className="btn-secondary"
                                onClick={() => setTools((prev) => [...prev, { ...emptyTool }])}
                            >
                                + Add tool
                            </button>
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                            <input
                                className="input"
                                placeholder="Estimated cost"
                                value={cost}
                                onChange={(event) => setCost(event.target.value)}
                            />
                            <input
                                className="input"
                                placeholder="Cost breakdown"
                                value={costBreakdown}
                                onChange={(event) => setCostBreakdown(event.target.value)}
                            />
                        </div>
                    </div>

                    <div className="card space-y-4">
                        <h2>ICE Score</h2>
                        <div className="grid gap-4 md:grid-cols-3">
                            <input
                                className="input"
                                placeholder="Impact (1-5)"
                                value={impactScore}
                                onChange={(event) => setImpactScore(event.target.value)}
                            />
                            <input
                                className="input"
                                placeholder="Confidence (1-5)"
                                value={confidenceScore}
                                onChange={(event) => setConfidenceScore(event.target.value)}
                            />
                            <input
                                className="input"
                                placeholder="Ease (1-5)"
                                value={easeScore}
                                onChange={(event) => setEaseScore(event.target.value)}
                            />
                        </div>
                        <div className="grid gap-4 md:grid-cols-3">
                            <input
                                className="input"
                                placeholder="Impact rationale"
                                value={impactRationale}
                                onChange={(event) => setImpactRationale(event.target.value)}
                            />
                            <input
                                className="input"
                                placeholder="Confidence rationale"
                                value={confidenceRationale}
                                onChange={(event) => setConfidenceRationale(event.target.value)}
                            />
                            <input
                                className="input"
                                placeholder="Ease rationale"
                                value={easeRationale}
                                onChange={(event) => setEaseRationale(event.target.value)}
                            />
                        </div>
                        <div className="text-sm text-slate-400">Total ICE score: {iceTotal}</div>
                    </div>

                    <div className="card space-y-4">
                        <h2>Execution Log</h2>
                        <div className="grid gap-4 md:grid-cols-2">
                            <input
                                className="input"
                                placeholder="Run start"
                                value={runStart}
                                onChange={(event) => setRunStart(event.target.value)}
                            />
                            <input
                                className="input"
                                placeholder="Run end"
                                value={runEnd}
                                onChange={(event) => setRunEnd(event.target.value)}
                            />
                            <input
                                className="input"
                                placeholder="Final allocation"
                                value={finalAllocation}
                                onChange={(event) => setFinalAllocation(event.target.value)}
                            />
                        </div>
                        <textarea
                            className="textarea"
                            placeholder="Notes / incidents"
                            value={incidentNotes}
                            onChange={(event) => setIncidentNotes(event.target.value)}
                        />
                        <textarea
                            className="textarea"
                            placeholder="Deviations"
                            value={deviations}
                            onChange={(event) => setDeviations(event.target.value)}
                        />
                    </div>

                    <div className="card space-y-4">
                        <h2>Results & Analysis</h2>
                        <div className="grid gap-4 md:grid-cols-2">
                            <input
                                className="input"
                                placeholder="Outcome (Win/Loss/Inconclusive)"
                                value={result}
                                onChange={(event) => setResult(event.target.value)}
                            />
                            <input
                                className="input"
                                placeholder="Primary metric change"
                                value={primaryChange}
                                onChange={(event) => setPrimaryChange(event.target.value)}
                            />
                            <input
                                className="input"
                                placeholder="Statistical significance"
                                value={significance}
                                onChange={(event) => setSignificance(event.target.value)}
                            />
                            <input
                                className="input"
                                placeholder="Guardrail impact"
                                value={guardrailImpact}
                                onChange={(event) => setGuardrailImpact(event.target.value)}
                            />
                        </div>
                        <textarea
                            className="textarea"
                            placeholder="Key tables / summary"
                            value={keyTables}
                            onChange={(event) => setKeyTables(event.target.value)}
                        />
                        <div className="space-y-3">
                            <div className="text-xs text-slate-500">Segment Analysis</div>
                            {segments.map((item, index) => (
                                <div
                                    key={`segment-${index}`}
                                    className="grid items-center gap-3 md:grid-cols-[1fr_1fr_28px]"
                                >
                                    <input
                                        className="input"
                                        placeholder="Segment"
                                        value={item.segment}
                                        onChange={(event) => {
                                            const next = [...segments];
                                            next[index] = { ...next[index], segment: event.target.value };
                                            setSegments(next);
                                        }}
                                    />
                                    <input
                                        className="input"
                                        placeholder="Summary"
                                        value={item.summary}
                                        onChange={(event) => {
                                            const next = [...segments];
                                            next[index] = { ...next[index], summary: event.target.value };
                                            setSegments(next);
                                        }}
                                    />
                                    <button
                                        type="button"
                                        className="icon-action icon-action--close"
                                        aria-label="Remove segment"
                                        onClick={() => removeAt(index, () => ({ ...emptySegment }), setSegments)}
                                    >
                                        <span aria-hidden="true">&times;</span>
                                    </button>
                                </div>
                            ))}
                            <button
                                className="btn-secondary"
                                onClick={() => setSegments((prev) => [...prev, { ...emptySegment }])}
                            >
                                + Add segment
                            </button>
                        </div>
                    </div>

                    <div className="card space-y-4">
                        <h2>Learnings & Next Steps</h2>
                        <textarea
                            className="textarea"
                            placeholder="Overall learnings"
                            value={learnings}
                            onChange={(event) => setLearnings(event.target.value)}
                        />
                        <textarea
                            className="textarea"
                            placeholder="What worked"
                            value={whatWorked}
                            onChange={(event) => setWhatWorked(event.target.value)}
                        />
                        <textarea
                            className="textarea"
                            placeholder="What did not work"
                            value={whatDidNot}
                            onChange={(event) => setWhatDidNot(event.target.value)}
                        />
                        <textarea
                            className="textarea"
                            placeholder="Unexpected findings"
                            value={unexpected}
                            onChange={(event) => setUnexpected(event.target.value)}
                        />
                        <textarea
                            className="textarea"
                            placeholder="Methodology improvements"
                            value={methodImprovements}
                            onChange={(event) => setMethodImprovements(event.target.value)}
                        />
                        <input
                            className="input"
                            placeholder="Next step"
                            value={nextStep}
                            onChange={(event) => setNextStep(event.target.value)}
                        />
                        <input
                            className="input"
                            placeholder="Decision (Scale / Iterate / Hold / Kill)"
                            value={decision}
                            onChange={(event) => setDecision(event.target.value)}
                        />
                        <div className="space-y-3">
                            <div className="text-xs text-slate-500">Follow-up Actions</div>
                            {actions.map((item, index) => (
                                <div
                                    key={`action-${index}`}
                                    className="grid items-center gap-3 md:grid-cols-[1fr_1fr_160px_28px]"
                                >
                                    <input
                                        className="input"
                                        placeholder="Action"
                                        value={item.action}
                                        onChange={(event) => {
                                            const next = [...actions];
                                            next[index] = { ...next[index], action: event.target.value };
                                            setActions(next);
                                        }}
                                    />
                                    <input
                                        className="input"
                                        placeholder="Owner"
                                        value={item.owner}
                                        onChange={(event) => {
                                            const next = [...actions];
                                            next[index] = { ...next[index], owner: event.target.value };
                                            setActions(next);
                                        }}
                                    />
                                    <input
                                        className="input"
                                        placeholder="Date"
                                        value={item.date}
                                        onChange={(event) => {
                                            const next = [...actions];
                                            next[index] = { ...next[index], date: event.target.value };
                                            setActions(next);
                                        }}
                                    />
                                    <button
                                        type="button"
                                        className="icon-action icon-action--close"
                                        aria-label="Remove action"
                                        onClick={() => removeAt(index, () => ({ ...emptyAction }), setActions)}
                                    >
                                        <span aria-hidden="true">&times;</span>
                                    </button>
                                </div>
                            ))}
                            <button
                                className="btn-secondary"
                                onClick={() => setActions((prev) => [...prev, { ...emptyAction }])}
                            >
                                + Add action
                            </button>
                        </div>
                        <textarea
                            className="textarea"
                            placeholder="Appendices / links"
                            value={appendices}
                            onChange={(event) => setAppendices(event.target.value)}
                        />
                    </div>
                </div>

                <div className="card sticky top-6 h-fit">
                    <div className="flex items-center justify-between gap-4">
                        <h2>Plan Preview</h2>
                        <button className="btn-secondary" onClick={handleCopy}>
                            Copy
                        </button>
                    </div>
                    <pre className="mt-4 whitespace-pre-wrap text-xs text-slate-300">
                        {templateText}
                    </pre>
                </div>
            </div>
        </div>
    );
};
