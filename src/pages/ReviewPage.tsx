import { ArrowLeft, Bookmark, BookmarkCheck, Check, Loader2, Play, RefreshCcw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useI18n } from '../lib/i18n/context';
import { navigate } from '../lib/router';
import { platformBridge } from '../lib/platformBridge';
import { createReviewOverview, formatReviewTargetProgress } from '../lib/review';
import { loadMaintainedReviewData, groupFavoriteWords } from '../lib/reviewUtils';
import { isPlayableAudio } from '../components/AudioTextButton';
import type { FavoriteWord, FavoriteSentence } from '../lib/types';

export function ReviewPage() {
  const { t } = useI18n();
  const [words, setWords] = useState<FavoriteWord[]>([]);
  const [sentences, setSentences] = useState<FavoriteSentence[]>([]);
  const [reviewOverview, setReviewOverview] = useState(() => createReviewOverview([], [], [], []));
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  const refreshOverview = useCallback(async () => {
    setLoadingOverview(true);
    setOverviewError(null);
    try {
      const { words: favoriteWords, sentences: favoriteSentences, cards, logs } = await loadMaintainedReviewData();
      setWords(favoriteWords);
      setSentences(favoriteSentences);
      setReviewOverview(createReviewOverview(favoriteWords, favoriteSentences, cards, logs));
    } catch (err) {
      void platformBridge.logs.frontendEvent('review-overview-load-failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      setOverviewError(t('reviewOverviewLoadFailed'));
    } finally {
      setLoadingOverview(false);
    }
  }, [t]);

  useEffect(() => {
    refreshOverview();
  }, [refreshOverview]);

  const uniqueWordCount = useMemo(() => groupFavoriteWords(words).length, [words]);
  const noteCount = useMemo(
    () =>
      words.filter((word) => word.note?.trim() || word.wordNote?.trim()).length +
      sentences.filter((sentence) => sentence.note?.trim()).length,
    [sentences, words],
  );
  const audioCount = useMemo(
    () =>
      words.filter((word) => isPlayableAudio(word.audio) || isPlayableAudio(word.sentenceAudio)).length +
      sentences.filter((sentence) => isPlayableAudio(sentence.audio)).length,
    [sentences, words],
  );
  const totalFavorites = words.length + sentences.length;
  const reviewTargetLabel = loadingOverview ? t('loadReviewPlan') : formatReviewTargetProgress(reviewOverview, t);

  return (
    <section className="page review-entry-page">
      <div className="page-heading review-heading">
        <div className="review-heading-stack">
          <div className="title-with-back">
            <button className="bare-icon-button title-back-button" title={t('settingsBackHome')} onClick={() => navigate({ name: 'home' })}>
              <ArrowLeft size={18} />
            </button>
            <h1>{t('reviewEntry')}</h1>
          </div>
        </div>
      </div>

      {overviewError && (
        <div className="review-entry-error">
          <span>{overviewError}</span>
          <button className="secondary-button" onClick={refreshOverview}>
            <RefreshCcw size={16} />
            {t('transcriptRetry')}
          </button>
        </div>
      )}

      <div className="review-entry-stack">
        <article className="review-entry-card">
          <div className="review-entry-card-header">
            <div>
              <span className="eyebrow">{t('allFavorites')}</span>
              <h2>{loadingOverview ? t('loadFavorites') : t('allFavoritesCount', { count: totalFavorites })}</h2>
            </div>
            <BookmarkCheck size={22} />
          </div>

          <div className="review-stat-grid">
            <div className="review-stat-item">
              <span>{t('favoriteWords')}</span>
              <strong>{loadingOverview ? '--' : words.length}</strong>
            </div>
            <div className="review-stat-item">
              <span>{t('favoriteSentences')}</span>
              <strong>{loadingOverview ? '--' : sentences.length}</strong>
            </div>
            <div className="review-stat-item">
              <span>{t('note')}</span>
              <strong>{loadingOverview ? '--' : noteCount}</strong>
            </div>
            <div className="review-stat-item">
              <span>{t('audio')}</span>
              <strong>{loadingOverview ? '--' : audioCount}</strong>
            </div>
          </div>

          <div className="review-entry-meta-row">
            <span>{loadingOverview ? t('favoritesMeta', { count: '--' }) : t('favoritesMeta', { count: uniqueWordCount })}</span>
          </div>

          <div className="review-entry-actions">
            <button className="primary-button review-entry-action" onClick={() => navigate({ name: 'reviewAll' })}>
              <Bookmark size={20} />
              {t('viewAllFavorites')}
            </button>
          </div>
        </article>

        <article className="review-entry-card review-entry-card-primary">
          <div className="review-entry-card-header">
            <div>
              <span className="eyebrow">{t('reviewPlan')}</span>
              <h2 className="review-target-title">
                {loadingOverview ? (
                  reviewTargetLabel
                ) : (
                  <>
                    <span>{t('todayReviewProgress', { count: reviewOverview.reviewedTodayCount, total: reviewOverview.dailyTarget })}</span>
                  </>
                )}
              </h2>
            </div>
            {loadingOverview ? <Loader2 className="spin muted" size={22} /> : <Check size={22} />}
          </div>

          <div className="review-stat-grid">
            <div className="review-stat-item">
              <span>{t('todayReview')}</span>
              <strong className="review-rating-summary">
                {loadingOverview
                  ? '--'
                  : t('todayRatingSummary', {
                      easy: reviewOverview.todayRatingCounts.easy,
                      fuzzy: reviewOverview.todayRatingCounts.remembered,
                      forgot: reviewOverview.todayRatingCounts.forgot,
                    })}
              </strong>
            </div>
            <div className="review-stat-item">
              <span>{t('tomorrowReview')}</span>
              <strong>{loadingOverview ? '--' : reviewOverview.tomorrowReviewCount}</strong>
            </div>
            <div className="review-stat-item">
              <span>{t('familiarTotal')}</span>
              <strong>{loadingOverview ? '--' : reviewOverview.familiarTotalCount}</strong>
            </div>
            <div className="review-stat-item">
              <span>{t('overdueCount')}</span>
              <strong>{loadingOverview ? '--' : reviewOverview.historyDebtCount}</strong>
            </div>
            {!loadingOverview && reviewOverview.expiringNewCount > 0 && (
              <div className="review-stat-item">
                <span>{t('expiringSoon')}</span>
                <strong>{reviewOverview.expiringNewCount}</strong>
              </div>
            )}
          </div>

          <button
            className="primary-button review-entry-action"
            onClick={() => navigate({ name: 'reviewSession' })}
          >
            <Play size={20} />
            {t('startReview')}
          </button>
        </article>
      </div>
    </section>
  );
}
