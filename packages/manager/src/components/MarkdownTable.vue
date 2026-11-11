<template>
  <div v-if="readOnly" class="md-table-readonly">
    <table class="readonly-table">
      <thead>
        <tr>
          <th v-for="(cell, idx) in editHeader" :key="'h-'+idx">{{ cell }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, rIdx) in editBody" :key="'r-'+rIdx">
          <td v-for="(cell, cIdx) in row" :key="'c-'+cIdx">{{ cell }}</td>
        </tr>
      </tbody>
    </table>
  </div>
  <div v-else class="table-outer" :style="{ width: tableWidth + 'px', marginLeft: '10px' }">
    <!-- 插入/删除列按钮（表头上方） -->
    <div class="table-insert-row">
      <span v-for="(_cell, idx) in header.length+1" :key="'insert-col-'+idx" class="table-dot insert-col-dot"
        @click="insertCol(idx)" :style="{ left: (colWidths.slice(0, idx).reduce((a,b)=>a+b,0) - 4) + 'px' }"
        title="插入列"></span>
      <span v-for="(_cell, idx) in header.length" :key="'delete-col-'+idx" class="table-dot delete-col-dot"
        @click="deleteCol(idx)" :style="{ left: (colWidths.slice(0, idx).reduce((a,b)=>a+b,0) + colWidths[idx]/2 - 4) + 'px' }"
        title="删除列"></span>
    </div>
  <table class="md-table" :style="{ width: tableWidth + 'px', marginTop: '0px' }">
      <thead>
        <tr>
          <th v-for="(_cell, idx) in header" :key="'h'+idx" :style="{ width: colWidths[idx] + 'px', height: rowHeights[0] + 'px', position: 'relative' }">
            <div class="cell-wrapper">
              <span v-if="idx === 0" class="table-dot insert-row-dot" @click="insertRow(0)" title="在首行前插入行"
  :style="{ left: '-6px', top: (rowHeights[0] - 8) + 'px' }"
/>
<span v-if="idx === 0" class="table-dot delete-row-dot" @click="deleteRow(0)" title="删除首行"
  :style="{ left: '-6px', top: (rowHeights[0]/2 - 4) + 'px' }"
/>
              <textarea
                v-model="editHeader[idx]"
                @input="(e: Event) => { autoResize(e); emitChange(); syncRowHeight(0, idx, true); }"
                @keydown="e => handleKeydown(e, 0, idx, true)"
                class="cell-input"
                rows="1"
                ref="el => headerRefs.value[idx] = el"
                :data-idx="idx"
                :style="{ height: rowHeights[0] + 'px' }"
              />
              <div v-if="idx < header.length - 1" class="col-resizer" @mousedown="e => startColResize(e, idx)"></div>
              <!-- 表头行高调整器：只在第一个th渲染，宽度覆盖整行 -->
              <div v-if="idx === 0" class="row-resizer-full" @mousedown="e => startRowResize(e, 0)" :style="{ left: '0px', width: (colWidths.length ? Math.max(colWidths.reduce((a, b) => a + b, 0), 40) : tableWidth) + 'px' }"></div>
            </div>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, rIdx) in body" :key="'r'+rIdx">
          <td v-for="(_cell, cIdx) in row" :key="'d'+cIdx" :style="{ width: colWidths[cIdx] + 'px', height: rowHeights[rIdx+1] + 'px', position: 'relative' }">
            <div class="cell-wrapper">
              <span v-if="cIdx === 0" class="table-dot insert-row-dot" @click="insertRow(rIdx+1)" title="插入行"
                :style="{ left: '-6px', top: (rowHeights[rIdx+1] - 4) + 'px', position: 'absolute' }"
              ></span>
              <span v-if="cIdx === 0 && body.length > 1" class="table-dot delete-row-dot" @click="deleteRow(rIdx)" title="删除行"
                :style="{ left: '-6px', top: (rowHeights[rIdx+1]/2 ) + 'px', position: 'absolute' }"
              ></span>
            <textarea
                v-model="editBody[rIdx][cIdx]"
                @input="(e: Event) => { autoResize(e); emitChange(); syncRowHeight(rIdx+1, cIdx, false); }"
                @keydown="e => handleKeydown(e, rIdx, cIdx, false)"
                class="cell-input"
                rows="1"
                ref="el => { if (!bodyRefs.value[rIdx]) bodyRefs.value[rIdx] = []; bodyRefs.value[rIdx][cIdx] = el }"
                :data-ridx="rIdx"
                :data-cidx="cIdx"
                :style="{ height: rowHeights[rIdx+1] + 'px' }"
              />
              <div v-if="cIdx < row.length - 1" class="col-resizer" @mousedown="e => startColResize(e, cIdx)"></div>
              <!-- 行高调整器只在每行第一个td渲染，并绝对定位覆盖整行底部 -->
              <div v-if="cIdx === 0" class="row-resizer-full" @mousedown="e => startRowResize(e, rIdx+1)" :style="{ left: '0px', width: (colWidths.length ? Math.max(colWidths.reduce((a, b) => a + b, 0), 40) : tableWidth) + 'px' }"></div>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
    <div
  class="table-width-resizer"
  @mousedown="startTableResize"
  :style="{ height: (rowHeights.reduce((a,b)=>a+b,0) || 32) + 'px' }"
/>
  </div>

</template>

<script lang="ts" setup>
import { onBeforeUnmount } from 'vue'
import { ref, watch, toRaw } from 'vue'
const props = withDefaults(defineProps<{
  header: string[]
  body: string[][]
  readOnly?: boolean
}>(), {
  readOnly: false
})
const emit = defineEmits(['change'])


const editHeader = ref(props.header.slice())
const editBody = ref(props.body.map(row => row.slice()))

// 列宽、行高状态（初始空，后续在onMounted/watch中同步）
const colWidths = ref<number[]>([])
const rowHeights = ref<number[]>([])

// 初始化时补齐列宽和行高，保证初始渲染可拖拽
if (colWidths.value.length < editHeader.value.length) {
  for (let i = colWidths.value.length; i < editHeader.value.length; i++) {
    colWidths.value[i] = 120
  }
} else if (colWidths.value.length > editHeader.value.length) {
  colWidths.value.length = editHeader.value.length
}
if (rowHeights.value.length < editBody.value.length + 1) {
  for (let i = rowHeights.value.length; i < editBody.value.length + 1; i++) {
    rowHeights.value[i] = 32
  }
} else if (rowHeights.value.length > editBody.value.length + 1) {
  rowHeights.value.length = editBody.value.length + 1
}
const tableWidth = ref(400)

// 拖拽表格整体宽度
let resizingTable = false
let tableStartX = 0
let tableStartWidth = 0
// 拖拽表格整体宽度控件，实际调节最后一列列宽
function startTableResize(e: MouseEvent) {
  // 直接复用列宽调整逻辑，作用于最后一列
  if (colWidths.value.length === 0) return;
  startColResize(e, colWidths.value.length - 1)
}
function onTableResize(e: MouseEvent) {
  if (resizingTable) {
    const delta = e.clientX - tableStartX
    tableWidth.value = Math.max(200, tableStartWidth + delta)
  }
}
function stopTableResize() {
  resizingTable = false
  document.removeEventListener('mousemove', onTableResize)
  document.removeEventListener('mouseup', stopTableResize)
}
onBeforeUnmount(() => {
  document.removeEventListener('mousemove', onTableResize)
  document.removeEventListener('mouseup', stopTableResize)
})

// 拖拽列宽：只调整当前列宽度，其他列宽不变，表格宽度为所有列宽之和
let resizingCol = ref<number|null>(null)
let startX = 0
let startWidth = 0
function startColResize(e: MouseEvent, idx: number) {
  resizingCol.value = idx
  startX = e.clientX
  startWidth = colWidths.value[idx]
  document.addEventListener('mousemove', onColResize)
  document.addEventListener('mouseup', stopColResize)
  e.stopPropagation()
}
function onColResize(e: MouseEvent) {
  if (resizingCol.value !== null) {
    const delta = e.clientX - startX
    colWidths.value[resizingCol.value] = Math.max(40, startWidth + delta)
    // 表格宽度为所有列宽之和
    tableWidth.value = colWidths.value.reduce((a, b) => a + b, 0)
  }
}
function stopColResize() {
  resizingCol.value = null
  document.removeEventListener('mousemove', onColResize)
  document.removeEventListener('mouseup', stopColResize)
}
onBeforeUnmount(() => {
  document.removeEventListener('mousemove', onColResize)
  document.removeEventListener('mouseup', stopColResize)
})

// 拖拽行高：所有横框线（所有td/th）高度同步
let resizingRow = ref<number|null>(null)
let startY = 0
let startHeight = 0
function startRowResize(e: MouseEvent, rowIdx: number) {
  resizingRow.value = rowIdx
  startY = e.clientY
  startHeight = rowHeights.value[rowIdx]
  document.addEventListener('mousemove', onRowResize)
  document.addEventListener('mouseup', stopRowResize)
}
function onRowResize(e: MouseEvent) {
  if (resizingRow.value !== null) {
    const delta = e.clientY - startY
    const newHeight = Math.max(24, startHeight + delta)
    rowHeights.value[resizingRow.value] = newHeight
    // 让所有本行的td/th高度都同步
    // 其实只需设置rowHeights，所有td/th都用rowHeights渲染即可
  }
}
function stopRowResize() {
  resizingRow.value = null
  document.removeEventListener('mousemove', onRowResize)
  document.removeEventListener('mouseup', stopRowResize)
}
onBeforeUnmount(() => {
  document.removeEventListener('mousemove', onRowResize)
  document.removeEventListener('mouseup', stopRowResize)
})

// 自动同步行高
function syncRowHeight(rowIdx: number, colIdx: number, isHeader: boolean) {
  let ta: HTMLTextAreaElement | undefined
  if (isHeader) {
    ta = headerRefs.value[colIdx]
  } else {
    ta = bodyRefs.value[rowIdx-1]?.[colIdx]
  }
  if (ta) {
    rowHeights.value[rowIdx] = Math.max(ta.scrollHeight, 32)
  }
}

const insertCol = (idx: number) => {
  editHeader.value.splice(idx, 0, '')
  editBody.value.forEach(row => row.splice(idx, 0, ''))
  emitChange()
}
const deleteCol = (idx: number) => {
  if (editHeader.value.length <= 1) return
  editHeader.value.splice(idx, 1)
  editBody.value.forEach(row => row.splice(idx, 1))
  emitChange()
}
const insertRow = (idx: number) => {
  const newRow = editHeader.value.map(() => '')
  editBody.value.splice(idx, 0, newRow)
  emitChange()
}
const deleteRow = (idx: number) => {
  if (editBody.value.length <= 1) return
  editBody.value.splice(idx, 1)
  emitChange()
}
            
// 监听header/body变化，动态同步列宽和行高
watch(
  () => ({ header: props.header, body: props.body }),
  ({ header, body }, _, _onCleanup) => {
    // 判断是否为大幅更改（如列数或行数变化）
    const headerChanged = header.length !== colWidths.value.length
    const bodyChanged = body.length !== rowHeights.value.length - 1
    editHeader.value = Array.isArray(header) ? header.slice() : []
    editBody.value = Array.isArray(body) ? body.map(row => Array.isArray(row) ? row.slice() : []) : []
    if (headerChanged || bodyChanged) {
      // 只补齐缺失的宽高，不重置已有宽高
      // 列宽
      if (colWidths.value.length < editHeader.value.length) {
        for (let i = colWidths.value.length; i < editHeader.value.length; i++) {
          colWidths.value[i] = 120
        }
      } else if (colWidths.value.length > editHeader.value.length) {
        colWidths.value.length = editHeader.value.length
      }
      // 行高
      if (rowHeights.value.length < editBody.value.length + 1) {
        for (let i = rowHeights.value.length; i < editBody.value.length + 1; i++) {
          rowHeights.value[i] = 32
        }
      } else if (rowHeights.value.length > editBody.value.length + 1) {
        rowHeights.value.length = editBody.value.length + 1
      }
      // 表宽
      tableWidth.value = colWidths.value.reduce((a, b) => a + b, 0)
    } else {
      // 局部同步
      colWidths.value = editHeader.value.map((_, i) => colWidths.value[i] || 120)
      rowHeights.value = [32, ...editBody.value.map((_, i) => rowHeights.value[i+1] || 32)]
      tableWidth.value = colWidths.value.reduce((a, b) => a + b, 0)
    }
  },
  { deep: true }
)

// refs for textarea
const headerRefs = ref<any[]>([])
const bodyRefs = ref<any[][]>([])

function unescapeMarkdownCell(cell: string) {
  // 反转义顺序要和转义顺序相反
  return cell
    .replace(/\\n/g, '\n')   // \n -> 换行
    .replace(/\\\|/g, '|')  // \| -> |
    .replace(/\\\\/g, '\\') // \\ -> \
}

watch(
  () => ({ header: props.header, body: props.body }),
  ({ header, body }) => {
    editHeader.value = Array.isArray(header) ? header.map(unescapeMarkdownCell) : []
    editBody.value = Array.isArray(body) ? body.map(row => Array.isArray(row) ? row.map(unescapeMarkdownCell) : []) : []
  },
  { deep: true }
)

// 触发change事件，header/body内容中的\n转为真正的换行
function escapeMarkdownCell(cell: string) {
  // 先转义反斜杠，再转义竖线和换行
  return cell
  .replace(/\\/g, '\\') // 反斜杠 -> \\
  .replace(/\|/g, '\\|')     // 竖线 -> \\|
  .replace(/\n/g, '\\n')     // 换行 -> \\n+}
}
function emitChange() {
  const safeHeader = editHeader.value.map(cell => escapeMarkdownCell(cell))
  const safeBody = editBody.value.map(row => row.map(cell => escapeMarkdownCell(cell)))
  emit('change', toRaw(safeHeader), toRaw(safeBody))
}

// 捕捉方向键和Tab/Enter行为
function handleKeydown(e: KeyboardEvent, rIdx?: number, cIdx?: number, isHeader = false) {
  // const refsArr = isHeader ? headerRefs.value : bodyRefs.value
  const row = isHeader ? 0 : rIdx || 0
  const col = cIdx || 0
  if (e.key === 'Enter' && !e.shiftKey) {
    // Enter: 换到下一行单元格
    e.preventDefault()
    if (isHeader) {
      if (bodyRefs.value[0] && bodyRefs.value[0][0]) bodyRefs.value[0][0].focus()
    } else if (bodyRefs.value[row+1] && bodyRefs.value[row+1][col]) {
      bodyRefs.value[row+1][col].focus()
    }
  } else if (e.key === 'Tab') {
    e.preventDefault()
    if (isHeader) {
      if (bodyRefs.value[0] && bodyRefs.value[0][0]) bodyRefs.value[0][0].focus()
    } else if (bodyRefs.value[row][col+1]) {
      bodyRefs.value[row][col+1].focus()
    } else if (bodyRefs.value[row+1] && bodyRefs.value[row+1][0]) {
      bodyRefs.value[row+1][0].focus()
    }
  } else if (e.key === 'ArrowDown') {
    e.preventDefault()
    if (isHeader) {
      if (bodyRefs.value[0] && bodyRefs.value[0][col]) bodyRefs.value[0][col].focus()
    } else if (bodyRefs.value[row+1] && bodyRefs.value[row+1][col]) {
      bodyRefs.value[row+1][col].focus()
    }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    if (!isHeader && row === 0 && headerRefs.value[col]) {
      headerRefs.value[col].focus()
    } else if (!isHeader && bodyRefs.value[row-1] && bodyRefs.value[row-1][col]) {
      bodyRefs.value[row-1][col].focus()
    }
  } else if (e.key === 'ArrowLeft') {
    if (!isHeader && col > 0) {
      e.preventDefault()
      bodyRefs.value[row][col-1].focus()
    }
  } else if (e.key === 'ArrowRight') {
    if (!isHeader && bodyRefs.value[row][col+1]) {
      e.preventDefault()
      bodyRefs.value[row][col+1].focus()
    }
  }
}

function autoResize(e: Event) {
  const ta = e.target as HTMLTextAreaElement
  if (!ta) return
  ta.style.height = 'auto'
  ta.style.height = ta.scrollHeight + 'px'
  ta.style.width = '100%'
}
</script>

<style scoped>
.table-dot {
  position: absolute;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  border: 1.5px solid rgba(120,120,120,0.18);
  background: transparent;
  transition: all 0.18s cubic-bezier(.4,1.3,.6,1);
  z-index: 10;
  cursor: pointer;
  opacity: 0.7;
  box-sizing: border-box;
}
.table-dot:hover {
  opacity: 1;
  width: 8px;
  height: 8px;
  background: currentColor;
  border: none;
}
.insert-col-dot {
  top: -6px;
  color: #1dbf1d;
  transform: translateY(-50%);
}
.delete-col-dot {
  top: -6px;
  color: #e74c3c;
  transform: translateY(-50%);
}
.insert-row-dot {
  left: -6px;
  top: 50%;
  color: #1dbf1d;
  transform: translateY(-50%);
}
.delete-row-dot {
  left: -6px;
  top: 50%;
  color: #e74c3c;
  transform: translateY(-50%);
}
.table-outer {
  position: relative;
  display: inline-block;
}
.table-width-resizer {
  position: absolute;
  top: 0;
  right: -2px;
  width: 6px;
  height: 100%;
  cursor: ew-resize;
  z-index: 10;
  background: rgba(180,180,180,0.06);
  border-right: none;
  margin-right: 0;
}
.md-table {
  border-collapse: collapse;
  margin: 0 0 1em 0;
  width: 900px;
  background: #232323;
  border: 2px solid #888;
  box-shadow: 0 2px 8px #0002;
}
.md-table th, .md-table td {
  border: 1.5px solid #aaa;
  padding: 0;
  text-align: left;
  background: #232323;
  position: relative;
}
.cell-wrapper {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}
.col-resizer {
  position: absolute;
  top: 0;
  right: -2.5px;
  width: 5px;
  height: 100%;
  cursor: col-resize;
  z-index: 2;
  background: rgba(180,180,180,0.08);
  border-right: none;
  margin-right: 0;
}
.row-resizer {
  position: absolute;
  left: 0;
  bottom: -2.5px;
  width: 100%;
  height: 5px;
  cursor: row-resize;
  z-index: 2;
  background: rgba(180,180,180,0.08);
  border-bottom: none;
  margin-bottom: 0;
}
.row-resizer-full {
  position: absolute;
  left: 0;
  bottom: -2.5px;
  width: 100vw; /* 先用超大宽度兜底，实际用内联style覆盖 */
  height: 5px;
  cursor: row-resize;
  z-index: 3;
  background: rgba(180,180,180,0.08);
  border-bottom: none;
  margin-bottom: 0;
  pointer-events: auto;
}
.cell-input {
  width: 100%;
  min-width: 2em;
  max-width: 100%;
  background: none;
  color: var(--app-text-pri);
  border: none;
  outline: none;
  font: inherit;
  padding: 0;
  resize: none;
  overflow: hidden;
  box-sizing: border-box;
  box-shadow: none;
  transition: none;
  text-align: left;
  display: block;
  /* 文字内边距 */
  padding-left: 0.5em;
  padding-right: 0.5em;
  padding-top: 0.2em;
  padding-bottom: 0.2em;
}
.cell-input:focus {
  background: none;
  border: none;
  outline: none;
  box-shadow: none;
}

.md-table-readonly {
  width: 100%;
  overflow-x: auto;
  margin: 1em 0;
}
.readonly-table {
  width: 100%;
  border-collapse: collapse;
  border: 1px solid #444;
}
.readonly-table th, .readonly-table td {
  border: 1px solid #555;
  padding: .5em .75em;
  font-size: .9em;
  text-align: left;
  vertical-align: top;
  line-height: 1.5;
}
.readonly-table th {
  background: rgba(255, 255, 255, 0.05);
  font-weight: 600;
  font-variation-settings: 'wght' 600;
}
.readonly-table tr:nth-child(2n) {
  background: rgba(255, 255, 255, 0.02);
}
</style>
