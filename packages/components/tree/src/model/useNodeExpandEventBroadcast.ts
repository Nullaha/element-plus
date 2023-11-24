// @ts-nocheck
import { inject, provide } from 'vue'
import type Node from '../model/node'

interface NodeMap {
  treeNodeExpand(node: Node): void
  children: NodeMap[]
}
// 目的是实现了一个简单的节点展开事件广播系统，用于在节点展开时通知其他相关的节点。（适用于树形结构组件，特别是在手风琴模式下。）
// 参数props：是tree组件里的setup(props, ctx)
export function useNodeExpandEventBroadcast(props) {
  //从当前组件的母组件里获取名为TreeNodeMap的注入，如果不存在则是null
  const parentNodeMap = inject<NodeMap>('TreeNodeMap', null)
  const currentNodeMap: NodeMap = {
    treeNodeExpand: (node) => {
      if (props.node !== node) {
        props.node.collapse()
      }
    },
    children: [],
  }

  if (parentNodeMap) {
    parentNodeMap.children.push(currentNodeMap)
  }

  provide('TreeNodeMap', currentNodeMap)

  return {
    broadcastExpanded: (node: Node): void => {
      if (!props.accordion) return
      for (const childNode of currentNodeMap.children) {
        childNode.treeNodeExpand(node)
      }
    },
  }
}
