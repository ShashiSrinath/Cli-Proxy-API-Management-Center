import type { OpenDesignQuotaData, OpenDesignQuotaState } from '@/types';
import { apiClient } from '@/services/api/client';
import { captureQuotaCacheGeneration, commitIfQuotaCacheCurrent } from '@/stores/useQuotaStore';
import { isDisabledAuthFile, isOpenDesignFile } from '@/utils/quota';
import type { QuotaProviderData } from '../types';
import {
  authIndexFor,
  createOpenDesignRequests,
  mapOpenDesignError,
  OpenDesignQuotaError,
} from './requests';

export const openDesignRequests = createOpenDesignRequests(apiClient);
export const OPENDESIGN_CONFIG: QuotaProviderData<OpenDesignQuotaState, OpenDesignQuotaData> = {
  type: 'opendesign',
  i18nPrefix: 'opendesign_quota',
  filterFn: (file) => isOpenDesignFile(file) && !isDisabledAuthFile(file),
  fetchQuota: async (file, t) => {
    const generation = captureQuotaCacheGeneration(file.name);
    try {
      const data = await openDesignRequests.usage(authIndexFor(file));
      if (!commitIfQuotaCacheCurrent(generation, () => {}))
        throw new OpenDesignQuotaError('stale_request');
      return data;
    } catch (error) {
      const mapped = error instanceof OpenDesignQuotaError ? error : mapOpenDesignError(error);
      if (!commitIfQuotaCacheCurrent(generation, () => {}))
        throw new OpenDesignQuotaError('stale_request');
      mapped.message = t(`opendesign_quota.${mapped.code}`);
      throw mapped;
    }
  },
  storeSelector: (state) => state.openDesignQuota,
  storeSetter: 'setOpenDesignQuota',
  buildLoadingState: () => ({ status: 'loading' }),
  buildSuccessState: (data) => ({ status: 'success', data }),
  buildErrorState: (error, errorStatus) => ({ status: 'error', error, errorStatus }),
};
