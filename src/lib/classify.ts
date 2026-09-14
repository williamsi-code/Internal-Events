export type Classification =
  | 'internal'
  | 'affiliated'
  | 'external'
  | 'needs_management_review';

export type Party = 'central' | 'shared' | 'outside' | 'unclear';
export type YesNoUnsure = 'yes' | 'no' | 'unsure';

export function classificationLabel(c: Classification): string {
  switch (c) {
    case 'internal':
      return 'Internal';
    case 'affiliated':
      return 'Affiliated / sponsored';
    case 'external':
      return 'External';
    case 'needs_management_review':
      return 'Needs management review';
  }
}

export interface ClassifyInput {
  typeDefault: Classification | null;
  typeAlwaysReview: boolean;
  officialBusiness?: YesNoUnsure;
  primaryBeneficiary?: Party;
  primaryPayer?: Party;
  financialRisk?: Party;
  outsideFunding?: boolean;
  revenueCollected?: boolean;
  outsideOrgInvolved?: boolean;
}

export interface ClassifyResult {
  classification: Classification;
  rationale: string;
  /** The individual facts that pointed this way, shown to the
   *  requester so the verdict is not a black box. */
  reasons: string[];
  deviatesFromType: boolean;
  deviationDetail?: string;
}

/**
 * The advisory classification.
 *
 * Advisory is the operative word: this suggests, and a person
 * decides. It weighs what the requester is now asked - is this
 * College business, who benefits, who pays - against the event
 * type's usual answer.
 *
 * Two questions were retired in September 2026 (who owns the event,
 * and whether it would happen without Central) because they restated
 * what the funding answers already said. Anything that arrives
 * without them is simply weighed on what is there.
 */
export function classify(input: ClassifyInput): ClassifyResult {
  const {
    typeDefault,
    typeAlwaysReview,
    officialBusiness,
    primaryBeneficiary,
    primaryPayer,
    financialRisk,
    outsideFunding,
    revenueCollected,
  } = input;

  // Everything the answers actually said, in the order it was asked.
  // Shown beside the verdict so a requester can see what it rests on
  // rather than being handed a conclusion.
  const reasons: string[] = [];

  if (officialBusiness === 'yes') {
    reasons.push('This is official College business.');
  } else if (officialBusiness === 'no') {
    reasons.push('This is not official College business.');
  } else if (officialBusiness === 'unsure') {
    reasons.push('Whether this is official College business is unclear.');
  }

  if (primaryBeneficiary === 'central') {
    reasons.push('Central is the main beneficiary.');
  } else if (primaryBeneficiary === 'outside') {
    reasons.push('An outside party is the main beneficiary.');
  } else if (primaryBeneficiary === 'shared') {
    reasons.push('Central and an outside party both benefit substantially.');
  }

  if (primaryPayer === 'central') {
    reasons.push('Central is paying.');
  } else if (primaryPayer === 'outside') {
    reasons.push('An outside party is paying.');
  } else if (primaryPayer === 'shared') {
    reasons.push('The cost is split.');
  }

  if (financialRisk === 'central') {
    reasons.push('Central carries the financial risk.');
  } else if (financialRisk === 'outside') {
    reasons.push('An outside party carries the financial risk.');
  } else if (financialRisk === 'shared') {
    reasons.push('The financial risk is shared.');
  }

  if (outsideFunding) reasons.push('There is outside funding or sponsorship.');
  if (revenueCollected) reasons.push('Revenue is being collected.');
  if (typeAlwaysReview) {
    reasons.push('This event type is always reviewed individually.');
  }

  const verdict = (
    classification: Classification,
    rationale: string
  ): ClassifyResult => {
    const deviates =
      !!typeDefault &&
      classification !== typeDefault &&
      classification !== 'needs_management_review';

    return {
      classification,
      rationale,
      reasons,
      deviatesFromType: deviates,
      deviationDetail: deviates
        ? `This event type is usually ${classificationLabel(
            typeDefault!
          )}, but the answers point to ${classificationLabel(classification)}.`
        : undefined,
    };
  };

  // An outside party benefiting and paying is external whatever the
  // event type says. This is the clearest case there is.
  if (primaryBeneficiary === 'outside' && primaryPayer === 'outside') {
    return verdict(
      'external',
      'An outside party both benefits from this event and pays for it.'
    );
  }

  // Central business, Central benefit, Central money, no outside
  // funding. The ordinary internal event.
  if (
    officialBusiness === 'yes' &&
    primaryBeneficiary === 'central' &&
    primaryPayer === 'central' &&
    !outsideFunding
  ) {
    // Unless the event type itself is never settled by the matrix.
    if (typeAlwaysReview) {
      return verdict(
        'needs_management_review',
        'The answers point to Internal, but this event type is always reviewed.'
      );
    }
    return verdict(
      'internal',
      'Official College business, benefiting and paid for by Central.'
    );
  }

  // Revenue going somewhere other than Central needs a look before
  // anything is priced.
  if (revenueCollected) {
    return verdict(
      'needs_management_review',
      'Revenue is being collected, which needs reviewing before pricing.'
    );
  }

  // Shared benefit, shared payment, or Central benefiting from
  // outside money. This is what affiliated exists to describe.
  if (
    primaryBeneficiary === 'shared' ||
    primaryPayer === 'shared' ||
    financialRisk === 'shared' ||
    outsideFunding ||
    (primaryBeneficiary === 'central' && primaryPayer === 'outside')
  ) {
    return verdict(
      'affiliated',
      'Central and an outside party both have a stake in this one.'
    );
  }

  // An outside party carrying the risk, without the clarity of the
  // first case.
  if (financialRisk === 'outside' || primaryPayer === 'outside') {
    return verdict(
      'external',
      'An outside party is carrying the cost of this event.'
    );
  }

  if (typeAlwaysReview || !typeDefault) {
    return verdict(
      'needs_management_review',
      'The answers do not settle it and the event type is not decisive.'
    );
  }

  // Nothing in the answers argues against the usual result.
  return verdict(
    typeDefault,
    `Following the usual result for ${classificationLabel(
      typeDefault
    ).toLowerCase()} events of this type; nothing in the answers argues against it.`
  );
}
