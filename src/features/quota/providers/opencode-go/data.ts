import type { TFunction } from 'i18next';
import type { OpencodeGoQuotaData, OpencodeGoQuotaState } from '@/types';
import { apiCallApi } from '@/services/api/apiCall';
import { captureQuotaCacheGeneration, commitIfQuotaCacheCurrent } from '@/stores/useQuotaStore';
import { isDisabledAuthFile, isOpencodeGoFile } from '@/utils/quota';
import type { QuotaProviderData } from '../types';
import { createOpencodeGoQuotaFetcher, OpencodeGoQuotaError } from './requests';

const fetchOpencodeGoQuota = createOpencodeGoQuotaFetcher({
  request: (payload) => apiCallApi.request(payload),
  captureCurrent: (name) => {
    const generation = captureQuotaCacheGeneration(name);
    return () => commitIfQuotaCacheCurrent(generation, () => {});
  },
});

export const OPENCODE_GO_CONFIG: QuotaProviderData<OpencodeGoQuotaState, OpencodeGoQuotaData> = {
  type: 'opencode-go',
  i18nPrefix: 'opencode_go_quota',
  filterFn: (file) => isOpencodeGoFile(file) && !isDisabledAuthFile(file),
  fetchQuota: async (file, t: TFunction) => {
    try {
      return await fetchOpencodeGoQuota(file);
    } catch (error: unknown) {
      if (error instanceof OpencodeGoQuotaError) {
        error.message = t(`opencode_go_quota.${error.code}`, { status: error.status });
      }
      throw error;
    }
  },
  storeSelector: (state) => state.opencodeGoQuota,
  storeSetter: 'setOpencodeGoQuota',
  buildLoadingState: () => ({ status: 'loading' }),
  buildSuccessState: (data) => ({ status: 'success', data }),
  buildErrorState: (error, errorStatus) => ({
    status: 'error',
    error,
    errorStatus,
  }),
};
