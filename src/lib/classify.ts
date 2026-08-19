/**
 * Advisory classification.
 *
 * Imported by both the intake form (live preview) and the API route
 * (recorded on submission). The server recomputes rather than trusting
 * whatever the browser sent — the preview is a convenience, not input.
 *
 * The event type is authoritative where the matrix settles it. The six
 * questions exist to catch requests that do not behave like their type
 * usually does; a mismatch routes to review rather than silently
 * overriding either source.
 */

export type Classification =
  | 'internal'
  | 'affiliated'
  | 'external'
  | 'needs_management_review';

export type Party = 'central' | 'shared' | 'outside' | 'unclear';
export type YesNoUnsure = 'yes' | 'no' | 'unsure';

export interface ClassificationInput {
  /** Matrix default for the selected event type, null if unsettled. */
  typeDefault: Classification | null;
  /** True for event types the matrix deliberately leaves open. */
  typeAlwaysReview: boolean;
  officialBusiness?: YesNoUnsure;
  eventOwner?: Party;
  primaryBeneficiary?: Party;
  primaryPayer?: Party;
  financialRisk?: Party;
  wouldOccurWithout?: YesNoUnsure;
  outsideOrgInvolved?: boolean;
  revenueCollected?: boolean;
}

export interface ClassificationResult {
  classification: Classification | null;
  rationale: string;
  reasons: string[];
  /** Answers point somewhere other than the type's usual outcome. */
  deviatesFromType: boolean;
  deviationDetail?: string;
}

const LABEL: Record<Classification, string> = {
  internal: 'Internal',
  affiliated: 'Affiliated / sponsored',
  external: 'External',
  needs_management_review: 'Needs management review',
};

/** Weights follow the published rubric: beneficiary is the stated test. */
const WEIGHTS = { beneficiary: 3, owner: 2, payer: 2, risk: 2 } as const;

export function classify(input: ClassificationInput): ClassificationResult {
  const reasons: string[] = [];
  let central = 0;
  let outside = 0;
  let unclearCount = 0;

  const weigh = (value: Party | undefined, weight: number, label: string) => {
    if (!value) return;
    if (value === 'central') {
      central += weight;
      reasons.push(`${label}: Central`);
    } else if (value === 'outside') {
      outside += weight;
      reasons.push(`${label}: outside party`);
    } else if (value === 'shared') {
      central += weight / 2;
      outside += weight / 2;
      reasons.push(`${label}: shared`);
    } else {
      unclearCount++;
    }
  };

  weigh(input.primaryBeneficiary, WEIGHTS.beneficiary, 'Primary beneficiary');
  weigh(input.eventOwner, WEIGHTS.owner, 'Ownership and control');
  weigh(input.primaryPayer, WEIGHTS.payer, 'Who pays');
  weigh(input.financialRisk, WEIGHTS.risk, 'Financial risk');

  if (input.officialBusiness === 'yes') {
    central += 2;
    reasons.push('Stated as official College business');
  } else if (input.officialBusiness === 'no') {
    outside += 2;
    reasons.push('Not official College business');
  } else if (input.officialBusiness === 'unsure') {
    unclearCount++;
  }

  if (input.wouldOccurWithout === 'yes') {
    outside += 2;
    reasons.push('Would go ahead without Central');
  } else if (input.wouldOccurWithout === 'no') {
    central += 2;
    reasons.push('Depends on Central to happen');
  } else if (input.wouldOccurWithout === 'unsure') {
    unclearCount++;
  }

  const answeredEnough =
    [
      input.primaryBeneficiary,
      input.eventOwner,
      input.primaryPayer,
      input.officialBusiness,
      input.wouldOccurWithout,
    ].filter(Boolean).length >= 3;

  // Type alone is a usable answer before the questions are done.
  if (!answeredEnough) {
    if (input.typeAlwaysReview) {
      return {
        classification: 'needs_management_review',
        rationale: 'This event type is decided case by case.',
        reasons: [],
        deviatesFromType: false,
      };
    }
    if (input.typeDefault) {
      return {
        classification: input.typeDefault,
        rationale: 'Based on the selected event type.',
        reasons: ['Event type default'],
        deviatesFromType: false,
      };
    }
    return {
      classification: null,
      rationale: 'Not enough information yet.',
      reasons: [],
      deviatesFromType: false,
    };
  }

  let fromAnswers: Classification;
  if (unclearCount >= 2) {
    fromAnswers = 'needs_management_review';
  } else {
    const total = central + outside;
    const share = total > 0 ? central / total : 0.5;
    if (share >= 0.75) fromAnswers = 'internal';
    else if (share <= 0.35) fromAnswers = 'external';
    else fromAnswers = 'affiliated';
  }

  // Revenue leaving Central alongside an outside organization lifts an
  // otherwise-internal event out of the internal category.
  if (
    fromAnswers === 'internal' &&
    input.revenueCollected &&
    input.outsideOrgInvolved
  ) {
    fromAnswers = 'affiliated';
    reasons.push('Revenue collected alongside an outside organization');
  }

  if (input.typeAlwaysReview) {
    return {
      classification: 'needs_management_review',
      rationale:
        'This event type is decided case by case, so a manager classifies it directly.',
      reasons,
      deviatesFromType: false,
    };
  }

  if (input.typeDefault) {
    if (fromAnswers !== input.typeDefault) {
      return {
        classification: 'needs_management_review',
        rationale: `Answers point to ${LABEL[fromAnswers].toLowerCase()}, but this event type is normally ${LABEL[input.typeDefault].toLowerCase()}.`,
        reasons,
        deviatesFromType: true,
        deviationDetail: `Event type default is ${LABEL[input.typeDefault]}; the answers indicate ${LABEL[fromAnswers]}.`,
      };
    }
    return {
      classification: input.typeDefault,
      rationale: 'The answers agree with the usual outcome for this event type.',
      reasons,
      deviatesFromType: false,
    };
  }

  return {
    classification: fromAnswers,
    rationale: 'Derived from the classification questions.',
    reasons,
    deviatesFromType: false,
  };
}

export function classificationLabel(c: Classification): string {
  return LABEL[c];
}
