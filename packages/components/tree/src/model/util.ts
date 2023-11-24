import type { SetupContext } from 'vue'
import type Node from './node'
import type { RootTreeType, TreeKey, TreeNodeData } from '../tree.type'

export const NODE_KEY = '$treeNodeId'

// 目的是为节点数据 data 添加一个不可枚举、不可配置、不可写的属性 NODE_KEY，并将其值设为当前节点的 id。
// 这个属性的作用是为了标识节点数据，通常在树形结构中，每个节点都应该具有一个唯一的标识。
export const markNodeData = function (node: Node, data: TreeNodeData): void {
  if (!data || data[NODE_KEY]) return
  Object.defineProperty(data, NODE_KEY, {
    value: node.id,
    enumerable: false,
    configurable: false,
    writable: false,
  })
}

export const getNodeKey = function (key: TreeKey, data: TreeNodeData): any {
  if (!key) return data[NODE_KEY]
  return data[key]
}

export const handleCurrentChange = (
  store: RootTreeType['store'],
  emit: SetupContext['emit'],
  setCurrent: () => void
) => {
  const preCurrentNode = store.value.currentNode
  setCurrent()
  const currentNode = store.value.currentNode
  if (preCurrentNode === currentNode) return

  emit('current-change', currentNode ? currentNode.data : null, currentNode)
}
