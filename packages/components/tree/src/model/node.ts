// @ts-nocheck
import { reactive } from 'vue'
import { hasOwn } from '@element-plus/utils'
import { NODE_KEY, markNodeData } from './util'
import type TreeStore from './tree-store'

import type { Nullable } from '@element-plus/utils'
import type {
  FakeNode,
  TreeKey,
  TreeNodeChildState,
  TreeNodeData,
  TreeNodeLoadedDefaultProps,
  TreeNodeOptions,
} from '../tree.type'

export const getChildState = (node: Node[]): TreeNodeChildState => {
  let all = true
  let none = true
  let allWithoutDisable = true
  for (let i = 0, j = node.length; i < j; i++) {
    const n = node[i]
    if (n.checked !== true || n.indeterminate) {
      all = false
      if (!n.disabled) {
        allWithoutDisable = false
      }
    }
    if (n.checked !== false || n.indeterminate) {
      none = false
    }
  }

  return { all, none, allWithoutDisable, half: !all && !none }
}

const reInitChecked = function (node: Node): void {
  if (node.childNodes.length === 0 || node.loading) return

  const { all, none, half } = getChildState(node.childNodes)
  if (all) {
    node.checked = true
    node.indeterminate = false
  } else if (half) {
    node.checked = false
    node.indeterminate = true
  } else if (none) {
    node.checked = false
    node.indeterminate = false
  }

  const parent = node.parent
  if (!parent || parent.level === 0) return

  if (!node.store.checkStrictly) {
    reInitChecked(parent)
  }
}
// {
//   // 其实就是去node里拿对应的值(根据tree的配置)
//   const treeProps = {
//     label: 'name',
//     isLeaf: 'leafStatus',
//   }
//   const nodeData = {
//     name: 'Node 1',
//     leafStatus: true,
//   }
//   const isLeaf = getPropertyFromData(node, 'isLeaf')
//   // 它会先找tree里对应的isLeaf的配置-> treeProps['isLeaf'] ->leafStatus
//   // -> 然后再用它去node里拿值nodeData.leafStatus -> true
// }
const getPropertyFromData = function (node: Node, prop: string): any {
  const props = node.store.props //获取节点所属树的配置属性。
  const data = node.data || {} //获取节点的数据，如果数据不存在，则设为空对象
  const config = props[prop] //new_key

  if (typeof config === 'function') {
    return config(data, node)
  } else if (typeof config === 'string') {
    return data[config]
  } else if (typeof config === 'undefined') {
    const dataProp = data[prop]
    return dataProp === undefined ? '' : dataProp
  }
}

let nodeIdSeed = 0
// 这个类是一个构建树形结构的基础工具，可以通过它创建和管理树形数据，实现树状结构的展示和交互。
class Node {
  // 属性声明
  id: number
  text: string
  checked: boolean
  indeterminate: boolean
  data: TreeNodeData
  expanded: boolean //该节点是否是展开状态
  parent: Node
  visible: boolean
  isCurrent: boolean
  store: TreeStore
  isLeafByUser: boolean //该node是否是用户设置的leaf节点（会在更新isLeaf时候用到。）
  isLeaf: boolean //指定节点是否为叶子节点，仅在指定了 lazy 属性的情况下生效
  canFocus: boolean

  level: number //从0开始...
  loaded: boolean
  childNodes: Node[] //子节点
  loading: boolean

  constructor(options: TreeNodeOptions) {
    this.id = nodeIdSeed++
    this.text = null
    this.checked = false
    this.indeterminate = false
    this.data = null
    this.expanded = false
    this.parent = null
    this.visible = true
    this.isCurrent = false
    this.canFocus = false

    for (const name in options) {
      if (hasOwn(options, name)) {
        this[name] = options[name]
      }
    }

    // internal
    this.level = 0 //设置level属性的值
    this.loaded = false
    this.childNodes = []
    this.loading = false

    if (this.parent) {
      this.level = this.parent.level + 1
    }
  }

  //初始化
  // {
  //   // 什么时候data是数组，什么时候data是对象？举例

  //   const data: Tree[] = [
  //     {
  //       label: 'Level one 1',
  //       children:[],
  //     }
  //   ]
  //   // 上面这个数据，level=0的时候data是个数组，level=1时data就是里面的对象

  // }
  initialize() {
    // 获取节点所属的树（Tree）的实例。
    const store = this.store
    if (!store) {
      throw new Error('[Node]store is required!')
    }
    // 在树实例中注册当前节点。
    store.registerNode(this)

    // 设置isLeafByUser属性的值
    const props = store.props
    if (props && typeof props.isLeaf !== 'undefined') {
      const isLeaf = getPropertyFromData(this, 'isLeaf')
      if (typeof isLeaf === 'boolean') {
        this.isLeafByUser = isLeaf
      }
    }

    if (store.lazy !== true && this.data) {
      // 如果树不是懒加载且节点具有数据，则进行以下处理：
      // 1设置节点的数据
      this.setData(this.data) // ⭐从这开始就递归了：setData(data) -> insertChild(childData) -> child.initialize()
      // 2如果树配置为默认展开所有节点，则对当前节点设置expanded和canFocus属性的值
      if (store.defaultExpandAll) {
        this.expanded = true
        this.canFocus = true
      }
    } else if (this.level > 0 && store.lazy && store.defaultExpandAll) {
      // 如果节点的层级大于 0、树是懒加载且配置为默认展开所有节点，则展开当前节点。 //TODO:为啥是这个条件才展开？level=0&&lazy&&defaultExpandAll为啥不展开？？
      this.expand()
    }
    if (!Array.isArray(this.data)) {
      markNodeData(this, this.data)
    }
    // 如果节点没有数据，则直接返回，不执行后续的初始化逻辑。
    if (!this.data) return

    const defaultExpandedKeys = store.defaultExpandedKeys
    const key = store.key
    // TODO:
    if (key && defaultExpandedKeys && defaultExpandedKeys.includes(this.key)) {
      this.expand(null, store.autoExpandParent)
    }

    // 如果当前node的key值 和tree实例的 currentNodeKey 相匹配，则进行以下处理：
    if (
      key &&
      store.currentNodeKey !== undefined &&
      this.key === store.currentNodeKey
    ) {
      store.currentNode = this //将当前节点设置为树实例的当前节点
      store.currentNode.isCurrent = true //标记
    }

    if (store.lazy) {
      store._initDefaultCheckedNode(this)
    }

    //更新当前节点的isLeaf属性的值
    this.updateLeafState()
    // 设置canFocus属性的值
    if (this.parent && (this.level === 1 || this.parent.expanded === true))
      this.canFocus = true
  }

  setData(data: TreeNodeData): void {
    if (!Array.isArray(data)) {
      markNodeData(this, data)
      // TODO: 为什么非数组要做这一步处理？
    }
    // 设置data属性的值
    this.data = data
    // 清空childNodes属性的值，准备重新插入子节点
    this.childNodes = []

    // 确定子节点数据源：TODO:需要试一下
    let children
    if (this.level === 0 && Array.isArray(this.data)) {
      // 表示当前节点是根节点且节点数据是数组
      children = this.data
    } else {
      // 当前节点不是根节点或节点数据不是数组，
      // 那么 children 将被赋值为从节点数据中获取的子节点数据。(其实就是去拿data的'children'的值咯)
      children = getPropertyFromData(this, 'children') || []
    }

    for (let i = 0, j = children.length; i < j; i++) {
      this.insertChild({ data: children[i] })
    }
  }

  get label(): string {
    return getPropertyFromData(this, 'label')
  }

  get key(): TreeKey {
    const nodeKey = this.store.key
    if (this.data) return this.data[nodeKey]
    return null
  }

  get disabled(): boolean {
    return getPropertyFromData(this, 'disabled')
  }

  get nextSibling(): Nullable<Node> {
    const parent = this.parent
    if (parent) {
      const index = parent.childNodes.indexOf(this)
      if (index > -1) {
        return parent.childNodes[index + 1]
      }
    }
    return null
  }

  get previousSibling(): Nullable<Node> {
    const parent = this.parent
    if (parent) {
      const index = parent.childNodes.indexOf(this)
      if (index > -1) {
        return index > 0 ? parent.childNodes[index - 1] : null
      }
    }
    return null
  }

  contains(target: Node, deep = true): boolean {
    return (this.childNodes || []).some(
      (child) => child === target || (deep && child.contains(target))
    )
  }

  remove(): void {
    const parent = this.parent
    if (parent) {
      parent.removeChild(this)
    }
  }

  insertChild(child?: FakeNode | Node, index?: number, batch?: boolean): void {
    // child?: FakeNode | Node：要插入的子节点，可以是节点对象或虚拟节点
    // index?: number：插入的位置索引，如果不提供或小于0，则表示在末尾插入。
    // batch?: boolean：是否批量插入。
    if (!child) throw new Error('InsertChild error: child is required.')

    //处理非节点对象的子节点
    if (!(child instanceof Node)) {
      if (!batch) {
        const children = this.getChildren(true)
        if (!children.includes(child.data)) {
          if (typeof index === 'undefined' || index < 0) {
            children.push(child.data)
          } else {
            children.splice(index, 0, child.data)
          }
        }
      }
      // 创建节点对象
      Object.assign(child, {
        parent: this,
        store: this.store,
      })
      child = reactive(new Node(child as TreeNodeOptions))
      if (child instanceof Node) {
        child.initialize()
      }
    }
    // 设置子节点的层级
    ;(child as Node).level = this.level + 1
    // 插入子节点
    if (typeof index === 'undefined' || index < 0) {
      this.childNodes.push(child as Node)
    } else {
      this.childNodes.splice(index, 0, child as Node)
    }
    // 更新当前节点的叶子状态
    this.updateLeafState()
  }

  insertBefore(child: FakeNode | Node, ref: Node): void {
    let index
    if (ref) {
      index = this.childNodes.indexOf(ref)
    }
    this.insertChild(child, index)
  }

  insertAfter(child: FakeNode | Node, ref: Node): void {
    let index
    if (ref) {
      index = this.childNodes.indexOf(ref)
      if (index !== -1) index += 1
    }
    this.insertChild(child, index)
  }

  removeChild(child: Node): void {
    const children = this.getChildren() || []
    const dataIndex = children.indexOf(child.data)
    if (dataIndex > -1) {
      children.splice(dataIndex, 1)
    }

    const index = this.childNodes.indexOf(child)

    if (index > -1) {
      this.store && this.store.deregisterNode(child)
      child.parent = null
      this.childNodes.splice(index, 1)
    }

    this.updateLeafState()
  }

  removeChildByData(data: TreeNodeData): void {
    let targetNode: Node = null

    for (let i = 0; i < this.childNodes.length; i++) {
      if (this.childNodes[i].data === data) {
        targetNode = this.childNodes[i]
        break
      }
    }

    if (targetNode) {
      this.removeChild(targetNode)
    }
  }

  // 懒加载时...展开节点的方法
  expand(callback?: () => void, expandParent?: boolean): void {
    const done = (): void => {
      if (expandParent) {
        let parent = this.parent
        while (parent.level > 0) {
          parent.expanded = true
          parent = parent.parent
        }
      }
      this.expanded = true
      if (callback) callback()
      this.childNodes.forEach((item) => {
        item.canFocus = true
      })
    }

    if (this.shouldLoadData()) {
      this.loadData((data) => {
        if (Array.isArray(data)) {
          if (this.checked) {
            this.setChecked(true, true)
          } else if (!this.store.checkStrictly) {
            reInitChecked(this)
          }
          done()
        }
      })
    } else {
      done()
    }
  }

  doCreateChildren(
    array: TreeNodeData[],
    defaultProps: TreeNodeLoadedDefaultProps = {}
  ): void {
    array.forEach((item) => {
      this.insertChild(
        Object.assign({ data: item }, defaultProps),
        undefined,
        true
      )
    })
  }
  // 折叠节点，并处理其子节点的canFocus值
  collapse(): void {
    this.expanded = false //折叠节点
    this.childNodes.forEach((item) => {
      // 遍历节点的子节点，并将它们的canFocus属性设置为false。这可能用于在节点折叠时调整子节点的可聚焦状态，
      item.canFocus = false
    })
  }

  shouldLoadData(): boolean {
    return this.store.lazy === true && this.store.load && !this.loaded
  }
  // 更新树节点的叶子状态
  updateLeafState(): void {
    if (
      this.store.lazy === true &&
      this.loaded !== true &&
      typeof this.isLeafByUser !== 'undefined'
    ) {
      // 如果懒加载且节点尚未加载数据，同时用户自己定义了isLeafByUser 属性，那么将 isLeaf 设置为用户定义的 isLeafByUser 属性
      this.isLeaf = this.isLeafByUser
      return
    }
    const childNodes = this.childNodes

    if (
      !this.store.lazy ||
      (this.store.lazy === true && this.loaded === true)
    ) {
      // 如果不是懒加载状态，或者懒加载已经加载了数据：
      //    判断当前节点的子节点数量，来设置isLeaf属性的值
      this.isLeaf = !childNodes || childNodes.length === 0
      return
    }
    this.isLeaf = false
  }

  setChecked(
    value?: boolean | string,
    deep?: boolean,
    recursion?: boolean,
    passValue?: boolean
  ) {
    this.indeterminate = value === 'half'
    this.checked = value === true

    if (this.store.checkStrictly) return

    if (!(this.shouldLoadData() && !this.store.checkDescendants)) {
      const { all, allWithoutDisable } = getChildState(this.childNodes)

      if (!this.isLeaf && !all && allWithoutDisable) {
        this.checked = false
        value = false
      }

      const handleDescendants = (): void => {
        if (deep) {
          const childNodes = this.childNodes
          for (let i = 0, j = childNodes.length; i < j; i++) {
            const child = childNodes[i]
            passValue = passValue || value !== false
            const isCheck = child.disabled ? child.checked : passValue
            child.setChecked(isCheck, deep, true, passValue)
          }
          const { half, all } = getChildState(childNodes)
          if (!all) {
            this.checked = all
            this.indeterminate = half
          }
        }
      }

      if (this.shouldLoadData()) {
        // Only work on lazy load data.
        this.loadData(
          () => {
            handleDescendants()
            reInitChecked(this)
          },
          {
            checked: value !== false,
          }
        )
        return
      } else {
        handleDescendants()
      }
    }

    const parent = this.parent
    if (!parent || parent.level === 0) return

    if (!recursion) {
      reInitChecked(parent)
    }
  }

  getChildren(forceInit = false): TreeNodeData | TreeNodeData[] {
    // this is data
    if (this.level === 0) return this.data
    const data = this.data
    if (!data) return null

    const props = this.store.props
    let children = 'children'
    if (props) {
      children = props.children || 'children'
    }

    if (data[children] === undefined) {
      data[children] = null
    }

    if (forceInit && !data[children]) {
      data[children] = []
    }

    return data[children]
  }

  updateChildren(): void {
    const newData = (this.getChildren() || []) as TreeNodeData[]
    const oldData = this.childNodes.map((node) => node.data)

    const newDataMap = {}
    const newNodes = []

    newData.forEach((item, index) => {
      const key = item[NODE_KEY]
      const isNodeExists =
        !!key && oldData.findIndex((data) => data[NODE_KEY] === key) >= 0
      if (isNodeExists) {
        newDataMap[key] = { index, data: item }
      } else {
        newNodes.push({ index, data: item })
      }
    })

    if (!this.store.lazy) {
      oldData.forEach((item) => {
        if (!newDataMap[item[NODE_KEY]]) this.removeChildByData(item)
      })
    }

    newNodes.forEach(({ index, data }) => {
      this.insertChild({ data }, index)
    })

    this.updateLeafState()
  }

  loadData(
    callback: (node: Node) => void,
    defaultProps: TreeNodeLoadedDefaultProps = {}
  ) {
    if (
      this.store.lazy === true &&
      this.store.load &&
      !this.loaded &&
      (!this.loading || Object.keys(defaultProps).length)
    ) {
      this.loading = true

      const resolve = (children) => {
        this.childNodes = []

        this.doCreateChildren(children, defaultProps)
        this.loaded = true
        this.loading = false

        this.updateLeafState()
        if (callback) {
          callback.call(this, children)
        }
      }

      this.store.load(this, resolve)
    } else {
      if (callback) {
        callback.call(this)
      }
    }
  }
}

export default Node
