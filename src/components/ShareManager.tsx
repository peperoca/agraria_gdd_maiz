import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { getShares, createShare, deleteShare, searchUsers } from '../utils/api';
import type { ShareRaw, UserSearchResult } from '../utils/api';

interface ShareManagerProps {
  entityType: 'farm' | 'field';
  entityId: number;
  entityName: string;
}

export function ShareManager({ entityType, entityId, entityName }: ShareManagerProps) {
  const { t } = useTranslation();
  const [shares, setShares] = useState<ShareRaw[]>([]);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState('');
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchShares = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getShares(entityType, entityId);
      setShares(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId]);

  useEffect(() => {
    fetchShares();
  }, [fetchShares]);

  // Debounced user search
  useEffect(() => {
    if (username.length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setSearching(true);
        const results = await searchUsers(username);
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [username]);

  const handleShare = async (targetUsername: string) => {
    setError('');
    setSaving(true);
    try {
      await createShare(entityType, entityId, targetUsername);
      setUsername('');
      setSearchResults([]);
      await fetchShares();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to share');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (shareId: number) => {
    try {
      await deleteShare(shareId);
      setShares((prev) => prev.filter((s) => s.id !== shareId));
    } catch {
      // ignore
    }
  };

  const tx3 = 'var(--tx3)';

  return (
    <div className="agraria-card">
      <div className="sec-label">
        {t('sharing.title', { type: entityType === 'farm' ? 'Farm' : 'Field', name: entityName })}
      </div>
      <p className="text-[11px] mb-3" style={{ color: tx3 }}>
        {t('sharing.description')}
      </p>

      {/* Add share */}
      <div className="relative mb-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={t('sharing.inputPlaceholder')}
            className="agraria-input flex-1 text-[12px]"
            disabled={saving}
          />
          {username.length >= 2 && searchResults.length === 0 && !searching && (
            <button
              onClick={() => handleShare(username)}
              disabled={saving || !username.trim()}
              className="agraria-btn agraria-btn-primary text-[11px] px-3"
            >
              {saving ? '...' : t('sharing.shareButton')}
            </button>
          )}
        </div>

        {/* Search dropdown */}
        {searchResults.length > 0 && (
          <div
            className="absolute left-0 right-0 top-full mt-1 rounded-[var(--r)] shadow-lg z-10 max-h-[150px] overflow-y-auto"
            style={{ background: 'var(--bg2)', border: '1px solid var(--br)' }}
          >
            {searchResults.map((u) => (
              <button
                key={u.id}
                onClick={() => handleShare(u.username)}
                disabled={saving}
                className="w-full text-left px-3 py-2 text-[12px] hover:opacity-80"
                style={{ color: 'var(--tx)', borderBottom: '1px solid var(--br)' }}
              >
                {u.username}
              </button>
            ))}
          </div>
        )}

        {searching && (
          <div className="text-[10px] mt-1" style={{ color: tx3 }}>{t('sharing.searching')}</div>
        )}
      </div>

      {error && (
        <div className="text-[11px] mb-2" style={{ color: '#dc2626' }}>{error}</div>
      )}

      {/* Current shares list */}
      {loading ? (
        <div className="text-[11px]" style={{ color: tx3 }}>{t('sharing.loading')}</div>
      ) : shares.length === 0 ? (
        <div className="text-[11px]" style={{ color: tx3 }}>{t('sharing.notSharedYet')}</div>
      ) : (
        <div className="space-y-1">
          {shares.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between py-1.5 px-2 rounded-[var(--r)]"
              style={{ background: 'var(--bg)' }}
            >
              <div>
                <span className="text-[12px] font-medium" style={{ color: 'var(--tx)' }}>
                  {s.sharedWithUsername}
                </span>
                <span className="text-[10px] ml-2" style={{ color: tx3 }}>{t('sharing.readOnly')}</span>
              </div>
              <button
                onClick={() => handleRemove(s.id)}
                className="text-[10px] px-2 py-0.5 rounded"
                style={{ color: '#dc2626', background: '#dc262610' }}
              >
                {t('sharing.remove')}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
