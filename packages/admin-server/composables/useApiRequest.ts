import { ElMessage } from 'element-plus'
import type { UseFetchOptions } from 'nuxt/app'

/**
 * API 错误响应格式
 */
interface ApiErrorResponse {
  error: boolean
  url?: string
  statusCode?: number
  statusMessage?: string
  message?: string
  stack?: string[]
}

/**
 * 提取错误消息
 */
function extractErrorMessage(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return '请求失败，请稍后重试'
  }

  const apiError = error as ApiErrorResponse & {
    data?: { message?: string }
    response?: { _data?: { message?: string } }
  }

  // 优先使用顶层的 message 字段（这是你提供的错误格式中的字段）
  if (apiError.message) {
    return apiError.message
  }

  // 其次使用 data.message（服务器返回的错误消息）
  if (apiError.data?.message) {
    return apiError.data.message
  }

  // 使用 response._data.message（Nuxt $fetch 的错误格式）
  if (apiError.response?._data?.message) {
    return apiError.response._data.message
  }

  // 如果有 statusMessage，使用它
  if (apiError.statusMessage) {
    return apiError.statusMessage
  }

  // 如果是 Error 对象
  if (error instanceof Error) {
    return error.message
  }

  // 默认错误消息
  return '请求失败，请稍后重试'
}

/**
 * 统一处理 API 请求的 Hook
 *
 * @example
 * ```ts
 * // GET 请求（响应式）
 * const { data, error, pending } = useApiRequest<ResponseType>('/rules')
 *
 * // POST 请求（手动触发）
 * const { execute } = useApiRequest<ResponseType>('/rules', {
 *   method: 'POST',
 *   body: { ... },
 *   immediate: false,
 *   showError: true
 * })
 * await execute()
 * ```
 */
export function useApiRequest<T = unknown>(
  url: string | (() => string),
  options?: UseFetchOptions<T> & {
    showError?: boolean
  }
) {
  const config = useRuntimeConfig()
  const apiBase = String(config.public.apiBase || '')
  const showError = options?.showError !== false

  // 构建完整 URL
  const getFullUrl = (): string => {
    const urlValue = typeof url === 'function' ? url() : url
    return urlValue.startsWith('http')
      ? urlValue
      : `${apiBase}${urlValue.startsWith('/') ? urlValue : `/${urlValue}`}`
  }

  // 从 options 中分离 showError
  const { showError: _, ...fetchOptions } = options || {}

  // 使用 useFetch，并配置拦截器
  // @ts-expect-error - TypeScript 类型推断限制，运行时正常
  const result = useFetch<T>(getFullUrl(), {
    ...fetchOptions,
    // 响应错误拦截器
    onResponseError(resError) {
      const response = resError.response
      const error = response._data || response
      const errorMessage = extractErrorMessage(error)

      // SSR 场景：服务端不显示 UI，客户端显示错误提示
      if (showError && import.meta.client) {
        ElMessage.error(errorMessage)
      }

      // 注意：这里的错误会被 useFetch 内部捕获并存储在 error ref 中
      // 不会抛出异常，所以我们需要在包装的 execute 中检查并抛出
    },
  })

  return result
}
