import { memo, useMemo } from 'react';
import { UseControllerProps } from 'react-hook-form';
import { SourceKind } from '@hyperdx/common-utils/dist/types';

import SelectControlled from '@/components/SelectControlled';
import { HDX_LOCAL_DEFAULT_SOURCES } from '@/config';
import { useConnections } from '@/connection';
import { useSources } from '@/source';

function SourceSelectControlledComponent({
  size,
  onCreate,
  allowedSourceKinds,
  ...props
}: {
  size?: string;
  onCreate?: () => void;
  allowedSourceKinds?: SourceKind[];
} & UseControllerProps<any>) {
  const { data } = useSources();
  const hasLocalDefaultSources = !!HDX_LOCAL_DEFAULT_SOURCES;

  const { data: connections } = useConnections();

  const values = useMemo(() => {
    const sourceOptions =
      data
        ?.filter(
          source =>
            !allowedSourceKinds || allowedSourceKinds.includes(source.kind),
        )
        .map(d => ({
          value: d.id,
          label:
            connections?.find(c => c.id === d.connection)?.name +
            ' | ' +
            d.name,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)) ?? [];

    const createNewOption =
      onCreate && !hasLocalDefaultSources
        ? [
            {
              value: '_create_new_value',
              label: 'Create New Source',
            },
          ]
        : [];

    return [...sourceOptions, ...createNewOption];
  }, [data, onCreate, allowedSourceKinds, hasLocalDefaultSources, connections]);

  return (
    <SelectControlled
      {...props}
      data={values}
      // disabled={isDatabasesLoading}
      comboboxProps={{ withinPortal: false }}
      searchable
      placeholder="Data Source"
      leftSection={<i className="bi bi-collection"></i>}
      maxDropdownHeight={280}
      size={size}
      onCreate={onCreate}
    />
  );
}

export const SourceSelectControlled = memo(SourceSelectControlledComponent);
