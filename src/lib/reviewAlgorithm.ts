import type { ReviewCard } from './types';

export type ReviewRating = 'forgot' | 'remembered' | 'easy';

export interface ReviewAlgorithmSettings {
  desiredRetention: number;
  forgotRetryHours: number;
}

export interface ReviewMemoryState {
  stability: number;
  difficulty: number;
}

export interface ReviewScheduleResult {
  stability: number;
  difficulty: number;
  scheduledDays: number;
  dueAt: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const S_MIN = 0.001;
const S_MAX = 36500;
const MAXIMUM_INTERVAL_DAYS = 36500;

const FSRS_RATING = {
  forgot: 1,
  remembered: 3,
  easy: 4,
} satisfies Record<ReviewRating, number>;

const FSRS_WEIGHTS = [
  0.212,
  1.2931,
  2.3065,
  8.2956,
  6.4133,
  0.8334,
  3.0194,
  0.001,
  1.8722,
  0.1666,
  0.796,
  1.4835,
  0.0614,
  0.2629,
  1.6483,
  0.6014,
  1.8729,
  0.5425,
  0.0912,
  0.0658,
  0.1542,
];

export function scheduleReview(
  card: Pick<ReviewCard, 'stability' | 'difficulty'>,
  rating: ReviewRating,
  elapsedDays: number,
  now: number,
  settings: ReviewAlgorithmSettings,
): ReviewScheduleResult {
  const grade = FSRS_RATING[rating];
  const memory = nextMemoryState(
    { stability: card.stability, difficulty: card.difficulty },
    elapsedDays,
    grade,
  );
  const scheduledDays = rating === 'forgot' ? 0 : nextInterval(memory.stability, elapsedDays, settings.desiredRetention);
  return {
    ...memory,
    scheduledDays,
    dueAt: rating === 'forgot' ? now + settings.forgotRetryHours * HOUR_MS : now + scheduledDays * DAY_MS,
  };
}

function nextMemoryState(
  memory: ReviewMemoryState,
  elapsedDays: number,
  grade: number,
): ReviewMemoryState {
  const { stability, difficulty } = memory;
  if (stability <= 0 || difficulty <= 0) {
    return {
      stability: initStability(grade),
      difficulty: clamp(initDifficulty(grade), 1, 10),
    };
  }

  const retrievability = forgettingCurve(elapsedDays, stability);
  const nextStability =
    elapsedDays === 0
      ? nextShortTermStability(stability, grade)
      : grade === FSRS_RATING.forgot
        ? Math.min(nextForgetStability(difficulty, stability, retrievability), stability)
        : nextRecallStability(difficulty, stability, retrievability, grade);

  return {
    stability: clamp(roundTo(nextStability, 8), S_MIN, S_MAX),
    difficulty: nextDifficulty(difficulty, grade),
  };
}

function initStability(grade: number): number {
  return Math.max(FSRS_WEIGHTS[grade - 1], 0.1);
}

function initDifficulty(grade: number): number {
  return roundTo(FSRS_WEIGHTS[4] - Math.exp((grade - 1) * FSRS_WEIGHTS[5]) + 1, 8);
}

function nextDifficulty(difficulty: number, grade: number): number {
  const deltaDifficulty = -FSRS_WEIGHTS[6] * (grade - 3);
  const next = difficulty + deltaDifficulty * (10 - difficulty) / 9;
  const easyInit = initDifficulty(FSRS_RATING.easy);
  return clamp(roundTo(FSRS_WEIGHTS[7] * easyInit + (1 - FSRS_WEIGHTS[7]) * next, 8), 1, 10);
}

function nextRecallStability(difficulty: number, stability: number, retrievability: number, grade: number): number {
  const easyBonus = grade === FSRS_RATING.easy ? FSRS_WEIGHTS[16] : 1;
  return stability * (
    1 +
    Math.exp(FSRS_WEIGHTS[8]) *
      (11 - difficulty) *
      Math.pow(stability, -FSRS_WEIGHTS[9]) *
      (Math.exp((1 - retrievability) * FSRS_WEIGHTS[10]) - 1) *
      easyBonus
  );
}

function nextForgetStability(difficulty: number, stability: number, retrievability: number): number {
  const next = FSRS_WEIGHTS[11] *
    Math.pow(difficulty, -FSRS_WEIGHTS[12]) *
    (Math.pow(stability + 1, FSRS_WEIGHTS[13]) - 1) *
    Math.exp((1 - retrievability) * FSRS_WEIGHTS[14]);
  return clamp(next, S_MIN, S_MAX);
}

function nextShortTermStability(stability: number, grade: number): number {
  const increase = Math.pow(stability, -FSRS_WEIGHTS[19]) * Math.exp(FSRS_WEIGHTS[17] * (grade - 3 + FSRS_WEIGHTS[18]));
  return stability * (grade >= 2 ? Math.max(increase, 1) : increase);
}

function forgettingCurve(elapsedDays: number, stability: number): number {
  if (stability <= 0) return 0;
  const decay = -FSRS_WEIGHTS[20];
  const factor = Math.exp(Math.log(0.9) / decay) - 1;
  return roundTo(Math.pow(1 + factor * elapsedDays / stability, decay), 8);
}

function nextInterval(stability: number, elapsedDays: number, desiredRetention: number): number {
  const decay = -FSRS_WEIGHTS[20];
  const factor = Math.exp(Math.log(0.9) / decay) - 1;
  const intervalModifier = (Math.pow(desiredRetention, 1 / decay) - 1) / factor;
  return Math.min(Math.max(1, Math.round(stability * intervalModifier)), Math.max(1, MAXIMUM_INTERVAL_DAYS - elapsedDays));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
