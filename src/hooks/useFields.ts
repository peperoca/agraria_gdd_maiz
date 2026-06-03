import { useState, useCallback, useEffect } from 'react';
import type { Field } from '../types';
import * as api from '../utils/api';

export function useFields(farmId?: number | null) {
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
      const serverFields = await api.getFields(farmId ?? undefined);
      setFields(
        serverFields.map((f) => ({
          id: f.id,
          name: f.name,
          sowingDate: f.sowingDate,
          cropType: f.cropType ?? 'corn',
          polygon: f.polygon ?? null,
          stationMac: f.stationMac,
          stationName: f.stationName,
          farmId: f.farmId,
          createdAt: f.createdAt,
          tawMm: f.tawMm ?? null,
          madPct: f.madPct ?? null,
          tawSource: f.tawSource ?? null,
          coneatGc: f.coneatGc ?? null,
          initialAswMm: f.initialAswMm ?? null,
          seasonId: f.seasonId ?? null,
          previousStationMac: f.previousStationMac ?? null,
          previousStationName: f.previousStationName ?? null,
          stationChangedAt: f.stationChangedAt ?? null,
        }))
      );
    } catch (err) {
      console.error('Failed to fetch fields:', err);
    } finally {
      setLoading(false);
    }
  }, [farmId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const add = useCallback(
    async (data: {
      name: string; sowingDate: string; stationMac: string;
      cropType?: string; farmId?: number;
      polygon?: { type: 'Polygon'; coordinates: number[][][] } | null;
    }) => {
      const newField = await api.createField(
        data.name, data.sowingDate, data.stationMac,
        data.cropType, data.farmId, data.polygon,
      );
      await refresh();
      return newField;
    },
    [refresh]
  );

  const update = useCallback(
    async (id: number, updates: {
      name?: string; sowingDate?: string; cropType?: string;
      polygon?: { type: 'Polygon'; coordinates: number[][][] } | null;
    }) => {
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
