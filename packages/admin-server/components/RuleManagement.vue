<template>
  <el-card class="rule-management">
    <template #header>
      <div class="rule-management__header">
        <span class="rule-management__title">转发规则</span>
        <div class="rule-management__actions">
          <el-button size="small" @click="handleExportRules">导出</el-button>
          <el-button size="small" @click="handleImportClick">导入</el-button>
          <el-button type="primary" size="small" @click="handleAddRule">添加</el-button>
        </div>
      </div>
    </template>

    <el-table
      v-loading="loading"
      :data="rules"
      :tree-props="{ children: 'children', hasChildren: 'hasChildren' }"
      row-key="id"
      style="width: 100%"
      border
    >
      <el-table-column prop="name" label="名称/源地址" min-width="300">
        <template #default="{ row }">
          <span v-if="row.type === RULE_TYPE.GROUP" class="rule-management__group-name">
            <el-icon><Folder /></el-icon>
            {{ row.name || '未命名分组' }}
          </span>
          <span v-else>{{ row.source || '-' }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="target" label="目标地址" />
      <el-table-column prop="enabled" label="状态" width="100">
        <template #default="{ row }">
          <el-switch
            v-if="row.type !== RULE_TYPE.GROUP"
            v-model="row.enabled"
            :loading="row.loading"
            @change="handleRuleToggle(row)"
          />
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="250">
        <template #default="{ row }">
          <el-button
            v-if="row.type !== RULE_TYPE.GROUP"
            type="success"
            link
            size="small"
            @click="handleTestRule(row)"
          >
            测试
          </el-button>
          <el-button type="primary" link size="small" @click="handleEditRule(row)">
            {{ row.type === RULE_TYPE.GROUP ? '编辑分组' : '编辑' }}
          </el-button>
          <el-button type="info" link size="small" @click="handleAddChildRule(row)">
            添加子项
          </el-button>
          <el-button type="danger" link size="small" @click="handleDeleteRule(row)">
            删除
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <RuleDialog
      v-model:visible="showAddRuleDialog"
      :editing-rule="editingRule"
      :parent-rule="parentRule"
      :rules="rules"
      @saved="handleRuleSaved"
    />

    <TestRuleDialog
      ref="testDialogRef"
      v-model:visible="showTestDialog"
      :testing-rule="testingRule"
      @test="handlePerformTest"
    />

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
import { Folder } from '@element-plus/icons-vue'
import { RULE_TYPE, RULE_TYPE_MAP } from '../src/constants/index.js'
import type { ProxyRule } from '../src/types/index.js'
import RuleDialog from './RuleDialog.vue'
import TestRuleDialog from './TestRuleDialog.vue'

const rules = ref<ProxyRule[]>([])
const loading = ref(false)
const showAddRuleDialog = ref(false)
const editingRule = ref<ProxyRule | null>(null)
const parentRule = ref<ProxyRule | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)

// 测试相关
const showTestDialog = ref(false)
const testingRule = ref<ProxyRule | null>(null)
const testDialogRef = ref<InstanceType<typeof TestRuleDialog> | null>(null)

const { execute: fetchRulesExecute, pending: rulesPending } = useApiRequest<{
  success: boolean
  data: ProxyRule[]
}>('/rules', {
  immediate: false,
  onResponse({ response }) {
    if (response._data?.success && response._data?.data) {
      rules.value = response._data.data.map(rule => ({
        ...rule,
        loading: false,
      }))
    }
  },
})

watch(rulesPending, newPending => {
  loading.value = newPending
})

async function fetchRules(): Promise<void> {
  await fetchRulesExecute()
}

function handleAddRule(): void {
  editingRule.value = null
  parentRule.value = null
  showAddRuleDialog.value = true
}

function handleAddChildRule(parent: ProxyRule): void {
  editingRule.value = null
  parentRule.value = parent
  showAddRuleDialog.value = true
}

function handleEditRule(rule: ProxyRule): void {
  editingRule.value = rule
  parentRule.value = null
  showAddRuleDialog.value = true
}

function handleRuleSaved(): void {
  editingRule.value = null
  parentRule.value = null
  fetchRules()
}

async function handleDeleteRule(rule: ProxyRule): Promise<void> {
  const ruleName = rule.type === RULE_TYPE.GROUP ? rule.name || '未命名分组' : rule.source
  const hasChildren = rule.children && rule.children.length > 0
  const ruleTypeLabel =
    rule.type === RULE_TYPE.GROUP ? RULE_TYPE_MAP[RULE_TYPE.GROUP] : RULE_TYPE_MAP[RULE_TYPE.RULE]
  const message = hasChildren
    ? `确定要删除${ruleTypeLabel} "${ruleName}" 及其所有子项吗？`
    : `确定要删除${ruleTypeLabel} "${ruleName}" 吗？`

  try {
    await ElMessageBox.confirm(message, '确认删除', {
      type: 'warning',
    })
  } catch (error) {
    // 用户取消操作，直接返回
    if (error === 'cancel') {
      return
    }
    throw error
  }

  const { execute } = useApiRequest<{ success: boolean }>(`/rules/${rule.id}`, {
    method: 'DELETE',
    immediate: false,
  })
  await execute()
  ElMessage.success(`${ruleTypeLabel}已删除`)
  await fetchRules()
}

async function handleRuleToggle(rule: ProxyRule): Promise<void> {
  const originalEnabled = !rule.enabled

  if (rule.loading === undefined) {
    rule.loading = false
  }
  rule.loading = true

  try {
    const { execute } = useApiRequest<{ success: boolean; data?: ProxyRule }>(`/rules/${rule.id}`, {
      method: 'PUT',
      body: { enabled: rule.enabled },
      immediate: false,
    })
    await execute()
    ElMessage.success(`规则已${rule.enabled ? '启用' : '禁用'}`)
  } catch {
    rule.enabled = originalEnabled
  } finally {
    rule.loading = false
  }
}

function handleTestRule(rule: ProxyRule): void {
  if (rule.type === RULE_TYPE.GROUP || !rule.source) {
    ElMessage.warning('分组无法测试，请选择具体规则')
    return
  }
  testingRule.value = rule
  showTestDialog.value = true
}

function handlePerformTest(url: string, rule: ProxyRule): void {
  const sourcePattern = rule.source
  const targetUrl = rule.target

  if (!sourcePattern || !targetUrl) {
    ElMessage.error('规则缺少源地址或目标地址')
    return
  }

  try {
    // 将源地址规则转换为正则表达式
    let regex: RegExp
    if (sourcePattern.startsWith('/') && sourcePattern.endsWith('/')) {
      const pattern = sourcePattern.slice(1, -1)
      regex = new RegExp(pattern)
    } else {
      try {
        regex = new RegExp(sourcePattern)
      } catch {
        regex = new RegExp(sourcePattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      }
    }
    const match = url.match(regex)

    if (match) {
      let proxiedUrl: string = targetUrl

      if (match.length > 1) {
        for (let i = 1; i < match.length; i++) {
          proxiedUrl = proxiedUrl.replace(`$${i}`, match[i] || '')
        }
      } else {
        const sourceBase = sourcePattern.replace(/\.\*/g, '').replace(/\\/g, '')
        if (url.startsWith(sourceBase)) {
          const remainingPath = url.substring(sourceBase.length)
          proxiedUrl = targetUrl + remainingPath
        }
      }

      testDialogRef.value?.setTestResult({
        matched: true,
        originalUrl: url,
        proxiedUrl: proxiedUrl,
        matchedPattern: match[0],
      })

      ElMessage.success('匹配成功！')
    } else {
      testDialogRef.value?.setTestResult({
        matched: false,
        originalUrl: url,
      })

      ElMessage.warning('未匹配到规则')
    }
  } catch (error) {
    ElMessage.error('正则表达式解析失败，请检查源地址规则格式')
    console.error(error)
  }
}

// 扁平化规则用于导出
function flattenRulesForExport(rules: ProxyRule[]): ProxyRule[] {
  const result: ProxyRule[] = []
  for (const rule of rules) {
    const { children, ...ruleWithoutChildren } = rule
    result.push(ruleWithoutChildren)
    if (children && children.length > 0) {
      result.push(...flattenRulesForExport(children))
    }
  }
  return result
}

function handleExportRules(): void {
  try {
    const exportData = flattenRulesForExport(rules.value)

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
  name?: string
  type?: 'rule' | 'group'
  parentId?: string
}

async function importRules(importedData: ImportRuleData[], replace: boolean): Promise<void> {
  loading.value = true

  try {
    let successCount = 0
    let failCount = 0
    const errors: string[] = []

    if (replace) {
      // 替换模式：先删除所有现有规则
      const deletePromises = rules.value.map(rule => {
        const { execute } = useApiRequest<{ success: boolean }>(`/rules/${rule.id}`, {
          method: 'DELETE',
          immediate: false,
          showError: false,
        })
        return execute().catch(() => {
          // 忽略删除错误，继续执行
        })
      })
      await Promise.all(deletePromises)
    }

    // 逐个导入规则
    for (const ruleData of importedData) {
      try {
        const ruleType = ruleData.type || RULE_TYPE.RULE

        // 验证规则数据
        if (ruleType === RULE_TYPE.GROUP) {
          if (!ruleData.name) {
            errors.push(`分组缺少必要字段 name：${JSON.stringify(ruleData)}`)
            failCount++
            continue
          }
        } else {
          if (!ruleData.source || !ruleData.target) {
            errors.push(`规则缺少必要字段：${JSON.stringify(ruleData)}`)
            failCount++
            continue
          }
        }

        interface ImportRuleBody {
          type: 'rule' | 'group'
          enabled: boolean
          name?: string
          source?: string
          target?: string
          parentId?: string
        }
        const body: ImportRuleBody = {
          type: ruleType,
          enabled: ruleData.enabled !== undefined ? ruleData.enabled : true,
        }

        if (ruleType === RULE_TYPE.GROUP) {
          body.name = ruleData.name
        } else {
          body.source = ruleData.source
          body.target = ruleData.target
        }

        if (ruleData.parentId) {
          body.parentId = ruleData.parentId
        }

        const { execute } = useApiRequest<{ success: boolean; data?: ProxyRule }>('/rules', {
          method: 'POST',
          body,
          immediate: false,
          showError: false,
        })
        await execute()
        successCount++
      } catch (error: unknown) {
        const errorMsg =
          (error as { data?: { message?: string }; message?: string })?.data?.message ||
          (error as { message?: string })?.message ||
          '未知错误'
        const ruleName =
          ruleData.type === RULE_TYPE.GROUP
            ? ruleData.name || '未命名分组'
            : ruleData.source || '未知规则'
        const ruleTypeLabel =
          ruleData.type === RULE_TYPE.GROUP
            ? RULE_TYPE_MAP[RULE_TYPE.GROUP]
            : RULE_TYPE_MAP[RULE_TYPE.RULE]
        errors.push(`${ruleTypeLabel} "${ruleName}" 导入失败：${errorMsg}`)
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

.rule-management__group-name {
  font-weight: 500;
}
</style>
