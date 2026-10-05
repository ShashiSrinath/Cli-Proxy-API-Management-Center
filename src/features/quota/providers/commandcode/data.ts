import type { TFunction } from 'i18next';
import type { CommandCodeQuotaData, CommandCodeQuotaState } from '@/types';
import { apiCallApi } from '@/services/api/apiCall';
import { captureQuotaCacheGeneration, commitIfQuotaCacheCurrent } from '@/stores/useQuotaStore';
import { isCommandCodeFile, isDisabledAuthFile } from '@/utils/quota';
import type { QuotaProviderData } from '../types';
import { CommandCodeQuotaError, createCommandCodeQuotaFetcher } from './requests';

const fetchCommandCodeQuota = createCommandCodeQuotaFetcher({
  request: (payload) => apiCallApi.request(payload),
  captureCurrent: (name) => {
    const generation = captureQuotaCacheGeneration(name);
    return () => commitIfQuotaCacheCurrent(generation, () => {});
  },
});

export const COMMAND_CODE_CONFIG: QuotaProviderData<CommandCodeQuotaState, CommandCodeQuotaData> = {
  type: 'commandcode',
  i18nPrefix: 'commandcode_quota',
  filterFn: (file) => isCommandCodeFile(file) && !isDisabledAuthFile(file),
  fetchQuota: async (file, t: TFunction) => {
    try {
      return await fetchCommandCodeQuota(file);
    } catch (error: unknown) {
      if (error instanceof CommandCodeQuotaError) {
        error.message = t(`commandcode_quota.${error.code}`, { status: error.status });
      }
      throw error;
    }
  },
  storeSelector: (state) => state.commandCodeQuota,
  storeSetter: 'setCommandCodeQuota',
  buildLoadingState: () => ({ status: 'loading' }),
  buildSuccessState: (data) => ({ status: 'success', data }),
  buildErrorState: (error, errorStatus) => ({
    status: 'error',
    error,
    errorStatus,
  }),
};
