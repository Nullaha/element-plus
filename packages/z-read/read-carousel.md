2024/01/31

## 思路

1. 整体流程
1. carousel-item onMounted
1. -> addItem()
1. carouse onMounted
   1. -> watch -> items
   1. -> setActiveItem()
   1. -> resizeObserver
   1. -> startTimer()
1. carouse watch -> activeIndex
1. -> resetItemPosition()
1. -> crouse-item translateItem(index,activeIndex, oldIndex)
1. -> emit('change', ...)
1. carouse startTimer setInterval
1. -> playSlides()
1. carouse watch -> activeIndex

1. 指示器 hover/click 逻辑  
   改变 activeIndex，就到了 1.的 3 咯

1. 箭头 hover/click 逻辑  
   setActiveItem()

### 详细解释

#### 1 函数组件的渲染过程

从 `<PlaceholderItem />` 到`function PlaceholderItem() {}`，是怎么联系到一起的？

<PlaceholderItem />
createVNodeWithArgsTransform()
createVNode()
createBaseVNode()
normalizeChildren()

#### 2 为什么 carousel 将兑 carousel-item 的 watch 放到了 onMounted 中？

将 watch 放置在 onMounted 钩子中的原因是确保在 carousel-item 组件挂载后才开始监视 items.value 的变化。

```js
onMounted(() => {
  watch(
    () => items.value,
    () => {
      if (items.value.length > 0) setActiveItem(props.initialIndex)
    },
    {
      immediate: true,
    }
  )
})
```

#### 3 PlaceholderItem 的作用

当只有两个 item 时，它会补充两个。使得个数变为 4 个。
同时用 isTwoLengthShow 方法来判断这 4 个 item 的指示器显示哪两个.  
（index 为 0 1，时隐藏 23，index 为 23 时，隐藏 01）

## 知识点

### 1 InstanceType<typeof Carousel>

`InstanceType`是 ts 中的内置工具类型。  
接受一个构造函数类型，并返回该构造函数类型的实例类型。

```ts
import type Carousel from './carousel.vue'
export type CarouselInstance = InstanceType<typeof Carousel>
// typeof Carousel : 返回构造函数的类型
// type CarouselInstance : 表示 Carousel 组件的实例类型
```

### 2 provide(key,val)

provide() 接受两个参数：第一个参数是要注入的 key，可以是一个字符串或者一个 symbol，第二个参数是要注入的值。

### 3 getCurrentInstance

getCurrentInstance 是 Vue 3 Composition API 中的一个函数，用于获取当前正在执行的组件实例。
