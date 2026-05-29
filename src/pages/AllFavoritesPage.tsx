import { ArrowLeft, Search, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../lib/i18n/context';
import { navigate } from '../lib/router';
import { platformBridge } from '../lib/platformBridge';
import {
  deleteFavoriteWord,
  deleteFavoriteSentence,
  listFavoriteWordsPage,
  listFavoriteSentencesPage,
  searchFavoriteWordsPage,
  searchFavoriteSentencesPage,
} from '../lib/storage';
import { AudioTextButton, isPlayableAudio } from '../components/AudioTextButton';
import { ReviewTypePill } from '../components/ReviewTypePill';
import { FavoriteWordDefinitionContent } from '../components/DictionaryEntry';
import {
  createReviewEntries,
  groupReviewEntries,
  mergeById,
  type ReviewEntry,
} from '../lib/reviewUtils';
import { formatPhonetic, formatDefinitionPreview, formatTimeOfDay } from '../lib/formatUtils';
import type { FavoriteWord, FavoriteSentence } from '../lib/types';

const REVIEW_PAGE_SIZE = 30;

export function AllFavoritesPage() {
  const { t } = useI18n();
  const [loadedWords, setLoadedWords] = useState<FavoriteWord[]>([]);
  const [loadedSentences, setLoadedSentences] = useState<FavoriteSentence[]>([]);
  const [searchWords, setSearchWords] = useState<FavoriteWord[]>([]);
  const [searchSentences, setSearchSentences] = useState<FavoriteSentence[]>([]);
  const [wordOffset, setWordOffset] = useState(0);
  const [sentenceOffset, setSentenceOffset] = useState(0);
  const [searchWordOffset, setSearchWordOffset] = useState(0);
  const [searchSentenceOffset, setSearchSentenceOffset] = useState(0);
  const [hasMoreWords, setHasMoreWords] = useState(true);
  const [hasMoreSentences, setHasMoreSentences] = useState(true);
  const [hasMoreSearchWords, setHasMoreSearchWords] = useState(false);
  const [hasMoreSearchSentences, setHasMoreSearchSentences] = useState(false);
  const [loadingReview, setLoadingReview] = useState(false);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const loadMoreTriggerRef = useRef<HTMLDivElement | null>(null);
  const searchTerm = searchQuery.trim().toLowerCase();

  const refresh = useCallback(async () => {
    const startedAt = performance.now();
    void platformBridge.logs.frontendEvent('review-refresh-start', {
      pageSize: REVIEW_PAGE_SIZE,
      runtime: platformBridge.runtime(),
    });
    setLoadingReview(true);
    try {
      const [wordsPage, sentencesPage] = await Promise.all([
        listFavoriteWordsPage(REVIEW_PAGE_SIZE, 0),
        listFavoriteSentencesPage(REVIEW_PAGE_SIZE, 0),
      ]);
      setLoadedWords(wordsPage.items);
      setLoadedSentences(sentencesPage.items);
      setWordOffset(wordsPage.items.length);
      setSentenceOffset(sentencesPage.items.length);
      setHasMoreWords(wordsPage.hasMore);
      setHasMoreSentences(sentencesPage.hasMore);
      void platformBridge.logs.frontendEvent('review-refresh-complete', {
        elapsedMs: Math.round(performance.now() - startedAt),
        words: wordsPage.items.length,
        sentences: sentencesPage.items.length,
        hasMoreWords: wordsPage.hasMore,
        hasMoreSentences: sentencesPage.hasMore,
      });
    } catch (err) {
      void platformBridge.logs.frontendEvent('review-refresh-failed', {
        elapsedMs: Math.round(performance.now() - startedAt),
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    } finally {
      setLoadingReview(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!searchTerm) {
      setSearchWords([]);
      setSearchSentences([]);
      setSearchWordOffset(0);
      setSearchSentenceOffset(0);
      setHasMoreSearchWords(false);
      setHasMoreSearchSentences(false);
      setLoadingSearch(false);
      return;
    }

    let cancelled = false;
    const startedAt = performance.now();
    setLoadingSearch(true);
    void platformBridge.logs.frontendEvent('review-search-start', {
      pageSize: REVIEW_PAGE_SIZE,
      keywordLength: searchTerm.length,
    });
    Promise.all([
      searchFavoriteWordsPage(searchTerm, REVIEW_PAGE_SIZE, 0),
      searchFavoriteSentencesPage(searchTerm, REVIEW_PAGE_SIZE, 0),
    ])
      .then(([wordsPage, sentencesPage]) => {
        if (cancelled) return;
        setSearchWords(wordsPage.items);
        setSearchSentences(sentencesPage.items);
        setSearchWordOffset(wordsPage.items.length);
        setSearchSentenceOffset(sentencesPage.items.length);
        setHasMoreSearchWords(wordsPage.hasMore);
        setHasMoreSearchSentences(sentencesPage.hasMore);
        void platformBridge.logs.frontendEvent('review-search-complete', {
          elapsedMs: Math.round(performance.now() - startedAt),
          words: wordsPage.items.length,
          sentences: sentencesPage.items.length,
          hasMoreWords: wordsPage.hasMore,
          hasMoreSentences: sentencesPage.hasMore,
        });
      })
      .catch((err) => {
        void platformBridge.logs.frontendEvent('review-search-load-failed', {
          elapsedMs: Math.round(performance.now() - startedAt),
          error: err instanceof Error ? err.message : String(err),
        });
        if (!cancelled) {
          setSearchWords([]);
          setSearchSentences([]);
          setSearchWordOffset(0);
          setSearchSentenceOffset(0);
          setHasMoreSearchWords(false);
          setHasMoreSearchSentences(false);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingSearch(false);
      });

    return () => {
      cancelled = true;
    };
  }, [searchTerm]);

  const entries = useMemo(() => {
    if (!searchTerm) {
      return createReviewEntries(loadedWords, loadedSentences);
    }

    return createReviewEntries(searchWords, searchSentences);
  }, [loadedSentences, loadedWords, searchSentences, searchTerm, searchWords]);
  const hasMoreReview = searchTerm ? hasMoreSearchWords || hasMoreSearchSentences : hasMoreWords || hasMoreSentences;
  const isSearching = Boolean(searchTerm);

  useEffect(() => {
    const trigger = loadMoreTriggerRef.current;
    if (!trigger || !hasMoreReview) return;

    const observer = new IntersectionObserver(
      (observations) => {
        if (observations.some((observation) => observation.isIntersecting)) {
          if (isSearching) {
            void loadMoreSearch();
          } else {
            void loadMoreReview();
          }
        }
      },
      { rootMargin: '360px 0px' },
    );
    observer.observe(trigger);

    return () => observer.disconnect();
  }, [
    hasMoreReview,
    isSearching,
    loadingReview,
    loadingSearch,
    searchSentenceOffset,
    searchTerm,
    searchWordOffset,
    sentenceOffset,
    wordOffset,
  ]);

  async function loadMoreReview() {
    if (loadingReview || !hasMoreReview) {
      void platformBridge.logs.frontendEvent('review-load-more-skipped', {
        loadingReview,
        hasMoreReview,
        wordOffset,
        sentenceOffset,
      });
      return;
    }

    const startedAt = performance.now();
    void platformBridge.logs.frontendEvent('review-load-more-start', {
      pageSize: REVIEW_PAGE_SIZE,
      wordOffset,
      sentenceOffset,
      hasMoreWords,
      hasMoreSentences,
    });
    setLoadingReview(true);
    try {
      const [wordsPage, sentencesPage] = await Promise.all([
        hasMoreWords
          ? listFavoriteWordsPage(REVIEW_PAGE_SIZE, wordOffset)
          : Promise.resolve({ items: [], total: loadedWords.length, hasMore: false }),
        hasMoreSentences
          ? listFavoriteSentencesPage(REVIEW_PAGE_SIZE, sentenceOffset)
          : Promise.resolve({ items: [], total: loadedSentences.length, hasMore: false }),
      ]);

      setLoadedWords((previous) => mergeById(previous, wordsPage.items));
      setLoadedSentences((previous) => mergeById(previous, sentencesPage.items));
      setWordOffset((previous) => previous + wordsPage.items.length);
      setSentenceOffset((previous) => previous + sentencesPage.items.length);
      setHasMoreWords(wordsPage.hasMore);
      setHasMoreSentences(sentencesPage.hasMore);
      void platformBridge.logs.frontendEvent('review-load-more-complete', {
        elapsedMs: Math.round(performance.now() - startedAt),
        words: wordsPage.items.length,
        sentences: sentencesPage.items.length,
        nextWordOffset: wordOffset + wordsPage.items.length,
        nextSentenceOffset: sentenceOffset + sentencesPage.items.length,
        hasMoreWords: wordsPage.hasMore,
        hasMoreSentences: sentencesPage.hasMore,
      });
    } catch (err) {
      void platformBridge.logs.frontendEvent('review-load-more-failed', {
        elapsedMs: Math.round(performance.now() - startedAt),
        wordOffset,
        sentenceOffset,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    } finally {
      setLoadingReview(false);
    }
  }

  async function loadMoreSearch() {
    if (loadingSearch || !searchTerm || (!hasMoreSearchWords && !hasMoreSearchSentences)) {
      void platformBridge.logs.frontendEvent('review-search-load-more-skipped', {
        loadingSearch,
        hasMoreSearchWords,
        hasMoreSearchSentences,
        searchWordOffset,
        searchSentenceOffset,
      });
      return;
    }

    const startedAt = performance.now();
    void platformBridge.logs.frontendEvent('review-search-load-more-start', {
      pageSize: REVIEW_PAGE_SIZE,
      keywordLength: searchTerm.length,
      wordOffset: searchWordOffset,
      sentenceOffset: searchSentenceOffset,
    });
    setLoadingSearch(true);
    try {
      const [wordsPage, sentencesPage] = await Promise.all([
        hasMoreSearchWords
          ? searchFavoriteWordsPage(searchTerm, REVIEW_PAGE_SIZE, searchWordOffset)
          : Promise.resolve({ items: [], total: searchWords.length, hasMore: false }),
        hasMoreSearchSentences
          ? searchFavoriteSentencesPage(searchTerm, REVIEW_PAGE_SIZE, searchSentenceOffset)
          : Promise.resolve({ items: [], total: searchSentences.length, hasMore: false }),
      ]);

      setSearchWords((previous) => mergeById(previous, wordsPage.items));
      setSearchSentences((previous) => mergeById(previous, sentencesPage.items));
      setSearchWordOffset((previous) => previous + wordsPage.items.length);
      setSearchSentenceOffset((previous) => previous + sentencesPage.items.length);
      setHasMoreSearchWords(wordsPage.hasMore);
      setHasMoreSearchSentences(sentencesPage.hasMore);
      void platformBridge.logs.frontendEvent('review-search-load-more-complete', {
        elapsedMs: Math.round(performance.now() - startedAt),
        words: wordsPage.items.length,
        sentences: sentencesPage.items.length,
        hasMoreWords: wordsPage.hasMore,
        hasMoreSentences: sentencesPage.hasMore,
      });
    } catch (err) {
      void platformBridge.logs.frontendEvent('review-search-load-more-failed', {
        elapsedMs: Math.round(performance.now() - startedAt),
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    } finally {
      setLoadingSearch(false);
    }
  }

  async function removeEntry(entry: ReviewEntry) {
    const confirmed = window.confirm(t('deleteFavoriteConfirm', { kind: entry.kind === 'word' ? t('word') : t('sentence') }));
    if (!confirmed) return;

    if (entry.kind === 'word') {
      const removedLoadedWordCount = loadedWords.filter((word) => entry.item.ids.includes(word.id)).length;
      await Promise.all(entry.item.ids.map((wordId) => deleteFavoriteWord(wordId)));
      setLoadedWords((previous) => previous.filter((word) => !entry.item.ids.includes(word.id)));
      setSearchWords((previous) => previous.filter((word) => !entry.item.ids.includes(word.id)));
      setWordOffset((previous) => Math.max(0, previous - removedLoadedWordCount));
      setSearchWordOffset((previous) => Math.max(0, previous - entry.item.ids.length));
    } else {
      const removedLoadedSentenceCount = loadedSentences.some((sentence) => sentence.id === entry.id) ? 1 : 0;
      await deleteFavoriteSentence(entry.id);
      setLoadedSentences((previous) => previous.filter((sentence) => sentence.id !== entry.id));
      setSearchSentences((previous) => previous.filter((sentence) => sentence.id !== entry.id));
      setSentenceOffset((previous) => Math.max(0, previous - removedLoadedSentenceCount));
      setSearchSentenceOffset((previous) => Math.max(0, previous - 1));
    }
  }

  const groups = groupReviewEntries(entries, t);

  return (
    <section className="page">
      <div className="page-heading review-heading review-all-heading">
        <div className="review-heading-stack">
          <div className="title-with-back">
            <button className="bare-icon-button title-back-button" title={t('backToReview')} onClick={() => navigate({ name: 'review' })}>
              <ArrowLeft size={18} />
            </button>
            <h1>{t('allFavorites')}</h1>
          </div>
        </div>
        <form className="review-search-form" role="search" onSubmit={(event) => event.preventDefault()}>
          <Search size={17} />
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={t('searchFavorites')}
            aria-label={t('searchFavorites')}
          />
        </form>
      </div>

      {groups.map((group) => (
        <section className="review-day" key={group.dateKey}>
          <div className="review-day-title">
            <h2>{group.label}</h2>
            <span>{t('itemCount', { count: group.entries.length })}</span>
          </div>
          <div className="review-grid">
            {group.entries.map((entry) => (
              <article className="review-card" key={`${entry.kind}-${entry.id}`}>
                <div className="review-card-top">
                  <div className="review-meta-row">
                    <ReviewTypePill kind={entry.kind} />
                    <span className="muted">{formatTimeOfDay(entry.createdAt)}</span>
                  </div>
                  <button
                    className="bare-icon-button danger review-delete"
                    title={t('delete')}
                    onClick={() => removeEntry(entry)}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>

                {entry.kind === 'word' ? (
                  <>
                    <div className="review-card-main">
                      <h3>{entry.item.word}</h3>
                      {(entry.item.phonetic || isPlayableAudio(entry.item.audio)) && (
                        isPlayableAudio(entry.item.audio) ? (
                          <AudioTextButton
                            audio={entry.item.audio}
                            className="phonetic-audio-line muted"
                            title={t('playPronunciation')}
                          >
                            {formatPhonetic(entry.item.phonetic)}
                          </AudioTextButton>
                        ) : (
                          <p className="muted phonetic-line">{formatPhonetic(entry.item.phonetic)}</p>
                        )
                      )}
                      {entry.item.wordNote && <p className="review-note">{entry.item.wordNote}</p>}
                      {entry.item.dictionaryEntry ? (
                        <FavoriteWordDefinitionContent entry={entry.item.dictionaryEntry} />
                      ) : (
                        entry.item.definition && <p className="review-card-definition-clip">{formatDefinitionPreview(entry.item.definition)}</p>
                      )}
                    </div>
                    {entry.item.examples.length > 0 && (
                      <div className="example-list review-card-examples">
                        {entry.item.examples.map((example) => (
                          <div className="review-example" key={example.id}>
                            {isPlayableAudio(example.sentenceAudio) ? (
                              <AudioTextButton
                                audio={example.sentenceAudio}
                                className="review-example-audio-line"
                                title={t('playExampleAudio')}
                              >
                                {example.sentence ?? ''}
                              </AudioTextButton>
                            ) : (
                              <blockquote>{example.sentence ?? ''}</blockquote>
                            )}
                            {example.note && <p className="review-example-note">{example.note}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="review-sentence">
                    <div className="review-sentence-text">
                      {isPlayableAudio(entry.item.audio) ? (
                        <AudioTextButton
                          audio={entry.item.audio}
                          className="review-sentence-audio-line"
                          title={t('playSentenceAudio')}
                        >
                          {entry.item.text}
                        </AudioTextButton>
                      ) : (
                        <p>{entry.item.text}</p>
                      )}
                      {entry.item.note && <p className="review-note">{entry.item.note}</p>}
                    </div>
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>
      ))}

      {entries.length === 0 && !loadingReview && !loadingSearch && (
        <p className="muted">{isSearching ? t('searchNoResults') : t('noFavorites')}</p>
      )}
      {(loadingReview || loadingSearch) && <ReviewSkeletonSection />}
      <div ref={loadMoreTriggerRef} className="review-load-more" aria-hidden={!hasMoreReview && entries.length === 0} />
      {!isSearching && !hasMoreReview && entries.length > 0 && (
        <p className="review-end-note">{t('noMoreFavorites')}</p>
      )}
      {isSearching && entries.length > 0 && !loadingSearch && (
        <p className="review-end-note">{t('searchResultCount', { count: entries.length })}</p>
      )}
    </section>
  );
}

function ReviewSkeletonSection() {
  const { t } = useI18n();
  return (
    <section className="review-day review-skeleton-section" aria-label={t('loadFavorites')}>
      <div className="review-day-title skeleton-title-row">
        <span className="skeleton-line title" />
        <span className="skeleton-line count" />
      </div>
      <div className="review-grid">
        {Array.from({ length: 6 }).map((_, index) => (
          <article className="review-card review-skeleton-card" key={index}>
            <div className="skeleton-card-top">
              <span className="skeleton-pill" />
              <span className="skeleton-line time" />
            </div>
            <span className="skeleton-line heading" />
            <span className="skeleton-line body" />
            <span className="skeleton-line body short" />
          </article>
        ))}
      </div>
    </section>
  );
}
