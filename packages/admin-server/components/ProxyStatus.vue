<template>
  <el-card class="proxy-status">
    <template #header>
      <div class="proxy-status__header">
        <span class="proxy-status__title">代理状态</span>
        <div class="proxy-status__actions">
          <div class="proxy-status__switch-group">
            <span class="proxy-status__switch-label">代理服务：</span>
            <el-switch
              v-model="proxyServerRunning"
              :loading="proxyServerLoading"
              @change="handleProxyServerToggle"
            />
          </div>
          <el-button type="primary" size="small" @click="refreshStatus">刷新</el-button>
        </div>
      </div>
    </template>
    <div class="proxy-status__content">
      <el-descriptions :column="2" border>
        <el-descriptions-item label="代理服务">
          <el-tag :type="proxyServerRunning ? 'success' : 'info'">
            {{ proxyServerRunning ? '运行中' : '已停止' }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="系统代理">
          <el-tag :type="systemProxyEnabled ? 'success' : 'info'">
            {{ systemProxyEnabled ? '已启用' : '已禁用' }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="代理地址">
          {{ proxyStatus.host }}:{{ proxyStatus.port }}
        </el-descriptions-item>
        <el-descriptions-item label="请求统计">
          总计: {{ proxyStatus.requestCount }} | 错误: {{ proxyStatus.errorCount }}
        </el-descriptions-item>
      </el-descriptions>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'

defineProps<{
  systemProxyEnabled: boolean
}>()

interface ProxyStatus {
  running: boolean
  port: number
  host: string
  requestCount: number
  errorCount: number
}

const proxyStatus = ref<ProxyStatus>({
  running: false,
  port: 8080,
  host: '127.0.0.1',
  requestCount: 0,
  errorCount: 0,
})

const proxyServerRunning = ref(false)
const proxyServerLoading = ref(false)

const { execute: fetchProxyStatusExecute } = useApiRequest<{ success: boolean; data: ProxyStatus }>(
  '/proxy/status',
  {
    immediate: false,
    onResponse({ response }) {
      if (response._data?.success && response._data?.data) {
        proxyStatus.value = response._data.data
        proxyServerRunning.value = response._data.data.running
      }
    },
  }
)

async function fetchProxyStatus(): Promise<void> {
  await fetchProxyStatusExecute()
}

async function refreshStatus(): Promise<void> {
  await Promise.all([fetchProxyStatus()])
}

const { execute: startProxyExecute, data: startProxyData } = useApiRequest<{
  success: boolean
  message?: string
}>('/proxy/start', {
  method: 'POST',
  immediate: false,
  showError: false,
})

const { execute: stopProxyExecute, data: stopProxyData } = useApiRequest<{
  success: boolean
  message?: string
}>('/proxy/stop', {
  method: 'POST',
  immediate: false,
  showError: false,
})

async function handleProxyServerToggle(enabled: string | number | boolean): Promise<void> {
  const isEnabled = Boolean(enabled)
  const originalState = !isEnabled

  proxyServerLoading.value = true

  try {
    if (isEnabled) {
      await startProxyExecute()
      const response = startProxyData.value as { success: boolean; message?: string } | null
      if (response?.success) {
        ElMessage.success('代理服务已启动')
        await fetchProxyStatus()
      } else {
        ElMessage.warning(response?.message || '代理服务需要手动启动')
        proxyServerRunning.value = false
        return
      }
    } else {
      await stopProxyExecute()
      const response = stopProxyData.value as { success: boolean; message?: string } | null
      if (response?.success) {
        ElMessage.success('代理服务已停止')
        await fetchProxyStatus()
      } else {
        ElMessage.warning(response?.message || '代理服务需要手动停止')
        proxyServerRunning.value = true
        return
      }
    }
  } catch {
    proxyServerRunning.value = originalState
  } finally {
    proxyServerLoading.value = false
  }
}

onMounted(async () => {
  await refreshStatus()
})
</script>

<style lang="scss" scoped>
.proxy-status {
  margin-bottom: var(--el-padding-mini, 4px);
}

.proxy-status__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.proxy-status__title {
  font-weight: 600;
}

.proxy-status__actions {
  display: flex;
  align-items: center;
  gap: var(--el-padding-mini, 4px);
}

.proxy-status__switch-group {
  display: flex;
  align-items: center;
  gap: var(--el-padding-small, 12px);
}

.proxy-status__switch-label {
  font-size: var(--el-font-size-base, 14px);
  color: var(--el-text-color-regular, #606266);
}

.proxy-status__content {
  padding: var(--el-padding-small, 12px) 0;
}
</style>
