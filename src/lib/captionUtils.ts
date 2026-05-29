import { normalizeLookupWord } from './dictionary';
import type { CaptionSegment, CaptionLine, CaptionTrack, CaptionWord } from './types';

export type TimedToken = { value: string; isWord: boolean; isTimedUnit: boolean; word?: CaptionWord };
export type TimedClauseSpan = {
  text: string;
  words: CaptionWord[];
};

export function getSegmentDisplayLine(segment: CaptionSegment): CaptionLine {
  return {
    id: `${segment.id}_line`,
    text: segment.text,
    start: segment.start,
    end: segment.end,
    duration: roundTime(Math.max(0, segment.end - segment.start)),
    source: segment.source,
    words: getTimedWordsForSegment(segment),
  };
}

export function canSplitSegmentIntoTimedSegments(segment: CaptionSegment): boolean {
  const clauses = splitCaptionTextIntoClauses(segment.text);
  return clauses.length > 1 && getTimedWordsForSegment(segment).length > 0;
}

export function createSplitSegmentsForSegment(segment: CaptionSegment): CaptionSegment[] {
  const clauseSpans = createTimedClauseSpans(segment);
  if (!clauseSpans || clauseSpans.length < 2) {
    return [segment];
  }

  const source = appendSplitSource(segment.source);
  return clauseSpans.map(({ text, words }, index) => {
    const firstWord = words[0];
    const lastWord = words[words.length - 1];
    const start = roundTime(Math.max(segment.start, firstWord.start));
    const end = roundTime(Math.max(start, Math.min(segment.end, lastWord.end)));
    const id = `${segment.id}_split_${index}_${Math.round(start * 1000)}`;
    const splitWords = words.map((word, wordIndex) => ({
      ...word,
      id: `${id}_word_${wordIndex}`,
      start: roundTime(Math.max(start, Math.min(end, word.start))),
      end: roundTime(Math.max(start, Math.min(end, word.end))),
      duration: roundTime(Math.max(0, Math.min(end, word.end) - Math.max(start, word.start))),
    }));
    const line: CaptionLine = {
      id: `${id}_line`,
      text,
      start,
      end,
      duration: roundTime(Math.max(0, end - start)),
      source,
      words: splitWords,
    };

    return {
      id,
      text,
      start,
      end,
      duration: roundTime(Math.max(0, end - start)),
      source,
      lines: [line],
      words: splitWords,
    };
  });
}

export function createTimedClauseSpans(segment: CaptionSegment): TimedClauseSpan[] | null {
  const clauses = splitCaptionTextIntoClauses(segment.text);
  const timedWords = getTimedWordsForSegment(segment);
  if (clauses.length < 2 || timedWords.length === 0) {
    return null;
  }

  return createTimedClauseSpansFromTexts(clauses, timedWords);
}

export function createTimedClauseSpansFromTexts(texts: string[], timedWords: CaptionWord[]): TimedClauseSpan[] | null {
  if (texts.length === 0 || timedWords.length === 0) {
    return null;
  }

  const spans: TimedClauseSpan[] = [];
  let cursor = 0;

  for (let index = 0; index < texts.length; index += 1) {
    const text = texts[index];
    const tokens = tokenizeStrictCaptionWords(text);
    if (tokens.length === 0) {
      return null;
    }

    const words = pickTimedWordsForClause(tokens, timedWords, cursor);
    if (words.length === 0) {
      return null;
    }

    spans.push({ text, words });
    cursor += words.length;
  }

  return cursor === timedWords.length ? spans : null;
}

export function pickTimedWordsForClause(
  tokens: string[],
  words: CaptionWord[],
  cursor: number,
): CaptionWord[] {
  if (tokens.length === 0 || cursor + tokens.length > words.length) {
    return [];
  }

  for (let index = 0; index < tokens.length; index += 1) {
    if (words[cursor + index]?.text !== tokens[index]) {
      return [];
    }
  }

  return words.slice(cursor, cursor + tokens.length);
}

export function splitCaptionTextIntoClauses(text: string): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return [];
  }

  const clauses: string[] = [];
  let clauseStart = 0;
  let index = 0;

  while (index < normalized.length) {
    if (!isCaptionClauseBreak(normalized, index)) {
      index += 1;
      continue;
    }

    let clauseEnd = index + 1;
    while (clauseEnd < normalized.length && isCaptionClauseBreak(normalized, clauseEnd)) {
      clauseEnd += 1;
    }

    const clause = normalized.slice(clauseStart, clauseEnd).trim();
    if (clause) {
      clauses.push(clause);
    }

    clauseStart = clauseEnd;
    while (clauseStart < normalized.length && /\s/.test(normalized[clauseStart])) {
      clauseStart += 1;
    }
    index = clauseStart;
  }

  const tail = normalized.slice(clauseStart).trim();
  if (tail) {
    clauses.push(tail);
  }

  return clauses.length > 0 ? clauses : [normalized];
}

export function isCaptionClauseBreak(text: string, index: number): boolean {
  const char = text[index];
  if (!',，;；:：.!?。！？—–'.includes(char)) {
    return false;
  }

  return !isNumericInternalSeparator(text, index);
}

export function isNumericInternalSeparator(text: string, index: number): boolean {
  const char = text[index];
  if (!',，.:：'.includes(char)) {
    return false;
  }

  const previous = text[index - 1] ?? '';
  const next = text[index + 1] ?? '';
  return /\d/.test(previous) && /\d/.test(next);
}

export function tokenizeCaptionAlignmentUnits(text: string): string[] {
  const parts = text.match(/[A-Za-z]+(?:'[A-Za-z]+)?|\d+(?:[,，.:：]\d+)*/g) ?? [];
  return parts.map(normalizeCaptionAlignmentToken).filter(Boolean);
}

export function tokenizeStrictCaptionWords(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

export function normalizeCaptionAlignmentToken(value: string): string {
  const word = normalizeLookupWord(value);
  if (word) {
    return word;
  }

  const cjkOnly = value.replace(/[^぀-ヿㇰ-ㇿ㐀-䶿一-鿿가-힯豈-﫿]/g, '');
  if (cjkOnly) {
    return cjkOnly;
  }

  return value.replace(/\D/g, '');
}

export function appendSplitSource(source: string): string {
  return source.includes('+split') ? source : `${source}+split`;
}

export function roundTime(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function mergeCaptionSegments(segments: CaptionSegment[]): CaptionSegment {
  const ordered = [...segments].sort((left, right) => left.start - right.start);
  const first = ordered[0];
  const start = Math.min(...ordered.map((segment) => segment.start));
  const end = Math.max(...ordered.map((segment) => segment.end));
  const id = `edited_merge_${ordered.map((segment) => segment.id).join('_')}_${Math.round(start * 1000)}`;
  const source = first.source.includes('+edited') ? first.source : `${first.source}+edited`;
  const text = ordered.map((segment) => segment.text.trim()).filter(Boolean).join(' ');
  const words = ordered
    .flatMap(getTimedWordsForSegment)
    .sort((left, right) => left.start - right.start)
    .map((word, index) => ({
      ...word,
      id: `${id}_word_${index}`,
    }));
  const line: CaptionLine = {
    id: `${id}_line`,
    text,
    start,
    end,
    duration: roundTime(Math.max(0, end - start)),
    source,
    ...(words.length > 0 ? { words } : {}),
  };

  return {
    id,
    text,
    start,
    end,
    duration: end - start,
    source,
    lines: [line],
    ...(words.length > 0 ? { words } : {}),
  };
}

export function isUsableCachedTrack(track: CaptionTrack): boolean {
  if (track.provider.startsWith('manual')) {
    return true;
  }

  return track.provider.includes('whisperx') && hasTimedWords(track);
}

export function hasTimedWords(track: CaptionTrack): boolean {
  return track.segments.some(
    (segment) =>
      (segment.words && segment.words.length > 0) ||
      segment.lines?.some((line) => line.words && line.words.length > 0),
  );
}

export function isEditedCaptionSource(segment: CaptionSegment): boolean {
  return segment.source.includes('+edited') || Boolean(segment.lines?.some((line) => line.source.includes('+edited')));
}

export function createTimedLineTokens(line: CaptionLine, segment: CaptionSegment): TimedToken[] {
  const tokens = tokenizeTimedText(line.text);
  const words = getTimedWordsForLine(line, segment);
  let wordCursor = 0;

  return tokens.map((token) => {
    if (!token.isTimedUnit || words.length === 0) {
      return token;
    }

    const tokenKey = normalizeCaptionAlignmentToken(token.value);
    const matchIndex = words.findIndex(
      (word, index) => index >= wordCursor && normalizeCaptionAlignmentToken(word.text) === tokenKey,
    );
    if (matchIndex < 0) {
      return token;
    }

    const word = words[matchIndex];
    wordCursor = matchIndex + 1;
    return { ...token, word };
  });
}

export function getTimedWordsForLine(line: CaptionLine, segment: CaptionSegment): CaptionWord[] {
  if (line.words && line.words.length > 0) {
    return line.words;
  }

  if (!segment.words || segment.words.length === 0) {
    return [];
  }

  return segment.words.filter((word) => {
    const midpoint = word.start + Math.max(0, word.end - word.start) / 2;
    return midpoint >= line.start - 0.001 && midpoint <= line.end + 0.001;
  });
}

export function getTimedWordsForSegment(segment: CaptionSegment): CaptionWord[] {
  const sourceWords =
    segment.words && segment.words.length > 0
      ? segment.words
      : segment.lines?.flatMap((line) => line.words ?? []) ?? [];
  const seen = new Set<string>();
  return [...sourceWords]
    .filter((word) => Number.isFinite(word.start) && Number.isFinite(word.end) && word.end >= word.start)
    .sort((left, right) => left.start - right.start)
    .filter((word) => {
      const key = `${word.id}:${word.text}:${Math.round(word.start * 1000)}:${Math.round(word.end * 1000)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function findActiveTimedTokenIndex(tokens: TimedToken[], currentTime: number): number {
  return tokens.findIndex((token) => {
    const word = token.word;
    return Boolean(word && currentTime >= word.start && currentTime < word.end);
  });
}

export function tokenize(text: string): Array<{ value: string; isWord: boolean }> {
  const parts = text.match(/[A-Za-z]+(?:'[A-Za-z]+)?|[^A-Za-z]+/g) ?? [text];
  return parts.map((value) => ({ value, isWord: /^[A-Za-z]+(?:'[A-Za-z]+)?$/.test(value) }));
}

export const CJK_CHAR_RE = /[぀-ヿㇰ-ㇿ㐀-䶿一-鿿가-힯豈-﫿]/;

export function tokenizeTimedText(text: string): TimedToken[] {
  const parts = text.match(
    /[A-Za-z]+(?:'[A-Za-z]+)?|\d+(?:[,，.:：]\d+)*|[぀-ヿㇰ-ㇿ㐀-䶿一-鿿가-힯豈-﫿]|[^A-Za-z\d぀-ヿㇰ-ㇿ㐀-䶿一-鿿가-힯豈-﫿]+/g,
  ) ?? [text];
  return parts.map((value) => {
    const isWord = /^[A-Za-z]+(?:'[A-Za-z]+)?$/.test(value);
    const isNumber = /^\d+(?:[,，.:：]\d+)*$/.test(value);
    const isCJKChar = CJK_CHAR_RE.test(value) && value.length === 1;
    return {
      value,
      isWord,
      isTimedUnit: isWord || isNumber || isCJKChar,
    };
  });
}

export function mergeGeneratedTrackWithEditedTrack(
  editedTrack: CaptionTrack | null,
  generatedTrack: CaptionTrack,
): CaptionTrack {
  if (!editedTrack || editedTrack.videoId !== generatedTrack.videoId || editedTrack.segments.length === 0) {
    return generatedTrack;
  }

  const editedEnd = Math.max(...editedTrack.segments.map((segment) => segment.end));
  const tailSegments = generatedTrack.segments.filter((segment) => segment.start >= editedEnd - 0.05);
  const mergedSegments = [...editedTrack.segments, ...tailSegments].sort((left, right) => left.start - right.start);

  return {
    ...generatedTrack,
    fetchedAt: Date.now(),
    segments: dedupeCaptionSegments(mergedSegments),
  };
}

export function dedupeCaptionSegments(segments: CaptionSegment[]): CaptionSegment[] {
  const seen = new Set<string>();
  const deduped: CaptionSegment[] = [];

  for (const segment of segments) {
    const key = `${segment.id}:${Math.round(segment.start * 1000)}:${Math.round(segment.end * 1000)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(segment);
  }

  return deduped;
}

export function createTrackFromJobStatus(job: {
  videoId: string;
  language: string;
  provider: string;
  fetchedAt: number;
  segments: CaptionSegment[];
}): CaptionTrack {
  return {
    videoId: job.videoId,
    language: job.language,
    provider: job.provider,
    fetchedAt: job.fetchedAt,
    updatedAt: job.fetchedAt,
    segments: job.segments,
  };
}

export function resolveInitialSegment(
  segments: CaptionSegment[],
  preferredId: string | null,
): { segmentId: string | null; reason: 'preferred' | 'missing-preferred' | 'first' | 'empty' } {
  if (preferredId) {
    if (segments.some((segment) => segment.id === preferredId)) {
      return { segmentId: preferredId, reason: 'preferred' };
    }
    return { segmentId: segments[0]?.id ?? null, reason: 'missing-preferred' };
  }

  return segments[0]?.id
    ? { segmentId: segments[0].id, reason: 'first' }
    : { segmentId: null, reason: 'empty' };
}

export function findSegmentAtTime(segments: CaptionSegment[], time: number): CaptionSegment | null {
  if (segments.length === 0) {
    return null;
  }

  let low = 0;
  let high = segments.length - 1;
  let previousIndex = -1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const segment = segments[mid];

    if (time < segment.start) {
      high = mid - 1;
      continue;
    }

    previousIndex = mid;
    if (time < segment.end) {
      return segment;
    }
    low = mid + 1;
  }

  return previousIndex >= 0 ? segments[previousIndex] : null;
}
