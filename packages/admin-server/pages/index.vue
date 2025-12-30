<template>
  <div class="dashboard">
    <el-container class="dashboard-container">
      <el-header class="dashboard__header">
        <div class="dashboard__header-content">
          <h1 class="dashboard__title">RabyRed 🐰</h1>
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
        <el-row :gutter="20">
          <el-col :span="24">
            <ProxyStatus />
          </el-col>
        </el-row>

        <el-row :gutter="20" class="dashboard__rules-section">
          <el-col :span="24">
            <RuleManagement />
          </el-col>
        </el-row>
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

const config = useRuntimeConfig()

const systemProxyEnabled = ref(false)
const systemProxyLoading = ref(false)

const apiBase = config.public.apiBase as string

async function fetchSystemProxyStatus(): Promise<void> {
  try {
    const response = await $fetch<{ success: boolean; data: SystemProxyStatus }>(
      `${apiBase}/system-proxy/status`
    )
    if (response.success) {
      systemProxyEnabled.value = response.data.enabled
    }
  } catch (error) {
    console.error('Failed to fetch system proxy status:', error)
  }
}

async function handleSystemProxyToggle(enabled: string | number | boolean): Promise<void> {
  const isEnabled = Boolean(enabled)

  systemProxyLoading.value = true

  try {
    // 需要获取代理服务的地址和端口
    const proxyStatusResponse = await $fetch<{
      success: boolean
      data: { host: string; port: number }
    }>(`${apiBase}/proxy/status`)

    if (isEnabled) {
      if (!proxyStatusResponse.success || !proxyStatusResponse.data) {
        ElMessage.warning('请先启动代理服务')
        systemProxyEnabled.value = false
        return
      }

      await $fetch<{ success: boolean; data?: SystemProxyStatus }>(
        `${apiBase}/system-proxy/enable`,
        {
          method: 'POST',
          body: {
            host: proxyStatusResponse.data.host,
            port: proxyStatusResponse.data.port,
          },
        }
      )
      ElMessage.success('系统代理已启用')
    } else {
      await $fetch<{ success: boolean }>(`${apiBase}/system-proxy/disable`, {
        method: 'POST',
      })
      ElMessage.success('系统代理已禁用')
    }
    await fetchSystemProxyStatus()
  } catch (error) {
    ElMessage.error('操作失败')
    systemProxyEnabled.value = !isEnabled
    console.error(error)
  } finally {
    systemProxyLoading.value = false
  }
}

onMounted(async () => {
  await fetchSystemProxyStatus()
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

.dashboard__title {
  margin: 0;
  font-size: var(--el-font-size-extra-large, 20px);
  font-weight: 600;
  color: var(--el-text-color-primary, #303133);
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
