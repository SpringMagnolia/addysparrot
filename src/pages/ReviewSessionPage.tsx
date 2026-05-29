import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2, MessageSquare, RefreshCcw, Square, Star } from 'lucide-react';
import { useI18n } from '../lib/i18n/context';
import { navigate } from '../lib/router';
import {
  applyReviewResult,
  createReviewOverview,
  createReviewSessionItems,
  formatReviewDueAt,
  formatReviewTargetProgress,
  getReviewStageLabel,
  previewReviewDueAt,
  shouldCleanupAfterConsecutiveEasy,
  type ReviewRating,
  type ReviewSessionItem,
} from '../lib/review';
import {
  deleteFavoriteWord,
  deleteFavoriteSentence,
  deleteReviewCard,
  listFavoriteWords,
  saveReviewCard,
  saveReviewLog,
  listReviewLogs,
  saveFavoriteWord,
  saveFavoriteSentence,
} from '../lib/storage';
import { normalizeLookupWord } from '../lib/dictionary';
import { loadMaintainedReviewData, getCurrentReviewStatusLabel } from '../lib/reviewUtils';
import { AudioTextButton, isPlayableAudio } from '../components/AudioTextButton';
import { DictionaryEntryContent } from '../components/DictionaryEntry';
import { ReviewTypePill } from '../components/ReviewTypePill';
import { formatPhonetic, formatReviewSessionMetaDate } from '../lib/formatUtils';

export function ReviewSessionPage() {
  const { t } = useI18n();
  const [sessionItems, setSessionItems] = useState<ReviewSessionItem[]>([]);
  const [sessionOverview, setSessionOverview] = useState(() => createReviewOverview([], [], [], []));
  const [loadingSession, setLoadingSession] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [sessionTotal, setSessionTotal] = useState(0);
  const [savingResult, setSavingResult] = useState(false);
  const [reviewRatings, setReviewRatings] = useState<Record<string, ReviewRating>>({});
  const [editingReviewNoteKey, setEditingReviewNoteKey] = useState<string | null>(null);
  const [reviewNoteDraft, setReviewNoteDraft] = useState('');
  const [savingReviewNote, setSavingReviewNote] = useState(false);

  const loadSession = useCallback(async () => {
    setLoadingSession(true);
    setLoadError(null);
    try {
      const { words, sentences, cards, logs } = await loadMaintainedReviewData();
      const overview = createReviewOverview(words, sentences, cards, logs);
      const nextSessionItems = createReviewSessionItems(words, sentences, cards, logs, Date.now(), 10, true);
      setSessionItems(nextSessionItems);
      setSessionOverview(overview);
      setSessionTotal(nextSessionItems.length);
      setCurrentIndex(0);
      setReviewRatings({});
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : t('reviewContentLoadFailed'));
    } finally {
      setLoadingSession(false);
    }
  }, [t]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const current = sessionItems[currentIndex];
  const ratedCount = Object.keys(reviewRatings).length;
  const completed = !loadingSession && sessionTotal > 0 && ratedCount >= sessionTotal;
  const currentWordAudio = current?.item.kind === 'word' ? current.item.audio : undefined;
  const currentRating = current ? reviewRatings[current.item.key] : undefined;
  const currentReviewNote =
    current?.item.kind === 'word'
      ? current.item.wordNote ?? ''
      : current?.item.kind === 'sentence'
        ? current.item.sentence.note ?? ''
        : '';
  const editingCurrentReviewNote = Boolean(current && editingReviewNoteKey === current.item.key);
  const canGoPrevious = currentIndex > 0 && !savingResult;
  const canGoNext = Boolean(current) && currentIndex < sessionItems.length - 1 && !savingResult;

  async function recordReviewResult(rating: ReviewRating) {
    if (!current || savingResult) return;

    const { card: nextCard, log: nextLog } = applyReviewResult(current.item, current.card, rating);
    const currentKey = current.item.key;

    setReviewRatings((previous) => ({ ...previous, [currentKey]: rating }));
    setSessionItems((previous) =>
      previous.map((entry) => (entry.item.key === currentKey ? { ...entry, card: nextCard, dueAt: nextCard.dueAt, isNew: false } : entry)),
    );
    setSessionOverview((previous) => {
      const reviewedTodayCount = previous.reviewedTodayCount + 1;
      return {
        ...previous,
        reviewedTodayCount,
        extraReviewedTodayCount: Math.max(0, reviewedTodayCount - previous.dailyTarget),
        todayRatingCounts: {
          ...previous.todayRatingCounts,
          [rating]: previous.todayRatingCounts[rating] + 1,
        },
      };
    });
    setCurrentIndex((previous) => Math.min(previous + 1, sessionItems.length - 1));
    setSavingResult(true);
    try {
      await Promise.all([saveReviewCard(nextCard), saveReviewLog(nextLog)]);
      if (rating === 'easy') {
        const logs = await listReviewLogs();
        if (shouldCleanupAfterConsecutiveEasy(logs, currentKey)) {
          await Promise.all([
            deleteReviewCard(nextCard.id),
            ...(current.item.kind === 'word'
              ? current.item.ids.map((wordId) => deleteFavoriteWord(wordId))
              : [deleteFavoriteSentence(current.item.sentence.id)]),
          ]);
        }
      }
    } finally {
      setSavingResult(false);
    }
  }

  function goPreviousReviewItem() {
    if (!canGoPrevious) return;
    setCurrentIndex((previous) => Math.max(0, previous - 1));
  }

  function handleReviewNext() {
    if (!canGoNext) return;
    setCurrentIndex((previous) => Math.min(sessionItems.length - 1, previous + 1));
  }

  function openCurrentReviewNoteEditor() {
    if (!current) return;
    setEditingReviewNoteKey(current.item.key);
    setReviewNoteDraft(currentReviewNote);
  }

  function cancelCurrentReviewNoteEdit() {
    setEditingReviewNoteKey(null);
    setReviewNoteDraft('');
  }

  async function saveCurrentReviewNote(event: FormEvent) {
    event.preventDefault();
    if (!current || savingReviewNote) return;

    const note = reviewNoteDraft.trim();
    const currentKey = current.item.key;
    setSavingReviewNote(true);
    try {
      if (current.item.kind === 'word') {
        const normalizedWord = normalizeLookupWord(current.item.word);
        const words = await listFavoriteWords();
        const matchingWords = words.filter((word) => normalizeLookupWord(word.word) === normalizedWord);
        await Promise.all(
          matchingWords.map((word) =>
            saveFavoriteWord({
              ...word,
              wordNote: note || undefined,
            }),
          ),
        );
        setSessionItems((previous) =>
          previous.map((entry) =>
            entry.item.key === currentKey && entry.item.kind === 'word'
              ? {
                  ...entry,
                  item: {
                    ...entry.item,
                    wordNote: note || undefined,
                    examples: entry.item.examples.map((example) => ({
                      ...example,
                      wordNote: note || undefined,
                    })),
                  },
                }
              : entry,
          ),
        );
      } else {
        const nextSentence = {
          ...current.item.sentence,
          note: note || undefined,
        };
        await saveFavoriteSentence(nextSentence);
        setSessionItems((previous) =>
          previous.map((entry) =>
            entry.item.key === currentKey && entry.item.kind === 'sentence'
              ? {
                  ...entry,
                  item: {
                    ...entry.item,
                    sentence: nextSentence,
                  },
                }
              : entry,
          ),
        );
      }
      setEditingReviewNoteKey(null);
      setReviewNoteDraft(note);
    } finally {
      setSavingReviewNote(false);
    }
  }

  const reviewRatingValues = Object.values(reviewRatings);
  const forgotCount = reviewRatingValues.filter((result) => result === 'forgot').length;
  const easyCount = reviewRatingValues.filter((result) => result === 'easy').length;
  const fuzzyCount = reviewRatingValues.filter((result) => result === 'remembered').length;
  const forgotPreview = current ? formatReviewDueAt(previewReviewDueAt(current.item, current.card, 'forgot'), t) : '';
  const rememberedPreview = current ? formatReviewDueAt(previewReviewDueAt(current.item, current.card, 'remembered'), t) : '';
  const easyPreview = current ? formatReviewDueAt(previewReviewDueAt(current.item, current.card, 'easy'), t) : '';

  return (
    <section className="page review-session-page">
      <div className="page-heading review-session-heading">
        <div className="review-heading-stack">
          <div className="title-with-back">
            <button className="bare-icon-button title-back-button" title={t('backToReview')} onClick={() => navigate({ name: 'review' })}>
              <ArrowLeft size={18} />
            </button>
            <h1>{t('review')}</h1>
          </div>
        </div>
      </div>

      {loadingSession && (
        <div className="review-session-state">
          <Loader2 className="spin" size={20} />
          {t('loadingReviewContent')}
        </div>
      )}

      {loadError && !loadingSession && (
        <div className="review-session-state danger">
          <p>{loadError}</p>
          <button className="secondary-button" onClick={loadSession}>
            <RefreshCcw size={17} />
            {t('reload')}
          </button>
        </div>
      )}

      {!loadingSession && !loadError && sessionItems.length === 0 && (
        <div className="empty-state review-session-empty">
          <Star size={28} />
          <p>{t('noReviewItems')}</p>
          <button className="secondary-button" onClick={() => navigate({ name: 'review' })}>
            {t('backToReview')}
          </button>
        </div>
      )}

      {completed && (
        <div className="review-finish-panel">
          <div>
            <p className="eyebrow">{t('completedRound')}</p>
            <h2>{t('reviewSessionDone', { count: sessionTotal })}</h2>
          </div>
          <div className="review-summary-grid">
            <div>
              <span>{easyCount}</span>
              <p>{t('easy')}</p>
            </div>
            <div>
              <span>{fuzzyCount}</span>
              <p>{t('fuzzy')}</p>
            </div>
            <div>
              <span>{forgotCount}</span>
              <p>{t('forgot')}</p>
            </div>
          </div>
          <div className="review-session-actions">
            <button className="primary-button" onClick={loadSession}>
              <RefreshCcw size={17} />
              {t('reviewAgain')}
            </button>
            <button className="secondary-button" onClick={() => navigate({ name: 'review' })}>
              {t('backToReview')}
            </button>
          </div>
        </div>
      )}

      {current && !completed && (
        <div className="review-session-progress-header">
          <div className="review-session-progress-copy">
            <span>{t('progress')}</span>
            <span>{currentIndex + 1} / {Math.max(sessionTotal, 1)} · {formatReviewTargetProgress(sessionOverview, t)}</span>
          </div>
          <div className="review-segmented-progress" aria-label={t('reviewProgressLabel', { count: ratedCount, total: sessionTotal })}>
            {Array.from({ length: Math.max(sessionTotal, 1) }).map((_, index) => (
              <span key={index} className={index < ratedCount ? 'completed' : undefined} />
            ))}
          </div>
        </div>
      )}

      {current && !completed && (
        <div className="review-session-frame" aria-label={t('reviewNavigation')}>
          <div className="review-session-card-stage">
            <button
              className="review-nav-button"
              type="button"
              title={t('previous')}
              disabled={!canGoPrevious}
              onClick={goPreviousReviewItem}
            >
              <ChevronLeft size={24} />
            </button>
            <section className="review-session-card">
              <div className="review-session-meta">
                <div className="review-session-meta-left">
                  <ReviewTypePill kind={current.item.kind} />
                  <span>{getReviewStageLabel(current.card, t)}</span>
                  <span>{getCurrentReviewStatusLabel(current.dueAt, t)}</span>
                </div>
                <div className="review-session-meta-right">
                  <span className="review-session-date">{formatReviewSessionMetaDate(current.item.createdAt, t)}</span>
                  <button
                    className={currentReviewNote.trim() ? 'review-note-pill active' : 'review-note-pill'}
                    type="button"
                    title={currentReviewNote.trim() ? t('editNote') : t('addNote')}
                    aria-label={currentReviewNote.trim() ? t('editNote') : t('addNote')}
                    onClick={openCurrentReviewNoteEditor}
                  >
                    <MessageSquare size={14} />
                  </button>
                </div>
              </div>

            <div className="review-session-content-scroll">
              <div className="review-prompt">
                {current.item.kind === 'word' ? (
                  <>
                    <div className="review-word-face">
                      <div className="review-word-static-line">
                        <span className="review-word-term">{current.item.word}</span>
                      </div>
                      {(current.item.phonetic || isPlayableAudio(currentWordAudio)) && (
                        isPlayableAudio(currentWordAudio) ? (
                          <AudioTextButton
                            audio={currentWordAudio}
                            className="review-word-audio-line"
                            title={t('playPronunciation')}
                          >
                            {current.item.phonetic && (
                              <span className="review-word-phonetic">{formatPhonetic(current.item.phonetic)}</span>
                            )}
                          </AudioTextButton>
                        ) : (
                          <div className="review-word-phonetic-line">
                            <span className="review-word-phonetic">{formatPhonetic(current.item.phonetic)}</span>
                          </div>
                        )
                      )}
                    </div>
                    {editingCurrentReviewNote ? (
                      <form className="review-note-editor" onSubmit={saveCurrentReviewNote}>
                        <textarea
                          value={reviewNoteDraft}
                          onChange={(event) => setReviewNoteDraft(event.target.value)}
                          placeholder={t('wordNotePlaceholder')}
                          rows={3}
                          autoFocus
                        />
                        <div className="review-note-editor-actions">
                          <button className="secondary-button" type="button" onClick={cancelCurrentReviewNoteEdit} disabled={savingReviewNote}>
                            {t('cancel')}
                          </button>
                          <button className="primary-button" type="submit" disabled={savingReviewNote}>
                            {t('save')}
                          </button>
                        </div>
                      </form>
                    ) : (
                      current.item.wordNote && <p className="review-note">{current.item.wordNote}</p>
                    )}
                    {(current.item.dictionaryEntry || current.item.definition) && (
                      <div className="word-review-details revealed">
                        <div className="word-review-hidden-content">
                          <div className="review-definition-scroll">
                            {current.item.dictionaryEntry ? (
                              <DictionaryEntryContent entry={current.item.dictionaryEntry} className="review-session-dictionary" />
                            ) : (
                              <p className="saved-definition-text">{current.item.definition}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="sentence-visible-card">
                    {isPlayableAudio(current.item.sentence.audio) ? (
                      <AudioTextButton
                        audio={current.item.sentence.audio}
                        className="sentence-visible-audio-line"
                        title={t('playSentenceAudio')}
                      >
                        {current.item.sentence.text}
                      </AudioTextButton>
                    ) : (
                      <p>{current.item.sentence.text}</p>
                    )}
                    {editingCurrentReviewNote ? (
                      <form className="review-note-editor" onSubmit={saveCurrentReviewNote}>
                        <textarea
                          value={reviewNoteDraft}
                          onChange={(event) => setReviewNoteDraft(event.target.value)}
                          placeholder={t('sentenceNotePlaceholder')}
                          rows={3}
                          autoFocus
                        />
                        <div className="review-note-editor-actions">
                          <button className="secondary-button" type="button" onClick={cancelCurrentReviewNoteEdit} disabled={savingReviewNote}>
                            {t('cancel')}
                          </button>
                          <button className="primary-button" type="submit" disabled={savingReviewNote}>
                            {t('save')}
                          </button>
                        </div>
                      </form>
                    ) : (
                      current.item.sentence.note && <p className="review-note">{current.item.sentence.note}</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {current.item.kind === 'word' && current.item.examples.length > 0 && (
              <div className="review-session-examples">
                {current.item.examples.slice(0, 2).map((example) => (
                  <div className="review-example" key={example.id}>
                    {isPlayableAudio(example.sentenceAudio) ? (
                      <AudioTextButton
                        audio={example.sentenceAudio}
                        className="review-example-audio-line"
                        title={t('playExampleAudio')}
                        stopPropagation
                      >
                        {example.sentence}
                      </AudioTextButton>
                    ) : (
                      <blockquote>{example.sentence}</blockquote>
                    )}
                    {example.note && <p className="review-example-note">{example.note}</p>}
                  </div>
                ))}
              </div>
            )}

            </section>
            <button
              className="review-nav-button"
              type="button"
              title={t('next')}
              disabled={!canGoNext}
              onClick={handleReviewNext}
            >
              <ChevronRight size={24} />
            </button>
          </div>
          <div className="review-rating-actions">
            <div className="review-rating-left">
              <button
                className={currentRating === 'easy' ? 'secondary-button review-rating-button selected' : 'secondary-button review-rating-button'}
                type="button"
                disabled={savingResult}
                onClick={() => recordReviewResult('easy')}
                title={easyPreview}
              >
                <Star size={17} />
                {t('easy')}
              </button>
              <button
                className={currentRating === 'remembered' ? 'secondary-button review-rating-button selected' : 'secondary-button review-rating-button'}
                type="button"
                disabled={savingResult}
                onClick={() => recordReviewResult('remembered')}
                title={rememberedPreview}
              >
                <RefreshCcw size={17} />
                {t('fuzzy')}
              </button>
              <button
                className={currentRating === 'forgot' ? 'secondary-button review-rating-button selected' : 'secondary-button review-rating-button'}
                type="button"
                disabled={savingResult}
                onClick={() => recordReviewResult('forgot')}
                title={forgotPreview}
              >
                <Square size={17} />
                {t('forgot')}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
