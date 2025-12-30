<template>
  <div class="dashboard">
    <el-container class="dashboard-container">
      <el-header class="dashboard-header">
        <div class="header-content">
          <h1 class="title">RabyRed 🐰</h1>
          <div class="header-actions">
            <span>代理服务：</span>
            <el-switch v-model="proxyServerRunning" @change="handleProxyServerToggle" />
            <span>系统代理：</span>
            <el-switch v-model="systemProxyEnabled" @change="handleSystemProxyToggle" />
          </div>
        </div>
      </el-header>

      <el-main class="dashboard-main">
        <el-row :gutter="20">
          <el-col :span="24">
            <el-card class="status-card">
              <template #header>
                <div class="card-header">
                  <span>代理状态</span>
                  <el-button type="primary" size="small" @click="refreshStatus"> 刷新 </el-button>
                </div>
              </template>
              <div class="status-content">
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
                    总计: {{ proxyStatus.requestCount }} | 错误:
                    {{ proxyStatus.errorCount }}
                  </el-descriptions-item>
                </el-descriptions>
              </div>
            </el-card>
          </el-col>
        </el-row>

        <el-row :gutter="20" class="rules-section">
          <el-col :span="24">
            <el-card>
              <template #header>
                <div class="card-header">
                  <span>转发规则</span>
                  <el-button type="primary" size="small" @click="showAddRuleDialog = true">
                    添加规则
                  </el-button>
                </div>
              </template>

              <el-table v-loading="loading" :data="rules" style="width: 100%">
                <el-table-column prop="source" label="源地址" width="500" />
                <el-table-column prop="target" label="目标地址" />
                <el-table-column prop="enabled" label="状态" width="100">
                  <template #default="{ row }">
                    <el-switch v-model="row.enabled" @change="handleRuleToggle(row)" />
                  </template>
                </el-table-column>
                <el-table-column label="操作" width="150">
                  <template #default="{ row }">
                    <el-button type="primary" link size="small" @click="handleEditRule(row)">
                      编辑
                    </el-button>
                    <el-button type="danger" link size="small" @click="handleDeleteRule(row)">
                      删除
                    </el-button>
                  </template>
                </el-table-column>
              </el-table>
            </el-card>
          </el-col>
        </el-row>
      </el-main>
    </el-container>

    <!-- 添加/编辑规则对话框 -->
    <el-dialog
      v-model="showAddRuleDialog"
      :title="editingRule ? '编辑规则' : '添加规则'"
      width="500px"
    >
      <el-form :model="ruleForm" label-width="100px">
        <el-form-item required>
          <template #label>
            源地址
            <el-tooltip
              content="被代理的地址（要拦截的请求地址），支持正则表达式。例如：http://172.29.249.176:8001/haic-spa-outpatient/.*"
              placement="top"
            >
              <el-icon style="margin-left: 4px; cursor: help">
                <QuestionFilled />
              </el-icon>
            </el-tooltip>
          </template>
          <el-input
            v-model="ruleForm.source"
            placeholder="例如: http://172.29.249.176:8001/path/.*"
          />
        </el-form-item>
        <el-form-item required>
          <template #label>
            目标地址
            <el-tooltip
              content="转发地址（代理转发到的目标地址）。例如：http://127.0.0.1:12002/haic-spa-outpatient/"
              placement="top"
            >
              <el-icon style="margin-left: 4px; cursor: help">
                <QuestionFilled />
              </el-icon>
            </el-tooltip>
          </template>
          <el-input v-model="ruleForm.target" placeholder="例如: http://127.0.0.1:12002/path/" />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="ruleForm.enabled" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddRuleDialog = false">取消</el-button>
        <el-button type="primary" @click="handleSaveRule">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { QuestionFilled } from '@element-plus/icons-vue'

interface ProxyRule {
  id: string
  source: string
  target: string
  enabled: boolean
  createdAt: string
  updatedAt: string
}

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

const rules = ref<ProxyRule[]>([])
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
const systemProxyEnabled = ref(false)
const loading = ref(false)
const showAddRuleDialog = ref(false)
const editingRule = ref<ProxyRule | null>(null)

const ruleForm = ref({
  source: '',
  target: '',
  enabled: true,
})

let statusInterval: ReturnType<typeof setInterval> | null = null

const apiBase = config.public.apiBase as string

async function fetchRules(): Promise<void> {
  try {
    loading.value = true
    const response = await $fetch<{ success: boolean; data: ProxyRule[] }>(`${apiBase}/rules`)
    if (response.success) {
      rules.value = response.data
    }
  } catch (error) {
    ElMessage.error('获取规则列表失败')
    console.error(error)
  } finally {
    loading.value = false
  }
}

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
      systemProxyEnabled.value = response.data.enabled
    }
  } catch (error) {
    console.error('Failed to fetch system proxy status:', error)
  }
}

async function refreshStatus(): Promise<void> {
  await Promise.all([fetchProxyStatus(), fetchSystemProxyStatus(), fetchRules()])
}

async function handleProxyServerToggle(enabled: string | number | boolean): Promise<void> {
  const isEnabled = Boolean(enabled)
  // v-model 已经更新了值，所以原始状态是 !isEnabled
  const originalState = !isEnabled

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
        // 恢复原始状态（关闭）
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
        // 恢复原始状态（开启）
        proxyServerRunning.value = true
        return
      }
    }
  } catch (error) {
    ElMessage.error('操作失败')
    // 恢复原始状态
    proxyServerRunning.value = originalState
    console.error(error)
  }
}

async function handleSystemProxyToggle(enabled: string | number | boolean): Promise<void> {
  const isEnabled = Boolean(enabled)
  try {
    if (isEnabled) {
      await $fetch<{ success: boolean; data?: SystemProxyStatus }>(
        `${apiBase}/system-proxy/enable`,
        {
          method: 'POST',
          body: {
            host: proxyStatus.value.host,
            port: proxyStatus.value.port,
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
  }
}

async function handleSaveRule(): Promise<void> {
  if (!ruleForm.value.source || !ruleForm.value.target) {
    ElMessage.warning('请填写完整的规则信息')
    return
  }

  try {
    if (editingRule.value) {
      await $fetch<{ success: boolean; data?: ProxyRule }>(
        `${apiBase}/rules/${editingRule.value.id}`,
        {
          method: 'PUT',
          body: ruleForm.value,
        }
      )
      ElMessage.success('规则已更新')
    } else {
      await $fetch<{ success: boolean; data?: ProxyRule }>(`${apiBase}/rules`, {
        method: 'POST',
        body: ruleForm.value,
      })
      ElMessage.success('规则已添加')
    }
    showAddRuleDialog.value = false
    ruleForm.value = { source: '', target: '', enabled: true }
    editingRule.value = null
    await fetchRules()
  } catch (error) {
    ElMessage.error('保存失败')
    console.error(error)
  }
}

function handleEditRule(rule: ProxyRule): void {
  editingRule.value = rule
  ruleForm.value = {
    source: rule.source,
    target: rule.target,
    enabled: rule.enabled,
  }
  showAddRuleDialog.value = true
}

async function handleDeleteRule(rule: ProxyRule): Promise<void> {
  try {
    await ElMessageBox.confirm(`确定要删除规则 "${rule.source}" 吗？`, '确认删除', {
      type: 'warning',
    })
    await $fetch<{ success: boolean }>(`${apiBase}/rules/${rule.id}`, {
      method: 'DELETE',
    })
    ElMessage.success('规则已删除')
    await fetchRules()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('删除失败')
      console.error(error)
    }
  }
}

async function handleRuleToggle(rule: ProxyRule): Promise<void> {
  try {
    await $fetch<{ success: boolean; data?: ProxyRule }>(`${apiBase}/rules/${rule.id}`, {
      method: 'PUT',
      body: { enabled: rule.enabled },
    })
    ElMessage.success(`规则已${rule.enabled ? '启用' : '禁用'}`)
  } catch (error) {
    rule.enabled = !rule.enabled
    ElMessage.error('操作失败')
    console.error(error)
  }
}

onMounted(async () => {
  await refreshStatus()
  statusInterval = setInterval(refreshStatus, 5000) // 每5秒刷新一次状态
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

.dashboard-container {
  height: 100vh;
}

.dashboard-header {
  background-color: var(--el-bg-color, #ffffff);
  border-bottom: 1px solid var(--el-border-color-light, #e4e7ed);
  padding: 0 var(--el-padding-base, 20px);

  .header-content {
    display: flex;
    justify-content: space-between;
    align-items: center;
    height: 100%;

    .title {
      margin: 0;
      font-size: var(--el-font-size-extra-large, 20px);
      font-weight: 600;
      color: var(--el-text-color-primary, #303133);
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: var(--el-padding-base, 20px);
    }
  }
}

.dashboard-main {
  padding: var(--el-padding-base, 20px);
  background-color: var(--el-bg-color-page, #f2f3f5);
}

.status-card {
  margin-bottom: var(--el-padding-base, 20px);

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .status-content {
    padding: var(--el-padding-small, 12px) 0;
  }
}

.rules-section {
  margin-top: var(--el-padding-base, 20px);
}
</style>
