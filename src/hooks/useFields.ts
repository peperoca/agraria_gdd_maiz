import { useState, useCallback } from 'react';
import type { Field } from '../types';
import * as storage from '../utils/storage';

export function useFields() {
  const [fields, setFields] = useState<Field[]>(() => storage.getFields());

  const refresh = useCallback(() => {
    setFields(storage.getFields());
  }, []);

  const add = useCallback(
    (field: Omit<Field, 'id' | 'createdAt'>) => {
      const newField = storage.addField(field);
      setFields(storage.getFields());
      return newField;
    },
    []
  );

  const update = useCallback((id: string, updates: Partial<Field>) => {
    storage.updateField(id, updates);
    setFields(storage.getFields());
  }, []);

  const remove = useCallback((id: string) => {
    storage.deleteField(id);
    setFields(storage.getFields());
  }, []);

  return { fields, add, update, remove, refresh };
}
