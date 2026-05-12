import { useState, useCallback, useEffect } from 'react';
import type { Field } from '../types';
import * as api from '../utils/api';

export function useFields() {
  const [fields, setFields] = useState<Field[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!api.isLoggedIn()) {
      setFields([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const serverFields = await api.getFields();
      setFields(
        serverFields.map((f) => ({
          id: f.id,
          name: f.name,
          sowingDate: f.sowingDate,
          stationMac: f.stationMac,
          stationName: f.stationName,
          createdAt: f.createdAt,
        }))
      );
    } catch (err) {
      console.error('Failed to fetch fields:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const add = useCallback(
    async (data: { name: string; sowingDate: string; stationMac: string }) => {
      const newField = await api.createField(data.name, data.sowingDate, data.stationMac);
      await refresh();
      return newField;
    },
    [refresh]
  );

  const update = useCallback(
    async (id: number, updates: { name?: string; sowingDate?: string }) => {
      await api.updateField(id, updates);
      await refresh();
    },
    [refresh]
  );

  const remove = useCallback(
    async (id: number) => {
      await api.deleteField(id);
      await refresh();
    },
    [refresh]
  );

  return { fields, loading, add, update, remove, refresh };
}
