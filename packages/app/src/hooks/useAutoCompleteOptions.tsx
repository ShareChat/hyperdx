import { useEffect, useMemo, useState } from 'react';
import {
  Field,
  TableConnection,
} from '@hyperdx/common-utils/dist/core/metadata';
import { BuilderChartConfigWithDateRange } from '@hyperdx/common-utils/dist/types';

import { AUTOCOMPLETE_DATE_RANGE_MS, AUTOCOMPLETE_MIN_CHARS } from '@/config';
import {
  useJsonColumns,
  useMultipleAllFields,
  useMultipleGetKeyValues,
} from '@/hooks/useMetadata';
import {
  getLastToken,
  mergePath,
  stripNegation,
  toArray,
  useDebounce,
} from '@/utils';

export interface ILanguageFormatter {
  formatFieldValue: (f: Field) => string;
  formatFieldLabel: (f: Field) => string;
  formatKeyValPair: (key: string, value: string) => string;
}

export function useAutoCompleteOptions(
  formatter: ILanguageFormatter,
  value: string,
  {
    tableConnection,
    additionalSuggestions,
  }: {
    tableConnection?: TableConnection | TableConnection[];
    additionalSuggestions?: string[];
  },
) {
  // Fetch and gather all field options
  const { data: fields } = useMultipleAllFields(
    tableConnection
      ? Array.isArray(tableConnection)
        ? tableConnection
        : [tableConnection]
      : [],
  );
  const { fieldCompleteOptions, fieldCompleteMap } = useMemo(() => {
    const _columns = (fields ?? []).filter(c => c.jsType !== null);

    const fieldCompleteMap = new Map<string, Field>();
    const baseOptions = _columns.map(c => {
      const val = {
        value: formatter.formatFieldValue(c),
        label: formatter.formatFieldLabel(c),
      };
      fieldCompleteMap.set(val.value, c);
      return val;
    });

    const suggestionOptions =
      additionalSuggestions?.map(column => ({
        value: column,
        label: column,
      })) ?? [];

    const fieldCompleteOptions = [...baseOptions, ...suggestionOptions];

    return { fieldCompleteOptions, fieldCompleteMap };
  }, [formatter, fields, additionalSuggestions]);

  // searchField is used for the purpose of checking if a key is valid and key values should be fetched
  const [searchField, setSearchField] = useState<Field | null>(null);
  // detect field from the last quote-aware token, supporting `field:value` in-progress form
  useEffect(() => {
    const lastToken = stripNegation(getLastToken(value));
    const direct = fieldCompleteMap.get(lastToken);
    if (direct) {
      setSearchField(direct);
      return;
    }
    const colon = lastToken.indexOf(':');
    if (colon > 0) {
      const matched = fieldCompleteMap.get(lastToken.slice(0, colon));
      if (matched) setSearchField(matched);
    }
  }, [fieldCompleteMap, value]);
  // clear search field when the user moves to a different field
  useEffect(() => {
    if (!searchField) return;
    const lastToken = stripNegation(getLastToken(value));
    if (!lastToken.startsWith(formatter.formatFieldValue(searchField))) {
      setSearchField(null);
    }
  }, [searchField, setSearchField, value, formatter]);
  const tcForJson = Array.isArray(tableConnection)
    ? tableConnection.length > 0
      ? tableConnection[0]
      : undefined
    : tableConnection;
  const { data: jsonColumns } = useJsonColumns(
    tcForJson ?? {
      tableName: '',
      databaseName: '',
      connectionId: '',
    },
  );
  const searchKeys = useMemo(
    () =>
      searchField && jsonColumns
        ? [mergePath(searchField.path, jsonColumns)]
        : [],
    [searchField, jsonColumns],
  );

  // Extract the raw value prefix the user is typing after the colon, e.g.
  // `ServiceName:"user-ent` → `user-ent`. Empty when no field is active.
  const valuePrefix = useMemo(() => {
    if (!searchField) return '';
    const lastToken = stripNegation(getLastToken(value));
    const colon = lastToken.indexOf(':');
    if (colon < 0) return '';
    let raw = lastToken.slice(colon + 1);
    if (raw.startsWith('"')) raw = raw.slice(1);
    if (raw.endsWith('"')) raw = raw.slice(0, -1);
    return raw.replace(/\*/g, '');
  }, [searchField, value]);

  // Debounce so we don't fire a new ClickHouse query on every keystroke
  const debouncedValuePrefix = useDebounce(valuePrefix, 300);

  // hooks to get key values
  const chartConfigs: BuilderChartConfigWithDateRange[] = useMemo(() => {
    // Use searchKeys[0] (already processed by mergePath) so the ILIKE condition
    // uses the correct ClickHouse column expression for all field types:
    //   top-level: ServiceName
    //   map field:  ResourceAttributes['k8s.deployment.name']
    //   json field: ResourceAttributes.`k8s.deployment.name`
    const fieldPath =
      searchKeys.length > 0 && debouncedValuePrefix.length >= AUTOCOMPLETE_MIN_CHARS
        ? searchKeys[0]
        : null;
    // Escape single quotes to prevent SQL injection from the typed prefix
    const safePrefix = debouncedValuePrefix.replace(/'/g, "''");
    const now = Date.now();
    return toArray(tableConnection).map(({ databaseName, tableName, connectionId, timestampValueExpression }) => ({
      connection: connectionId,
      from: { databaseName, tableName },
      timestampValueExpression: timestampValueExpression ?? '',
      select: '',
      // Push prefix filter into ClickHouse so we aren't limited to the
      // top-N values fetched without any value-level filtering
      where: fieldPath ? `${fieldPath} ILIKE '${safePrefix}%'` : '',
      dateRange: [new Date(now - AUTOCOMPLETE_DATE_RANGE_MS), new Date(now)],
    }));
  }, [tableConnection, searchKeys, debouncedValuePrefix]);

  const { data: keyVals } = useMultipleGetKeyValues({
    chartConfigs,
    keys: searchKeys,
  });

  const keyValCompleteOptions = useMemo<
    { value: string; label: string }[]
  >(() => {
    if (!keyVals || !searchField) return fieldCompleteOptions;
    const output = // TODO: Fix this hacky type assertion caused by bug in HDX-1548
      (
        keyVals as unknown as {
          key: string;
          value: (string | { [key: string]: string })[];
        }[]
      ).flatMap(kv => {
        return kv.value.flatMap(v => {
          if (typeof v === 'string') {
            const value = formatter.formatKeyValPair(
              formatter.formatFieldValue(searchField),
              v,
            );
            return [
              {
                value,
                label: value,
              },
            ];
          } else if (typeof v === 'object') {
            // TODO: Fix type issues mentioned in HDX-1548
            const output: {
              value: string;
              label: string;
            }[] = [];
            for (const [key, val] of Object.entries(v)) {
              if (typeof key !== 'string' || typeof val !== 'string') {
                console.error('unknown type for autocomplete object ', v);
                return [];
              }
              const field = structuredClone(searchField);
              field.path.push(key);
              const value = formatter.formatKeyValPair(
                formatter.formatFieldValue(field),
                val,
              );
              output.push({
                value,
                label: value,
              });
            }
            return output;
          } else {
            return [];
          }
        });
      });
    return output;
  }, [fieldCompleteOptions, keyVals, searchField, formatter]);

  // When a field is detected and values are loaded, keyValCompleteOptions contains
  // only the fetched values. When no field is detected, it falls back to
  // fieldCompleteOptions. Returning it directly prevents field names from leaking
  // into the dropdown while the user is completing a value (e.g. ServiceName:"user").
  return keyValCompleteOptions;
}
