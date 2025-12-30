<template>
  <el-card class="rule-management">
    <template #header>
      <div class="rule-management__header">
        <span class="rule-management__title">转发规则</span>
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

onMounted(async () => {
  await fetchRules()
})
</script>

<style lang="scss" scoped>
.rule-management {
  .rule-management__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  &__title {
    font-weight: 600;
  }
}
</style>
