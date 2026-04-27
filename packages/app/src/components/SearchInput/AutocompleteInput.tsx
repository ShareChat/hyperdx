import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import cx from 'classnames';
import Fuse from 'fuse.js';
import { Popover, Textarea, UnstyledButton } from '@mantine/core';

import { AUTOCOMPLETE_MIN_CHARS, AUTOCOMPLETE_SUGGESTIONS_LIMIT } from '@/config';
import { getLastToken, useQueryHistory } from '@/utils';
import { useDebounce } from '@/utils';

import InputLanguageSwitch from './InputLanguageSwitch';

import styles from './AutocompleteInput.module.scss';

/** Extract the value prefix from the in-progress token for Fuse.js matching. */
function extractFuseSearchTerm(token: string): string {
  const t = token.startsWith('-') ? token.slice(1) : token;
  // `field:"prefix"` (closing quote optional) → 'prefix'
  const quoted = t.match(/^[^\s:]+:"([^"]*)"?$/);
  if (quoted) return quoted[1].replace(/\*/g, '');
  // `field:prefix` (unquoted)
  const unquoted = t.match(/^[^\s:]+:(.+)$/);
  if (unquoted) return unquoted[1].replace(/\*/g, '');
  // plain token — strip wildcards
  return t.replace(/\*/g, '');
}

export default function AutocompleteInput({
  inputRef,
  value,
  onChange,
  placeholder = 'Search your events for anything...',
  autocompleteOptions,
  size = 'sm',
  aboveSuggestions,
  belowSuggestions,
  showSuggestionsOnEmpty,
  suggestionsHeader = 'Properties',
  zIndex = 999,
  onLanguageChange,
  language,
  onSubmit,
  queryHistoryType,
  'data-testid': dataTestId,
}: {
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  value?: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  size?: 'xs' | 'sm' | 'lg';
  autocompleteOptions?: { value: string; label: string }[];
  aboveSuggestions?: React.ReactNode;
  belowSuggestions?: React.ReactNode;
  showSuggestionsOnEmpty?: boolean;
  suggestionsHeader?: string;
  zIndex?: number;
  onLanguageChange?: (language: 'sql' | 'lucene') => void;
  language?: 'sql' | 'lucene';
  queryHistoryType?: string;
  'data-testid'?: string;
}) {
  const pageSize = AUTOCOMPLETE_SUGGESTIONS_LIMIT;

  const [isSearchInputFocused, _setIsSearchInputFocused] = useState(false);
  const [isInputDropdownOpen, setIsInputDropdownOpen] = useState(false);
  const setIsSearchInputFocused = useCallback(
    (state: boolean) => {
      _setIsSearchInputFocused(state);
      setIsInputDropdownOpen(state);
    },
    [_setIsSearchInputFocused],
  );
  const [rightSectionWidth, setRightSectionWidth] = useState<number | 'auto'>(
    'auto',
  );
  const [inputWidth, setInputWidth] = useState<number>(720);

  // Absolute index into the full suggestedProperties array
  const [selectedAutocompleteIndex, setSelectedAutocompleteIndex] =
    useState(-1);

  const [selectedQueryHistoryIndex, setSelectedQueryHistoryIndex] =
    useState(-1);

  const [page, setPage] = useState(0);

  // query search history
  const [queryHistory, setQueryHistory] = useQueryHistory(queryHistoryType);
  const queryHistoryList = useMemo(() => {
    if (!queryHistoryType || !queryHistory) return [];
    return queryHistory.map(q => {
      return {
        value: q,
        label: q,
      };
    });
  }, [queryHistory, queryHistoryType]);

  const showSearchHistory =
    value != null &&
    value.length === 0 &&
    queryHistoryList.length > 0 &&
    queryHistoryType;

  const fuse = useMemo(
    () =>
      new Fuse(autocompleteOptions ?? [], {
        keys: ['value'],
        threshold: 0,
        ignoreLocation: true,
      }),
    [autocompleteOptions],
  );

  const debouncedValue = useDebounce(value ?? '', 200);
  const suggestedProperties = useMemo(() => {
    const lastToken = getLastToken(debouncedValue);

    if (!lastToken.length && showSuggestionsOnEmpty) {
      return autocompleteOptions ?? [];
    }
    if (!lastToken.length) return [];

    const fuseTerm = extractFuseSearchTerm(lastToken);
    // bare `field:` (empty value portion) or pure wildcard → show all fetched options
    if (!fuseTerm.length) return autocompleteOptions ?? [];
    // enforce minimum character threshold before filtering
    if (fuseTerm.length < AUTOCOMPLETE_MIN_CHARS) return [];

    return fuse.search(fuseTerm).map(result => result.item);
  }, [debouncedValue, fuse, autocompleteOptions, showSuggestionsOnEmpty]);

  // Reset pagination and selection whenever the suggestion list changes
  useEffect(() => {
    setPage(0);
    setSelectedAutocompleteIndex(-1);
  }, [suggestedProperties]);

  const totalPages = Math.ceil(suggestedProperties.length / pageSize);
  const pageStart = page * pageSize;
  const pageEnd = Math.min((page + 1) * pageSize, suggestedProperties.length) - 1;
  const pagedSuggestions = suggestedProperties.slice(pageStart, pageEnd + 1);

  const onSelectSearchHistory = (query: string) => {
    setSelectedQueryHistoryIndex(-1);
    onChange(query); // update inputText bar
    setQueryHistory(query); // update history order
    setIsInputDropdownOpen(false); // close dropdown since we execute search
    onSubmit?.(); // search
  };

  const onAcceptSuggestion = (suggestion: string) => {
    setSelectedAutocompleteIndex(-1);

    const newValue =
      value == null
        ? suggestion
        : value.split(' ').slice(0, -1).join(' ') +
          `${value.split(' ').length > 1 ? ' ' : ''}${suggestion}`;
    onChange(newValue);
    inputRef.current?.focus();
  };
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (ref.current) {
      setRightSectionWidth(ref.current.clientWidth);
    }
    if (inputRef.current) {
      setInputWidth(inputRef.current.clientWidth);
    }
  }, [language, onLanguageChange, inputRef]);

  // Height including the 2px border from .textarea (1px top + 1px bottom)
  const baseHeight = size === 'xs' ? 32 : size === 'lg' ? 44 : 38;

  return (
    <div
      className={styles.root}
      style={{ ['--autocomplete-base-height' as string]: `${baseHeight}px` }}
      data-expanded={isSearchInputFocused ? 'true' : undefined}
    >
      <Popover
        opened={isInputDropdownOpen}
        onChange={setIsInputDropdownOpen}
        position="bottom-start"
        offset={8}
        width="target"
        withinPortal
        closeOnClickOutside
        closeOnEscape
        styles={{
          dropdown: {
            maxWidth: inputWidth > 300 ? inputWidth : 720,
            width: '100%',
            zIndex,
          },
        }}
      >
        <Popover.Target>
          <Textarea
            ref={inputRef}
            placeholder={placeholder}
            className={cx(
              styles.textarea,
              !isSearchInputFocused && styles.collapseFade,
              isSearchInputFocused && styles.focused,
            )}
            value={value}
            size={size}
            autosize
            minRows={1}
            maxRows={isSearchInputFocused ? 4 : 1}
            data-testid={dataTestId}
            onChange={e => onChange(e.target.value)}
            onFocus={() => {
              setSelectedAutocompleteIndex(-1);
              setSelectedQueryHistoryIndex(-1);
              setIsSearchInputFocused(true);
            }}
            onBlur={() => {
              setSelectedAutocompleteIndex(-1);
              setSelectedQueryHistoryIndex(-1);
              setIsSearchInputFocused(false);
            }}
            onKeyDown={e => {
              if (
                e.key === 'Escape' &&
                e.target instanceof HTMLTextAreaElement
              ) {
                e.preventDefault();
                setIsInputDropdownOpen(false);
                e.target.blur();
              }

              // Autocomplete Navigation/Acceptance Keys
              if (e.key === 'Tab' && e.target instanceof HTMLTextAreaElement) {
                if (
                  suggestedProperties.length > 0 &&
                  selectedAutocompleteIndex >= 0 &&
                  selectedAutocompleteIndex < suggestedProperties.length
                ) {
                  e.preventDefault();
                  onAcceptSuggestion(
                    suggestedProperties[selectedAutocompleteIndex].value,
                  );
                }
              }
              if (
                e.key === 'Enter' &&
                e.target instanceof HTMLTextAreaElement
              ) {
                if (
                  suggestedProperties.length > 0 &&
                  selectedAutocompleteIndex >= 0 &&
                  selectedAutocompleteIndex < suggestedProperties.length
                ) {
                  e.preventDefault();
                  onAcceptSuggestion(
                    suggestedProperties[selectedAutocompleteIndex].value,
                  );
                } else {
                  // Allow shift+enter to still create new lines
                  if (!e.shiftKey) {
                    e.preventDefault();
                    if (queryHistoryType && value) {
                      setQueryHistory(value);
                    }
                    onSubmit?.();
                  }
                }
              }
              if (
                e.key === 'ArrowDown' &&
                e.target instanceof HTMLTextAreaElement
              ) {
                if (suggestedProperties.length > 0) {
                  const next = Math.min(
                    selectedAutocompleteIndex + 1,
                    suggestedProperties.length - 1,
                  );
                  // Advance page when crossing the page boundary
                  if (next > pageEnd && page < totalPages - 1) {
                    setPage(p => p + 1);
                  }
                  setSelectedAutocompleteIndex(next);
                }
              }
              if (
                e.key === 'ArrowUp' &&
                e.target instanceof HTMLTextAreaElement
              ) {
                if (suggestedProperties.length > 0) {
                  const prev = Math.max(selectedAutocompleteIndex - 1, 0);
                  // Retreat page when crossing the page boundary
                  if (prev < pageStart && page > 0) {
                    setPage(p => p - 1);
                  }
                  setSelectedAutocompleteIndex(prev);
                }
              }
            }}
            rightSectionWidth={rightSectionWidth}
            rightSection={
              language != null && onLanguageChange != null ? (
                <div ref={ref}>
                  <InputLanguageSwitch
                    language={language}
                    onLanguageChange={onLanguageChange}
                  />
                </div>
              ) : undefined
            }
          />
        </Popover.Target>
        <Popover.Dropdown className={styles.dropdown}>
          {aboveSuggestions != null && (
            <div className={styles.aboveSuggestions}>{aboveSuggestions}</div>
          )}
          <div>
            {suggestedProperties.length > 0 && (
              <div className={styles.suggestionsSection}>
                <div className={styles.suggestionsHeaderRow}>
                  <div className={styles.suggestionsHeader}>
                    {suggestionsHeader}
                  </div>
                  {totalPages > 1 ? (
                    <div className={styles.pagination}>
                      <UnstyledButton
                        className={styles.pageButton}
                        disabled={page === 0}
                        onClick={() => {
                          setPage(p => p - 1);
                          setSelectedAutocompleteIndex(-1);
                        }}
                        aria-label="Previous suggestions"
                      >
                        ‹
                      </UnstyledButton>
                      <span className={styles.pageIndicator}>
                        {page + 1} / {totalPages}
                      </span>
                      <UnstyledButton
                        className={styles.pageButton}
                        disabled={page === totalPages - 1}
                        onClick={() => {
                          setPage(p => p + 1);
                          setSelectedAutocompleteIndex(-1);
                        }}
                        aria-label="Next suggestions"
                      >
                        ›
                      </UnstyledButton>
                    </div>
                  ) : (
                    suggestedProperties.length > pageSize && (
                      <div className={styles.suggestionsLimit}>
                        (Showing Top {pageSize})
                      </div>
                    )
                  )}
                </div>
                {pagedSuggestions.map(({ value, label }, i) => {
                  const absoluteIdx = pageStart + i;
                  return (
                    <div
                      className={cx(
                        styles.suggestionItem,
                        selectedAutocompleteIndex === absoluteIdx &&
                          styles.selected,
                      )}
                      role="button"
                      key={value}
                      onMouseOver={() => {
                        setSelectedAutocompleteIndex(absoluteIdx);
                      }}
                      onClick={() => {
                        onAcceptSuggestion(value);
                      }}
                    >
                      <span className={styles.suggestionLabel}>{label}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          {belowSuggestions != null && (
            <div className={styles.belowSuggestions}>{belowSuggestions}</div>
          )}
          <div>
            {showSearchHistory && (
              <div className={styles.historySection}>
                <div className={styles.historyTitle}>Search History:</div>
                {queryHistoryList.map(({ value, label }, i) => {
                  return (
                    <UnstyledButton
                      className={cx(
                        styles.historyItem,
                        selectedQueryHistoryIndex === i && styles.selected,
                      )}
                      key={value}
                      onMouseOver={() => setSelectedQueryHistoryIndex(i)}
                      onClick={() => onSelectSearchHistory(value)}
                    >
                      <span className={styles.historyItemLabel}>{label}</span>
                    </UnstyledButton>
                  );
                })}
              </div>
            )}
          </div>
        </Popover.Dropdown>
      </Popover>
    </div>
  );
}
