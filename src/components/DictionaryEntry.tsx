import { tokenize } from '../lib/captionUtils';
import type { DictionaryEntry, DictionarySection } from '../lib/types';
import { useI18n } from '../lib/i18n/context';

export function DictionaryEntryContent({
  entry,
  className,
  onDefinitionWord,
}: {
  entry: DictionaryEntry;
  className?: string;
  onDefinitionWord?: (word: string) => void;
}) {
  const { t } = useI18n();
  const sections =
    entry.sections && entry.sections.length > 0
      ? entry.sections
      : [
          {
            title: t('dictionaryTitle'),
            groups: entry.meanings.map((meaning) => ({
              label: meaning.partOfSpeech,
              lines: meaning.definitions,
            })),
          },
        ];

  return (
    <div className={className ? `meanings ${className}` : 'meanings'}>
      {sections.map((section, sectionIndex) => {
        const sectionTitle = translateDictionarySectionTitle(section, t);
        return (
          <section className="dictionary-section" key={`${section.title}-${sectionIndex}`}>
            {sectionTitle && <h3>{sectionTitle}</h3>}
            <div className="dictionary-section-groups">
              {section.groups.map((group, groupIndex) => (
                <div className="dictionary-group" key={`${group.label ?? 'group'}-${groupIndex}`}>
                  {group.lines.map((line, lineIndex) => (
                    <p key={`${line}-${lineIndex}`}>
                      {group.label && lineIndex === 0 && (
                        <span className={isDictionaryBadgeLabel(group.label) ? 'dictionary-label badge' : 'dictionary-label'}>
                          {formatDictionaryGroupLabel(group, t)}
                        </span>
                      )}
                      {onDefinitionWord ? <ClickableDefinition text={line} onWord={onDefinitionWord} /> : line}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function FavoriteWordDefinitionContent({ entry }: { entry: DictionaryEntry }) {
  const definitionEntry = createDefinitionOnlyDictionaryEntry(entry);
  if (!definitionEntry) return null;
  return <DictionaryEntryContent entry={definitionEntry} className="review-card-dictionary review-card-definition-clip" />;
}

export function createDefinitionOnlyDictionaryEntry(entry: DictionaryEntry): DictionaryEntry | null {
  const definitionSections = getDefinitionSections(entry);
  if (definitionSections.length > 0) {
    return {
      ...entry,
      sections: definitionSections,
    };
  }

  if (entry.meanings.length > 0) {
    return {
      ...entry,
      sections: undefined,
    };
  }

  return null;
}

export function getDefinitionSections(entry: DictionaryEntry): DictionarySection[] {
  return (entry.sections ?? [])
    .filter((section) => section.titleKey === 'dictionarySectionEnglishDefinitions' || isDefinitionSectionTitle(section.title))
    .map((section) => ({
      ...section,
      groups: section.groups
        .map((group) => ({
          ...group,
          lines: group.lines.map((line) => line.trim()).filter(Boolean),
        }))
        .filter((group) => group.lines.length > 0),
    }))
    .filter((section) => section.groups.length > 0);
}

export function isDefinitionSectionTitle(title: string): boolean {
  return ['释义', '英文释义', '英文釋義', 'definition', 'definitions', 'english definition', 'english definitions', 'meaning', 'meanings']
    .includes(title.trim().toLowerCase());
}

export function translateDictionarySectionTitle(section: DictionarySection, t: (key: string) => string): string {
  if (section.titleKey) {
    return t(section.titleKey);
  }
  const { title } = section;
  const normalized = normalizeDictionaryUiLabel(title);
  if (!normalized) return '';
  if (['英文释义', '英文釋義', 'english definition', 'english definitions'].includes(normalized)) {
    return t('dictionarySectionEnglishDefinitions');
  }
  if (['例句', 'example', 'examples'].includes(normalized)) {
    return t('dictionarySectionExamples');
  }
  if (['相关', '相關', 'related'].includes(normalized)) {
    return t('dictionarySectionRelated');
  }
  if (['变形', '變形', 'forms', 'inflections'].includes(normalized)) {
    return t('dictionarySectionForms');
  }
  return title;
}

export function formatDictionaryGroupLabel(group: DictionarySection['groups'][number], t: (key: string) => string): string {
  const partOfSpeech = normalizeDictionaryPartOfSpeechLabel(group.label ?? '');
  if (partOfSpeech) {
    return partOfSpeech;
  }
  return translateDictionaryGroupLabel(group, t);
}

export function translateDictionaryGroupLabel(group: DictionarySection['groups'][number], t: (key: string) => string): string {
  if (group.labelKey) {
    return t(group.labelKey);
  }
  const label = group.label ?? '';
  const normalized = normalizeDictionaryUiLabel(label);
  if (['同义词', '同義詞', 'synonym', 'synonyms'].includes(normalized)) {
    return t('dictionaryGroupSynonyms');
  }
  if (['反义词', '反義詞', 'antonym', 'antonyms'].includes(normalized)) {
    return t('dictionaryGroupAntonyms');
  }
  if (['变形', '變形', 'forms', 'inflections'].includes(normalized)) {
    return t('dictionarySectionForms');
  }
  return label;
}

export function normalizeDictionaryUiLabel(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

export function isDictionaryBadgeLabel(label: string): boolean {
  return Boolean(normalizeDictionaryPartOfSpeechLabel(label));
}

export function normalizeDictionaryPartOfSpeechLabel(label: string): string {
  const normalized = label.trim().toLowerCase();
  const knownPartOfSpeechLabels: Record<string, string> = {
    noun: 'n.',
    n: 'n.',
    'n.': 'n.',
    verb: 'v.',
    v: 'v.',
    'v.': 'v.',
    adjective: 'adj.',
    adj: 'adj.',
    'adj.': 'adj.',
    adverb: 'adv.',
    adv: 'adv.',
    'adv.': 'adv.',
    pronoun: 'pron.',
    preposition: 'prep.',
    conjunction: 'conj.',
    interjection: 'interj.',
    determiner: 'det.',
    article: 'art.',
    prefix: 'pref.',
    suffix: 'suff.',
    numeral: 'num.',
    phrase: 'phr.',
  };
  return knownPartOfSpeechLabels[normalized] ?? '';
}

export function ClickableDefinition({
  text,
  onWord,
}: {
  text: string;
  onWord: (word: string) => void;
}) {
  return (
    <>
      {tokenize(text).map((token, index) =>
        token.isWord ? (
          <button
            className="definition-word"
            key={`${token.value}-${index}`}
            type="button"
            onClick={() => onWord(token.value)}
          >
            {token.value}
          </button>
        ) : (
          <span key={`${token.value}-${index}`}>{token.value}</span>
        ),
      )}
    </>
  );
}
