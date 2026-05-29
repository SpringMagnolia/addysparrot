import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { MessageSquareQuote, Type } from 'lucide-react';
import { useI18n } from '../lib/i18n/context';
import type { ReviewEntry } from '../lib/reviewUtils';
import type { ReviewSessionItem } from '../lib/review';

export function ReviewTypePill({ kind }: { kind: ReviewEntry['kind'] | ReviewSessionItem['item']['kind'] }) {
  const { t } = useI18n();
  const isWord = kind === 'word';
  const Icon = isWord ? Type : MessageSquareQuote;

  return (
    <span className="type-pill">
      <Icon size={13} />
      {isWord ? t('word') : t('sentence')}
    </span>
  );
}

export function preventAudioKeyboardPlayback(event: ReactKeyboardEvent<HTMLButtonElement>) {
  if (event.key !== 'Enter' && event.key !== ' ' && event.code !== 'Space') return;

  event.preventDefault();
  event.stopPropagation();
}
