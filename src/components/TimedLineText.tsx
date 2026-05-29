import { useEffect, useMemo, useRef, useState } from 'react';
import type { CaptionLine, CaptionSegment } from '../lib/types';
import {
  createTimedLineTokens,
  findActiveTimedTokenIndex,
} from '../lib/captionUtils';

export function TimedLineText({
  line,
  segment,
  underlineEnabled,
  getCurrentTime,
  onWord,
}: {
  line: CaptionLine;
  segment: CaptionSegment;
  underlineEnabled: boolean;
  getCurrentTime: () => number;
  onWord: (word: string) => void;
}) {
  const tokens = useMemo(() => createTimedLineTokens(line, segment), [line, segment]);
  const [activeTokenIndex, setActiveTokenIndex] = useState(-1);
  const activeTokenIndexRef = useRef(-1);

  useEffect(() => {
    const hasTimedWords = tokens.some((token) => token.word);
    if (!underlineEnabled || !hasTimedWords) {
      if (activeTokenIndexRef.current !== -1) {
        activeTokenIndexRef.current = -1;
        setActiveTokenIndex(-1);
      }
      return;
    }

    const updateActiveToken = () => {
      const nextIndex = findActiveTimedTokenIndex(tokens, getCurrentTime());
      if (activeTokenIndexRef.current === nextIndex) {
        return;
      }

      activeTokenIndexRef.current = nextIndex;
      setActiveTokenIndex(nextIndex);
    };

    updateActiveToken();
    const interval = window.setInterval(updateActiveToken, 80);
    return () => window.clearInterval(interval);
  }, [getCurrentTime, tokens, underlineEnabled]);

  return (
    <span className="current-line-text">
      {tokens.map((token, index) => {
        const className = [
          token.isWord ? 'inline-word' : token.isTimedUnit ? 'inline-timed-token' : '',
          underlineEnabled && index === activeTokenIndex ? 'active-word' : '',
        ]
          .filter(Boolean)
          .join(' ');

        return token.isWord ? (
          <button
            className={className}
            key={`${token.value}-${index}`}
            onClick={(event) => {
              event.stopPropagation();
              onWord(token.value);
            }}
          >
            {token.value}
          </button>
        ) : token.isTimedUnit ? (
          <span className={className} key={`${token.value}-${index}`}>
            {token.value}
          </span>
        ) : (
          <span key={`${token.value}-${index}`}>{token.value}</span>
        );
      })}
    </span>
  );
}
