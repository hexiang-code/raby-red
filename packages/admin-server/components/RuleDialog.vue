<template>
  <el-dialog
    v-model="visible"
    :title="editingRule ? (editingRule.type === RULE_TYPE.GROUP ? '编辑分组' : '编辑规则') : '添加'"
    width="500px"
    @update:model-value="handleDialogClose"
  >
    <el-form :model="ruleForm" label-width="100px">
      <!-- 新增时显示类型选择 -->
      <el-form-item v-if="!editingRule" required label="类型">
        <el-radio-group v-model="ruleForm.type">
          <el-radio :value="RULE_TYPE.GROUP">文件夹</el-radio>
          <el-radio :value="RULE_TYPE.RULE">代理规则</el-radio>
        </el-radio-group>
      </el-form-item>

      <el-form-item v-if="ruleForm.type === RULE_TYPE.GROUP" required label="分组名称">
        <el-input v-model="ruleForm.name" placeholder="请输入分组名称" />
      </el-form-item>

      <el-form-item v-if="ruleForm.type === RULE_TYPE.RULE" required>
        <template #label>
          源地址
          <el-tooltip
            content="被代理的地址（要拦截的请求地址），支持正则表达式。例如：http://172.29.249.176:8001/haic-spa-outpatient/.*"
            placement="top"
          >
            <el-icon style="margin-left: var(--el-padding-mini, 4px); cursor: help">
              <QuestionFilled />
            </el-icon>
          </el-tooltip>
        </template>
        <el-input
          v-model="ruleForm.source"
          placeholder="例如: http://172.29.249.176:8001/path/.*"
        />
      </el-form-item>

      <el-form-item v-if="ruleForm.type === RULE_TYPE.RULE" required>
        <template #label>
          目标地址
          <el-tooltip
            content="转发地址（代理转发到的目标地址）。例如：http://127.0.0.1:12002/haic-spa-outpatient/"
            placement="top"
          >
            <el-icon style="margin-left: var(--el-padding-mini, 4px); cursor: help">
              <QuestionFilled />
            </el-icon>
          </el-tooltip>
        </template>
        <el-input v-model="ruleForm.target" placeholder="例如: http://127.0.0.1:12002/path/" />
      </el-form-item>

      <el-form-item v-if="ruleForm.type === RULE_TYPE.RULE" label="启用">
        <el-switch v-model="ruleForm.enabled" />
      </el-form-item>

      <!-- 父级分组选择（新增时显示，编辑分组时也显示） -->
      <el-form-item
        v-if="!editingRule || (editingRule && editingRule.type === RULE_TYPE.GROUP)"
        label="父级分组"
      >
        <el-select
          :model-value="ruleForm.parentId || ''"
          clearable
          placeholder="选择父级分组（可选）"
          @update:model-value="val => (ruleForm.parentId = val || null)"
        >
          <el-option value="" label="无（根级别）" />
          <el-option
            v-for="group in availableGroups"
            :key="group.id"
            :value="group.id"
            :label="group.name || '未命名分组'"
          />
        </el-select>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="handleCancel">取消</el-button>
      <el-button type="primary" :loading="saving" @click="handleSave">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { QuestionFilled } from '@element-plus/icons-vue'
import { RULE_TYPE } from '../src/constants/index.js'
import type { ProxyRule } from '../src/types/index.js'

interface RuleFormData {
  type: 'rule' | 'group'
  name: string
  source: string
  target: string
  enabled: boolean
  parentId: string | null
}

interface Props {
  visible: boolean
  editingRule: ProxyRule | null
  parentRule?: ProxyRule | null
  rules: ProxyRule[]
}

interface Emits {
  (e: 'update:visible', value: boolean): void
  (e: 'saved'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const visible = computed({
  get: () => props.visible,
  set: value => emit('update:visible', value),
})

const saving = ref(false)

/**
 * 递归获取所有分组（提取为独立函数以提高性能）
 */
function getAllGroups(rules: ProxyRule[]): ProxyRule[] {
  const groups: ProxyRule[] = []
  for (const rule of rules) {
    if (rule.type === RULE_TYPE.GROUP) {
      groups.push(rule)
      if (rule.children && rule.children.length > 0) {
        groups.push(...getAllGroups(rule.children))
      }
    } else if (rule.children && rule.children.length > 0) {
      groups.push(...getAllGroups(rule.children))
    }
  }
  return groups
}

/**
 * 获取所有可用的分组（用于选择父级）
 * 编辑分组时，需要排除当前分组及其子分组，避免循环引用
 */
const availableGroups = computed(() => {
  const allGroups = getAllGroups(props.rules)

  // 如果是编辑分组模式，需要排除当前分组及其子分组
  if (props.editingRule && props.editingRule.type === RULE_TYPE.GROUP) {
    const excludeIds = new Set<string>()

    // 添加当前分组ID
    excludeIds.add(props.editingRule.id)

    // 递归添加所有子分组ID
    function collectChildIds(rule: ProxyRule): void {
      if (rule.children && rule.children.length > 0) {
        for (const child of rule.children) {
          if (child.type === RULE_TYPE.GROUP) {
            excludeIds.add(child.id)
            collectChildIds(child)
          }
        }
      }
    }
    collectChildIds(props.editingRule!)

    // 过滤掉当前分组及其子分组
    return allGroups.filter(group => !excludeIds.has(group.id))
  }

  return allGroups
})

const ruleForm = ref<RuleFormData>({
  type: RULE_TYPE.RULE,
  name: '',
  source: '',
  target: '',
  enabled: true,
  parentId: null,
})

/**
 * 初始化表单数据
 */
function initForm(): void {
  if (props.editingRule) {
    // 编辑模式：填充现有数据
    ruleForm.value = {
      type: props.editingRule.type || RULE_TYPE.RULE,
      name: props.editingRule.name || '',
      source: props.editingRule.source || '',
      target: props.editingRule.target || '',
      enabled: props.editingRule.enabled,
      parentId: props.editingRule.parentId ?? null,
    }
  } else {
    // 新增模式：重置表单
    ruleForm.value = {
      type: RULE_TYPE.RULE,
      name: '',
      source: '',
      target: '',
      enabled: true,
      parentId: props.parentRule?.id ?? null,
    }
  }
}

// 监听对话框打开，初始化表单（只在打开时初始化一次，避免覆盖用户输入）
watch(
  () => props.visible,
  newVisible => {
    if (newVisible) {
      initForm()
    }
  }
)

async function handleSave(): Promise<void> {
  // 验证表单
  if (ruleForm.value.type === RULE_TYPE.GROUP) {
    if (!ruleForm.value.name.trim()) {
      ElMessage.warning('请输入分组名称')
      return
    }
  } else {
    if (!ruleForm.value.source.trim() || !ruleForm.value.target.trim()) {
      ElMessage.warning('请填写完整的规则信息')
      return
    }
  }

  saving.value = true

  try {
    interface RuleBody {
      type: 'rule' | 'group'
      enabled: boolean
      name?: string
      source?: string
      target?: string
      parentId?: string
    }

    const body: RuleBody = {
      type: ruleForm.value.type,
      enabled: ruleForm.value.enabled,
    }

    if (ruleForm.value.type === RULE_TYPE.GROUP) {
      body.name = ruleForm.value.name.trim()
    } else {
      body.source = ruleForm.value.source.trim()
      body.target = ruleForm.value.target.trim()
    }

    if (ruleForm.value.parentId) {
      body.parentId = ruleForm.value.parentId
    }

    if (props.editingRule) {
      // 编辑模式
      const { execute, error } = useApiRequest<{ success: boolean; data?: ProxyRule }>(
        `/rules/${props.editingRule.id}`,
        {
          method: 'PUT',
          body,
          immediate: false,
        }
      )
      await execute()
      if (!error.value) {
        ElMessage.success(props.editingRule.type === RULE_TYPE.GROUP ? '分组已更新' : '规则已更新')
      }
    } else {
      // 新增模式
      const { execute, error } = useApiRequest<{ success: boolean; data?: ProxyRule }>('/rules', {
        method: 'POST',
        body,
        immediate: false,
      })
      await execute()
      if (!error.value) {
        ElMessage.success(ruleForm.value.type === RULE_TYPE.GROUP ? '分组已添加' : '规则已添加')
      }
    }

    visible.value = false
    emit('saved')
  } finally {
    saving.value = false
  }
}

function handleCancel(): void {
  visible.value = false
}

function handleDialogClose(value: boolean): void {
  if (!value) {
    handleCancel()
  }
}
</script>
