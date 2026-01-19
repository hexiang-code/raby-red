<template>
  <el-dialog
    v-model="visible"
    title="测试规则"
    width="600px"
    @update:model-value="handleDialogClose"
  >
    <div v-if="testingRule" class="rule-management__test-dialog">
      <div class="rule-management__test-info">
        <div class="rule-management__test-info-item">
          <span class="rule-management__test-label">源地址规则：</span>
          <el-tag>{{ testingRule.source }}</el-tag>
        </div>
        <div class="rule-management__test-info-item">
          <span class="rule-management__test-label">目标地址：</span>
          <el-tag type="success">{{ testingRule.target }}</el-tag>
        </div>
      </div>

      <el-divider />

      <el-form label-width="80px">
        <el-form-item label="测试URL">
          <el-input
            v-model="testUrl"
            placeholder="请输入要测试的URL，例如：http://172.29.249.176:8001/api/users"
            clearable
            @keyup.enter="handleTest"
          />
        </el-form-item>
      </el-form>

      <div v-if="testResult" class="rule-management__test-result">
        <el-alert
          :title="testResult.matched ? '✓ 匹配成功' : '✗ 未匹配'"
          :type="testResult.matched ? 'success' : 'warning'"
          :closable="false"
        >
          <template v-if="testResult.matched">
            <div class="rule-management__test-result-content">
              <div class="rule-management__test-result-item">
                <span class="rule-management__test-result-label">原始地址：</span>
                <code class="rule-management__test-result-value">{{ testResult.originalUrl }}</code>
              </div>
              <div class="rule-management__test-result-item">
                <span class="rule-management__test-result-label">代理后地址：</span>
                <code
                  class="rule-management__test-result-value rule-management__test-result-value--success"
                  >{{ testResult.proxiedUrl }}</code
                >
              </div>
              <div v-if="testResult.matchedPattern" class="rule-management__test-result-item">
                <span class="rule-management__test-result-label">匹配部分：</span>
                <code class="rule-management__test-result-value">{{
                  testResult.matchedPattern
                }}</code>
              </div>
            </div>
          </template>
          <template v-else>
            <p class="rule-management__test-result-message">
              该 URL 不匹配当前规则的正则表达式。请检查源地址规则是否正确。
            </p>
          </template>
        </el-alert>
      </div>
    </div>

    <template #footer>
      <el-button @click="handleClose">关闭</el-button>
      <el-button type="primary" :disabled="!testUrl" @click="handleTest"> 测试 </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { ElMessage } from 'element-plus'
import type { ProxyRule } from '../src/types/index.js'

interface TestResult {
  matched: boolean
  originalUrl: string
  proxiedUrl?: string
  matchedPattern?: string
}

interface Props {
  visible: boolean
  testingRule: ProxyRule | null
}

interface Emits {
  (e: 'update:visible', value: boolean): void
  (e: 'test', url: string, rule: ProxyRule): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const visible = computed({
  get: () => props.visible,
  set: value => emit('update:visible', value),
})

const testUrl = ref('')
const testResult = ref<TestResult | null>(null)

watch(
  () => props.visible,
  newVisible => {
    if (newVisible) {
      testUrl.value = ''
      testResult.value = null
    }
  }
)

function handleTest(): void {
  if (!testUrl.value || !props.testingRule) {
    return
  }

  const url = testUrl.value.trim()
  if (!url) {
    ElMessage.warning('请输入要测试的URL')
    return
  }

  emit('test', url, props.testingRule)
}

function handleClose(): void {
  visible.value = false
}

function handleDialogClose(value: boolean): void {
  if (!value) {
    handleClose()
  }
}

// 暴露方法供父组件调用
defineExpose({
  setTestResult(result: TestResult) {
    testResult.value = result
  },
  clearTestResult() {
    testResult.value = null
  },
})
</script>

<style lang="scss" scoped>
.rule-management__test-dialog {
  .rule-management__test-info {
    background: var(--el-fill-color-light);
    padding: var(--el-padding-small, 12px);
    border-radius: var(--el-border-radius-base, 4px);

    .rule-management__test-info-item {
      display: flex;
      align-items: center;
      margin-bottom: var(--el-padding-small, 8px);

      .rule-management__test-label {
        font-weight: 500;
        margin-right: var(--el-padding-small, 8px);
        color: var(--el-text-color-secondary);
      }
    }

    .rule-management__test-info-item:last-child {
      margin-bottom: 0;
    }
  }

  .rule-management__test-result {
    margin-top: var(--el-padding-base, 16px);

    .rule-management__test-result-content {
      margin-top: var(--el-padding-small, 12px);

      .rule-management__test-result-item {
        margin-bottom: var(--el-padding-small, 12px);

        .rule-management__test-result-label {
          display: block;
          font-size: var(--el-font-size-small, 12px);
          color: var(--el-text-color-secondary);
          margin-bottom: var(--el-padding-mini, 4px);
        }

        .rule-management__test-result-value {
          display: block;
          padding: var(--el-padding-small, 8px) var(--el-padding-small, 12px);
          background: var(--el-fill-color-lighter);
          border-radius: var(--el-border-radius-base, 4px);
          font-size: var(--el-font-size-small, 13px);
          word-break: break-all;
          color: var(--el-text-color-primary);
        }

        .rule-management__test-result-value--success {
          background: var(--el-color-success-light-9);
          color: var(--el-color-success);
          border: 1px solid var(--el-color-success-light-5);
        }
      }

      .rule-management__test-result-item:last-child {
        margin-bottom: 0;
      }
    }

    .rule-management__test-result-message {
      margin: var(--el-padding-small, 8px) 0 0;
      font-size: var(--el-font-size-base, 14px);
      line-height: 1.6;
    }
  }
}
</style>
