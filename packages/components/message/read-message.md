

# 文件
`method.ts` :入口
  使用时`Message({})`，会首先来到该文件的message对象里
`instance.ts`:
`message.ts`
`message.vue`


## 思路
使用：
```js
ElMessage({
    msgKey: 2,
    message: `this is a message.${Date.now()}`,
  })
```

message.td的流程
message
  -> instance = createMessage
    -> 组装一下props
      -> onClose
      -> onDestroy
    -> vnode = createVNode()
      -> message.vue
    -> render(vnode,container)
    -> appendTo.appendChild(...)
    -> 组装了一个message组件实例
    -> return instance

  -> instances.push(instance)
  -> return instance.handle


message.vue的流程
就像正常的vue文件一样
-> 挂载后触发onMounted
-> 当3秒钟后触发关闭的操作：
  -> 有一个settimeout定时器
    -> close()
      -> visible.value = false
    -> 会触发 transition 动画
      -> @before-leave="onClose"
        -> 就会去调props里的onClose方法咯
          -> userOnClose?.()
          -> closeMessage(instance)
            -> 移除instances队列里的当前实例
            -> 调用实例的 instance.handler.close()方法
      @after-leave="$emit('destroy')"
        ->像母组件传destroy事件咯
          -> onDestroy()

