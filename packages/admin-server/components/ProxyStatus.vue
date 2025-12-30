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
          <el-tag :type="systemProxyStatus.enabled ? 'success' : 'info'">
            {{ systemProxyStatus.enabled ? '已启用' : '已禁用' }}
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
import { ref, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'

interface ProxyStatus {
  running: boolean
  port: number
  host: string
  requestCount: number
  errorCount: number
}

interface SystemProxyStatus {
  enabled: boolean
  host: string
  port: number
}

const config = useRuntimeConfig()

const proxyStatus = ref<ProxyStatus>({
  running: false,
  port: 8080,
  host: '127.0.0.1',
  requestCount: 0,
  errorCount: 0,
})

const systemProxyStatus = ref<SystemProxyStatus>({
  enabled: false,
  host: '',
  port: 0,
})

const proxyServerRunning = ref(false)
const proxyServerLoading = ref(false)

let statusInterval: ReturnType<typeof setInterval> | null = null

const apiBase = config.public.apiBase as string

async function fetchProxyStatus(): Promise<void> {
  try {
    const response = await $fetch<{ success: boolean; data: ProxyStatus }>(
      `${apiBase}/proxy/status`
    )
    if (response.success) {
      proxyStatus.value = response.data
      proxyServerRunning.value = response.data.running
    }
  } catch (error) {
    console.error('Failed to fetch proxy status:', error)
  }
}

async function fetchSystemProxyStatus(): Promise<void> {
  try {
    const response = await $fetch<{ success: boolean; data: SystemProxyStatus }>(
      `${apiBase}/system-proxy/status`
    )
    if (response.success) {
      systemProxyStatus.value = response.data
    }
  } catch (error) {
    console.error('Failed to fetch system proxy status:', error)
  }
}

async function refreshStatus(): Promise<void> {
  await Promise.all([fetchProxyStatus(), fetchSystemProxyStatus()])
}

async function handleProxyServerToggle(enabled: string | number | boolean): Promise<void> {
  const isEnabled = Boolean(enabled)
  const originalState = !isEnabled

  proxyServerLoading.value = true

  try {
    if (isEnabled) {
      const response = await $fetch<{ success: boolean; message?: string }>(
        `${apiBase}/proxy/start`,
        {
          method: 'POST',
        }
      )
      if (response.success) {
        ElMessage.success('代理服务已启动')
        await fetchProxyStatus()
      } else {
        ElMessage.warning(response.message || '代理服务需要手动启动')
        proxyServerRunning.value = false
        return
      }
    } else {
      const response = await $fetch<{ success: boolean; message?: string }>(
        `${apiBase}/proxy/stop`,
        {
          method: 'POST',
        }
      )
      if (response.success) {
        ElMessage.success('代理服务已停止')
        await fetchProxyStatus()
      } else {
        ElMessage.warning(response.message || '代理服务需要手动停止')
        proxyServerRunning.value = true
        return
      }
    }
  } catch (error) {
    ElMessage.error('操作失败')
    proxyServerRunning.value = originalState
    console.error(error)
  } finally {
    proxyServerLoading.value = false
  }
}

onMounted(async () => {
  await refreshStatus()
  statusInterval = setInterval(refreshStatus, 5000)
})

onUnmounted(() => {
  if (statusInterval) {
    clearInterval(statusInterval)
  }
})
</script>

<style lang="scss" scoped>
.proxy-status {
  margin-bottom: var(--el-padding-mini, 4px);

  &__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  &__title {
    font-weight: 600;
  }

  &__actions {
    display: flex;
    align-items: center;
    gap: var(--el-padding-mini, 4px);
  }

  &__switch-group {
    display: flex;
    align-items: center;
    gap: var(--el-padding-small, 12px);
  }

  &__switch-label {
    font-size: var(--el-font-size-base, 14px);
    color: var(--el-text-color-regular, #606266);
  }

  &__content {
    padding: var(--el-padding-small, 12px) 0;
  }
}
</style>
