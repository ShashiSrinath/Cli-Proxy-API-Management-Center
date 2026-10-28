import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import {
  captureQuotaCacheGeneration,
  commitIfQuotaCacheCurrent,
  useNotificationStore,
  useQuotaStore,
} from '@/stores';
import type { AuthFileItem } from '@/types';
import { getQuotaCacheKey } from '@/utils/quota/identity';
import { openDesignRequests } from './data';
import { authIndexFor, mapOpenDesignError, type OpenDesignStatus } from './requests';
import styles from './OpenDesignConnection.module.scss';

export function OpenDesignConnection({
  file,
  errorStatus,
  disabled,
  onRefresh,
  onListRefresh,
}: {
  file: AuthFileItem;
  errorStatus?: number;
  disabled: boolean;
  onRefresh: () => void;
  onListRefresh: () => void;
}) {
  const { t } = useTranslation();
  const notify = useNotificationStore((s) => s.showNotification);
  const confirm = useNotificationStore((s) => s.showConfirmation);
  const [status, setStatus] = useState<OpenDesignStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const index = file.authIndex ?? file.auth_index;
  const listing = file.opendesign as { connected?: boolean } | undefined;
  useEffect(() => {
    let active = true;
    const generation = captureQuotaCacheGeneration(file.name);
    try {
      void openDesignRequests
        .status(
          authIndexFor({ name: file.name, authIndex: index as string | number | null | undefined })
        )
        .then((result) => {
          if (active && commitIfQuotaCacheCurrent(generation, () => {})) setStatus(result);
        })
        .catch(() => {});
    } catch {
      /* Missing index is reported by usage or connect. */
    }
    return () => {
      active = false;
    };
  }, [file.name, index]);
  const close = () => {
    setOpen(false);
    setSession('');
    setError('');
  };
  const connect = async () => {
    const generation = captureQuotaCacheGeneration(file.name);
    setBusy(true);
    setError('');
    try {
      const result = await openDesignRequests.connect(authIndexFor(file), session);
      if (!commitIfQuotaCacheCurrent(generation, () => {})) return;
      setStatus(result);
      close();
      notify(
        t('opendesign_quota.connected_success', {
          email: result.email || '',
          workspace: result.workspace_name || '',
        }),
        'success'
      );
      useQuotaStore.getState().clearQuotaCache([file.name]);
      onRefresh();
      onListRefresh();
    } catch (err) {
      if (commitIfQuotaCacheCurrent(generation, () => {}))
        setError(t(`opendesign_quota.${mapOpenDesignError(err).code}`));
    } finally {
      setBusy(false);
    }
  };
  const disconnect = () => {
    const generation = captureQuotaCacheGeneration(file.name);
    confirm({
      title: t('opendesign_quota.disconnect_title'),
      message: t('opendesign_quota.disconnect_confirm'),
      confirmText: t('opendesign_quota.disconnect'),
      variant: 'danger',
      onConfirm: async () => {
        if (!commitIfQuotaCacheCurrent(generation, () => {})) return;
        try {
          await openDesignRequests.disconnect(authIndexFor(file));
          if (!commitIfQuotaCacheCurrent(generation, () => {})) return;
          useQuotaStore.getState().clearQuotaCache([file.name]);
          useQuotaStore.getState().setOpenDesignQuota((prev) => ({
            ...prev,
            [getQuotaCacheKey(file)]: { status: 'error', errorStatus: 409 },
          }));
          setStatus({ connected: false });
          onListRefresh();
        } catch (err) {
          if (commitIfQuotaCacheCurrent(generation, () => {}))
            notify(t(`opendesign_quota.${mapOpenDesignError(err).code}`), 'error');
        }
      },
    });
  };
  const expired = errorStatus === 412;
  const connected =
    errorStatus === 409 ? false : (status?.connected ?? listing?.connected ?? false);
  return (
    <div className={styles.connection}>
      {!connected && !expired && <p>{t('opendesign_quota.explanation')}</p>}
      {expired && <p role="status">{t('opendesign_quota.session_expired')}</p>}
      {connected && status && (
        <div className={styles.detail}>
          {status.email && <div>{status.email}</div>}
          {status.expires_at && (
            <div>
              {t('opendesign_quota.valid_until', {
                time: new Date(status.expires_at).toLocaleString(),
              })}
            </div>
          )}
        </div>
      )}
      <div className={styles.actions}>
        <Button
          size="sm"
          variant={connected || expired ? 'secondary' : 'primary'}
          disabled={disabled}
          onClick={() => setOpen(true)}
        >
          {t(connected || expired ? 'opendesign_quota.reconnect' : 'opendesign_quota.connect')}
        </Button>
        {connected && (
          <Button size="sm" variant="secondary" disabled={disabled} onClick={disconnect}>
            {t('opendesign_quota.disconnect')}
          </Button>
        )}
      </div>
      <Modal
        open={open}
        onClose={close}
        closeDisabled={busy}
        title={t('opendesign_quota.dialog_title')}
        footer={
          <Button onClick={() => void connect()} loading={busy} disabled={!session.trim()}>
            {t('opendesign_quota.connect_button')}
          </Button>
        }
      >
        <ol className={styles.steps}>
          <li>
            {t('opendesign_quota.step1_before')}{' '}
            <a href="https://open-design.ai/cloud/dashboard" target="_blank" rel="noreferrer">
              https://open-design.ai/cloud/dashboard
            </a>{' '}
            {t('opendesign_quota.step1_after')}
          </li>
          <li>{t('opendesign_quota.step2')}</li>
          <li>{t('opendesign_quota.step3')}</li>
          <li>{t('opendesign_quota.step4')}</li>
        </ol>
        <label htmlFor={`opendesign-session-${getQuotaCacheKey(file)}`}>
          {t('opendesign_quota.session_label')}
        </label>
        <textarea
          id={`opendesign-session-${getQuotaCacheKey(file)}`}
          className={styles.textarea}
          value={session}
          onChange={(event) => setSession(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          rows={5}
        />
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
      </Modal>
    </div>
  );
}
