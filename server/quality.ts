import type { AnswerReview, CandidateContext, PreparationPlan } from '../shared/contracts';
export function evidenceText(context: CandidateContext, source: string, storyId?: string): string {
  if (source === 'story') {
    const story = context.stories.find((story) => story.id === storyId);
    return story
      ? [story.title, story.situation, story.task, story.action, story.result, story.skills].join(
          '\n',
        )
      : '';
  }
  if (source === 'resume' || source === 'jd' || source === 'coverLetter') return context[source];
  return '';
}
export function checkEvidence(review: AnswerReview, context: CandidateContext): AnswerReview {
  const evidence = review.evidence.filter((item) =>
    evidenceText(context, item.source, item.storyId).includes(item.quote),
  );
  const rejected = review.evidence.length - evidence.length;
  if (!rejected)
    return review.concerns.some((item) => item.severity === 'critical') &&
      review.verdict === 'consistent'
      ? { ...review, verdict: 'needs_revision' }
      : review;
  return {
    ...review,
    verdict: 'needs_revision',
    evidence,
    revisedDirectAnswer: '',
    revisedExampleScript: '',
    concerns: [
      ...review.concerns,
      {
        severity: 'warning' as const,
        claim: '',
        reason:
          'One or more proposed evidence quotes did not match the supplied profile and were removed.',
      },
    ].slice(0, 12),
  };
}
export function checkPreparation(
  plan: PreparationPlan,
  context: CandidateContext,
): PreparationPlan {
  return {
    ...plan,
    requirements: plan.requirements.map((requirement) => {
      const evidence = requirement.evidence.filter((item) =>
        evidenceText(context, item.source, item.storyId).includes(item.quote),
      );
      // A JD is evidence of a requirement, never proof the candidate has that skill.
      const candidateEvidence = evidence.filter((item) => item.source !== 'jd');
      return {
        ...requirement,
        evidence,
        priority:
          requirement.priority !== 'inferred' && !evidence.some((item) => item.source === 'jd')
            ? ('inferred' as const)
            : requirement.priority,
        status:
          requirement.status !== 'not_provided' && !candidateEvidence.length
            ? 'not_provided'
            : requirement.status,
      };
    }),
  };
}
export { replaceSection } from '../shared/markdown';
