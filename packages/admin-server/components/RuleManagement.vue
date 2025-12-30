<template>
  <el-card class="rule-management">
    <template #header>
      <div class="rule-management__header">
        <span class="rule-management__title">转发规则</span>
        <div class="rule-management__actions">
          <el-button size="small" @click="handleExportRules">导出</el-button>
          <el-button size="small" @click="handleImportClick">导入</el-button>
          <el-button type="primary" size="small" @click="showAddRuleDialog = true">
            添加规则
          </el-button>
        </div>
      </div>
    </template>

    <el-table v-loading="loading" :data="rules" style="width: 100%">
      <el-table-column prop="source" label="源地址" width="500" />
      <el-table-column prop="target" label="目标地址" />
      <el-table-column prop="enabled" label="状态" width="100">
        <template #default="{ row }">
          <el-switch v-model="row.enabled" :loading="row.loading" @change="handleRuleToggle(row)" />
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

    <!-- 隐藏的文件输入 -->
    <input
      ref="fileInputRef"
      type="file"
      accept=".json"
      style="display: none"
      @change="handleFileSelect"
    />
  </el-card>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { QuestionFilled } from '@element-plus/icons-vue'

interface ProxyRule {
  id: string
  source: string
  target: string
  enabled: boolean
  createdAt: string
  updatedAt: string
  loading?: boolean
}

const config = useRuntimeConfig()

const rules = ref<ProxyRule[]>([])
const loading = ref(false)
const showAddRuleDialog = ref(false)
const editingRule = ref<ProxyRule | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)

const ruleForm = ref({
  source: '',
  target: '',
  enabled: true,
})

const apiBase = config.public.apiBase as string

async function fetchRules(): Promise<void> {
  try {
    loading.value = true
    const response = await $fetch<{ success: boolean; data: ProxyRule[] }>(`${apiBase}/rules`)
    if (response.success) {
      rules.value = response.data.map(rule => ({
        ...rule,
        loading: false,
      }))
    }
  } catch (error) {
    ElMessage.error('获取规则列表失败')
    console.error(error)
  } finally {
    loading.value = false
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
  const originalEnabled = !rule.enabled

  if (rule.loading === undefined) {
    rule.loading = false
  }
  rule.loading = true

  try {
    await $fetch<{ success: boolean; data?: ProxyRule }>(`${apiBase}/rules/${rule.id}`, {
      method: 'PUT',
      body: { enabled: rule.enabled },
    })
    ElMessage.success(`规则已${rule.enabled ? '启用' : '禁用'}`)
  } catch (error) {
    rule.enabled = originalEnabled
    ElMessage.error('操作失败')
    console.error(error)
  } finally {
    rule.loading = false
  }
}

function handleExportRules(): void {
  try {
    const exportData = rules.value.map(({ source, target, enabled, createdAt, updatedAt }) => ({
      source,
      target,
      enabled,
      createdAt,
      updatedAt,
    }))

    const dataStr = JSON.stringify(exportData, null, 2)
    const dataBlob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = `proxy-rules-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    ElMessage.success(`已导出 ${exportData.length} 条规则`)
  } catch (error) {
    ElMessage.error('导出失败')
    console.error(error)
  }
}

function handleImportClick(): void {
  fileInputRef.value?.click()
}

async function handleFileSelect(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]

  if (!file) {
    return
  }

  // 重置文件输入，以便可以再次选择同一文件
  target.value = ''

  try {
    const text = await file.text()
    const importedData = JSON.parse(text)

    if (!Array.isArray(importedData)) {
      ElMessage.error('导入文件格式错误：必须是规则数组')
      return
    }

    if (importedData.length === 0) {
      ElMessage.warning('导入文件为空')
      return
    }

    // 询问导入模式
    try {
      await ElMessageBox.confirm(
        `检测到 ${importedData.length} 条规则，是否替换现有规则？`,
        '导入规则',
        {
          distinguishCancelAndClose: true,
          confirmButtonText: '替换',
          cancelButtonText: '追加',
          type: 'warning',
        }
      )

      // 用户选择替换
      await importRules(importedData, true)
    } catch (error) {
      if (error === 'cancel') {
        // 用户选择追加
        await importRules(importedData, false)
      }
      // 用户取消
    }
  } catch (error) {
    if (error instanceof SyntaxError) {
      ElMessage.error('导入文件格式错误：JSON 解析失败')
    } else {
      ElMessage.error('导入失败')
      console.error(error)
    }
  }
}

interface ImportRuleData {
  source?: string
  target?: string
  enabled?: boolean
}

async function importRules(importedData: ImportRuleData[], replace: boolean): Promise<void> {
  loading.value = true

  try {
    let successCount = 0
    let failCount = 0
    const errors: string[] = []

    if (replace) {
      // 替换模式：先删除所有现有规则
      const deletePromises = rules.value.map(rule =>
        $fetch<{ success: boolean }>(`${apiBase}/rules/${rule.id}`, {
          method: 'DELETE',
        }).catch(() => {
          // 忽略删除错误，继续执行
        })
      )
      await Promise.all(deletePromises)
    }

    // 逐个导入规则
    for (const ruleData of importedData) {
      try {
        // 验证规则数据
        if (!ruleData.source || !ruleData.target) {
          errors.push(`规则缺少必要字段：${JSON.stringify(ruleData)}`)
          failCount++
          continue
        }

        await $fetch<{ success: boolean; data?: ProxyRule }>(`${apiBase}/rules`, {
          method: 'POST',
          body: {
            source: ruleData.source,
            target: ruleData.target,
            enabled: ruleData.enabled !== undefined ? ruleData.enabled : true,
          },
        })

        successCount++
      } catch (error: unknown) {
        const errorMsg =
          (error as { data?: { message?: string }; message?: string })?.data?.message ||
          (error as { message?: string })?.message ||
          '未知错误'
        errors.push(`规则 "${ruleData.source}" 导入失败：${errorMsg}`)
        failCount++
      }
    }

    // 刷新规则列表
    await fetchRules()

    // 显示导入结果
    if (failCount === 0) {
      ElMessage.success(`成功导入 ${successCount} 条规则`)
    } else {
      const errorMessage = errors.slice(0, 5).join('\n')
      const moreErrors = errors.length > 5 ? `\n...还有 ${errors.length - 5} 条错误` : ''
      ElMessage.warning(
        `导入完成：成功 ${successCount} 条，失败 ${failCount} 条${moreErrors}${errorMessage ? '\n' + errorMessage : ''}`
      )
    }
  } catch (error) {
    ElMessage.error('导入过程出错')
    console.error(error)
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await fetchRules()
})
</script>

<style lang="scss" scoped>
.rule-management__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.rule-management__title {
  font-weight: 600;
}

.rule-management__actions {
  display: flex;
  align-items: center;
  gap: var(--el-padding-mini, 4px);
}
</style>
