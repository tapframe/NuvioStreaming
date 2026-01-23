
export const MAX_RESPONSE_SIZE = 10 * 1024 * 1024; // 10MB in bytes

/**
 * Default axios request configuration with response size limits.
 * Apply this to all axios.get() calls to prevent OOM crashes.
 */
export const safeAxiosConfig = {
    maxContentLength: MAX_RESPONSE_SIZE,
    maxBodyLength: MAX_RESPONSE_SIZE,
};

/**
 * Creates a safe axios config with response size limits and optional timeout.
 * @param timeout - Optional timeout in milliseconds (default: 10000)
 * @param additionalConfig - Additional axios config to merge
 * @returns Axios request config with safety limits
 */
export const createSafeAxiosConfig = (
    timeout: number = 10000,
    additionalConfig?: Record<string, any>
) => ({
    ...safeAxiosConfig,
    timeout,
    ...additionalConfig,
});
