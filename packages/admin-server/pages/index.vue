<template>
  <div class="dashboard">
    <el-container class="dashboard-container">
      <el-header class="dashboard__header">
        <div class="dashboard__header-content">
          <div class="dashboard__header-title">
            <div class="dashboard__header-left">
              <img src="../assets/icon.png" alt="RabyRed" class="dashboard__header-logo" />
            </div>
            <div class="dashboard__header-right">
              <div class="dashboard__header-text">RabyRed</div>
              <div class="dashboard__subtitle">一个用于http请求代理的应用</div>
            </div>
          </div>
          <div class="dashboard__header-actions">
            <span class="dashboard__switch-label">系统代理：</span>
            <el-switch
              v-model="systemProxyEnabled"
              :loading="systemProxyLoading"
              @change="handleSystemProxyToggle"
            />
          </div>
        </div>
      </el-header>

      <el-main class="dashboard__main">
        <ProxyStatus :system-proxy-enabled="systemProxyEnabled" />

        <RuleManagement />
      </el-main>
    </el-container>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'

interface SystemProxyStatus {
  enabled: boolean
  host: string
  port: number
}

const systemProxyEnabled = ref(false)
const systemProxyLoading = ref(false)

const { execute: fetchSystemProxyStatusExecute } = useApiRequest<{
  success: boolean
  data: SystemProxyStatus
}>('/system-proxy/status', {
  immediate: false,
  onResponse({ response }) {
    if (response._data?.success && response._data?.data) {
      systemProxyEnabled.value = response._data.data.enabled
    }
  },
})

async function fetchSystemProxyStatus(): Promise<void> {
  await fetchSystemProxyStatusExecute()
}

const { execute: fetchProxyStatusExecute, data: proxyStatusData } = useApiRequest<{
  success: boolean
  data: { host: string; port: number }
}>('/proxy/status', {
  immediate: false,
})

const { execute: disableSystemProxyExecute } = useApiRequest<{ success: boolean }>(
  '/system-proxy/disable',
  {
    method: 'POST',
    immediate: false,
  }
)

async function handleSystemProxyToggle(enabled: string | number | boolean): Promise<void> {
  const isEnabled = Boolean(enabled)

  systemProxyLoading.value = true

  try {
    // 需要获取代理服务的地址和端口
    await fetchProxyStatusExecute()
    const proxyStatusResponse = proxyStatusData.value as {
      success: boolean
      data: { host: string; port: number }
    } | null

    if (isEnabled) {
      if (!proxyStatusResponse?.success || !proxyStatusResponse.data) {
        ElMessage.warning('请先启动代理服务')
        systemProxyEnabled.value = false
        return
      }

      const { execute } = useApiRequest<{ success: boolean; data?: SystemProxyStatus }>(
        '/system-proxy/enable',
        {
          method: 'POST',
          body: {
            host: proxyStatusResponse.data.host,
            port: proxyStatusResponse.data.port,
          },
          immediate: false,
        }
      )
      await execute()
      ElMessage.success('系统代理已启用')
    } else {
      await disableSystemProxyExecute()
      ElMessage.success('系统代理已禁用')
    }
    await fetchSystemProxyStatus()
  } catch {
    systemProxyEnabled.value = !isEnabled
  } finally {
    systemProxyLoading.value = false
  }
}

let statusInterval: ReturnType<typeof setInterval> | null = null
onMounted(async () => {
  await fetchSystemProxyStatus()
  statusInterval = setInterval(fetchSystemProxyStatus, 60 * 1000)
})

onUnmounted(() => {
  if (statusInterval) {
    clearInterval(statusInterval)
  }
})
</script>

<style lang="scss" scoped>
.dashboard {
  min-height: 100vh;
}

.dashboard__header {
  background-color: var(--el-bg-color, #ffffff);
  border-bottom: 1px solid var(--el-border-color-light, #e4e7ed);
  padding: 0 var(--el-padding-small, 8px);
}

.dashboard__header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 100%;
}

.dashboard__header-title {
  display: flex;
  gap: var(--el-padding-small, 4px);

  .dashboard__header-left {
    display: flex;
    align-items: center;
    gap: var(--el-padding-small, 4px);

    .dashboard__header-logo {
      width: 50px;
      height: 50px;
    }
  }

  .dashboard__header-right {
    display: flex;
    flex-direction: column;
    gap: var(--el-padding-small, 4px);

    .dashboard__header-text {
      font-size: var(--el-font-size-extra-large, 20px);
      font-weight: 600;
      color: var(--el-text-color-primary, #303133);
    }
  }
}

.dashboard__header-actions {
  display: flex;
  align-items: center;
  gap: var(--el-padding-small, 12px);
}

.dashboard__switch-label {
  font-size: var(--el-font-size-base, 14px);
  color: var(--el-text-color-regular, #606266);
}

.dashboard__main {
  padding: var(--el-padding-mini, 4px);
  background-color: var(--el-bg-color-page, #f2f3f5);
}

.dashboard__rules-section {
  margin-top: var(--el-padding-mini, 4px);
}

.dashboard-container {
  height: 100vh;
}
</style>
